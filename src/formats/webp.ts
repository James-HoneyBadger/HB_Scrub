import { RemoveOptions } from '../types.js';
import { readExifBlock } from '../exif/reader.js';
import type { MetadataMap } from '../types.js';
import { CorruptedFileError } from '../errors.js';
import * as buffer from '../binary/buffer.js';
import * as dataview from '../binary/dataview.js';
import { FILE_SIGNATURES } from '../signatures.js';

/**
 * Chunk types
 */
const CHUNKS = {
  VP8: 'VP8 ', // Lossy
  VP8L: 'VP8L', // Lossless
  VP8X: 'VP8X', // Extended
  EXIF: 'EXIF', // EXIF metadata
  XMP: 'XMP ', // XMP metadata
  ICCP: 'ICCP', // ICC profile
  ANIM: 'ANIM', // Animation
  ANMF: 'ANMF', // Animation frame
  ALPH: 'ALPH', // Alpha channel
} as const;

/**
 * Metadata chunks to remove
 */
const METADATA_CHUNKS: Set<string> = new Set([CHUNKS.EXIF, CHUNKS.XMP]);

/**
 * WebP chunk structure
 */
interface WebpChunk {
  fourcc: string;
  data: Uint8Array;
}

/**
 * Validate WebP header
 */
function validateHeader(data: Uint8Array): number {
  if (data.length < 12) {
    throw new CorruptedFileError('File too small to be a valid WebP');
  }

  if (!buffer.startsWith(data, FILE_SIGNATURES.RIFF)) {
    throw new CorruptedFileError('Invalid WebP: missing RIFF header');
  }

  if (!buffer.matchesAt(data, 8, FILE_SIGNATURES.WEBP)) {
    throw new CorruptedFileError('Invalid WebP: missing WEBP signature');
  }

  // Return file size from RIFF header
  return dataview.readUint32LE(data, 4) + 8;
}

/**
 * Parse WebP into chunks
 */
function parseChunks(data: Uint8Array): WebpChunk[] {
  const fileSize = validateHeader(data);
  const chunks: WebpChunk[] = [];
  let offset = 12; // Skip RIFF header + WEBP

  while (offset + 8 <= data.length && offset < fileSize) {
    const fourcc = buffer.toAscii(data, offset, 4);
    offset += 4;

    const chunkSize = dataview.readUint32LE(data, offset);
    offset += 4;

    if (offset + chunkSize > data.length) {
      throw new CorruptedFileError(`Invalid WebP: truncated ${fourcc} chunk`, offset);
    }

    const chunkData = data.slice(offset, offset + chunkSize);
    chunks.push({ fourcc, data: chunkData });

    // Chunks are padded to even bytes
    const padding = chunkSize % 2;
    offset += chunkSize + padding;
  }

  return chunks;
}

/**
 * Get dimensions from VP8X chunk
 */
function getSizeFromVp8x(chunk: WebpChunk): [number, number] {
  if (chunk.data.length < 10) {
    throw new CorruptedFileError('Invalid VP8X chunk');
  }

  // Width and height are stored as 24-bit values minus 1
  const widthMinusOne = chunk.data[4]! | (chunk.data[5]! << 8) | (chunk.data[6]! << 16);
  const heightMinusOne = chunk.data[7]! | (chunk.data[8]! << 8) | (chunk.data[9]! << 16);

  return [widthMinusOne + 1, heightMinusOne + 1];
}

/**
 * Get dimensions from VP8 chunk (lossy)
 */
function getSizeFromVp8(chunk: WebpChunk): [number, number] {
  // Look for VP8 bitstream header: 0x9D 0x01 0x2A
  const signature = buffer.indexOf(chunk.data, [0x9d, 0x01, 0x2a]);
  if (signature === -1) {
    throw new CorruptedFileError('Invalid VP8 chunk');
  }

  const offset = signature + 3;
  if (offset + 4 > chunk.data.length) {
    throw new CorruptedFileError('Invalid VP8 chunk');
  }

  const width = dataview.readUint16LE(chunk.data, offset) & 0x3fff;
  const height = dataview.readUint16LE(chunk.data, offset + 2) & 0x3fff;

  return [width, height];
}

