/**
 * Tests for src/binary/ utilities
 *
 * Covers buffer.ts, crc32.ts, dataview.ts, normalize.ts, and tiff.ts
 */

import { describe, it, expect } from 'vitest';
import {
  startsWith,
  concat,
  indexOf,
  matchesAt,
  fromAscii,
  toAscii,
} from '../src/binary/buffer.js';
import { crc32, crc32Png } from '../src/binary/crc32.js';
import {
  readUint16BE,
  readUint16LE,
  readUint32BE,
  readUint32LE,
  writeUint16BE,
  writeUint16LE,
  writeUint32BE,
  writeUint32LE,
  readUint16,
  readUint32,
  writeUint16,
  writeUint32,
} from '../src/binary/dataview.js';
import { normalizeInput } from '../src/binary/normalize.js';
import { parseTiffHeader, readOrientation } from '../src/binary/tiff.js';

// ── buffer.ts ─────────────────────────────────────────────────────────────────

describe('buffer.ts', () => {
  describe('startsWith', () => {
    it('returns true when data starts with pattern', () => {
      const data = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
      expect(startsWith(data, [0xff, 0xd8])).toBe(true);
    });

    it('returns false when data does not start with pattern', () => {
      const data = new Uint8Array([0x89, 0x50]);
      expect(startsWith(data, [0xff, 0xd8])).toBe(false);
    });

    it('returns false when data is shorter than pattern', () => {
      const data = new Uint8Array([0xff]);
      expect(startsWith(data, [0xff, 0xd8])).toBe(false);
    });

    it('returns true for empty pattern', () => {
      const data = new Uint8Array([0x01]);
      expect(startsWith(data, [])).toBe(true);
    });

    it('accepts Uint8Array as pattern', () => {
      const data = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
      expect(startsWith(data, new Uint8Array([0x89, 0x50]))).toBe(true);
    });
  });

  describe('concat', () => {
    it('concatenates two arrays', () => {
      const a = new Uint8Array([1, 2]);
      const b = new Uint8Array([3, 4]);
      const result = concat(a, b);
      expect(Array.from(result)).toEqual([1, 2, 3, 4]);
    });

    it('concatenates multiple arrays', () => {
      const a = new Uint8Array([1]);
      const b = new Uint8Array([2]);
      const c = new Uint8Array([3]);
      expect(Array.from(concat(a, b, c))).toEqual([1, 2, 3]);
    });

    it('handles empty arrays', () => {
      const a = new Uint8Array(0);
      const b = new Uint8Array([1, 2]);
      expect(Array.from(concat(a, b))).toEqual([1, 2]);
    });

    it('returns empty array when no arguments', () => {
      expect(concat().length).toBe(0);
    });
  });

  describe('indexOf', () => {
    it('finds pattern at the start', () => {
      const data = new Uint8Array([0xab, 0xcd, 0xef]);
      expect(indexOf(data, [0xab, 0xcd])).toBe(0);
    });

    it('finds pattern in the middle', () => {
      const data = new Uint8Array([0x00, 0xab, 0xcd, 0x00]);
      expect(indexOf(data, [0xab, 0xcd])).toBe(1);
    });

    it('returns -1 when pattern is not found', () => {
      const data = new Uint8Array([0x00, 0x01, 0x02]);
      expect(indexOf(data, [0xff])).toBe(-1);
    });

    it('respects startOffset', () => {
      const data = new Uint8Array([0xab, 0xab, 0xab]);
      expect(indexOf(data, [0xab], 1)).toBe(1);
    });

    it('returns -1 for empty data', () => {
      expect(indexOf(new Uint8Array(0), [0xab])).toBe(-1);
    });
  });

  describe('matchesAt', () => {
    it('returns true when bytes match at offset', () => {
      const data = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
      expect(matchesAt(data, 1, [0x01, 0x02])).toBe(true);
    });

    it('returns false when bytes do not match', () => {
      const data = new Uint8Array([0x00, 0x01, 0x02]);
      expect(matchesAt(data, 1, [0x02, 0x03])).toBe(false);
    });

    it('returns false when matching would exceed data length', () => {
      const data = new Uint8Array([0x00, 0x01]);
      expect(matchesAt(data, 1, [0x01, 0x02])).toBe(false);
    });
  });

  describe('fromAscii / toAscii', () => {
    it('round-trips ASCII text', () => {
      const text = 'Hello, World!';
      const arr = fromAscii(text);
      expect(toAscii(arr)).toBe(text);
    });

    it('converts with offset and length', () => {
      const arr = fromAscii('ABCDEF');
      expect(toAscii(arr, 2, 3)).toBe('CDE');
    });

    it('handles empty string', () => {
      const arr = fromAscii('');
      expect(arr.length).toBe(0);
      expect(toAscii(arr)).toBe('');
    });
  });
});

