/**
 * Minimal EXIF builder for metadata injection.
 *
 * Constructs a well-formed TIFF/EXIF block containing only the requested
 * fields.  Used when `inject` options are supplied to removeMetadata().
 *
 * Supports JPEG (returns a complete APP1 segment) and raw TIFF blocks
 * (for PNG eXIf chunks etc.).
 */

import * as buffer from '../binary/buffer.js';
import * as dataview from '../binary/dataview.js';
import type { MetadataInjectOptions } from '../types.js';

// ─── ASCII field builder ──────────────────────────────────────────────────────

interface FieldDef {
  tag: number;
  value: string;
}

/**
 * Build a TIFF block (starting with TIFF header) containing the given ASCII
 * string fields.  Returns a Uint8Array.
 *
 * Layout:
 *   offset 0 : byte-order 'MM' (big-endian)
 *   offset 2 : TIFF magic 0x002A
 *   offset 4 : IFD0 offset = 8
 *   offset 8 : IFD0 …
 */
export function buildTiffBlock(fields: FieldDef[]): Uint8Array {
  if (fields.length === 0) {
    return new Uint8Array(0);
  }

  // Sort by tag for conformance
  const sorted = [...fields].sort((a, b) => a.tag - b.tag);

  // ASCII values: encode as null-terminated strings, pad to even length
  const valueBlobs: Uint8Array[] = sorted.map(f => {
    const enc = new TextEncoder().encode(f.value + '\x00');
    // Pad to even byte boundary
    return enc.length % 2 !== 0 ? buffer.concat(enc, new Uint8Array(1)) : enc;
  });

  // Size planning
  const headerSize = 8; // byte-order (2) + magic (2) + ifd0-offset (4)
  const ifdCountSize = 2;
  const ifdEntrySize = 12;
  const ifdNextSize = 4;
  const ifdSize = ifdCountSize + sorted.length * ifdEntrySize + ifdNextSize;
  const valuesStart = headerSize + ifdSize;
  const totalSize = valuesStart + valueBlobs.reduce((s, b) => s + b.length, 0);

  const out = new Uint8Array(totalSize);

  // Header (big-endian = MM)
  out[0] = 0x4d;
  out[1] = 0x4d; // 'MM'
  out[2] = 0x00;
  out[3] = 0x2a; // TIFF magic
  dataview.writeUint32BE(out, 4, headerSize); // IFD0 at offset 8

  // IFD0
  let pos = headerSize;
  dataview.writeUint16BE(out, pos, sorted.length);
  pos += 2;

  let valueOffset = valuesStart;
  for (const [i, f] of sorted.entries()) {
    const blob = valueBlobs[i]!;
    dataview.writeUint16BE(out, pos, f.tag);
    pos += 2; // tag
    dataview.writeUint16BE(out, pos, 2);
    pos += 2; // type = ASCII
    dataview.writeUint32BE(out, pos, blob.length);
    pos += 4; // count (includes NUL)
    if (blob.length <= 4) {
      out.set(blob, pos);
    } else {
      dataview.writeUint32BE(out, pos, valueOffset);
    }
    pos += 4; // value/offset field
    if (blob.length > 4) {
      out.set(blob, valueOffset);
      valueOffset += blob.length;
    }
  }

  dataview.writeUint32BE(out, pos, 0); // next IFD = none

  return out;
}

/**
 * Build the inject field set from MetadataInjectOptions.
 */
function buildFields(inject: MetadataInjectOptions): FieldDef[] {
  const fields: FieldDef[] = [];

  const add = (tag: number, val: string | undefined) => {
    if (val && val.trim().length > 0) {
      fields.push({ tag, value: val.trim() });
    }
  };

  add(270, inject.imageDescription);
  add(305, inject.software);
  add(306, normalizeDateTime(inject.dateTime));
  add(315, inject.artist);
  add(33432, inject.copyright);

  return fields;
}

/**
 * Normalize date/time value to TIFF format "YYYY:MM:DD HH:MM:SS".
 */
function normalizeDateTime(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  // Already in TIFF format?
  if (/^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
    return value;
  }
  // Try ISO 8601
  try {
    const d = new Date(value);
    if (!isNaN(d.getTime())) {
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}:${pad(d.getMonth() + 1)}:${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }
  } catch {
    /* ignore */
  }
  return value;
}

// ─── JPEG APP1 segment ────────────────────────────────────────────────────────

/**
 * Build a complete JPEG APP1 EXIF segment containing the inject fields.
 * Returns a Uint8Array starting with 0xFF 0xE1.
 */
export function buildJpegExifSegment(inject: MetadataInjectOptions): Uint8Array {
  const fields = buildFields(inject);
  if (fields.length === 0) {
    return new Uint8Array(0);
  }

  const tiff = buildTiffBlock(fields);
  const exifId = new Uint8Array([0x45, 0x78, 0x69, 0x66, 0x00, 0x00]); // "Exif\0\0"
  const content = buffer.concat(exifId, tiff);
  const segmentLength = content.length + 2; // +2 for the length field itself

  const segment = new Uint8Array(4 + content.length);
  segment[0] = 0xff;
  segment[1] = 0xe1; // APP1 marker
  dataview.writeUint16BE(segment, 2, segmentLength);
  segment.set(content, 4);

  return segment;
}

/**
 * Build a raw TIFF block (no APP1 wrapping) suitable for PNG eXIf.
 */
export function buildRawExifBlock(inject: MetadataInjectOptions): Uint8Array {
  return buildTiffBlock(buildFields(inject));
}

