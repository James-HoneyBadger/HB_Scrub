/**
 * Tests for format handlers
 *
 * Each handler is tested against minimal synthetic binary fixtures.
 * Covers remove(), getMetadataTypes(), and read() for every format.
 */

import { describe, it, expect } from 'vitest';
import * as jpeg from '../src/formats/jpeg.js';
import * as png from '../src/formats/png.js';
import * as webp from '../src/formats/webp.js';
import * as gif from '../src/formats/gif.js';
import * as svg from '../src/formats/svg.js';
import * as pdf from '../src/formats/pdf.js';
import { concat, fromAscii } from '../src/binary/buffer.js';
import { writeUint32BE, writeUint16BE } from '../src/binary/dataview.js';
import { crc32Png } from '../src/binary/crc32.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const te = new TextEncoder();

/** Build a JPEG file from segments. Each segment: [marker_byte, ...data]. */
function buildJpeg(...segments: Uint8Array[]): Uint8Array {
  return concat(new Uint8Array([0xff, 0xd8]), ...segments, new Uint8Array([0xff, 0xd9]));
}

/** Build a JPEG APP segment: FF <marker_byte> <length_u16_be> <payload>. */
function jpegApp(markerByte: number, payload: Uint8Array): Uint8Array {
  const length = payload.length + 2; // length includes itself
  const seg = new Uint8Array(4 + payload.length);
  seg[0] = 0xff;
  seg[1] = markerByte;
  seg[2] = (length >> 8) & 0xff;
  seg[3] = length & 0xff;
  seg.set(payload, 4);
  return seg;
}

/** Build a PNG chunk from type (4 chars) and data. */
function pngChunk(type: string, data: Uint8Array = new Uint8Array(0)): Uint8Array {
  const typeBytes = fromAscii(type);
  const chunk = new Uint8Array(12 + data.length);
  writeUint32BE(chunk, 0, data.length);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);
  const crc = crc32Png(typeBytes, data);
  writeUint32BE(chunk, 8 + data.length, crc);
  return chunk;
}

/** Build a minimal valid PNG with given ancillary chunks inserted before IEND. */
function buildPng(extraChunks: Uint8Array[] = []): Uint8Array {
  const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  // Minimal IHDR: 1x1, 8-bit RGBA
  const ihdrData = new Uint8Array(13);
  writeUint32BE(ihdrData, 0, 1); // width
  writeUint32BE(ihdrData, 4, 1); // height
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 6;  // color type (RGBA)
  const ihdr = pngChunk('IHDR', ihdrData);
  // Minimal IDAT (empty — enough for parsing tests)
  const idat = pngChunk('IDAT', new Uint8Array([0x08, 0x1d, 0x01, 0x02, 0x00, 0xfd, 0xff, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01]));
  const iend = pngChunk('IEND');
  return concat(sig, ihdr, idat, ...extraChunks, iend);
}

/** Build a minimal WebP file with given chunks after WEBP marker. */
function buildWebP(chunks: Uint8Array[]): Uint8Array {
  const inner = concat(...chunks);
  const totalSize = 4 + inner.length; // "WEBP" + chunks
  const header = new Uint8Array(12);
  header.set(fromAscii('RIFF'), 0);
  writeUint32BE(header, 4, ((totalSize & 0xff) << 24) | ((totalSize >> 8 & 0xff) << 16) | ((totalSize >> 16 & 0xff) << 8) | ((totalSize >> 24) & 0xff)); // LE size
  header.set(fromAscii('WEBP'), 8);
  // Correct approach: write as little-endian
  const le = new Uint8Array(12);
  le.set(fromAscii('RIFF'), 0);
  le[4] = totalSize & 0xff;
  le[5] = (totalSize >> 8) & 0xff;
  le[6] = (totalSize >> 16) & 0xff;
  le[7] = (totalSize >> 24) & 0xff;
  le.set(fromAscii('WEBP'), 8);
  return concat(le, ...chunks);
}

