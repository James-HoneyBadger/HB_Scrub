# HB_Scrub

Remove EXIF, GPS, and other metadata from images and documents — in the browser, on the server, or from the command line.

No re-encoding. No quality loss. Zero runtime dependencies.

---

## Features

- **13 formats**: JPEG, PNG, WebP, GIF, SVG, TIFF, HEIC, AVIF, PDF, MP4/MOV, DNG, RAW
- **Works everywhere**: browser, Node.js, Deno, Bun, and any bundler
- **Binary manipulation**: metadata is stripped at the byte level — pixels are never touched
- **Read metadata**: inspect what's inside a file before or without removing anything
- **GPS redaction**: truncate coordinates to city/region/country precision instead of stripping
- **Metadata injection**: write a clean copyright, software, or artist field into the output
- **Field-level control**: remove only specific fields, or explicitly keep a named subset
- **Batch processing**: process entire directories with concurrency and audit reports (Node.js)
- **Stream API**: pipe files through a Node.js Transform stream
- **Sync and async APIs**
- **TypeScript-first**: full type definitions included, no `@types/` package needed
- **Zero dependencies**: the built package is ~55 KB (HEIC handler loaded separately)

---

## Installation

```bash
npm install hb-scrub
# or
yarn add hb-scrub
# or
pnpm add hb-scrub
```

---

## Quick Start

### Browser / Universal

```typescript
import { removeMetadata } from 'hb-scrub';

const result = await removeMetadata(imageBytes); // Uint8Array | ArrayBuffer | base64 data URL

console.log(result.format);           // 'jpeg'
console.log(result.removedMetadata);  // ['EXIF', 'GPS', 'XMP']
console.log(result.originalSize);     // 3_200_000
console.log(result.cleanedSize);      // 2_980_000

// result.data is the cleaned Uint8Array — ready to save or display
```

### Node.js (file system)

```typescript
import { processFile } from 'hb-scrub/node';

// Writes photo-clean.jpg next to the original
const result = await processFile('photo.jpg');

// Overwrite original
await processFile('photo.jpg', { inPlace: true });

// Custom output path
await processFile('photo.jpg', { outputPath: 'output/clean.jpg' });
```

### Sync API

```typescript
import { removeMetadataSync } from 'hb-scrub';

const result = removeMetadataSync(imageBytes);
```

---

## CLI

Install globally:

```bash
npm install -g hb-scrub
```

Or run without installing:

```bash
npx hb-scrub photo.jpg
```

### Usage

```
hb-scrub <file|dir...> [options]

BASIC
  -i, --in-place              Overwrite original files
  -o, --output <path>         Output file (single file only)
  -s, --suffix <suffix>       Output suffix (default: "-clean")
  -r, --recursive             Recurse into directories
  -q, --quiet                 Suppress output
  -h, --help                  Show this help
  -v, --version               Show version

METADATA INSPECTION
  --inspect                   Read and display metadata (no removal)

FIELD CONTROL
  --preserve-orientation      Keep EXIF orientation tag
  --preserve-color-profile    Keep ICC color profile
  --preserve-copyright        Keep copyright notice
  --remove <fields>           Remove ONLY these fields (comma-separated)
                              e.g. --remove GPS,EXIF
  --keep <fields>             Always keep these fields (comma-separated)
                              e.g. --keep "Copyright,ICC Profile"

GPS
  --gps-redact <precision>    city | region | country | remove (default: remove)
                              Truncate GPS instead of stripping it entirely.

INJECTION
  --inject-copyright <text>   Inject copyright string into output
  --inject-software <text>    Inject software string into output
  --inject-artist <text>      Inject artist string into output

BATCH / DIRECTORY
  --concurrency <N>           Max parallel files (default: 4)
  --dry-run                   Preview what would be done, write nothing
  --skip-existing             Skip files that already have an output
  --backup <suffix>           Back up originals (e.g. --backup .orig)

STDIN / STDOUT
  Pass '-' as the file argument to read from stdin and write to stdout.

AUDIT REPORT
  --report <file.json>        Write JSON audit report to file

WATCH MODE
  --watch <dir>               Watch directory for new files and process them
```

### Examples

