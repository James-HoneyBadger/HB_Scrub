# Installation

## Requirements

- **Node.js** 18 or later (for CLI and server-side use)
- Any modern browser (for client-side/bundler use — no Node.js required)
- npm, yarn, or pnpm

---

## Library (npm)

```bash
npm install hb-scrub
```

```bash
yarn add hb-scrub
```

```bash
pnpm add hb-scrub
```

HB_Scrub has **zero runtime dependencies**. The install is self-contained.

---

## CLI (global)

Install globally to use `hb-scrub` as a command-line tool:

```bash
npm install -g hb-scrub
```

Verify the installation:

```bash
hb-scrub --version
```

---

## CLI (without global install)

Run directly via `npx` without installing:

```bash
npx hb-scrub photo.jpg
```

Or if the package is installed locally in a project:

```bash
./node_modules/.bin/hb-scrub photo.jpg
```

---

## HEIC Support (optional)

HEIC/HEIF processing is provided as a separate optional import. It is **not** included in the main bundle to keep the default bundle small (~50 KB).

```bash
# No extra package needed — it ships inside hb-scrub
# Just import from the /heic subpath:
import { heic } from 'hb-scrub/heic';
```

See the [User Guide](./user-guide.md#heic) for usage details.

---

## Module Formats

HB_Scrub ships both ESM and CommonJS builds:

| Import style | File used |
|---|---|
| `import` (ESM) | `dist/hb-scrub.js` |
| `require` (CJS) | `dist/hb-scrub.cjs` |

TypeScript type definitions are included at `dist/index.d.ts`. No `@types/` package is needed.

---

## Subpath Exports

| Import path | Purpose |
|---|---|
| `hb-scrub` | Main browser/universal API |
| `hb-scrub/node` | Node.js file system API |
| `hb-scrub/heic` | HEIC format handler (optional, larger chunk) |

---

## Bundler Configuration

HB_Scrub is tree-shakeable. If you only process JPEGs, unused format handlers (PNG, WebP, GIF, etc.) will be excluded from your bundle.

### Vite / Rollup

No special configuration required. Works out of the box.

### webpack

No special configuration required.

### Next.js

```js
// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  // No special config needed for client-side usage.
  // For server-side (API routes), Node.js >=18 is required.
};
module.exports = nextConfig;
```

---

## Verifying the Installation

```typescript
import { isFormatSupported, getSupportedFormats } from 'hb-scrub';

console.log(getSupportedFormats());
// ['jpeg', 'png', 'webp', 'gif', 'svg', 'tiff', 'heic', 'dng', 'raw']

console.log(isFormatSupported('jpeg')); // true
```
