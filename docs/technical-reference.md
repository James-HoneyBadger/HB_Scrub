# HB_Scrub — Technical Reference

Complete API surface, type definitions, format handler internals, binary utilities, error classes, and build details.

---

## Table of Contents

1. [Core API](#1-core-api)
2. [Node.js API](#2-nodejs-api)
3. [Types](#3-types)
4. [Format Handlers](#4-format-handlers)
5. [EXIF Reader / Writer](#5-exif-reader--writer)
6. [Binary Utilities](#6-binary-utilities)
7. [Error Classes](#7-error-classes)
8. [File Signatures](#8-file-signatures)
9. [Format Detection](#9-format-detection)
10. [Electron Main Process](#10-electron-main-process)
11. [Build Outputs](#11-build-outputs)
12. [Source Layout](#12-source-layout)

---

## 1. Core API

Import from `'hb-scrub'`. Works in browser, Node.js, Deno, and Bun.

---

### `removeMetadata(input, options?)`

```typescript
async function removeMetadata(
  input: Uint8Array | ArrayBuffer | string,
  options?: RemoveOptions
): Promise<RemoveResult>
```

Strip all metadata from `input`. Accepts `Uint8Array`, `ArrayBuffer`, or a Base64 data URL string. Returns a `RemoveResult`.

---

### `removeMetadataSync(input, options?)`

```typescript
function removeMetadataSync(
  input: Uint8Array | ArrayBuffer | string,
  options?: RemoveOptions
): RemoveResult
```

Synchronous version of `removeMetadata`.

---

### `readMetadata(input)`

```typescript
async function readMetadata(
  input: Uint8Array | ArrayBuffer | string
): Promise<ReadResult>
```

Parse metadata from `input` without modifying it. Returns a structured `ReadResult`.

---

### `readMetadataSync(input)`

```typescript
function readMetadataSync(
  input: Uint8Array | ArrayBuffer | string
): ReadResult
```

Synchronous version of `readMetadata`.

---

### `verifyClean(input)`

```typescript
async function verifyClean(
  input: Uint8Array | ArrayBuffer | string
): Promise<VerifyResult>
```

Confirm no known metadata remains. Runs `getMetadataTypes` and returns whether the result is empty.

---

### `verifyCleanSync(input)`

```typescript
function verifyCleanSync(
  input: Uint8Array | ArrayBuffer | string
): VerifyResult
```

---

### `getMetadataTypes(input)`

```typescript
function getMetadataTypes(
  input: Uint8Array | ArrayBuffer | string
): string[]
```

Returns the names of metadata types detected in `input` (e.g. `['EXIF', 'GPS', 'XMP']`). Does **not** parse or remove anything.

---

### `detectFormat(input)`

```typescript
function detectFormat(
  input: Uint8Array | ArrayBuffer | string
): SupportedFormat | 'unknown'
```

Detect the file format by inspecting magic bytes. Does not rely on file extensions.

---

### `getMimeType(format)`

```typescript
function getMimeType(format: SupportedFormat): string
```

Map a `SupportedFormat` value to its MIME type string (e.g. `'jpeg'` → `'image/jpeg'`).

---

### `isFormatSupported(format)`

```typescript
function isFormatSupported(format: string): boolean
```

Return `true` if a handler exists for the given format string.

---

### `getSupportedFormats()`

```typescript
function getSupportedFormats(): SupportedFormat[]
```

Returns the full list of supported format identifiers.

---

## 2. Node.js API

Import from `'hb-scrub/node'`.

---

### `processFile(inputPath, options?)`

```typescript
async function processFile(
  inputPath: string,
  options?: ProcessFileOptions
): Promise<ProcessFileResult>
```

Read a file, strip its metadata, write the result, and return paths and statistics.

**Output path resolution** (evaluated in order):

1. `options.outputPath` — explicit absolute or relative path
2. `options.inPlace: true` — overwrites the input file
3. Default — same directory as input, `options.suffix` (default `'-clean'`) inserted before the extension

If the output format differs from the input (e.g. RAW → JPEG), the output file extension is updated automatically.

---

### `processDir(dir, options?)`

```typescript
async function processDir(
  dir: string,
  options?: BatchOptions
): Promise<BatchResult>
```

Recursively (if `options.recursive`) find all supported image files in `dir` and process them with concurrency limited to `options.concurrency` (default `4`).

---

### `processFiles(paths, options?)`

```typescript
async function processFiles(
  paths: string[],
  options?: BatchOptions
): Promise<BatchResult>
```

Process an explicit array of file paths.

---

### `createScrubStream(options?)`

```typescript
function createScrubStream(
  options?: RemoveOptions
): ScrubTransform
```

Return a `Transform` stream that buffers the input, strips metadata, and passes the result downstream. Import from `'hb-scrub/stream'`.

---

## 3. Types

---

### `RemoveOptions`

```typescript
interface RemoveOptions {
  /** Keep EXIF Orientation tag (tag 274). */
  preserveOrientation?: boolean;

  /** Keep the embedded ICC colour profile. */
  preserveColorProfile?: boolean;

  /** Keep the copyright field (TIFF/DNG tag 33432). */
  preserveCopyright?: boolean;

  /** Keep the title field (SVG / XMP). */
  preserveTitle?: boolean;

  /** Keep the description field (SVG / XMP). */
  preserveDescription?: boolean;

  /**
   * Remove ONLY these fields; keep all others.
   * Mutually exclusive with `keep`.
   */
  remove?: MetadataFieldName[];

  /**
   * Always keep these fields; remove everything else.
   * Mutually exclusive with `remove`.
   */
  keep?: MetadataFieldName[];

  /**
   * GPS handling:
   * 'remove'  — strip entirely (default)
   * 'exact'   — keep full precision (no change)
   * 'city'    — truncate to 2 decimal places (≈ 1 km)
   * 'region'  — truncate to 1 decimal place (≈ 11 km)
   * 'country' — truncate to integer degrees (≈ 111 km)
   */
  gpsRedact?: GpsRedactPrecision;

  /** Metadata fields to write into the output after scrubbing. */
  inject?: MetadataInjectOptions;
}
```

---

### `MetadataInjectOptions`

After metadata removal, these fields are written back into the cleaned file as a
minimal EXIF block. Supported formats: **JPEG**, **PNG**, and **WebP**. For
unsupported formats the fields are silently ignored and a warning is added to the
result.

```typescript
interface MetadataInjectOptions {
  copyright?:        string;
  software?:         string;
  artist?:           string;
  imageDescription?: string;
  dateTime?:         string;  // 'YYYY:MM:DD HH:MM:SS'
}
```

---

### `RemoveResult`

```typescript
interface RemoveResult {
  /** The cleaned file bytes. */
  data: Uint8Array;

  /** Detected format. */
  format: SupportedFormat;

  /** Metadata type names that were removed. */
  removedMetadata: string[];

  /** Input file size in bytes. */
  originalSize: number;

  /** Output file size in bytes. */
  cleanedSize: number;

  /** Non-fatal issues encountered during processing. */
  warnings: string[];
}
```

---

### `ReadResult`

```typescript
interface ReadResult {
  /** Parsed metadata fields. */
  metadata: MetadataMap;

  /** Detected format. */
  format: SupportedFormat;

  /** Input file size in bytes. */
  fileSize: number;

  /** Non-fatal issues encountered during processing. */
  warnings: string[];
}
```

---

### `MetadataMap`

```typescript
interface MetadataMap {
  make?:        string;
  model?:       string;
  software?:    string;
  dateTime?:    string;
  artist?:      string;
  copyright?:   string;
  orientation?: number;   // 1–8
  gps?:         GpsCoordinates;
  exif?:        ExifData;
  hasXmp:       boolean;
  hasIcc:       boolean;
  hasIptc:      boolean;
  hasThumbnail: boolean;
  /**
   * Raw IFD0 tag map populated by readMetadata for TIFF-based formats.
   * Keys are 'ifd0:<tagNumber>' (e.g. 'ifd0:271' for Make).
   * Values are the raw tag value before structured parsing.
   */
  raw?: Record<string, unknown>;
}
```

---

### `GpsCoordinates`

```typescript
interface GpsCoordinates {
  latitude:   number;   // Decimal degrees, negative = South
  longitude:  number;   // Decimal degrees, negative = West
  altitude?:  number;   // Metres above sea level
  speed?:     number;   // km/h
}
```

---

### `ExifData`

```typescript
interface ExifData {
  dateTimeOriginal?:  string;   // e.g. "2026:01:15 14:30:00"
  dateTimeDigitized?: string;
  exposureTime?:      string;   // Formatted rational, e.g. "1/200"
  fNumber?:           number;   // e.g. 2.8
  iso?:               number;
  focalLength?:       number;   // mm
  flash?:             boolean;  // true if flash fired
  lensModel?:         string;
  lensManufacturer?:  string;
  colorSpace?:        number;
  pixelWidth?:        number;
  pixelHeight?:       number;
  whiteBalance?:      number;
  exposureMode?:      number;
  exposureProgram?:   number;
}
```

---

### `VerifyResult`

```typescript
interface VerifyResult {
  /** true if no known metadata was detected. */
  clean: boolean;

  /** Metadata types still detected (empty when clean). */
  remainingMetadata: string[];

  /**
   * How thorough the verification is for this format.
   * 'high'   — JPEG, PNG, WebP, TIFF, HEIC, AVIF
   * 'medium' — GIF, PDF, MP4, MOV, DNG, RAW
   * 'low'    — SVG or unrecognised format
   */
  confidence: 'high' | 'medium' | 'low';

  /** Non-fatal issues encountered during processing. */
  warnings: string[];
}
```

---

### `ProcessFileOptions`

```typescript
interface ProcessFileOptions extends RemoveOptions {
  /** Overwrite the original file. */
  inPlace?: boolean;

  /** Suffix added before the extension (default: '-clean'). */
  suffix?: string;

  /** Explicit output path. Overrides inPlace and suffix. */
  outputPath?: string;
}
```

---

### `ProcessFileResult`

```typescript
interface ProcessFileResult extends RemoveResult {
  /** Resolved absolute path of the input file. */
  inputPath: string;

  /** Resolved absolute path of the written output file. */
  outputPath: string;
}
```

---

### `BatchOptions`

```typescript
interface BatchOptions extends RemoveOptions {
  inPlace?:      boolean;   // Overwrite input files
  outputDir?:    string;    // Output directory (default: same as input)
  suffix?:       string;    // Filename suffix (default: '-clean')
  concurrency?:  number;    // Max parallel files (default: 4)
  dryRun?:       boolean;   // Detect only, write nothing
  skipExisting?: boolean;   // Skip if output already exists
  backupSuffix?: string;    // Copy original before overwriting
  recursive?:    boolean;   // Recurse into subdirectories
  include?:      string[];  // Glob patterns to include
  exclude?:      string[];  // Glob patterns to exclude
  onProgress?:   (completed: number, total: number, currentFile: string) => void;
}
```

---

### `BatchResult`

```typescript
interface BatchResult {
  successful: number;
  failed:     number;
  skipped:    number;
  report:     AuditReport;
}
```

---

### `AuditReport`

```typescript
interface AuditReport {
  totalFiles:        number;
  successful:        number;
  failed:            number;
  skipped:           number;
  totalBytesRemoved: number;
  entries:           AuditEntry[];
  startedAt:         string;   // ISO 8601
  completedAt:       string;
}
```

---

### `AuditEntry`

```typescript
interface AuditEntry {
  file:            string;
  format:          SupportedFormat | 'unknown';
  originalSize:    number;
  cleanedSize:     number;
  removedMetadata: string[];
  outputPath:      string;
  error?:          string;
}
```

---

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
  | 'avif'
  | 'pdf'
  | 'mp4'
  | 'dng'
  | 'raw'
  | 'unknown';
```

---

### `GpsRedactPrecision`

```typescript
type GpsRedactPrecision = 'remove' | 'exact' | 'city' | 'region' | 'country';
```

---

### `MetadataFieldName`

```typescript
type MetadataFieldName =
  | 'GPS' | 'EXIF' | 'XMP' | 'ICC Profile' | 'IPTC'
  | 'Copyright' | 'Orientation' | 'Make' | 'Model'
  | 'Software' | 'DateTime' | 'Artist' | 'Comment'
  | 'Thumbnail' | 'Title' | 'Description';
```

---

## 4. Format Handlers

Each format handler is individually exported for advanced use. All share the same base interface.

```typescript
import { jpeg, png, webp, gif, svg, tiff, raw } from 'hb-scrub';
import { heic } from 'hb-scrub/heic';
```

### Common handler interface

```typescript
interface FormatHandler {
  remove(data: Uint8Array, options?: RemoveOptions): Uint8Array;
  getMetadataTypes(data: Uint8Array): string[];
}
```

---

### `jpeg`

```typescript
jpeg.remove(data, options?)       // Uint8Array
jpeg.getMetadataTypes(data)       // string[]
jpeg.parseSegments(data)          // JpegSegment[]
```

Parses JPEG markers (`FF xx <length> <data>`). Strips: EXIF (APP1), XMP (APP1), Extended XMP, ICC Profile (APP2), IPTC (APP13), Adobe (APP14), Comments (COM), all unknown APPn segments.

When `preserveOrientation` is set, a minimal APP1/EXIF segment containing only tag 274 (Orientation) is re-injected immediately before the SOS marker.

---

### `png`

```typescript
png.remove(data, options?)        // Uint8Array
png.getMetadataTypes(data)        // string[]
png.parseChunks(data)             // PngChunk[]
```

Parses the PNG chunk stream. CRC-32 checksums are recomputed for all kept chunks. Strips: `tEXt`, `iTXt`, `zTXt`, `eXIf`, `tIME`, `iCCP`. Preserves: `IHDR`, `IDAT`, `IEND`, `PLTE`, `tRNS`, and all APNG animation chunks.

---

### `webp`

```typescript
webp.remove(data, options?)       // Uint8Array
webp.getMetadataTypes(data)       // string[]
webp.parseChunks(data)            // WebpChunk[]
webp.read(data)                   // Partial<MetadataMap>
```

Parses the RIFF container. Strips `EXIF` and `XMP` fourCC chunks. `ICCP` removed unless `preserveColorProfile`. The `VP8X` chunk (feature flags) is automatically regenerated after removal to keep the file valid. Metadata injection supported — builds an EXIF RIFF sub-chunk and updates VP8X flags. GPS redaction re-injection supported.

---

### `gif`

```typescript
gif.remove(data, options?)        // Uint8Array
gif.getMetadataTypes(data)        // string[]
gif.parseBlocks(data)             // GifBlock[]
gif.read(data)                    // Partial<MetadataMap>
```

Strips: Comment extensions (`0xFE`), XMP application extensions, other application-specific extensions. Preserves: Graphics Control extensions (animation timing), NETSCAPE extension (loop count), Plain Text extensions.

`read()` extracts comment text from comment extension blocks. The first comment is stored in `imageDescription`; all comments are stored in `raw.comments` as a `string[]`.

---

### `svg`

```typescript
svg.remove(data, options?)        // Uint8Array
svg.getMetadataTypes(data)        // string[]
```

Processes the decoded UTF-8 string with regex/string operations. Strips: `<metadata>`, `<rdf:RDF>`, `<title>`, `<desc>`, all editor namespace elements and attributes (Inkscape, Sodipodi, Adobe Illustrator, Sketch, Figma), XML comments, `data-*` attributes, auto-generated UUID `id` values.

---

### `tiff`

```typescript
tiff.remove(data, options?)       // Uint8Array
tiff.getMetadataTypes(data)       // string[]
tiff.parseHeader(data)            // { littleEndian: boolean, ifdOffset: number }
tiff.parseIfd(data, offset, le)   // { entries: IfdEntry[], nextIfdOffset: number }
```

**In-place IFD modification**: copies the file buffer, rewrites IFD0 without the removed entries, then zeros the data blocks referenced by those entries. All existing byte offsets (strip/tile offsets, SubIFD pointers, secondary IFDs) remain intact — no relayout required.

Tags removed by default: ImageDescription (270), Make (271), Model (272), Software (305), DateTime (306), Artist (315), Copyright (33432), ExifIFD pointer (34665), GPSInfo pointer (34853), XMP (700).

Conditionally kept: Orientation (274) if `preserveOrientation`; ICCProfile (34675) if `preserveColorProfile`; Copyright (33432) if `preserveCopyright`.

---

### `heic`

```typescript
import { heic } from 'hb-scrub/heic';

heic.remove(data, options?)       // Uint8Array
heic.getMetadataTypes(data)       // string[]
```

Processes ISOBMFF containers (HEIC, HEIF, AVIF). Locates EXIF and XMP items via the `iinf` (item information) box, finds their byte extents via the `iloc` (item location) box, and **overwrites those bytes in-place with zeros**. This avoids the need to recompute box sizes and offsets throughout the file.

---

### `raw`

```typescript
raw.remove(data, options?)                // { data, isPreview, originalFormat }
raw.removeDng(data, options?)             // Uint8Array  (delegates to tiff.remove)
raw.extractCleanPreview(data, options?)   // Uint8Array | null
raw.getMetadataTypes(data)                // string[]
raw.detectRawFormat(data)                 // 'dng' | 'cr2' | 'cr3' | 'nef' | 'arw' | 'unknown'
```

**DNG** is TIFF-based — `removeDng` delegates directly to `tiff.remove`.

**Proprietary RAW** (CR2, NEF, ARW): `extractCleanPreview` scans the TIFF IFD for `JPEGInterchangeFormat` (tag 513) and `JPEGInterchangeFormatLength` (tag 514), extracts the embedded JPEG preview, and processes it through `jpeg.remove`. A SubIFD is also checked for a higher-resolution preview.

`raw.remove` returns:

```typescript
{
  data: Uint8Array;
  isPreview: boolean;          // true for CR2/NEF/ARW — output is JPEG
  originalFormat: RawFormat;
}
```

---

## 5. EXIF Reader / Writer

Lower-level EXIF utilities used internally by the format handlers.

### `exif/reader`

```typescript
import { readExifFromJpeg, readExifFromTiff } from 'hb-scrub';
// (internal — not part of the public API surface)
```

Parses the EXIF IFD tree and populates a `MetadataMap`. Handles both little-endian (`II`) and big-endian (`MM`) TIFF byte orders.

### `exif/writer`

```typescript
// Writes a minimal EXIF APP1 segment for JPEG re-injection
// Used internally by jpeg.remove when preserveOrientation is set
```

Constructs a valid EXIF/TIFF structure containing only the specified tags. Used to re-inject a clean orientation-only EXIF block after stripping.

---

## 6. Binary Utilities

Low-level helpers exported for advanced use.

```typescript
import { buffer, dataview, crc32 } from 'hb-scrub';
```

### `buffer`

```typescript
// Pattern matching
buffer.startsWith(data: Uint8Array, pattern: Uint8Array): boolean
buffer.matchesAt(data: Uint8Array, offset: number, pattern: Uint8Array): boolean
buffer.indexOf(data: Uint8Array, pattern: Uint8Array, startOffset?: number): number  // -1 if not found

// Conversion
buffer.fromAscii(str: string): Uint8Array
buffer.toAscii(data: Uint8Array, offset?: number, length?: number): string

// Construction
buffer.concat(...arrays: Uint8Array[]): Uint8Array
```

---

### `dataview`

Bounds-checked integer reads and writes. All operations throw `BufferOverflowError` if the offset would exceed the buffer bounds.

```typescript
// Reads
dataview.readUint16BE(data, offset): number
dataview.readUint16LE(data, offset): number
dataview.readUint32BE(data, offset): number
dataview.readUint32LE(data, offset): number
dataview.readUint16(data, offset, littleEndian: boolean): number
dataview.readUint32(data, offset, littleEndian: boolean): number

// Writes (mutate data in-place)
dataview.writeUint16BE(data, offset, value): void
dataview.writeUint16LE(data, offset, value): void
dataview.writeUint32BE(data, offset, value): void
dataview.writeUint32LE(data, offset, value): void
dataview.writeUint16(data, offset, value, littleEndian: boolean): void
dataview.writeUint32(data, offset, value, littleEndian: boolean): void
```

All 32-bit operations use `>>> 0` to correctly handle values with the high bit set (unsigned semantics).

---

### `crc32`

```typescript
import { crc32, crc32Png } from 'hb-scrub';

crc32(data: Uint8Array, initial?: number): number
// Standard IEEE 802.3 CRC-32

crc32Png(chunkType: Uint8Array, chunkData: Uint8Array): number
// PNG chunk CRC — computed incrementally over type + data to avoid allocation
```

---

## 7. Error Classes

All errors extend `HbScrubError`, which extends the native `Error`.

```typescript
import {
  HbScrubError,
  UnsupportedFormatError,
  InvalidFormatError,
  CorruptedFileError,
  BufferOverflowError,
  HeicProcessingError,
  SvgParseError,
} from 'hb-scrub';
```

| Class | When thrown |
|---|---|
| `HbScrubError` | Base class — never thrown directly |
| `UnsupportedFormatError` | Format not recognised by any handler (`detectFormat` returns `'unknown'`) |
| `InvalidFormatError` | Format recognised by magic bytes but file fails structural validation |
| `CorruptedFileError` | File structure too damaged to process |
| `BufferOverflowError` | Read or write went out of buffer bounds (usually indicates a corrupt file) |
| `HeicProcessingError` | HEIC/AVIF ISOBMFF box tree could not be parsed |
| `SvgParseError` | SVG content could not be processed |

All error instances include a descriptive `message` and preserve the standard `stack` trace.

---

## 8. File Signatures

Magic byte constants used for format detection (exported from `'hb-scrub'`):

```typescript
import { FILE_SIGNATURES } from 'hb-scrub';

FILE_SIGNATURES.JPEG       // Uint8Array [0xFF, 0xD8, 0xFF]
FILE_SIGNATURES.JPEG_SOI   // Uint8Array [0xFF, 0xD8]
FILE_SIGNATURES.PNG        // Uint8Array [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]
FILE_SIGNATURES.GIF87a     // Uint8Array — 'GIF87a' (6 bytes)
FILE_SIGNATURES.GIF89a     // Uint8Array — 'GIF89a' (6 bytes)
FILE_SIGNATURES.RIFF       // Uint8Array — 'RIFF' (WebP outer container)
FILE_SIGNATURES.WEBP       // Uint8Array — 'WEBP'
FILE_SIGNATURES.TIFF_LE    // Uint8Array [0x49, 0x49, 0x2A, 0x00] — 'II*\0'
FILE_SIGNATURES.TIFF_BE    // Uint8Array [0x4D, 0x4D, 0x00, 0x2A] — 'MM\0*'
FILE_SIGNATURES.FTYP       // Uint8Array — 'ftyp' (HEIC / ISOBMFF, at offset 4)
```

---

## 9. Format Detection

`detectFormat` checks magic bytes in this priority order:

1. JPEG — `FF D8 FF`
2. PNG — 8-byte signature
3. WebP — `RIFF????WEBP`
4. GIF — `GIF87a` or `GIF89a`
5. TIFF/DNG — `II*\0` (LE) or `MM\0*` (BE)
6. HEIC/AVIF — `ftyp` box at offset 4; brand determines heic vs avif
7. PDF — `%PDF-`
8. MP4/MOV — `ftyp` box; brand `mp4`, `qt  `, `isom`, etc.
9. SVG — UTF-8 decode, `<svg` element search
10. RAW — DNG, CR2, CR3, NEF, ARW heuristics (TIFF base with proprietary sub-IFDs)

---

## 10. Electron Main Process

Source: `electron/main.cjs`

The Electron entry point:

1. Sets environment variables to suppress benign GTK and Chromium console noise (`GTK_MODULES`, `GTK2_RC_FILES`)
2. Registers Chromium command-line switches to suppress VSync/DBus/GPU errors (`--disable-gpu-vsync`, `--log-level=3`)
3. Spawns `dist/hb-scrub.gui.js` as a child Node.js process on port **3777**
4. Polls `http://127.0.0.1:3777/` (up to 30 × 200 ms) until the server is ready
5. Opens a `BrowserWindow` (1100 × 820, min 760 × 560) with `webPreferences.preload` set to `electron/preload.cjs`, then loads `http://127.0.0.1:3777/`
6. Handles `ipcMain.handle('open-files')` — opens a native `dialog.showOpenDialog`, reads selected files to base64, and returns them to the renderer
7. Creates a system tray icon (`createTray()`) with a context menu that includes: Open, Watch Folder…, Stop Watching, Quit
8. `startWatch(dir)` / `stopWatch()` — uses `fs.watch` on a selected directory; each new supported file is pushed to the renderer via `webContents.send('watch-file', { name, base64, mime })`
9. Kills the child server process and stops the watcher on `will-quit`

### Preload bridge (`electron/preload.cjs`)

Exposes a safe API to the renderer via `contextBridge`:

```javascript
window.electronAPI = {
  openFiles:     () => ipcRenderer.invoke('open-files'),
  onWatchFile:   (cb) => ipcRenderer.on('watch-file', (_event, payload) => cb(payload)),
};
```

The renderer checks `if (window.electronAPI)` before using these — the GUI works identically in a plain browser tab when `window.electronAPI` is absent.

---

## 11. Build Outputs

Build tool: **Vite 7 + Rollup**. Minifier: **esbuild**. Target: **ES2022**. Source maps included.

| File | Format | Entry point |
|---|---|---|
| `dist/hb-scrub.js` | ESM | `src/index.ts` |
| `dist/hb-scrub.cjs` | CJS | `src/index.ts` |
| `dist/hb-scrub.node.js` | ESM | `src/node.ts` |
| `dist/hb-scrub.node.cjs` | CJS | `src/node.ts` |
| `dist/hb-scrub.stream.js` | ESM | `src/node-stream.ts` |
| `dist/hb-scrub.stream.cjs` | CJS | `src/node-stream.ts` |
| `dist/hb-scrub.heic.js` | ESM | `src/formats/heic.ts` |
| `dist/hb-scrub.heic.cjs` | CJS | `src/formats/heic.ts` |
| `dist/hb-scrub.cli.js` | ESM + shebang | `src/cli.ts` |
| `dist/hb-scrub.gui.js` | ESM | `src/gui.ts` |
| `dist/index.d.ts` | TypeScript declarations | `src/index.ts` |
| `dist/heic.d.ts` | TypeScript declarations | `src/formats/heic.ts` |
| `dist/node.d.ts` | TypeScript declarations | `src/node.ts` |
| `dist/node-stream.d.ts` | TypeScript declarations | `src/node-stream.ts` |

### Build commands

```bash
npm run build          # Full library + type declarations
npm run typecheck      # Type-check only (no emit)
npm run test           # Run test suite (vitest)
npm run lint           # ESLint
npm run lint:fix       # ESLint with auto-fix
npm run format         # Prettier
```

---

## 12. Source Layout

```
src/
  index.ts              Core API exports (removeMetadata, readMetadata, …)
  types.ts              All shared TypeScript interfaces and types
  detect.ts             Format detection (detectFormat, getMimeType, …)
  signatures.ts         FILE_SIGNATURES magic byte constants
  errors.ts             Error class definitions
  cli.ts                CLI entry point (parseArgs, applyProfile, loadRcFile, PROFILES)
  gui.ts                Local web GUI (HTTP server + embedded HTML/CSS/JS)
  node.ts               Node.js file API (processFile, processDir, …)
  node-stream.ts        Node.js Transform stream (createScrubStream)

  binary/
    buffer.ts           Buffer utilities (startsWith, concat, indexOf, …)
    dataview.ts         Bounds-checked integer read/write helpers
    crc32.ts            IEEE 802.3 CRC-32 + PNG chunk CRC

  exif/
    reader.ts           EXIF IFD parser → MetadataMap (populates raw tag map)
    writer.ts           Minimal EXIF APP1 builder (for orientation re-injection)
    gps.ts              GPS rational ↔ decimal conversion, redaction (incl. altitude)

  formats/
    jpeg.ts             JPEG segment scanner
    png.ts              PNG chunk processor
    webp.ts             WebP RIFF handler
    gif.ts              GIF block processor
    svg.ts              SVG string-based metadata stripper
    tiff.ts             TIFF/DNG IFD processor
    heic.ts             ISOBMFF (HEIC/HEIF/AVIF) handler
    avif.ts             AVIF — delegates to heic handler
    pdf.ts              PDF Info dict + XMP stream zeroing
    mp4.ts              MP4/MOV atom tree walker
    raw.ts              RAW format dispatcher (DNG + proprietary preview extraction)

  operations/
    remove.ts           removeMetadata / removeMetadataSync implementation
    read.ts             readMetadata / readMetadataSync implementation
    verify.ts           verifyClean / verifyCleanSync (incl. confidence scoring)
    batch.ts            processDir / processFiles (incl. matchGlob)

electron/
  main.cjs              Electron main process — spawns GUI server, IPC, Tray, watch
  preload.cjs           contextBridge: exposes electronAPI to renderer
```

---

## 13. GUI HTTP API

Source: `src/gui.ts`

The GUI server exposes a small JSON API on `http://127.0.0.1:3777`. All POST
endpoints accept and return `application/json`. Request bodies are limited to
**50 MB** by default (configurable via the `HB_SCRUB_MAX_BODY` environment
variable, in bytes).

### Exported function

```typescript
function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void;
```

The request handler can be used directly without `startGui()` — useful for
embedding in custom servers or tests.

### `GET /`

Serves the single-page GUI application (HTML + inline CSS/JS).

### `GET /api/formats`

Returns the list of supported format names (excludes `"unknown"`).

**Response** `200`
```json
["jpeg","png","webp","gif","svg","tiff","heic","avif","pdf","mp4","mov","dng","raw"]
```

### `POST /api/read`

Parse metadata from a file without modifying it.

**Request body**
```json
{
  "name": "photo.jpg",
  "data": "<base64-encoded file bytes>"
}
```

| Field  | Type   | Required | Description                            |
|--------|--------|----------|----------------------------------------|
| `name` | string | yes      | Original file name (used for format detection) |
| `data` | string | yes      | Base64-encoded file contents           |

**Response** `200`
```json
{
  "format": "jpeg",
  "metadataTypes": ["EXIF", "XMP", "IPTC", "ICC", "Thumbnail"]
}
```

### `POST /api/process`

Strip metadata from a file.

**Request body**
```json
{
  "name": "photo.jpg",
  "data": "<base64-encoded file bytes>",
  "options": {
    "preserveOrientation": true,
    "inject": { "copyright": "© 2026 Honey Badger Universe" }
  }
}
```

| Field     | Type   | Required | Description                            |
|-----------|--------|----------|----------------------------------------|
| `name`    | string | yes      | Original file name                     |
| `data`    | string | yes      | Base64-encoded file contents           |
| `options` | object | no       | `RemoveOptions` fields (see §3)        |

**Response** `200`
```json
{
  "name": "photo_clean.jpg",
  "format": "jpeg",
  "removed": ["EXIF", "XMP", "IPTC", "ICC", "Thumbnail"],
  "warnings": [],
  "data": "<base64-encoded cleaned file>"
}
```

### Error responses

| Status | Condition                                          | Body                                                           |
|--------|----------------------------------------------------|----------------------------------------------------------------|
| `400`  | Malformed JSON                                     | `{ "error": "Invalid JSON in request body" }`                  |
| `400`  | Missing `name` or `data`                           | `{ "error": "Missing required fields: name (string) and data (base64 string)" }` |
| `413`  | Request body exceeds size limit                    | `{ "error": "Request body exceeds 52428800 byte limit" }`     |
| `404`  | Unknown route                                      | `Not found` (plain text)                                       |
| `500`  | Processing error (unsupported format, corrupt file)| `{ "error": "<message>" }`                                    |

---

*Documentation for HB_Scrub v1.2.0 — © 2026 Honey Badger Universe*  
*Author: James Temple &lt;james@honey-badger.org&gt;*
