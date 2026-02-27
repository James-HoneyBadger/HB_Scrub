import { RemoveOptions } from '../types.js';
import { CorruptedFileError } from '../errors.js';
import * as buffer from '../binary/buffer.js';
import { FILE_SIGNATURES } from '../signatures.js';

/**
 * GIF block types
 */
const BLOCKS = {
  EXTENSION: 0x21, // Extension introducer
  IMAGE: 0x2c, // Image descriptor
  TRAILER: 0x3b, // End of file
} as const;

/**
 * Extension types
 */
const EXTENSIONS = {
  GRAPHICS_CONTROL: 0xf9, // Graphics control (animation timing)
  COMMENT: 0xfe, // Comment extension
  APPLICATION: 0xff, // Application extension (NETSCAPE, XMP, etc.)
  PLAIN_TEXT: 0x01, // Plain text extension
} as const;

/**
 * GIF block structure
 */
interface GifBlock {
  type: 'header' | 'logical_screen' | 'global_color_table' | 'extension' | 'image' | 'trailer';
  data: Uint8Array;
  extensionType?: number;
  applicationId?: string;
}

/**
 * Validate GIF header
 */
function validateHeader(data: Uint8Array): 'GIF87a' | 'GIF89a' {
  if (data.length < 6) {
    throw new CorruptedFileError('File too small to be a valid GIF');
  }

  if (buffer.startsWith(data, FILE_SIGNATURES.GIF87a)) {
    return 'GIF87a';
  }
  if (buffer.startsWith(data, FILE_SIGNATURES.GIF89a)) {
    return 'GIF89a';
  }

  throw new CorruptedFileError('Invalid GIF: missing GIF signature');
}

/**
 * Read sub-blocks (used in extensions and image data)
 */
function readSubBlocks(data: Uint8Array, offset: number): { data: Uint8Array; nextOffset: number } {
  const blocks: Uint8Array[] = [];
  let pos = offset;

  while (pos < data.length) {
    const blockSize = data[pos]!;
    pos += 1;

    if (blockSize === 0) {
      // Block terminator
      break;
    }

    if (pos + blockSize > data.length) {
      throw new CorruptedFileError('Invalid GIF: truncated sub-block', pos);
    }

    blocks.push(data.slice(pos, pos + blockSize));
    pos += blockSize;
  }

  return {
    data: buffer.concat(...blocks),
    nextOffset: pos,
  };
}

/**
 * Parse GIF into blocks
 */
function parseBlocks(data: Uint8Array): GifBlock[] {
  validateHeader(data);
  const blocks: GifBlock[] = [];

  // Header (6 bytes)
  blocks.push({
    type: 'header',
    data: data.slice(0, 6),
  });

  let offset = 6;

  // Logical Screen Descriptor (7 bytes)
  if (offset + 7 > data.length) {
    throw new CorruptedFileError('Invalid GIF: missing logical screen descriptor');
  }

  const lsdData = data.slice(offset, offset + 7);
  blocks.push({
    type: 'logical_screen',
    data: lsdData,
  });
  offset += 7;

  // Global Color Table (if present)
  const packedByte = lsdData[4]!;
  const hasGlobalColorTable = (packedByte & 0x80) !== 0;

  if (hasGlobalColorTable) {
    const colorTableSize = 3 * (1 << ((packedByte & 0x07) + 1));
    if (offset + colorTableSize > data.length) {
      throw new CorruptedFileError('Invalid GIF: truncated global color table');
    }

    blocks.push({
      type: 'global_color_table',
      data: data.slice(offset, offset + colorTableSize),
    });
    offset += colorTableSize;
  }

  // Parse remaining blocks
  while (offset < data.length) {
    const blockType = data[offset]!;

    if (blockType === BLOCKS.TRAILER) {
      blocks.push({
        type: 'trailer',
        data: new Uint8Array([BLOCKS.TRAILER]),
      });
      break;
    }

    if (blockType === BLOCKS.EXTENSION) {
      offset += 1;

      if (offset >= data.length) {
        throw new CorruptedFileError('Invalid GIF: truncated extension', offset);
      }

      const extensionType = data[offset]!;
      offset += 1;

      const extensionStart = offset - 2;

      if (extensionType === EXTENSIONS.APPLICATION) {
        // Application extension: read 11-byte identifier
        if (offset + 12 > data.length) {
          throw new CorruptedFileError('Invalid GIF: truncated application extension', offset);
        }

        const appBlockSize = data[offset]!;
        offset += 1;

        if (appBlockSize !== 11) {
          // Non-standard block size: preserve the extension as-is
          const { nextOffset } = readSubBlocks(data, offset - 1);
          blocks.push({
            type: 'extension',
            data: data.slice(extensionStart, nextOffset),
            extensionType,
          });
          offset = nextOffset;
          continue;
        }

        const applicationId = buffer.toAscii(data, offset, 11);
        offset += 11;

        // Read sub-blocks
        const { nextOffset } = readSubBlocks(data, offset);

        blocks.push({
          type: 'extension',
          data: data.slice(extensionStart, nextOffset),
          extensionType,
          applicationId,
        });

        offset = nextOffset;
      } else {
        // Other extensions (graphics control, comment, plain text)
        const { nextOffset } = readSubBlocks(data, offset);

        blocks.push({
          type: 'extension',
          data: data.slice(extensionStart, nextOffset),
          extensionType,
        });

        offset = nextOffset;
      }
    } else if (blockType === BLOCKS.IMAGE) {
      const imageStart = offset;
      offset += 1;

      // Image descriptor (9 bytes)
      if (offset + 9 > data.length) {
        throw new CorruptedFileError('Invalid GIF: truncated image descriptor', offset);
      }

      const imageDescriptor = data.slice(offset, offset + 9);
      offset += 9;

      // Local Color Table (if present)
      const imagePackedByte = imageDescriptor[8]!;
      const hasLocalColorTable = (imagePackedByte & 0x80) !== 0;

      if (hasLocalColorTable) {
        const localColorTableSize = 3 * (1 << ((imagePackedByte & 0x07) + 1));
        if (offset + localColorTableSize > data.length) {
          throw new CorruptedFileError('Invalid GIF: truncated local color table', offset);
        }
        offset += localColorTableSize;
      }

      // LZW minimum code size
      if (offset >= data.length) {
        throw new CorruptedFileError('Invalid GIF: missing LZW minimum code size', offset);
      }
      offset += 1;

      // Image data sub-blocks
      const { nextOffset } = readSubBlocks(data, offset);

      blocks.push({
        type: 'image',
        data: data.slice(imageStart, nextOffset),
      });

      offset = nextOffset;
    } else {
      // Unknown block type, skip
      offset += 1;
    }
  }

  return blocks;
}

