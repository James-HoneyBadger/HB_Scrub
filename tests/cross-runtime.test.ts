/**
 * Cross-runtime smoke tests for HB Scrub.
 *
 * Run with:
 *   deno test --allow-read tests/cross-runtime.test.ts
 *   bun test  tests/cross-runtime.test.ts
 *   npx vitest run tests/cross-runtime.test.ts
 *
 * These tests use only the browser-compatible API surface (no Node fs),
 * so they work on Deno, Bun, and Node.
 */

import { describe, it, expect } from 'vitest';
import { removeMetadata } from '../src/index.js';
import { detectFormat } from '../src/detect.js';
import { verifyCleanSync } from '../src/operations/verify.js';

// Minimal JPEG: SOI + APP1(Exif) + SOS + EOI
function minimalJpeg(): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8,             // SOI
    0xff, 0xe1, 0x00, 0x10, // APP1 length=16
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // TIFF header (BE)
    0xff, 0xda, 0x00, 0x02, // SOS
    0xff, 0xd9,             // EOI
  ]);
}

// Minimal PNG: signature + IHDR + tEXt + IEND
function minimalPng(): Uint8Array {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  const ihdr = [
    0, 0, 0, 13, // length
    73, 72, 68, 82, // IHDR
    0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0, // 1x1 RGB
    0, 0, 0, 0, // CRC placeholder
  ];
  const text = [
    0, 0, 0, 11, // length
    116, 69, 88, 116, // tEXt
    ...Array.from(new TextEncoder().encode('Comment\0Hi!')),
    0, 0, 0, 0, // CRC placeholder
  ];
  const iend = [0, 0, 0, 0, 73, 69, 78, 68, 0, 0, 0, 0];
  return new Uint8Array([...sig, ...ihdr, ...text, ...iend]);
}

describe('Cross-runtime: detectFormat', () => {
  it('detects JPEG', () => {
    expect(detectFormat(minimalJpeg())).toBe('jpeg');
  });

  it('detects PNG', () => {
    expect(detectFormat(minimalPng())).toBe('png');
  });

  it('returns unknown for empty data', () => {
    expect(detectFormat(new Uint8Array(0))).toBe('unknown');
  });
});

describe('Cross-runtime: removeMetadata', () => {
  it('removes JPEG EXIF', async () => {
    const result = await removeMetadata(minimalJpeg());
    expect(result.data).toBeInstanceOf(Uint8Array);
    expect(result.data.length).toBeGreaterThan(0);
  });

  it('removes PNG tEXt', async () => {
    const result = await removeMetadata(minimalPng());
    expect(result.data).toBeInstanceOf(Uint8Array);
  });
});

describe('Cross-runtime: verifyClean', () => {
  it('verifies cleaned JPEG', async () => {
    const { data } = await removeMetadata(minimalJpeg());
    const result = verifyCleanSync(data);
    expect(result.clean).toBe(true);
  });
});