```bash
# Strip metadata, write photo-clean.jpg
hb-scrub photo.jpg

# Multiple files at once
hb-scrub *.jpg *.png

# Overwrite originals, back them up first
hb-scrub photos/ --in-place --backup .bak --recursive

# Inspect metadata without removing anything
hb-scrub photo.jpg --inspect

# Redact GPS to city-level precision instead of removing
hb-scrub photo.jpg --gps-redact city

# Remove only GPS; keep everything else
hb-scrub photo.jpg --remove GPS

# Keep copyright and color profile; remove everything else
hb-scrub photo.jpg --keep "Copyright,ICC Profile"

# Inject a copyright notice after stripping
hb-scrub photo.jpg --inject-copyright "© 2026 Jane Smith"

# Process a directory, 8 files at a time, write an audit report
hb-scrub photos/ --recursive --concurrency 8 --report audit.json

# Dry-run a whole directory
hb-scrub photos/ --recursive --dry-run

# Pipe via stdin/stdout
cat photo.jpg | hb-scrub - > clean.jpg

# Watch a directory and auto-clean files as they arrive
hb-scrub --watch ./incoming
```

---

## Preserve Options

By default, all metadata is removed. Use the following methods to retain specific fields:

### Legacy flags (single field)

| Option | API flag | CLI flag | What it keeps |
|---|---|---|---|
| Orientation | `preserveOrientation: true` | `--preserve-orientation` | EXIF Orientation tag |
| Color Profile | `preserveColorProfile: true` | `--preserve-color-profile` | Embedded ICC color profile |
| Copyright | `preserveCopyright: true` | `--preserve-copyright` | EXIF/IPTC copyright field |

### Field allowlist / denylist (new)

```typescript
// Remove ONLY GPS — keep everything else
await removeMetadata(imageBytes, { remove: ['GPS'] });

// Always keep copyright and ICC profile, remove the rest
await removeMetadata(imageBytes, { keep: ['Copyright', 'ICC Profile'] });
```

Named fields: `'GPS'`, `'EXIF'`, `'XMP'`, `'ICC Profile'`, `'IPTC'`, `'Copyright'`, `'Orientation'`, `'Make'`, `'Model'`, `'Software'`, `'DateTime'`, `'Artist'`, `'Comment'`, `'Thumbnail'`, `'Title'`, `'Description'`

---

## Read Metadata

Inspect a file's metadata as structured data without modifying it:

```typescript
import { readMetadata } from 'hb-scrub';

const { metadata, format, fileSize } = await readMetadata(imageBytes);

console.log(metadata.make);             // 'Apple'
console.log(metadata.model);           // 'iPhone 15 Pro'
console.log(metadata.gps?.latitude);   // 51.505
console.log(metadata.gps?.longitude);  // -0.09
console.log(metadata.exif?.iso);       // 400
console.log(metadata.hasXmp);          // true
```

The returned `MetadataMap` object contains:

| Field | Type | Description |
|---|---|---|
| `format` | `SupportedFormat` | Detected file format |
| `make` | `string` | Camera make |
| `model` | `string` | Camera model |
| `software` | `string` | Creating software |
| `dateTime` | `string` | File modification date |
| `artist` | `string` | Artist / author |
| `copyright` | `string` | Copyright notice |
| `orientation` | `number` | EXIF orientation value (1–8) |
| `gps` | `GpsCoordinates` | Latitude, longitude, altitude, speed |
| `exif` | `ExifData` | Exposure, ISO, focal length, flash, … |
| `hasXmp` | `boolean` | XMP block present |
| `hasIcc` | `boolean` | ICC color profile present |
| `hasIptc` | `boolean` | IPTC block present |
| `hasThumbnail` | `boolean` | Embedded thumbnail present |

---

## GPS Redaction

Instead of stripping GPS entirely, truncate coordinates to a chosen precision level:

```typescript
import { removeMetadata } from 'hb-scrub';

const result = await removeMetadata(imageBytes, {
  gpsRedact: 'city',      // ≈ 1 km radius
  // gpsRedact: 'region', // ≈ 11 km radius
  // gpsRedact: 'country',// ≈ 111 km radius
  // gpsRedact: 'remove', // strip GPS entirely (default)
  // gpsRedact: 'exact',  // keep full GPS precision (no change)
});
```

| Level | Precision | Typical radius |
|---|---|---|
| `'exact'` | Full decimal degrees | Original accuracy |
| `'city'` | 2 decimal places | ≈ 1 km |
| `'region'` | 1 decimal place | ≈ 11 km |
| `'country'` | Integer degrees | ≈ 111 km |
| `'remove'` | Stripped | No location data (default) |

---

