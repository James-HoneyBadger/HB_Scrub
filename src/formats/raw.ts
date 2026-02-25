import { RemoveOptions } from '../types.js';
import { UnsupportedFormatError, CorruptedFileError } from '../errors.js';
import * as buffer from '../binary/buffer.js';
import * as dataview from '../binary/dataview.js';
import { tiff } from './tiff.js';
import { jpeg } from './jpeg.js';
import { FILE_SIGNATURES } from '../signatures.js';

/**
 * RAW format types
 */
type RawFormat = 'dng' | 'cr2' | 'cr3' | 'nef' | 'arw' | 'unknown';

/**
 * Detect specific RAW format
 */
function detectRawFormat(data: Uint8Array): RawFormat {
  if (data.length < 12) {
    return 'unknown';
  }

  // Check for CR2 (TIFF-based Canon)
  if (
    buffer.startsWith(data, FILE_SIGNATURES.TIFF_LE) &&
    buffer.matchesAt(data, 8, [0x43, 0x52]) // "CR"
  ) {
    return 'cr2';
  }

  // Check for CR3 (ISOBMFF-based Canon)
  if (buffer.matchesAt(data, 4, FILE_SIGNATURES.FTYP)) {
    const brand = buffer.toAscii(data, 8, 4);
    if (brand === 'crx ') {
      return 'cr3';
    }
  }

  // Check for DNG by looking for DNGVersion tag (0xC612) in IFD
  if (isDng(data)) {
    return 'dng';
  }

  // Check for NEF/ARW via IFD Make tag
  const make = readMakeTag(data);
  if (make !== null) {
    if (make.includes('NIKON')) {
      return 'nef';
    }
    if (make.includes('SONY')) {
      return 'arw';
    }
  }

  return 'unknown';
}

/**
 * Check if file is DNG by looking for DNGVersion tag (0xC612) in IFD
 */
function isDng(data: Uint8Array): boolean {
  if (
    !buffer.matchesAt(data, 0, [0x49, 0x49, 0x2a, 0x00]) &&
    !buffer.matchesAt(data, 0, [0x4d, 0x4d, 0x00, 0x2a])
  ) {
    return false;
  }

  const littleEndian = data[0] === 0x49;
  try {
    const ifdOffset = dataview.readUint32(data, 4, littleEndian);
    if (ifdOffset + 2 > data.length) {
      return false;
    }
    const numEntries = dataview.readUint16(data, ifdOffset, littleEndian);

    for (let i = 0; i < numEntries && i < 100; i++) {
      const entryOffset = ifdOffset + 2 + i * 12;
      if (entryOffset + 12 > data.length) {
        break;
      }

      const tag = dataview.readUint16(data, entryOffset, littleEndian);
      if (tag === 0xc612) {
        return true;
      }
    }
  } catch {
    return false;
  }

  return false;
}

/**
 * Read the Make tag (271) from IFD0 to identify camera manufacturer
 */
