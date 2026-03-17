/**
 * verifyClean() — confirm that no known metadata remains after scrubbing.
 *
 * Re-runs `getMetadataTypes()` on the supplied buffer and returns a
 * `VerifyResult` with a boolean `clean` flag and any `remainingMetadata`
 * type names that were detected.
 *
 * Use this as a post-processing assertion in pipelines that require
 * a provably clean output before transmission or publication.
 *
 * @example
 * ```typescript
 * import { removeMetadata, verifyClean } from 'hb-scrub';
 *
 * const { data } = await removeMetadata(imageBytes);
 * const { clean, remainingMetadata } = await verifyClean(data);
 * if (!clean) {
 *   console.warn('Residual metadata:', remainingMetadata);
 * }
 * ```
 */

import { detectFormat } from '../detect.js';
import { normalizeInput } from '../binary/normalize.js';
import type { VerifyResult, SupportedFormat } from '../types.js';

import { jpeg } from '../formats/jpeg.js';
import { png } from '../formats/png.js';
import { webp } from '../formats/webp.js';
import { gif } from '../formats/gif.js';
import { svg } from '../formats/svg.js';
import { tiff } from '../formats/tiff.js';
import { heic } from '../formats/heic.js';
import { avif } from '../formats/avif.js';
import { raw } from '../formats/raw.js';
import { pdf } from '../formats/pdf.js';
import { mp4 } from '../formats/mp4.js';

const checkers: Partial<
  Record<SupportedFormat, { getMetadataTypes: (d: Uint8Array) => string[] }>
> = {
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
  dng: raw,
  raw,
  mov: mp4,
};

/** Formats with thorough metadata coverage (high confidence). */
const HIGH_CONFIDENCE_FORMATS = new Set<SupportedFormat>([
  'jpeg', 'png', 'webp', 'tiff', 'heic', 'avif',
]);
/** Formats with partial coverage (medium confidence). */
const MEDIUM_CONFIDENCE_FORMATS = new Set<SupportedFormat>([
  'gif', 'pdf', 'mp4', 'mov', 'dng', 'raw', 'svg',
]);

function getConfidence(format: SupportedFormat): 'high' | 'medium' | 'low' {
  if (HIGH_CONFIDENCE_FORMATS.has(format)) return 'high';
  if (MEDIUM_CONFIDENCE_FORMATS.has(format)) return 'medium';
  return 'low';
}

/**
 * Detect whether the file contains embedded JPEG thumbnail data in EXIF.
 * Looks for EXIF tag 0x0201 (JPEGInterchangeFormat / ThumbnailOffset) which
 * indicates an IFD1 thumbnail, then checks if there's a non-zero companion
 * 0x0202 (JPEGInterchangeFormatLength).
 */
function hasThumbnailData(data: Uint8Array): boolean {
  // Quick scan for the JPEG thumbnail EXIF tags embedded anywhere in the file.
  // Tag 0x0201 = JPEGInterchangeFormat (thumbnail offset)
  // Tag 0x0202 = JPEGInterchangeFormatLength
  // These can appear in either byte order, so check both.
  const be0201 = [0x02, 0x01];
  const le0201 = [0x01, 0x02];
  const be0202 = [0x02, 0x02];

  for (let i = 0; i < data.length - 12; i++) {
    // Check for tag 0x0201 in big-endian
    if (data[i] === be0201[0] && data[i + 1] === be0201[1]) {
      // Verify it looks like a TIFF tag entry (type should be LONG=4, count=1)
      if (data[i + 2] === 0x00 && data[i + 3] === 0x04 &&
          data[i + 4] === 0x00 && data[i + 5] === 0x00 &&
          data[i + 6] === 0x00 && data[i + 7] === 0x01) {
        // Check the value is non-zero (actual offset)
        const val = (data[i + 8]! << 24) | (data[i + 9]! << 16) | (data[i + 10]! << 8) | data[i + 11]!;
        if (val > 0) {
          // Look for companion tag 0x0202 nearby
          for (let j = Math.max(0, i - 120); j < Math.min(data.length - 2, i + 120); j++) {
            if (data[j] === be0202[0] && data[j + 1] === be0202[1]) return true;
          }
        }
      }
    }
    // Check for tag 0x0201 in little-endian
    if (data[i] === le0201[0] && data[i + 1] === le0201[1]) {
      if (data[i + 2] === 0x04 && data[i + 3] === 0x00 &&
          data[i + 4] === 0x01 && data[i + 5] === 0x00 &&
          data[i + 6] === 0x00 && data[i + 7] === 0x00) {
        const val = data[i + 8]! | (data[i + 9]! << 8) | (data[i + 10]! << 16) | (data[i + 11]! << 24);
        if (val > 0) {
          for (let j = Math.max(0, i - 120); j < Math.min(data.length - 2, i + 120); j++) {
            if (data[j] === 0x02 && data[j + 1] === 0x02) return true;
          }
        }
      }
    }
  }
  return false;
}

/**
 * Verify that a cleaned buffer contains no detectable metadata.
 *
 * @param input  Cleaned image data (Uint8Array, ArrayBuffer, or data URL)
 */
export function verifyCleanSync(input: Uint8Array | ArrayBuffer | string): VerifyResult {
  const data = normalizeInput(input);
  const format = detectFormat(data);
  const warnings: string[] = [];

  const checker = checkers[format];
  let remainingMetadata: string[] = [];
  try {
    remainingMetadata = checker ? checker.getMetadataTypes(data) : [];
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push(`Verification error: ${msg}`);
  }

  // Check for residual JPEG thumbnail data in EXIF (IFD1 with embedded JPEG)
  if (format === 'jpeg' || format === 'tiff' || format === 'heic' || format === 'avif') {
    if (hasThumbnailData(data)) {
      if (!remainingMetadata.includes('Thumbnail')) {
        remainingMetadata.push('Thumbnail');
      }
      warnings.push('Embedded EXIF thumbnail detected — may leak original image preview');
    }
  }

  return {
    clean: remainingMetadata.length === 0,
    format,
    remainingMetadata,
    confidence: getConfidence(format),
    warnings,
  };
}

/**
 * Async version of verifyClean.
 */
export async function verifyClean(
  input: Uint8Array | ArrayBuffer | string | Blob
): Promise<VerifyResult> {
  let data: Uint8Array | ArrayBuffer | string;
  if (typeof Blob !== 'undefined' && input instanceof Blob) {
    data = new Uint8Array(await input.arrayBuffer());
  } else {
    data = input as Uint8Array | ArrayBuffer | string;
  }
  return verifyCleanSync(data);
}
