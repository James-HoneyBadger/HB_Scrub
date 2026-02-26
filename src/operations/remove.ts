import { SupportedFormat, RemoveOptions, RemoveResult } from '../types.js';
import { InvalidFormatError, UnsupportedFormatError } from '../errors.js';
import { detectFormat } from '../detect.js';

import { jpeg } from '../formats/jpeg.js';
import { png } from '../formats/png.js';
import { webp } from '../formats/webp.js';
import { gif } from '../formats/gif.js';
import { svg } from '../formats/svg.js';
import { tiff } from '../formats/tiff.js';
import { heic } from '../formats/heic.js';
import { raw } from '../formats/raw.js';
import { avif } from '../formats/avif.js';
import { pdf } from '../formats/pdf.js';
import { mp4 } from '../formats/mp4.js';

import { readExifBlock } from '../exif/reader.js';
import {
  buildJpegExifSegment,
  buildRawExifBlock,
  buildRedactedGpsExif,
  wrapInJpegApp1,
} from '../exif/writer.js';

/**
 * Format handler interface
 */
interface FormatHandler {
  remove: (data: Uint8Array, options: RemoveOptions) => Uint8Array;
  getMetadataTypes: (data: Uint8Array) => string[];
}

// ─── Field name → preserve-flag mapping ─────────────────────────────────────

const FIELD_TO_PRESERVE: Partial<Record<string, keyof RemoveOptions>> = {
  'ICC Profile':    'preserveColorProfile',
  'Copyright':      'preserveCopyright',
  'Orientation':    'preserveOrientation',
  'Title':          'preserveTitle',
  'Description':    'preserveDescription',
};

/**
 * Merge remove[]/keep[] into the legacy preserveX flags so every handler
 * respects the new field-level options without knowing about them.
 */
function applyFieldOptions(options: RemoveOptions): RemoveOptions {
  const { remove, keep } = options;
  if (!remove && !keep) return options;

  const merged = { ...options };

  if (remove && remove.length > 0) {
    // Denylist mode: remove ONLY the listed fields → preserve everything else.
    for (const [field, flag] of Object.entries(FIELD_TO_PRESERVE)) {
      if (!remove.includes(field as never)) {
        (merged as Record<string, unknown>)[flag as string] = true;
      }
    }
  }

  if (keep && keep.length > 0) {
    // Allowlist: always preserve listed fields, overrides denylist.
    for (const field of keep) {
      const flag = FIELD_TO_PRESERVE[field];
      if (flag) {
        (merged as Record<string, unknown>)[flag as string] = true;
      }
    }
  }

  return merged;
}

/**
 * Format handlers registry
 */
const handlers: Record<SupportedFormat, FormatHandler | null> = {
  jpeg,
  png,
  webp,
  gif,
  svg,
  tiff,
  heic,
  avif,
  pdf,
  mp4,
  mov: mp4,
  dng: {
    remove: (data, options) => raw.removeDng(data, options),
    getMetadataTypes: raw.getMetadataTypes,
  },
  raw: {
    remove: (data, options) => raw.remove(data, options).data,
    getMetadataTypes: raw.getMetadataTypes,
  },
  unknown: null,
};

/**
 * Normalize input to Uint8Array. Exported for use by read.ts and verify.ts.
 */
