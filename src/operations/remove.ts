import { SupportedFormat, RemoveOptions, RemoveResult } from '../types.js';
import { UnsupportedFormatError } from '../errors.js';
import { detectFormat } from '../detect.js';
import { normalizeInput } from '../binary/normalize.js';

import { jpeg } from '../formats/jpeg.js';
import { png } from '../formats/png.js';
import { webp } from '../formats/webp.js';
import { gif } from '../formats/gif.js';
import { svg } from '../formats/svg.js';
import { tiff } from '../formats/tiff.js';
import { heic } from '../formats/heic.js';
import { raw } from '../formats/raw.js';
import { avif } from '../formats/avif.js';
import { pdf } from '../formats/pdf.js';
import { mp4 } from '../formats/mp4.js';
import { getPlugin } from '../plugins.js';

import { readExifBlock } from '../exif/reader.js';
import {
  buildJpegExifSegment,
  buildRawExifBlock,
  buildRedactedGpsExif,
  wrapInJpegApp1,
} from '../exif/writer.js';
import { crc32Png } from '../binary/crc32.js';
import * as buffer from '../binary/buffer.js';
import * as dataview from '../binary/dataview.js';

/**
 * Format handler interface
 */
interface FormatHandler {
  remove: (data: Uint8Array, options: RemoveOptions) => Uint8Array;
  getMetadataTypes: (data: Uint8Array) => string[];
}

// ─── Field name → preserve-flag mapping ─────────────────────────────────────

const FIELD_TO_PRESERVE: Partial<Record<string, keyof RemoveOptions>> = {
  'ICC Profile': 'preserveColorProfile',
  Copyright: 'preserveCopyright',
  Orientation: 'preserveOrientation',
  Title: 'preserveTitle',
  Description: 'preserveDescription',
};

/**
 * Merge remove[]/keep[] into the legacy preserveX flags so every handler
 * respects the new field-level options without knowing about them.
 */
function applyFieldOptions(options: RemoveOptions): RemoveOptions {
  const { remove, keep } = options;
  if (!remove && !keep) {
    return options;
  }

  const merged = { ...options };

  if (remove && remove.length > 0) {
    // Denylist mode: remove ONLY the listed fields → preserve everything else.
    for (const [field, flag] of Object.entries(FIELD_TO_PRESERVE)) {
      if (!remove.includes(field as never)) {
        (merged as Record<string, unknown>)[flag as string] = true;
      }
    }
  }

  if (keep && keep.length > 0) {
    // Allowlist: always preserve listed fields, overrides denylist.
    for (const field of keep) {
      const flag = FIELD_TO_PRESERVE[field];
      if (flag) {
        (merged as Record<string, unknown>)[flag as string] = true;
      }
    }
  }

  return merged;
}

/**
 * Format handlers registry
 */
const handlers: Record<SupportedFormat, FormatHandler | null> = {
  jpeg,
  png,
  webp,
  gif,
  svg,
  tiff,
  heic,
  avif,
  pdf,
  mp4,
  mov: mp4,
  dng: {
    remove: (data, options) => raw.removeDng(data, options),
    getMetadataTypes: raw.getMetadataTypes,
  },
  raw: {
    remove: (data, options) => raw.remove(data, options).data,
    getMetadataTypes: raw.getMetadataTypes,
  },
  unknown: null,
};

/**
 * Re-export normalizeInput for backward compatibility.
 * Canonical source is now `../binary/normalize.js`.
 */
export { normalizeInput } from '../binary/normalize.js';

// ─── EXIF injection helper ─────────────────────────────────────────────────────

/** Prepend an EXIF APP1 segment to a JPEG that may or may not have one. */
function injectIntoJpeg(data: Uint8Array, segment: Uint8Array): Uint8Array {
  // JPEG starts with FFD8. Insert APP1 right after the SOI marker.
  if (data[0] !== 0xff || data[1] !== 0xd8) {
    return data;
  }
  const result = new Uint8Array(2 + segment.length + (data.length - 2));
  result.set(data.subarray(0, 2), 0);
  result.set(segment, 2);
  result.set(data.subarray(2), 2 + segment.length);
  return result;
}

