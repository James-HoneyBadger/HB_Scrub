# HB_Scrub

> Remove EXIF, GPS, and other metadata from images and documents — in the browser, on the server, from the command line, or as a standalone desktop app.

No re-encoding. No quality loss. Zero runtime dependencies.

---

## Features

- **13 formats** — JPEG, PNG, WebP, GIF, SVG, TIFF, HEIC/HEIF, AVIF, PDF, MP4/MOV, DNG, RAW (CR2, NEF, ARW)
- **Works everywhere** — browser, Node.js, Deno, Bun, and any bundler
- **Standalone desktop app** — Electron GUI with native file dialog, system tray, watch-folder, and clipboard paste
- **Binary manipulation** — metadata stripped at the byte level; pixels are never touched
- **Read metadata** — inspect what's inside a file before removing anything
- **GPS redaction** — truncate coordinates (and altitude) to city/region/country precision instead of stripping
- **Metadata injection** — write a clean copyright, software, artist, description, or datetime field into the output
- **Named profiles** — `privacy`, `sharing`, and `archive` presets apply sensible field-control defaults in one flag
- **Config file** — `.hbscrubrc` JSON file auto-loaded from the project or home directory
- **Field-level control** — remove only specific fields, or explicitly keep a named subset
- **Verify mode** — confirm no metadata remains; includes format confidence score
- **Structured CLI output** — `--output-format table|json|csv` for scripting and dashboards
- **Batch processing** — process entire directories with concurrency and audit reports (Node.js)
- **Stream API** — pipe files through a Node.js Transform stream
- **Sync and async APIs**
- **TypeScript-first** — full type definitions included, no `@types/` package needed
- **Zero runtime dependencies** — built package is ~55 KB (HEIC handler loaded separately)

---

## Installation

```bash
npm install hb-scrub
# or
yarn add hb-scrub
# or
pnpm add hb-scrub
```

See [docs/installation.md](docs/installation.md) for full installation instructions including the CLI, desktop app, and platform-specific notes.

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
// result.data is the cleaned Uint8Array
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

## Desktop App (Electron)

HB_Scrub ships with a standalone Electron desktop application. No browser, no terminal, no configuration required.

```bash
# Clone the repo and install dependencies
git clone https://github.com/James-HoneyBadger/HB_Scrub.git
cd HB_Scrub
npm install

# Launch the desktop app
npm run electron
```

### Desktop App features

| Feature | Description |
|---|---|
| Drag & Drop | Drop files directly onto the window |
| Native File Dialog | "Browse Files" button opens a native OS file picker (Cmd/Ctrl+O) |
| Clipboard Paste | Paste image files directly from the clipboard (Ctrl+V / Cmd+V) |
| System Tray | App stays in the system tray when the window is closed |
| Watch Folder | Select a directory via the tray menu; new files are automatically cleaned |
| Before/After Diff | After scrubbing, removed metadata types are shown as struck-through text |
| ZIP Download | Download all cleaned files at once as a single `hb-scrub-clean.zip` |
| Persistent Settings | Preserve options are saved to `localStorage` and restored on relaunch |

To build a distributable package for your platform:

```bash
npm run electron:build:linux   # AppImage + .deb
npm run electron:build:win     # NSIS installer (.exe)
npm run electron:build:mac     # .dmg
```

Built packages are written to `release/`.

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
  --verify                    Verify the output contains no metadata

OUTPUT FORMAT
  --output-format <fmt>       table (default) | json | csv
                              Controls how results are printed to stdout

PROFILES
  --profile <name>            Apply a preset: privacy | sharing | archive
                              privacy  — strip all, preserve nothing
                              sharing  — strip EXIF/GPS; preserve orientation & color profile
                              archive  — strip GPS only; preserve copyright, orientation, color profile

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

INJECTION
  --inject-copyright <text>   Inject copyright string into output
  --inject-software <text>    Inject software string into output
  --inject-artist <text>      Inject artist string into output
  --inject-description <text> Inject image description into output
  --inject-datetime <text>    Inject datetime string ('YYYY:MM:DD HH:MM:SS')

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

