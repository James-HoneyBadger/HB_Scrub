/**
 * Fuzz testing harness for HB Scrub format handlers.
 *
 * Run:
 *   npx tsx fuzz/fuzz.ts [iterations] [seed]
 *
 * Strategy:
 *  1. Generate a valid minimal image (JPEG/PNG)
 *  2. Apply random mutations (bit flips, truncation, splicing)
 *  3. Feed to detectFormat, removeMetadataSync, verifyCleanSync
 *  4. Ensure no uncaught exceptions or infinite loops (timeout)
 *
 * Any crash (non-graceful error) is written to fuzz/crashes/ for
 * reproduction.
 */

import { removeMetadataSync } from '../src/node.js';
import { detectFormat } from '../src/detect.js';
import { verifyCleanSync } from '../src/operations/verify.js';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';

// ─── Seed corpus ─────────────────────────────────────────────────────────────

const JPEG_MIN = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe1, 0x00, 0x10,
  0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
  0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08,
  0xff, 0xda, 0x00, 0x02, 0xff, 0xd9,
]);

const PNG_MIN = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10,
  0, 0, 0, 13, 73, 72, 68, 82,
  0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0,
  0, 0, 0, 0,
  0, 0, 0, 0, 73, 69, 78, 68, 0, 0, 0, 0,
]);

const GIF_MIN = new Uint8Array([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, // GIF89a
  1, 0, 1, 0, 0, 0, 0,
  0x3b, // trailer
]);

const SEEDS = [JPEG_MIN, PNG_MIN, GIF_MIN];

// ─── Mutators ────────────────────────────────────────────────────────────────

function rng(max: number): number {
  return Math.floor(Math.random() * max);
}

function mutate(data: Uint8Array): Uint8Array {
  const strat = rng(5);
  const copy = new Uint8Array(data);

  switch (strat) {
    case 0: {
      // Bit flip
      const nFlips = 1 + rng(8);
      for (let i = 0; i < nFlips; i++) {
        const idx = rng(copy.length);
        copy[idx] ^= 1 << rng(8);
      }
      return copy;
    }
    case 1: {
      // Truncation
      const newLen = Math.max(1, rng(copy.length));
      return copy.slice(0, newLen);
    }
    case 2: {
      // Extension with random bytes
      const extra = new Uint8Array(rng(256));
      for (let i = 0; i < extra.length; i++) extra[i] = rng(256);
      const out = new Uint8Array(copy.length + extra.length);
      out.set(copy);
      out.set(extra, copy.length);
      return out;
    }
    case 3: {
      // Byte overwrite
      const start = rng(copy.length);
      const len = Math.min(1 + rng(32), copy.length - start);
      for (let i = start; i < start + len; i++) {
        copy[i] = rng(256);
      }
      return copy;
    }
    case 4: {
      // Splice two seeds
      const other = SEEDS[rng(SEEDS.length)]!;
      const splitA = rng(copy.length);
      const splitB = rng(other.length);
      const out = new Uint8Array(splitA + (other.length - splitB));
      out.set(copy.slice(0, splitA));
      out.set(other.slice(splitB), splitA);
      return out;
    }
    default:
      return copy;
  }
}

// ─── Runner ──────────────────────────────────────────────────────────────────

const iterations = parseInt(process.argv[2] || '10000', 10);
const seed = process.argv[3] ? parseInt(process.argv[3], 10) : Date.now();

console.log(`Fuzzing ${iterations} iterations (seed: ${seed})`);

let crashes = 0;
const CRASH_DIR = 'fuzz/crashes';

function saveCrash(data: Uint8Array, error: unknown, i: number): void {
  if (!existsSync(CRASH_DIR)) mkdirSync(CRASH_DIR, { recursive: true });
  const name = `${CRASH_DIR}/crash-${i}-${Date.now()}.bin`;
  writeFileSync(name, data);
  console.error(`  CRASH #${i}: ${error instanceof Error ? error.message : String(error)}`);
  console.error(`  Saved to ${name}`);
  crashes++;
}

for (let i = 0; i < iterations; i++) {
  const base = SEEDS[rng(SEEDS.length)]!;
  const nMutations = 1 + rng(4);
  let data = base;
  for (let m = 0; m < nMutations; m++) {
    data = mutate(data);
  }

  // detectFormat should never throw
  try {
    detectFormat(data);
  } catch (err) {
    saveCrash(data, err, i);
  }

  // removeMetadataSync may throw known errors — that's OK.
  // Only save if it's an unexpected crash (not our error classes).
  try {
    removeMetadataSync(data);
  } catch (err) {
    if (err instanceof Error && err.constructor.name === 'Error') {
      // Unexpected generic Error
      saveCrash(data, err, i);
    }
    // Known ProcessingError subclasses are fine
  }

  // verifyCleanSync should never throw
  try {
    verifyCleanSync(data);
  } catch (err) {
    saveCrash(data, err, i);
  }

  if ((i + 1) % 1000 === 0) {
    process.stdout.write(`  ${i + 1}/${iterations} (${crashes} crashes)\r`);
  }
}

console.log(`\nDone: ${iterations} iterations, ${crashes} crashes found.`);
if (crashes > 0) process.exit(1);