/** Add/replace an eXIf chunk in a PNG. */
function injectIntoPng(data: Uint8Array, rawTiff: Uint8Array): Uint8Array {
  // Build a PNG eXIf chunk
  const chunkType = new Uint8Array([0x65, 0x58, 0x49, 0x66]); // 'eXIf'
  const length = rawTiff.length;
  const chunk = new Uint8Array(4 + 4 + length + 4); // len + type + data + crc
  const view = new DataView(chunk.buffer);
  view.setUint32(0, length, false);
  chunk.set(chunkType, 4);
  chunk.set(rawTiff, 8);
  // Compute correct CRC32 over chunk type + data
  view.setUint32(8 + length, crc32Png(chunkType, rawTiff), false);

  // Insert before IEND chunk (last 12 bytes of a valid PNG)
  const insertAt = data.length - 12;
  if (insertAt < 8) {
    return data;
  }
  const result = new Uint8Array(data.length + chunk.length);
  result.set(data.subarray(0, insertAt), 0);
  result.set(chunk, insertAt);
  result.set(data.subarray(insertAt), insertAt + chunk.length);
  return result;
}

/**
 * Inject an EXIF RIFF chunk into a WebP file and update the VP8X flags.
 *
 * Strategy:
 * 1. Build a RIFF "EXIF" sub-chunk: fourcc (4) + size LE (4) + tiffBlock + pad.
 * 2. Append it before the file trailer.
 * 3. If a VP8X chunk exists, set the EXIF flag (bit 3); otherwise create one.
 * 4. Rewrite the RIFF file-size field.
 */
function injectIntoWebp(data: Uint8Array, rawTiff: Uint8Array): Uint8Array {
  if (rawTiff.length === 0) return data;

  // Validate minimal WebP structure (RIFF....WEBP)
  if (data.length < 12) return data;

  // Build EXIF chunk: "EXIF" + uint32LE(size) + rawTiff + padding
  const fourcc = buffer.fromAscii('EXIF');
  const chunkDataLen = rawTiff.length;
  const padding = chunkDataLen % 2; // RIFF chunks are padded to even bytes
  const exifChunk = new Uint8Array(8 + chunkDataLen + padding);
  exifChunk.set(fourcc, 0);
  dataview.writeUint32LE(exifChunk, 4, chunkDataLen);
  exifChunk.set(rawTiff, 8);
  // padding byte is already 0

  // Append EXIF chunk at the end of the file
  const newFile = buffer.concat(data, exifChunk);

  // Update RIFF file size (bytes 4-7): total file length minus 8
  dataview.writeUint32LE(newFile, 4, newFile.length - 8);

  // Update VP8X flags if present
  // VP8X is the first chunk after "RIFF....WEBP" (offset 12)
  if (newFile.length >= 30) {
    const firstFourcc = buffer.toAscii(newFile, 12, 4);
    if (firstFourcc === 'VP8X') {
      // VP8X data starts at offset 20 (12 + 4 fourcc + 4 size)
      // flags byte is at VP8X data[0] = offset 20
      newFile[20] = newFile[20]! | (1 << 3); // set EXIF flag (bit 3)
    }
  }

  return newFile;
}

// ─── TIFF injection ──────────────────────────────────────────────────────────

import type { MetadataInjectOptions } from '../types.js';

/** Tag → TIFF tag number */
const INJECT_TAGS: Record<string, number> = {
  imageDescription: 270,
  software: 305,
  dateTime: 306,
  artist: 315,
  copyright: 33432,
};

/**
 * Inject metadata into a TIFF file by writing new IFD entries with values
 * appended at the end of the file.
 */
