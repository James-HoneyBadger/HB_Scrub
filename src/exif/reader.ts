/**
 * Low-level EXIF / TIFF IFD reader.
 *
 * Reads a raw TIFF-formatted block (starting with II/MM byte-order mark) and
 * returns a structured MetadataMap.  Used by every format handler that embeds
 * EXIF data (JPEG APP1, PNG eXIf, WebP EXIF chunk, TIFF/DNG IFD0, HEIC EXIF
 * box, etc.).
 */

import * as buffer from '../binary/buffer.js';
import * as dataview from '../binary/dataview.js';
import type { ExifData, GpsCoordinates, MetadataMap, SupportedFormat } from '../types.js';

// ─── Type sizes ──────────────────────────────────────────────────────────────

export const TYPE_SIZES: Record<number, number> = {
  1: 1,  // BYTE
  2: 1,  // ASCII
  3: 2,  // SHORT
  4: 4,  // LONG
  5: 8,  // RATIONAL (pair of LONG)
  6: 1,  // SBYTE
  7: 1,  // UNDEFINED
  8: 2,  // SSHORT
  9: 4,  // SLONG
  10: 8, // SRATIONAL
  11: 4, // FLOAT
  12: 8, // DOUBLE
};

// ─── Raw IFD entry ────────────────────────────────────────────────────────────

