import { describe, it, expect } from 'vitest';
import { tiff } from '../../src/formats/tiff';
import * as dataview from '../../src/binary/dataview';

/**
 * Create a TIFF with strip data and metadata to verify in-place modification
 * preserves strip offsets and secondary IFDs.
 */
function createTiffWithStripData(): Uint8Array {
  const parts: number[] = [];

  // TIFF Header (little-endian)
  parts.push(0x49, 0x49); // "II"
  parts.push(0x2a, 0x00); // Magic
  parts.push(0x08, 0x00, 0x00, 0x00); // IFD0 offset = 8

  // IFD0 at offset 8
  const numEntries = 8;
  parts.push(numEntries & 0xff, (numEntries >> 8) & 0xff);

  const ifdStart = 8;
  const ifdSize = 2 + numEntries * 12 + 4;
  const valuesStart = ifdStart + ifdSize;

  // Calculate positions
  const descStr = 'Secret description\0';
  const softwareStr = 'TestSoftware\0';
  const stripDataOffset = valuesStart + descStr.length + softwareStr.length;

  let pos = 10; // After count

  // Tag 256: ImageWidth = 2 (SHORT inline)
  writeEntry(parts, 256, 3, 1, [2, 0, 0, 0]);
  // Tag 257: ImageLength = 2 (SHORT inline)
  writeEntry(parts, 257, 3, 1, [2, 0, 0, 0]);
  // Tag 258: BitsPerSample = 8 (SHORT inline)
  writeEntry(parts, 258, 3, 1, [8, 0, 0, 0]);
  // Tag 259: Compression = 1 (SHORT inline)
  writeEntry(parts, 259, 3, 1, [1, 0, 0, 0]);
  // Tag 262: PhotometricInterpretation = 1 (SHORT inline)
  writeEntry(parts, 262, 3, 1, [1, 0, 0, 0]);

  // Tag 270: ImageDescription (ASCII, external) - METADATA TO REMOVE
  const descOffset = valuesStart;
  writeEntry(parts, 270, 2, descStr.length, uint32LE(descOffset));

  // Tag 273: StripOffsets = stripDataOffset (LONG inline)
  writeEntry(parts, 273, 4, 1, uint32LE(stripDataOffset));

  // Tag 279: StripByteCounts = 4 (LONG inline)
  writeEntry(parts, 279, 4, 1, uint32LE(4));

  // Next IFD offset = 0
  parts.push(0, 0, 0, 0);

  // Value data: description string
  for (let i = 0; i < descStr.length; i++) {
    parts.push(descStr.charCodeAt(i));
  }

  // Value data: software string (unused by IFD but part of layout)
  for (let i = 0; i < softwareStr.length; i++) {
    parts.push(softwareStr.charCodeAt(i));
  }

  // Strip data (4 pixels: 0xAA, 0xBB, 0xCC, 0xDD)
  parts.push(0xaa, 0xbb, 0xcc, 0xdd);

  return new Uint8Array(parts);
}

function writeEntry(parts: number[], tag: number, type: number, count: number, value: number[]) {
  parts.push(tag & 0xff, (tag >> 8) & 0xff);
  parts.push(type & 0xff, (type >> 8) & 0xff);
  parts.push(count & 0xff, (count >> 8) & 0xff, (count >> 16) & 0xff, (count >> 24) & 0xff);
  parts.push(...value);
}

function uint32LE(val: number): number[] {
  return [val & 0xff, (val >> 8) & 0xff, (val >> 16) & 0xff, (val >> 24) & 0xff];
}

describe('TIFF in-place modification', () => {
  it('should preserve strip data at original offsets', () => {
    const input = createTiffWithStripData();

    // Verify input has the strip data
    const stripOffset = dataview.readUint32LE(input, 8 + 2 + 6 * 12 + 8); // StripOffsets entry value
    expect(input[stripOffset]).toBe(0xaa);
    expect(input[stripOffset + 1]).toBe(0xbb);
    expect(input[stripOffset + 2]).toBe(0xcc);
    expect(input[stripOffset + 3]).toBe(0xdd);

    const result = tiff.remove(input);

    // Strip data must still be at the same offset with same content
    expect(result[stripOffset]).toBe(0xaa);
    expect(result[stripOffset + 1]).toBe(0xbb);
    expect(result[stripOffset + 2]).toBe(0xcc);
    expect(result[stripOffset + 3]).toBe(0xdd);

    // Output StripOffsets IFD entry must still point to the same offset
    const header = tiff.parseHeader(result);
    const ifd = tiff.parseIfd(result, header.ifdOffset, header.littleEndian);
    const stripOffsetsEntry = ifd.entries.find(e => e.tag === 273);
    expect(stripOffsetsEntry).toBeDefined();
    expect(stripOffsetsEntry!.valueOffset).toBe(stripOffset);
  });

  it('should zero out removed metadata data', () => {
    const input = createTiffWithStripData();

    // Find where the description string is
    const header = tiff.parseHeader(input);
    const ifd = tiff.parseIfd(input, header.ifdOffset, header.littleEndian);
    const descEntry = ifd.entries.find(e => e.tag === 270);
    expect(descEntry).toBeDefined();

    // Verify description exists in input
    const descStart = descEntry!.valueOffset;
    expect(input[descStart]).toBe('S'.charCodeAt(0)); // 'S' from 'Secret...'

    const result = tiff.remove(input);

    // Description data should be zeroed out
    expect(result[descStart]).toBe(0);
  });

  it('should have fewer IFD entries after removal', () => {
    const input = createTiffWithStripData();

    const headerBefore = tiff.parseHeader(input);
    const ifdBefore = tiff.parseIfd(input, headerBefore.ifdOffset, headerBefore.littleEndian);

    const result = tiff.remove(input);

    const headerAfter = tiff.parseHeader(result);
    const ifdAfter = tiff.parseIfd(result, headerAfter.ifdOffset, headerAfter.littleEndian);

    expect(ifdAfter.entries.length).toBeLessThan(ifdBefore.entries.length);
    // ImageDescription (270) should be removed
    expect(ifdAfter.entries.find(e => e.tag === 270)).toBeUndefined();
    // StripOffsets (273) should still be present
    expect(ifdAfter.entries.find(e => e.tag === 273)).toBeDefined();
  });

  it('should preserve file size (in-place modification)', () => {
    const input = createTiffWithStripData();
    const result = tiff.remove(input);
    // In-place modification: output has same size as input
    expect(result.length).toBe(input.length);
  });

  it('should return a copy when no metadata to remove', () => {
    // Create a minimal TIFF without removable metadata
    const parts: number[] = [];
    parts.push(0x49, 0x49, 0x2a, 0x00); // Header
    parts.push(0x08, 0x00, 0x00, 0x00); // IFD at 8
    parts.push(0x02, 0x00); // 2 entries
    writeEntry(parts, 256, 3, 1, [1, 0, 0, 0]); // ImageWidth
    writeEntry(parts, 257, 3, 1, [1, 0, 0, 0]); // ImageLength
    parts.push(0, 0, 0, 0); // Next IFD

    const input = new Uint8Array(parts);
    const result = tiff.remove(input);

    expect(result.length).toBe(input.length);
    // Should be a copy, not the same reference
    expect(result).not.toBe(input);
  });
});