## Metadata Injection

Write clean metadata fields into the output after scrubbing:

```typescript
const result = await removeMetadata(imageBytes, {
  inject: {
    copyright: '© 2026 Jane Smith',
    software: 'My App v1.0',
    artist: 'Jane Smith',
    imageDescription: 'Product photo',
    dateTime: '2026:02:25 10:00:00',
  },
});
```

Supported for JPEG (written as EXIF APP1) and PNG (written as eXIf chunk). Other formats receive injection silently ignored.

---

## Verify Clean

Confirm no known metadata remains after scrubbing:

```typescript
import { verifyClean } from 'hb-scrub';

const { clean, remainingMetadata } = await verifyClean(cleanedBytes);
if (!clean) {
  console.warn('Residual metadata found:', remainingMetadata);
}
```

---

## Batch Processing (Node.js)

Process all files in a directory with concurrency control and an optional JSON audit report:

```typescript
import { processDir, processFiles } from 'hb-scrub/node';

// Process a whole directory
const { successful, failed, report } = await processDir('./photos', {
  recursive: true,
  concurrency: 8,
  inPlace: false,
  suffix: '-clean',
  dryRun: false,
  backupSuffix: '.bak',    // copy originals before overwriting
  skipExisting: true,
  gpsRedact: 'city',
});

console.log(`Processed ${report.successful}/${report.totalFiles} files`);
console.log(`Removed ${report.totalBytesRemoved} bytes total`);

// Save audit report
import { writeFile } from 'node:fs/promises';
await writeFile('audit.json', JSON.stringify(report, null, 2));

// Or pass an explicit list of files
const result = await processFiles(['a.jpg', 'b.png'], { inPlace: true });
```

The `AuditReport` contains per-file `AuditEntry` records with `file`, `format`, `originalSize`, `cleanedSize`, `removedMetadata`, `outputPath`, and any `error`.

---

## Node.js Stream API

Pipe files through a Transform stream — useful for processing uploads or streaming large files:

```typescript
import { createScrubStream } from 'hb-scrub/stream';
import { createReadStream, createWriteStream } from 'node:fs';

createReadStream('photo.jpg')
  .pipe(createScrubStream({ preserveOrientation: true }))
  .pipe(createWriteStream('photo-clean.jpg'));
```

> The stream buffers the entire input before processing — EXIF offsets can appear anywhere in a file and cannot be stripped incrementally.

---

## Format Support

| Format | Ext | EXIF | GPS | XMP | IPTC | ICC | Notes |
|---|---|---|---|---|---|---|---|
| JPEG | `.jpg` / `.jpeg` | ✓ | ✓ | ✓ | ✓ | ✓ | APP0–APPF segment scanning |
| PNG | `.png` | ✓ | ✓ | ✓ | — | ✓ | eXIf, iTXt, iCCP, tEXt chunks |
| WebP | `.webp` | ✓ | ✓ | ✓ | — | ✓ | RIFF EXIF/XMP/ICCP chunks |
| GIF | `.gif` | — | — | ✓ | — | — | XMP application extension |
| SVG | `.svg` | ✓ | ✓ | ✓ | — | — | XML metadata / RDF stripping |
| TIFF | `.tif` / `.tiff` | ✓ | ✓ | ✓ | ✓ | ✓ | IFD0 tag removal |
| HEIC / HEIF | `.heic` / `.heif` | ✓ | ✓ | ✓ | — | — | ISOBMFF box tree |
| AVIF | `.avif` | ✓ | ✓ | ✓ | — | — | Same ISOBMFF handler as HEIC |
| PDF | `.pdf` | ✓ | — | ✓ | — | — | Info dict + XMP stream zeroing |
| MP4 / MOV | `.mp4` / `.mov` | ✓ | ✓ | ✓ | — | — | Atom tree walking |
| DNG | `.dng` | ✓ | ✓ | ✓ | — | ✓ | Full TIFF/DNG IFD scrub |
| RAW | `.raw` / `.cr2` / `.nef` / `.arw` | ✓ | ✓ | — | — | — | Extracts clean JPEG preview |

---

## HEIC / AVIF Support

HEIC/HEIF/AVIF processing ships as a separate optional import to keep the main bundle lean:

```typescript
import { removeMetadata } from 'hb-scrub';
// heic handler is auto-registered — no extra setup needed
// If you need the handler directly:
import { heic } from 'hb-scrub/heic';
```

---

