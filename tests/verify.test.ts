/**
 * Tests for src/operations/verify.ts
 *
 * Feature 8: verifyClean confidence score ('high' | 'medium' | 'low')
 */

import { describe, it, expect } from 'vitest';
import { verifyCleanSync } from '../src/operations/verify.js';

// ── Minimal clean file fixtures ───────────────────────────────────────────────

/** Minimal JPEG with no metadata (SOI + EOI only). */
const CLEAN_JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

/** Minimal GIF89a with no extensions (no metadata). */
const CLEAN_GIF = new Uint8Array([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, // "GIF89a"
  0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, // Logical Screen Descriptor (1x1, no GCT)
  0x3b, // Trailer
]);

/** Minimal PNG (signature + IHDR + IEND — no metadata chunks). */
function buildCleanPng(): Uint8Array {
  // PNG signature
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  // IHDR chunk (13 bytes): 1×1 pixel, 8-bit RGB, no interlace
  const ihdrData = [0x00, 0x00, 0x00, 0x01, // width = 1
                    0x00, 0x00, 0x00, 0x01, // height = 1
                    0x08, 0x02, 0x00, 0x00, 0x00]; // bit depth=8, colortype=2 (RGB), …
  // CRC for IHDR (precomputed, but we'll set it to some bytes; PNG readers may not care in unit test context)
  const ihdrChunk = [0x00, 0x00, 0x00, 0x0d, // length 13
                     0x49, 0x48, 0x44, 0x52, // "IHDR"
                     ...ihdrData,
                     0x90, 0x77, 0x53, 0xde]; // CRC (approx — won't be parsed in getMetadataTypes)
  // IEND chunk
  const iendChunk = [0x00, 0x00, 0x00, 0x00, // length 0
                     0x49, 0x45, 0x4e, 0x44, // "IEND"
                     0xae, 0x42, 0x60, 0x82]; // CRC
  return new Uint8Array([...sig, ...ihdrChunk, ...iendChunk]);
}

/** Unknown format — random bytes that don't match any signature. */
const UNKNOWN_FORMAT = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00]);

// ─────────────────────────────────────────────────────────────────────────────

describe('verifyCleanSync — confidence field (Feature 8)', () => {
  it('returns confidence "high" for JPEG format', () => {
    const result = verifyCleanSync(CLEAN_JPEG);
    expect(result.confidence).toBe('high');
  });

  it('returns confidence "high" for clean PNG', () => {
    const result = verifyCleanSync(buildCleanPng());
    expect(result.confidence).toBe('high');
  });

  it('returns confidence "medium" for GIF format', () => {
    const result = verifyCleanSync(CLEAN_GIF);
    expect(result.confidence).toBe('medium');
  });

  it('returns confidence "low" for unknown format', () => {
    const result = verifyCleanSync(UNKNOWN_FORMAT);
    expect(result.confidence).toBe('low');
  });

  it('result always includes the confidence field', () => {
    const result = verifyCleanSync(CLEAN_JPEG);
    expect(result).toHaveProperty('confidence');
    expect(['high', 'medium', 'low']).toContain(result.confidence);
  });

  it('clean JPEG returns clean: true', () => {
    const result = verifyCleanSync(CLEAN_JPEG);
    expect(result.clean).toBe(true);
    expect(result.remainingMetadata).toHaveLength(0);
  });

  it('clean GIF returns clean: true', () => {
    const result = verifyCleanSync(CLEAN_GIF);
    expect(result.clean).toBe(true);
  });

  it('format field is populated in the result', () => {
    const result = verifyCleanSync(CLEAN_JPEG);
    expect(result.format).toBe('jpeg');
  });

  it('unknown format reports format "unknown"', () => {
    const result = verifyCleanSync(UNKNOWN_FORMAT);
    expect(result.format).toBe('unknown');
  });

  it('accepts ArrayBuffer input', () => {
    const ab = CLEAN_JPEG.buffer.slice(
      CLEAN_JPEG.byteOffset, CLEAN_JPEG.byteOffset + CLEAN_JPEG.byteLength
    );
    const result = verifyCleanSync(ab);
    expect(result.confidence).toBe('high');
  });
});
