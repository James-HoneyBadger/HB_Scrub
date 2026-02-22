import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, existsSync, mkdirSync, rmSync, copyFileSync } from 'fs';
import { join } from 'path';
import { processFile } from '../../src/node';

const FIXTURES_DIR = join(__dirname, '../fixtures');
const TMP_DIR = join(__dirname, '../tmp');

function setupTmp(): void {
  mkdirSync(TMP_DIR, { recursive: true });
}

function cleanupTmp(): void {
  if (existsSync(TMP_DIR)) {
    rmSync(TMP_DIR, { recursive: true, force: true });
  }
}

describe('processFile', () => {
  afterEach(() => {
    cleanupTmp();
  });

  it('should process a JPEG and write output with -clean suffix', async () => {
    setupTmp();
    const inputPath = join(TMP_DIR, 'photo.jpg');
    copyFileSync(join(FIXTURES_DIR, 'L01.jpg'), inputPath);

    const result = await processFile(inputPath);

    expect(result.format).toBe('jpeg');
    expect(result.inputPath).toBe(inputPath);
    expect(result.outputPath).toBe(join(TMP_DIR, 'photo-clean.jpg'));
    expect(existsSync(result.outputPath)).toBe(true);
    expect(result.removedMetadata.length).toBeGreaterThan(0);
    expect(result.cleanedSize).toBeLessThan(result.originalSize);

    // Verify output file is valid
    const outputData = readFileSync(result.outputPath);
    expect(outputData.length).toBe(result.cleanedSize);
  });

  it('should overwrite original file with inPlace option', async () => {
    setupTmp();
    const inputPath = join(TMP_DIR, 'photo.jpg');
    copyFileSync(join(FIXTURES_DIR, 'L01.jpg'), inputPath);
    const originalSize = readFileSync(inputPath).length;

    const result = await processFile(inputPath, { inPlace: true });

    expect(result.outputPath).toBe(inputPath);
    expect(existsSync(result.outputPath)).toBe(true);
    const newSize = readFileSync(inputPath).length;
    expect(newSize).toBeLessThan(originalSize);
  });

  it('should use custom suffix', async () => {
    setupTmp();
    const inputPath = join(TMP_DIR, 'photo.jpg');
    copyFileSync(join(FIXTURES_DIR, 'L01.jpg'), inputPath);

    const result = await processFile(inputPath, { suffix: '-stripped' });

    expect(result.outputPath).toBe(join(TMP_DIR, 'photo-stripped.jpg'));
    expect(existsSync(result.outputPath)).toBe(true);
  });

  it('should use custom outputPath', async () => {
    setupTmp();
    const inputPath = join(TMP_DIR, 'photo.jpg');
    const outputPath = join(TMP_DIR, 'subdir', 'output.jpg');
    copyFileSync(join(FIXTURES_DIR, 'L01.jpg'), inputPath);

    const result = await processFile(inputPath, { outputPath });

    expect(result.outputPath).toBe(outputPath);
    expect(existsSync(outputPath)).toBe(true);
  });

  it('should throw error for non-existent file', async () => {
    await expect(processFile('/nonexistent/file.jpg')).rejects.toThrow();
  });

  it('should pass through RemoveOptions to removeMetadataSync', async () => {
    setupTmp();
    const inputPath = join(TMP_DIR, 'photo.jpg');
    copyFileSync(join(FIXTURES_DIR, 'L01.jpg'), inputPath);

    // Should not throw with preserve options
    const result = await processFile(inputPath, {
      preserveOrientation: true,
      preserveColorProfile: true,
      preserveCopyright: true,
    });

    expect(result.format).toBe('jpeg');
    expect(existsSync(result.outputPath)).toBe(true);
  });
});