/**
 * Build a minimal GPS-only EXIF object (TIFF block only) with truncated
 * coordinates at the given precision.  Used by GPS-redact injection.
 *
 * @param lat  Decimal degrees (positive = N)
 * @param lng  Decimal degrees (positive = E)
 */
export function buildRedactedGpsExif(lat: number, lng: number): Uint8Array {
  // We encode GPS as a sub-IFD pointed to from IFD0 (tag 34853)
  // Layout:
  //   8   bytes: TIFF header (MM + magic + IFD0 @ 8)
  //   2+12+12+4 bytes: IFD0 (1 entry: GPSInfoIFDPointer pointing to gpsIfd)
  //     = 30 bytes  ifd0 = at offset 8, size=30
  //   gpsIfd at offset 38:
  //     2+4*12+4 = 54 bytes for 4 entries (latRef, lat, lngRef, lng)
  //   GPS values at offset 92:
  //     latRef: 2 bytes (+ pad)
  //     lngRef: 2 bytes (+ pad)
  //     lat: 3*8 = 24 bytes
  //     lng: 3*8 = 24 bytes

  const tiffHeaderOffset = 0;
  const ifd0Offset = 8;
  // gpsIfdOffset unused: GPS IFD pointer is ifd0End, calculated below
  const ifd0End = ifd0Offset + 2 + 12 + 4; // = 26

  const gpsIfdSize = 2 + 4 * 12 + 4; // 4 entries
  const valuesStart = ifd0End + gpsIfdSize; // where GPS value data begins

  const total = valuesStart + 4 + 4 + 24 + 24; // latRef(4) + lngRef(4) + lat(24) + lng(24)
  const out = new Uint8Array(total);

  // TIFF header big-endian
  out[tiffHeaderOffset] = 0x4d;
  out[1] = 0x4d;
  out[2] = 0x00;
  out[3] = 0x2a;
  dataview.writeUint32BE(out, 4, ifd0Offset);

  // IFD0: 1 entry pointing to GPS IFD
  dataview.writeUint16BE(out, ifd0Offset, 1); // numEntries = 1
  // entry: tag=34853 (GPSInfoIFDPointer), type=LONG(4), count=1, value=gpsIfdOffset
  dataview.writeUint16BE(out, ifd0Offset + 2, 34853);
  dataview.writeUint16BE(out, ifd0Offset + 4, 4);
  dataview.writeUint32BE(out, ifd0Offset + 6, 1);
  dataview.writeUint32BE(out, ifd0Offset + 10, ifd0End);
  dataview.writeUint32BE(out, ifd0Offset + 14, 0); // next IFD

  // GPS IFD: 4 entries
  let gPos = ifd0End;
  dataview.writeUint16BE(out, gPos, 4);
  gPos += 2; // numEntries = 4

  // latRefOffset and lngRefOffset: reference chars are written inline (in-value)
  const latValOffset = valuesStart + 8;
  const lngValOffset = valuesStart + 8 + 24;

  const writeGpsEntry = (tag: number, type: number, count: number, valueOrOffset: number) => {
    dataview.writeUint16BE(out, gPos, tag);
    gPos += 2;
    dataview.writeUint16BE(out, gPos, type);
    gPos += 2;
    dataview.writeUint32BE(out, gPos, count);
    gPos += 4;
    dataview.writeUint32BE(out, gPos, valueOrOffset);
    gPos += 4;
  };

  // GPSLatitudeRef (1): ASCII 2 bytes (inline)
  writeGpsEntry(1, 2, 2, lat >= 0 ? 0x4e000000 : 0x53000000); // 'N\0\0\0' or 'S\0\0\0'
  // GPSLatitude (2): RATIONAL[3], 24 bytes
  writeGpsEntry(2, 5, 3, latValOffset);
  // GPSLongitudeRef (3): ASCII 2 bytes (inline)
  writeGpsEntry(3, 2, 2, lng >= 0 ? 0x45000000 : 0x57000000); // 'E\0\0\0' or 'W\0\0\0'
  // GPSLongitude (4): RATIONAL[3], 24 bytes
  writeGpsEntry(4, 5, 3, lngValOffset);

  dataview.writeUint32BE(out, gPos, 0); // GPS IFD next = 0

  // Write lat/lng as truncated degree rationals (0 min, 0 sec)
  const writeCoord = (offset: number, deg: number) => {
    const factor = 1000000;
    const num = Math.floor(Math.abs(deg) * factor);
    dataview.writeUint32BE(out, offset, num);
    dataview.writeUint32BE(out, offset + 4, factor);
    dataview.writeUint32BE(out, offset + 8, 0);
    dataview.writeUint32BE(out, offset + 12, 1);
    dataview.writeUint32BE(out, offset + 16, 0);
    dataview.writeUint32BE(out, offset + 20, 1);
  };

  writeCoord(latValOffset, lat);
  writeCoord(lngValOffset, lng);

  return out;
}

/**
 * Wrap a raw TIFF/EXIF block in a JPEG APP1 segment.
 */
export function wrapInJpegApp1(tiff: Uint8Array): Uint8Array {
  if (tiff.length === 0) {
    return new Uint8Array(0);
  }
  const exifId = new Uint8Array([0x45, 0x78, 0x69, 0x66, 0x00, 0x00]);
  const content = buffer.concat(exifId, tiff);
  const seg = new Uint8Array(4 + content.length);
  seg[0] = 0xff;
  seg[1] = 0xe1;
  dataview.writeUint16BE(seg, 2, content.length + 2);
  seg.set(content, 4);
  return seg;
}
