/**
 * Performance benchmarks for HB Scrub.
 *
 * Run:
 *   npx tsx bench/bench.ts
 *
 * Generates synthetic test data of varying sizes and measures throughput
 * for the core operations: detectFormat, removeMetadata, verifyClean.
 */

import { removeMetadataSync } from '../src/node.js';
import { detectFormat } from '../src/detect.js';
import { verifyCleanSync } from '../src/operations/verify.js';

// ─── Synthetic test image generators ─────────────────────────────────────────

/** Minimal valid JPEG with APP1 EXIF marker */
function makeJpeg(payloadKB: number): Uint8Array {
  const exifPayload = new Uint8Array(payloadKB * 1024).fill(0x41);
  // SOI + APP1 marker
  const header = new Uint8Array([
    0xff, 0xd8, // SOI
    0xff, 0xe1, // APP1
    ...uint16BE(exifPayload.length + 2 + 6), // length
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
  ]);
  // Minimal SOS + EOI
  const tail = new Uint8Array([0xff, 0xda, 0x00, 0x02, 0xff, 0xd9]);
  return concat(header, exifPayload, tail);
}

/** Minimal valid PNG with tEXt chunk */
function makePng(payloadKB: number): Uint8Array {
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  // Minimal IHDR
  const ihdr = pngChunk('IHDR', new Uint8Array([
    0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0,
  ]));
  // tEXt chunk with payload
  const keyword = new TextEncoder().encode('Comment\0');
  const textData = new Uint8Array(payloadKB * 1024).fill(0x41);
  const text = pngChunk('tEXt', concat(keyword, textData));
  // IEND
  const iend = pngChunk('IEND', new Uint8Array(0));
  return concat(sig, ihdr, text, iend);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function uint16BE(n: number): number[] {
  return [(n >> 8) & 0xff, n & 0xff];
}

function uint32BE(n: number): Uint8Array {
  return new Uint8Array([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);
}

function concat(...bufs: Uint8Array[]): Uint8Array {
  const len = bufs.reduce((s, b) => s + b.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const b of bufs) {
    out.set(b, off);
    off += b.length;
  }
  return out;
}

function pngChunk(type: string, payload: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const len = uint32BE(payload.length);
  // CRC placeholder (good enough for benchmarking)
  const crc = uint32BE(0);
  return concat(len, typeBytes, payload, crc);
}

// ─── Benchmark runner ────────────────────────────────────────────────────────

interface BenchResult {
  name: string;
  opsPerSec: number;
  avgMs: number;
  runs: number;
}

function bench(name: string, fn: () => void, durationMs = 2000): BenchResult {
  // Warm up
  for (let i = 0; i < 5; i++) fn();

  let runs = 0;
  const start = performance.now();
  while (performance.now() - start < durationMs) {
    fn();
    runs++;
  }
  const elapsed = performance.now() - start;
  return {
    name,
    opsPerSec: Math.round((runs / elapsed) * 1000),
    avgMs: Number((elapsed / runs).toFixed(3)),
    runs,
  };
}

function printResults(results: BenchResult[]): void {
  console.log('\n┌────────────────────────────────────────┬────────────┬──────────┬────────┐');
  console.log('│ Benchmark                              │   ops/sec  │  avg ms  │  runs  │');
  console.log('├────────────────────────────────────────┼────────────┼──────────┼────────┤');
  for (const r of results) {
    console.log(
      `│ ${r.name.padEnd(38)} │ ${String(r.opsPerSec).padStart(10)} │ ${String(r.avgMs).padStart(8)} │ ${String(r.runs).padStart(6)} │`
    );
  }
  console.log('└────────────────────────────────────────┴────────────┴──────────┴────────┘\n');
}

// ─── Main ────────────────────────────────────────────────────────────────────

const sizes = [1, 10, 100, 500];
const results: BenchResult[] = [];

for (const kb of sizes) {
  const jpegData = makeJpeg(kb);
  const pngData = makePng(kb);

  results.push(bench(`detectFormat JPEG ${kb}KB`, () => detectFormat(jpegData)));
  results.push(bench(`detectFormat PNG  ${kb}KB`, () => detectFormat(pngData)));
  results.push(bench(`removeSync   JPEG ${kb}KB`, () => removeMetadataSync(jpegData)));
  results.push(bench(`removeSync   PNG  ${kb}KB`, () => removeMetadataSync(pngData)));
  results.push(bench(`verifyClean  JPEG ${kb}KB`, () => verifyCleanSync(jpegData)));
  results.push(bench(`verifyClean  PNG  ${kb}KB`, () => verifyCleanSync(pngData)));
}

printResults(results);
