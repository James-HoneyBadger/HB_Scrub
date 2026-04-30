# Changelog

All notable changes to **hb-scrub** are documented in this file.  
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

---

## [1.5.0] — 2026-04-29

### Added
- **GeoTIFF tag removal** — tags 33550 (ModelPixelScale), 33922 (ModelTiepoint), 34735–34737 (GeoKey* tags) added to TIFF `TAGS_TO_REMOVE`.
- **Fujifilm RAF & Panasonic RW2** file-signature detection.
- **HEIC thumbnail zeroing** — thumbnail items (`thmb`) are detected and zeroed alongside EXIF/XMP.
- **HEIC HDR metadata** — `clli`, `mdcv`, and `auxC` box locations tracked and cleared.
- **MP4 atom coverage** — `elst`, `covr`, `chap`, `tmpo`, `cprt` atoms zeroed; `edts`/`tref` added as container atoms.
- **`GET /health` endpoint** — returns `{status:"ok", pid}` for liveness probes.
- **CORS + OPTIONS preflight** on the GUI HTTP server (loopback-only origin).
- **`X-Request-ID` response header** — echoes request ID or generates one per request.
- **`HB_SCRUB_HOST` env var** — configurable bind address for the GUI server (default `127.0.0.1`).
- **`clearAllPlugins()`** and **`registerFormats()`** bulk-register helper exported from the plugin system.
- **`RegisterFormatOptions`** interface — `onError` callback and `silent` flag for plugin registration.
- **`FormatPlugin.priority`** field — controls handler resolution order.
- **`VALID_FIELD_NAMES`** const tuple and **`isValidFieldName()`** type guard.
- New `ExifData` fields: `meteringMode`, `customRendered`, `sceneCaptureType`, `cameraOwnerName`, `bodySerialNumber`, `lensSpecification`.
- **`HbScrubError`** extended with `code`, `context`, `recoveryHint` fields and a `toJSON()` method.
- **`VerifyResult.remainingMetadataBreakdown`** — per-type count of remaining metadata.
- **`ReadResult.readTime`** — milliseconds taken to parse metadata.
- **Electron single-instance lock** — second launch focuses the existing window.
- **`--files` CLI arg** in Electron — pre-loads files passed on the command line.
- **`offWatchFile()`** and **`onInitialFiles()`** added to the Electron preload API; `onWatchFile()` now returns an unsubscribe function.
- **`verify:dist` npm script** — validates CJS and ESM dist outputs after build.
- **10 new GUI server tests** covering `/health`, `OPTIONS` preflight, `X-Request-ID`, and 413 oversized body (332 total).

### Changed
- GUI server body accumulation changed from string concatenation to `Buffer.concat()` to avoid UTF-8 chunk-split corruption.
- `pickServerPort()` in `server-utils.cjs` now returns `{port, source, attempts}` instead of a bare number.
- `SIGTERM` handler added to GUI entry point for graceful shutdown.
- Electron server crash auto-recovery — restarts the child process after 1 s on unexpected exit.
- `engines.node` tightened to `>=22.12.0`; `engines.npm >=10.0.0` added.

### Fixed
- **Integer overflow** in HEIC/MP4 64-bit size parsing (`hi * 0x100000000 + lo`).
- **Infinite loop** in GIF sub-block reader — `MAX_SUBBLOCK_ITERATIONS` guard added.
- **PDF encryption detection** — now scans the file tail (last 8 KiB) instead of only the header.
- **GUI XSS** — `esc()` HTML-escaping helper applied to all `innerHTML` injection points in the template.
- **PostCSS XSS** (GHSA-qx2v-qp2m-jg93) — upgraded `postcss` to ≥8.5.10.
- Atomic file writes in `node.ts` and `batch.ts` prevent partial-write corruption on crash.
- CLI `--in-place` + `--output` conflict and `--remove`/`--keep` overlap now detected and reported cleanly.

---

## [1.4.1] — 2026-04-18

### Added
- Desktop (Electron) app with system-tray integration and watch-folder support.
- GUI stats dashboard, session history, filter/sort controls, and retry flow.
- Onboarding panel and privacy-commitment copy.
- Tauri desktop target (`src-tauri/`).

### Fixed
- Electron startup now reuses an existing HB Scrub service on the default port or falls back to another local port.
- Linux packaging assets moved to `scripts/` and `packaging/linux/`.

---

## [1.4.0] — 2026-03-17

### Added
- GUI inject panel for writing copyright, artist, software, description, and date/time into cleaned files.
- GUI profile selector (Privacy / Sharing / Archive presets).
- Saved presets, audit-export button, and recent-files/folders surfaces.

### Changed
- GUI request-size limit raised; POST endpoints now return HTTP 413 before parsing oversized bodies.

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

## [1.2.0] — 2026-03-03

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