CONFIG FILE
  .hbscrubrc (JSON) is auto-loaded from the current working directory or $HOME.
  CLI flags override config file values.
  Example: { "profile": "sharing", "outputFormat": "json" }
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
hb-scrub photo.jpg --inject-copyright "© 2026 Honey Badger Universe"

# Inject a description and datetime
hb-scrub photo.jpg --inject-description "Product shot" --inject-datetime "2026:01:15 12:00:00"

# Apply the 'sharing' profile (strips EXIF/GPS, keeps orientation & color profile)
hb-scrub photo.jpg --profile sharing

# Verify the cleaned output contains no residual metadata
hb-scrub photo.jpg --verify

# Output results as JSON for scripting
hb-scrub photos/ --recursive --output-format json

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

By default, **all** metadata is removed. Use these options to retain specific fields:

| Option | API flag | CLI flag | What it keeps |
|---|---|---|---|
| Orientation | `preserveOrientation: true` | `--preserve-orientation` | EXIF orientation tag |
| Color Profile | `preserveColorProfile: true` | `--preserve-color-profile` | Embedded ICC color profile |
| Copyright | `preserveCopyright: true` | `--preserve-copyright` | EXIF/IPTC copyright field |

### Field allowlist / denylist

```typescript
// Remove ONLY GPS — keep everything else
await removeMetadata(imageBytes, { remove: ['GPS'] });

// Always keep copyright and ICC profile, remove the rest
await removeMetadata(imageBytes, { keep: ['Copyright', 'ICC Profile'] });
```

Named fields: `'GPS'`, `'EXIF'`, `'XMP'`, `'ICC Profile'`, `'IPTC'`, `'Copyright'`, `'Orientation'`, `'Make'`, `'Model'`, `'Software'`, `'DateTime'`, `'Artist'`, `'Comment'`, `'Thumbnail'`, `'Title'`, `'Description'`

---

## GPS Redaction

```typescript
const result = await removeMetadata(imageBytes, {
  gpsRedact: 'city',    // ≈ 1 km radius
});
```

| Level | Decimal places | Typical radius |
|---|---|---|
| `'exact'` | Full | Original accuracy |
| `'city'` | 2 | ≈ 1 km |
| `'region'` | 1 | ≈ 11 km |
| `'country'` | 0 | ≈ 111 km |
| `'remove'` | — | Stripped entirely (default) |

> **Altitude redaction**: GPS altitude (EXIF GPS tags 5 and 6) is always zeroed whenever GPS data is removed or redacted, regardless of the `gpsRedact` level.

---

## Metadata Injection

```typescript
const result = await removeMetadata(imageBytes, {
  inject: {
    copyright:        '© 2026 Honey Badger Universe',
    software:         'HB_Scrub v1.1.0',
    artist:           'James Temple',
    imageDescription: 'Product photo — cleaned',
    dateTime:         '2026:01:15 12:00:00',
  },
});
```

Supported for JPEG (EXIF APP1) and PNG (eXIf chunk).

---

## Read Metadata

```typescript
import { readMetadata } from 'hb-scrub';

const { metadata, format, fileSize } = await readMetadata(imageBytes);

console.log(metadata.make);           // 'Apple'
console.log(metadata.model);          // 'iPhone 15 Pro'
console.log(metadata.gps?.latitude);  // 51.505
console.log(metadata.exif?.iso);      // 400
```

---

## Verify Clean

```typescript
import { verifyClean } from 'hb-scrub';

const { clean, remainingMetadata, confidence } = await verifyClean(cleanedBytes);
// confidence: 'high' | 'medium' | 'low' — reflects how thorough the check is for this format
if (!clean) {
  console.warn('Residual metadata found:', remainingMetadata);
}
```