function injectIntoTiff(data: Uint8Array, inject: MetadataInjectOptions): Uint8Array {
  const fields = Object.entries(inject).filter(([, v]) => v && String(v).trim().length > 0);
  if (fields.length === 0) return data;

  const littleEndian = data[0] === 0x49; // 'I' = little-endian
  const ifdOffset = dataview.readUint32(data, 4, littleEndian);
  if (ifdOffset + 2 > data.length) return data;

  const numEntries = dataview.readUint16(data, ifdOffset, littleEndian);
  const existingEnd = ifdOffset + 2 + numEntries * 12 + 4;

  // Build new entries to append
  const newEntries: Array<{ tag: number; value: Uint8Array }> = [];
  const enc = new TextEncoder();
  for (const [key, val] of fields) {
    const tag = INJECT_TAGS[key];
    if (!tag) continue;
    const bytes = enc.encode(String(val) + '\x00');
    newEntries.push({ tag, value: bytes });
  }
  if (newEntries.length === 0) return data;

  // Append data: expanded IFD + value data at end of file
  const valueData = newEntries.map(e => e.value);
  const totalValueSize = valueData.reduce((s, v) => s + v.length + (v.length % 2), 0);
  const newIfdEntryBytes = newEntries.length * 12;

  // New file = original + space for new entries + value data
  const result = new Uint8Array(data.length + newIfdEntryBytes + totalValueSize);
  result.set(data);

  // Rewrite IFD entry count
  const newCount = numEntries + newEntries.length;
  dataview.writeUint16(result, ifdOffset, newCount, littleEndian);

  // Shift existing next-IFD pointer and any entries after it
  const oldNextIfd = dataview.readUint32(data, existingEnd - 4, littleEndian);

  // Write new entries at the end of existing entries
  let entryPos = ifdOffset + 2 + numEntries * 12;
  let valuePos = data.length + newIfdEntryBytes;

  for (const entry of newEntries) {
    dataview.writeUint16(result, entryPos, entry.tag, littleEndian);
    dataview.writeUint16(result, entryPos + 2, 2, littleEndian); // ASCII type
    dataview.writeUint32(result, entryPos + 4, entry.value.length, littleEndian);
    if (entry.value.length <= 4) {
      result.set(entry.value, entryPos + 8);
    } else {
      dataview.writeUint32(result, entryPos + 8, valuePos, littleEndian);
      result.set(entry.value, valuePos);
      valuePos += entry.value.length + (entry.value.length % 2);
    }
    entryPos += 12;
  }

  // Write next-IFD pointer after all entries
  dataview.writeUint32(result, entryPos, oldNextIfd, littleEndian);

  return result;
}

/**
 * Inject metadata into a PDF by appending an /Info dictionary update.
 * We append new string values directly into the existing Info dict's blanked fields.
 */
function injectIntoPdf(data: Uint8Array, inject: MetadataInjectOptions): Uint8Array {
  const keyMap: Record<string, string> = {
    copyright: 'Author',
    artist: 'Author',
    software: 'Producer',
    imageDescription: 'Title',
    dateTime: 'CreationDate',
  };

  // Build a simple Info dict supplement as a PDF comment block at end-of-file.
  // Since the existing Info dict was blanked, we write values back into the file
  // by searching for the blanked field patterns and filling them.
  const result = new Uint8Array(data);
  const text = new TextDecoder().decode(data);

  for (const [key, val] of Object.entries(inject)) {
    if (!val || !String(val).trim()) continue;
    const pdfKey = keyMap[key];
    if (!pdfKey) continue;
    const safeVal = String(val).replace(/[()\\]/g, '');

    // Find the blanked field: /Key (      ) — spaces of the original value length
    const pattern = new RegExp(`/${pdfKey}\\s*\\(( +)\\)`);
    const match = pattern.exec(text);
    if (match && match.index !== undefined) {
      const valueStart = text.indexOf('(', match.index) + 1;
      const availableLen = match[1]!.length;
      const writeVal = safeVal.slice(0, availableLen).padEnd(availableLen, ' ');
      const enc = new TextEncoder();
      const bytes = enc.encode(writeVal);
      result.set(bytes, valueStart);
    }
  }

  return result;
}

