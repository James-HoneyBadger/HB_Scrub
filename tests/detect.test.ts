/**
 * Tests for src/detect.ts
 *
 * Covers detectFormat() and getMimeType() for all supported formats,
 * including edge cases like short data, ISOBMFF brand scanning, and
 * TIFF sub-format detection.
 */

import { describe, it, expect } from 'vitest';
import { detectFormat, getMimeType } from '../src/detect.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a Uint8Array from mixed bytes and ASCII strings. */
function bytes(...parts: (number | number[] | string)[]): Uint8Array {
  const flat: number[] = [];
  for (const p of parts) {
    if (typeof p === 'number') flat.push(p);
    else if (typeof p === 'string') {
      for (let i = 0; i < p.length; i++) flat.push(p.charCodeAt(i));
    } else flat.push(...p);
  }
  return new Uint8Array(flat);
}

/** Build a minimal ISOBMFF ftyp box with the given 4-char brand. */
function ftyp(brand: string, compatBrands: string[] = []): Uint8Array {
  const brandBytes = bytes(brand);
  const compatBytes = compatBrands.map(b => bytes(b));
  const totalCompat = compatBytes.reduce((sum, b) => sum + b.length, 0);
  const size = 8 + 4 + 4 + totalCompat; // box header + brand + minor version + compat
  const arr = new Uint8Array(size);
  // Box size (big-endian)
  arr[0] = (size >> 24) & 0xff;
  arr[1] = (size >> 16) & 0xff;
  arr[2] = (size >> 8) & 0xff;
  arr[3] = size & 0xff;
  // "ftyp"
  arr[4] = 0x66; arr[5] = 0x74; arr[6] = 0x79; arr[7] = 0x70;
  // Major brand
  arr.set(brandBytes, 8);
  // Minor version = 0 (4 bytes, already zeroed)
  // Compatible brands
  let offset = 16;
  for (const cb of compatBytes) {
    arr.set(cb, offset);
    offset += cb.length;
  }
  return arr;
}

// ── detectFormat ──────────────────────────────────────────────────────────────