// ── crc32.ts ──────────────────────────────────────────────────────────────────

describe('crc32.ts', () => {
  describe('crc32', () => {
    it('computes correct CRC-32 for known input', () => {
      // CRC-32 of "IEND" = 0xAE426082
      const data = fromAscii('IEND');
      const result = crc32(data);
      expect(result).toBe(0xae426082);
    });

    it('returns consistent results', () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      expect(crc32(data)).toBe(crc32(data));
    });
  });

  describe('crc32Png', () => {
    it('produces CRC over type + data', () => {
      const type = fromAscii('IEND');
      const data = new Uint8Array(0);
      const crc = crc32Png(type, data);
      // Should equal crc32 of just "IEND" since data is empty
      expect(crc).toBe(crc32(type));
    });
  });
});

// ── dataview.ts ───────────────────────────────────────────────────────────────

describe('dataview.ts', () => {
  describe('16-bit reads', () => {
    it('readUint16BE reads big-endian', () => {
      const data = new Uint8Array([0x01, 0x02]);
      expect(readUint16BE(data, 0)).toBe(0x0102);
    });

    it('readUint16LE reads little-endian', () => {
      const data = new Uint8Array([0x02, 0x01]);
      expect(readUint16LE(data, 0)).toBe(0x0102);
    });

    it('readUint16 with littleEndian flag', () => {
      const data = new Uint8Array([0x02, 0x01]);
      expect(readUint16(data, 0, true)).toBe(0x0102);
      expect(readUint16(data, 0, false)).toBe(0x0201);
    });
  });

  describe('32-bit reads', () => {
    it('readUint32BE reads big-endian', () => {
      const data = new Uint8Array([0x00, 0x01, 0x00, 0x00]);
      expect(readUint32BE(data, 0)).toBe(0x00010000);
    });

    it('readUint32LE reads little-endian', () => {
      const data = new Uint8Array([0x00, 0x00, 0x01, 0x00]);
      expect(readUint32LE(data, 0)).toBe(0x00010000);
    });

    it('readUint32 with littleEndian flag', () => {
      const data = new Uint8Array([0x78, 0x56, 0x34, 0x12]);
      expect(readUint32(data, 0, true)).toBe(0x12345678);
      expect(readUint32(data, 0, false)).toBe(0x78563412);
    });
  });

  describe('16-bit writes', () => {
    it('writeUint16BE writes big-endian', () => {
      const data = new Uint8Array(2);
      writeUint16BE(data, 0, 0x0102);
      expect(Array.from(data)).toEqual([0x01, 0x02]);
    });

    it('writeUint16LE writes little-endian', () => {
      const data = new Uint8Array(2);
      writeUint16LE(data, 0, 0x0102);
      expect(Array.from(data)).toEqual([0x02, 0x01]);
    });

    it('writeUint16 with littleEndian flag', () => {
      const data = new Uint8Array(2);
      writeUint16(data, 0, 0xaabb, true);
      expect(Array.from(data)).toEqual([0xbb, 0xaa]);
    });
  });

  describe('32-bit writes', () => {
    it('writeUint32BE writes big-endian', () => {
      const data = new Uint8Array(4);
      writeUint32BE(data, 0, 0x12345678);
      expect(Array.from(data)).toEqual([0x12, 0x34, 0x56, 0x78]);
    });

    it('writeUint32LE writes little-endian', () => {
      const data = new Uint8Array(4);
      writeUint32LE(data, 0, 0x12345678);
      expect(Array.from(data)).toEqual([0x78, 0x56, 0x34, 0x12]);
    });

    it('writeUint32 with littleEndian flag', () => {
      const data = new Uint8Array(4);
      writeUint32(data, 0, 0xdeadbeef, false);
      expect(Array.from(data)).toEqual([0xde, 0xad, 0xbe, 0xef]);
    });
  });

  describe('overflow protection', () => {
    it('throws on out-of-bounds read', () => {
      const data = new Uint8Array(1);
      expect(() => readUint16BE(data, 0)).toThrow();
    });

    it('throws on out-of-bounds write', () => {
      const data = new Uint8Array(1);
      expect(() => writeUint32BE(data, 0, 0)).toThrow();
    });
  });
});

// ── normalize.ts ──────────────────────────────────────────────────────────────

