/**
 * Tests for src/operations/batch.ts
 *
 * Feature 6: matchGlob with ** support
 * Feature: onProgress callback
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { matchGlob, processFiles, processDir } from '../src/operations/batch.js';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('matchGlob', () => {
  // ── Basic * ───────────────────────────────────────────────────────────────
  it('matches *.jpg to photo.jpg', () => {
    expect(matchGlob('photo.jpg', '*.jpg')).toBe(true);
  });

  it('*.jpg does NOT match directory/photo.jpg (no path sep)', () => {
    expect(matchGlob('directory/photo.jpg', '*.jpg')).toBe(false);
  });

  it('matches *.png case-insensitively', () => {
    expect(matchGlob('IMAGE.PNG', '*.png')).toBe(true);
  });

  it('matches multiple chars inside one segment', () => {
    expect(matchGlob('long-file-name.webp', '*.webp')).toBe(true);
  });

  it('does not match when extension is different', () => {
    expect(matchGlob('photo.png', '*.jpg')).toBe(false);
  });

  // ── ** across path separators ─────────────────────────────────────────────
  it('**/*.jpg matches nested path', () => {
    expect(matchGlob('a/b/c/photo.jpg', '**/*.jpg')).toBe(true);
  });

  it('**/*.jpg matches single-level path', () => {
    expect(matchGlob('photos/img.jpg', '**/*.jpg')).toBe(true);
  });

  it('**/*.jpg matches filename with no directory', () => {
    expect(matchGlob('img.jpg', '**/*.jpg')).toBe(true);
  });

  it('**/*.jpg does NOT match wrong extension', () => {
    expect(matchGlob('a/b/photo.png', '**/*.jpg')).toBe(false);
  });

  it('images/**/*.png matches deep path', () => {
    expect(matchGlob('images/2024/raw/snap.png', 'images/**/*.png')).toBe(true);
  });

  it('images/**/*.png does NOT match other prefix', () => {
    expect(matchGlob('docs/photo.png', 'images/**/*.png')).toBe(false);
  });

  // ── ? wildcard ────────────────────────────────────────────────────────────
  it('photo?.jpg matches photo1.jpg', () => {
    expect(matchGlob('photo1.jpg', 'photo?.jpg')).toBe(true);
  });

  it('photo?.jpg does NOT match photo12.jpg (? = exactly one)', () => {
    expect(matchGlob('photo12.jpg', 'photo?.jpg')).toBe(false);
  });

  it('? does NOT match path separator', () => {
    expect(matchGlob('a/b.jpg', '?.jpg')).toBe(false);
  });

  // ── Exact matches ─────────────────────────────────────────────────────────
  it('exact pattern matches exact filename', () => {
    expect(matchGlob('photo.jpg', 'photo.jpg')).toBe(true);
  });

  it('exact pattern does NOT match different filename', () => {
    expect(matchGlob('photo.png', 'photo.jpg')).toBe(false);
  });

  // ── Dot escaping ──────────────────────────────────────────────────────────
  it('dots in pattern are literal (not regex wildcards)', () => {
    expect(matchGlob('photoXjpg', '*.jpg')).toBe(false);
  });

  // ── Combined ** and ? ─────────────────────────────────────────────────────
  it('**/??.jpg matches two-char filenames in subpaths', () => {
    expect(matchGlob('a/b/ab.jpg', '**/??.jpg')).toBe(true);
  });

  it('**/??.jpg does NOT match single-char base', () => {
    expect(matchGlob('a/b/a.jpg', '**/??.jpg')).toBe(false);
  });
});

// ── onProgress callback ───────────────────────────────────────────────────────

