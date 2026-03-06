# Contributing to HB_Scrub

Thanks for your interest in improving HB_Scrub! This guide covers the
conventions, architecture, and workflow you need to get started.

---

## Quick Start

```bash
git clone <repo-url> && cd HB_Scrub
npm install
npm test          # run vitest
npm run typecheck # tsc --noEmit
npm run build     # vite build + declarations
```

Node.js **≥ 20** is required.

---

## Project Structure

| Directory             | Purpose                                         |
|-----------------------|-------------------------------------------------|
| `src/formats/`        | One file per format — JPEG, PNG, WebP, etc.     |
| `src/operations/`     | High-level APIs: remove, read, verify, batch    |
| `src/binary/`         | Low-level buffer, CRC-32, data-view, TIFF utils |
| `src/exif/`           | EXIF reader, writer, GPS conversion              |
| `tests/`              | Vitest test files                                |
| `docs/`               | User guide, installation, technical reference    |
| `electron/`           | Electron desktop wrapper                         |

See `docs/technical-reference.md` §12 for the full source layout.

---

## Format Handler Contract

Every file in `src/formats/` must export an object implementing:

```typescript
interface FormatHandler {
  /** Strip metadata, return cleaned bytes + list of removed types. */
  remove(data: Uint8Array, options?: RemoveOptions): {
    data: Uint8Array;
    removedMetadata: string[];
  };

  /** Return the list of metadata-type names present in the file. */
  getMetadataTypes(data: Uint8Array): string[];

  /** Parse structured metadata without modifying the file. */
  read(data: Uint8Array): MetadataMap;
}
```

- **`remove()`** must be pure — no side-effects, same input → same output.
- **`removedMetadata`** strings should be human-readable labels like
  `"EXIF"`, `"XMP"`, `"ICC"`, `"GPS"`, `"Thumbnail"`.
- **`read()`** should populate as many `MetadataMap` fields as feasible.
- **`getMetadataTypes()`** should be fast — avoid full parsing when possible.

Register your handler in `src/operations/remove.ts` → `handlers` map and add
the format to `SupportedFormat` in `src/types.ts`.

---

## TypeScript Conventions

The project uses **maximum strictness**. Key tsconfig flags:

| Flag                             | Meaning                                |
|----------------------------------|----------------------------------------|
| `noUncheckedIndexedAccess`       | Index access returns `T \| undefined`  |
| `exactOptionalPropertyTypes`     | `undefined` is not assignable to optional props |
| `noPropertyAccessFromIndexSignature` | Must use bracket notation for index sigs |
| `noUnusedLocals` / `noUnusedParameters` | No dead variables                  |

**Style rules:**
- Use `const` by default; `let` only when reassignment is needed.
- Avoid `any` — use `unknown` and narrow.
- Prefer explicit return types on exported functions.
- Use `.js` extensions in relative imports (ESM resolution).
- No runtime dependencies — keep the bundle at zero deps.

---

## Testing

Tests live in `tests/` and use **Vitest** with `globals: true`.

```bash
npm test                    # run all tests
npx vitest run <file>       # run a single file
npx vitest --coverage       # with V8 coverage report
```

### Writing tests

- Name files `<feature>.test.ts`.
- Use `describe` / `it` blocks with clear descriptions.
- For format handlers, build minimal valid binary fixtures in code rather
  than committing large binary files.
- Assert both the happy path and edge cases (empty files, truncated data,
  wrong magic bytes).
- Check `warnings` arrays when testing operations that can produce non-fatal
  issues.

---

## Error Handling

- Throw `UnsupportedFormatError` for unrecognised formats.
- Throw `InvalidFormatError` for files that start with the right magic bytes
  but are structurally corrupt.
- **Never silently swallow errors.** Use `warnings: string[]` on result types
  to surface non-fatal problems. Any `catch` block that doesn't rethrow must
  push to a warnings array.

---

## GUI Changes

The GUI is a single HTML template embedded in `src/gui.ts`. If you change it:

1. Keep it as a single self-contained string — no external assets.
2. Test locally: `node dist/hb-scrub.gui.js` → open `http://127.0.0.1:3777`.
3. Validate all three API endpoints (`/api/formats`, `/api/read`,
   `/api/process`) still work.

---

## Pull Request Checklist

- [ ] `npm test` passes
- [ ] `npm run typecheck` passes (zero errors)
- [ ] New/changed public API is documented in `docs/technical-reference.md`
- [ ] `CHANGELOG.md` updated under `[Unreleased]`
- [ ] No new runtime dependencies introduced
- [ ] Format handlers implement the full `{ remove, getMetadataTypes, read }` contract
