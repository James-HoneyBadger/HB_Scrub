/**
 * GPS redaction and coordinate conversion utilities.
 *
 * Provides helpers to:
 *  • Convert DMS (degrees/minutes/seconds as RATIONAL triples) → decimal degrees
 *  • Write truncated decimal degrees back as DMS RATIONAL triples
 *  • Apply in-place GPS redaction inside a raw TIFF/EXIF data block
 */

import * as dataview from '../binary/dataview.js';
import type { GpsRedactPrecision } from '../types.js';

// ─── Precision map ────────────────────────────────────────────────────────────

/** Number of decimal degree places kept at each precision level */
const PRECISION_DECIMALS: Record<GpsRedactPrecision, number> = {
  exact: 10,
  city: 2,      // ±1.1 km
  region: 1,    // ±11 km
  country: 0,   // ±111 km
  remove: -1,   // not used in this path
};

// ─── DMS ↔ decimal ───────────────────────────────────────────────────────────

/**
 * Read three RATIONAL values (each 8 bytes: num/den) from `data` at `offset`
 * and convert to decimal degrees.
 */
export function dmsRawToDecimal(data: Uint8Array, offset: number, le: boolean): number {
  const r = (off: number) => {
    const num = dataview.readUint32(data, off, le);
    const den = dataview.readUint32(data, off + 4, le);
    return den !== 0 ? num / den : 0;
  };
  return r(offset) + r(offset + 8) / 60 + r(offset + 16) / 3600;
}

/**
 * Encode a decimal-degree value as three RATIONAL DMS values (degrees,
 * minutes=0, seconds=0).  Writes 24 bytes in-place at `data[offset]`.
 */
export function writeRedactedDms(
  data: Uint8Array,
  offset: number,
  decimalDegrees: number,
  decimals: number,
  le: boolean,
): void {
  const factor = Math.pow(10, decimals);
  const truncated = Math.floor(Math.abs(decimalDegrees) * factor) / factor;
  const numerator = Math.floor(truncated * factor);
  const denominator = factor;

  // degrees rational
  dataview.writeUint32(data, offset, numerator, le);
  dataview.writeUint32(data, offset + 4, denominator, le);
  // minutes = 0/1
  dataview.writeUint32(data, offset + 8, 0, le);
  dataview.writeUint32(data, offset + 12, 1, le);
  // seconds = 0/1
  dataview.writeUint32(data, offset + 16, 0, le);
  dataview.writeUint32(data, offset + 20, 1, le);
}

// ─── In-place GPS redaction ───────────────────────────────────────────────────

/**
 * Redact GPS coordinates in-place inside a TIFF/EXIF data block.
 *
 * @param exifData    The raw EXIF block (mutable copy expected).
 * @param gpsIfdOffset  Byte offset of the GPS sub-IFD within `exifData`.
 * @param precision   Desired precision level.
 * @param le          True = little-endian byte order.
 */
export function redactGpsInExif(
  exifData: Uint8Array,
  gpsIfdOffset: number,
  precision: GpsRedactPrecision,
  le: boolean,
): void {
  if (precision === 'exact' || precision === 'remove') return;
  const decimals = PRECISION_DECIMALS[precision];

  try {
    if (gpsIfdOffset + 2 > exifData.length) return;
    const numEntries = dataview.readUint16(exifData, gpsIfdOffset, le);
    if (numEntries > 64) return;

    for (let i = 0; i < numEntries; i++) {
      const entryOffset = gpsIfdOffset + 2 + i * 12;
      if (entryOffset + 12 > exifData.length) break;

      const tag = dataview.readUint16(exifData, entryOffset, le);
      // GPSLatitude (2) | GPSLongitude (4): type RATIONAL(5), count 3
      if (tag !== 2 && tag !== 4) continue;

      const type = dataview.readUint16(exifData, entryOffset + 2, le);
      const count = dataview.readUint32(exifData, entryOffset + 4, le);
      if (type !== 5 || count !== 3) continue;

      const valueOffset = dataview.readUint32(exifData, entryOffset + 8, le);
      if (valueOffset + 24 > exifData.length) continue;

      const decimal = dmsRawToDecimal(exifData, valueOffset, le);
      writeRedactedDms(exifData, valueOffset, decimal, decimals, le);
    }
  } catch {
    // Ignore malformed GPS IFD
  }
}

/**
 * Locate the GPS sub-IFD pointer in IFD0 and return its offset, or 0.
 */
export function findGpsIfdOffset(
  exifData: Uint8Array,
  ifd0Offset: number,
  le: boolean,
): number {
  try {
    if (ifd0Offset + 2 > exifData.length) return 0;
    const numEntries = dataview.readUint16(exifData, ifd0Offset, le);
    if (numEntries > 512) return 0;
    for (let i = 0; i < numEntries; i++) {
      const pos = ifd0Offset + 2 + i * 12;
      if (pos + 12 > exifData.length) break;
      const tag = dataview.readUint16(exifData, pos, le);
      if (tag === 34853 /* GPSInfoIFDPointer */) {
        return dataview.readUint32(exifData, pos + 8, le);
      }
    }
  } catch { /* ignore */ }
  return 0;
}