/**
 * Get dimensions from VP8L chunk (lossless)
 */
function getSizeFromVp8L(chunk: WebpChunk): [number, number] {
  if (chunk.data.length < 5) {
    throw new CorruptedFileError('Invalid VP8L chunk');
  }

  // Skip signature byte (0x2F)
  const b1 = chunk.data[1]!;
  const b2 = chunk.data[2]!;
  const b3 = chunk.data[3]!;
  const b4 = chunk.data[4]!;

  const widthMinusOne = ((b2 & 0x3f) << 8) | b1;
  const heightMinusOne = ((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6);

  return [widthMinusOne + 1, heightMinusOne + 1];
}

/**
 * Check if VP8L contains alpha
 */
function vp8LContainsAlpha(chunk: WebpChunk): boolean {
  if (chunk.data.length < 5) {
    return false;
  }
  return ((chunk.data[4]! >> 4) & 1) === 1;
}

/**
 * Create VP8X chunk with updated flags
 */
function createVp8xChunk(chunks: WebpChunk[]): WebpChunk {
  let width = 0;
  let height = 0;
  // VP8X flags byte: bits 5=ICC, 4=Alpha, 3=EXIF, 2=XMP, 1=Anim
  let flagByte = 0;

  for (const chunk of chunks) {
    switch (chunk.fourcc) {
      case CHUNKS.VP8X:
        [width, height] = getSizeFromVp8x(chunk);
        break;
      case CHUNKS.VP8:
        if (width === 0) {
          [width, height] = getSizeFromVp8(chunk);
        }
        break;
      case CHUNKS.VP8L:
        if (width === 0) {
          [width, height] = getSizeFromVp8L(chunk);
        }
        if (vp8LContainsAlpha(chunk)) {
          flagByte |= 1 << 4; // Alpha
        }
        break;
      case CHUNKS.ICCP:
        flagByte |= 1 << 5; // ICC
        break;
      case CHUNKS.ALPH:
        flagByte |= 1 << 4; // Alpha
        break;
      case CHUNKS.EXIF:
        flagByte |= 1 << 3; // EXIF
        break;
      case CHUNKS.XMP:
        flagByte |= 1 << 2; // XMP
        break;
      case CHUNKS.ANIM:
        flagByte |= 1 << 1; // Animation
        break;
    }
  }

  const widthMinusOne = width - 1;
  const heightMinusOne = height - 1;

  const data = new Uint8Array(10);
  data[0] = flagByte;
  // Padding bytes 1-3 are 0

  // Width (24-bit LE)
  data[4] = widthMinusOne & 0xff;
  data[5] = (widthMinusOne >> 8) & 0xff;
  data[6] = (widthMinusOne >> 16) & 0xff;

  // Height (24-bit LE)
  data[7] = heightMinusOne & 0xff;
  data[8] = (heightMinusOne >> 8) & 0xff;
  data[9] = (heightMinusOne >> 16) & 0xff;

  return { fourcc: CHUNKS.VP8X, data };
}

/**
 * Build WebP from chunks
 */
function buildWebp(chunks: WebpChunk[]): Uint8Array {
  // Calculate total size
  let contentSize = 4; // "WEBP"
  for (const chunk of chunks) {
    const chunkSize = chunk.data.length;
    const padding = chunkSize % 2;
    contentSize += 8 + chunkSize + padding;
  }

  // Build file
  const result = new Uint8Array(8 + contentSize);

  // RIFF header
  result.set(FILE_SIGNATURES.RIFF, 0);
  dataview.writeUint32LE(result, 4, contentSize);

  // WEBP signature
  result.set(FILE_SIGNATURES.WEBP, 8);

  // Chunks
  let offset = 12;
  for (const chunk of chunks) {
    result.set(buffer.fromAscii(chunk.fourcc), offset);
    offset += 4;

    dataview.writeUint32LE(result, offset, chunk.data.length);
    offset += 4;

    result.set(chunk.data, offset);
    offset += chunk.data.length;

    // Add padding byte if needed
    if (chunk.data.length % 2 === 1) {
      result[offset] = 0;
      offset += 1;
    }
  }

  return result;
}

/**
 * Check if chunk is metadata that should be removed
 */
function isMetadataChunk(chunk: WebpChunk): boolean {
  return METADATA_CHUNKS.has(chunk.fourcc);
}

/**
 * Check if chunk is ICC profile
 */
function isIccChunk(chunk: WebpChunk): boolean {
  return chunk.fourcc === CHUNKS.ICCP;
}

/**
 * Check if VP8X chunk is needed
 */
function needsVp8x(chunks: WebpChunk[]): boolean {
  // VP8X is needed if there are multiple chunks or special features
  const hasIcc = chunks.some(c => c.fourcc === CHUNKS.ICCP);
  const hasAlpha = chunks.some(c => c.fourcc === CHUNKS.ALPH);
  const hasAnim = chunks.some(c => c.fourcc === CHUNKS.ANIM);
  const hasExif = chunks.some(c => c.fourcc === CHUNKS.EXIF);
  const hasXmp = chunks.some(c => c.fourcc === CHUNKS.XMP);

  return hasIcc || hasAlpha || hasAnim || hasExif || hasXmp;
}

/**
 * Remove metadata from WebP image
 */
export function remove(data: Uint8Array, options: RemoveOptions = {}): Uint8Array {
  const chunks = parseChunks(data);
  const removedMetadata: string[] = [];

  // Filter out VP8X first (we'll recreate it)
  let filteredChunks = chunks.filter(chunk => chunk.fourcc !== CHUNKS.VP8X);

  // Filter metadata
  filteredChunks = filteredChunks.filter(chunk => {
    if (isIccChunk(chunk)) {
      if (options.preserveColorProfile === true) {
        return true;
      }
      removedMetadata.push('ICC Profile');
      return false;
    }

    if (isMetadataChunk(chunk)) {
      if (chunk.fourcc === CHUNKS.EXIF) {
        removedMetadata.push('EXIF');
      } else if (chunk.fourcc === CHUNKS.XMP) {
        removedMetadata.push('XMP');
      }
      return false;
    }

    return true;
  });

  // Add VP8X if needed
  if (needsVp8x(filteredChunks)) {
    const vp8x = createVp8xChunk(filteredChunks);
    filteredChunks = [vp8x, ...filteredChunks];
  }

  return buildWebp(filteredChunks);
}

/**
 * Get list of metadata types present in the image
 */
export function getMetadataTypes(data: Uint8Array): string[] {
  const chunks = parseChunks(data);
  const types: string[] = [];

  for (const chunk of chunks) {
    if (chunk.fourcc === CHUNKS.EXIF) {
      types.push('EXIF');
    } else if (chunk.fourcc === CHUNKS.XMP) {
      types.push('XMP');
    } else if (chunk.fourcc === CHUNKS.ICCP) {
      types.push('ICC Profile');
    }
  }

  return [...new Set(types)];
}

/**
 * Read structured metadata from a WebP without modifying it.
 */
export function read(data: Uint8Array): Partial<MetadataMap> {
  const out: Partial<MetadataMap> = {};
  try {
    const chunks = parseChunks(data);
    for (const chunk of chunks) {
      if (chunk.fourcc === 'EXIF' && chunk.data.length >= 8) {
        // WebP EXIF: optional 6-byte 'Exif\0\0' prefix
        const hasPrefix =
          chunk.data[0] === 0x45 && chunk.data[1] === 0x78 &&
          chunk.data[2] === 0x69 && chunk.data[3] === 0x66;
        readExifBlock(hasPrefix ? chunk.data.slice(6) : chunk.data, out);
      } else if (chunk.fourcc === 'XMP ') {
        out.hasXmp = true;
      } else if (chunk.fourcc === 'ICCP') {
        out.hasIcc = true;
      }
    }
  } catch { /* ignore */ }
  return out;
}

export const webp = {
  remove,
  getMetadataTypes,
  parseChunks,
  read,
};

export default webp;
