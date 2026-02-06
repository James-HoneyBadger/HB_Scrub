/**
 * Creates test GIF files with various metadata for testing
 */

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '../fixtures');

/**
 * Create a minimal GIF with a comment extension
 */
function createGifWithComment(): Uint8Array {
  const parts: number[] = [];

  // GIF Header (GIF89a)
  parts.push(0x47, 0x49, 0x46, 0x38, 0x39, 0x61); // "GIF89a"

  // Logical Screen Descriptor
  parts.push(0x01, 0x00); // Width: 1
  parts.push(0x01, 0x00); // Height: 1
  parts.push(0x00);       // Packed byte (no global color table)
  parts.push(0x00);       // Background color index
  parts.push(0x00);       // Pixel aspect ratio

  // Comment Extension
  parts.push(0x21);       // Extension introducer
  parts.push(0xfe);       // Comment extension label
  const comment = "This is a private comment with location: 40.7128,-74.0060";
  parts.push(comment.length); // Block size
  for (let i = 0; i < comment.length; i++) {
    parts.push(comment.charCodeAt(i));
  }
  parts.push(0x00);       // Block terminator

  // Image Descriptor
  parts.push(0x2c);       // Image separator
  parts.push(0x00, 0x00); // Left position
  parts.push(0x00, 0x00); // Top position
  parts.push(0x01, 0x00); // Width: 1
  parts.push(0x01, 0x00); // Height: 1
  parts.push(0x00);       // Packed byte (no local color table)

  // Image Data
  parts.push(0x02);       // LZW minimum code size
  parts.push(0x02);       // Block size
  parts.push(0x44, 0x01); // Compressed data (1 black pixel)
  parts.push(0x00);       // Block terminator

  // Trailer
  parts.push(0x3b);

  return new Uint8Array(parts);
}

/**
 * Create a GIF with XMP application extension
 */
function createGifWithXmp(): Uint8Array {
  const parts: number[] = [];

  // GIF Header (GIF89a)
  parts.push(0x47, 0x49, 0x46, 0x38, 0x39, 0x61);

  // Logical Screen Descriptor
  parts.push(0x01, 0x00); // Width: 1
  parts.push(0x01, 0x00); // Height: 1
  parts.push(0x80);       // Packed byte (global color table, 2 colors)
  parts.push(0x00);       // Background color index
  parts.push(0x00);       // Pixel aspect ratio

  // Global Color Table (2 colors: black and white)
  parts.push(0x00, 0x00, 0x00); // Black
  parts.push(0xff, 0xff, 0xff); // White

  // Comment Extension
  parts.push(0x21, 0xfe);
  const comment = "Author: John Doe, Date: 2024-01-15";
  parts.push(comment.length);
  for (let i = 0; i < comment.length; i++) {
    parts.push(comment.charCodeAt(i));
  }
  parts.push(0x00);

  // XMP Application Extension
  parts.push(0x21);       // Extension introducer
  parts.push(0xff);       // Application extension label
  parts.push(0x0b);       // Block size (11 bytes for app identifier)
  // "XMP DataXMP" identifier
  const xmpId = "XMP DataXMP";
  for (let i = 0; i < xmpId.length; i++) {
    parts.push(xmpId.charCodeAt(i));
  }
  // XMP data (simplified)
  const xmpData = "<x:xmpmeta><rdf:Description dc:creator='Test'/></x:xmpmeta>";
  parts.push(xmpData.length);
  for (let i = 0; i < xmpData.length; i++) {
    parts.push(xmpData.charCodeAt(i));
  }
  parts.push(0x00);       // Block terminator

  // Image Descriptor
  parts.push(0x2c);
  parts.push(0x00, 0x00);
  parts.push(0x00, 0x00);
  parts.push(0x01, 0x00);
  parts.push(0x01, 0x00);
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

/**
 * Create a GIF with NETSCAPE animation extension (should be preserved)
 */
function createAnimatedGif(): Uint8Array {
  const parts: number[] = [];

  // GIF Header
  parts.push(0x47, 0x49, 0x46, 0x38, 0x39, 0x61);

  // Logical Screen Descriptor
  parts.push(0x02, 0x00); // Width: 2
  parts.push(0x02, 0x00); // Height: 2
  parts.push(0x80);       // Global color table
  parts.push(0x00);
  parts.push(0x00);

  // Global Color Table
  parts.push(0xff, 0x00, 0x00); // Red
  parts.push(0x00, 0xff, 0x00); // Green

  // NETSCAPE Application Extension (for looping) - should be PRESERVED
  parts.push(0x21, 0xff);
  parts.push(0x0b);
  const netscape = "NETSCAPE2.0";
  for (let i = 0; i < netscape.length; i++) {
    parts.push(netscape.charCodeAt(i));
  }
  parts.push(0x03);       // Sub-block size
  parts.push(0x01);       // Loop indicator
  parts.push(0x00, 0x00); // Loop count (0 = infinite)
  parts.push(0x00);       // Block terminator

  // Comment Extension (should be REMOVED)
  parts.push(0x21, 0xfe);
  const comment = "Created by: Secret Author";
  parts.push(comment.length);
  for (let i = 0; i < comment.length; i++) {
    parts.push(comment.charCodeAt(i));
  }
  parts.push(0x00);

  // Graphics Control Extension (for animation timing) - should be PRESERVED
  parts.push(0x21, 0xf9);
  parts.push(0x04);       // Block size
  parts.push(0x00);       // Packed byte
  parts.push(0x0a, 0x00); // Delay time (10/100 seconds)
  parts.push(0x00);       // Transparent color index
  parts.push(0x00);       // Block terminator

  // First frame
  parts.push(0x2c);
  parts.push(0x00, 0x00, 0x00, 0x00);
  parts.push(0x02, 0x00, 0x02, 0x00);
  parts.push(0x00);
  parts.push(0x02);
  parts.push(0x02);
  parts.push(0x44, 0x01);
  parts.push(0x00);

  // Trailer
  parts.push(0x3b);

  return new Uint8Array(parts);
}

/**
 * Create a minimal GIF without metadata
 */
function createMinimalGif(): Uint8Array {
  const parts: number[] = [];

  // GIF Header
  parts.push(0x47, 0x49, 0x46, 0x38, 0x39, 0x61);

  // Logical Screen Descriptor
  parts.push(0x01, 0x00);
  parts.push(0x01, 0x00);
  parts.push(0x00);
  parts.push(0x00);
  parts.push(0x00);

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

// Generate all test GIFs
console.log('Creating test GIF files...');

writeFileSync(join(FIXTURES_DIR, 'with_comment.gif'), createGifWithComment());
console.log('Created: with_comment.gif');

writeFileSync(join(FIXTURES_DIR, 'with_xmp.gif'), createGifWithXmp());
console.log('Created: with_xmp.gif');

writeFileSync(join(FIXTURES_DIR, 'animated.gif'), createAnimatedGif());
console.log('Created: animated.gif');

writeFileSync(join(FIXTURES_DIR, 'minimal.gif'), createMinimalGif());
console.log('Created: minimal.gif');

console.log('Done!');