/** Build a WebP RIFF chunk: fourcc (4 bytes) + LE size (4) + data (+ padding). */
function webpChunk(fourcc: string, data: Uint8Array): Uint8Array {
  const padded = data.length % 2 === 0 ? data.length : data.length + 1;
  const chunk = new Uint8Array(8 + padded);
  chunk.set(fromAscii(fourcc), 0);
  chunk[4] = data.length & 0xff;
  chunk[5] = (data.length >> 8) & 0xff;
  chunk[6] = (data.length >> 16) & 0xff;
  chunk[7] = (data.length >> 24) & 0xff;
  chunk.set(data, 8);
  return chunk;
}

// ── JPEG ──────────────────────────────────────────────────────────────────────

describe('jpeg handler', () => {
  const cleanJpeg = buildJpeg();

  it('remove() returns data for clean JPEG unchanged', () => {
    const result = jpeg.remove(cleanJpeg);
    // Should at least contain SOI and EOI
    expect(result[0]).toBe(0xff);
    expect(result[1]).toBe(0xd8);
    expect(result[result.length - 2]).toBe(0xff);
    expect(result[result.length - 1]).toBe(0xd9);
  });

  it('remove() strips EXIF segment', () => {
    const exifPayload = concat(fromAscii('Exif\x00\x00'), new Uint8Array(20));
    const jpegWithExif = buildJpeg(jpegApp(0xe1, exifPayload));
    const result = jpeg.remove(jpegWithExif);
    // Result should be smaller (EXIF removed)
    expect(result.length).toBeLessThan(jpegWithExif.length);
  });

  it('remove() strips Comment segment', () => {
    const comment = fromAscii('This is a comment');
    const jpegWithComment = buildJpeg(jpegApp(0xfe, comment));
    const result = jpeg.remove(jpegWithComment);
    expect(result.length).toBeLessThan(jpegWithComment.length);
  });

  it('getMetadataTypes() returns empty for clean JPEG', () => {
    const types = jpeg.getMetadataTypes(cleanJpeg);
    expect(types).toEqual([]);
  });

  it('getMetadataTypes() detects EXIF', () => {
    const exifPayload = concat(fromAscii('Exif\x00\x00'), new Uint8Array(20));
    const jpegWithExif = buildJpeg(jpegApp(0xe1, exifPayload));
    const types = jpeg.getMetadataTypes(jpegWithExif);
    expect(types).toContain('EXIF');
  });

  it('getMetadataTypes() detects Comment', () => {
    const jpegWithComment = buildJpeg(jpegApp(0xfe, fromAscii('hello')));
    const types = jpeg.getMetadataTypes(jpegWithComment);
    expect(types).toContain('Comment');
  });

  it('read() returns partial MetadataMap', () => {
    const result = jpeg.read(cleanJpeg);
    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
  });
});

// ── PNG ───────────────────────────────────────────────────────────────────────

describe('png handler', () => {
  const cleanPng = buildPng();

  it('remove() keeps valid PNG structure', () => {
    const result = png.remove(cleanPng);
    // Check PNG signature
    expect(result[0]).toBe(0x89);
    expect(result[1]).toBe(0x50); // P
    expect(result[2]).toBe(0x4e); // N
    expect(result[3]).toBe(0x47); // G
  });

  it('remove() strips tEXt chunk', () => {
    const textData = concat(fromAscii('Comment\x00Hello world'));
    const textChunk = pngChunk('tEXt', textData);
    const pngWithText = buildPng([textChunk]);
    const result = png.remove(pngWithText);
    expect(result.length).toBeLessThan(pngWithText.length);
  });

  it('remove() strips eXIf chunk', () => {
    const exifData = new Uint8Array(30);
    const exifChunk = pngChunk('eXIf', exifData);
    const pngWithExif = buildPng([exifChunk]);
    const result = png.remove(pngWithExif);
    expect(result.length).toBeLessThan(pngWithExif.length);
  });

  it('remove() strips tIME chunk', () => {
    const timeData = new Uint8Array(7); // year(2) + month + day + hour + min + sec
    const timeChunk = pngChunk('tIME', timeData);
    const pngWithTime = buildPng([timeChunk]);
    const result = png.remove(pngWithTime);
    expect(result.length).toBeLessThan(pngWithTime.length);
  });

  it('getMetadataTypes() returns empty for clean PNG', () => {
    const types = png.getMetadataTypes(cleanPng);
    expect(types).toEqual([]);
  });

  it('getMetadataTypes() detects text metadata', () => {
    const textChunk = pngChunk('tEXt', concat(fromAscii('Author\x00Me')));
    const pngWithText = buildPng([textChunk]);
    const types = png.getMetadataTypes(pngWithText);
    expect(types.length).toBeGreaterThan(0);
  });

  it('read() returns partial MetadataMap', () => {
    const result = png.read(cleanPng);
    expect(result).toBeDefined();
  });
});

