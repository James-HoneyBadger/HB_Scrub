import { describe, it, expect } from 'vitest';
import {
  startsWith,
  concat,
  indexOf,
  matchesAt,
  fromAscii,
  toAscii,
} from '../../src/binary/buffer';

describe('startsWith', () => {
  it('should return true when data starts with pattern', () => {
    const data = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    const pattern = new Uint8Array([0xff, 0xd8, 0xff]);
    expect(startsWith(data, pattern)).toBe(true);
  });

  it('should return false when data does not start with pattern', () => {
    const data = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    const pattern = new Uint8Array([0x89, 0x50, 0x4e]);
    expect(startsWith(data, pattern)).toBe(false);
  });

  it('should work with number array pattern', () => {
    const data = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    expect(startsWith(data, [0xff, 0xd8])).toBe(true);
  });
});

describe('concat', () => {
  it('should concatenate multiple arrays', () => {
    const a = new Uint8Array([1, 2]);
    const b = new Uint8Array([3, 4]);
    const c = new Uint8Array([5]);

    const result = concat(a, b, c);
    expect(Array.from(result)).toEqual([1, 2, 3, 4, 5]);
  });

  it('should handle empty arrays', () => {
    const a = new Uint8Array([1, 2]);
    const b = new Uint8Array([]);

    const result = concat(a, b);
    expect(Array.from(result)).toEqual([1, 2]);
  });
});

describe('indexOf', () => {
  it('should find pattern in data', () => {
    const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const pattern = new Uint8Array([4, 5, 6]);
    expect(indexOf(data, pattern)).toBe(3);
  });

  it('should return -1 when pattern not found', () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const pattern = new Uint8Array([6, 7]);
    expect(indexOf(data, pattern)).toBe(-1);
  });

  it('should respect start offset', () => {
    const data = new Uint8Array([1, 2, 1, 2, 3]);
    const pattern = new Uint8Array([1, 2]);
    expect(indexOf(data, pattern, 1)).toBe(2);
  });
});

describe('matchesAt', () => {
  it('should return true when pattern matches at offset', () => {
    const data = new Uint8Array([0, 0, 0xff, 0xd8, 0xff]);
    expect(matchesAt(data, 2, [0xff, 0xd8, 0xff])).toBe(true);
  });

  it('should return false when pattern does not match', () => {
    const data = new Uint8Array([0, 0, 0xff, 0xd8, 0xff]);
    expect(matchesAt(data, 2, [0xff, 0xd9])).toBe(false);
  });

  it('should return false when offset is out of bounds', () => {
    const data = new Uint8Array([1, 2, 3]);
    expect(matchesAt(data, 10, [1, 2])).toBe(false);
  });
});

describe('fromAscii', () => {
  it('should convert ASCII string to Uint8Array', () => {
    const result = fromAscii('JFIF');
    expect(Array.from(result)).toEqual([74, 70, 73, 70]);
  });
});

describe('toAscii', () => {
  it('should convert Uint8Array to ASCII string', () => {
    const data = new Uint8Array([74, 70, 73, 70]);
    expect(toAscii(data)).toBe('JFIF');
  });

  it('should respect offset and length', () => {
    const data = new Uint8Array([0, 0, 74, 70, 73, 70, 0, 0]);
    expect(toAscii(data, 2, 4)).toBe('JFIF');
  });
});
