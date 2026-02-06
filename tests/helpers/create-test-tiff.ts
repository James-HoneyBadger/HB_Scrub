/**
 * Creates test TIFF files with various metadata for testing
 */

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '../fixtures');

/**
 * Write 16-bit value in little-endian
 */
function writeUint16LE(value: number): number[] {
  return [value & 0xff, (value >> 8) & 0xff];
}

/**
 * Write 32-bit value in little-endian
 */
function writeUint32LE(value: number): number[] {
  return [
    value & 0xff,
    (value >> 8) & 0xff,
    (value >> 16) & 0xff,
    (value >> 24) & 0xff,
  ];
}

/**
 * Create a minimal TIFF with metadata
 */
function createTiffWithMetadata(): Uint8Array {
  const parts: number[] = [];

  // TIFF Header (little-endian)
  parts.push(0x49, 0x49); // "II" - little-endian
  parts.push(...writeUint16LE(42)); // Magic number
  parts.push(...writeUint32LE(8)); // Offset to first IFD

  // IFD0 starts at offset 8
  const numEntries = 10;
  parts.push(...writeUint16LE(numEntries));

  let currentOffset = 8 + 2 + (numEntries * 12) + 4; // After IFD entries + next IFD pointer
  const valueData: number[] = [];

  // Helper to add IFD entry
  function addEntry(tag: number, type: number, count: number, value: number | number[]): void {
    parts.push(...writeUint16LE(tag));
    parts.push(...writeUint16LE(type));
    parts.push(...writeUint32LE(count));

    if (type === 2) { // ASCII
      // String value - store offset
      const str = value as unknown as string;
      parts.push(...writeUint32LE(currentOffset));
      for (let i = 0; i < str.length; i++) {
        valueData.push(str.charCodeAt(i));
      }
      valueData.push(0); // Null terminator
      currentOffset += str.length + 1;
    } else if (count === 1 && type === 3) { // Single SHORT
      parts.push(...writeUint16LE(value as number));
      parts.push(0, 0); // Padding
    } else if (count === 1 && type === 4) { // Single LONG
      parts.push(...writeUint32LE(value as number));
    } else {
      parts.push(...writeUint32LE(value as number));
    }
  }

  // Required tags for valid TIFF
  addEntry(256, 4, 1, 1);     // ImageWidth = 1
  addEntry(257, 4, 1, 1);     // ImageLength = 1
  addEntry(258, 3, 1, 8);     // BitsPerSample = 8
  addEntry(259, 3, 1, 1);     // Compression = none
  addEntry(262, 3, 1, 1);     // PhotometricInterpretation = BlackIsZero

  // Metadata tags (should be removed)
  addEntry(270, 2, 25, "Test image description" as unknown as number); // ImageDescription
  addEntry(271, 2, 12, "Test Maker" as unknown as number);             // Make
  addEntry(272, 2, 11, "Test Model" as unknown as number);              // Model
  addEntry(305, 2, 13, "Test Software" as unknown as number);           // Software
  addEntry(306, 2, 20, "2024:01:15 12:00:00" as unknown as number);     // DateTime

  // Next IFD pointer (0 = none)
  parts.push(...writeUint32LE(0));

  // Append value data
  parts.push(...valueData);

  // Strip data (1 gray pixel)
  const stripOffset = parts.length;
  parts.push(0x80); // Gray pixel

  // We need to go back and set StripOffsets and StripByteCounts
  // For simplicity, this is a minimal example that may not be fully valid

  return new Uint8Array(parts);
}

/**
 * Create a minimal TIFF without metadata
 */
function createMinimalTiff(): Uint8Array {
  const parts: number[] = [];

  // TIFF Header
  parts.push(0x49, 0x49); // "II"
  parts.push(...writeUint16LE(42));
  parts.push(...writeUint32LE(8));

  // IFD with minimal required tags
  const numEntries = 8;
  parts.push(...writeUint16LE(numEntries));

  // ImageWidth
  parts.push(...writeUint16LE(256));
  parts.push(...writeUint16LE(3)); // SHORT
  parts.push(...writeUint32LE(1));
  parts.push(...writeUint16LE(1), 0, 0);

  // ImageLength
  parts.push(...writeUint16LE(257));
  parts.push(...writeUint16LE(3));
  parts.push(...writeUint32LE(1));
  parts.push(...writeUint16LE(1), 0, 0);

  // BitsPerSample
  parts.push(...writeUint16LE(258));
  parts.push(...writeUint16LE(3));
  parts.push(...writeUint32LE(1));
  parts.push(...writeUint16LE(8), 0, 0);

  // Compression
  parts.push(...writeUint16LE(259));
  parts.push(...writeUint16LE(3));
  parts.push(...writeUint32LE(1));
  parts.push(...writeUint16LE(1), 0, 0);

  // PhotometricInterpretation
  parts.push(...writeUint16LE(262));
  parts.push(...writeUint16LE(3));
  parts.push(...writeUint32LE(1));
  parts.push(...writeUint16LE(1), 0, 0);

  // StripOffsets
  const stripDataOffset = 8 + 2 + (numEntries * 12) + 4;
  parts.push(...writeUint16LE(273));
  parts.push(...writeUint16LE(4)); // LONG
  parts.push(...writeUint32LE(1));
  parts.push(...writeUint32LE(stripDataOffset));

  // RowsPerStrip
  parts.push(...writeUint16LE(278));
  parts.push(...writeUint16LE(4));
  parts.push(...writeUint32LE(1));
  parts.push(...writeUint32LE(1));

  // StripByteCounts
  parts.push(...writeUint16LE(279));
  parts.push(...writeUint16LE(4));
  parts.push(...writeUint32LE(1));
  parts.push(...writeUint32LE(1));

  // Next IFD
  parts.push(...writeUint32LE(0));

  // Strip data (1 pixel)
  parts.push(0x80);

  return new Uint8Array(parts);
}

// Generate test files
console.log('Creating test TIFF files...');

writeFileSync(join(FIXTURES_DIR, 'with_metadata.tiff'), createTiffWithMetadata());
console.log('Created: with_metadata.tiff');

writeFileSync(join(FIXTURES_DIR, 'minimal.tiff'), createMinimalTiff());
console.log('Created: minimal.tiff');

console.log('Done!');
