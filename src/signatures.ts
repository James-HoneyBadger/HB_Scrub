/**
 * File format signatures (magic bytes) for detection and validation
 */
export const FILE_SIGNATURES = {
  // Image formats
  JPEG: new Uint8Array([0xff, 0xd8, 0xff]),
  JPEG_SOI: new Uint8Array([0xff, 0xd8]), // Start of Image marker only
  PNG: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  GIF87a: new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]),
  GIF89a: new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]),

  // WebP (RIFF container)
  RIFF: new Uint8Array([0x52, 0x49, 0x46, 0x46]),
  WEBP: new Uint8Array([0x57, 0x45, 0x42, 0x50]),

  // TIFF-based formats
  TIFF_LE: new Uint8Array([0x49, 0x49, 0x2a, 0x00]), // II*\0 (little-endian)
  TIFF_BE: new Uint8Array([0x4d, 0x4d, 0x00, 0x2a]), // MM\0* (big-endian)

  // HEIC/HEIF/AVIF (ISOBMFF container)
  FTYP: new Uint8Array([0x66, 0x74, 0x79, 0x70]), // ftyp (at offset 4)

  // PDF
  PDF: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]), // %PDF-

  // MP4 / MOV — ftyp brands detected separately; size field varies,
  // but ftyp must appear at offset 4.  We reuse FTYP for detection.
  // Additional known MP4/MOV brand markers checked in detect.ts.
} as const;