/**
 * Inject metadata into an MP4/MOV by writing values into previously zeroed atoms.
 */
function injectIntoMp4(data: Uint8Array, inject: MetadataInjectOptions): Uint8Array {
  const atomMap: Record<string, string> = {
    copyright: '\u00a9cpy',
    software: '\u00a9swr',
    artist: '\u00a9aut',
    imageDescription: '\u00a9des',
    dateTime: '\u00a9day',
  };

  const result = new Uint8Array(data);

  for (const [key, val] of Object.entries(inject)) {
    if (!val || !String(val).trim()) continue;
    const atomType = atomMap[key];
    if (!atomType) continue;
    const safeVal = String(val);
    const atomTypeBytes = buffer.fromAscii(atomType);

    // Find zeroed atoms of this type and write the value
    for (let i = 0; i < result.length - 8; i++) {
      if (
        result[i + 4] === atomTypeBytes[0] &&
        result[i + 5] === atomTypeBytes[1] &&
        result[i + 6] === atomTypeBytes[2] &&
        result[i + 7] === atomTypeBytes[3]
      ) {
        const atomSize = dataview.readUint32BE(result, i);
        if (atomSize < 8 || i + atomSize > result.length) continue;
        // Write value into atom data area (after 8-byte header + 16-byte QT string header)
        const dataStart = i + 8 + 16;
        const dataEnd = i + atomSize;
        const available = dataEnd - dataStart;
        if (available <= 0) continue;
        const enc = new TextEncoder();
        const bytes = enc.encode(safeVal.slice(0, available));
        result.set(bytes, dataStart);
        break;
      }
    }
  }

  return result;
}

/**
 * Inject metadata as a GIF comment extension block.
 */
function injectIntoGif(data: Uint8Array, inject: MetadataInjectOptions): Uint8Array {
  // Build a comment string from inject fields
  const parts: string[] = [];
  if (inject.copyright) parts.push(`Copyright: ${inject.copyright}`);
  if (inject.artist) parts.push(`Artist: ${inject.artist}`);
  if (inject.software) parts.push(`Software: ${inject.software}`);
  if (inject.imageDescription) parts.push(`Description: ${inject.imageDescription}`);
  if (inject.dateTime) parts.push(`DateTime: ${inject.dateTime}`);
  if (parts.length === 0) return data;

  const comment = parts.join('; ');
  const enc = new TextEncoder();
  const commentBytes = enc.encode(comment);

  // GIF comment extension: 0x21 0xFE, then sub-blocks (max 255 bytes each), then 0x00 terminator
  const blocks: Uint8Array[] = [];
  blocks.push(new Uint8Array([0x21, 0xfe])); // Extension introducer + comment label
  for (let off = 0; off < commentBytes.length; off += 255) {
    const chunk = commentBytes.subarray(off, Math.min(off + 255, commentBytes.length));
    blocks.push(new Uint8Array([chunk.length]));
    blocks.push(chunk);
  }
  blocks.push(new Uint8Array([0x00])); // Block terminator

  const extension = buffer.concat(...blocks);

  // Insert before GIF trailer (0x3B) which is the last byte
  if (data[data.length - 1] !== 0x3b) return data;
  const result = new Uint8Array(data.length - 1 + extension.length + 1);
  result.set(data.subarray(0, data.length - 1));
  result.set(extension, data.length - 1);
  result[result.length - 1] = 0x3b; // GIF trailer
  return result;
}

/**
 * Inject metadata into an SVG by adding/replacing metadata elements.
 */