describe('batch onProgress callback', () => {
  const TMP_DIR = join(tmpdir(), 'hbscrub-batch-test-' + Date.now());

  /** Minimal JPEG: FFD8 FFD9 */
  const minJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x02, 0xff, 0xd9]);

  beforeAll(async () => {
    await mkdir(TMP_DIR, { recursive: true });
    await writeFile(join(TMP_DIR, 'a.jpg'), minJpeg);
    await writeFile(join(TMP_DIR, 'b.jpg'), minJpeg);
    await writeFile(join(TMP_DIR, 'c.jpg'), minJpeg);
  });

  afterAll(async () => {
    await rm(TMP_DIR, { recursive: true, force: true });
  });

  it('calls onProgress for each file', async () => {
    const calls: [number, number, string][] = [];
    const out = join(TMP_DIR, 'out');

    await processDir(TMP_DIR, {
      outputDir: out,
      concurrency: 1,
      onProgress: (completed, total, file) => {
        calls.push([completed, total, file]);
      },
    }, false); // non-recursive

    expect(calls.length).toBe(3);
    // Each call should have incrementing completed count
    expect(calls.map(c => c[0])).toEqual([1, 2, 3]);
    // Total should always be 3
    expect(calls.every(c => c[1] === 3)).toBe(true);
  });

  it('works with processFiles()', async () => {
    const progressFn = vi.fn();
    const files = [
      join(TMP_DIR, 'a.jpg'),
      join(TMP_DIR, 'b.jpg'),
    ];

    await processFiles(files, {
      outputDir: join(TMP_DIR, 'out2'),
      concurrency: 1,
      onProgress: progressFn,
    });

    expect(progressFn).toHaveBeenCalledTimes(2);
    expect(progressFn).toHaveBeenNthCalledWith(1, 1, 2, expect.any(String));
    expect(progressFn).toHaveBeenNthCalledWith(2, 2, 2, expect.any(String));
  });

  it('does not throw when onProgress is omitted', async () => {
    const files = [join(TMP_DIR, 'a.jpg')];
    const result = await processFiles(files, {
      outputDir: join(TMP_DIR, 'out3'),
      concurrency: 1,
    });
    expect(result.successful.length).toBe(1);
  });
});

// ── Real-filesystem: recursive directory walk ────────────────────────────────

describe('processDir — recursive walk', () => {
  // Keep source files isolated so output dirs written to ROOT don't pollute walks.
  const ROOT    = join(tmpdir(), 'hbscrub-recursive-' + Date.now());
  const SRC     = join(ROOT, 'src');       // source tree
  const SRC_SUB = join(SRC, 'sub');

  /** Minimal valid JPEG (SOI + EOI) */
  const minJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x02, 0xff, 0xd9]);

  beforeAll(async () => {
    await mkdir(SRC_SUB, { recursive: true });
    // Root of source tree
    await writeFile(join(SRC, 'top.jpg'), minJpeg);
    await writeFile(join(SRC, 'top.png'), new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR length + type
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1×1 px
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, // bit depth, colour, CRC
      0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, // IDAT length + type
      0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01,
      0xe2, 0x21, 0xbc, 0x33, // IDAT CRC
      0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82, // IEND
    ]));
    // Non-image files — must be ignored
    await writeFile(join(SRC, 'readme.txt'), Buffer.from('hello'));
    // Sub-directory
    await writeFile(join(SRC_SUB, 'nested.jpg'), minJpeg);
    await writeFile(join(SRC_SUB, 'nested2.jpg'), minJpeg);
  });

  afterAll(async () => {
    await rm(ROOT, { recursive: true, force: true });
  });

  it('non-recursive processes only root-level image files', async () => {
    const out = join(ROOT, 'out-nonrec');
    const result = await processDir(SRC, { outputDir: out, concurrency: 1 }, false);
    // top.jpg and top.png from SRC root (txt filtered out)
    expect(result.successful.length).toBe(2);
    expect(result.failed.length).toBe(0);
  });

  it('recursive processes root and subdirectory image files', async () => {
    const out = join(ROOT, 'out-rec');
    const result = await processDir(SRC, { outputDir: out, concurrency: 1 }, true);
    // top.jpg + top.png + sub/nested.jpg + sub/nested2.jpg = 4
    expect(result.successful.length).toBe(4);
    expect(result.failed.length).toBe(0);
  });

  it('include filter limits recursive walk to matching pattern', async () => {
    const out = join(ROOT, 'out-include');
    const result = await processDir(SRC, {
      outputDir: out,
      concurrency: 1,
      include: ['*.png'],
    }, true);
    // Only top.png matches *.png
    expect(result.successful.length).toBe(1);
  });

  it('exclude filter skips matching files', async () => {
    const out = join(ROOT, 'out-exclude');
    const result = await processDir(SRC, {
      outputDir: out,
      concurrency: 1,
      exclude: ['*.png'],
    }, true);
    // top.jpg + sub/nested.jpg + sub/nested2.jpg (top.png excluded)
    expect(result.successful.length).toBe(3);
  });

  it('non-image files are never processed', async () => {
    const out = join(ROOT, 'out-nonimg');
    const result = await processDir(SRC, { outputDir: out, concurrency: 1 }, true);
    const names = result.successful.map(e => e.file);
    expect(names.every(p => !p.endsWith('.txt'))).toBe(true);
  });

  it('output files are written to the outputDir', async () => {
    const { stat: statFn } = await import('node:fs/promises');
    const out = join(ROOT, 'out-write');
    const result = await processDir(SRC, { outputDir: out, concurrency: 1 }, false);
    for (const entry of result.successful) {
      if (entry.outputPath) {
        const s = await statFn(entry.outputPath);
        expect(s.isFile()).toBe(true);
        expect(s.size).toBeGreaterThan(0);
      }
    }
  });
});