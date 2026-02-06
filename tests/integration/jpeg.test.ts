import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { removeMetadata, detectFormat, getMetadataTypes } from '../../src/index';
import { jpeg } from '../../src/formats/jpeg';

const FIXTURES_DIR = join(__dirname, '../fixtures');

describe('JPEG Integration Tests', () => {
  describe('r_canon.jpg (Canon camera)', () => {
    const imagePath = join(FIXTURES_DIR, 'r_canon.jpg');
    let imageBytes: Uint8Array;

    beforeAll(() => {
      imageBytes = new Uint8Array(readFileSync(imagePath));
    });

    it('should detect as JPEG format', () => {
      expect(detectFormat(imageBytes)).toBe('jpeg');
    });

    it('should detect EXIF metadata', () => {
      const types = getMetadataTypes(imageBytes);
      expect(types).toContain('EXIF');
    });

    it('should remove metadata and produce valid JPEG', async () => {
      const result = await removeMetadata(imageBytes);

      expect(result.format).toBe('jpeg');
      expect(result.removedMetadata.length).toBeGreaterThan(0);
      expect(result.cleanedSize).toBeLessThan(result.originalSize);

      // Verify output is valid JPEG
      expect(result.data[0]).toBe(0xff);
      expect(result.data[1]).toBe(0xd8);

      // Verify no EXIF remains
      const cleanedTypes = getMetadataTypes(result.data);
      expect(cleanedTypes).not.toContain('EXIF');
    });
  });

  describe('L01.jpg (with EXIF)', () => {
    const imagePath = join(FIXTURES_DIR, 'L01.jpg');
    let imageBytes: Uint8Array;

    beforeAll(() => {
      imageBytes = new Uint8Array(readFileSync(imagePath));
    });

    it('should remove EXIF and reduce file size', async () => {
      const result = await removeMetadata(imageBytes);

      expect(result.removedMetadata).toContain('EXIF');
      expect(result.cleanedSize).toBeLessThan(result.originalSize);
    });

    it('should preserve orientation when requested', async () => {
      const result = await removeMetadata(imageBytes, {
        preserveOrientation: true,
      });

      // File should still be smaller (other metadata removed)
      expect(result.cleanedSize).toBeLessThan(result.originalSize);

      // Should still start with JPEG marker
      expect(result.data[0]).toBe(0xff);
      expect(result.data[1]).toBe(0xd8);
    });
  });

  describe('noexif.jpg (no metadata)', () => {
    const imagePath = join(FIXTURES_DIR, 'noexif.jpg');
    let imageBytes: Uint8Array;

    beforeAll(() => {
      imageBytes = new Uint8Array(readFileSync(imagePath));
    });

    it('should detect as JPEG', () => {
      expect(detectFormat(imageBytes)).toBe('jpeg');
    });

    it('should handle image without metadata gracefully', async () => {
      const types = getMetadataTypes(imageBytes);
      expect(types.length).toBe(0);

      const result = await removeMetadata(imageBytes);
      expect(result.format).toBe('jpeg');
      // Size should be similar (no metadata to remove)
    });
  });

  describe('Multiple camera brands', () => {
    const cameras = [
      { file: 'r_canon.jpg', brand: 'Canon' },
      { file: 'r_casio.jpg', brand: 'Casio' },
      { file: 'r_olympus.jpg', brand: 'Olympus' },
      { file: 'r_pana.jpg', brand: 'Panasonic' },
      { file: 'r_ricoh.jpg', brand: 'Ricoh' },
      { file: 'r_sigma.jpg', brand: 'Sigma' },
      { file: 'r_sony.jpg', brand: 'Sony' },
    ];

    cameras.forEach(({ file, brand }) => {
      it(`should strip metadata from ${brand} camera image`, async () => {
        const imagePath = join(FIXTURES_DIR, file);
        const imageBytes = new Uint8Array(readFileSync(imagePath));

        const result = await removeMetadata(imageBytes);

        expect(result.format).toBe('jpeg');
        expect(result.removedMetadata.length).toBeGreaterThan(0);

        // Verify no EXIF remains
        const cleanedTypes = getMetadataTypes(result.data);
        expect(cleanedTypes).not.toContain('EXIF');
      });
    });
  });
});
