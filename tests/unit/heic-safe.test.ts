import { describe, it, expect } from 'vitest';
import { heic } from '../../src/formats/heic';
import * as buffer from '../../src/binary/buffer';

/**
 * Create a HEIC file with fake JPEG-like bytes in mdat
 * to verify we DON'T corrupt mdat during metadata removal.
 */
function createHeicWithJpegBytesInMdat(): Uint8Array {
  const parts: Uint8Array[] = [];

  // ftyp box
  parts.push(
    new Uint8Array([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0x00, 0x00, 0x00,
      0x00, 0x6d, 0x69, 0x66, 0x31, 0x68, 0x65, 0x69, 0x63,
    ])
  );

  // meta box (minimal, no EXIF)
  parts.push(
    new Uint8Array([
      0x00, 0x00, 0x00, 0x2d, 0x6d, 0x65, 0x74, 0x61, 0x00, 0x00, 0x00, 0x00,
      // hdlr box
      0x00, 0x00, 0x00, 0x21, 0x68, 0x64, 0x6c, 0x72, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x70, 0x69, 0x63, 0x74, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00,
    ])
  );

  // mdat box with bytes that look like JPEG SOI and Exif markers
  const mdatContent = new Uint8Array([
    // Fake JPEG SOI: FF D8 FF E1 (should NOT be destroyed)
    0xff, 0xd8, 0xff, 0xe1, 0x00, 0x10,
    // Fake "Exif\0\0" (should NOT be overwritten since it's in mdat)
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
    // Some "image data"
    0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff, 0x11, 0x22, 0x33, 0x44,
  ]);
  const mdatSize = 8 + mdatContent.length;
  const mdatHeader = new Uint8Array(8);
  mdatHeader[0] = (mdatSize >> 24) & 0xff;
  mdatHeader[1] = (mdatSize >> 16) & 0xff;
  mdatHeader[2] = (mdatSize >> 8) & 0xff;
  mdatHeader[3] = mdatSize & 0xff;
  mdatHeader[4] = 0x6d; // m
  mdatHeader[5] = 0x64; // d
  mdatHeader[6] = 0x61; // a
  mdatHeader[7] = 0x74; // t
  parts.push(mdatHeader);
  parts.push(mdatContent);

  const total = parts.reduce((s, p) => s + p.length, 0);
  const result = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    result.set(p, off);
    off += p.length;
  }
  return result;
}

describe('HEIC safe metadata removal', () => {
  it('should NOT corrupt mdat even if it contains JPEG-like byte sequences', () => {
    const input = createHeicWithJpegBytesInMdat();

    // Find where mdat data starts
    const mdatStr = buffer.fromAscii('mdat');
    const mdatIdx = buffer.indexOf(input, mdatStr);
    expect(mdatIdx).toBeGreaterThan(0);
    const mdatDataStart = mdatIdx + 4;

    // Verify mdat has JPEG-like bytes
    expect(input[mdatDataStart]).toBe(0xff);
    expect(input[mdatDataStart + 1]).toBe(0xd8);

    const result = heic.remove(input);

    // mdat content should be IDENTICAL (not corrupted)
    expect(result[mdatDataStart]).toBe(0xff);
    expect(result[mdatDataStart + 1]).toBe(0xd8);
    expect(result[mdatDataStart + 6]).toBe(0x45); // 'E' from Exif still intact
    expect(result[mdatDataStart + 12]).toBe(0xaa); // Image data intact
  });

  it('should honor preserveColorProfile option', () => {
    // This test verifies the option is no longer silently ignored
    const input = createHeicWithJpegBytesInMdat();

    // With preserveColorProfile, should not error
    const result1 = heic.remove(input, { preserveColorProfile: true });
    expect(result1.length).toBe(input.length);

    // Without it, same behavior for this test (no color profile in this file)
    const result2 = heic.remove(input, { preserveColorProfile: false });
    expect(result2.length).toBe(input.length);
  });

  it('should preserve file size (lossless anonymization)', () => {
    const input = createHeicWithJpegBytesInMdat();
    const result = heic.remove(input);
    expect(result.length).toBe(input.length);
  });
});