// ── GIF ───────────────────────────────────────────────────────────────────────

describe('gif handler', () => {
  /** Minimal clean GIF89a (no extensions). */
  const cleanGif = new Uint8Array([
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, // GIF89a
    0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, // LSD 1x1, no GCT
    0x3b, // Trailer
  ]);

  /** Build a GIF with comment extension. */
  function gifWithComment(text: string): Uint8Array {
    const commentBytes = fromAscii(text);
    const ext = new Uint8Array(4 + commentBytes.length);
    ext[0] = 0x21; // Extension introducer
    ext[1] = 0xfe; // Comment label
    ext[2] = commentBytes.length; // Sub-block size
    ext.set(commentBytes, 3);
    ext[3 + commentBytes.length] = 0x00; // Block terminator
    // Insert before trailer
    return concat(
      cleanGif.slice(0, cleanGif.length - 1),
      ext,
      new Uint8Array([0x3b]),
    );
  }

  it('remove() returns valid GIF for clean input', () => {
    const result = gif.remove(cleanGif);
    expect(result[0]).toBe(0x47); // G
    expect(result[1]).toBe(0x49); // I
    expect(result[2]).toBe(0x46); // F
    expect(result[result.length - 1]).toBe(0x3b); // Trailer
  });

  it('remove() strips comment extension', () => {
    const gifWithCmt = gifWithComment('This is a test comment');
    const result = gif.remove(gifWithCmt);
    expect(result.length).toBeLessThan(gifWithCmt.length);
  });

  it('getMetadataTypes() returns empty for clean GIF', () => {
    const types = gif.getMetadataTypes(cleanGif);
    expect(types).toEqual([]);
  });

  it('getMetadataTypes() detects Comment', () => {
    const gifWithCmt = gifWithComment('hello');
    const types = gif.getMetadataTypes(gifWithCmt);
    expect(types).toContain('Comment');
  });

  it('read() returns partial MetadataMap', () => {
    const result = gif.read(cleanGif);
    expect(result).toBeDefined();
  });

  it('read() extracts comment text into imageDescription', () => {
    const gifWithCmt = gifWithComment('Created by GIMP');
    const result = gif.read(gifWithCmt);
    expect(result.imageDescription).toBe('Created by GIMP');
  });

  it('read() stores all comments in raw.comments', () => {
    // Build a GIF with two comments
    const comment1Bytes = fromAscii('First');
    const ext1 = new Uint8Array(4 + comment1Bytes.length);
    ext1[0] = 0x21; ext1[1] = 0xfe; ext1[2] = comment1Bytes.length;
    ext1.set(comment1Bytes, 3);
    ext1[3 + comment1Bytes.length] = 0x00;

    const comment2Bytes = fromAscii('Second');
    const ext2 = new Uint8Array(4 + comment2Bytes.length);
    ext2[0] = 0x21; ext2[1] = 0xfe; ext2[2] = comment2Bytes.length;
    ext2.set(comment2Bytes, 3);
    ext2[3 + comment2Bytes.length] = 0x00;

    const gifWith2 = concat(
      cleanGif.slice(0, cleanGif.length - 1),
      ext1,
      ext2,
      new Uint8Array([0x3b]),
    );
    const result = gif.read(gifWith2);
    expect(result.raw).toBeDefined();
    expect(result.raw!.comments).toEqual(['First', 'Second']);
    // imageDescription should be the first comment
    expect(result.imageDescription).toBe('First');
  });

  it('read() returns empty for clean GIF (no comments)', () => {
    const result = gif.read(cleanGif);
    expect(result.imageDescription).toBeUndefined();
    expect(result.raw).toBeUndefined();
  });
});

