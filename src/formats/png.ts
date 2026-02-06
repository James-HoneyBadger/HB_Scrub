import { RemoveOptions } from '../types.js';
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
  const removedMetadata: string[] = [];

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
      removedMetadata.push(getMetadataDescription(chunk));
      return false;
    }

    // Remove metadata chunks
    if (isMetadataChunk(chunk)) {
      removedMetadata.push(getMetadataDescription(chunk));
      return false;
    }

    // Keep unknown ancillary chunks by default
    // Ancillary chunks have lowercase first letter
    return true;
  });

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

export const png = {
  remove,
  getMetadataTypes,
  parseChunks,
};

export default png;