function injectIntoSvg(data: Uint8Array, inject: MetadataInjectOptions): Uint8Array {
  const decoder = new TextDecoder('utf-8');
  let svgText = decoder.decode(data);

  // Build metadata XML block
  const metaParts: string[] = [];
  if (inject.copyright) metaParts.push(`    <dc:rights>${escapeXml(inject.copyright)}</dc:rights>`);
  if (inject.artist) metaParts.push(`    <dc:creator>${escapeXml(inject.artist)}</dc:creator>`);
  if (inject.imageDescription) metaParts.push(`    <dc:description>${escapeXml(inject.imageDescription)}</dc:description>`);
  if (inject.software) metaParts.push(`    <dc:source>${escapeXml(inject.software)}</dc:source>`);
  if (inject.dateTime) metaParts.push(`    <dc:date>${escapeXml(inject.dateTime)}</dc:date>`);
  if (metaParts.length === 0) return data;

  // Add title element if description is provided
  if (inject.imageDescription) {
    // Insert <title> after <svg...>
    const svgClose = svgText.indexOf('>', svgText.indexOf('<svg'));
    if (svgClose !== -1) {
      const before = svgText.slice(0, svgClose + 1);
      const after = svgText.slice(svgClose + 1);
      svgText = before + `\n  <title>${escapeXml(inject.imageDescription)}</title>` + after;
    }
  }

  // Insert <metadata> block with Dublin Core
  const metaBlock = `\n  <metadata>\n    <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"\n             xmlns:dc="http://purl.org/dc/elements/1.1/">\n      <rdf:Description>\n${metaParts.join('\n')}\n      </rdf:Description>\n    </rdf:RDF>\n  </metadata>`;
  const svgClose = svgText.indexOf('>', svgText.indexOf('<svg'));
  if (svgClose !== -1) {
    const before = svgText.slice(0, svgClose + 1);
    const after = svgText.slice(svgClose + 1);
    svgText = before + metaBlock + after;
  }

  return new TextEncoder().encode(svgText);
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Core removal logic shared between sync and async APIs
 */
function processRemoval(data: Uint8Array, rawOptions: RemoveOptions): RemoveResult {
  const options = applyFieldOptions(rawOptions);
  const format = detectFormat(data);
  const warnings: string[] = [];

  if (format === 'unknown') {
    throw new UnsupportedFormatError('unknown');
  }

  const handler = handlers[format];
  if (!handler) {
    // Check for registered plugin handlers
    const plugin = getPlugin(format);
    if (plugin) {
      const removedMetadata = plugin.getMetadataTypes(data);
      const cleanedData = plugin.remove(data, options);
      return {
        data: cleanedData,
        format,
        originalSize: data.length,
        cleanedSize: cleanedData.length,
        removedMetadata,
        warnings: [],
      };
    }
    throw new UnsupportedFormatError(format);
  }

  // ── GPS redaction: read GPS before removal so we can re-inject truncated ──
  let gpsLat: number | undefined;
  let gpsLng: number | undefined;
  if (options.gpsRedact && options.gpsRedact !== 'remove' && options.gpsRedact !== 'exact') {
    try {
      const meta = new Map<string, unknown>();
      // Try to read a TIFF/EXIF block depending on format
      if (format === 'jpeg') {
        // Find APP1
        let i = 2;
        while (i < data.length - 3) {
          if (data[i] !== 0xff) {
            break;
          }
          const marker = data[i + 1] ?? 0;
          const segLen = ((data[i + 2] ?? 0) << 8) | (data[i + 3] ?? 0);
          // Guard against zero-length segments causing an infinite loop
          if (segLen < 2) {
            break;
          }
          if (marker === 0xe1) {
            const tag = String.fromCharCode(
              data[i + 4] ?? 0,
              data[i + 5] ?? 0,
              data[i + 6] ?? 0,
              data[i + 7] ?? 0
            );
            if (tag === 'Exif') {
              const exifBlock = data.subarray(i + 10, i + 2 + segLen);
              const out: Partial<import('../types.js').MetadataMap> = {};
              readExifBlock(exifBlock, out);
              if (out.gps) {
                gpsLat = out.gps.latitude;
                gpsLng = out.gps.longitude;
              }
            }
          }
          i += 2 + segLen;
        }
      } else if (format === 'tiff' || format === 'dng') {
        const out: Partial<import('../types.js').MetadataMap> = {};
        readExifBlock(data, out);
        if (out.gps) {
          gpsLat = out.gps.latitude;
          gpsLng = out.gps.longitude;
        }
      } else if (format === 'webp') {
        // Use the WebP read() to extract GPS from its EXIF chunk
        const out = webp.read(data);
        if (out.gps) {
          gpsLat = out.gps.latitude;
          gpsLng = out.gps.longitude;
        }
      }
      void meta;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`GPS pre-read failed: ${msg}`);
    }
  }

  // Get metadata types before removal
  const removedMetadata = handler.getMetadataTypes(data);

  // Detect encrypted PDFs (handler returns data unchanged with no indication)
  if (format === 'pdf' && removedMetadata.includes('Encrypted')) {
    warnings.push('Encrypted PDF: metadata cannot be removed without the decryption key');
  }

  // Remove metadata
  let cleanedData = handler.remove(data, options);

  // ── GPS re-injection (truncated coordinates) ──
  if (
    options.gpsRedact &&
    options.gpsRedact !== 'remove' &&
    options.gpsRedact !== 'exact' &&
    gpsLat !== undefined &&
    gpsLng !== undefined
  ) {
    try {
      const gpsTiff = buildRedactedGpsExif(gpsLat, gpsLng);
      if (format === 'jpeg') {
        const app1 = wrapInJpegApp1(gpsTiff);
        cleanedData = injectIntoJpeg(cleanedData, app1);
      } else if (format === 'png') {
        cleanedData = injectIntoPng(cleanedData, gpsTiff);
      } else if (format === 'webp') {
        cleanedData = injectIntoWebp(cleanedData, gpsTiff);
      }
      // TIFF/DNG GPS re-injection would require in-place IFD patching — skip for now.
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`GPS re-injection failed: ${msg}`);
    }
  }

  // ── Metadata injection ──
  if (options.inject) {
    try {
      if (format === 'jpeg') {
        const segment = buildJpegExifSegment(options.inject);
        cleanedData = injectIntoJpeg(cleanedData, segment);
      } else if (format === 'png') {
        const tiffBlock = buildRawExifBlock(options.inject);
        if (tiffBlock.length > 0) {
          cleanedData = injectIntoPng(cleanedData, tiffBlock);
        }
      } else if (format === 'webp') {
        const tiffBlock = buildRawExifBlock(options.inject);
        if (tiffBlock.length > 0) {
          cleanedData = injectIntoWebp(cleanedData, tiffBlock);
        }
      } else if (format === 'tiff' || format === 'dng') {
        cleanedData = injectIntoTiff(cleanedData, options.inject);
      } else if (format === 'pdf') {
        cleanedData = injectIntoPdf(cleanedData, options.inject);
      } else if (format === 'mp4' || format === 'mov') {
        cleanedData = injectIntoMp4(cleanedData, options.inject);
      } else if (format === 'gif') {
        cleanedData = injectIntoGif(cleanedData, options.inject);
      } else if (format === 'svg') {
        cleanedData = injectIntoSvg(cleanedData, options.inject);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`Metadata injection failed: ${msg}`);
    }
  }

  // Filter out items that were actually preserved based on options
  const PRESERVE_MAP: [keyof RemoveOptions, string][] = [
    ['preserveColorProfile', 'ICC Profile'],
    ['preserveCopyright', 'Copyright'],
    ['preserveOrientation', 'Orientation'],
    ['preserveTitle', 'Title'],
    ['preserveDescription', 'Description'],
  ];
  for (const [flag, field] of PRESERVE_MAP) {
    if (options[flag]) {
      const idx = removedMetadata.indexOf(field);
      if (idx !== -1) {
        removedMetadata.splice(idx, 1);
      }
    }
  }

  // Detect if output format differs from input (e.g., RAW -> JPEG preview)
  let outputFormat: SupportedFormat | undefined;
  if (format === 'raw') {
    const detectedOutput = detectFormat(cleanedData);
    if (detectedOutput !== 'raw' && detectedOutput !== 'unknown') {
      outputFormat = detectedOutput;
    }
  }

  const result: RemoveResult = {
    data: cleanedData,
    format,
    originalSize: data.length,
    cleanedSize: cleanedData.length,
    removedMetadata,
    warnings,
  };
  if (outputFormat) {
    result.outputFormat = outputFormat;
  }
  return result;
}