## Inspect Without Removing

### Quick metadata-type check

```typescript
import { getMetadataTypes, detectFormat, getMimeType } from 'hb-scrub';

const types  = getMetadataTypes(imageBytes);  // ['EXIF', 'GPS', 'ICC Profile']
const format = detectFormat(imageBytes);       // 'jpeg'
const mime   = getMimeType(format);            // 'image/jpeg'
```

### Structured metadata

```typescript
import { readMetadata } from 'hb-scrub';

const { metadata } = await readMetadata(imageBytes);
// metadata.make, metadata.model, metadata.gps, metadata.exif, …
```

---

## Error Handling

```typescript
import { removeMetadata, HbScrubError, UnsupportedFormatError } from 'hb-scrub';

try {
  const result = await removeMetadata(imageBytes);
} catch (err) {
  if (err instanceof UnsupportedFormatError) {
    console.error('Format not supported:', err.message);
  } else if (err instanceof HbScrubError) {
    console.error('Processing failed:', err.message);
  } else {
    throw err;
  }
}
```

**Error classes**: `HbScrubError` (base), `InvalidFormatError`, `CorruptedFileError`, `UnsupportedFormatError`, `BufferOverflowError`, `HeicProcessingError`, `SvgParseError`

---

## API Reference

### Core (browser + Node.js)

| Function | Returns | Description |
|---|---|---|
| `removeMetadata(input, options?)` | `Promise<RemoveResult>` | Strip metadata asynchronously |
| `removeMetadataSync(input, options?)` | `RemoveResult` | Strip metadata synchronously |
| `readMetadata(input)` | `Promise<ReadResult>` | Read structured metadata without modifying |
| `readMetadataSync(input)` | `ReadResult` | Sync version of readMetadata |
| `verifyClean(input)` | `Promise<VerifyResult>` | Confirm no metadata remains |
| `verifyCleanSync(input)` | `VerifyResult` | Sync version of verifyClean |
| `getMetadataTypes(input)` | `string[]` | List metadata type names present |
| `detectFormat(input)` | `SupportedFormat` | Detect image format |
| `getMimeType(format)` | `string` | Map format to MIME type string |
| `isFormatSupported(format)` | `boolean` | Check if a format has a handler |
| `getSupportedFormats()` | `SupportedFormat[]` | List all supported formats |

### Node.js (`hb-scrub/node`)

| Function | Returns | Description |
|---|---|---|
| `processFile(path, options?)` | `Promise<ProcessFileResult>` | Read, strip, and write a single file |
| `processDir(dir, options?, recursive?)` | `Promise<BatchResult>` | Process all files in a directory |
| `processFiles(paths, options?)` | `Promise<BatchResult>` | Process an explicit list of files |
| `createScrubStream(options?)` | `ScrubTransform` | Create a Node.js Transform stream |

### `RemoveOptions`

| Option | Type | Default | Description |
|---|---|---|---|
| `preserveOrientation` | `boolean` | `false` | Keep EXIF Orientation tag |
| `preserveColorProfile` | `boolean` | `false` | Keep ICC color profile |
| `preserveCopyright` | `boolean` | `false` | Keep copyright metadata |
| `preserveTitle` | `boolean` | `false` | Keep title field |
| `preserveDescription` | `boolean` | `false` | Keep description field |
| `remove` | `MetadataFieldName[]` | — | Remove only these fields; keep all others |
| `keep` | `MetadataFieldName[]` | — | Always keep these fields |
| `gpsRedact` | `GpsRedactPrecision` | `'remove'` | GPS handling: strip or truncate |
| `inject` | `MetadataInjectOptions` | — | Fields to write into the cleaned output |

### `BatchOptions` (extends `RemoveOptions`)

| Option | Type | Default | Description |
|---|---|---|---|
| `inPlace` | `boolean` | `false` | Overwrite input files |
| `outputDir` | `string` | same dir | Directory for cleaned files |
| `suffix` | `string` | `'-clean'` | Filename suffix for output |
| `concurrency` | `number` | `4` | Max files processed in parallel |
| `dryRun` | `boolean` | `false` | Detect only — write nothing |
| `skipExisting` | `boolean` | `false` | Skip if output already exists |
| `backupSuffix` | `string` | — | Copy original before overwriting |
| `include` | `string[]` | — | Glob patterns to include |
| `exclude` | `string[]` | — | Glob patterns to exclude |

---

## License

MIT
