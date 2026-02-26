/**
 * PDF format handler.
 *
 * Supports two metadata stores found in standard PDFs:
 *
 *  1. Document Information Dictionary  (/Info object)
 *     Contains /Title, /Author, /Subject, /Keywords, /Creator, /Producer,
 *     /CreationDate, /ModDate as PDF string values.
 *
 *  2. XMP metadata stream
 *     An object with /Subtype /XML or with /Type /Metadata.
 *
 * Strategy (no external dependencies):
 *  • Locate the /Info reference in the trailer dictionary.
 *  • Replace every string value in the Info dictionary with an empty string
 *    of the SAME byte length so no byte offsets move — the cross-reference
 *    table stays valid.
 *  • Find the XMP stream and zero its content stream data similarly.
 *
 * Limitations:
 *  • Encrypted PDFs are returned unchanged.
 *  • Cross-reference streams (PDF 1.5+) with object streams are read but
 *    their linearised /Linearized hints are not, so Info dict objects inside
 *    object streams are left intact.
 *  • Creation/Modification dates in /Info are zeroed on a best-effort basis.
 */

import type { RemoveOptions, MetadataMap } from '../types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isEncrypted(text: string): boolean {
  return /\/Encrypt\s+\d+\s+\d+\s+R/.test(text);
}

/**
 * Overwrite every PDF string literal ( (value) ) inside `src` that falls
 * within [start, end) with spaces of the same length.
 */
function blankStringsInRange(data: Uint8Array, start: number, end: number): void {
  let i = start;
  while (i < end) {
    if (data[i] === 0x28 /* '(' */) {
      // walk to matching close paren, respecting escape sequences
      let depth = 1;
      i++;
      while (i < end && depth > 0) {
        const c = data[i]!;
        if (c === 0x5c /* '\' */) { i += 2; continue; }
        if (c === 0x28) depth++;
        else if (c === 0x29 /* ')' */) depth--;
        if (depth > 0) data[i] = 0x20; // space
        i++;
      }
    } else {
      i++;
    }
  }
}

/**
 * Overwrite a hex string <XXXX...> in `data` starting at offset `start`
 * with zeros of the same length.
 */
function blankHexStringsInRange(data: Uint8Array, start: number, end: number): void {
  let i = start;
  while (i < end) {
    if (data[i] === 0x3c /* '<' */ && i + 1 < end && data[i + 1] !== 0x3c) {
      i++;
      while (i < end && data[i] !== 0x3e /* '>' */) {
        const c = data[i]!;
        if ((c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x46) || (c >= 0x61 && c <= 0x66)) {
          data[i] = 0x30; // '0'
        }
        i++;
      }
    } else {
      i++;
    }
  }
}

/**
 * Search for `pattern` (ASCII string) in `data` and return its start offset,
 * or -1.
 */
function findPattern(data: Uint8Array, pattern: string, from = 0): number {
  const p = new TextEncoder().encode(pattern);
  outer: for (let i = from; i <= data.length - p.length; i++) {
    for (let j = 0; j < p.length; j++) {
      if (data[i + j] !== p[j]) continue outer;
    }
    return i;
  }
  return -1;
}

/**
 * Read a slice of the PDF as ASCII text (safe for structure parsing only).
 */
function slice(data: Uint8Array, start: number, end: number): string {
  let s = '';
  for (let i = start; i < Math.min(end, data.length); i++) {
    s += String.fromCharCode(data[i]!);
  }
  return s;
}

// ─── Trailer / Info dict locating ────────────────────────────────────────────

interface InfoRef {
  objectNum: number;
  generation: number;
}

function findInfoRef(data: Uint8Array): InfoRef | null {
  // Search backwards for "trailer" keyword
  for (let i = data.length - 20; i >= 0; i--) {
    if (
      data[i] === 0x74 && data[i+1] === 0x72 && data[i+2] === 0x61 && // tra
      data[i+3] === 0x69 && data[i+4] === 0x6c && data[i+5] === 0x65 && data[i+6] === 0x72 // iler
    ) {
      const trailerText = slice(data, i, Math.min(i + 2048, data.length));
      const m = /\/Info\s+(\d+)\s+(\d+)\s+R/.exec(trailerText);
      if (m) return { objectNum: Number(m[1]), generation: Number(m[2]) };
      break;
    }
  }
  return null;
}

/**
 * Locate the byte range of object `n gen R ... endobj` in `data`.
 * Returns [start, end] or null.
 */
function findObjectRange(data: Uint8Array, objectNum: number, gen: number): [number, number] | null {
  const marker = `${objectNum} ${gen} obj`;
  let off = 0;
  while (true) {
    const pos = findPattern(data, marker, off);
    if (pos === -1) return null;
    // Verify it's not mid-stream
    const beforeOk = pos === 0 || data[pos - 1] === 0x0a || data[pos - 1] === 0x0d || data[pos - 1] === 0x20;
    if (beforeOk) {
      const endobjPos = findPattern(data, 'endobj', pos + marker.length);
      if (endobjPos !== -1) return [pos, endobjPos + 6];
    }
    off = pos + 1;
  }
}

