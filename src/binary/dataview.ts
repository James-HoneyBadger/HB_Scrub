import { BufferOverflowError } from '../errors.js';

/**
 * Read an unsigned 16-bit integer (big-endian)
 */
export function readUint16BE(data: Uint8Array, offset: number): number {
  if (offset + 2 > data.length) {
    throw new BufferOverflowError(offset + 2, data.length);
  }
  return (data[offset]! << 8) | data[offset + 1]!;
}

/**
 * Read an unsigned 16-bit integer (little-endian)
 */
export function readUint16LE(data: Uint8Array, offset: number): number {
  if (offset + 2 > data.length) {
    throw new BufferOverflowError(offset + 2, data.length);
  }
  return data[offset]! | (data[offset + 1]! << 8);
}

/**
 * Read an unsigned 32-bit integer (big-endian)
 */
export function readUint32BE(data: Uint8Array, offset: number): number {
  if (offset + 4 > data.length) {
    throw new BufferOverflowError(offset + 4, data.length);
  }
  return (
    ((data[offset]! << 24) >>> 0) +
    (data[offset + 1]! << 16) +
    (data[offset + 2]! << 8) +
    data[offset + 3]!
  );
}

/**
 * Read an unsigned 32-bit integer (little-endian)
 */
export function readUint32LE(data: Uint8Array, offset: number): number {
  if (offset + 4 > data.length) {
    throw new BufferOverflowError(offset + 4, data.length);
  }
  return (
    data[offset]! +
    (data[offset + 1]! << 8) +
    (data[offset + 2]! << 16) +
    ((data[offset + 3]! << 24) >>> 0)
  );
}

/**
 * Write an unsigned 16-bit integer (big-endian)
 */
export function writeUint16BE(data: Uint8Array, offset: number, value: number): void {
  if (offset + 2 > data.length) {
    throw new BufferOverflowError(offset + 2, data.length);
  }
  data[offset] = (value >> 8) & 0xff;
  data[offset + 1] = value & 0xff;
}

/**
 * Write an unsigned 16-bit integer (little-endian)
 */
export function writeUint16LE(data: Uint8Array, offset: number, value: number): void {
  if (offset + 2 > data.length) {
    throw new BufferOverflowError(offset + 2, data.length);
  }
  data[offset] = value & 0xff;
  data[offset + 1] = (value >> 8) & 0xff;
}

/**
 * Write an unsigned 32-bit integer (big-endian)
 */
export function writeUint32BE(data: Uint8Array, offset: number, value: number): void {
  if (offset + 4 > data.length) {
    throw new BufferOverflowError(offset + 4, data.length);
  }
  data[offset] = (value >>> 24) & 0xff;
  data[offset + 1] = (value >> 16) & 0xff;
  data[offset + 2] = (value >> 8) & 0xff;
  data[offset + 3] = value & 0xff;
}

/**
 * Write an unsigned 32-bit integer (little-endian)
 */
export function writeUint32LE(data: Uint8Array, offset: number, value: number): void {
  if (offset + 4 > data.length) {
    throw new BufferOverflowError(offset + 4, data.length);
  }
  data[offset] = value & 0xff;
  data[offset + 1] = (value >> 8) & 0xff;
  data[offset + 2] = (value >> 16) & 0xff;
  data[offset + 3] = (value >>> 24) & 0xff;
}

/**
 * Read 16-bit integer with configurable endianness
 */
export function readUint16(data: Uint8Array, offset: number, littleEndian: boolean): number {
  return littleEndian ? readUint16LE(data, offset) : readUint16BE(data, offset);
}

/**
 * Read 32-bit integer with configurable endianness
 */
export function readUint32(data: Uint8Array, offset: number, littleEndian: boolean): number {
  return littleEndian ? readUint32LE(data, offset) : readUint32BE(data, offset);
}

/**
 * Write 16-bit integer with configurable endianness
 */
export function writeUint16(
  data: Uint8Array,
  offset: number,
  value: number,
  littleEndian: boolean
): void {
  if (littleEndian) {
    writeUint16LE(data, offset, value);
  } else {
    writeUint16BE(data, offset, value);
  }
}

/**
 * Write 32-bit integer with configurable endianness
 */
export function writeUint32(
  data: Uint8Array,
  offset: number,
  value: number,
  littleEndian: boolean
): void {
  if (littleEndian) {
    writeUint32LE(data, offset, value);
  } else {
    writeUint32BE(data, offset, value);
  }
}