export interface IfdEntry {
  tag: number;
  type: number;
  count: number;
  /** Byte offset where the value lives (or the inline 32-bit word if fits≤4). */
  valueOffset: number;
  /** Original 4 raw bytes from the entry (used for inline values). */
  rawValueBytes: Uint8Array;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readRational(data: Uint8Array, offset: number, le: boolean): [number, number] {
  if (offset + 8 > data.length) return [0, 1];
  return [dataview.readUint32(data, offset, le), dataview.readUint32(data, offset + 4, le)];
}

function readSRational(data: Uint8Array, offset: number, le: boolean): [number, number] {
  if (offset + 8 > data.length) return [0, 1];
  const toSigned = (v: number) => (v > 0x7fffffff ? v - 0x100000000 : v);
  return [
    toSigned(dataview.readUint32(data, offset, le)),
    toSigned(dataview.readUint32(data, offset + 4, le)),
  ];
}

function readAscii(data: Uint8Array, offset: number, count: number): string {
  let s = '';
  for (let i = 0; i < count && offset + i < data.length; i++) {
    const ch = data[offset + i]!;
    if (ch === 0) break;
    s += String.fromCharCode(ch);
  }
  return s.trim();
}

function readShortInline(raw: Uint8Array, le: boolean): number {
  return le ? raw[0]! | (raw[1]! << 8) : (raw[0]! << 8) | raw[1]!;
}

// ─── IFD parser ──────────────────────────────────────────────────────────────

/**
 * Parse all entries of one IFD, returning { entries, nextIfdOffset }.
 */
export function parseIfd(
  data: Uint8Array,
  offset: number,
  le: boolean
): { entries: IfdEntry[]; nextIfdOffset: number } {
  const entries: IfdEntry[] = [];
  if (offset + 2 > data.length) return { entries, nextIfdOffset: 0 };

  try {
    const numEntries = dataview.readUint16(data, offset, le);
    if (numEntries > 512) return { entries, nextIfdOffset: 0 };

    for (let i = 0; i < numEntries; i++) {
      const pos = offset + 2 + i * 12;
      if (pos + 12 > data.length) break;
      entries.push({
        tag: dataview.readUint16(data, pos, le),
        type: dataview.readUint16(data, pos + 2, le),
        count: dataview.readUint32(data, pos + 4, le),
        valueOffset: dataview.readUint32(data, pos + 8, le),
        rawValueBytes: data.slice(pos + 8, pos + 12),
      });
    }

    const nextPtr = offset + 2 + numEntries * 12;
    const nextIfdOffset =
      nextPtr + 4 <= data.length ? dataview.readUint32(data, nextPtr, le) : 0;
    return { entries, nextIfdOffset };
  } catch {
    return { entries, nextIfdOffset: 0 };
  }
}

/**
 * Read a tag's value from an IFD entry, returning a JS-typed value.
 */
export function readEntryValue(
  data: Uint8Array,
  entry: IfdEntry,
  le: boolean
): unknown {
  const { type, count, valueOffset, rawValueBytes } = entry;
  const size = (TYPE_SIZES[type] ?? 1) * count;
  const inline = size <= 4;

  switch (type) {
    case 2 /* ASCII */: {
      if (inline) return readAscii(rawValueBytes, 0, count);
      return readAscii(data, valueOffset, count);
    }
    case 3 /* SHORT */: {
      if (count === 1) return inline ? readShortInline(rawValueBytes, le) : dataview.readUint16(data, valueOffset, le);
      const arr: number[] = [];
      for (let i = 0; i < count; i++) {
        const off = inline ? i * 2 : valueOffset + i * 2;
        const src = inline ? rawValueBytes : data;
        if (off + 2 > src.length) break;
        arr.push(dataview.readUint16(src, off, le));
      }
      return arr;
    }
    case 4 /* LONG */: {
      if (count === 1) return inline ? dataview.readUint32(rawValueBytes, 0, le) : dataview.readUint32(data, valueOffset, le);
      const arr: number[] = [];
      for (let i = 0; i < count; i++) {
        if (valueOffset + i * 4 + 4 > data.length) break;
        arr.push(dataview.readUint32(data, valueOffset + i * 4, le));
      }
      return arr;
    }
    case 5 /* RATIONAL */: {
      const rationals: [number, number][] = [];
      for (let i = 0; i < count; i++) {
        rationals.push(readRational(data, valueOffset + i * 8, le));
      }
      return count === 1 ? rationals[0] : rationals;
    }
    case 10 /* SRATIONAL */: {
      const rationals: [number, number][] = [];
      for (let i = 0; i < count; i++) {
        rationals.push(readSRational(data, valueOffset + i * 8, le));
      }
      return count === 1 ? rationals[0] : rationals;
    }
    default:
      return null;
  }
}

/**
 * Parse an IFD into a tag→value Map.
 */
export function parseIfdValues(data: Uint8Array, ifdOffset: number, le: boolean): Map<number, unknown> {
  const map = new Map<number, unknown>();
  if (ifdOffset === 0 || ifdOffset + 2 > data.length) return map;
  const { entries } = parseIfd(data, ifdOffset, le);
  for (const entry of entries) {
    const val = readEntryValue(data, entry, le);
    if (val !== null) map.set(entry.tag, val);
  }
  return map;
}

// ─── DMS → decimal ───────────────────────────────────────────────────────────

/**
 * Convert a GPS DMS array (3 RATIONAL tuples) to decimal degrees.
 */
export function dmsToDecimal(rationals: [number, number][]): number {
  const ratio = (r: [number, number]) => (r[1] !== 0 ? r[0] / r[1] : 0);
  const deg = ratio(rationals[0] ?? [0, 1]);
  const min = ratio(rationals[1] ?? [0, 1]);
  const sec = ratio(rationals[2] ?? [0, 1]);
  return deg + min / 60 + sec / 3600;
}

// ─── GPS sub-IFD ────────────────────────────────────────────────────────────

/**
 * Parse a GPS sub-IFD and return structured GpsCoordinates.
 */
export function parseGpsIfd(
  data: Uint8Array,
  gpsIfdOffset: number,
  le: boolean
): GpsCoordinates | null {
  const tags = parseIfdValues(data, gpsIfdOffset, le);
  if (tags.size === 0) return null;

  const rawLat = tags.get(2) as [number, number][] | undefined;
  const rawLng = tags.get(4) as [number, number][] | undefined;
  if (!rawLat || !rawLng) return null;

  const latRef = (tags.get(1) as string | undefined) ?? 'N';
  const lngRef = (tags.get(3) as string | undefined) ?? 'E';

  let lat = dmsToDecimal(rawLat);
  let lng = dmsToDecimal(rawLng);
  if (latRef.toUpperCase() === 'S') lat = -lat;
  if (lngRef.toUpperCase() === 'W') lng = -lng;

  const result: GpsCoordinates = { latitude: lat, longitude: lng };

  const altRaw = tags.get(6) as [number, number] | undefined;
  if (altRaw && altRaw[1] !== 0) {
    const alt = altRaw[0] / altRaw[1];
    result.altitude = ((tags.get(5) as number | undefined) ?? 0) === 1 ? -alt : alt;
  }
  const speedRaw = tags.get(13) as [number, number] | undefined;
  if (speedRaw && speedRaw[1] !== 0) result.speed = speedRaw[0] / speedRaw[1];

  const dirRaw = tags.get(17) as [number, number] | undefined;
  if (dirRaw && dirRaw[1] !== 0) result.direction = dirRaw[0] / dirRaw[1];

  const dateStamp = tags.get(29) as string | undefined;
  if (dateStamp) result.dateStamp = dateStamp;

  return result;
}

// ─── EXIF sub-IFD ────────────────────────────────────────────────────────────

/**
 * Parse an EXIF sub-IFD into structured ExifData.
 */
export function parseExifIfd(data: Uint8Array, exifOffset: number, le: boolean): ExifData {
  const tags = parseIfdValues(data, exifOffset, le);
  const ex: ExifData = {};

  const str = (tag: number) => tags.get(tag) as string | undefined;
  const num = (tag: number) => tags.get(tag) as number | undefined;
  const rat = (tag: number) => tags.get(tag) as [number, number] | undefined;

  const dto = str(36867); if (dto) ex.dateTimeOriginal = dto;
  const dtd = str(36868); if (dtd) ex.dateTimeDigitized = dtd;

  const et = rat(33434);
  if (et && et[1] !== 0) ex.exposureTime = et[0] === 1 ? `1/${et[1]}` : `${et[0]}/${et[1]}`;

  const fn = rat(33437);
  if (fn && fn[1] !== 0) ex.fNumber = Math.round((fn[0] / fn[1]) * 10) / 10;

  const iso = num(34855); if (iso !== undefined) ex.iso = iso;

  const fl = rat(37386);
  if (fl && fl[1] !== 0) ex.focalLength = Math.round(fl[0] / fl[1]);

  const flash = num(37385);
  if (flash !== undefined) ex.flash = (flash & 0x1) === 1;

  const lm = str(42036); if (lm) ex.lensModel = lm;
  const lmake = str(42035); if (lmake) ex.lensManufacturer = lmake;

  const cs = num(41729); if (cs !== undefined) ex.colorSpace = cs;
  const pw = num(40962); if (pw) ex.pixelWidth = pw;
  const ph = num(40963); if (ph) ex.pixelHeight = ph;
  const wb = num(41987); if (wb !== undefined) ex.whiteBalance = wb;
  const em = num(41986); if (em !== undefined) ex.exposureMode = em;
  const ep = num(34850); if (ep !== undefined) ex.exposureProgram = ep;

  return ex;
}

// ─── Main entry point ────────────────────────────────────────────────────────

/**
 * Read structured metadata from a raw TIFF-format EXIF block (starts with II/MM).
 * Populates `out` in place; harmless to call on malformed data.
 */
export function readExifBlock(exifData: Uint8Array, out: Partial<MetadataMap>): void {
  if (exifData.length < 8) return;
  try {
    const byteOrder = buffer.toAscii(exifData, 0, 2);
    const le = byteOrder === 'II';
    if (dataview.readUint16(exifData, 2, le) !== 42) return; // TIFF magic

    const ifd0Offset = dataview.readUint32(exifData, 4, le);
    const { entries, nextIfdOffset } = parseIfd(exifData, ifd0Offset, le);

    // Build a quick tag map for IFD0
    const tags = new Map<number, unknown>();
    for (const entry of entries) {
      const val = readEntryValue(exifData, entry, le);
      if (val !== null) tags.set(entry.tag, val);
    }

    const st = (t: number) => tags.get(t) as string | undefined;
    const nu = (t: number) => tags.get(t) as number | undefined;

    const make = st(271); if (make) out.make = make;
    const model = st(272); if (model) out.model = model;
    const software = st(305); if (software) out.software = software;
    const desc = st(270); if (desc) out.imageDescription = desc;
    const artist = st(315); if (artist) out.artist = artist;
    const copy = st(33432); if (copy) out.copyright = copy;
    const dt = st(306); if (dt) out.dateTime = dt;
    const orient = nu(274); if (orient !== undefined) out.orientation = orient;

    // EXIF sub-IFD
    const exifPtr = tags.get(34665) as number | undefined;
    if (exifPtr) out.exif = parseExifIfd(exifData, exifPtr, le);

    // GPS sub-IFD
    const gpsPtr = tags.get(34853) as number | undefined;
    if (gpsPtr) {
      const gps = parseGpsIfd(exifData, gpsPtr, le);
      if (gps) out.gps = gps;
    }

    // Thumbnail (IFD1)
    if (nextIfdOffset !== 0) out.hasThumbnail = true;
  } catch {
    // Ignore malformed EXIF
  }
}

/**
 * Convert a SupportedFormat to a human label for MIME etc.
 */
export function formatLabel(fmt: SupportedFormat): string {
  const labels: Partial<Record<SupportedFormat, string>> = {
    jpeg: 'JPEG', png: 'PNG', webp: 'WebP', gif: 'GIF',
    svg: 'SVG', tiff: 'TIFF', heic: 'HEIC', avif: 'AVIF',
    dng: 'DNG', raw: 'RAW', pdf: 'PDF', mp4: 'MP4', mov: 'MOV',
  };
  return labels[fmt] ?? fmt.toUpperCase();
}
