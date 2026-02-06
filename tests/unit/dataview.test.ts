import { describe, it, expect } from 'vitest';
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
} from '../../src/binary/dataview';
import { BufferOverflowError } from '../../src/errors';

describe('readUint16BE', () => {
  it('should read big-endian uint16', () => {
    const data = new Uint8Array([0x12, 0x34]);
    expect(readUint16BE(data, 0)).toBe(0x1234);
  });

  it('should throw on overflow', () => {
    const data = new Uint8Array([0x12]);
    expect(() => readUint16BE(data, 0)).toThrow(BufferOverflowError);
  });
});

describe('readUint16LE', () => {
  it('should read little-endian uint16', () => {
    const data = new Uint8Array([0x34, 0x12]);
    expect(readUint16LE(data, 0)).toBe(0x1234);
  });
});

describe('readUint32BE', () => {
  it('should read big-endian uint32', () => {
    const data = new Uint8Array([0x12, 0x34, 0x56, 0x78]);
    expect(readUint32BE(data, 0)).toBe(0x12345678);
  });

  it('should handle large values correctly', () => {
    const data = new Uint8Array([0xff, 0xff, 0xff, 0xff]);
    expect(readUint32BE(data, 0)).toBe(0xffffffff);
  });
});

describe('readUint32LE', () => {
  it('should read little-endian uint32', () => {
    const data = new Uint8Array([0x78, 0x56, 0x34, 0x12]);
    expect(readUint32LE(data, 0)).toBe(0x12345678);
  });
});

describe('writeUint16BE', () => {
  it('should write big-endian uint16', () => {
    const data = new Uint8Array(4);
    writeUint16BE(data, 1, 0x1234);
    expect(data[1]).toBe(0x12);
    expect(data[2]).toBe(0x34);
  });
});

describe('writeUint16LE', () => {
  it('should write little-endian uint16', () => {
    const data = new Uint8Array(4);
    writeUint16LE(data, 1, 0x1234);
    expect(data[1]).toBe(0x34);
    expect(data[2]).toBe(0x12);
  });
});

describe('writeUint32BE', () => {
  it('should write big-endian uint32', () => {
    const data = new Uint8Array(6);
    writeUint32BE(data, 1, 0x12345678);
    expect(data[1]).toBe(0x12);
    expect(data[2]).toBe(0x34);
    expect(data[3]).toBe(0x56);
    expect(data[4]).toBe(0x78);
  });
});

describe('writeUint32LE', () => {
  it('should write little-endian uint32', () => {
    const data = new Uint8Array(6);
    writeUint32LE(data, 1, 0x12345678);
    expect(data[1]).toBe(0x78);
    expect(data[2]).toBe(0x56);
    expect(data[3]).toBe(0x34);
    expect(data[4]).toBe(0x12);
  });
});

describe('readUint16 with endianness flag', () => {
  it('should read based on endianness flag', () => {
    const data = new Uint8Array([0x12, 0x34]);
    expect(readUint16(data, 0, false)).toBe(0x1234); // big-endian
    expect(readUint16(data, 0, true)).toBe(0x3412); // little-endian
  });
});

describe('readUint32 with endianness flag', () => {
  it('should read based on endianness flag', () => {
    const data = new Uint8Array([0x12, 0x34, 0x56, 0x78]);
    expect(readUint32(data, 0, false)).toBe(0x12345678); // big-endian
    expect(readUint32(data, 0, true)).toBe(0x78563412); // little-endian
  });
});