// ── SVG ───────────────────────────────────────────────────────────────────────

describe('svg handler', () => {
  const cleanSvg = te.encode('<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>');

  it('remove() returns valid SVG', () => {
    const result = svg.remove(cleanSvg);
    const text = new TextDecoder().decode(result);
    expect(text).toContain('<svg');
    expect(text).toContain('</svg>');
  });

  it('remove() strips <metadata> element', () => {
    const svgWithMeta = te.encode(
      '<svg xmlns="http://www.w3.org/2000/svg"><metadata><rdf:RDF>test</rdf:RDF></metadata><rect width="1" height="1"/></svg>'
    );
    const result = svg.remove(svgWithMeta);
    const text = new TextDecoder().decode(result);
    expect(text).not.toContain('<metadata>');
    expect(text).not.toContain('rdf:RDF');
  });

  it('remove() strips XML comments', () => {
    const svgWithComment = te.encode(
      '<svg xmlns="http://www.w3.org/2000/svg"><!-- Created by Inkscape --><rect width="1" height="1"/></svg>'
    );
    const result = svg.remove(svgWithComment);
    const text = new TextDecoder().decode(result);
    expect(text).not.toContain('<!--');
  });

  it('remove() strips <title> by default', () => {
    const svgWithTitle = te.encode(
      '<svg xmlns="http://www.w3.org/2000/svg"><title>My Drawing</title><rect width="1" height="1"/></svg>'
    );
    const result = svg.remove(svgWithTitle);
    const text = new TextDecoder().decode(result);
    expect(text).not.toContain('<title>');
  });

  it('remove() preserves <title> with preserveTitle option', () => {
    const svgWithTitle = te.encode(
      '<svg xmlns="http://www.w3.org/2000/svg"><title>My Drawing</title><rect width="1" height="1"/></svg>'
    );
    const result = svg.remove(svgWithTitle, { preserveTitle: true });
    const text = new TextDecoder().decode(result);
    expect(text).toContain('<title>');
  });

  it('remove() strips <desc> by default', () => {
    const svgWithDesc = te.encode(
      '<svg xmlns="http://www.w3.org/2000/svg"><desc>A description</desc><rect width="1" height="1"/></svg>'
    );
    const result = svg.remove(svgWithDesc);
    const text = new TextDecoder().decode(result);
    expect(text).not.toContain('<desc>');
  });

  it('remove() preserves <desc> with preserveDescription option', () => {
    const svgWithDesc = te.encode(
      '<svg xmlns="http://www.w3.org/2000/svg"><desc>A description</desc><rect width="1" height="1"/></svg>'
    );
    const result = svg.remove(svgWithDesc, { preserveDescription: true });
    const text = new TextDecoder().decode(result);
    expect(text).toContain('<desc>');
  });

  it('getMetadataTypes() returns empty for clean SVG', () => {
    const types = svg.getMetadataTypes(cleanSvg);
    expect(types).toEqual([]);
  });

  it('getMetadataTypes() detects Title', () => {
    const svgWithTitle = te.encode(
      '<svg xmlns="http://www.w3.org/2000/svg"><title>Foo</title></svg>'
    );
    const types = svg.getMetadataTypes(svgWithTitle);
    expect(types).toContain('Title');
  });

  it('getMetadataTypes() detects XML comments', () => {
    const svgWithComment = te.encode(
      '<svg xmlns="http://www.w3.org/2000/svg"><!-- comment --></svg>'
    );
    const types = svg.getMetadataTypes(svgWithComment);
    expect(types).toContain('XML comments');
  });

  it('read() returns partial MetadataMap', () => {
    const result = svg.read(cleanSvg);
    expect(result).toBeDefined();
  });
});

