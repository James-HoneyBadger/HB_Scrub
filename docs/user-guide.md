# User Guide

HB_Scrub removes EXIF, GPS, and other metadata from images through direct binary manipulation — no re-encoding, no quality loss.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Browser API](#browser-api)
3. [Node.js API](#nodejs-api)
4. [CLI](#cli)
5. [Supported Formats](#supported-formats)
6. [Preserve Options](#preserve-options)
7. [HEIC Support](#heic-support)
8. [Error Handling](#error-handling)
9. [What Metadata is Removed](#what-metadata-is-removed)

---

## Quick Start

```typescript
import { removeMetadata } from 'hb-scrub';

const result = await removeMetadata(imageBytes); // Uint8Array

console.log(result.format);           // 'jpeg'
console.log(result.removedMetadata);  // ['EXIF', 'GPS', 'XMP']
console.log(result.originalSize);     // 3_200_000
console.log(result.cleanedSize);      // 2_980_000

// result.data is the cleaned Uint8Array
```

---

## Browser API

### From a file input

```typescript
import { removeMetadata } from 'hb-scrub';

const input = document.querySelector('input[type="file"]');

input.addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files![0];
  const buffer = await file.arrayBuffer();

  const result = await removeMetadata(new Uint8Array(buffer));

  // Download cleaned image
  const blob = new Blob([result.data], { type: `image/${result.format}` });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `clean-${file.name}`;
  a.click();

  URL.revokeObjectURL(url);
});
```

### From a data URL

```typescript
import { removeMetadata } from 'hb-scrub';

const dataUrl = 'data:image/jpeg;base64,/9j/4AAQ...';
const result = await removeMetadata(dataUrl);
```

### Accepted input types

`removeMetadata` accepts:
- `Uint8Array` — raw image bytes
- `ArrayBuffer` — e.g. from `file.arrayBuffer()`
- `string` — a base64 data URL (`data:image/...;base64,...`)

### Sync variant

A synchronous version is also available:

```typescript
import { removeMetadataSync } from 'hb-scrub';

const result = removeMetadataSync(imageBytes);
```

> **Note:** Both `removeMetadata` and `removeMetadataSync` perform the same work. The async version exists for API consistency in async contexts; it does not offload to a worker thread.

### Inspecting metadata without removing it

```typescript
import { getMetadataTypes } from 'hb-scrub';

const types = getMetadataTypes(imageBytes);
// e.g. ['EXIF', 'GPS', 'ICC Profile', 'XMP']
```

### Detecting the format

```typescript
import { detectFormat, getMimeType } from 'hb-scrub';

const format = detectFormat(imageBytes); // 'jpeg' | 'png' | ...
const mime   = getMimeType(format);      // 'image/jpeg'
```

---

## Node.js API

Import from `hb-scrub/node` for file system operations.

### Process a file

```typescript
import { processFile } from 'hb-scrub/node';

// Creates photo-clean.jpg in the same directory
const result = await processFile('photo.jpg');

console.log(result.inputPath);   // /absolute/path/photo.jpg
console.log(result.outputPath);  // /absolute/path/photo-clean.jpg
console.log(result.removedMetadata); // ['EXIF', 'GPS']
```

### Overwrite the original

```typescript
await processFile('photo.jpg', { inPlace: true });
```

### Custom output path

```typescript
await processFile('photo.jpg', { outputPath: 'output/clean.jpg' });
```

### Custom suffix

```typescript
// Creates photo-stripped.jpg
await processFile('photo.jpg', { suffix: '-stripped' });
```

### RAW files → JPEG output

For proprietary RAW formats (CR2, NEF, ARW), HB_Scrub extracts the embedded JPEG preview and strips its metadata. The output file extension is automatically updated:

```typescript
const result = await processFile('photo.cr2');
// result.outputPath => photo-clean.jpg  (not .cr2)
// result.outputFormat => 'jpeg'
```

### Using RemoveOptions with processFile

All [preserve options](#preserve-options) are supported:

```typescript
await processFile('photo.jpg', {
  preserveOrientation: true,
  preserveColorProfile: true,
  suffix: '-meta-stripped',
});
```

---

## CLI

### Basic usage

```bash
hb-scrub <file...> [options]
```

### Single file

```bash
hb-scrub photo.jpg
# → creates photo-clean.jpg
```

### Multiple files

```bash
hb-scrub *.jpg
# → creates photo1-clean.jpg, photo2-clean.jpg, ...
```

### Overwrite originals

```bash
hb-scrub photo.jpg --in-place
hb-scrub photo.jpg -i
```

### Custom output path (single file only)

```bash
hb-scrub photo.jpg --output output/clean.jpg
hb-scrub photo.jpg -o output/clean.jpg
```

### Custom suffix

```bash
hb-scrub photo.jpg --suffix -stripped
# → creates photo-stripped.jpg
```

### Preserve options

```bash
hb-scrub photo.jpg --preserve-orientation
hb-scrub photo.jpg --preserve-color-profile
hb-scrub photo.jpg --preserve-copyright
```

### Quiet mode

```bash
hb-scrub photo.jpg --quiet
hb-scrub photo.jpg -q
```

### Show version

```bash
hb-scrub --version
hb-scrub -v
```

### Show help

```bash
hb-scrub --help
hb-scrub -h
```

### Exit codes

| Code | Meaning |
|---|---|
| `0` | All files processed successfully |
| `1` | One or more files failed (error printed per file) |

### Example output

```
✓ photo.jpg → photo-clean.jpg (removed EXIF, GPS, XMP | 3.1 MB → 2.9 MB)
✗ corrupt.jpg: Invalid JPEG: expected marker
```

---

## Supported Formats

| Format | Extension(s) | Metadata removed |
|---|---|---|
| JPEG | `.jpg`, `.jpeg` | EXIF (APP1), XMP (APP1), IPTC (APP13), ICC Profile (APP2), Adobe (APP14), Comments, all unknown APP segments |
| PNG | `.png` | `tEXt`, `iTXt`, `zTXt`, `eXIf`, `tIME`, `iCCP` chunks |
| WebP | `.webp` | `EXIF`, `XMP`, `ICCP` chunks |
| GIF | `.gif` | Comment extensions, XMP application extensions, other application extensions |
| SVG | `.svg` | `<metadata>`, `<title>`, `<desc>`, `<rdf:RDF>`, editor namespaces (Inkscape, Illustrator, etc.), XML comments, `data-*` attributes |
| TIFF | `.tif`, `.tiff` | ImageDescription, Make, Model, Software, DateTime, Artist, Copyright, EXIF IFD, GPS IFD, XMP tag |
| HEIC/HEIF | `.heic`, `.heif` | EXIF item, XMP item (in-place zero overwrite within ISOBMFF structure) |
| DNG | `.dng` | Same as TIFF (DNG is TIFF-based) |
| RAW (CR2/NEF/ARW) | `.cr2`, `.nef`, `.arw` | Extracts embedded JPEG preview and strips its metadata; output is JPEG |

### Format detection

Format is detected entirely from **file content** (magic bytes), not from the file extension. A renamed JPEG will still be processed correctly.

---

## Preserve Options

By default, all metadata is removed. Use these options to selectively keep specific items.

| Option | Type | Description |
|---|---|---|
| `preserveOrientation` | `boolean` | Keep the EXIF orientation tag. If the original EXIF is removed, a minimal EXIF segment containing only the orientation value is re-injected. Applies to JPEG and WebP. |
| `preserveColorProfile` | `boolean` | Keep the ICC color profile. Applies to JPEG (APP2), PNG (`iCCP` chunk), and WebP (`ICCP` chunk). |
| `preserveCopyright` | `boolean` | Keep the copyright notice. Applies to TIFF/DNG (tag 33432). |
| `preserveTitle` | `boolean` | SVG only: keep the `<title>` element. |
| `preserveDescription` | `boolean` | SVG only: keep the `<desc>` element. |

### Example

```typescript
import { removeMetadata } from 'hb-scrub';

const result = await removeMetadata(imageBytes, {
  preserveOrientation: true,   // keep rotation info
  preserveColorProfile: true,  // keep colour accuracy
});

// result.removedMetadata will NOT include 'ICC Profile'
// even if an ICC profile was present in the original
```

---

## HEIC Support

HEIC processing is provided as a separate import to keep the core bundle small. Import it from `hb-scrub/heic`.

### Direct use

```typescript
import { heic } from 'hb-scrub/heic';

const cleaned = heic.remove(imageBytes);
```

### With the main API (auto-dispatch)

The main `removeMetadata` function dispatches to the HEIC handler automatically once you import it. Import `hb-scrub/heic` anywhere in your module graph before calling `removeMetadata` with HEIC data:

```typescript
import { removeMetadata } from 'hb-scrub';
import 'hb-scrub/heic'; // registers the HEIC handler

const result = await removeMetadata(heicBytes);
```

> **Implementation note:** HEIC metadata is zeroed out in-place within the ISOBMFF box structure rather than removed, because relocating boxes requires recalculating all offsets. The file size stays the same but all EXIF and XMP data bytes are overwritten with zeros.

---

## Error Handling

All errors extend `HbScrubError` and can be caught individually or together.

```typescript
import {
  removeMetadata,
  HbScrubError,
  UnsupportedFormatError,
  CorruptedFileError,
  InvalidFormatError,
} from 'hb-scrub';

try {
  const result = await removeMetadata(bytes);
} catch (err) {
  if (err instanceof UnsupportedFormatError) {
    console.log(`Format not supported: ${err.format}`);

  } else if (err instanceof CorruptedFileError) {
    console.log(`File corrupted at offset ${err.offset ?? 'unknown'}`);

  } else if (err instanceof InvalidFormatError) {
    console.log(`Bad input: ${err.message}`);

  } else if (err instanceof HbScrubError) {
    console.log(`HB_Scrub error: ${err.message}`);

  } else {
    throw err; // unexpected
  }
}
```

### Error classes

| Class | Thrown when |
|---|---|
| `InvalidFormatError` | Input is not a `Uint8Array`, `ArrayBuffer`, or valid data URL |
| `UnsupportedFormatError` | File format is not recognised or has no handler |
| `CorruptedFileError` | File structure is malformed (truncated segment, bad header, etc.) |
| `BufferOverflowError` | A read extends beyond the buffer bounds (usually indicates corruption) |
| `HeicProcessingError` | HEIC-specific parsing failure |
| `SvgParseError` | SVG does not contain a valid `<svg>` element |

---

## What Metadata is Removed

The following data is stripped by default (subject to preserve options):

- **GPS coordinates** — exact location where the photo was captured
- **EXIF data** — camera make and model, lens information, aperture, shutter speed, ISO, focal length, flash settings
- **Timestamps** — when the photo was taken, modified, or digitised
- **Device identifiers** — camera serial number, body and lens unique IDs
- **Software tags** — editing software name and version
- **Author information** — artist name, copyright holder, creator
- **Embedded thumbnails** — small preview images that may contain content that was cropped or edited out of the main image
- **XMP metadata** — RDF/XML sidecar metadata embedded in the file
- **IPTC data** — captions, keywords, contact info, usage rights
- **Comments** — freeform text comments embedded in JPEG/GIF
- **Editor artefacts** — Inkscape, Illustrator, Sketch, Figma namespaces in SVG files
