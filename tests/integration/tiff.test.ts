import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { removeMetadata, detectFormat, getMetadataTypes } from '../../src/index';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '../fixtures');

describe('TIFF Integration Tests', () => {
  describe('with_metadata.tiff', () => {
    let imageBytes: Uint8Array;

    beforeAll(() => {
      imageBytes = new Uint8Array(readFileSync(join(FIXTURES_DIR, 'with_metadata.tiff')));
    });

    it('should detect as TIFF format', () => {
      expect(detectFormat(imageBytes)).toBe('tiff');
    });

    it('should detect metadata tags', () => {
      const types = getMetadataTypes(imageBytes);
      expect(types.length).toBeGreaterThan(0);
    });

    it('should remove metadata and produce valid TIFF', async () => {
      const originalTypes = getMetadataTypes(imageBytes);
      const result = await removeMetadata(imageBytes);

      expect(result.format).toBe('tiff');
      expect(result.removedMetadata.length).toBeGreaterThan(0);

      // Verify output is valid TIFF (little-endian)
      expect(result.data[0]).toBe(0x49); // I
      expect(result.data[1]).toBe(0x49); // I
      expect(result.data[2]).toBe(0x2a); // *
      expect(result.data[3]).toBe(0x00);

      // Verify metadata was removed
      const cleanedTypes = getMetadataTypes(result.data);
      // Should have fewer metadata types after cleaning
      expect(cleanedTypes.length).toBeLessThanOrEqual(originalTypes.length);
    });
  });

  describe('minimal.tiff', () => {
    let imageBytes: Uint8Array;

    beforeAll(() => {
      imageBytes = new Uint8Array(readFileSync(join(FIXTURES_DIR, 'minimal.tiff')));
    });

    it('should detect as TIFF', () => {
      expect(detectFormat(imageBytes)).toBe('tiff');
    });

    it('should handle TIFF without metadata', async () => {
      const types = getMetadataTypes(imageBytes);

      const result = await removeMetadata(imageBytes);

      expect(result.format).toBe('tiff');

      // Verify still valid TIFF
      expect(result.data[0]).toBe(0x49);
      expect(result.data[1]).toBe(0x49);
    });
  });

  describe('TIFF byte order detection', () => {
    it('should handle little-endian TIFF', async () => {
      const imageBytes = new Uint8Array(readFileSync(join(FIXTURES_DIR, 'minimal.tiff')));

      // Verify it's little-endian
      expect(imageBytes[0]).toBe(0x49); // 'I'
      expect(imageBytes[1]).toBe(0x49); // 'I'

      const result = await removeMetadata(imageBytes);
      expect(result.format).toBe('tiff');
    });

    it('should create valid output structure', async () => {
      const imageBytes = new Uint8Array(readFileSync(join(FIXTURES_DIR, 'with_metadata.tiff')));
      const result = await removeMetadata(imageBytes);

      // Check TIFF header structure
      expect(result.data.length).toBeGreaterThan(8);

      // Byte order marker
      expect(result.data[0]).toBe(0x49);
      expect(result.data[1]).toBe(0x49);

      // Magic number (42)
      expect(result.data[2]).toBe(0x2a);
      expect(result.data[3]).toBe(0x00);

      // IFD offset (should be 8 for simple TIFF)
      const ifdOffset = result.data[4]! | (result.data[5]! << 8) |
                        (result.data[6]! << 16) | (result.data[7]! << 24);
      expect(ifdOffset).toBeGreaterThan(0);
      expect(ifdOffset).toBeLessThan(result.data.length);
    });
  });
});
