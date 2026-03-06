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
  'gif', 'pdf', 'mp4', 'mov', 'dng', 'raw',
]);

function getConfidence(format: SupportedFormat): 'high' | 'medium' | 'low' {
  if (HIGH_CONFIDENCE_FORMATS.has(format)) return 'high';
  if (MEDIUM_CONFIDENCE_FORMATS.has(format)) return 'medium';
  return 'low';
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
