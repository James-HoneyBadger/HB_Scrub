import { RemoveOptions } from '../types.js';
import { readExifBlock } from '../exif/reader.js';
import type { MetadataMap } from '../types.js';
import { CorruptedFileError } from '../errors.js';
import * as buffer from '../binary/buffer.js';
import * as dataview from '../binary/dataview.js';
import { crc32Png } from '../binary/crc32.js';
import { FILE_SIGNATURES } from '../signatures.js';

/**
 * Chunk types that contain metadata (to be removed)
 */
const METADATA_CHUNKS = new Set([
  'tEXt', // Text metadata
  'iTXt', // International text
  'zTXt', // Compressed text
  'eXIf', // EXIF data
  'tIME', // Last modification time
]);

/**
 * Chunk types that should always be preserved
 */
const REQUIRED_CHUNKS = new Set([
  'IHDR', // Image header
  'IDAT', // Image data
  'IEND', // End marker
  'PLTE', // Palette (for indexed color)
  'tRNS', // Transparency
  'gAMA', // Gamma
  'cHRM', // Chromaticity
  'sRGB', // Standard RGB
  'sBIT', // Significant bits
  'bKGD', // Background color
  'hIST', // Histogram
  'pHYs', // Physical dimensions
  'sPLT', // Suggested palette
  'acTL', // Animation control (APNG)
  'fcTL', // Frame control (APNG)
  'fdAT', // Frame data (APNG)
]);

/**
 * Color profile chunk
 */
const ICC_CHUNK = 'iCCP';

/**
 * PNG chunk structure
 */
interface PngChunk {
  type: string;
  data: Uint8Array;
  crc: number;
}

/**
 * Validate PNG header
 */
function validateHeader(data: Uint8Array): void {
  if (data.length < 8) {
    throw new CorruptedFileError('File too small to be a valid PNG');
  }
  if (!buffer.startsWith(data, FILE_SIGNATURES.PNG)) {
    throw new CorruptedFileError('Invalid PNG: missing PNG signature');
  }
}

/**
 * Parse PNG into chunks
 */
function parseChunks(data: Uint8Array): PngChunk[] {
  validateHeader(data);

  const chunks: PngChunk[] = [];
  let offset = 8; // Skip header

  while (offset < data.length) {
    if (offset + 8 > data.length) {
      throw new CorruptedFileError('Invalid PNG: truncated chunk header', offset);
    }

    const length = dataview.readUint32BE(data, offset);
    offset += 4;

    const type = buffer.toAscii(data, offset, 4);
    offset += 4;

    if (offset + length + 4 > data.length) {
      // If we've already seen critical chunks (IHDR, IDAT), allow truncated trailing data
      const hasCriticalChunks = chunks.some(c => c.type === 'IHDR' || c.type === 'IDAT');
      if (hasCriticalChunks) {
        // Truncated ancillary chunk at end - stop parsing but don't fail
        break;
      }
      throw new CorruptedFileError(`Invalid PNG: truncated ${type} chunk`, offset);
    }

    const chunkData = data.slice(offset, offset + length);
    offset += length;

    const crc = dataview.readUint32BE(data, offset);
    offset += 4;

    chunks.push({ type, data: chunkData, crc });

    if (type === 'IEND') {
      break;
    }
  }

  return chunks;
}

/**
 * Serialize a chunk to bytes
 */
function serializeChunk(chunk: PngChunk): Uint8Array {
  const typeBytes = buffer.fromAscii(chunk.type);
  const length = chunk.data.length;

  // Calculate CRC over type + data
  const crc = crc32Png(typeBytes, chunk.data);

  const result = new Uint8Array(12 + length);
  dataview.writeUint32BE(result, 0, length);
  result.set(typeBytes, 4);
  result.set(chunk.data, 8);
  dataview.writeUint32BE(result, 8 + length, crc);

  return result;
}

/**
 * Build PNG from chunks
 */
function buildPng(chunks: PngChunk[]): Uint8Array {
  const parts: Uint8Array[] = [FILE_SIGNATURES.PNG];

  for (const chunk of chunks) {
    parts.push(serializeChunk(chunk));
  }

  return buffer.concat(...parts);
}

/**
 * Read the Orientation value (tag 0x0112) from a raw EXIF block.
 * PNG eXIf chunks contain a raw TIFF-formatted EXIF block (II/MM header).
 */
function readOrientationFromRawExif(exifData: Uint8Array): number | null {
  if (exifData.length < 8) {
    return null;
  }
  try {
    const byteOrder = buffer.toAscii(exifData, 0, 2);
    const littleEndian = byteOrder === 'II';
    const ifdOffset = dataview.readUint32(exifData, 4, littleEndian);
    if (ifdOffset + 2 > exifData.length) {
      return null;
    }
    const numEntries = dataview.readUint16(exifData, ifdOffset, littleEndian);
    for (let i = 0; i < numEntries; i++) {
      const entryOffset = ifdOffset + 2 + i * 12;
      if (entryOffset + 12 > exifData.length) {
        break;
      }
      const tag = dataview.readUint16(exifData, entryOffset, littleEndian);
      if (tag === 0x0112 /* Orientation */) {
        return dataview.readUint16(exifData, entryOffset + 8, littleEndian);
      }
    }
  } catch {
    // Ignore malformed EXIF
  }
  return null;
}