describe('normalizeInput', () => {
  it('passes through Uint8Array unchanged', () => {
    const input = new Uint8Array([1, 2, 3]);
    const result = normalizeInput(input);
    expect(result).toBe(input);
  });

  it('wraps ArrayBuffer as Uint8Array', () => {
    const buf = new ArrayBuffer(4);
    new Uint8Array(buf).set([10, 20, 30, 40]);
    const result = normalizeInput(buf);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(Array.from(result)).toEqual([10, 20, 30, 40]);
  });

  it('decodes valid data URL', () => {
    // data:image/jpeg;base64,/9j/ → [0xFF, 0xD8, 0x8F]
    const b64 = Buffer.from(new Uint8Array([0xff, 0xd8, 0xff])).toString('base64');
    const url = `data:image/jpeg;base64,${b64}`;
    const result = normalizeInput(url);
    expect(Array.from(result)).toEqual([0xff, 0xd8, 0xff]);
  });

  it('accepts image/png data URL', () => {
    const b64 = Buffer.from(new Uint8Array([0x89, 0x50])).toString('base64');
    const url = `data:image/png;base64,${b64}`;
    expect(() => normalizeInput(url)).not.toThrow();
  });

  it('rejects data URL with unsupported MIME type', () => {
    const url = 'data:text/html;base64,PGh0bWw+';
    expect(() => normalizeInput(url)).toThrow();
  });

  it('rejects data URL without base64 encoding', () => {
    const url = 'data:image/jpeg,raw-data-here';
    expect(() => normalizeInput(url)).toThrow();
  });

  it('throws for non-data-URL string', () => {
    expect(() => normalizeInput('not a data url')).toThrow();
  });
});

// ── tiff.ts ───────────────────────────────────────────────────────────────────

describe('tiff.ts', () => {
  describe('parseTiffHeader', () => {
    it('parses little-endian TIFF header', () => {
      // II (LE) + 0x002A + IFD offset=8
      const data = new Uint8Array([
        0x49, 0x49, 0x2a, 0x00,
        0x08, 0x00, 0x00, 0x00,
      ]);
      const header = parseTiffHeader(data);
      expect(header).not.toBeNull();
      expect(header!.littleEndian).toBe(true);
      expect(header!.ifd0Offset).toBe(8);
    });

    it('parses big-endian TIFF header', () => {
      // MM (BE) + 0x002A + IFD offset=8
      const data = new Uint8Array([
        0x4d, 0x4d, 0x00, 0x2a,
        0x00, 0x00, 0x00, 0x08,
      ]);
      const header = parseTiffHeader(data);
      expect(header).not.toBeNull();
      expect(header!.littleEndian).toBe(false);
      expect(header!.ifd0Offset).toBe(8);
    });

    it('parses with custom offset', () => {
      const data = new Uint8Array(16);
      // Put TIFF header at offset 4
      data[4] = 0x49; data[5] = 0x49; data[6] = 0x2a; data[7] = 0x00;
      data[8] = 0x08; data[9] = 0x00; data[10] = 0x00; data[11] = 0x00;
      const header = parseTiffHeader(data, 4);
      expect(header).not.toBeNull();
      expect(header!.littleEndian).toBe(true);
    });

    it('returns null for invalid data', () => {
      expect(parseTiffHeader(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]))).toBeNull();
    });

    it('returns null for data too short', () => {
      expect(parseTiffHeader(new Uint8Array([0x49, 0x49]))).toBeNull();
    });
  });

  describe('readOrientation', () => {
    it('returns null for data without orientation tag', () => {
      // Valid TIFF header but 0 IFD entries
      const data = new Uint8Array([
        0x49, 0x49, 0x2a, 0x00,  // II + magic
        0x08, 0x00, 0x00, 0x00,  // IFD offset = 8
        0x00, 0x00,              // 0 entries
        0x00, 0x00, 0x00, 0x00,  // next IFD = 0
      ]);
      expect(readOrientation(data)).toBeNull();
    });

    it('reads orientation from IFD entry', () => {
      // TIFF LE header + 1 IFD entry (tag 0x0112 = orientation, type SHORT, count 1, value 6)
      const data = new Uint8Array([
        0x49, 0x49, 0x2a, 0x00,  // II + magic
        0x08, 0x00, 0x00, 0x00,  // IFD offset = 8
        0x01, 0x00,              // 1 entry
        // Entry: tag=0x0112, type=3 (SHORT), count=1, value=6
        0x12, 0x01,              // tag (LE)
        0x03, 0x00,              // type (LE)
        0x01, 0x00, 0x00, 0x00,  // count (LE)
        0x06, 0x00, 0x00, 0x00,  // value (LE)
        0x00, 0x00, 0x00, 0x00,  // next IFD = 0
      ]);
      expect(readOrientation(data)).toBe(6);
    });
  });
});
