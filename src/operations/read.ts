/**
 * readMetadata() — inspect the metadata present in an image/document without
 * modifying it.
 *
 * Returns a structured MetadataMap plus the detected format and file size.
 */

import { detectFormat } from '../detect.js';
import { normalizeInput } from './remove.js';
import type { ReadResult, MetadataMap, SupportedFormat } from '../types.js';

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

// ─── Format → reader map ──────────────────────────────────────────────────────

type FormatReader = {
  read: (data: Uint8Array) => Partial<MetadataMap>;
  getMetadataTypes: (data: Uint8Array) => string[];
};

const readers: Partial<Record<SupportedFormat, FormatReader>> = {
  jpeg,
  png,
  webp,
  gif,
  svg,
  tiff,
  dng: { read: raw.read, getMetadataTypes: raw.getMetadataTypes },
  raw: { read: raw.read, getMetadataTypes: raw.getMetadataTypes },
  heic,
  avif,
  pdf,
  mp4,
  mov: { read: mp4.read, getMetadataTypes: mp4.getMetadataTypes },
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Inspect the metadata in an image/document synchronously.
 *
 * @param input  Uint8Array, ArrayBuffer, or data URL (base64)
 */
export function readMetadataSync(input: Uint8Array | ArrayBuffer | string): ReadResult {
  const data = normalizeInput(input);
  const format = detectFormat(data);

  const reader = readers[format];
  const partial: Partial<MetadataMap> = reader ? reader.read(data) : {};

  const metadata: MetadataMap = { format, ...partial };

  return { metadata, format, fileSize: data.length };
}

/**
 * Inspect the metadata in an image/document asynchronously.
 */
export async function readMetadata(
  input: Uint8Array | ArrayBuffer | string | Blob,
): Promise<ReadResult> {
  let data: Uint8Array | ArrayBuffer | string;
  if (typeof Blob !== 'undefined' && input instanceof Blob) {
    data = new Uint8Array(await input.arrayBuffer());
  } else {
    data = input as Uint8Array | ArrayBuffer | string;
  }
  return readMetadataSync(data);
}