// ── PDF ───────────────────────────────────────────────────────────────────────

describe('pdf handler', () => {
  /** Minimal PDF with Info dictionary containing Author. */
  function buildPdf(infoEntries: string, xmpStream = ''): Uint8Array {
    let content = `%PDF-1.4\n`;
    content += `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;
    content += `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`;
    content += `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\n`;

    if (infoEntries) {
      content += `4 0 obj\n<< ${infoEntries} >>\nendobj\n`;
    }

    if (xmpStream) {
      content += `5 0 obj\n<< /Type /Metadata /Subtype /XML /Length ${xmpStream.length} >>\nstream\n${xmpStream}\nendstream\nendobj\n`;
    }

    const xrefOffset = content.length;
    content += `xref\n0 1\n0000000000 65535 f \ntrailer\n<< /Size 6 /Root 1 0 R`;
    if (infoEntries) content += ` /Info 4 0 R`;
    content += ` >>\nstartxref\n${xrefOffset}\n%%EOF`;

    return te.encode(content);
  }

  const cleanPdf = buildPdf('');

  it('remove() returns data starting with %PDF-', () => {
    const pdfWithAuthor = buildPdf('/Author (John Doe)');
    const result = pdf.remove(pdfWithAuthor);
    const text = new TextDecoder().decode(result.slice(0, 5));
    expect(text).toBe('%PDF-');
  });

  it('remove() blanks Author string', () => {
    const pdfWithAuthor = buildPdf('/Author (John Doe)');
    const result = pdf.remove(pdfWithAuthor);
    const text = new TextDecoder().decode(result);
    // The parenthesized value should be blanked
    expect(text).not.toContain('John Doe');
  });

  it('getMetadataTypes() returns empty for clean PDF', () => {
    const types = pdf.getMetadataTypes(cleanPdf);
    expect(types).toEqual([]);
  });

  it('getMetadataTypes() detects Document Info', () => {
    const pdfWithAuthor = buildPdf('/Author (Test Author)');
    const types = pdf.getMetadataTypes(pdfWithAuthor);
    expect(types.length).toBeGreaterThan(0);
  });

  it('read() returns partial MetadataMap', () => {
    const result = pdf.read(cleanPdf);
    expect(result).toBeDefined();
  });
});

// ── WebP ──────────────────────────────────────────────────────────────────────

describe('webp handler', () => {
  /** Minimal VP8 chunk (simplified — just enough bytes for parsing). */
  const vp8Data = new Uint8Array(10);
  const vp8Chunk = webpChunk('VP8 ', vp8Data);

  const cleanWebP = buildWebP([vp8Chunk]);

  it('remove() keeps RIFF/WEBP header', () => {
    const result = webp.remove(cleanWebP);
    const riff = new TextDecoder().decode(result.slice(0, 4));
    const webpMark = new TextDecoder().decode(result.slice(8, 12));
    expect(riff).toBe('RIFF');
    expect(webpMark).toBe('WEBP');
  });

  it('remove() strips EXIF chunk', () => {
    const exifData = new Uint8Array(20);
    const exifChunk = webpChunk('EXIF', exifData);
    // VP8X (extended format) header needed for EXIF
    const vp8xData = new Uint8Array(10);
    vp8xData[0] = 0x08; // EXIF flag set
    const vp8xChunk = webpChunk('VP8X', vp8xData);
    const webpWithExif = buildWebP([vp8xChunk, vp8Chunk, exifChunk]);
    const result = webp.remove(webpWithExif);
    expect(result.length).toBeLessThan(webpWithExif.length);
  });

  it('getMetadataTypes() returns empty for clean WebP', () => {
    const types = webp.getMetadataTypes(cleanWebP);
    expect(types).toEqual([]);
  });

  it('read() returns partial MetadataMap', () => {
    const result = webp.read(cleanWebP);
    expect(result).toBeDefined();
  });
});

// ── WebP inject support ───────────────────────────────────────────────────────

import { removeMetadataSync } from '../src/operations/remove.js';
import { detectFormat } from '../src/detect.js';

describe('webp inject support', () => {
  /** Build a minimal WebP with VP8X + VP8 chunk for inject testing. */
  function buildWebPForInject(): Uint8Array {
    const vp8xData = new Uint8Array(10);
    // Set width 1 height 1
    vp8xData[4] = 0; // widthMinusOne LE
    vp8xData[7] = 0; // heightMinusOne LE
    const vp8x = webpChunk('VP8X', vp8xData);
    const vp8Data = new Uint8Array(10);
    const vp8 = webpChunk('VP8 ', vp8Data);
    return buildWebP([vp8x, vp8]);
  }

  it('removeMetadataSync injects copyright into WebP', () => {
    const input = buildWebPForInject();
    expect(detectFormat(input)).toBe('webp');
    const result = removeMetadataSync(input, {
      inject: { copyright: '© 2025 Test Author' },
    });
    expect(result.format).toBe('webp');
    // The output should contain an EXIF chunk
    const types = webp.getMetadataTypes(result.data);
    expect(types).toContain('EXIF');
  });

  it('injected EXIF is readable after round-trip', () => {
    const input = buildWebPForInject();
    const result = removeMetadataSync(input, {
      inject: { copyright: '(c) 2025 Test', artist: 'Demo' },
    });
    const meta = webp.read(result.data);
    expect(meta.copyright).toBe('(c) 2025 Test');
    expect(meta.artist).toBe('Demo');
  });

  it('VP8X EXIF flag is set after injection when VP8X exists', () => {
    const input = buildWebPForInject();
    const result = removeMetadataSync(input, {
      inject: { software: 'HB Scrub' },
    });
    // Find VP8X in the output (it may or may not exist depending on whether
    // the remove step preserved it). If VP8X exists, EXIF flag should be set.
    const out = result.data;
    if (out.length >= 30) {
      const fourcc = new TextDecoder().decode(out.slice(12, 16));
      if (fourcc === 'VP8X') {
        expect(out[20]! & (1 << 3)).toBeTruthy();
      }
    }
    // In any case, the output should contain an EXIF chunk
    const types = webp.getMetadataTypes(result.data);
    expect(types).toContain('EXIF');
  });
});

// ── High-level remove/verify round-trip ───────────────────────────────────────

describe('round-trip: remove then verify clean', () => {
  it('JPEG is clean after remove()', () => {
    const exifPayload = concat(fromAscii('Exif\x00\x00'), new Uint8Array(20));
    const dirty = buildJpeg(jpegApp(0xe1, exifPayload));
    const cleaned = jpeg.remove(dirty);
    const remaining = jpeg.getMetadataTypes(cleaned);
    expect(remaining).toEqual([]);
  });

  it('PNG is clean after remove()', () => {
    const textChunk = pngChunk('tEXt', concat(fromAscii('Author\x00Test')));
    const dirty = buildPng([textChunk]);
    const cleaned = png.remove(dirty);
    const remaining = png.getMetadataTypes(cleaned);
    expect(remaining).toEqual([]);
  });

  it('SVG is clean after remove()', () => {
    const dirty = te.encode(
      '<svg xmlns="http://www.w3.org/2000/svg"><!-- comment --><metadata>secret</metadata><title>T</title><rect width="1" height="1"/></svg>'
    );
    const cleaned = svg.remove(dirty);
    const remaining = svg.getMetadataTypes(cleaned);
    expect(remaining).toEqual([]);
  });
});