/**
 * Build a minimal eXIf chunk containing only the Orientation tag (big-endian).
 */
function buildOrientationExifChunk(orientation: number): PngChunk {
  // 8-byte TIFF header + 2-byte count + 12-byte entry + 4-byte next-IFD = 26 bytes
  const data = new Uint8Array(26);
  // TIFF header: big-endian, magic 0x002A, IFD0 at offset 8
  data[0] = 0x4d;
  data[1] = 0x4d; // 'MM' = big-endian
  data[2] = 0x00;
  data[3] = 0x2a; // TIFF magic
  data[4] = 0x00;
  data[5] = 0x00;
  data[6] = 0x00;
  data[7] = 0x08; // IFD offset
  // IFD: 1 entry
  data[8] = 0x00;
  data[9] = 0x01; // numEntries = 1
  // Entry: tag=0x0112, type=SHORT(3), count=1, value=orientation
  data[10] = 0x01;
  data[11] = 0x12; // tag
  data[12] = 0x00;
  data[13] = 0x03; // type SHORT
  data[14] = 0x00;
  data[15] = 0x00;
  data[16] = 0x00;
  data[17] = 0x01; // count
  data[18] = 0x00;
  data[19] = orientation & 0xff;
  data[20] = 0x00;
  data[21] = 0x00; // value
  // next IFD pointer = 0
  data[22] = 0x00;
  data[23] = 0x00;
  data[24] = 0x00;
  data[25] = 0x00;
  return { type: 'eXIf', data, crc: 0 };
}

/**
 * Check if chunk is metadata that should be removed
 */
function isMetadataChunk(chunk: PngChunk): boolean {
  return METADATA_CHUNKS.has(chunk.type);
}

/**
 * Check if chunk is ICC profile
 */
function isIccChunk(chunk: PngChunk): boolean {
  return chunk.type === ICC_CHUNK;
}

/**
 * Get metadata description from chunk
 */
function getMetadataDescription(chunk: PngChunk): string {
  switch (chunk.type) {
    case 'tEXt':
      return 'Text metadata';
    case 'iTXt':
      return 'International text';
    case 'zTXt':
      return 'Compressed text';
    case 'eXIf':
      return 'EXIF';
    case 'tIME':
      return 'Timestamp';
    case 'iCCP':
      return 'ICC Profile';
    default:
      return chunk.type;
  }
}

/**
 * Remove metadata from PNG image
 */
export function remove(data: Uint8Array, options: RemoveOptions = {}): Uint8Array {
  const chunks = parseChunks(data);

  // If orientation must be preserved, extract it from the eXIf chunk before filtering.
  let savedOrientation: number | null = null;
  if (options.preserveOrientation === true) {
    const exifChunk = chunks.find(c => c.type === 'eXIf');
    if (exifChunk) {
      savedOrientation = readOrientationFromRawExif(exifChunk.data);
    }
  }

  const filteredChunks = chunks.filter(chunk => {
    // Always keep required chunks
    if (REQUIRED_CHUNKS.has(chunk.type)) {
      return true;
    }

    // Handle ICC profile
    if (isIccChunk(chunk)) {
      if (options.preserveColorProfile === true) {
        return true;
      }
      return false;
    }

    // Remove metadata chunks
    if (isMetadataChunk(chunk)) {
      return false;
    }

    // Keep unknown ancillary chunks by default
    // Ancillary chunks have lowercase first letter
    return true;
  });

  // Re-inject a minimal eXIf with just Orientation immediately after IHDR
  if (savedOrientation !== null) {
    const ihdrIdx = filteredChunks.findIndex(c => c.type === 'IHDR');
    const insertAt = ihdrIdx >= 0 ? ihdrIdx + 1 : 0;
    filteredChunks.splice(insertAt, 0, buildOrientationExifChunk(savedOrientation));
  }

  return buildPng(filteredChunks);
}

/**
 * Get list of metadata types present in the image
 */
export function getMetadataTypes(data: Uint8Array): string[] {
  const chunks = parseChunks(data);
  const types: string[] = [];

  for (const chunk of chunks) {
    if (isMetadataChunk(chunk) || isIccChunk(chunk)) {
      types.push(getMetadataDescription(chunk));
    }
  }

  return [...new Set(types)];
}

/**
 * Read structured metadata from a PNG without modifying it.
 */
export function read(data: Uint8Array): Partial<MetadataMap> {
  const out: Partial<MetadataMap> = {};
  try {
    const chunks = parseChunks(data);
    for (const chunk of chunks) {
      if (chunk.type === 'eXIf' && chunk.data.length >= 8) {
        readExifBlock(chunk.data, out);
      } else if (chunk.type === 'iTXt' || chunk.type === 'tEXt' || chunk.type === 'zTXt') {
        // Check for XMP in iTXt
        const text = String.fromCharCode(...chunk.data.slice(0, Math.min(40, chunk.data.length)));
        if (text.includes('XML:com.adobe.xmp') || text.includes('xpacket')) {
          out.hasXmp = true;
        }
      } else if (chunk.type === 'iCCP') {
        out.hasIcc = true;
      }
    }
  } catch {
    /* ignore */
  }
  return out;
}

export const png = {
  remove,
  getMetadataTypes,
  parseChunks,
  read,
};

export default png;