// ─── XMP stream locator ───────────────────────────────────────────────────────

interface StreamRange {
  start: number; // byte offset of first stream byte (after "stream\n")
  end: number;   // byte offset just after last stream byte (before "endstream")
  objectStart: number;
  objectEnd: number;
}

function findXmpStreamRanges(data: Uint8Array): StreamRange[] {
  const result: StreamRange[] = [];

  // Look for objects with /Subtype /XML or /Type /Metadata
  const indicators = ['/Subtype /XML', '/Subtype/XML', '/Type /Metadata', '/Type/Metadata'];
  const checked = new Set<number>();

  for (const indicator of indicators) {
    let off = 0;
    while (true) {
      const pos = findPattern(data, indicator, off);
      if (pos === -1) break;
      off = pos + 1;

      // Walk back to find "N G obj"
      let startSearch = Math.max(0, pos - 512);
      const region = slice(data, startSearch, pos);
      const objMatch = /(\d+)\s+(\d+)\s+obj\s*$/.exec(region);
      if (!objMatch) continue;
      const objNum = Number(objMatch[1]);
      if (checked.has(objNum)) continue;
      checked.add(objNum);

      // Find stream ... endstream
      const streamKeyword = findPattern(data, 'stream', pos);
      if (streamKeyword === -1) continue;
      // Skip \r\n or \n after "stream"
      let streamStart = streamKeyword + 6;
      if (data[streamStart] === 0x0d) streamStart++;
      if (data[streamStart] === 0x0a) streamStart++;

      const endstreamPos = findPattern(data, 'endstream', streamStart);
      if (endstreamPos === -1) continue;

      const endobjPos = findPattern(data, 'endobj', endstreamPos);
      if (endobjPos === -1) continue;

      result.push({
        start: streamStart,
        end: endstreamPos,
        objectStart: startSearch + (objMatch.index ?? 0),
        objectEnd: endobjPos + 6,
      });
    }
  }

  return result;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function remove(data: Uint8Array, _options: RemoveOptions = {}): Uint8Array {
  const result = new Uint8Array(data); // mutable copy

  // Bail on encrypted PDFs
  const header = slice(data, 0, Math.min(data.length, 8192));
  if (isEncrypted(header)) return result;

  // 1. Zero the Info dictionary
  const infoRef = findInfoRef(data);
  if (infoRef) {
    const range = findObjectRange(data, infoRef.objectNum, infoRef.generation);
    if (range) {
      blankStringsInRange(result, range[0], range[1]);
      blankHexStringsInRange(result, range[0], range[1]);
    }
  }

  // 2. Zero XMP streams
  const xmpRanges = findXmpStreamRanges(data);
  for (const r of xmpRanges) {
    // Overwrite stream bytes with whitespace (preserves /Length value correctness)
    result.fill(0x20, r.start, r.end);
  }

  return result;
}

export function getMetadataTypes(data: Uint8Array): string[] {
  const types: string[] = [];

  const header = slice(data, 0, Math.min(data.length, 8192));
  if (isEncrypted(header)) return ['Encrypted'];

  if (findInfoRef(data)) types.push('Document Info');
  if (findXmpStreamRanges(data).length > 0) types.push('XMP');

  // Also detect if Info has dates/author/etc.
  const infoRef = findInfoRef(data);
  if (infoRef) {
    const range = findObjectRange(data, infoRef.objectNum, infoRef.generation);
    if (range) {
      const obj = slice(data, range[0], range[1]);
      if (/\/(Author|Creator|Producer|Title|Subject)\s*\(/.test(obj)) types.push('Author/Title');
      if (/\/(CreationDate|ModDate)\s*\(/.test(obj)) types.push('Timestamps');
    }
  }

  return [...new Set(types)];
}

export function read(data: Uint8Array): Partial<MetadataMap> {
  const out: Partial<MetadataMap> = {};

  const infoRef = findInfoRef(data);
  if (!infoRef) return out;

  const range = findObjectRange(data, infoRef.objectNum, infoRef.generation);
  if (!range) return out;

  const obj = slice(data, range[0], range[1]);

  const extractStr = (key: string): string | undefined => {
    const m = new RegExp(`/${key}\\s*\\(([^)]*)\\)`).exec(obj);
    return m ? m[1] : undefined;
  };

  const author = extractStr('Author'); if (author) out.artist = author;
  const title = extractStr('Title'); if (title) out.imageDescription = title;
  const software = extractStr('Creator') ?? extractStr('Producer'); if (software) out.software = software;
  const creationDate = extractStr('CreationDate'); if (creationDate) out.dateTime = creationDate;

  if (findXmpStreamRanges(data).length > 0) out.hasXmp = true;

  return out;
}

export const pdf = { remove, getMetadataTypes, read };
export default pdf;