/**
 * Check if extension is NETSCAPE (animation loop)
 */
function isNetscapeExtension(block: GifBlock): boolean {
  if (block.type !== 'extension' || block.extensionType !== EXTENSIONS.APPLICATION) {
    return false;
  }
  const appId = block.applicationId ?? '';
  return appId.startsWith('NETSCAPE');
}

/**
 * Check if extension is XMP metadata
 */
function isXmpExtension(block: GifBlock): boolean {
  if (block.type !== 'extension' || block.extensionType !== EXTENSIONS.APPLICATION) {
    return false;
  }
  const appId = block.applicationId ?? '';
  return appId.includes('XMP');
}

/**
 * Check if extension is a comment
 */
function isCommentExtension(block: GifBlock): boolean {
  return block.type === 'extension' && block.extensionType === EXTENSIONS.COMMENT;
}

/**
 * Check if extension should be kept
 */
function shouldKeepBlock(block: GifBlock, _options: RemoveOptions): boolean {
  // Always keep non-extension blocks
  if (block.type !== 'extension') {
    return true;
  }

  // Always keep graphics control (animation timing)
  if (block.extensionType === EXTENSIONS.GRAPHICS_CONTROL) {
    return true;
  }

  // Keep NETSCAPE extension (animation loop control)
  if (isNetscapeExtension(block)) {
    return true;
  }

  // Remove comment extensions
  if (isCommentExtension(block)) {
    return false;
  }

  // Remove XMP metadata
  if (isXmpExtension(block)) {
    return false;
  }

  // Remove other application extensions (potential metadata)
  if (block.extensionType === EXTENSIONS.APPLICATION) {
    return false;
  }

  // Keep plain text extensions (rare, but part of image content)
  if (block.extensionType === EXTENSIONS.PLAIN_TEXT) {
    return true;
  }

  return true;
}

/**
 * Build GIF from blocks
 */
function buildGif(blocks: GifBlock[]): Uint8Array {
  const parts: Uint8Array[] = [];

  for (const block of blocks) {
    parts.push(block.data);
  }

  return buffer.concat(...parts);
}

/**
 * Remove metadata from GIF image
 */
export function remove(data: Uint8Array, options: RemoveOptions = {}): Uint8Array {
  const blocks = parseBlocks(data);

  const filteredBlocks = blocks.filter(block => {
    return shouldKeepBlock(block, options);
  });

  return buildGif(filteredBlocks);
}

/**
 * Get list of metadata types present in the image
 */
export function getMetadataTypes(data: Uint8Array): string[] {
  const blocks = parseBlocks(data);
  const types: string[] = [];

  for (const block of blocks) {
    if (isCommentExtension(block)) {
      types.push('Comment');
    } else if (isXmpExtension(block)) {
      types.push('XMP');
    } else if (
      block.type === 'extension' &&
      block.extensionType === EXTENSIONS.APPLICATION &&
      !isNetscapeExtension(block)
    ) {
      types.push(`Application (${block.applicationId ?? 'unknown'})`);
    }
  }

  return [...new Set(types)];
}

import type { MetadataMap } from '../types.js';

/**
 * Read structured metadata from a GIF without modifying it.
 * GIF has no EXIF support — only XMP comments are surfaced.
 */
export function read(data: Uint8Array): Partial<MetadataMap> {
  const out: Partial<MetadataMap> = {};
  try {
    const blocks = parseBlocks(data);
    if (blocks.some(b => isXmpExtension(b))) {
      out.hasXmp = true;
    }
  } catch {
    /* ignore */
  }
  return out;
}

export const gif = {
  remove,
  getMetadataTypes,
  parseBlocks,
  read,
};

export default gif;