describe('detectFormat', () => {
  // Edge cases
  it('returns "unknown" for empty data', () => {
    expect(detectFormat(new Uint8Array(0))).toBe('unknown');
  });

  it('returns "unknown" for 1-byte data', () => {
    expect(detectFormat(new Uint8Array([0xff]))).toBe('unknown');
  });

  it('returns "unknown" for 2-byte data', () => {
    expect(detectFormat(new Uint8Array([0xff, 0xd8]))).toBe('unknown');
  });

  it('returns "unknown" for unrecognised bytes', () => {
    expect(detectFormat(new Uint8Array([0x00, 0x00, 0x00, 0x00]))).toBe('unknown');
  });

  // JPEG
  it('detects JPEG from FF D8 FF', () => {
    expect(detectFormat(bytes(0xff, 0xd8, 0xff, 0xd9))).toBe('jpeg');
  });

  // PNG
  it('detects PNG from 8-byte signature', () => {
    const png = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    expect(detectFormat(png)).toBe('png');
  });

  it('does not detect PNG from partial signature', () => {
    const partial = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a);
    expect(detectFormat(partial)).toBe('unknown');
  });

  // GIF
  it('detects GIF87a', () => {
    expect(detectFormat(bytes('GIF87a'))).toBe('gif');
  });

  it('detects GIF89a', () => {
    expect(detectFormat(bytes('GIF89a'))).toBe('gif');
  });

  // WebP
  it('detects WebP from RIFF + WEBP', () => {
    const webp = new Uint8Array(12);
    webp.set(bytes('RIFF'), 0);
    webp[4] = 0x00; webp[5] = 0x00; webp[6] = 0x00; webp[7] = 0x00; // size
    webp.set(bytes('WEBP'), 8);
    expect(detectFormat(webp)).toBe('webp');
  });

  it('does not detect WebP without WEBP marker', () => {
    const riffOnly = new Uint8Array(12);
    riffOnly.set(bytes('RIFF'), 0);
    riffOnly.set(bytes('AVIX'), 8); // AVI, not WebP
    expect(detectFormat(riffOnly)).toBe('unknown');
  });

  // PDF
  it('detects PDF from %PDF- header', () => {
    expect(detectFormat(bytes('%PDF-1.7'))).toBe('pdf');
  });

  // ISOBMFF — HEIC
  it('detects HEIC from ftyp heic brand', () => {
    expect(detectFormat(ftyp('heic'))).toBe('heic');
  });

  it('detects HEIC from ftyp mif1 brand', () => {
    expect(detectFormat(ftyp('mif1'))).toBe('heic');
  });

  // ISOBMFF — AVIF
  it('detects AVIF from ftyp avif brand', () => {
    expect(detectFormat(ftyp('avif'))).toBe('avif');
  });

  it('detects AVIF from ftyp avis brand', () => {
    expect(detectFormat(ftyp('avis'))).toBe('avif');
  });

  // ISOBMFF — MP4
  it('detects MP4 from ftyp isom brand', () => {
    expect(detectFormat(ftyp('isom'))).toBe('mp4');
  });

  it('detects MP4 from ftyp mp41 brand', () => {
    expect(detectFormat(ftyp('mp41'))).toBe('mp4');
  });

  // ISOBMFF — MOV
  it('detects MOV from ftyp qt   brand', () => {
    expect(detectFormat(ftyp('qt  '))).toBe('mov');
  });

  // ISOBMFF — compatible brand fallback
  it('detects AVIF from compatible brands when major brand is unknown', () => {
    expect(detectFormat(ftyp('xxxx', ['avif']))).toBe('avif');
  });

  // TIFF
  it('detects TIFF from little-endian header', () => {
    const tiff = new Uint8Array(8);
    tiff.set(bytes(0x49, 0x49, 0x2a, 0x00), 0);
    tiff[4] = 8; // IFD offset
    expect(detectFormat(tiff)).toBe('tiff');
  });

  it('detects TIFF from big-endian header', () => {
    const tiff = new Uint8Array(8);
    tiff.set(bytes(0x4d, 0x4d, 0x00, 0x2a), 0);
    tiff[7] = 8; // IFD offset
    expect(detectFormat(tiff)).toBe('tiff');
  });

  // SVG
  it('detects SVG from <svg tag with namespace', () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    expect(detectFormat(svg)).toBe('svg');
  });

  it('detects SVG from <?xml with <svg element', () => {
    const svg = new TextEncoder().encode('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>');
    expect(detectFormat(svg)).toBe('svg');
  });
});

// ── getMimeType ───────────────────────────────────────────────────────────────

describe('getMimeType', () => {
  it('returns correct MIME for jpeg', () => {
    expect(getMimeType('jpeg')).toBe('image/jpeg');
  });

  it('returns correct MIME for png', () => {
    expect(getMimeType('png')).toBe('image/png');
  });

  it('returns correct MIME for webp', () => {
    expect(getMimeType('webp')).toBe('image/webp');
  });

  it('returns correct MIME for gif', () => {
    expect(getMimeType('gif')).toBe('image/gif');
  });

  it('returns correct MIME for svg', () => {
    expect(getMimeType('svg')).toBe('image/svg+xml');
  });

  it('returns correct MIME for tiff', () => {
    expect(getMimeType('tiff')).toBe('image/tiff');
  });

  it('returns correct MIME for heic', () => {
    expect(getMimeType('heic')).toBe('image/heic');
  });

  it('returns correct MIME for avif', () => {
    expect(getMimeType('avif')).toBe('image/avif');
  });

  it('returns correct MIME for pdf', () => {
    expect(getMimeType('pdf')).toBe('application/pdf');
  });

  it('returns correct MIME for mp4', () => {
    expect(getMimeType('mp4')).toBe('video/mp4');
  });

  it('returns correct MIME for mov', () => {
    expect(getMimeType('mov')).toBe('video/quicktime');
  });

  it('returns application/octet-stream for unknown', () => {
    expect(getMimeType('unknown')).toBe('application/octet-stream');
  });
});
