import { describe, it, expect } from 'vitest';
import { removeMetadataSync } from '../../src/operations/remove';
import { readFileSync } from 'fs';
import { join } from 'path';

const FIXTURES_DIR = join(__dirname, '../fixtures');

describe('RemoveResult outputFormat', () => {
  it('should not set outputFormat for JPEG files', () => {
    const jpegBytes = new Uint8Array(readFileSync(join(FIXTURES_DIR, 'noexif.jpg')));
    const result = removeMetadataSync(jpegBytes);
    expect(result.format).toBe('jpeg');
    expect(result.outputFormat).toBeUndefined();
  });

  it('should not set outputFormat for PNG files', () => {
    const pngBytes = new Uint8Array(readFileSync(join(FIXTURES_DIR, '1.png')));
    const result = removeMetadataSync(pngBytes);
    expect(result.format).toBe('png');
    expect(result.outputFormat).toBeUndefined();
  });

  it('should not set outputFormat for TIFF/DNG files', () => {
    const tiffBytes = new Uint8Array(readFileSync(join(FIXTURES_DIR, 'minimal.tiff')));
    const result = removeMetadataSync(tiffBytes);
    expect(result.format).toBe('tiff');
    expect(result.outputFormat).toBeUndefined();
  });
});
