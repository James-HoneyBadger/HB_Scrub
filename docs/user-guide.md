# HB_Scrub — User Guide

This guide covers every way to use HB_Scrub: the desktop app, browser API, Node.js file API, CLI, streams, and batch processing.

---

## Table of Contents

1. [Desktop App](#1-desktop-app-electron)
2. [Browser / Universal API](#2-browser--universal-api)
3. [Node.js File API](#3-nodejs-file-api)
4. [CLI](#4-cli)
5. [Batch Processing](#5-batch-processing)
6. [Stream API](#6-stream-api)
7. [Reading Metadata](#7-reading-metadata)
8. [GPS Redaction](#8-gps-redaction)
9. [Metadata Injection](#9-metadata-injection)
10. [Field-Level Control](#10-field-level-control)
11. [Preserve Options](#11-preserve-options)
12. [Verify Clean](#12-verify-clean)
13. [Format-Specific Notes](#13-format-specific-notes)
14. [Error Handling](#14-error-handling)
15. [API Quick Reference](#15-api-quick-reference)
16. [Named Profiles](#16-named-profiles)
17. [Config File (.hbscrubrc)](#17-config-file-hbscrubrc)

---

## 1. Desktop App (Electron)

The desktop app provides a full graphical interface — no terminal, no browser tab, no configuration needed.

### Launching

```bash
npm run electron
```

Or, if you have built a distributable package, launch it like any native application (double-click the AppImage, run the installer, open the .dmg).

### What you can do in the GUI

| Feature | Description |
|---|---|
| Drag & Drop | Drop one or more files directly onto the app window |
| Browse Files | "Browse Files" button opens a native OS file-picker dialog (Cmd/Ctrl+O) |
| Clipboard Paste | Paste image files from the clipboard (Ctrl+V / Cmd+V) without opening a dialog |
| Format detection | Format and metadata summary shown immediately on drop |
| Preserve options | Toggle orientation, color profile, and copyright retention via checkboxes; settings persist across sessions |
| GPS redaction | Choose strip / city / region / country from a dropdown |
| Before/After Diff | Removed metadata types are shown as struck-through text alongside the clean output |
| Download | Clean file downloads to your default download folder |
| ZIP Download | Download all cleaned files at once as a single `hb-scrub-clean.zip` |
| Inspect | View raw metadata without removing anything |
| Batch | Drop or paste multiple files; each is processed independently |
| System Tray | App minimises to the system tray when closed |
| Watch Folder | Select a directory via the tray menu; new files are automatically cleaned and saved in-place |

### Port note

The desktop app runs an internal HTTP server on `localhost:3777`. If that port is in use, the app window will fail to load. See the [installation troubleshooting section](./installation.md#electron-app-window-does-not-appear).

---

## 2. Browser / Universal API

The core API works in any JavaScript environment — browser, Node.js, Deno, or Bun.

### `removeMetadata(input, options?)`

The main async entry point.

```typescript
import { removeMetadata } from 'hb-scrub';

// Accept any of: Uint8Array, ArrayBuffer, base64 data URL string
const result = await removeMetadata(imageBytes);

result.data            // Uint8Array — the cleaned file
result.format          // 'jpeg' | 'png' | 'webp' | ...
result.removedMetadata // ['EXIF', 'GPS', 'XMP']
result.originalSize    // bytes
result.cleanedSize     // bytes
```

### `removeMetadataSync(input, options?)`

Synchronous version — useful when async isn't available (e.g. Web Workers, sync scripts).

```typescript
import { removeMetadataSync } from 'hb-scrub';

const result = removeMetadataSync(imageBytes);
```

### Input types

HB_Scrub accepts all common binary representations:

```typescript
// Uint8Array (most common)
removeMetadata(new Uint8Array(buffer));

// ArrayBuffer
removeMetadata(buffer);

// Base64 data URL
removeMetadata('data:image/jpeg;base64,/9j/4AAQ...');
```

### Using in the browser with a file input

```typescript
import { removeMetadata } from 'hb-scrub';

document.getElementById('file-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  const buffer = await file.arrayBuffer();
  const result = await removeMetadata(new Uint8Array(buffer));

  // Create a download link
  const blob = new Blob([result.data], { type: `image/${result.format}` });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'clean-' + file.name;
  a.click();
});
```

---

## 3. Node.js File API

Import from `hb-scrub/node` for file-system operations.

### `processFile(inputPath, options?)`

Read a file from disk, strip metadata, write the result.

```typescript
import { processFile } from 'hb-scrub/node';

// Output: photo-clean.jpg (same directory)
const result = await processFile('photo.jpg');

result.inputPath   // '/abs/path/to/photo.jpg'
result.outputPath  // '/abs/path/to/photo-clean.jpg'
result.format      // 'jpeg'
result.originalSize
result.cleanedSize
result.removedMetadata
```

**Output path resolution** (evaluated in order):

1. `options.outputPath` — explicit path
2. `options.inPlace: true` — overwrites the input
3. Default — same directory, with `options.suffix` (default `'-clean'`) inserted before the extension

```typescript
// Overwrite the original
await processFile('photo.jpg', { inPlace: true });

// Custom output path
await processFile('photo.jpg', { outputPath: 'output/clean.jpg' });

// Custom suffix
await processFile('photo.jpg', { suffix: '-scrubbed' });
// → photo-scrubbed.jpg
```

---

## 4. CLI

### Installation

```bash
npm install -g hb-scrub
# or run without installing:
npx hb-scrub photo.jpg
```

### Synopsis

```
hb-scrub <file|dir...> [options]
```

### Full options

```
BASIC
  -i, --in-place              Overwrite original files
  -o, --output <path>         Output file (single file only)
  -s, --suffix <suffix>       Output suffix (default: "-clean")
  -r, --recursive             Recurse into directories
  -q, --quiet                 Suppress output
  -h, --help                  Show help
  -v, --version               Show version

METADATA INSPECTION
  --inspect                   Print metadata; no removal
  --verify                    Verify the output contains no residual metadata

OUTPUT FORMAT
  --output-format <fmt>       table (default) | json | csv
                              Controls how per-file results are printed to stdout

PROFILES
  --profile <name>            Apply a preset group of options:
                              privacy  — strip all, no preservations
                              sharing  — strip EXIF/GPS; preserve orientation & color profile
                              archive  — strip GPS only; preserve copyright, orientation, color profile

FIELD CONTROL
  --preserve-orientation      Keep EXIF orientation tag
  --preserve-color-profile    Keep ICC color profile
  --preserve-copyright        Keep copyright notice
  --remove <fields>           Remove ONLY these fields (comma-separated)
  --keep <fields>             Always keep these fields (comma-separated)

GPS
  --gps-redact <precision>    city | region | country | remove (default: remove)

INJECTION
  --inject-copyright <text>   Inject copyright string
  --inject-software <text>    Inject software string
  --inject-artist <text>      Inject artist string
  --inject-description <text> Inject image description string
  --inject-datetime <text>    Inject datetime ('YYYY:MM:DD HH:MM:SS')

BATCH / DIRECTORY
  --concurrency <N>           Max parallel files (default: 4)
  --dry-run                   Preview without writing
  --skip-existing             Skip if output already exists
  --backup <suffix>           Back up originals first (e.g. .bak)

STDIN / STDOUT
  Pass '-' as the file to read from stdin / write to stdout.

AUDIT REPORT
  --report <file.json>        Write JSON audit report

WATCH MODE
  --watch <dir>               Watch for new files and process automatically

CONFIG FILE
  .hbscrubrc (JSON) is auto-loaded from the current working directory or $HOME.
  CLI flags always override config file values.
  Example: { "profile": "sharing", "outputFormat": "json", "concurrency": 8 }
```

### Common examples

```bash
# Basic — writes photo-clean.jpg
hb-scrub photo.jpg

# Inspect metadata (read-only)
hb-scrub photo.jpg --inspect

# Strip all metadata from multiple files
hb-scrub *.jpg *.png

# Overwrite originals with backup
hb-scrub photos/ --in-place --backup .orig --recursive

# Remove only GPS; keep everything else
hb-scrub photo.jpg --remove GPS

# Keep copyright and color profile; strip the rest
hb-scrub photo.jpg --keep "Copyright,ICC Profile"

# Redact GPS to city-level (≈ 1 km) instead of stripping
hb-scrub photo.jpg --gps-redact city

# Inject a copyright notice
hb-scrub photo.jpg --inject-copyright "© 2026 Honey Badger Universe"

# Inject a description and datetime
hb-scrub photo.jpg --inject-description "Product shot" --inject-datetime "2026:01:15 12:00:00"

# Apply the 'sharing' profile
hb-scrub photo.jpg --profile sharing

# Apply the 'archive' profile across a whole directory
hb-scrub photos/ --recursive --profile archive

# Verify no metadata remains in the output
hb-scrub photo.jpg --verify

# Output results as JSON for scripting
hb-scrub photos/ --recursive --output-format json

# Output results as CSV
hb-scrub photos/ --recursive --output-format csv > results.csv

# Process a whole directory, 8 files at a time
hb-scrub photos/ --recursive --concurrency 8

# Dry-run — shows what would happen without writing
hb-scrub photos/ --recursive --dry-run

# Write an audit report
hb-scrub photos/ --recursive --report audit.json

# Stdin / stdout pipeline
cat photo.jpg | hb-scrub - > clean.jpg

# Watch a folder and clean new files automatically
hb-scrub --watch ./incoming
```

---

## 5. Batch Processing

### `processDir(dir, options?)`

Process all supported image files in a directory.

```typescript
import { processDir } from 'hb-scrub/node';

const { report } = await processDir('./photos', {
  recursive:    true,
  concurrency:  8,
  inPlace:      false,
  suffix:       '-clean',
  dryRun:       false,
  backupSuffix: '.bak',
  skipExisting: true,
  gpsRedact:    'city',
});

console.log(`${report.successful}/${report.totalFiles} files processed`);
console.log(`${report.totalBytesRemoved} bytes of metadata removed`);
```

### `processFiles(paths, options?)`

Process an explicit list of file paths.

```typescript
import { processFiles } from 'hb-scrub/node';

const result = await processFiles(['a.jpg', 'b.png', 'c.tiff'], {
  inPlace: true,
});
```

### Audit report

Both functions return a `BatchResult` with a full `AuditReport`. Save it to disk:

```typescript
import { writeFile } from 'node:fs/promises';

const { report } = await processDir('./photos', { recursive: true });
await writeFile('audit.json', JSON.stringify(report, null, 2));
```

The report contains per-file entries with: `file`, `format`, `originalSize`, `cleanedSize`, `removedMetadata`, `outputPath`, and `error` (if the file failed).

### `BatchOptions`

| Option | Type | Default | Description |
|---|---|---|---|
| `inPlace` | `boolean` | `false` | Overwrite input files |
| `outputDir` | `string` | same dir | Output directory |
| `suffix` | `string` | `'-clean'` | Filename suffix |
| `concurrency` | `number` | `4` | Max files processed in parallel |
| `dryRun` | `boolean` | `false` | Detect only — write nothing |
| `skipExisting` | `boolean` | `false` | Skip if output already exists |
| `backupSuffix` | `string` | — | Copy original before overwriting |
| `include` | `string[]` | — | Glob patterns to include |
| `exclude` | `string[]` | — | Glob patterns to exclude |

---

## 6. Stream API

Use `createScrubStream` to pipe files through a Node.js Transform stream — ideal for processing uploads or large files without loading the full content into application memory.

```typescript
import { createScrubStream } from 'hb-scrub/stream';
import { createReadStream, createWriteStream } from 'node:fs';

createReadStream('photo.jpg')
  .pipe(createScrubStream({ preserveOrientation: true }))
  .pipe(createWriteStream('photo-clean.jpg'));
```

With an HTTP upload:

```typescript
import { createScrubStream } from 'hb-scrub/stream';

app.post('/upload', (req, res) => {
  req
    .pipe(createScrubStream())
    .pipe(res);
});
```

> **Note:** The stream buffers the entire input before processing. EXIF offsets can appear anywhere in a file and cannot be stripped incrementally. Peak memory usage is roughly twice the file size.

---

## 7. Reading Metadata

Inspect a file's metadata as structured data without modifying it.

```typescript
import { readMetadata } from 'hb-scrub';

const { metadata, format, fileSize } = await readMetadata(imageBytes);

console.log(metadata.make);            // 'Apple'
console.log(metadata.model);           // 'iPhone 15 Pro'
console.log(metadata.software);        // 'iOS 17.0'
console.log(metadata.dateTime);        // '2026:01:15 14:32:00'
console.log(metadata.gps?.latitude);   // 51.505
console.log(metadata.gps?.longitude);  // -0.09
console.log(metadata.gps?.altitude);   // 32.5
console.log(metadata.exif?.iso);       // 400
console.log(metadata.exif?.focalLength); // 4.2
console.log(metadata.hasXmp);          // true
console.log(metadata.hasIcc);          // true
```

### Quick metadata-type check

```typescript
import { getMetadataTypes } from 'hb-scrub';

const types = getMetadataTypes(imageBytes);
// ['EXIF', 'GPS', 'XMP', 'ICC Profile', 'IPTC']
```

### `MetadataMap` fields

| Field | Type | Description |
|---|---|---|
| `make` | `string` | Camera make |
| `model` | `string` | Camera model |
| `software` | `string` | Creating software |
| `dateTime` | `string` | Modification timestamp |
| `artist` | `string` | Artist / author |
| `copyright` | `string` | Copyright notice |
| `orientation` | `number` | EXIF orientation value (1–8) |
| `gps` | `GpsCoordinates` | Latitude, longitude, altitude, speed |
| `exif` | `ExifData` | Exposure time, ISO, focal length, flash, … |
| `hasXmp` | `boolean` | XMP block present |
| `hasIcc` | `boolean` | ICC color profile present |
| `hasIptc` | `boolean` | IPTC block present |
| `hasThumbnail` | `boolean` | Embedded thumbnail present |
| `raw` | `Record<string, unknown>` | Raw IFD0 tag map (`ifd0:<tagNumber>` keys) — populated by `readMetadata` for TIFF-based formats |

---

## 8. GPS Redaction

Instead of stripping GPS entirely, you can truncate coordinates to a lower precision level — useful when approximate location data is acceptable but exact coordinates are not.

```typescript
const result = await removeMetadata(imageBytes, {
  gpsRedact: 'city',      // ≈ 1 km radius
  // gpsRedact: 'region', // ≈ 11 km radius
  // gpsRedact: 'country',// ≈ 111 km radius
  // gpsRedact: 'remove', // strip entirely (default)
  // gpsRedact: 'exact',  // no change
});
```

| Level | Decimal places | Typical radius | Use case |
|---|---|---|---|
| `'exact'` | Full | Original | No redaction |
| `'city'` | 2 | ≈ 1 km | Neighbourhood-level |
| `'region'` | 1 | ≈ 11 km | City-level |
| `'country'` | 0 | ≈ 111 km | Country-level |
| `'remove'` | — | None | Full removal (default) |

> **Altitude redaction**: GPS altitude (EXIF GPS tags 5 `GPSAltitudeRef` and 6 `GPSAltitude`) is always zeroed when GPS is removed or redacted at any level. This prevents altitude data from leaking even when coordinate precision is merely reduced.

CLI equivalent:

```bash
hb-scrub photo.jpg --gps-redact city
```

---

## 9. Metadata Injection

Write clean metadata fields into the output after scrubbing. Supported for JPEG (EXIF APP1) and PNG (eXIf chunk). Injection is silently skipped for other formats.

```typescript
const result = await removeMetadata(imageBytes, {
  inject: {
    copyright:        '© 2026 Honey Badger Universe',
    software:         'HB_Scrub v1.1.0',
    artist:           'James Temple',
    imageDescription: 'Product photo — cleaned',
    dateTime:         '2026:03:03 12:00:00',
  },
});
```

CLI equivalents:

```bash
hb-scrub photo.jpg --inject-copyright "© 2026 Honey Badger Universe"
hb-scrub photo.jpg --inject-software  "HB_Scrub v1.1.0"
hb-scrub photo.jpg --inject-artist    "James Temple"
hb-scrub photo.jpg --inject-description "Product shot"
hb-scrub photo.jpg --inject-datetime  "2026:01:15 12:00:00"
```

---

## 10. Field-Level Control

### Remove only specific fields

Strip only the listed fields and leave everything else untouched:

```typescript
await removeMetadata(imageBytes, { remove: ['GPS'] });
await removeMetadata(imageBytes, { remove: ['GPS', 'EXIF'] });
```

CLI:

```bash
hb-scrub photo.jpg --remove GPS
hb-scrub photo.jpg --remove "GPS,EXIF"
```

### Keep specific fields

Remove everything *except* the listed fields:

```typescript
await removeMetadata(imageBytes, { keep: ['Copyright', 'ICC Profile'] });
```

CLI:

```bash
hb-scrub photo.jpg --keep "Copyright,ICC Profile"
```

### Named fields

| Field name | What it covers |
|---|---|
| `'GPS'` | All GPS tags |
| `'EXIF'` | EXIF IFD (exposure, ISO, focal length, etc.) |
| `'XMP'` | XMP metadata block |
| `'ICC Profile'` | Embedded colour profile |
| `'IPTC'` | IPTC/NAA metadata |
| `'Copyright'` | Copyright string (EXIF tag 33432) |
| `'Orientation'` | EXIF orientation tag (274) |
| `'Make'` | Camera manufacturer |
| `'Model'` | Camera model |
| `'Software'` | Creating software |
| `'DateTime'` | File timestamp |
| `'Artist'` | Artist / author field |
| `'Comment'` | EXIF/JPEG comment |
| `'Thumbnail'` | Embedded thumbnail |
| `'Title'` | Title field (SVG, XMP) |
| `'Description'` | Description field (SVG, XMP) |

---

## 11. Preserve Options

Convenience flags for the most commonly retained fields:

| Option (`RemoveOptions`) | CLI flag | Keeps |
|---|---|---|
| `preserveOrientation: true` | `--preserve-orientation` | EXIF Orientation (tag 274) |
| `preserveColorProfile: true` | `--preserve-color-profile` | Embedded ICC color profile |
| `preserveCopyright: true` | `--preserve-copyright` | Copyright string (tag 33432) |
| `preserveTitle: true` | — | Title field (SVG / XMP) |
| `preserveDescription: true` | — | Description field (SVG / XMP) |

```typescript
const result = await removeMetadata(imageBytes, {
  preserveOrientation:  true,
  preserveColorProfile: true,
});
```

---

## 12. Verify Clean

Confirm that no known metadata remains after scrubbing:

```typescript
import { verifyClean } from 'hb-scrub';

const { clean, remainingMetadata, confidence } = await verifyClean(cleanedBytes);

if (!clean) {
  console.warn('Residual metadata detected:', remainingMetadata);
  // e.g. ['ICC Profile']
}

console.log(confidence); // 'high' | 'medium' | 'low'
```

`confidence` reflects how thorough the verification is for a given format:

| Confidence | Formats |
|---|---|
| `'high'` | JPEG, PNG, WebP, TIFF, HEIC, AVIF |
| `'medium'` | GIF, PDF, MP4, MOV, DNG, RAW |
| `'low'` | SVG and any unrecognised format |

CLI:

```bash
hb-scrub photo.jpg --verify
```

`verifyClean` runs `getMetadataTypes` on the cleaned output and reports any metadata types it can still detect. A `preserveColorProfile: true` run will typically report `['ICC Profile']` — this is expected.

---

## 13. Format-Specific Notes

### JPEG

- All APP0–APPF segments scanned
- Strips: EXIF (APP1), XMP (APP1), Extended XMP, ICC Profile (APP2), IPTC (APP13), Adobe (APP14), all unknown APPn segments
- `preserveOrientation` re-injects a minimal EXIF segment containing **only** the orientation tag

### PNG

- Strips: `eXIf`, `tEXt`, `iTXt`, `zTXt`, `iCCP`, `tIME`
- All structural chunks preserved: `IHDR`, `IDAT`, `IEND`, `PLTE`, `tRNS`, APNG animation chunks
- CRC-32 checksums recomputed for all kept chunks

### WebP

- RIFF container — strips `EXIF` and `XMP` chunks
- `ICCP` removed unless `preserveColorProfile`
- `VP8X` feature flags chunk automatically regenerated after removal

### GIF

- Strips: Comment extensions (`0xFE`), XMP application extensions, other application-specific extensions
- Preserves: Graphics Control extensions (animation timing), NETSCAPE extension (loop count)

### SVG

- Text-based — processed with regex/string operations on decoded UTF-8 content
- Strips: `<metadata>`, `<rdf:RDF>`, `<title>` (unless `preserveTitle`), `<desc>` (unless `preserveDescription`)
- Removes editor namespaces: Inkscape, Sodipodi, Illustrator, Sketch, Figma
- Removes: XML comments, `data-*` attributes, auto-generated UUID `id` attributes

### TIFF / DNG

- In-place IFD modification — existing byte offsets are not changed
- Tags removed by default: Make (271), Model (272), Software (305), DateTime (306), Artist (315), Copyright (33432), ExifIFD (34665), GPSInfo (34853), XMP (700), ImageDescription (270)
- Conditionally kept: Orientation (274), ICCProfile (34675), Copyright (33432)

### HEIC / HEIF / AVIF

- Import from `hb-scrub/heic` for direct access
- ISOBMFF container — EXIF and XMP items located via `iinf` and `iloc` boxes, then **zeroed in-place** (no box-tree reconstruction needed)

### PDF

- Info dictionary fields zeroed
- Embedded XMP metadata stream zeroed

### MP4 / MOV

- Atom tree walking
- Strips: `©mak` (make), `©mod` (model), `©cpy` (copyright), `©swr` (software) from `moov → udta` box

### RAW (CR2, NEF, ARW)

- Extracts the embedded JPEG preview and runs it through the JPEG handler
- Output is the cleaned JPEG preview, **not** the original RAW data
- `result.isPreview === true` for proprietary RAW; `result.isPreview === false` for DNG

---

## 14. Error Handling

```typescript
import {
  removeMetadata,
  HbScrubError,
  UnsupportedFormatError,
  CorruptedFileError,
  BufferOverflowError,
} from 'hb-scrub';

try {
  const result = await removeMetadata(imageBytes);
} catch (err) {
  if (err instanceof UnsupportedFormatError) {
    // File format not recognised or not supported
    console.error('Unsupported format:', err.message);
  } else if (err instanceof CorruptedFileError) {
    // File structure is invalid
    console.error('Corrupted file:', err.message);
  } else if (err instanceof BufferOverflowError) {
    // Internal read/write out of bounds — likely a corrupt file
    console.error('Buffer overflow:', err.message);
  } else if (err instanceof HbScrubError) {
    // Any other HB_Scrub-specific error
    console.error('Processing failed:', err.message);
  } else {
    throw err;
  }
}
```

### Error classes

| Class | Extends | Thrown when |
|---|---|---|
| `HbScrubError` | `Error` | Base class for all HB_Scrub errors |
| `UnsupportedFormatError` | `HbScrubError` | Format not recognised |
| `InvalidFormatError` | `HbScrubError` | Format recognised but file is structurally invalid |
| `CorruptedFileError` | `HbScrubError` | File is too damaged to process |
| `BufferOverflowError` | `HbScrubError` | Read/write went out of buffer bounds |
| `HeicProcessingError` | `HbScrubError` | HEIC-specific parsing error |
| `SvgParseError` | `HbScrubError` | SVG-specific processing error |

---

## 15. API Quick Reference

### Core (`hb-scrub`)

| Function | Signature | Description |
|---|---|---|
| `removeMetadata` | `(input, options?) → Promise<RemoveResult>` | Remove metadata async |
| `removeMetadataSync` | `(input, options?) → RemoveResult` | Remove metadata sync |
| `readMetadata` | `(input) → Promise<ReadResult>` | Read metadata async |
| `readMetadataSync` | `(input) → ReadResult` | Read metadata sync |
| `verifyClean` | `(input) → Promise<VerifyResult>` | Check no metadata remains async; includes `confidence` score |
| `verifyCleanSync` | `(input) → VerifyResult` | Sync version |
| `getMetadataTypes` | `(input) → string[]` | List metadata type names present |
| `detectFormat` | `(input) → SupportedFormat` | Detect file format |
| `getMimeType` | `(format) → string` | Map format to MIME type |
| `isFormatSupported` | `(format) → boolean` | Check format support |
| `getSupportedFormats` | `() → SupportedFormat[]` | List all formats |

### Node.js (`hb-scrub/node`)

| Function | Signature | Description |
|---|---|---|
| `processFile` | `(path, options?) → Promise<ProcessFileResult>` | Read, strip, write one file |
| `processDir` | `(dir, options?) → Promise<BatchResult>` | Process a directory |
| `processFiles` | `(paths, options?) → Promise<BatchResult>` | Process a list of files |
| `createScrubStream` | `(options?) → ScrubTransform` | Create a Transform stream |

### `RemoveOptions`

| Option | Type | Default | Description |
|---|---|---|---|
| `preserveOrientation` | `boolean` | `false` | Keep EXIF orientation |
| `preserveColorProfile` | `boolean` | `false` | Keep ICC color profile |
| `preserveCopyright` | `boolean` | `false` | Keep copyright field |
| `preserveTitle` | `boolean` | `false` | Keep title field |
| `preserveDescription` | `boolean` | `false` | Keep description field |
| `remove` | `MetadataFieldName[]` | — | Remove only these; keep all others |
| `keep` | `MetadataFieldName[]` | — | Always keep these fields |
| `gpsRedact` | `GpsRedactPrecision` | `'remove'` | GPS handling |
| `inject` | `MetadataInjectOptions` | — | Fields to write into cleaned output |

---

*Documentation for HB_Scrub v1.1.0 — © 2026 Honey Badger Universe*

---

## 16. Named Profiles

Profiles are named presets that apply a bundle of `RemoveOptions` in a single flag. They are the quickest way to apply a sensible default policy.

| Profile | Behaviour |
|---|---|
| `privacy` | Remove everything. No preservations. |
| `sharing` | Remove EXIF and GPS; preserve orientation and color profile. |
| `archive` | Remove GPS only; preserve copyright, orientation, and color profile. |

### API

```typescript
import { applyProfile } from 'hb-scrub/cli'; // exported helper

const opts = applyProfile('sharing', {});
// opts.preserveOrientation === true
// opts.preserveColorProfile === true
// opts.remove includes GPS and EXIF
```

### CLI

```bash
hb-scrub photo.jpg --profile privacy
hb-scrub photo.jpg --profile sharing
hb-scrub photos/ --recursive --profile archive
```

Explicit flags always override the profile. For example, `--profile sharing --preserve-copyright` adds copyright preservation on top of the sharing preset.

---

## 17. Config File (.hbscrubrc)

A `.hbscrubrc` JSON file is automatically loaded if found in:

1. The **current working directory** (`process.cwd()/.hbscrubrc`)
2. The **home directory** (`$HOME/.hbscrubrc`)

CLI flags take precedence over config file values.

### Supported keys

```json
{
  "profile":       "sharing",
  "outputFormat":  "json",
  "concurrency":   8,
  "recursive":     true,
  "inPlace":       false,
  "suffix":        "-clean",
  "gpsRedact":     "city",
  "dryRun":        false,
  "quiet":         false,
  "report":        "audit.json",
  "inject": {
    "copyright":   "© 2026 Honey Badger Universe",
    "software":    "HB_Scrub v1.1.0"
  }
}
```

Any key that maps to a CLI flag is accepted. Unknown keys are silently ignored.

---

*Documentation for HB_Scrub v1.1.0 — © 2026 Honey Badger Universe*
