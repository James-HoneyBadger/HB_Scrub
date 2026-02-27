/**
 * MP4 / MOV (QuickTime) format handler.
 *
 * Both formats use ISOBMFF (ISO Base Media File Format) boxes / QuickTime
 * atoms.  The on-disk structure is identical at the level we care about.
 *
 * Metadata locations:
 *  • moov → udta → ©xyz  (GPS)
 *  • moov → udta → ©mak / ©mod / ©cpy / ©swr  (camera, copyright, software)
 *  • moov → udta → meta → ilst  (iTunes key/value pairs)
 *  • moov → mvhd  (creation/modification timestamps — offset 8 or 12)
 *  • moov → trak → udta   (per-track metadata)
 *
 * Strategy:
 *  We walk the atom tree, find every known metadata box and OVERWRITE its
 *  content with zeros of the same size.  This keeps the file structure
 *  (including all byte-offset references in stco/co64 chunks) intact.
 *
 *  We do NOT remove atoms.  Removing would shift every subsequent offset
 *  and corrupt playback.
 */

import * as dataview from '../binary/dataview.js';
import * as buffer from '../binary/buffer.js';
import type { RemoveOptions, MetadataMap, GpsCoordinates } from '../types.js';

// ─── Known metadata atom types ────────────────────────────────────────────────

/** Atom types whose entire content should be zeroed. */
const ZERO_ATOM_TYPES = new Set([
  '©xyz',
  '©geo',
  'loci', // GPS
  '©mak',
  '©mod', // Camera make / model
  '©cpy', // Copyright
  '©swr', // Software
  '©day', // Creation date
  '©nam',
  '©des', // Name / description
  '©aut',
  '©enc', // Author / encoder
  '©inf',
  '©src', // Information / source
  '©dir',
  '©prd', // Director / producer
  '©wrt',
  '©edl', // Writer / edit list info
  'XMP_',
  'uuid', // XMP
]);

/** Container atoms whose children should be recursed into. */
const CONTAINER_ATOM_TYPES = new Set([
  'moov',
  'trak',
  'mdia',
  'minf',
  'dinf',
  'stbl',
  'udta',
  'meta',
  'ilst',
]);

// ─── Atom parser ─────────────────────────────────────────────────────────────

interface Atom {
  type: string;
  offset: number;
  headerSize: number;
  size: number; // full atom size including header
  dataOffset: number;
  dataSize: number;
}

function parseAtomHeader(
  data: Uint8Array,
  offset: number
): { type: string; size: number; headerSize: number } | null {
  if (offset + 8 > data.length) {
    return null;
  }

  let size = dataview.readUint32BE(data, offset);
  const type = buffer.toAscii(data, offset + 4, 4);
  let headerSize = 8;

  if (size === 1) {
    // Extended 64-bit size
    if (offset + 16 > data.length) {
      return null;
    }
    const hi = dataview.readUint32BE(data, offset + 8);
    const lo = dataview.readUint32BE(data, offset + 12);
    size = hi * 0x100000000 + lo;
    headerSize = 16;
  } else if (size === 0) {
    size = data.length - offset;
  }

  if (size < headerSize) {
    return null;
  }
  return { type, size, headerSize };
}

function parseAtoms(data: Uint8Array, from: number, to: number): Atom[] {
  const atoms: Atom[] = [];
  let offset = from;

  // 'meta' boxes start with a 4-byte version+flags header before child atoms
  while (offset < to) {
    const hdr = parseAtomHeader(data, offset);
    if (!hdr || hdr.size === 0 || offset + hdr.size > to + 8) {
      break;
    }

    atoms.push({
      type: hdr.type,
      offset,
      headerSize: hdr.headerSize,
      size: hdr.size,
      dataOffset: offset + hdr.headerSize,
      dataSize: hdr.size - hdr.headerSize,
    });

    offset += hdr.size;
  }

  return atoms;
}

// ─── Tree walker ─────────────────────────────────────────────────────────────

/**
 * Recursively walk atoms, applying `visitor` on each.
 * Recurses into container atoms automatically.
 */
function walkAtoms(
  data: Uint8Array,
  from: number,
  to: number,
  visitor: (atom: Atom, data: Uint8Array) => void,
  depth = 0
): void {
  if (depth > 10) {
    return;
  } // safeguard

  const atoms = parseAtoms(data, from, to);
  for (const atom of atoms) {
    visitor(atom, data);

    if (CONTAINER_ATOM_TYPES.has(atom.type)) {
      // 'meta' has a 4-byte version+flags before child atoms
      const childStart = atom.type === 'meta' ? atom.dataOffset + 4 : atom.dataOffset;
      walkAtoms(data, childStart, atom.dataOffset + atom.dataSize, visitor, depth + 1);
    }
  }
}

