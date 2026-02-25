# Technical Reference

Complete API reference for the `picscrub` library.

---

## Table of Contents

1. [Main API](#main-api)
2. [Types](#types)
3. [Error Classes](#error-classes)
4. [Node.js API](#nodejs-api)
5. [Format Handlers](#format-handlers)
6. [Binary Utilities](#binary-utilities)
7. [File Signatures](#file-signatures)
8. [Build Outputs](#build-outputs)

---

## Main API

Import from `'picscrub'`.

---

### `removeMetadata(input, options?)`

Removes metadata from an image. Returns a promise.

```typescript
async function removeMetadata(
  input: Uint8Array | ArrayBuffer | string,
  options?: RemoveOptions
): Promise<RemoveResult>
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `input` | `Uint8Array \| ArrayBuffer \| string` | Raw image bytes, or a base64 data URL |
| `options` | `RemoveOptions` | Optional. Preserve flags — see [RemoveOptions](#removeoptions) |

**Returns:** `Promise<RemoveResult>` — see [RemoveResult](#removeresult)

**Throws:**
- `InvalidFormatError` — if `input` is a string but not a data URL
- `UnsupportedFormatError` — if the image format is not recognised
- `CorruptedFileError` — if the file is structurally invalid

**Notes:**
- This function is synchronous internally. The `async` wrapper exists for API consistency.
- For a synchronous call, use `removeMetadataSync`.

---

### `removeMetadataSync(input, options?)`

Synchronous version of `removeMetadata`. Does not accept data URLs.

```typescript
function removeMetadataSync(
  input: Uint8Array | ArrayBuffer,
  options?: RemoveOptions
): RemoveResult
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `input` | `Uint8Array \| ArrayBuffer` | Raw image bytes |
| `options` | `RemoveOptions` | Optional. Preserve flags |

**Returns:** `RemoveResult`

---

### `getMetadataTypes(input)`

Returns the types of metadata present in an image without modifying it.

```typescript
function getMetadataTypes(input: Uint8Array | ArrayBuffer): string[]
```

**Returns:** Array of human-readable metadata type names. Empty array if the format is unsupported or the file contains no recognised metadata. Examples: `['EXIF', 'GPS', 'ICC Profile', 'XMP']`.

---

### `detectFormat(data)`

Detects the image format from raw bytes.

```typescript
function detectFormat(data: Uint8Array): SupportedFormat
```

**Returns:** A `SupportedFormat` string. Returns `'unknown'` if the format cannot be identified.

**Detection method:** Magic bytes / binary signatures. File extension is ignored.

---

### `getMimeType(format)`

Returns the MIME type string for a given `SupportedFormat`.

```typescript
function getMimeType(format: SupportedFormat): string
```

**Examples:**

| Format | MIME type |
|---|---|
| `'jpeg'` | `'image/jpeg'` |
| `'png'` | `'image/png'` |
| `'webp'` | `'image/webp'` |
| `'gif'` | `'image/gif'` |
| `'svg'` | `'image/svg+xml'` |
| `'tiff'` | `'image/tiff'` |
| `'heic'` | `'image/heic'` |
| `'dng'` | `'image/x-adobe-dng'` |
| `'raw'` | `'image/x-raw'` |
| `'unknown'` | `'application/octet-stream'` |

---

### `isFormatSupported(format)`

Returns `true` if a handler exists for the given format.

```typescript
function isFormatSupported(format: SupportedFormat): boolean
```

**Notes:** `'unknown'` always returns `false`. All other `SupportedFormat` values currently return `true`.

---

### `getSupportedFormats()`

Returns an array of all formats that have registered handlers.

```typescript
function getSupportedFormats(): SupportedFormat[]
// ['jpeg', 'png', 'webp', 'gif', 'svg', 'tiff', 'heic', 'dng', 'raw']
```

---

## Types

### `SupportedFormat`

```typescript
type SupportedFormat =
  | 'jpeg'
  | 'png'
  | 'webp'
  | 'gif'
  | 'svg'
  | 'tiff'
  | 'heic'
  | 'dng'
  | 'raw'
  | 'unknown';
```

---

### `RemoveOptions`

Controls which metadata is preserved rather than removed.

```typescript
interface RemoveOptions {
  /** Keep the EXIF orientation tag. A minimal EXIF segment is re-injected in JPEG. */
  preserveOrientation?: boolean;

  /** Keep the ICC color profile (JPEG APP2 / PNG iCCP / WebP ICCP). */
  preserveColorProfile?: boolean;

  /** Keep the copyright notice (TIFF/DNG tag 33432). */
  preserveCopyright?: boolean;

  /** SVG only: keep the <title> element. */
  preserveTitle?: boolean;

  /** SVG only: keep the <desc> element. */
  preserveDescription?: boolean;
}
```

All fields default to `false` (i.e. remove everything).

---

### `RemoveResult`

Returned by `removeMetadata`, `removeMetadataSync`, and (extended) `processFile`.

```typescript
interface RemoveResult {
  /** Cleaned image data */
  data: Uint8Array;

  /** Detected format of the input */
  format: SupportedFormat;

  /** Input file size in bytes */
  originalSize: number;

  /** Output file size in bytes */
  cleanedSize: number;

  /**
   * Metadata types that were removed.
   * Does NOT include items preserved via RemoveOptions.
   * Examples: 'EXIF', 'GPS', 'XMP', 'IPTC', 'ICC Profile', 'Comment'
   */
  removedMetadata: string[];

  /**
   * Present when the output format differs from the input.
   * E.g. for proprietary RAW files (CR2/NEF/ARW), the output is
   * a JPEG extracted from the embedded preview, so outputFormat = 'jpeg'.
   */
  outputFormat?: SupportedFormat;
}
```

---

## Error Classes

All errors extend `PicscrubError` which extends `Error`.

```typescript
import {
  PicscrubError,
  InvalidFormatError,
  CorruptedFileError,
  BufferOverflowError,
  UnsupportedFormatError,
  HeicProcessingError,
  SvgParseError,
} from 'picscrub';
```

### `PicscrubError`

Base class. All picscrub errors can be caught with `err instanceof PicscrubError`.

```typescript
class PicscrubError extends Error {
  name: string; // 'PicscrubError'
}
```

---

### `InvalidFormatError`

Thrown when the input value itself is invalid (e.g. a string that is not a data URL).

```typescript
class InvalidFormatError extends PicscrubError {
  name: 'InvalidFormatError';
}
```

---

### `UnsupportedFormatError`

Thrown when no handler is registered for the detected format.

```typescript
class UnsupportedFormatError extends PicscrubError {
  name: 'UnsupportedFormatError';
  readonly format: string; // The detected format string
}
```

---

### `CorruptedFileError`

Thrown when the file's binary structure is malformed.

```typescript
class CorruptedFileError extends PicscrubError {
  name: 'CorruptedFileError';
  readonly offset: number | undefined; // Byte offset where corruption was detected
}
```

---

### `BufferOverflowError`

Thrown when a read operation would extend past the end of the buffer. Usually indicates a corrupted or truncated file.

```typescript
class BufferOverflowError extends PicscrubError {
  name: 'BufferOverflowError';
  readonly requested: number; // Bytes requested
  readonly available: number; // Bytes actually available
}
```

---

### `HeicProcessingError`

Thrown for HEIC-specific failures (malformed ISOBMFF boxes, missing `ftyp`, etc.).

```typescript
class HeicProcessingError extends PicscrubError {
  name: 'HeicProcessingError';
}
```

---

### `SvgParseError`

Thrown when the file does not contain a valid `<svg>` element.

```typescript
class SvgParseError extends PicscrubError {
  name: 'SvgParseError';
}
```

---

## Node.js API

Import from `'picscrub/node'`.

---

### `processFile(inputPath, options?)`

Reads an image from disk, removes metadata, and writes the result.

```typescript
async function processFile(
  inputPath: string,
  options?: ProcessFileOptions
): Promise<ProcessFileResult>
```

**Output path resolution** (in order of precedence):
1. `options.outputPath` — explicit absolute or relative path
2. `options.inPlace: true` — overwrites the input file
3. Default — same directory as input, with `options.suffix` (default `'-clean'`) appended before the extension

If the output format differs from the input (e.g. RAW → JPEG), the output file extension is updated automatically.

---

### `ProcessFileOptions`

Extends `RemoveOptions` with file-system options.

```typescript
interface ProcessFileOptions extends RemoveOptions {
  /** Overwrite the original file */
  inPlace?: boolean;

  /** Suffix appended to filename (default: '-clean') */
  suffix?: string;

  /** Full output path. Overrides inPlace and suffix. */
  outputPath?: string;
}
```

---

### `ProcessFileResult`

Extends `RemoveResult` with path information.

```typescript
interface ProcessFileResult extends RemoveResult {
  /** Resolved absolute path of the input file */
  inputPath: string;

  /** Resolved absolute path of the written output file */
  outputPath: string;
}
```

---

## Format Handlers

Each format handler is exported individually for advanced use. All handlers share the same interface.

```typescript
import { jpeg, png, webp, gif, svg, tiff, heic, raw } from 'picscrub';
```

> Prefer importing from `picscrub/heic` for the HEIC handler.

### Common interface

Every handler exports at minimum:

```typescript
{
  remove(data: Uint8Array, options?: RemoveOptions): Uint8Array;
  getMetadataTypes(data: Uint8Array): string[];
}
```

### `jpeg`

```typescript
import { jpeg } from 'picscrub';

jpeg.remove(data, options)        // Uint8Array
jpeg.getMetadataTypes(data)       // string[]
jpeg.parseSegments(data)          // JpegSegment[]
```

Parses JPEG into segments (`FF xx <length> <data>`). Strips: EXIF (APP1), XMP (APP1), Extended XMP, ICC Profile (APP2), IPTC (APP13), Adobe (APP14), Comments (COM), and all unknown APP segments. When `preserveOrientation` is set, a minimal EXIF segment containing only the orientation tag is re-injected before the SOS marker.

---

### `png`

```typescript
import { png } from 'picscrub';

png.remove(data, options)         // Uint8Array
png.getMetadataTypes(data)        // string[]
png.parseChunks(data)             // PngChunk[]
```

Parses PNG into chunks. CRC-32 checksums are recomputed for all kept chunks. Strips: `tEXt`, `iTXt`, `zTXt`, `eXIf`, `tIME`, `iCCP`. All structural chunks (`IHDR`, `IDAT`, `IEND`, `PLTE`, `tRNS`, etc.) and APNG animation chunks are always preserved.

---

### `webp`

```typescript
import { webp } from 'picscrub';

webp.remove(data, options)        // Uint8Array
webp.getMetadataTypes(data)       // string[]
webp.parseChunks(data)            // WebpChunk[]
```

Parses the RIFF container. Strips `EXIF` and `XMP` chunks. `ICCP` (color profile) is removed unless `preserveColorProfile` is set. The `VP8X` feature flags chunk is automatically regenerated after removal to keep the file valid.

---

### `gif`

```typescript
import { gif } from 'picscrub';

gif.remove(data, options)         // Uint8Array
gif.getMetadataTypes(data)        // string[]
gif.parseBlocks(data)             // GifBlock[]
```

Parses GIF blocks. Strips: Comment extensions (`0xFE`), XMP application extensions, and other application-specific extensions. Always preserves: Graphics Control extensions (animation timing), NETSCAPE extension (animation loop count), and Plain Text extensions.

---

### `svg`

```typescript
import { svg } from 'picscrub';

svg.remove(data, options)         // Uint8Array
svg.getMetadataTypes(data)        // string[]
```

SVG is text-based; processing is regex/string-based on the decoded UTF-8 content. Strips: `<metadata>`, `<rdf:RDF>`, `<title>` (unless `preserveTitle`), `<desc>` (unless `preserveDescription`), editor namespace elements and attributes (Inkscape, Sodipodi, Illustrator, Sketch, Figma, etc.), XML comments, `data-*` attributes, and auto-generated UUID `id` attributes.

---

### `tiff`

```typescript
import { tiff } from 'picscrub';

tiff.remove(data, options)        // Uint8Array
tiff.getMetadataTypes(data)       // string[]
tiff.parseHeader(data)            // { littleEndian, ifdOffset }
tiff.parseIfd(data, offset, le)   // { entries, nextIfdOffset }
```

Uses **in-place modification**: copies the file, rewrites IFD0 without the removed entries, and zeros the data blocks referenced by removed entries. All existing byte offsets (strip offsets, tile offsets, SubIFD offsets, secondary IFDs) remain intact.

Tags removed by default: ImageDescription (270), Make (271), Model (272), Software (305), DateTime (306), Artist (315), Copyright (33432), ExifIFD pointer (34665), GPSInfo pointer (34853), XMP (700).

Tags conditionally kept: Orientation (274) if `preserveOrientation`, ICCProfile (34675) if `preserveColorProfile`, Copyright (33432) if `preserveCopyright`.

---

### `heic`

Import from `picscrub/heic`:

```typescript
import { heic } from 'picscrub/heic';

heic.remove(data, options)        // Uint8Array
heic.getMetadataTypes(data)       // string[]
```

Processes ISOBMFF (ISO Base Media File Format) containers. Locates EXIF and XMP items via the `iinf` (item information) box, then finds their byte extents via the `iloc` (item location) box, and **overwrites the data in-place with zeros**. This avoids the need to recalculate box sizes and offsets throughout the file.

---

### `raw`

```typescript
import { raw } from 'picscrub';

raw.remove(data, options)           // { data, isPreview, originalFormat }
raw.removeDng(data, options)        // Uint8Array (delegates to tiff.remove)
raw.extractCleanPreview(data, options) // Uint8Array | null
raw.getMetadataTypes(data)          // string[]
raw.detectRawFormat(data)           // 'dng' | 'cr2' | 'cr3' | 'nef' | 'arw' | 'unknown'
```

**DNG** is TIFF-based — `removeDng` delegates directly to `tiff.remove`.

**Proprietary formats** (CR2, NEF, ARW): `extractCleanPreview` scans the TIFF IFD for `JPEGInterchangeFormat` (tag 513) and `JPEGInterchangeFormatLength` (tag 514) offsets, extracts the embedded JPEG preview, and processes it through `jpeg.remove`. A SubIFD is also checked for a higher-resolution preview.

`raw.remove` returns:
```typescript
{
  data: Uint8Array;
  isPreview: boolean;      // true for proprietary RAW (output is JPEG preview)
  originalFormat: RawFormat;
}
```

---

## Binary Utilities

Low-level helpers, exported for advanced use.

```typescript
import * as buffer   from 'picscrub/buffer';   // or: import * as buffer from 'picscrub'
import * as dataview from 'picscrub/dataview';
import { crc32 }     from 'picscrub';
```

### `buffer`

```typescript
// Pattern matching
buffer.startsWith(data, pattern)           // boolean
buffer.matchesAt(data, offset, pattern)    // boolean
buffer.indexOf(data, pattern, startOffset) // number (-1 if not found)

// Conversion
buffer.fromAscii(str)                      // Uint8Array
buffer.toAscii(data, offset?, length?)     // string

// Construction
buffer.concat(...arrays)                   // Uint8Array
```

### `dataview`

```typescript
// Reads (throw BufferOverflowError if out of bounds)
dataview.readUint16BE(data, offset)              // number
dataview.readUint16LE(data, offset)              // number
dataview.readUint32BE(data, offset)              // number
dataview.readUint32LE(data, offset)              // number
dataview.readUint16(data, offset, littleEndian)  // number
dataview.readUint32(data, offset, littleEndian)  // number

// Writes (throw BufferOverflowError if out of bounds)
dataview.writeUint16BE(data, offset, value)
dataview.writeUint16LE(data, offset, value)
dataview.writeUint32BE(data, offset, value)
dataview.writeUint32LE(data, offset, value)
dataview.writeUint16(data, offset, value, littleEndian)
dataview.writeUint32(data, offset, value, littleEndian)
```

All 32-bit operations correctly handle values with the high bit set (unsigned) by using `>>> 0`.

### `crc32`

```typescript
import { crc32 } from 'picscrub';

crc32(data, initial?)                  // number — standard IEEE 802.3 CRC-32
crc32Png(chunkType, chunkData)         // number — PNG chunk CRC (type + data)
```

`crc32Png` computes the CRC incrementally over two separate buffers to avoid allocating a combined buffer.

---

## File Signatures

Magic byte constants used for format detection.

```typescript
import { FILE_SIGNATURES } from 'picscrub';

FILE_SIGNATURES.JPEG      // Uint8Array [0xFF, 0xD8, 0xFF]
FILE_SIGNATURES.JPEG_SOI  // Uint8Array [0xFF, 0xD8]
FILE_SIGNATURES.PNG       // Uint8Array [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]
FILE_SIGNATURES.GIF87a    // Uint8Array — 'GIF87a'
FILE_SIGNATURES.GIF89a    // Uint8Array — 'GIF89a'
FILE_SIGNATURES.RIFF      // Uint8Array — 'RIFF' (WebP container)
FILE_SIGNATURES.WEBP      // Uint8Array — 'WEBP'
FILE_SIGNATURES.TIFF_LE   // Uint8Array [0x49, 0x49, 0x2A, 0x00] — 'II*\0'
FILE_SIGNATURES.TIFF_BE   // Uint8Array [0x4D, 0x4D, 0x00, 0x2A] — 'MM\0*'
FILE_SIGNATURES.FTYP      // Uint8Array — 'ftyp' (HEIC/ISOBMFF)
```

---

## Build Outputs

The build produces the following files in `dist/`:

| File | Format | Entry point |
|---|---|---|
| `picscrub.js` | ESM | `src/index.ts` |
| `picscrub.cjs` | CJS | `src/index.ts` |
| `picscrub.node.js` | ESM | `src/node.ts` |
| `picscrub.node.cjs` | CJS | `src/node.ts` |
| `picscrub.heic.js` | ESM | `src/formats/heic.ts` |
| `picscrub.heic.cjs` | CJS | `src/formats/heic.ts` |
| `picscrub.cli.js` | ESM + shebang | `src/cli.ts` |
| `picscrub.cli.cjs` | CJS | `src/cli.ts` |
| `index.d.ts` | TypeScript | Main types |
| `heic.d.ts` | TypeScript | HEIC types |
| `node.d.ts` | TypeScript | Node.js types |

**Build tool:** Vite 5 + Rollup  
**Minifier:** esbuild  
**Target:** ES2022  
**Source maps:** Included (`.map` files)  
**Declaration files:** Generated by `vite-plugin-dts` + `tsc --emitDeclarationOnly`

To rebuild:

```bash
npm run build
```
