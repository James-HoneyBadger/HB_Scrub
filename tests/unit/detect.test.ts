import { describe, it, expect } from 'vitest';
import { detectFormat, getMimeType } from '../../src/detect';

describe('detectFormat', () => {
  it('should detect JPEG format', () => {
    const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
    expect(detectFormat(jpegBytes)).toBe('jpeg');
  });

  it('should detect PNG format', () => {
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
    expect(detectFormat(pngBytes)).toBe('png');
  });

  it('should detect GIF87a format', () => {
    const gifBytes = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x37, 0x61, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00]);
    expect(detectFormat(gifBytes)).toBe('gif');
  });

  it('should detect GIF89a format', () => {
    const gifBytes = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00]);
    expect(detectFormat(gifBytes)).toBe('gif');
  });

  it('should detect WebP format', () => {
    // RIFF....WEBP
    const webpBytes = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, // RIFF
      0x00, 0x00, 0x00, 0x00, // size
      0x57, 0x45, 0x42, 0x50, // WEBP
    ]);
    expect(detectFormat(webpBytes)).toBe('webp');
  });

  it('should detect TIFF little-endian format', () => {
    const tiffBytes = new Uint8Array([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    expect(detectFormat(tiffBytes)).toBe('tiff');
  });

  it('should detect TIFF big-endian format', () => {
    const tiffBytes = new Uint8Array([0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, 0x00, 0x00, 0x00, 0x00]);
    expect(detectFormat(tiffBytes)).toBe('tiff');
  });

  it('should detect HEIC format', () => {
    // ftyp box with heic brand
    const heicBytes = new Uint8Array([
      0x00, 0x00, 0x00, 0x18, // size
      0x66, 0x74, 0x79, 0x70, // ftyp
      0x68, 0x65, 0x69, 0x63, // heic
      0x00, 0x00, 0x00, 0x00, // minor version
    ]);
    expect(detectFormat(heicBytes)).toBe('heic');
  });

  it('should return unknown for unrecognized format', () => {
    const randomBytes = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c]);
    expect(detectFormat(randomBytes)).toBe('unknown');
  });

  it('should return unknown for empty data', () => {
    const emptyBytes = new Uint8Array([]);
    expect(detectFormat(emptyBytes)).toBe('unknown');
  });

  it('should return unknown for data too small (< 3 bytes)', () => {
    const smallBytes = new Uint8Array([0xff, 0xd8]);
    expect(detectFormat(smallBytes)).toBe('unknown');
  });

  it('should detect JPEG from just 3 bytes (FF D8 FF)', () => {
    const minJpeg = new Uint8Array([0xff, 0xd8, 0xff]);
    expect(detectFormat(minJpeg)).toBe('jpeg');
  });
});

describe('getMimeType', () => {
  it('should return correct MIME types', () => {
    expect(getMimeType('jpeg')).toBe('image/jpeg');
    expect(getMimeType('png')).toBe('image/png');
    expect(getMimeType('webp')).toBe('image/webp');
    expect(getMimeType('gif')).toBe('image/gif');
    expect(getMimeType('svg')).toBe('image/svg+xml');
    expect(getMimeType('tiff')).toBe('image/tiff');
    expect(getMimeType('heic')).toBe('image/heic');
    expect(getMimeType('unknown')).toBe('application/octet-stream');
  });
});
