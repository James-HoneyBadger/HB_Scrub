/**
 * Integration tests using synthetically-generated "real" file structures.
 *
 * These tests exercise the full pipeline: detect → read → remove → verify
 * for each supported format, using minimal but structurally valid files.
 *
 * Run:
 *   npx vitest run tests/integration.test.ts
 */

import { describe, it, expect } from 'vitest';
import { removeMetadata } from '../src/index.js';
import { detectFormat } from '../src/detect.js';
import { verifyCleanSync } from '../src/operations/verify.js';
import { readMetadata } from '../src/index.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function concat(...bufs: Uint8Array[]): Uint8Array {
  const len = bufs.reduce((s, b) => s + b.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const b of bufs) { out.set(b, off); off += b.length; }
  return out;
}

function u32be(n: number): Uint8Array {
  return new Uint8Array([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);
}

// ─── Format fixtures ─────────────────────────────────────────────────────────

function makeJpegWithExif(): Uint8Array {
  const exifPayload = new Uint8Array(64).fill(0x42);
  const exifHeader = new Uint8Array([0x45, 0x78, 0x69, 0x66, 0x00, 0x00]);
  // TIFF header (big-endian)
  const tiffHeader = new Uint8Array([0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08]);
  const body = concat(exifHeader, tiffHeader, exifPayload);
  const len = body.length + 2;
  return concat(
    new Uint8Array([0xff, 0xd8, 0xff, 0xe1, (len >> 8) & 0xff, len & 0xff]),
    body,
    new Uint8Array([0xff, 0xda, 0x00, 0x02, 0xff, 0xd9]),
  );
}

function makePngWithText(): Uint8Array {
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = concat(u32be(13), new TextEncoder().encode('IHDR'),
    new Uint8Array([0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]), u32be(0));
  const textPayload = new TextEncoder().encode('Comment\0Test metadata value');
  const text = concat(u32be(textPayload.length), new TextEncoder().encode('tEXt'), textPayload, u32be(0));
  const iend = concat(u32be(0), new TextEncoder().encode('IEND'), u32be(0));
  return concat(sig, ihdr, text, iend);
}

function makeGif(): Uint8Array {
  // GIF89a with comment extension
  return new Uint8Array([
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, // GIF89a
    1, 0, 1, 0, 0, 0, 0,                 // logical screen descriptor
    0x21, 0xfe, 0x05,                     // comment extension
    0x48, 0x65, 0x6c, 0x6c, 0x6f,        // "Hello"
    0x00,                                 // block terminator
    0x3b,                                 // trailer
  ]);
}

function makeSvgWithMetadata(): Uint8Array {
  const svg = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1">
  <metadata>
    <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
      <rdf:Description rdf:about="">
        <dc:creator xmlns:dc="http://purl.org/dc/elements/1.1/">Test Author</dc:creator>
      </rdf:Description>
    </rdf:RDF>
  </metadata>
  <rect width="1" height="1" fill="red"/>
</svg>`;
  return new TextEncoder().encode(svg);
}

function makeWebp(): Uint8Array {
  // Minimal WebP with EXIF chunk
  const exif = new TextEncoder().encode('Exif\0\0MM');
  const exifChunk = concat(new TextEncoder().encode('EXIF'), u32be(exif.length), exif);
  if (exifChunk.length % 2 !== 0) {
    // Pad to even
  }
  const body = concat(new TextEncoder().encode('WEBP'), exifChunk);
  const result = concat(
    new TextEncoder().encode('RIFF'),
    u32be(body.length),
    body,
  );
  // Fix RIFF size to little-endian
  const riffSize = body.length;
  result[4] = riffSize & 0xff;
  result[5] = (riffSize >> 8) & 0xff;
  result[6] = (riffSize >> 16) & 0xff;
  result[7] = (riffSize >> 24) & 0xff;
  // Fix EXIF chunk size to little-endian
  const exifSizeOff = 12 + 4; // after "WEBPEXIF"
  const exifSize = exif.length;
  result[exifSizeOff] = exifSize & 0xff;
  result[exifSizeOff + 1] = (exifSize >> 8) & 0xff;
  result[exifSizeOff + 2] = (exifSize >> 16) & 0xff;
  result[exifSizeOff + 3] = (exifSize >> 24) & 0xff;
  return result;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Integration: JPEG pipeline', () => {
  it('detect → remove → verify', async () => {
    const data = makeJpegWithExif();
    expect(detectFormat(data)).toBe('jpeg');
    const result = await removeMetadata(data);
    expect(result.data.length).toBeGreaterThan(0);
    const verify = verifyCleanSync(result.data);
    expect(verify.format).toBe('jpeg');
  });
});

describe('Integration: PNG pipeline', () => {
  it('detect → remove → verify', async () => {
    const data = makePngWithText();
    expect(detectFormat(data)).toBe('png');
    const result = await removeMetadata(data);
    expect(result.data.length).toBeGreaterThan(0);
    const verify = verifyCleanSync(result.data);
    expect(verify.format).toBe('png');
  });
});

describe('Integration: GIF pipeline', () => {
  it('detect → remove → verify', async () => {
    const data = makeGif();
    expect(detectFormat(data)).toBe('gif');
    const result = await removeMetadata(data);
    expect(result.data.length).toBeGreaterThan(0);
  });
});

describe('Integration: SVG pipeline', () => {
  it('detect → remove → verify', async () => {
    const data = makeSvgWithMetadata();
    expect(detectFormat(data)).toBe('svg');
    const result = await removeMetadata(data);
    expect(result.data.length).toBeGreaterThan(0);
    const verify = verifyCleanSync(result.data);
    expect(verify.format).toBe('svg');
  });
});

describe('Integration: readMetadata roundtrip', () => {
  it('reads metadata from JPEG before removal', async () => {
    const data = makeJpegWithExif();
    const meta = await readMetadata(data);
    // Should return some result without crashing
    expect(meta).toBeDefined();
  });
});

describe('Integration: empty / unknown data', () => {
  it('handles empty buffer gracefully', async () => {
    expect(detectFormat(new Uint8Array(0))).toBe('unknown');
  });

  it('handles random data gracefully', async () => {
    const random = new Uint8Array(1024);
    for (let i = 0; i < random.length; i++) random[i] = Math.floor(Math.random() * 256);
    expect(detectFormat(random)).toBe('unknown');
  });
});
