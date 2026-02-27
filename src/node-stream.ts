/**
 * Node.js Transform stream wrapper for hb-scrub.
 *
 * Buffers the entire input before processing because EXIF data can appear
 * at any byte offset within a file — there is no incremental heuristic that
 * is safe for all supported formats.
 *
 * Import from `hb-scrub/stream`:
 * ```ts
 * import { createScrubStream } from 'hb-scrub/stream';
 * import { createReadStream, createWriteStream } from 'node:fs';
 *
 * createReadStream('photo.jpg')
 *   .pipe(createScrubStream({ preserveOrientation: true }))
 *   .pipe(createWriteStream('photo-clean.jpg'));
 *
 * // With GPS redaction and copyright injection:
 * createReadStream('photo.jpg')
 *   .pipe(createScrubStream({
 *     gpsRedact: 'city',
 *     inject: { copyright: '© 2026 Jane Smith' },
 *   }))
 *   .pipe(createWriteStream('photo-clean.jpg'));
 * ```
 */

import { Transform, type TransformOptions } from 'node:stream';
import { removeMetadataSync } from './operations/remove.js';
import type { RemoveOptions } from './types.js';

/**
 * Transform stream that buffers input, scrubs metadata, and emits clean bytes.
 *
 * Instantiated via `createScrubStream(options)` rather than directly.
 */
export class ScrubTransform extends Transform {
  private readonly _scrubOptions: RemoveOptions;
  private _chunks: Buffer[] = [];

  constructor(scrubOptions: RemoveOptions = {}, streamOptions?: TransformOptions) {
    super(streamOptions);
    this._scrubOptions = scrubOptions;
  }

  override _transform(
    chunk: Buffer | Uint8Array | string,
    _encoding: BufferEncoding,
    callback: (err?: Error | null) => void
  ): void {
    this._chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
    callback();
  }

  override _flush(callback: (err?: Error | null) => void): void {
    try {
      const combined = Buffer.concat(this._chunks);
      const input = new Uint8Array(combined.buffer, combined.byteOffset, combined.byteLength);
      const result = removeMetadataSync(input, this._scrubOptions);
      this.push(Buffer.from(result.data));
      callback();
    } catch (err) {
      callback(err instanceof Error ? err : new Error(String(err)));
    } finally {
      this._chunks = [];
    }
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create a Node.js Transform stream that removes metadata from a piped file.
 *
 * All `RemoveOptions` are supported: preserve flags, GPS redaction, field
 * allowlists/denylists, and metadata injection.
 *
 * @param options  Any `RemoveOptions` accepted by `removeMetadataSync`.
 * @returns        A Transform stream. Pipe an image into it and read clean bytes out.
 */
export function createScrubStream(options: RemoveOptions = {}): ScrubTransform {
  return new ScrubTransform(options);
}