/**
 * Remove metadata from an image or document.
 *
 * Supports JPEG, PNG, WebP, GIF, SVG, TIFF, HEIC, AVIF, PDF, MP4/MOV, DNG, and RAW.
 * Input is never re-encoded — metadata is stripped at the byte level.
 *
 * @param input   - Image data: `Uint8Array`, `ArrayBuffer`, or base64 data URL
 * @param options - Fine-grained control over what is kept or injected
 * @returns       `RemoveResult` with `data` (cleaned bytes), `format`, `removedMetadata`, etc.
 *
 * @example
 * ```typescript
 * // Strip all metadata
 * const result = await removeMetadata(imageBytes);
 *
 * // Keep orientation and color profile
 * const result = await removeMetadata(imageBytes, {
 *   preserveOrientation: true,
 *   preserveColorProfile: true,
 * });
 *
 * // Remove only GPS; leave everything else
 * const result = await removeMetadata(imageBytes, { remove: ['GPS'] });
 *
 * // Truncate GPS to city-level precision instead of stripping
 * const result = await removeMetadata(imageBytes, { gpsRedact: 'city' });
 *
 * // Inject a copyright notice after scrubbing
 * const result = await removeMetadata(imageBytes, {
 *   inject: { copyright: '© 2026 Jane Smith' },
 * });
 *
 * // Download the cleaned image in a browser
 * const blob = new Blob([result.data], { type: 'image/jpeg' });
 * ```
 */
