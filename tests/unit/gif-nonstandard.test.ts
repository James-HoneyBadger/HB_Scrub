import { describe, it, expect } from 'vitest';
import { gif } from '../../src/formats/gif';

/**
 * Create a GIF with a non-standard application extension (block size != 11)
 */
function createGifWithNonStandardExtension(): Uint8Array {
  const parts: number[] = [];

  // GIF Header
  parts.push(0x47, 0x49, 0x46, 0x38, 0x39, 0x61); // GIF89a

  // Logical Screen Descriptor
  parts.push(0x01, 0x00); // Width: 1
  parts.push(0x01, 0x00); // Height: 1
  parts.push(0x00); // Packed byte (no global color table)
  parts.push(0x00); // Background color
  parts.push(0x00); // Pixel aspect ratio

  // Non-standard application extension (block size = 8 instead of 11)
  parts.push(0x21); // Extension introducer
  parts.push(0xff); // Application extension label
  parts.push(0x08); // Block size = 8 (non-standard, should be 11)
  // 8 bytes of identifier
  parts.push(0x41, 0x42, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48); // "ABCDEFGH"
  // Sub-block with data
  parts.push(0x03); // Sub-block size
  parts.push(0x01, 0x02, 0x03); // Data
  parts.push(0x00); // Block terminator

  // Image Descriptor
  parts.push(0x2c);
  parts.push(0x00, 0x00, 0x00, 0x00);
  parts.push(0x01, 0x00, 0x01, 0x00);
  parts.push(0x00);

  // Image Data
  parts.push(0x02);
  parts.push(0x02);
  parts.push(0x44, 0x01);
  parts.push(0x00);

  // Trailer
  parts.push(0x3b);

  return new Uint8Array(parts);
}

describe('GIF non-standard extension handling', () => {
  it('should not silently drop non-standard application extensions', () => {
    const input = createGifWithNonStandardExtension();

    // Parse and verify the extension is captured as a block
    const blocks = gif.parseBlocks(input);
    const extensions = blocks.filter(b => b.type === 'extension');

    // The non-standard extension should be parsed as a block
    expect(extensions.length).toBeGreaterThan(0);
  });

  it('should produce valid GIF after removing metadata', () => {
    const input = createGifWithNonStandardExtension();
    const result = gif.remove(input);

    // Should still be valid GIF
    expect(result[0]).toBe(0x47); // G
    expect(result[1]).toBe(0x49); // I
    expect(result[2]).toBe(0x46); // F

    // Should have image data
    expect(result.length).toBeGreaterThan(20);
  });
});
