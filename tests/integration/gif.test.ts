import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { removeMetadata, detectFormat, getMetadataTypes } from '../../src/index';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '../fixtures');

describe('GIF Integration Tests', () => {
  describe('with_comment.gif', () => {
    let imageBytes: Uint8Array;

    beforeAll(() => {
      imageBytes = new Uint8Array(readFileSync(join(FIXTURES_DIR, 'with_comment.gif')));
    });

    it('should detect as GIF format', () => {
      expect(detectFormat(imageBytes)).toBe('gif');
    });

    it('should detect comment metadata', () => {
      const types = getMetadataTypes(imageBytes);
      expect(types).toContain('Comment');
    });

    it('should remove comment and produce valid GIF', async () => {
      const result = await removeMetadata(imageBytes);

      expect(result.format).toBe('gif');
      expect(result.removedMetadata).toContain('Comment');
      expect(result.cleanedSize).toBeLessThan(result.originalSize);

      // Verify output is valid GIF
      expect(result.data[0]).toBe(0x47); // G
      expect(result.data[1]).toBe(0x49); // I
      expect(result.data[2]).toBe(0x46); // F

      // Verify no comment remains
      const cleanedTypes = getMetadataTypes(result.data);
      expect(cleanedTypes).not.toContain('Comment');
    });
  });

  describe('with_xmp.gif', () => {
    let imageBytes: Uint8Array;

    beforeAll(() => {
      imageBytes = new Uint8Array(readFileSync(join(FIXTURES_DIR, 'with_xmp.gif')));
    });

    it('should detect XMP and comment metadata', () => {
      const types = getMetadataTypes(imageBytes);
      expect(types.length).toBeGreaterThan(0);
    });

    it('should remove all metadata', async () => {
      const result = await removeMetadata(imageBytes);

      expect(result.format).toBe('gif');
      expect(result.removedMetadata.length).toBeGreaterThan(0);

      // Verify cleaned file is valid GIF
      expect(result.data[0]).toBe(0x47);
      expect(result.data[1]).toBe(0x49);
      expect(result.data[2]).toBe(0x46);
    });
  });

  describe('animated.gif', () => {
    let imageBytes: Uint8Array;

    beforeAll(() => {
      imageBytes = new Uint8Array(readFileSync(join(FIXTURES_DIR, 'animated.gif')));
    });

    it('should preserve NETSCAPE extension (animation looping)', async () => {
      const result = await removeMetadata(imageBytes);

      expect(result.format).toBe('gif');

      // Should remove comment but preserve animation
      expect(result.removedMetadata).toContain('Comment');

      // File should still be valid GIF
      expect(result.data[0]).toBe(0x47);

      // NETSCAPE extension should still be present
      // Look for NETSCAPE in the output
      const outputStr = Buffer.from(result.data).toString('binary');
      expect(outputStr).toContain('NETSCAPE');
    });

    it('should preserve graphics control extension (animation timing)', async () => {
      const result = await removeMetadata(imageBytes);

      // Graphics control extension marker: 0x21 0xf9
      let hasGraphicsControl = false;
      for (let i = 0; i < result.data.length - 1; i++) {
        if (result.data[i] === 0x21 && result.data[i + 1] === 0xf9) {
          hasGraphicsControl = true;
          break;
        }
      }
      expect(hasGraphicsControl).toBe(true);
    });
  });

  describe('minimal.gif', () => {
    let imageBytes: Uint8Array;

    beforeAll(() => {
      imageBytes = new Uint8Array(readFileSync(join(FIXTURES_DIR, 'minimal.gif')));
    });

    it('should handle GIF without metadata', async () => {
      const types = getMetadataTypes(imageBytes);
      expect(types.length).toBe(0);

      const result = await removeMetadata(imageBytes);
      expect(result.format).toBe('gif');
      expect(result.removedMetadata.length).toBe(0);

      // Size should be unchanged
      expect(result.cleanedSize).toBe(result.originalSize);
    });
  });
});
