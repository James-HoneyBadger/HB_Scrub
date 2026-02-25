import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { processFile } from './node.js';
import type { ProcessFileOptions } from './node.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getVersion(): string {
  const pkgPath = join(__dirname, '..', 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version: string };
  return pkg.version;
}

function formatSize(bytes: number): string {
  if (bytes >= 1_000_000) {
    return `${(bytes / 1_000_000).toFixed(1)} MB`;
  }
  if (bytes >= 1_000) {
    return `${(bytes / 1_000).toFixed(1)} KB`;
  }
  return `${bytes} B`;
}

const HELP = `
hb-scrub <file...> [options]

Remove EXIF, GPS, and other metadata from images.

Options:
  -i, --in-place              Overwrite original files
  -o, --output <path>         Output file (single file only)
  -s, --suffix <suffix>       Output suffix (default: "-clean")
  --preserve-orientation      Keep EXIF orientation tag
  --preserve-color-profile    Keep ICC color profile
  --preserve-copyright        Keep copyright notice
  -q, --quiet                 Suppress output
  -h, --help                  Show help
  -v, --version               Show version
`.trim();

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    console.log(HELP);
    return;
  }

  if (args.includes('-v') || args.includes('--version')) {
    console.log(getVersion());
    return;
  }

  // Parse arguments
  const files: string[] = [];
  const options: ProcessFileOptions = {};
  let quiet = false;
  let outputPath: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    switch (arg) {
      case '-i':
      case '--in-place':
        options.inPlace = true;
        break;
      case '-o':
      case '--output': {
        const val = args[++i];
        if (!val) {
          console.error('Error: --output requires a path argument');
          process.exit(1);
        }
        outputPath = val;
        break;
      }
      case '-s':
      case '--suffix': {
        const val = args[++i];
        if (!val) {
          console.error('Error: --suffix requires a value');
          process.exit(1);
        }
        options.suffix = val;
        break;
      }
      case '--preserve-orientation':
        options.preserveOrientation = true;
        break;
      case '--preserve-color-profile':
        options.preserveColorProfile = true;
        break;
      case '--preserve-copyright':
        options.preserveCopyright = true;
        break;
      case '-q':
      case '--quiet':
        quiet = true;
        break;
      default:
        if (arg.startsWith('-')) {
          console.error(`Unknown option: ${arg}`);
          process.exit(1);
        }
        files.push(arg);
    }
  }

  if (files.length === 0) {
    console.error('Error: No input files specified');
    process.exit(1);
  }

  if (outputPath && files.length > 1) {
    console.error('Error: --output can only be used with a single input file');
    process.exit(1);
  }

  let hasError = false;

  for (const file of files) {
    try {
      const opts = { ...options };
      if (outputPath) {
        opts.outputPath = outputPath;
      }

      const result = await processFile(file, opts);

      if (!quiet) {
        const metaDesc =
          result.removedMetadata.length > 0
            ? `removed ${result.removedMetadata.join(', ')}`
            : 'no metadata found';
        const sizeDesc = `${formatSize(result.originalSize)} → ${formatSize(result.cleanedSize)}`;
        const inputName = file;
        const outputName = result.outputPath;
        console.log(`✓ ${inputName} → ${outputName} (${metaDesc} | ${sizeDesc})`);
      }
    } catch (err) {
      hasError = true;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`✗ ${file}: ${message}`);
    }
  }

  if (hasError) {
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  process.exit(1);
});