export function normalizeInput(input: Uint8Array | ArrayBuffer | string): Uint8Array {
  if (typeof input === 'string') {
    if (input.startsWith('data:')) {
      const commaIndex = input.indexOf(',');
      if (commaIndex === -1) {
        throw new InvalidFormatError('Invalid data URL format');
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

// ─── EXIF injection helper ─────────────────────────────────────────────────────

/** Prepend an EXIF APP1 segment to a JPEG that may or may not have one. */
function injectIntoJpeg(data: Uint8Array, segment: Uint8Array): Uint8Array {
  // JPEG starts with FFD8. Insert APP1 right after the SOI marker.
  if (data[0] !== 0xFF || data[1] !== 0xD8) return data;
  const result = new Uint8Array(2 + segment.length + (data.length - 2));
  result.set(data.subarray(0, 2), 0);
  result.set(segment, 2);
  result.set(data.subarray(2), 2 + segment.length);
  return result;
}

/** Add/replace an eXIf chunk in a PNG. */
function injectIntoPng(data: Uint8Array, rawTiff: Uint8Array): Uint8Array {
  // Build a PNG eXIf chunk
  const chunkType = new Uint8Array([0x65, 0x58, 0x49, 0x66]); // 'eXIf'
  const length = rawTiff.length;
  const chunk = new Uint8Array(4 + 4 + length + 4); // len + type + data + crc
  const view = new DataView(chunk.buffer);
  view.setUint32(0, length, false);
  chunk.set(chunkType, 4);
  chunk.set(rawTiff, 8);
  // CRC is skipped; most readers tolerate zero CRC on eXIf
  view.setUint32(8 + length, 0, false);

  // Insert before IEND chunk (last 12 bytes of a valid PNG)
  const insertAt = data.length - 12;
  if (insertAt < 8) return data;
  const result = new Uint8Array(data.length + chunk.length);
  result.set(data.subarray(0, insertAt), 0);
  result.set(chunk, insertAt);
  result.set(data.subarray(insertAt), insertAt + chunk.length);
  return result;
}

/**
 * Core removal logic shared between sync and async APIs
 */
function processRemoval(data: Uint8Array, rawOptions: RemoveOptions): RemoveResult {
  const options = applyFieldOptions(rawOptions);
  const format = detectFormat(data);

  if (format === 'unknown') {
    throw new UnsupportedFormatError('unknown');
  }

  const handler = handlers[format];
  if (!handler) {
    throw new UnsupportedFormatError(format);
  }

  // ── GPS redaction: read GPS before removal so we can re-inject truncated ──
  let gpsLat: number | undefined;
  let gpsLng: number | undefined;
  if (options.gpsRedact && options.gpsRedact !== 'remove' && options.gpsRedact !== 'exact') {
    try {
      const meta = new Map<string, unknown>();
      // Try to read a TIFF/EXIF block depending on format
      if (format === 'jpeg') {
        // Find APP1
        let i = 2;
        while (i < data.length - 3) {
          if (data[i] !== 0xFF) break;
          const marker = data[i + 1] ?? 0;
          const segLen = ((data[i + 2] ?? 0) << 8) | (data[i + 3] ?? 0);
          if (marker === 0xE1) {
            const tag = String.fromCharCode(
              data[i+4] ?? 0, data[i+5] ?? 0, data[i+6] ?? 0, data[i+7] ?? 0,
            );
            if (tag === 'Exif') {
              const exifBlock = data.subarray(i + 10, i + 2 + segLen);
              const out: Partial<import('../types.js').MetadataMap> = {};
              readExifBlock(exifBlock, out);
              if (out.gps) { gpsLat = out.gps.latitude; gpsLng = out.gps.longitude; }
            }
          }
          i += 2 + segLen;
        }
      } else if (format === 'tiff' || format === 'dng') {
        const out: Partial<import('../types.js').MetadataMap> = {};
        readExifBlock(data, out);
        if (out.gps) { gpsLat = out.gps.latitude; gpsLng = out.gps.longitude; }
      }
      void meta;
    } catch { /* GPS unavailable */ }
  }

  // Get metadata types before removal
  const removedMetadata = handler.getMetadataTypes(data);

  // Remove metadata
  let cleanedData = handler.remove(data, options);

  // ── GPS re-injection (truncated coordinates) ──
  if (
    options.gpsRedact &&
    options.gpsRedact !== 'remove' &&
    options.gpsRedact !== 'exact' &&
    gpsLat !== undefined &&
    gpsLng !== undefined
  ) {
    try {
      const gpsTiff = buildRedactedGpsExif(gpsLat as number, gpsLng as number);
      if (format === 'jpeg') {
        const app1 = wrapInJpegApp1(gpsTiff);
        cleanedData = injectIntoJpeg(cleanedData, app1);
      } else if (format === 'png') {
        cleanedData = injectIntoPng(cleanedData, gpsTiff);
      }
      // TIFF/DNG GPS re-injection would require in-place IFD patching — skip for now.
    } catch { /* GPS re-injection best-effort */ }
  }

  // ── Metadata injection ──
  if (options.inject) {
    try {
      if (format === 'jpeg') {
        const segment = buildJpegExifSegment(options.inject);
        cleanedData = injectIntoJpeg(cleanedData, segment);
      } else if (format === 'png') {
        const tiffBlock = buildRawExifBlock(options.inject);
        if (tiffBlock.length > 0) {
          cleanedData = injectIntoPng(cleanedData, tiffBlock);
        }
      }
    } catch { /* injection is best-effort */ }
  }

  // Filter out items that were actually preserved based on options
  if (options.preserveColorProfile) {
    const idx = removedMetadata.indexOf('ICC Profile');
    if (idx !== -1) removedMetadata.splice(idx, 1);
  }
  if (options.preserveCopyright) {
    const idx = removedMetadata.indexOf('Copyright');
    if (idx !== -1) removedMetadata.splice(idx, 1);
  }
  if (options.preserveOrientation) {
    const idx = removedMetadata.indexOf('Orientation');
    if (idx !== -1) removedMetadata.splice(idx, 1);
  }
  if (options.preserveTitle) {
    const idx = removedMetadata.indexOf('Title');
    if (idx !== -1) removedMetadata.splice(idx, 1);
  }
  if (options.preserveDescription) {
    const idx = removedMetadata.indexOf('Description');
    if (idx !== -1) removedMetadata.splice(idx, 1);
  }

  // Detect if output format differs from input (e.g., RAW -> JPEG preview)
  let outputFormat: SupportedFormat | undefined;
  if (format === 'raw') {
    const detectedOutput = detectFormat(cleanedData);
    if (detectedOutput !== 'raw' && detectedOutput !== 'unknown') {
      outputFormat = detectedOutput;
    }
  }

  const result: RemoveResult = {
    data: cleanedData,
    format,
    originalSize: data.length,
    cleanedSize: cleanedData.length,
    removedMetadata,
  };
  if (outputFormat) {
    result.outputFormat = outputFormat;
  }
  return result;
}

/**
 * Remove metadata from an image or document.
 *
 * Supports JPEG, PNG, WebP, GIF, SVG, TIFF, HEIC, AVIF, PDF, MP4/MOV, DNG, and RAW.
 * Input is never re-encoded — metadata is stripped at the byte level.
 *
 * @param input   - Image data: `Uint8Array`, `ArrayBuffer`, or base64 data URL
 * @param options - Fine-grained control over what is kept or injected
 * @returns       `RemoveResult` with `data` (cleaned bytes), `format`, `removedMetadata`, etc.
 *
 * @example
 * ```typescript
 * // Strip all metadata
 * const result = await removeMetadata(imageBytes);
 *
 * // Keep orientation and color profile
 * const result = await removeMetadata(imageBytes, {
 *   preserveOrientation: true,
 *   preserveColorProfile: true,
 * });
 *
 * // Remove only GPS; leave everything else
 * const result = await removeMetadata(imageBytes, { remove: ['GPS'] });
 *
 * // Truncate GPS to city-level precision instead of stripping
 * const result = await removeMetadata(imageBytes, { gpsRedact: 'city' });
 *
 * // Inject a copyright notice after scrubbing
 * const result = await removeMetadata(imageBytes, {
 *   inject: { copyright: '© 2026 Jane Smith' },
 * });
 *
 * // Download the cleaned image in a browser
 * const blob = new Blob([result.data], { type: 'image/jpeg' });
 * ```
 */
// eslint-disable-next-line @typescript-eslint/require-await
export async function removeMetadata(
  input: Uint8Array | ArrayBuffer | string,
  options: RemoveOptions = {}
): Promise<RemoveResult> {
  const data = normalizeInput(input);
  return processRemoval(data, options);
}

/**
 * Synchronous version of `removeMetadata`.
 *
 * Identical behaviour — use when you cannot await (e.g. inside a Web Worker
 * `onmessage` handler, a Rollup plugin, or a CLI tool).
 */
export function removeMetadataSync(
  input: Uint8Array | ArrayBuffer | string,
  options: RemoveOptions = {}
): RemoveResult {
  const data = normalizeInput(input);
  return processRemoval(data, options);
}

/**
 * Return the names of metadata types present in a file without modifying it.
 *
 * @example
 * ```typescript
 * const types = getMetadataTypes(imageBytes);
 * // ['EXIF', 'GPS', 'ICC Profile', 'XMP']
 * ```
 */
export function getMetadataTypes(input: Uint8Array | ArrayBuffer): string[] {
  const data = input instanceof ArrayBuffer ? new Uint8Array(input) : input;
  const format = detectFormat(data);

  if (format === 'unknown') {
    return [];
  }

  const handler = handlers[format];
  if (!handler) {
    return [];
  }

  return handler.getMetadataTypes(data);
}

/**
 * Check if a format is supported
 */
export function isFormatSupported(format: SupportedFormat): boolean {
  return handlers[format] !== null;
}

/**
 * Get all supported formats
 */
export function getSupportedFormats(): SupportedFormat[] {
  return Object.entries(handlers)
    .filter(([_, handler]) => handler !== null)
    .map(([format]) => format as SupportedFormat);
}