| Confidence | Formats |
|---|---|
| `'high'` | JPEG, PNG, WebP, TIFF, HEIC, AVIF |
| `'medium'` | GIF, PDF, MP4, MOV, DNG, RAW |
| `'low'` | SVG and any unrecognised format |

---

## Batch Processing (Node.js)

```typescript
import { processDir } from 'hb-scrub/node';

const { report } = await processDir('./photos', {
  recursive:    true,
  concurrency:  8,
  suffix:       '-clean',
  gpsRedact:    'city',
  backupSuffix: '.bak',
});

console.log(`${report.successful}/${report.totalFiles} files processed`);
```

---

## Node.js Stream API

```typescript
import { createScrubStream } from 'hb-scrub/stream';
import { createReadStream, createWriteStream } from 'node:fs';

createReadStream('photo.jpg')
  .pipe(createScrubStream({ preserveOrientation: true }))
  .pipe(createWriteStream('photo-clean.jpg'));
```

---

## Format Support

| Format | Extensions | EXIF | GPS | XMP | IPTC | ICC |
|---|---|:---:|:---:|:---:|:---:|:---:|
| JPEG | `.jpg` `.jpeg` | ✓ | ✓ | ✓ | ✓ | ✓ |
| PNG | `.png` | ✓ | ✓ | ✓ | — | ✓ |
| WebP | `.webp` | ✓ | ✓ | ✓ | — | ✓ |
| GIF | `.gif` | — | — | ✓ | — | — |
| SVG | `.svg` | ✓ | ✓ | ✓ | — | — |
| TIFF | `.tif` `.tiff` | ✓ | ✓ | ✓ | ✓ | ✓ |
| HEIC / HEIF | `.heic` `.heif` | ✓ | ✓ | ✓ | — | — |
| AVIF | `.avif` | ✓ | ✓ | ✓ | — | — |
| PDF | `.pdf` | ✓ | — | ✓ | — | — |
| MP4 / MOV | `.mp4` `.mov` | ✓ | ✓ | ✓ | — | — |
| DNG | `.dng` | ✓ | ✓ | ✓ | — | ✓ |
| RAW | `.cr2` `.nef` `.arw` `.raw` | ✓ | ✓ | — | — | — |

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

Error classes: `HbScrubError` (base), `InvalidFormatError`, `CorruptedFileError`, `UnsupportedFormatError`, `BufferOverflowError`, `HeicProcessingError`, `SvgParseError`

---

## API Reference

| Function | Returns | Description |
|---|---|---|
| `removeMetadata(input, options?)` | `Promise<RemoveResult>` | Strip metadata asynchronously |
| `removeMetadataSync(input, options?)` | `RemoveResult` | Strip metadata synchronously |
| `readMetadata(input)` | `Promise<ReadResult>` | Read structured metadata without modifying |
| `readMetadataSync(input)` | `ReadResult` | Sync version |
| `verifyClean(input)` | `Promise<VerifyResult>` | Confirm no metadata remains; includes `confidence` score |
| `verifyCleanSync(input)` | `VerifyResult` | Sync version |
| `getMetadataTypes(input)` | `string[]` | List metadata type names present |
| `detectFormat(input)` | `SupportedFormat` | Detect image format |
| `getMimeType(format)` | `string` | Map format to MIME type string |
| `isFormatSupported(format)` | `boolean` | Check if a format has a handler |
| `getSupportedFormats()` | `SupportedFormat[]` | List all supported formats |

See [docs/technical-reference.md](docs/technical-reference.md) for the full API surface.

---

## Documentation

| Document | Description |
|---|---|
| [Installation Guide](docs/installation.md) | All installation methods, requirements, bundler config |
| [User Guide](docs/user-guide.md) | Detailed usage for all APIs, CLI, and the desktop app |
| [Technical Reference](docs/technical-reference.md) | Full API, types, format internals, binary utilities |

---

## License

MIT © 2026 [Honey Badger Universe](https://github.com/James-HoneyBadger)

---

*Built by [James Temple](mailto:james@honey-badger.org)*
