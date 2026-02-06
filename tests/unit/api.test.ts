import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  removeMetadata,
  removeMetadataSync,
  isFormatSupported,
  getSupportedFormats,
  InvalidFormatError,
  UnsupportedFormatError,
} from '../../src/index';

const FIXTURES_DIR = join(__dirname, '../fixtures');

describe('API Tests', () => {
  describe('removeMetadataSync', () => {
    let jpegBytes: Uint8Array;

    beforeAll(() => {
      jpegBytes = new Uint8Array(readFileSync(join(FIXTURES_DIR, 'L01.jpg')));
    });

    it('should remove metadata synchronously from JPEG', () => {
      const result = removeMetadataSync(jpegBytes);

      expect(result.format).toBe('jpeg');
      expect(result.data).toBeInstanceOf(Uint8Array);
      expect(result.cleanedSize).toBeLessThan(result.originalSize);
      expect(result.removedMetadata.length).toBeGreaterThan(0);
    });

    it('should handle ArrayBuffer input', () => {
      const arrayBuffer = jpegBytes.buffer.slice(
        jpegBytes.byteOffset,
        jpegBytes.byteOffset + jpegBytes.byteLength
      );

      const result = removeMetadataSync(arrayBuffer);

      expect(result.format).toBe('jpeg');
      expect(result.data).toBeInstanceOf(Uint8Array);
    });

    it('should throw UnsupportedFormatError for unknown formats', () => {
      const unknownData = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]);

      expect(() => removeMetadataSync(unknownData)).toThrow(UnsupportedFormatError);
    });
  });

  describe('removeMetadata input handling', () => {
    let jpegBytes: Uint8Array;

    beforeAll(() => {
      jpegBytes = new Uint8Array(readFileSync(join(FIXTURES_DIR, 'noexif.jpg')));
    });

    it('should accept ArrayBuffer input', async () => {
      const arrayBuffer = jpegBytes.buffer.slice(
        jpegBytes.byteOffset,
        jpegBytes.byteOffset + jpegBytes.byteLength
      );

      const result = await removeMetadata(arrayBuffer);

      expect(result.format).toBe('jpeg');
      expect(result.data).toBeInstanceOf(Uint8Array);
    });

    it('should accept valid data URL (base64)', async () => {
      // Create a base64 data URL from the JPEG bytes
      let binaryString = '';
      for (let i = 0; i < jpegBytes.length; i++) {
        binaryString += String.fromCharCode(jpegBytes[i]);
      }
      const base64 = btoa(binaryString);
      const dataUrl = `data:image/jpeg;base64,${base64}`;

      const result = await removeMetadata(dataUrl);

      expect(result.format).toBe('jpeg');
      expect(result.data).toBeInstanceOf(Uint8Array);
    });

    it('should reject with InvalidFormatError for data URL without comma', async () => {
      const invalidDataUrl = 'data:image/jpegbase64nope';

      await expect(removeMetadata(invalidDataUrl)).rejects.toThrow(InvalidFormatError);
      await expect(removeMetadata(invalidDataUrl)).rejects.toThrow('Invalid data URL format');
    });

    it('should reject with InvalidFormatError for non-data-URL string', async () => {
      const notADataUrl = 'https://example.com/image.jpg';

      await expect(removeMetadata(notADataUrl)).rejects.toThrow(InvalidFormatError);
      await expect(removeMetadata(notADataUrl)).rejects.toThrow('String input must be a data URL');
    });
  });

  describe('isFormatSupported', () => {
    it('should return true for all supported formats', () => {
      const supportedFormats = ['jpeg', 'png', 'webp', 'gif', 'svg', 'tiff', 'heic', 'dng', 'raw'] as const;

      for (const format of supportedFormats) {
        expect(isFormatSupported(format)).toBe(true);
      }
    });

    it('should return false for unknown', () => {
      expect(isFormatSupported('unknown')).toBe(false);
    });
  });

  describe('getSupportedFormats', () => {
    it('should return array of 9 supported formats', () => {
      const formats = getSupportedFormats();

      expect(Array.isArray(formats)).toBe(true);
      expect(formats.length).toBe(9);
    });

    it('should not include unknown', () => {
      const formats = getSupportedFormats();

      expect(formats).not.toContain('unknown');
    });

    it('should include all expected formats', () => {
      const formats = getSupportedFormats();

      expect(formats).toContain('jpeg');
      expect(formats).toContain('png');
      expect(formats).toContain('webp');
      expect(formats).toContain('gif');
      expect(formats).toContain('svg');
      expect(formats).toContain('tiff');
      expect(formats).toContain('heic');
      expect(formats).toContain('dng');
      expect(formats).toContain('raw');
    });
  });
});
