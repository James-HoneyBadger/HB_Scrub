/**
 * Tests for src/exif/reader.ts
 *
 * Feature 9: readExifBlock populates out.raw with all IFD0 tags
 */

import { describe, it, expect } from 'vitest';
import { readExifBlock } from '../src/exif/reader.js';
import type { MetadataMap } from '../src/types.js';

// ── Synthetic TIFF/EXIF block builder ────────────────────────────────────────
//
// Layout (little-endian):
//   0-1   : "II" (0x49 0x49)
//   2-3   : magic 42 (0x2A 0x00)
//   4-7   : IFD0 offset = 8
//   --- IFD0 at offset 8 ---
//   8-9   : numEntries (varies)
//   entries (12 bytes each):
//     +0  tag      (u16)
//     +2  type     (u16)
//     +4  count    (u32)
//     +8  value or offset (u32)
//   after entries: next-IFD u32 = 0
//   then: string data

function setU16LE(buf: Uint8Array, off: number, v: number) {
  buf[off]     = v & 0xff;
  buf[off + 1] = (v >> 8) & 0xff;
}
function setU32LE(buf: Uint8Array, off: number, v: number) {
  buf[off]     = v & 0xff;
  buf[off + 1] = (v >> 8) & 0xff;
  buf[off + 2] = (v >> 16) & 0xff;
  buf[off + 3] = (v >> 24) & 0xff;
}

/**
 * Build a minimal TIFF EXIF block with the given ASCII tags.
 * tags: [ { tag: number, value: string }, ... ]
 */
function buildExifBlock(tags: Array<{ tag: number; value: string }>): Uint8Array {
  // Calculate sizes
  const numEntries = tags.length;
  const ifd0Start  = 8;
  const ifd0Size   = 2 + numEntries * 12 + 4; // numEntries + entries + next-IFD
  const stringsStart = ifd0Start + ifd0Size;

  // Build string data
  const encoder = new TextEncoder();
  const strings = tags.map(t => {
    const enc = encoder.encode(t.value + '\0');
    return enc;
  });
  const totalStrings = strings.reduce((s, a) => s + a.length, 0);
  const totalSize = stringsStart + totalStrings;

  const buf = new Uint8Array(totalSize);

  // TIFF header
  buf[0] = 0x49; buf[1] = 0x49;    // II (little-endian)
  setU16LE(buf, 2, 42);             // magic
  setU32LE(buf, 4, ifd0Start);      // IFD0 offset

  // IFD0
  setU16LE(buf, ifd0Start, numEntries);

  let strOffset = stringsStart;
  for (let i = 0; i < numEntries; i++) {
    const entryOff = ifd0Start + 2 + i * 12;
    const { tag, value } = tags[i]!;
    const strBytes = strings[i]!;
    setU16LE(buf, entryOff,     tag);      // tag
    setU16LE(buf, entryOff + 2, 2);        // type ASCII = 2
    setU32LE(buf, entryOff + 4, strBytes.length); // count (including NUL)
    setU32LE(buf, entryOff + 8, strOffset);        // offset to string
    buf.set(strBytes, strOffset);
    strOffset += strBytes.length;
  }
  // next-IFD = 0
  setU32LE(buf, ifd0Start + 2 + numEntries * 12, 0);

  return buf;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('readExifBlock — raw tag map (Feature 9)', () => {
  it('populates out.raw with ifd0:<tag> keys', () => {
    const exif = buildExifBlock([
      { tag: 271, value: 'TestMake'  },  // Make
      { tag: 272, value: 'TestModel' },  // Model
    ]);
    const out: Partial<MetadataMap> = {};
    readExifBlock(exif, out);

    expect(out.raw).toBeDefined();
    expect(out.raw).toHaveProperty('ifd0:271');
    expect(out.raw).toHaveProperty('ifd0:272');
  });

  it('raw tag values match the actual strings', () => {
    const exif = buildExifBlock([{ tag: 271, value: 'Canon' }]);
    const out: Partial<MetadataMap> = {};
    readExifBlock(exif, out);

    expect(out.raw!['ifd0:271']).toBe('Canon');
  });

  it('populates structured fields AND raw map at the same time', () => {
    const exif = buildExifBlock([
      { tag: 271, value: 'Nikon'   },
      { tag: 305, value: 'TestSW'  },
    ]);
    const out: Partial<MetadataMap> = {};
    readExifBlock(exif, out);

    // Structured fields
    expect(out.make).toBe('Nikon');
    expect(out.software).toBe('TestSW');

    // Raw map
    expect(out.raw!['ifd0:271']).toBe('Nikon');
    expect(out.raw!['ifd0:305']).toBe('TestSW');
  });

  it('populates all known ASCII tags into raw map', () => {
    const exif = buildExifBlock([
      { tag: 270, value: 'My Description' },  // ImageDescription
      { tag: 315, value: 'Jane Doe'       },  // Artist
      { tag: 33432, value: '(c) 2024 Jane' },  // Copyright (ASCII-safe)
    ]);
    const out: Partial<MetadataMap> = {};
    readExifBlock(exif, out);

    expect(out.raw!['ifd0:270']).toBe('My Description');
    expect(out.raw!['ifd0:315']).toBe('Jane Doe');
    expect(out.raw!['ifd0:33432']).toBe('(c) 2024 Jane');
  });

  it('structured imageDescription matches raw ifd0:270', () => {
    const exif = buildExifBlock([{ tag: 270, value: 'Sunset shot' }]);
    const out: Partial<MetadataMap> = {};
    readExifBlock(exif, out);
    expect(out.imageDescription).toBe('Sunset shot');
    expect(out.raw!['ifd0:270']).toBe('Sunset shot');
  });

  it('returns empty raw map when EXIF block is malformed (too short)', () => {
    const out: Partial<MetadataMap> = {};
    readExifBlock(new Uint8Array(4), out); // too short to parse
    expect(out.raw).toBeUndefined();
  });

  it('raw map has no extra keys for unset tags', () => {
    const exif = buildExifBlock([{ tag: 271, value: 'Sony' }]);
    const out: Partial<MetadataMap> = {};
    readExifBlock(exif, out);
    // Only one entry was written, so raw should have exactly one key
    expect(Object.keys(out.raw!)).toHaveLength(1);
  });
});
