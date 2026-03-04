/**
 * Tests for src/operations/batch.ts
 *
 * Feature 6: matchGlob with ** support
 */

import { describe, it, expect } from 'vitest';
import { matchGlob } from '../src/operations/batch.js';

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
