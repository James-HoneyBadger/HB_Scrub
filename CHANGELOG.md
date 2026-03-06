# Changelog

All notable changes to **hb-scrub** are documented in this file.  
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

---

## [1.3.0] — 2026-03-06

### Added
- **Warnings system** — `RemoveResult`, `ReadResult`, and `VerifyResult` now
  include a `warnings: string[]` field that surfaces non-fatal issues (e.g.
  encrypted PDF detection, preserve-flag failures) instead of silently
  swallowing them.
- **Shared `normalizeInput()` utility** (`src/binary/normalize.ts`) — single
  source of truth for `Uint8Array | ArrayBuffer | string` conversion with
  hardened data-URL validation (MIME-type whitelist, base64 encoding check).
- **Shared TIFF utilities** (`src/binary/tiff.ts`) — `parseTiffHeader()` and
  `readOrientation()` extracted so all TIFF-based readers share the same code.
- **GUI request-size limit** — POST endpoints reject bodies larger than 50 MB
  (configurable via `HB_SCRUB_MAX_BODY` env var) with HTTP 413.
- **GUI field validation** — returns 400 for malformed JSON or missing required
  fields instead of 500.
- **`.hbscrubrc` schema validation** — unknown keys produce a stderr warning;
  parse errors are surfaced with a meaningful message.
- **Encrypted-PDF warning** — `removeMetadata` now emits a warning when a PDF
  appears to be encrypted and metadata removal may be incomplete.
- **GUI HTTP API documentation** — new §13 in `docs/technical-reference.md`
  covering all endpoints, request/response shapes, and error codes.
- **`CHANGELOG.md`** — this file.
- **`CONTRIBUTING.md`** — contributor guide.
- **GIF comment extraction** — `gif.read()` now extracts comment text from
  GIF comment extensions (`0xFE`), stored in `imageDescription` and
  `raw.comments`.
- **Batch `onProgress` callback** — `BatchOptions.onProgress` fires after each
  file with `(completed, total, currentFile)`, enabling progress bars and
  real-time feedback.
- **WebP metadata injection** — `removeMetadata` with `inject` option now
  supports WebP in addition to JPEG and PNG. Builds an EXIF RIFF chunk and
  updates VP8X flags.
- **WebP GPS redaction re-injection** — GPS pre-read and truncated GPS
  re-injection now supports WebP format.
- **GUI inject panel** — collapsible "Inject Metadata" section in the sidebar
  with fields for copyright, artist, software, description, and date/time.
- **GUI profile selector** — dropdown above options that auto-toggles checkboxes
  and GPS setting to match Privacy, Sharing, or Archive presets. Reverts to
  "Custom" when options are changed manually.

### Changed
- **Preserve post-processing collapsed** — the six repetitive `indexOf` +
  `splice` blocks in `processRemoval()` replaced by a data-driven loop over
  `PRESERVE_MAP`.
- **`normalizeInput` import path** — `read.ts` and `verify.ts` now import from
  `../binary/normalize.js` instead of re-importing from `remove.ts`.
- **PNG orientation reader** replaced its 30-line inline
  `readOrientationFromRawExif()` with the shared `readOrientation()` from
  `../binary/tiff.js`.

### Fixed
- **`ExifData` docs** — `exposureTime` corrected from `number` to `string`,
  `flash` from `number` to `boolean`, and eight missing fields added.

### Removed
- **`formatLabel()`** dead export pruned from `src/exif/reader.ts`.

---

## [1.2.0] — 2026-06-01

Initial public release. Supports JPEG, PNG, WebP, GIF, SVG, TIFF, HEIC, AVIF,
PDF, MP4/MOV, DNG, and proprietary RAW formats.

### Highlights
- Zero runtime dependencies — pure TypeScript + Web APIs.
- Runs in browsers, Node.js ≥ 20, Deno, Bun, and Electron.
- CLI with profiles, watch mode, batch processing, `.hbscrubrc` config.
- Local GUI served on `http://127.0.0.1:3777`.
- Desktop app via Electron with system-tray integration.
- Node.js file/directory helpers and a `Transform` stream.
- EXIF reader/writer, GPS redaction, orientation preservation.
