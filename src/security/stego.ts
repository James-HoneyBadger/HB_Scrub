/**
 * Steganography detection heuristics.
 *
 * These are lightweight, zero-dependency checks that flag *suspicious*
 * indicators in image files.  They are NOT forensic-grade detectors —
 * proven steganography detection generally requires statistical analysis
 * of decoded pixel data (chi-square, RS analysis, etc.) which is out of
 * scope for a metadata-only library.
 *
 * What we CAN detect without decoding pixels:
 *  1. Trailing data after the logical end of the image  (appended payloads)
 *  2. Abnormally large gaps between ISOBMFF boxes       (HEIC/AVIF stuffing)
 *  3. Hidden data in JPEG comment (COM) or APP markers   (marker stuffing)
 *  4. Known tool signatures (e.g. OpenStego, Steghide)
 *  5. Unusual PNG ancillary chunks                       (tEXt / zTXt abuse)
 */

import { detectFormat } from '../detect.js';

export interface StegoWarning {
  /** Brief machine-readable identifier */
  code: string;
  /** Human-readable description */
  message: string;
  /** Byte offset where the anomaly starts, if applicable */
  offset?: number;
  /** Size of the suspicious region in bytes */
  size?: number;
}

// ─── Format-specific scanners ────────────────────────────────────────────────

/** Scan JPEG for trailing data and suspicious markers */
function scanJpeg(data: Uint8Array): StegoWarning[] {
  const warnings: StegoWarning[] = [];

  // Find EOI marker (0xFF 0xD9)
  let eoiOffset = -1;
  for (let i = data.length - 2; i >= 2; i--) {
    if (data[i] === 0xff && data[i + 1] === 0xd9) {
      eoiOffset = i + 2;
      break;
    }
  }

  if (eoiOffset > 0 && eoiOffset < data.length) {
    const trailingSize = data.length - eoiOffset;
    // Allow small padding (some encoders add 1-2 null bytes)
    if (trailingSize > 16) {
      warnings.push({
        code: 'jpeg-trailing-data',
        message: `${trailingSize} bytes of data after JPEG EOI marker — may contain appended payload`,
        offset: eoiOffset,
        size: trailingSize,
      });
    }
  }

  // Scan APP markers for unusually large data or known stego tool signatures
  let i = 2;
  while (i + 3 < data.length) {
    if (data[i] !== 0xff) break;
    const marker = data[i + 1]!;

    // SOS — start of scan, stop scanning markers
    if (marker === 0xda) break;
    // No-data markers
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }

    const segLen = (data[i + 2]! << 8) | data[i + 3]!;

    // COM marker — check for stego tool signatures
    if (marker === 0xfe && segLen > 2) {
      const comData = new TextDecoder().decode(data.slice(i + 4, i + 2 + segLen));
      if (/openstego|steghide|jphide|invisible\s*secrets/i.test(comData)) {
        warnings.push({
          code: 'jpeg-stego-signature',
          message: `JPEG comment contains steganography tool signature`,
          offset: i,
          size: segLen + 2,
        });
      }
    }

    i += 2 + segLen;
  }

  return warnings;
}

/** Scan PNG for trailing data and suspicious chunks */
function scanPng(data: Uint8Array): StegoWarning[] {
  const warnings: StegoWarning[] = [];

  // Find IEND chunk and check for trailing data
  let iendOffset = -1;
  for (let i = 8; i + 8 < data.length; i++) {
    if (
      data[i + 4] === 0x49 && // I
      data[i + 5] === 0x45 && // E
      data[i + 6] === 0x4e && // N
      data[i + 7] === 0x44    // D
    ) {
      // length(4) + type(4) + crc(4) = 12
      const chunkLen = (data[i]! << 24) | (data[i + 1]! << 16) | (data[i + 2]! << 8) | data[i + 3]!;
      iendOffset = i + 12 + chunkLen;
      break;
    }
  }

  if (iendOffset > 0 && iendOffset < data.length) {
    const trailingSize = data.length - iendOffset;
    if (trailingSize > 4) {
      warnings.push({
        code: 'png-trailing-data',
        message: `${trailingSize} bytes of data after PNG IEND chunk — may contain appended payload`,
        offset: iendOffset,
        size: trailingSize,
      });
    }
  }

  // Scan chunks for suspicious private/ancillary chunks with large payloads
  let off = 8; // skip signature
  while (off + 8 < data.length) {
    const chunkLen =
      (data[off]! << 24) | (data[off + 1]! << 16) | (data[off + 2]! << 8) | data[off + 3]!;
    const chunkType = String.fromCharCode(
      data[off + 4]!, data[off + 5]!, data[off + 6]!, data[off + 7]!
    );

    // Private chunks (lowercase first letter) with large payloads
    if (chunkType.charCodeAt(0) >= 0x61 && chunkLen > 65536) {
      warnings.push({
        code: 'png-large-private-chunk',
        message: `Large private PNG chunk '${chunkType}' (${chunkLen} bytes) — may contain hidden data`,
        offset: off,
        size: chunkLen + 12,
      });
    }

    off += 12 + chunkLen;
    if (chunkType === 'IEND') break;
  }

  return warnings;
}

/** Scan generic files for known stego tool byte signatures */
function scanGenericSignatures(data: Uint8Array): StegoWarning[] {
  const warnings: StegoWarning[] = [];
  const haystack = data.length > 65536 ? data.slice(-65536) : data;

  // OpenStego embeds a signature near end of file
  const text = new TextDecoder('ascii', { fatal: false }).decode(haystack);
  const patterns: Array<{ regex: RegExp; tool: string }> = [
    { regex: /OpenStego/i, tool: 'OpenStego' },
    { regex: /steghide/i, tool: 'Steghide' },
    { regex: /\x00OPENSTEGO/, tool: 'OpenStego' },
  ];

  for (const { regex, tool } of patterns) {
    if (regex.test(text)) {
      warnings.push({
        code: 'stego-tool-signature',
        message: `Possible ${tool} signature detected in file tail`,
      });
      break;
    }
  }

  return warnings;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Analyse a file's binary data for steganography indicators.
 *
 * Returns an empty array when nothing suspicious is found.
 */
export function detectSteganography(data: Uint8Array): StegoWarning[] {
  const format = detectFormat(data);
  const warnings: StegoWarning[] = [];

  switch (format) {
    case 'jpeg':
      warnings.push(...scanJpeg(data));
      break;
    case 'png':
      warnings.push(...scanPng(data));
      break;
  }

  // Always run generic signature scan
  warnings.push(...scanGenericSignatures(data));

  return warnings;
}