// ─── GPS parsing from ©xyz ───────────────────────────────────────────────────

/**
 * Read GPS coordinates from a © xyz atom.
 * Format: "+XX.XXXX+YYY.YYYY/" (ISO 6709)
 */
function parseIso6709(text: string): GpsCoordinates | null {
  const m = /([+-]\d+\.?\d*)([+-]\d+\.?\d*)/.exec(text);
  if (!m) {
    return null;
  }
  return {
    latitude: parseFloat(m[1]!),
    longitude: parseFloat(m[2]!),
  };
}

// ─── Timestamp zeroing (mvhd) ────────────────────────────────────────────────

/**
 * Zero creation/modification timestamps in an mvhd atom.
 * version 0: 4-byte timestamps at bytes 4 and 8 of data
 * version 1: 8-byte timestamps at bytes 4 and 12
 */
function zeroMvhdTimestamps(result: Uint8Array, atom: Atom): void {
  if (atom.dataSize < 4) {
    return;
  }
  const version = result[atom.dataOffset]!;
  if (version === 0 && atom.dataSize >= 12) {
    result.fill(0, atom.dataOffset + 4, atom.dataOffset + 12);
  } else if (version === 1 && atom.dataSize >= 24) {
    result.fill(0, atom.dataOffset + 4, atom.dataOffset + 20);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function remove(data: Uint8Array, _options: RemoveOptions = {}): Uint8Array {
  const result = new Uint8Array(data);

  walkAtoms(result, 0, data.length, atom => {
    if (ZERO_ATOM_TYPES.has(atom.type)) {
      result.fill(0, atom.dataOffset, atom.dataOffset + atom.dataSize);
    }
    if (atom.type === 'mvhd') {
      zeroMvhdTimestamps(result, atom);
    }
  });

  return result;
}

export function getMetadataTypes(data: Uint8Array): string[] {
  const types = new Set<string>();

  walkAtoms(data, 0, data.length, atom => {
    if (atom.type === '©xyz' || atom.type === 'loci' || atom.type === '©geo') {
      types.add('GPS');
    } else if (atom.type === '©mak' || atom.type === '©mod') {
      types.add('Camera Info');
    } else if (atom.type === '©cpy') {
      types.add('Copyright');
    } else if (atom.type === '©swr' || atom.type === '©enc') {
      types.add('Software');
    } else if (atom.type === '©day') {
      types.add('DateTime');
    } else if (atom.type === 'XMP_' || atom.type === 'uuid') {
      types.add('XMP');
    } else if (ZERO_ATOM_TYPES.has(atom.type)) {
      types.add('Metadata');
    } else if (atom.type === 'mvhd') {
      // Check if timestamps are non-zero
      const version = data[atom.dataOffset]!;
      const tsOffset = atom.dataOffset + 4;
      if (version === 0 && tsOffset + 8 <= data.length) {
        const ts = dataview.readUint32BE(data, tsOffset);
        if (ts !== 0) {
          types.add('Timestamps');
        }
      }
    }
  });

  return [...types];
}

export function read(data: Uint8Array): Partial<MetadataMap> {
  const out: Partial<MetadataMap> = {};

  walkAtoms(data, 0, data.length, atom => {
    // QuickTime string atoms: 16-byte header (flags + lang), then UTF-8 text
    const readQtString = (): string => {
      if (atom.dataSize <= 16) {
        return '';
      }
      const offset = atom.dataOffset + 16;
      const len = atom.dataSize - 16;
      let s = '';
      for (let i = 0; i < len; i++) {
        const c = data[offset + i]!;
        if (c === 0) {
          break;
        }
        s += String.fromCharCode(c);
      }
      return s.trim();
    };

    switch (atom.type) {
      case '©xyz':
      case 'loci': {
        const text = readQtString();
        const gps = parseIso6709(text);
        if (gps) {
          out.gps = gps;
        }
        break;
      }
      case '©mak':
        out.make = readQtString();
        break;
      case '©mod':
        out.model = readQtString();
        break;
      case '©swr':
      case '©enc':
        out.software = readQtString();
        break;
      case '©cpy':
        out.copyright = readQtString();
        break;
      case '©day':
        out.dateTime = readQtString();
        break;
      case '©nam':
      case '©des':
        out.imageDescription = readQtString();
        break;
      case 'XMP_':
        out.hasXmp = true;
        break;
    }
  });

  return out;
}

export const mp4 = { remove, getMetadataTypes, read };
export default mp4;
