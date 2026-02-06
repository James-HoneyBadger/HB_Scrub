import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { removeMetadata, detectFormat, getMetadataTypes } from '../../src/index';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '../fixtures');

describe('SVG Integration Tests', () => {
  describe('test.svg (with full metadata)', () => {
    let imageBytes: Uint8Array;
    let originalText: string;

    beforeAll(() => {
      imageBytes = new Uint8Array(readFileSync(join(FIXTURES_DIR, 'test.svg')));
      originalText = new TextDecoder().decode(imageBytes);
    });

    it('should detect as SVG format', () => {
      expect(detectFormat(imageBytes)).toBe('svg');
    });

    it('should detect various metadata types', () => {
      const types = getMetadataTypes(imageBytes);
      expect(types.length).toBeGreaterThan(0);
      // Should detect inkscape, sodipodi, metadata, comments, etc.
    });

    it('should remove metadata element', async () => {
      const result = await removeMetadata(imageBytes);
      const cleanedText = new TextDecoder().decode(result.data);

      expect(result.format).toBe('svg');
      expect(cleanedText).not.toContain('<metadata');
      expect(cleanedText).not.toContain('</metadata>');
    });

    it('should remove RDF/Dublin Core metadata', async () => {
      const result = await removeMetadata(imageBytes);
      const cleanedText = new TextDecoder().decode(result.data);

      expect(cleanedText).not.toContain('<rdf:RDF');
      expect(cleanedText).not.toContain('<dc:creator');
      expect(cleanedText).not.toContain('<dc:title');
    });

    it('should remove XML comments', async () => {
      expect(originalText).toContain('<!--');

      const result = await removeMetadata(imageBytes);
      const cleanedText = new TextDecoder().decode(result.data);

      expect(cleanedText).not.toContain('<!--');
      expect(cleanedText).not.toContain('-->');
    });

    it('should remove Inkscape/Sodipodi namespaced elements', async () => {
      const result = await removeMetadata(imageBytes);
      const cleanedText = new TextDecoder().decode(result.data);

      expect(cleanedText).not.toContain('<sodipodi:');
      expect(cleanedText).not.toContain('inkscape:label');
    });

    it('should remove data- attributes', async () => {
      expect(originalText).toContain('data-author');

      const result = await removeMetadata(imageBytes);
      const cleanedText = new TextDecoder().decode(result.data);

      expect(cleanedText).not.toContain('data-author');
      expect(cleanedText).not.toContain('data-created');
    });

    it('should remove title and desc by default', async () => {
      expect(originalText).toContain('<title>');
      expect(originalText).toContain('<desc>');

      const result = await removeMetadata(imageBytes);
      const cleanedText = new TextDecoder().decode(result.data);

      expect(cleanedText).not.toContain('<title>');
      expect(cleanedText).not.toContain('<desc>');
    });

    it('should preserve title when requested', async () => {
      const result = await removeMetadata(imageBytes, { preserveTitle: true });
      const cleanedText = new TextDecoder().decode(result.data);

      expect(cleanedText).toContain('<title>');
    });

    it('should preserve description when requested', async () => {
      const result = await removeMetadata(imageBytes, { preserveDescription: true });
      const cleanedText = new TextDecoder().decode(result.data);

      expect(cleanedText).toContain('<desc>');
    });

    it('should preserve actual SVG content', async () => {
      const result = await removeMetadata(imageBytes);
      const cleanedText = new TextDecoder().decode(result.data);

      // Core SVG structure should remain
      expect(cleanedText).toContain('<svg');
      expect(cleanedText).toContain('</svg>');
      expect(cleanedText).toContain('<rect');
      expect(cleanedText).toContain('<circle');
      expect(cleanedText).toContain('fill="blue"');
    });

    it('should produce smaller file', async () => {
      const result = await removeMetadata(imageBytes);

      expect(result.cleanedSize).toBeLessThan(result.originalSize);
    });
  });

  describe('minimal.svg (no metadata)', () => {
    let imageBytes: Uint8Array;

    beforeAll(() => {
      imageBytes = new Uint8Array(readFileSync(join(FIXTURES_DIR, 'minimal.svg')));
    });

    it('should detect as SVG', () => {
      expect(detectFormat(imageBytes)).toBe('svg');
    });

    it('should handle SVG without metadata', async () => {
      const result = await removeMetadata(imageBytes);

      expect(result.format).toBe('svg');

      const cleanedText = new TextDecoder().decode(result.data);
      expect(cleanedText).toContain('<svg');
      expect(cleanedText).toContain('<rect');
    });
  });
});
