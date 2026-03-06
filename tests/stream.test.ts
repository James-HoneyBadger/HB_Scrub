/**
 * Tests for src/node-stream.ts
 *
 * Covers ScrubTransform / createScrubStream piping behaviour,
 * error handling, and option pass-through.
 */

import { describe, it, expect } from 'vitest';
import { Readable, Writable } from 'node:stream';
import { createScrubStream, ScrubTransform } from '../src/node-stream.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Collect all data from a readable stream into a single Buffer. */
function collect(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

/** Minimal clean JPEG: SOI + EOI. */
const CLEAN_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

/** Minimal clean GIF89a. */
const CLEAN_GIF = Buffer.from([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61,
  0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00,
  0x3b,
]);

// ── createScrubStream ─────────────────────────────────────────────────────────

describe('createScrubStream', () => {
  it('returns a ScrubTransform instance', () => {
    const stream = createScrubStream();
    expect(stream).toBeInstanceOf(ScrubTransform);
    expect(stream).toBeInstanceOf(Readable);
  });

  it('passes through a clean JPEG', async () => {
    const stream = createScrubStream();
    const result = collect(stream);
    stream.end(CLEAN_JPEG);
    const output = await result;
    expect(output[0]).toBe(0xff);
    expect(output[1]).toBe(0xd8);
  });

  it('passes through a clean GIF', async () => {
    const stream = createScrubStream();
    const result = collect(stream);
    stream.end(CLEAN_GIF);
    const output = await result;
    // Should still start with GIF89a
    expect(output.toString('ascii', 0, 6)).toBe('GIF89a');
  });

  it('handles multi-chunk writes', async () => {
    const stream = createScrubStream();
    const result = collect(stream);
    // Write the JPEG in two chunks
    stream.write(CLEAN_JPEG.subarray(0, 2));
    stream.end(CLEAN_JPEG.subarray(2));
    const output = await result;
    expect(output[0]).toBe(0xff);
    expect(output[1]).toBe(0xd8);
  });

  it('emits error for unrecognised format', async () => {
    const stream = createScrubStream();
    const errPromise = new Promise<Error>((resolve) => {
      stream.on('error', (err) => resolve(err));
    });
    stream.end(Buffer.from([0x00, 0x00, 0x00, 0x00]));
    const err = await errPromise;
    expect(err).toBeInstanceOf(Error);
  });
});

describe('ScrubTransform with options', () => {
  it('accepts preserveOrientation option', async () => {
    // Just verify the option is accepted without throwing
    const stream = new ScrubTransform({ preserveOrientation: true });
    const result = collect(stream);
    stream.end(CLEAN_JPEG);
    const output = await result;
    expect(output.length).toBeGreaterThan(0);
  });
});

describe('ScrubTransform piping', () => {
  it('works with Readable.pipe()', async () => {
    const input = Readable.from([CLEAN_JPEG]);
    const scrub = createScrubStream();

    const chunks: Buffer[] = [];
    const sink = new Writable({
      write(chunk, _enc, cb) {
        chunks.push(Buffer.from(chunk));
        cb();
      },
    });

    await new Promise<void>((resolve, reject) => {
      input.pipe(scrub).pipe(sink);
      sink.on('finish', resolve);
      sink.on('error', reject);
    });

    const output = Buffer.concat(chunks);
    expect(output[0]).toBe(0xff);
    expect(output[1]).toBe(0xd8);
  });
});
