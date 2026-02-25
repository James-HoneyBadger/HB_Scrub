/**
 * HB_Scrub - Image metadata removal library
 *
 * Remove EXIF, GPS, and other metadata from images.
 * Supports JPEG, PNG, WebP, GIF, SVG, TIFF, HEIC, and RAW formats.
 *
 * @packageDocumentation
 */

// Main API
export {
  removeMetadata,
  removeMetadataSync,
  getMetadataTypes,
  isFormatSupported,
  getSupportedFormats,
} from './operations/remove.js';

// Format detection
export { detectFormat, getMimeType } from './detect.js';

// Types
export type { SupportedFormat, RemoveOptions, RemoveResult } from './types.js';

// Error classes
export {
  HbScrubError,
  InvalidFormatError,
  CorruptedFileError,
  BufferOverflowError,
  UnsupportedFormatError,
  HeicProcessingError,
  SvgParseError,
} from './errors.js';

// Format-specific exports for advanced usage
export { jpeg } from './formats/jpeg.js';
export { png } from './formats/png.js';
export { webp } from './formats/webp.js';
export { gif } from './formats/gif.js';
export { svg } from './formats/svg.js';
export { tiff } from './formats/tiff.js';
export { heic } from './formats/heic.js';
export { raw } from './formats/raw.js';

// Binary utilities for advanced usage
export * as buffer from './binary/buffer.js';
export * as dataview from './binary/dataview.js';
export { crc32 } from './binary/crc32.js';

// File signatures for format detection
export { FILE_SIGNATURES } from './signatures.js';

// Default export for convenience
import { removeMetadata } from './operations/remove.js';
export default removeMetadata;
