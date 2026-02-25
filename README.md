# HB_Scrub

Remove EXIF, GPS, and other metadata from images — directly in the browser, on the server, or from the command line.

No re-encoding. No quality loss. Zero runtime dependencies.

---

## Features

- **9 formats**: JPEG, PNG, WebP, GIF, SVG, TIFF, HEIC, DNG, RAW
- **Works everywhere**: browser, Node.js, Deno, Bun, bundlers
- **Binary manipulation**: metadata is stripped at the byte level — pixels are never touched
- **Preserve options**: keep orientation, color profile, or copyright on a per-call basis
- **Sync and async APIs**
- **TypeScript-first**: full type definitions included, no `@types/` package needed
- **Zero dependencies**: the built package is ~50 KB (HEIC handler loaded separately)

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
hb-scrub <file...> [options]

Options:
  -o, --output <path>       Output file path (single file only)
  -s, --suffix <suffix>     Output filename suffix (default: -clean)
      --in-place            Overwrite the original file
      --preserve-orientation  Keep Orientation tag
      --preserve-color-profile  Keep ICC color profile
      --preserve-copyright    Keep copyright metadata
      --dry-run             Report without writing output
  -v, --version             Show version
  -h, --help                Show help
```

### Examples

```bash
# Strip metadata, write photo-clean.jpg
hb-scrub photo.jpg

# Multiple files at once
hb-scrub *.jpg *.png

# Overwrite originals
hb-scrub photo.jpg --in-place

# Preview what would be removed without writing
hb-scrub photo.jpg --dry-run

# Keep color profile and orientation
hb-scrub photo.jpg --preserve-color-profile --preserve-orientation
```

---

## Preserve Options

By default, all metadata is removed. Use these options to retain specific fields:

| Option | API flag | CLI flag | What it keeps |
|---|---|---|---|
| Orientation | `preserveOrientation: true` | `--preserve-orientation` | EXIF Orientation tag (rotation/flip) |
| Color Profile | `preserveColorProfile: true` | `--preserve-color-profile` | Embedded ICC color profile |
| Copyright | `preserveCopyright: true` | `--preserve-copyright` | EXIF/IPTC copyright field |

```typescript
const result = await removeMetadata(imageBytes, {
  preserveOrientation: true,
  preserveColorProfile: true,
});
```

---

## Format Support

| Format | EXIF | GPS | XMP | IPTC | ICC | Comments |
|---|---|---|---|---|---|---|
| JPEG | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| PNG | ✓ | ✓ | ✓ | — | ✓ | ✓ |
| WebP | ✓ | ✓ | ✓ | — | ✓ | — |
| GIF | — | — | ✓ | — | — | ✓ |
| SVG | ✓ | ✓ | ✓ | — | — | ✓ |
| TIFF | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| HEIC | ✓ | ✓ | ✓ | — | — | — |
| DNG | ✓ | ✓ | ✓ | — | ✓ | — |
| RAW (CR2/NEF/ARW) | ✓ | ✓ | — | — | — | — |

---

## HEIC Support

HEIC/HEIF processing ships as a separate optional import to keep the main bundle small:

```typescript
import { removeMetadata } from 'hb-scrub';
import { heic } from 'hb-scrub/heic';

const result = await removeMetadata(imageBytes, { heicHandler: heic });
```

---

## Inspect Without Removing

Check what metadata is present before deciding whether to strip it:

```typescript
import { getMetadataTypes, detectFormat, getMimeType } from 'hb-scrub';

const types  = getMetadataTypes(imageBytes);  // ['EXIF', 'GPS', 'ICC Profile']
const format = detectFormat(imageBytes);       // 'jpeg'
const mime   = getMimeType(format);            // 'image/jpeg'
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

| Function | Description |
|---|---|
| `removeMetadata(input, options?)` | Async — strip metadata, return `RemoveResult` |
| `removeMetadataSync(input, options?)` | Sync — same as above |
| `getMetadataTypes(input)` | List metadata types present (does not modify) |
| `detectFormat(input)` | Detect image format string |
| `getMimeType(format)` | Map format string to MIME type |
| `processFile(path, options?)` | Node.js only — read file, strip, write output |

Full documentation is in [docs/](docs/).

---

## Documentation

- [Installation](docs/installation.md)
- [User Guide](docs/user-guide.md)
- [Technical Reference](docs/technical-reference.md)

---

## License

MIT
