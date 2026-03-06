import { InvalidFormatError } from '../errors.js';

/**
 * MIME types considered valid for data URL input.
 * Broad enough to cover all supported formats.
 */
const VALID_DATA_URL_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'image/tiff',
  'image/heic',
  'image/heif',
  'image/avif',
  'image/x-adobe-dng',
  'image/x-raw',
  'application/pdf',
  'video/mp4',
  'video/quicktime',
  'application/octet-stream',
]);

/**
 * Normalize input to Uint8Array.
 *
 * Accepts `Uint8Array`, `ArrayBuffer`, or a `data:...;base64,...` URL string.
 * Validates MIME type and encoding for data URLs to prevent misuse.
 */
export function normalizeInput(input: Uint8Array | ArrayBuffer | string): Uint8Array {
  if (typeof input === 'string') {
    if (input.startsWith('data:')) {
      const commaIndex = input.indexOf(',');
      if (commaIndex === -1) {
        throw new InvalidFormatError('Invalid data URL format: missing comma separator');
      }
      const header = input.slice(5, commaIndex); // between "data:" and ","
      // Expected format: <mime>;base64
      if (!header.endsWith(';base64')) {
        throw new InvalidFormatError(
          'Invalid data URL: only base64 encoding is supported'
        );
      }
      const mime = header.slice(0, -7); // strip ";base64"
      if (mime && !VALID_DATA_URL_MIMES.has(mime)) {
        throw new InvalidFormatError(
          `Invalid data URL: unsupported MIME type "${mime}"`
        );
      }
      const base64Data = input.slice(commaIndex + 1);
      const binaryString = atob(base64Data);
      const data = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        data[i] = binaryString.charCodeAt(i);
      }
      return data;
    }
    throw new InvalidFormatError('String input must be a data URL');
  }
  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  }
  if (input instanceof Uint8Array) {
    return input;
  }
  throw new InvalidFormatError('Input must be Uint8Array, ArrayBuffer, or data URL string');
}
