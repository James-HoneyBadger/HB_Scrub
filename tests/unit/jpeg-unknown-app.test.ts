import { describe, it, expect } from 'vitest';
import { jpeg } from '../../src/formats/jpeg';
import * as buffer from '../../src/binary/buffer';
import * as dataview from '../../src/binary/dataview';

/**
 * Create a JPEG with an unknown APP3 segment (potential metadata leak)
 */
function createJpegWithUnknownApp(): Uint8Array {
  const parts: Uint8Array[] = [];

  // SOI
  parts.push(new Uint8Array([0xff, 0xd8]));

  // APP0 (JFIF) - should be kept
  const jfif = new Uint8Array([
    0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00,
    0x01, 0x00, 0x00,
  ]);
  parts.push(jfif);

  // APP3 (unknown vendor segment) - should be REMOVED
  const app3Data = buffer.fromAscii('VendorSecretData12345');
  const app3 = new Uint8Array(4 + app3Data.length);
  app3[0] = 0xff;
  app3[1] = 0xe3; // APP3
  dataview.writeUint16BE(app3, 2, app3Data.length + 2);
  app3.set(app3Data, 4);
  parts.push(app3);

  // DQT (quantization table, required) - should be kept
  const dqt = new Uint8Array([
    0xff, 0xdb, 0x00, 0x43, 0x00, ...new Array(64).fill(0x10),
  ]);
  parts.push(dqt);

  // SOF0 (start of frame) - should be kept
  const sof = new Uint8Array([
    0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00,
  ]);
  parts.push(sof);

  // SOS + minimal scan data + EOI
  const sos = new Uint8Array([
    0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x7b, 0xff, 0xd9,
  ]);
  parts.push(sos);

  return buffer.concat(...parts);
}

describe('JPEG unknown APP segment removal', () => {
  it('should remove unknown APP segments (e.g., APP3)', () => {
    const input = createJpegWithUnknownApp();
    const result = jpeg.remove(input);

    // Verify APP3 is gone
    const resultStr = buffer.toAscii(result);
    expect(resultStr).not.toContain('VendorSecretData');

    // Verify JFIF APP0 is still present
    expect(resultStr).toContain('JFIF');

    // Result should be smaller (APP3 removed)
    expect(result.length).toBeLessThan(input.length);
  });

  it('should keep APP0 (JFIF)', () => {
    const input = createJpegWithUnknownApp();
    const result = jpeg.remove(input);

    // Find APP0 marker
    let hasApp0 = false;
    for (let i = 0; i < result.length - 1; i++) {
      if (result[i] === 0xff && result[i + 1] === 0xe0) {
        hasApp0 = true;
        break;
      }
    }
    expect(hasApp0).toBe(true);
  });

  it('should produce valid JPEG output', () => {
    const input = createJpegWithUnknownApp();
    const result = jpeg.remove(input);

    // Starts with SOI
    expect(result[0]).toBe(0xff);
    expect(result[1]).toBe(0xd8);

    // Ends with EOI
    expect(result[result.length - 2]).toBe(0xff);
    expect(result[result.length - 1]).toBe(0xd9);
  });
});