function readMakeTag(data: Uint8Array): string | null {
  if (
    !buffer.startsWith(data, FILE_SIGNATURES.TIFF_LE) &&
    !buffer.startsWith(data, FILE_SIGNATURES.TIFF_BE)
  ) {
    return null;
  }

  const littleEndian = data[0] === 0x49;
  try {
    const ifdOffset = dataview.readUint32(data, 4, littleEndian);
    if (ifdOffset + 2 > data.length) {
      return null;
    }
    const numEntries = dataview.readUint16(data, ifdOffset, littleEndian);

    for (let i = 0; i < numEntries && i < 100; i++) {
      const entryOffset = ifdOffset + 2 + i * 12;
      if (entryOffset + 12 > data.length) {
        break;
      }

      const tag = dataview.readUint16(data, entryOffset, littleEndian);
      if (tag === 271) {
        // Make tag
        const type = dataview.readUint16(data, entryOffset + 2, littleEndian);
        const count = dataview.readUint32(data, entryOffset + 4, littleEndian);
        if (type === 2) {
          // ASCII
          let valueOffset: number;
          if (count <= 4) {
            valueOffset = entryOffset + 8;
          } else {
            valueOffset = dataview.readUint32(data, entryOffset + 8, littleEndian);
          }
          if (valueOffset + count <= data.length) {
            return buffer.toAscii(data, valueOffset, Math.min(count, 50));
          }
        }
        break;
      }
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Find embedded JPEG preview in TIFF-based RAW
 */
function findJpegPreview(data: Uint8Array): Uint8Array | null {
  const littleEndian = data[0] === 0x49;

  try {
    // Parse main IFD to find SubIFD or JPEG thumbnail
    const ifdOffset = dataview.readUint32(data, 4, littleEndian);
    const numEntries = dataview.readUint16(data, ifdOffset, littleEndian);

    let jpegOffset = 0;
    let jpegLength = 0;
    let subIfdOffset = 0;

    for (let i = 0; i < numEntries && i < 100; i++) {
      const entryOffset = ifdOffset + 2 + i * 12;
      if (entryOffset + 12 > data.length) {
        break;
      }

      const tag = dataview.readUint16(data, entryOffset, littleEndian);
      // Skip type (2 bytes) and count (4 bytes), read value offset
      const valueOffset = dataview.readUint32(data, entryOffset + 8, littleEndian);

      // SubIFD (330)
      if (tag === 330) {
        subIfdOffset = valueOffset;
      }

      // JPEGInterchangeFormat (513)
      if (tag === 513) {
        jpegOffset = valueOffset;
      }

      // JPEGInterchangeFormatLength (514)
      if (tag === 514) {
        jpegLength = valueOffset; // For 1 count, value is in offset field
      }
    }

    // Check SubIFD for larger preview
    if (subIfdOffset > 0 && subIfdOffset < data.length) {
      const subIfdCount = dataview.readUint16(data, subIfdOffset, littleEndian);

      for (let i = 0; i < subIfdCount && i < 100; i++) {
        const entryOffset = subIfdOffset + 2 + i * 12;
        if (entryOffset + 12 > data.length) {
          break;
        }

        const tag = dataview.readUint16(data, entryOffset, littleEndian);
        const valueOffset = dataview.readUint32(data, entryOffset + 8, littleEndian);

        if (tag === 513) {
          jpegOffset = valueOffset;
        }
        if (tag === 514) {
          jpegLength = valueOffset;
        }
      }
    }

    // Extract JPEG if found
    if (jpegOffset > 0 && jpegLength > 0 && jpegOffset + jpegLength <= data.length) {
      const jpegData = data.slice(jpegOffset, jpegOffset + jpegLength);

      // Validate it's actually JPEG
      if (buffer.startsWith(jpegData, FILE_SIGNATURES.JPEG_SOI)) {
        return jpegData;
      }
    }

    // Fallback: search for embedded JPEG (match SOI + any APP marker)
    const jpegMarker = new Uint8Array([0xff, 0xd8, 0xff]); // JPEG SOI
    let searchOffset = 100; // Skip header

    while (searchOffset < data.length - 4) {
      const idx = buffer.indexOf(data, jpegMarker, searchOffset);
      if (idx === -1) {
        break;
      }

      // Find end of JPEG by scanning backwards from the end of the buffer for
      // the true EOI marker (0xFF 0xD9). A forward scan can stop on a false
      // EOI inside entropy-coded Restart or scan data.
      let endIdx = data.length - 1;
      while (endIdx > idx + 4) {
        if (data[endIdx - 1] === 0xff && data[endIdx] === 0xd9) {
          endIdx++;
          break;
        }
        endIdx--;
      }

      const jpegSize = endIdx - idx;

      // Return if it's a reasonably sized preview (> 10KB)
      if (jpegSize > 10000) {
        return data.slice(idx, endIdx);
      }

      searchOffset = endIdx;
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Remove metadata from DNG image
 * DNG is TIFF-based, so we use TIFF processing
 */
export function removeDng(data: Uint8Array, options: RemoveOptions = {}): Uint8Array {
  return tiff.remove(data, options);
}

/**
 * Process proprietary RAW format
 * Extracts and cleans the embedded JPEG preview using the full JPEG handler
 */
export function extractCleanPreview(
  data: Uint8Array,
  options: RemoveOptions = {}
): Uint8Array | null {
  const preview = findJpegPreview(data);

  if (preview === null) {
    return null;
  }

  // Use the full JPEG handler for proper metadata removal with all options
  return jpeg.remove(preview, options);
}

/**
 * Remove metadata from RAW image
 *
 * For DNG: Full metadata removal (TIFF-based)
 * For proprietary formats: Extracts clean JPEG preview
 */
export function remove(
  data: Uint8Array,
  options: RemoveOptions = {}
): { data: Uint8Array; isPreview: boolean; originalFormat: RawFormat } {
  const format = detectRawFormat(data);

  if (format === 'dng') {
    return {
      data: removeDng(data, options),
      isPreview: false,
      originalFormat: format,
    };
  }

  if (format === 'unknown') {
    throw new UnsupportedFormatError('Unknown RAW format');
  }

  // For proprietary RAW, extract clean preview
  const preview = extractCleanPreview(data, options);

  if (preview === null) {
    throw new CorruptedFileError('Could not extract preview from RAW file');
  }

  return {
    data: preview,
    isPreview: true,
    originalFormat: format,
  };
}

/**
 * Get list of metadata types present in the image
 */
export function getMetadataTypes(data: Uint8Array): string[] {
  const format = detectRawFormat(data);

  if (format === 'dng') {
    return tiff.getMetadataTypes(data);
  }

  // For proprietary RAW, report common metadata types
  const types: string[] = [];

  const make = readMakeTag(data);
  if (make !== null) {
    const trimmed = make.replace(/\0/g, '').trim();
    if (trimmed) {
      types.push(`${trimmed} MakerNotes`);
    }
  }

  // Check for EXIF presence
  if (buffer.indexOf(data, buffer.fromAscii('Exif\x00\x00')) !== -1) {
    types.push('EXIF');
  }

  // Check for GPS
  const gpsTag = [0x88, 0x25]; // GPS tag
  if (buffer.indexOf(data, gpsTag) !== -1) {
    types.push('GPS');
  }

  return [...new Set(types)];
}

export const raw = {
  remove,
  removeDng,
  extractCleanPreview,
  getMetadataTypes,
  detectRawFormat,
};

export default raw;