// eslint-disable-next-line @typescript-eslint/require-await
export async function removeMetadata(
  input: Uint8Array | ArrayBuffer | string,
  options: RemoveOptions = {}
): Promise<RemoveResult> {
  const data = normalizeInput(input);
  return processRemoval(data, options);
}

/**
 * Synchronous version of `removeMetadata`.
 *
 * Identical behaviour — use when you cannot await (e.g. inside a Web Worker
 * `onmessage` handler, a Rollup plugin, or a CLI tool).
 */
export function removeMetadataSync(
  input: Uint8Array | ArrayBuffer | string,
  options: RemoveOptions = {}
): RemoveResult {
  const data = normalizeInput(input);
  return processRemoval(data, options);
}

/**
 * Return the names of metadata types present in a file without modifying it.
 *
 * @example
 * ```typescript
 * const types = getMetadataTypes(imageBytes);
 * // ['EXIF', 'GPS', 'ICC Profile', 'XMP']
 * ```
 */
export function getMetadataTypes(input: Uint8Array | ArrayBuffer): string[] {
  const data = input instanceof ArrayBuffer ? new Uint8Array(input) : input;
  const format = detectFormat(data);

  if (format === 'unknown') {
    return [];
  }

  const handler = handlers[format];
  if (!handler) {
    return [];
  }

  return handler.getMetadataTypes(data);
}

/**
 * Check if a format is supported
 */
export function isFormatSupported(format: SupportedFormat): boolean {
  return handlers[format] !== null;
}

/**
 * Get all supported formats
 */
export function getSupportedFormats(): SupportedFormat[] {
  return Object.entries(handlers)
    .filter(([_, handler]) => handler !== null)
    .map(([format]) => format as SupportedFormat);
}
