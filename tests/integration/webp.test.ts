import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { removeMetadata, detectFormat, getMetadataTypes } from '../../src/index';

const FIXTURES_DIR = join(__dirname, '../fixtures');

describe('WebP Integration Tests', () => {
  describe('example.webp', () => {
    const imagePath = join(FIXTURES_DIR, 'example.webp');
    let imageBytes: Uint8Array;

    beforeAll(() => {
      imageBytes = new Uint8Array(readFileSync(imagePath));
    });

    it('should detect as WebP format', () => {
      expect(detectFormat(imageBytes)).toBe('webp');
    });

    it('should detect metadata', () => {
      const types = getMetadataTypes(imageBytes);
      expect(types.length).toBeGreaterThan(0);
    });

    it('should remove metadata and produce valid WebP', async () => {
      const result = await removeMetadata(imageBytes);

      expect(result.format).toBe('webp');
      expect(result.removedMetadata.length).toBeGreaterThan(0);

      // Verify output is valid WebP (RIFF header)
      expect(result.data[0]).toBe(0x52); // R
      expect(result.data[1]).toBe(0x49); // I
      expect(result.data[2]).toBe(0x46); // F
      expect(result.data[3]).toBe(0x46); // F

      // WEBP signature at offset 8
      expect(result.data[8]).toBe(0x57); // W
      expect(result.data[9]).toBe(0x45); // E
      expect(result.data[10]).toBe(0x42); // B
      expect(result.data[11]).toBe(0x50); // P

      // Verify no EXIF remains
      const cleanedTypes = getMetadataTypes(result.data);
      expect(cleanedTypes).not.toContain('EXIF');
    });
  });

  describe('tool1.webp', () => {
    const imagePath = join(FIXTURES_DIR, 'tool1.webp');
    let imageBytes: Uint8Array;

    beforeAll(() => {
      imageBytes = new Uint8Array(readFileSync(imagePath));
    });

    it('should handle WebP with different structure', async () => {
      const result = await removeMetadata(imageBytes);

      expect(result.format).toBe('webp');

      // Verify RIFF/WEBP header
      expect(result.data[0]).toBe(0x52);
      expect(result.data[8]).toBe(0x57);
    });
  });

  describe('pil_rgb.webp (simple WebP)', () => {
    const imagePath = join(FIXTURES_DIR, 'pil_rgb.webp');
    let imageBytes: Uint8Array;

    beforeAll(() => {
      imageBytes = new Uint8Array(readFileSync(imagePath));
    });

    it('should handle minimal WebP files', async () => {
      const result = await removeMetadata(imageBytes);

      expect(result.format).toBe('webp');
      expect(result.data.length).toBeGreaterThan(0);
    });
  });

  describe('pil_rgb_with_metadata.webp', () => {
    const imagePath = join(FIXTURES_DIR, 'pil_rgb_with_metadata.webp');
    let imageBytes: Uint8Array;

    beforeAll(() => {
      imageBytes = new Uint8Array(readFileSync(imagePath));
    });

    it('should remove metadata from WebP with embedded metadata', async () => {
      const originalTypes = getMetadataTypes(imageBytes);

      const result = await removeMetadata(imageBytes);

      expect(result.format).toBe('webp');

      // If there was metadata, it should have been removed
      if (originalTypes.length > 0) {
        expect(result.removedMetadata.length).toBeGreaterThan(0);
      }
    });
  });
});
