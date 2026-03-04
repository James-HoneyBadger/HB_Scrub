/**
 * Tests for src/exif/gps.ts
 *
 * Feature 7: GPS altitude (tags 5 & 6) redaction
 */

import { describe, it, expect } from 'vitest';
import { redactGpsInExif, dmsRawToDecimal, writeRedactedDms } from '../src/exif/gps.js';

// ── Helpers to build a synthetic GPS IFD ─────────────────────────────────────
//
// Buffer layout (little-endian):
//   0-1    : numEntries = 3
//   2-13   : Entry 0 — tag 2 (GPSLatitude),  RATIONAL(5), count 3, offset → 42
//   14-25  : Entry 1 — tag 5 (GPSAltitudeRef), BYTE(1), count 1, inline val 1
//   26-37  : Entry 2 — tag 6 (GPSAltitude),  RATIONAL(5), count 1, offset → 66
//   38-41  : next-IFD = 0
//   42-65  : 3 × RATIONAL (lat = 48°0'0" = 48/1, 0/1, 0/1 →  24 bytes)
//   66-73  : altitude rational  200/1  (200 m)

function buildGpsIfd(): Uint8Array {
  const buf = new Uint8Array(74);
  const setU16LE = (off: number, v: number) => {
    buf[off]     = v & 0xff;
    buf[off + 1] = (v >> 8) & 0xff;
  };
  const setU32LE = (off: number, v: number) => {
    buf[off]     = v & 0xff;
    buf[off + 1] = (v >> 8) & 0xff;
    buf[off + 2] = (v >> 16) & 0xff;
    buf[off + 3] = (v >> 24) & 0xff;
  };

  setU16LE(0, 3); // numEntries

  // Entry 0: GPSLatitude (tag 2), RATIONAL(5), count 3, offset 42
  setU16LE(2,  2);     // tag
  setU16LE(4,  5);     // type RATIONAL
  setU32LE(6,  3);     // count
  setU32LE(10, 42);    // offset to data

  // Entry 1: GPSAltitudeRef (tag 5), BYTE(1), count 1, inline value = 1
  setU16LE(14, 5);     // tag
  setU16LE(16, 1);     // type BYTE
  setU32LE(18, 1);     // count
  setU32LE(22, 1);     // inline value = 1 (below sea level)

  // Entry 2: GPSAltitude (tag 6), RATIONAL(5), count 1, offset 66
  setU16LE(26, 6);     // tag
  setU16LE(28, 5);     // type RATIONAL
  setU32LE(30, 1);     // count
  setU32LE(34, 66);    // offset

  // next-IFD offset = 0
  setU32LE(38, 0);

  // Latitude rationals at 42: 48/1, 0/1, 0/1
  setU32LE(42, 48); setU32LE(46, 1);  // 48°
  setU32LE(50, 0);  setU32LE(54, 1);  // 0'
  setU32LE(58, 0);  setU32LE(62, 1);  // 0"

  // Altitude rational at 66: 200/1
  setU32LE(66, 200);
  setU32LE(70, 1);

  return buf;
}

function getU32LE(buf: Uint8Array, off: number): number {
  return buf[off]! | (buf[off + 1]! << 8) | (buf[off + 2]! << 16) | (buf[off + 3]! << 24);
}

// ─────────────────────────────────────────────────────────────────────────────

describe('redactGpsInExif — altitude tags (Feature 7)', () => {
  it('zeroes GPSAltitudeRef (tag 5) inline value', () => {
    const buf = buildGpsIfd();
    // Before: inline value at entry1+8 = 14+8 = 22 → 1
    expect(getU32LE(buf, 22)).toBe(1);

    redactGpsInExif(buf, 0, 'city', true);

    // After: should be 0 (above sea level / zeroed)
    expect(getU32LE(buf, 22)).toBe(0);
  });

  it('zeroes GPSAltitude (tag 6) rational numerator', () => {
    const buf = buildGpsIfd();
    // Before: numerator at offset 66 = 200
    expect(getU32LE(buf, 66)).toBe(200);

    redactGpsInExif(buf, 0, 'city', true);

    // After numerator = 0
    expect(getU32LE(buf, 66)).toBe(0);
  });

  it('sets GPSAltitude denominator to 1 after zeroing', () => {
    const buf = buildGpsIfd();
    redactGpsInExif(buf, 0, 'city', true);
    expect(getU32LE(buf, 70)).toBe(1);
  });

  it('also truncates latitude (tag 2) at city precision', () => {
    const buf = buildGpsIfd();
    // Latitude = 48.0 degrees; at 'city' (2 decimals) it stays 48
    redactGpsInExif(buf, 0, 'city', true);
    // numerator at 42 should be 4800 (48.00 * 100), denominator 100
    expect(getU32LE(buf, 42)).toBe(4800);
    expect(getU32LE(buf, 46)).toBe(100);
  });

  it('does nothing when precision is "exact"', () => {
    const buf = buildGpsIfd();
    redactGpsInExif(buf, 0, 'exact', true);
    // Altitude numerator should remain 200
    expect(getU32LE(buf, 66)).toBe(200);
    // AltitudeRef inline should remain 1
    expect(getU32LE(buf, 22)).toBe(1);
  });

  it('does nothing when precision is "remove"', () => {
    const buf = buildGpsIfd();
    redactGpsInExif(buf, 0, 'remove', true);
    expect(getU32LE(buf, 66)).toBe(200);
  });

  it('handles region precision for altitude zeroing', () => {
    const buf = buildGpsIfd();
    redactGpsInExif(buf, 0, 'region', true);
    expect(getU32LE(buf, 66)).toBe(0);   // altitude zeroed
    expect(getU32LE(buf, 22)).toBe(0);   // altitudeRef zeroed
  });
});

describe('dmsRawToDecimal', () => {
  it('converts 48/1, 30/1, 0/1  → 48.5°', () => {
    const buf = new Uint8Array(24);
    const setU32LE = (off: number, v: number) => {
      buf[off]= v & 0xff; buf[off+1]= (v>>8)&0xff;
      buf[off+2]= (v>>16)&0xff; buf[off+3]= (v>>24)&0xff;
    };
    setU32LE(0, 48); setU32LE(4, 1);   // 48/1 = 48°
    setU32LE(8, 30); setU32LE(12, 1);  // 30/1 = 30' = 0.5°
    setU32LE(16, 0); setU32LE(20, 1);  // 0"
    expect(dmsRawToDecimal(buf, 0, true)).toBeCloseTo(48.5, 6);
  });

  it('handles zero denominator gracefully (returns 0)', () => {
    const buf = new Uint8Array(24); // all zeros → 0/0
    expect(dmsRawToDecimal(buf, 0, true)).toBe(0);
  });
});

describe('writeRedactedDms', () => {
  it('encodes truncated decimal back as DMS rationals', () => {
    const buf = new Uint8Array(24);
    writeRedactedDms(buf, 0, 48.9876, 2, true); // city precision = 2 decimal places
    // 48.98 at 100 scale → numerator=4898, denominator=100
    const getU32LE = (off: number) =>
      buf[off]! | (buf[off+1]!<<8) | (buf[off+2]!<<16) | (buf[off+3]!<<24);
    expect(getU32LE(0)).toBe(4898);   // numerator
    expect(getU32LE(4)).toBe(100);    // denominator
    expect(getU32LE(8)).toBe(0);      // minutes numerator = 0
    expect(getU32LE(16)).toBe(0);     // seconds numerator = 0
  });
});
