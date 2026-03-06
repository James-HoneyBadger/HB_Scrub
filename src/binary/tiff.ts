/**
 * Shared TIFF header parsing utilities.
 *
 * Used by the EXIF reader, GPS module, and format handlers that embed TIFF
 * structures (JPEG, PNG, TIFF, HEIC, etc.).
 */

import * as dataview from './dataview.js';
import * as buffer from './buffer.js';

/**
 * Parsed TIFF header result
 */
export interface TiffHeader {
  /** true = little-endian (II), false = big-endian (MM) */
  littleEndian: boolean;
  /** Offset to the first IFD, relative to the start of the TIFF block */
  ifd0Offset: number;
}

/**
 * Parse a TIFF byte-order header (II/MM) and return endianness + IFD0 offset.
 * Returns `null` if the data is too short or the magic number doesn't match.
 */
export function parseTiffHeader(data: Uint8Array, offset = 0): TiffHeader | null {
  if (offset + 8 > data.length) {
    return null;
  }
  const byteOrder = buffer.toAscii(data, offset, 2);
  const littleEndian = byteOrder === 'II';
  if (!littleEndian && byteOrder !== 'MM') {
    return null;
  }
  const magic = dataview.readUint16(data, offset + 2, littleEndian);
  if (magic !== 42) {
    return null; // not a TIFF
  }
  const ifd0Offset = dataview.readUint32(data, offset + 4, littleEndian);
  return { littleEndian, ifd0Offset };
}

/**
 * Read the Orientation value (tag 0x0112) from a raw TIFF/EXIF block.
 * The block must start with the II/MM byte-order mark.
 * Returns `null` if orientation is not found or the data is malformed.
 */
export function readOrientation(exifData: Uint8Array): number | null {
  const header = parseTiffHeader(exifData);
  if (!header) {
    return null;
  }
  const { littleEndian, ifd0Offset } = header;
  const ifdStart = ifd0Offset;
  if (ifdStart + 2 > exifData.length) {
    return null;
  }
  try {
    const numEntries = dataview.readUint16(exifData, ifdStart, littleEndian);
    for (let i = 0; i < numEntries; i++) {
      const entryOffset = ifdStart + 2 + i * 12;
      if (entryOffset + 12 > exifData.length) {
        break;
      }
      const tag = dataview.readUint16(exifData, entryOffset, littleEndian);
      if (tag === 0x0112) {
        return dataview.readUint16(exifData, entryOffset + 8, littleEndian);
      }
    }
  } catch {
    // malformed IFD
  }
  return null;
}
