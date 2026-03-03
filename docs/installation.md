# HB_Scrub — Installation Guide

This document covers every installation method: npm library, CLI, desktop app, and building from source.

---

## Requirements

| Requirement | Version | Notes |
|---|---|---|
| Node.js | ≥ 20.0.0 | Required for CLI, server-side use, and the desktop app |
| npm / yarn / pnpm | Any current | For package installation |
| OS | Windows, macOS, Linux | All platforms supported |
| Browser | Any modern browser (2020+) | For client-side/bundler use — no Node.js required |

---

## 1. Library (npm)

Install as a dependency in your project:

```bash
npm install hb-scrub
```

```bash
yarn add hb-scrub
```

```bash
pnpm add hb-scrub
```

HB_Scrub has **zero runtime dependencies**. The install is entirely self-contained (~55 KB for the core bundle).

### Verify the installation

```typescript
import { getSupportedFormats, isFormatSupported } from 'hb-scrub';

console.log(getSupportedFormats());
// ['jpeg', 'png', 'webp', 'gif', 'svg', 'tiff', 'heic', 'avif', 'dng', 'raw', 'pdf', 'mp4']

console.log(isFormatSupported('jpeg')); // true
```

---

## 2. CLI (global install)

Install globally to use `hb-scrub` as a command-line tool from anywhere:

```bash
npm install -g hb-scrub
```

Verify the installation:

```bash
hb-scrub --version
```

### CLI without a global install

Run directly via `npx` without installing:

```bash
npx hb-scrub photo.jpg
```

Or if installed locally in a project:

```bash
./node_modules/.bin/hb-scrub photo.jpg
```

---

## 3. Desktop App (Electron)

HB_Scrub includes a standalone Electron desktop application — a full GUI with drag-and-drop, no browser or terminal required.

### Option A: Run from source

```bash
# Clone the repository
git clone https://github.com/James-HoneyBadger/HB_Scrub.git
cd HB_Scrub

# Install dependencies
npm install

# Build and launch the desktop app
npm run electron
```

### Option B: Build a distributable package

```bash
# Linux — produces AppImage and .deb in release/
npm run electron:build:linux

# Windows — produces NSIS installer (.exe) in release/
npm run electron:build:win

# macOS — produces .dmg in release/
npm run electron:build:mac

# Current platform (auto-detect)
npm run electron:build
```

Built packages are written to `release/`.

### Desktop app requirements

- **Linux**: No special deps. AppImage is portable; `.deb` installs via `dpkg -i`.
- **Windows**: Installer handles all prerequisites.
- **macOS**: Standard .dmg drag-to-Applications install.

---

## 4. Local Web GUI (no Electron)

If you prefer to run the GUI in a browser without the Electron wrapper:

```bash
npm run gui
```

This builds the project and starts a local HTTP server at `http://localhost:3777`. Open that URL in any browser.

---

## 5. Build from Source

```bash
git clone https://github.com/James-HoneyBadger/HB_Scrub.git
cd HB_Scrub
npm install
npm run build
```

Build output is written to `dist/`. See [Technical Reference](./technical-reference.md#build-outputs) for a full listing of build artifacts.

---

## Module Formats

HB_Scrub ships both ESM and CommonJS builds:

| Import style | File used |
|---|---|
| `import` (ESM) | `dist/hb-scrub.js` |
| `require` (CJS) | `dist/hb-scrub.cjs` |

TypeScript type definitions are included at `dist/index.d.ts`. No `@types/` package is required.

---

## Subpath Exports

| Import path | Purpose |
|---|---|
| `hb-scrub` | Main browser/universal API |
| `hb-scrub/node` | Node.js file system API (`processFile`, `processDir`, streams) |
| `hb-scrub/heic` | HEIC/HEIF/AVIF handler (optional, loads a larger chunk) |

---

## HEIC / AVIF Support

HEIC processing ships as a separate optional import to keep the base bundle lean.
No extra package is needed — it's included in `hb-scrub`:

```typescript
// Auto-registered through the main entry — just import normally
import { removeMetadata } from 'hb-scrub';

// Or access the handler directly for advanced use:
import { heic } from 'hb-scrub/heic';
```

---

## Bundler Configuration

HB_Scrub is fully tree-shakeable. If you only process JPEGs, unused format handlers will be excluded from your bundle automatically.

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
  // For server-side (API routes), Node.js >= 20 is required.
};
module.exports = nextConfig;
```

### Deno

```typescript
import { removeMetadata } from 'npm:hb-scrub';
```

### Bun

```bash
bun add hb-scrub
```

---

## TypeScript

No additional `@types/` package is needed. Type definitions are bundled:

```json
// tsconfig.json
{
  "compilerOptions": {
    "moduleResolution": "bundler"  // or "node16" / "nodenext"
  }
}
```

---

## Troubleshooting

### `hb-scrub: command not found`

The global npm bin directory is not in your PATH. Run:

```bash
npm bin -g        # shows the global bin directory
export PATH="$(npm bin -g):$PATH"
```

Add that export to your shell's `.bashrc` / `.zshrc` to make it permanent.

### `Cannot find module 'hb-scrub'`

Ensure you have run `npm install` in your project directory and that `hb-scrub` appears in `node_modules/`.

### HEIC files not processed

Import from the `/heic` subpath or ensure the `hb-scrub/heic` chunk has been loaded. See [User Guide — HEIC Support](./user-guide.md#heic--heif--avif).

### Electron app window does not appear

The Electron app starts an internal HTTP server on port **3777**. If another process is using that port, the window will fail to load. Check with:

```bash
lsof -i :3777
```

Kill the conflicting process or change the port in `electron/main.cjs` and `src/gui.ts`.

---

*Documentation for HB_Scrub v1.1.0 — © 2026 Honey Badger Universe*
