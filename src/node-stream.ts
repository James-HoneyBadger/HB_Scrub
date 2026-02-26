/**
 * Node.js Transform stream wrapper for hb-scrub.
 *
 * Usage:
 * ```ts
 * import { createScrubStream } from 'hb-scrub/stream';
 * import { createReadStream, createWriteStream } from 'node:fs';
 *
 * createReadStream('photo.jpg')
 *   .pipe(createScrubStream())
 *   .pipe(createWriteStream('photo-clean.jpg'));
 * ```
 *
 * The stream buffers the entire input because EXIF data can appear anywhere
 * in the file — there is no streaming heuristic that is safe for all formats.
 */

import { Transform, type TransformOptions } from 'node:stream';
import { removeMetadataSync } from './operations/remove.js';
import type { RemoveOptions } from './types.js';

// ─── ScrubTransform ───────────────────────────────────────────────────────────

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
    callback: (err?: Error | null) => void,
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
 * Create a Node.js Transform stream that scrubs metadata from a piped file.
 *
 * Buffers the entire input before processing (required for correct EXIF
 * offset handling in binary formats like JPEG, PNG, etc.).
 *
 * @param options  Any RemoveOptions (preserve flags, gpsRedact, inject, etc.)
 * @returns        A Transform stream ready to be piped.
 */
export function createScrubStream(options: RemoveOptions = {}): ScrubTransform {
  return new ScrubTransform(options);
}
