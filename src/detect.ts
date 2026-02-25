import { SupportedFormat } from './types.js';
import * as buffer from './binary/buffer.js';
import * as dataview from './binary/dataview.js';
import { FILE_SIGNATURES } from './signatures.js';

/**
 * HEIC brand identifiers
 */
const HEIC_BRANDS = [
  'heic',
  'heix',
  'hevc',
  'hevx',
  'heim',
  'heis',
  'hevm',
  'hevs',
  'mif1',
  'msf1',
];

/**
 * MIME types for each format
 */
const MIME_TYPES: Record<SupportedFormat, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  tiff: 'image/tiff',
  heic: 'image/heic',
  dng: 'image/x-adobe-dng',
  raw: 'image/x-raw',
  unknown: 'application/octet-stream',
};

/**
 * Detect image format from binary data
 */
export function detectFormat(data: Uint8Array): SupportedFormat {
  if (data.length < 3) {
    return 'unknown';
  }

  // JPEG: starts with FF D8 FF
  if (buffer.startsWith(data, FILE_SIGNATURES.JPEG)) {
    return 'jpeg';
  }

  // PNG: starts with 89 50 4E 47 0D 0A 1A 0A
  if (data.length >= 8 && buffer.startsWith(data, FILE_SIGNATURES.PNG)) {
    return 'png';
  }

  // GIF: starts with GIF87a or GIF89a
  if (
    data.length >= 6 &&
    (buffer.startsWith(data, FILE_SIGNATURES.GIF87a) ||
      buffer.startsWith(data, FILE_SIGNATURES.GIF89a))
  ) {
    return 'gif';
  }

  // WebP: starts with RIFF....WEBP
  if (
    data.length >= 12 &&
    buffer.startsWith(data, FILE_SIGNATURES.RIFF) &&
    buffer.matchesAt(data, 8, FILE_SIGNATURES.WEBP)
  ) {
    return 'webp';
  }

  // HEIC: ftyp box with HEIC brand
  if (data.length >= 12 && buffer.matchesAt(data, 4, FILE_SIGNATURES.FTYP)) {
    const brand = buffer.toAscii(data, 8, 4);
    if (HEIC_BRANDS.includes(brand.toLowerCase())) {
      return 'heic';
    }
    // AVIF uses similar ISOBMFF structure
    if (brand.toLowerCase() === 'avif') {
      return 'heic';
    }
  }

  // TIFF / DNG / RAW: II*\0 or MM\0*
  if (
    data.length >= 8 &&
    (buffer.startsWith(data, FILE_SIGNATURES.TIFF_LE) ||
      buffer.startsWith(data, FILE_SIGNATURES.TIFF_BE))
  ) {
    // Check for DNG-specific tags (proper IFD-based detection)
    if (isDng(data)) {
      return 'dng';
    }
    // Check for proprietary RAW formats
    const rawFormat = detectRawFormat(data);
    if (rawFormat !== 'unknown') {
      return rawFormat;
    }
    return 'tiff';
  }

  // SVG: XML-based, check for <svg or <?xml
  if (isSvg(data)) {
    return 'svg';
  }

  return 'unknown';
}

/**
 * Check if data is a DNG file by looking for the DNGVersion tag (0xC612) in IFD0
 */
function isDng(data: Uint8Array): boolean {
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
 * Detect specific RAW format by parsing IFD Make tag (tag 271) and CR2 signature
 */
function detectRawFormat(data: Uint8Array): SupportedFormat {
  // Canon CR2: has "CR" signature at offset 8
  if (data.length > 10 && data[8] === 0x43 && data[9] === 0x52) {
    return 'raw';
  }

  // Parse IFD to find Make tag for camera identification
  const littleEndian = data[0] === 0x49;
  try {
    const ifdOffset = dataview.readUint32(data, 4, littleEndian);
    if (ifdOffset + 2 > data.length) {
      return 'unknown';
    }
    const numEntries = dataview.readUint16(data, ifdOffset, littleEndian);

    for (let i = 0; i < numEntries && i < 100; i++) {
      const entryOffset = ifdOffset + 2 + i * 12;
      if (entryOffset + 12 > data.length) {
        break;
      }
      const tag = dataview.readUint16(data, entryOffset, littleEndian);

      // Tag 271 = Make
      if (tag === 271) {
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
            const make = buffer.toAscii(data, valueOffset, Math.min(count, 50));
            if (make.includes('NIKON')) {
              return 'raw';
            }
            if (make.includes('SONY')) {
              return 'raw';
            }
          }
        }
        break;
      }
    }
  } catch {
    return 'unknown';
  }

  return 'unknown';
}

/**
 * Check if data is SVG (XML-based detection)
 */
function isSvg(data: Uint8Array): boolean {
  // Look at first 4096 bytes for SVG indicators (SVGs can have long XML preambles/DTDs)
  const sample = data.slice(0, Math.min(data.length, 4096));
  const str = buffer.toAscii(sample).toLowerCase();

  // Skip whitespace and BOM
  const trimmed = str.trim();

  // Check for XML declaration or SVG element
  if (trimmed.startsWith('<?xml') || trimmed.startsWith('<svg')) {
    return str.includes('<svg');
  }

  // Check for SVG namespace — require the W3C SVG namespace URI to avoid false
  // positives on XHTML or other XML documents that merely mention 'svg'.
  if (
    str.includes('xmlns') &&
    (str.includes('http://www.w3.org/2000/svg') || str.includes('<svg'))
  ) {
    return true;
  }

  return false;
}

/**
 * Get MIME type for a format
 */
export function getMimeType(format: SupportedFormat): string {
  return MIME_TYPES[format];
}
