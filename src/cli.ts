/**
 * hb-scrub CLI — comprehensive metadata scrubbing tool
 *
 * Features:
 *  • Single files, globs, directories (recursive)
 *  • Concurrency control
 *  • Dry-run / preview mode
 *  • JSON audit report
 *  • stdin → stdout pipe  (use `-` as filename)
 *  • Watch mode (fs.watch on a directory)
 *  • Backup originals before in-place overwrite
 *  • Field-level remove / keep allowlist/denylist
 *  • GPS precision redaction
 *  • Metadata injection (copyright, software, artist, …)
 *  • Inspect mode: read & display metadata without removing
 */

import { readFileSync, watch } from 'node:fs';
import { readFile, writeFile, copyFile, mkdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, basename } from 'node:path';
import { processFile } from './node.js';
import { processDir } from './operations/batch.js';
import { readMetadata } from './operations/read.js';
import type { ProcessFileOptions } from './node.js';
import type {
  BatchOptions,
  GpsRedactPrecision,
  MetadataFieldName,
  AuditReport,
  ReadResult,
} from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getVersion(): string {
  const pkgPath = join(__dirname, '..', 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version: string };
  return pkg.version;
}

function formatSize(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
  return `${bytes} B`;
}

function formatMetadata(result: ReadResult): string {
  const lines: string[] = [];
  const m = result.metadata;

  lines.push(`  Format    : ${result.format}`);
  lines.push(`  File size : ${formatSize(result.fileSize)}`);
  if (m.make)             lines.push(`  Make      : ${m.make}`);
  if (m.model)            lines.push(`  Model     : ${m.model}`);
  if (m.software)         lines.push(`  Software  : ${m.software}`);
  if (m.dateTime)         lines.push(`  DateTime  : ${m.dateTime}`);
  if (m.artist)           lines.push(`  Artist    : ${m.artist}`);
  if (m.copyright)        lines.push(`  Copyright : ${m.copyright}`);
  if (m.imageDescription) lines.push(`  Desc      : ${m.imageDescription}`);
  if (m.orientation)      lines.push(`  Orient.   : ${m.orientation}`);
  if (m.gps) {
    lines.push(`  GPS       : ${m.gps.latitude.toFixed(6)}, ${m.gps.longitude.toFixed(6)}`);
    if (m.gps.altitude !== undefined)
      lines.push(`  Altitude  : ${m.gps.altitude.toFixed(1)} m`);
  }
  if (m.exif?.dateTimeOriginal) lines.push(`  Captured  : ${m.exif.dateTimeOriginal}`);
  if (m.exif?.fNumber)          lines.push(`  f/        : ${m.exif.fNumber}`);
  if (m.exif?.iso)              lines.push(`  ISO       : ${m.exif.iso}`);
  if (m.exif?.focalLength)      lines.push(`  Focal     : ${m.exif.focalLength} mm`);
  if (m.hasXmp)                 lines.push(`  XMP       : yes`);
  if (m.hasIcc)                 lines.push(`  ICC       : yes`);
  if (m.hasIptc)                lines.push(`  IPTC      : yes`);
  if (m.hasThumbnail)           lines.push(`  Thumbnail : yes`);

  return lines.join('\n');
}

// ─── Help text ────────────────────────────────────────────────────────────────

const HELP = `
hb-scrub <file|dir...> [options]

Remove metadata from images and documents.

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
  Pass '-' as file argument to read from stdin and write to stdout.
  Example:  cat photo.jpg | hb-scrub - > clean.jpg

AUDIT REPORT
  --report <file.json>        Write JSON audit report to file

WATCH MODE
  --watch <dir>               Watch directory for new files and process them
`.trim();

// ─── Argument parser ──────────────────────────────────────────────────────────

interface CliArgs {
  files: string[];
  inPlace: boolean;
  outputPath?: string;
  suffix?: string;
  recursive: boolean;
  quiet: boolean;
  inspect: boolean;
  preserveOrientation: boolean;
  preserveColorProfile: boolean;
  preserveCopyright: boolean;
  remove?: MetadataFieldName[];
  keep?: MetadataFieldName[];
  gpsRedact?: GpsRedactPrecision;
  injectCopyright?: string;
  injectSoftware?: string;
  injectArtist?: string;
  concurrency: number;
  dryRun: boolean;
  skipExisting: boolean;
  backup?: string;
  report?: string;
  watchDir?: string;
}

function parseArgs(raw: string[]): CliArgs {
  const args: CliArgs = {
    files: [],
    inPlace: false,
    recursive: false,
    quiet: false,
    inspect: false,
    preserveOrientation: false,
    preserveColorProfile: false,
    preserveCopyright: false,
    concurrency: 4,
    dryRun: false,
    skipExisting: false,
  };

  const take = (i: number, flag: string, rawArr: string[]): [number, string] => {
    const val = rawArr[i + 1];
    if (val === undefined || val.startsWith('-')) {
      console.error(`Error: ${flag} requires a value`);
      process.exit(1);
    }
    return [i + 1, val];
  };

  for (let i = 0; i < raw.length; i++) {
    const a = raw[i]!;
    switch (a) {
      case '-i': case '--in-place':             args.inPlace = true; break;
      case '-r': case '--recursive':            args.recursive = true; break;
      case '-q': case '--quiet':                args.quiet = true; break;
      case '--inspect':                         args.inspect = true; break;
      case '--preserve-orientation':            args.preserveOrientation = true; break;
      case '--preserve-color-profile':          args.preserveColorProfile = true; break;
      case '--preserve-copyright':              args.preserveCopyright = true; break;
      case '--dry-run':                         args.dryRun = true; break;
      case '--skip-existing':                   args.skipExisting = true; break;

      case '-o': case '--output': {
        const [ni, v] = take(i, a, raw); i = ni; args.outputPath = v; break;
      }
      case '-s': case '--suffix': {
        const [ni, v] = take(i, a, raw); i = ni; args.suffix = v; break;
      }
      case '--gps-redact': {
        const [ni, v] = take(i, a, raw); i = ni;
        const allowed = ['exact', 'city', 'region', 'country', 'remove'];
        if (!allowed.includes(v)) {
          console.error(`Error: --gps-redact must be one of: ${allowed.join(', ')}`);
          process.exit(1);
        }
        args.gpsRedact = v as GpsRedactPrecision;
        break;
      }
      case '--remove': {
        const [ni, v] = take(i, a, raw); i = ni;
        args.remove = v.split(',').map(s => s.trim()) as MetadataFieldName[];
        break;
      }
      case '--keep': {
        const [ni, v] = take(i, a, raw); i = ni;
        args.keep = v.split(',').map(s => s.trim()) as MetadataFieldName[];
        break;
      }
      case '--inject-copyright': {
        const [ni, v] = take(i, a, raw); i = ni; args.injectCopyright = v; break;
      }
      case '--inject-software': {
        const [ni, v] = take(i, a, raw); i = ni; args.injectSoftware = v; break;
      }
      case '--inject-artist': {
        const [ni, v] = take(i, a, raw); i = ni; args.injectArtist = v; break;
      }
      case '--concurrency': {
        const [ni, v] = take(i, a, raw); i = ni;
        const n = parseInt(v, 10);
        if (isNaN(n) || n < 1) {
          console.error('Error: --concurrency must be a positive integer');
          process.exit(1);
        }
        args.concurrency = n;
        break;
      }
      case '--backup': {
        const [ni, v] = take(i, a, raw); i = ni; args.backup = v; break;
      }
      case '--report': {
        const [ni, v] = take(i, a, raw); i = ni; args.report = v; break;
      }
      case '--watch': {
        const [ni, v] = take(i, a, raw); i = ni; args.watchDir = v; break;
      }
      default:
        if (a.startsWith('-')) {
          console.error(`Unknown option: ${a}`);
          process.exit(1);
        }
        args.files.push(a);
    }
  }

  return args;
}

// ─── Stdin → Stdout ───────────────────────────────────────────────────────────

async function processStdin(opts: ProcessFileOptions): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin as AsyncIterable<Buffer>) {
    chunks.push(chunk);
  }
  const input = new Uint8Array(Buffer.concat(chunks));
  const { removeMetadataSync } = await import('./operations/remove.js');
  const result = removeMetadataSync(input, opts);
  process.stdout.write(Buffer.from(result.data));
}

// ─── Watch mode ───────────────────────────────────────────────────────────────

function startWatch(dirPath: string, batchOpts: BatchOptions, quiet: boolean): void {
  const abs = resolve(dirPath);
  if (!quiet) console.log(`Watching ${abs} for new files…`);

  watch(abs, { recursive: true }, (_event, filename) => {
    if (!filename) return;
    const fullPath = join(abs, filename);

    setTimeout(async () => {
      try {
        const s = await stat(fullPath);
        if (!s.isFile()) return;
        await processFile(fullPath, { ...batchOpts });
        if (!quiet) console.log(`  ✓ ${basename(filename)}`);
      } catch { /* file may be transient */ }
    }, 200);
  });
}

// ─── Input classification ─────────────────────────────────────────────────────

async function classifyInputs(inputs: string[]): Promise<{ files: string[]; dirs: string[] }> {
  const files: string[] = [];
  const dirs: string[] = [];

  for (const p of inputs) {
    if (p === '-') { files.push(p); continue; }
    try {
      const s = await stat(resolve(p));
      if (s.isDirectory()) dirs.push(resolve(p));
      else files.push(resolve(p));
    } catch {
      console.error(`Warning: cannot access ${p}`);
    }
  }

  return { files, dirs };
}

// ─── Build shared options ─────────────────────────────────────────────────────

function buildOptions(a: CliArgs): ProcessFileOptions & BatchOptions {
  const opts: ProcessFileOptions & BatchOptions = {
    inPlace: a.inPlace,
    preserveOrientation: a.preserveOrientation,
    preserveColorProfile: a.preserveColorProfile,
    preserveCopyright: a.preserveCopyright,
    concurrency: a.concurrency,
    dryRun: a.dryRun,
    skipExisting: a.skipExisting,
    ...(a.suffix !== undefined     && { suffix: a.suffix }),
    ...(a.remove !== undefined     && { remove: a.remove }),
    ...(a.keep !== undefined       && { keep: a.keep }),
    ...(a.gpsRedact !== undefined  && { gpsRedact: a.gpsRedact }),
    ...(a.backup !== undefined     && { backupSuffix: a.backup }),
  };

  if (a.injectCopyright !== undefined || a.injectSoftware !== undefined || a.injectArtist !== undefined) {
    opts.inject = {
      ...(a.injectCopyright !== undefined && { copyright: a.injectCopyright }),
      ...(a.injectSoftware !== undefined  && { software: a.injectSoftware }),
      ...(a.injectArtist !== undefined    && { artist: a.injectArtist }),
    };
  }

  return opts;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);

  if (rawArgs.length === 0 || rawArgs.includes('-h') || rawArgs.includes('--help')) {
    console.log(HELP);
    return;
  }
  if (rawArgs.includes('-v') || rawArgs.includes('--version')) {
    console.log(getVersion());
    return;
  }

  const a = parseArgs(rawArgs);
  const baseOpts = buildOptions(a);

  // ── Watch mode ──
  if (a.watchDir) {
    startWatch(a.watchDir, baseOpts, a.quiet);
    process.stdin.resume();
    return;
  }

  if (a.files.length === 0) {
    console.error('Error: No input files or directories specified');
    process.exit(1);
  }

  const { files, dirs } = await classifyInputs(a.files);
  let hasError = false;
  const allReports: AuditReport[] = [];

  // ── Stdin → stdout ──
  if (files.includes('-')) {
    try {
      await processStdin(baseOpts);
    } catch (err) {
      console.error(`✗ stdin: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
    return;
  }

  // ── Inspect mode ──
  if (a.inspect) {
    for (const f of files) {
      try {
        const data = new Uint8Array(await readFile(f));
        const result = await readMetadata(data);
        console.log(`\n${f}`);
        console.log(formatMetadata(result));
      } catch (err) {
        console.error(`✗ ${f}: ${err instanceof Error ? err.message : String(err)}`);
        hasError = true;
      }
    }
    if (hasError) process.exit(1);
    return;
  }

  // ── Batch directories ──
  for (const dir of dirs) {
    const batchResult = await processDir(dir, baseOpts, a.recursive);
    allReports.push(batchResult.report);

    if (!a.quiet) {
      for (const entry of batchResult.successful) {
        if (a.dryRun) {
          console.log(`  (dry) ${entry.file}`);
        } else {
          console.log(`  ✓ ${entry.file} → ${entry.outputPath ?? entry.file}`);
        }
      }
      for (const entry of batchResult.failed) {
        console.error(`  ✗ ${entry.file}: ${entry.error}`);
        hasError = true;
      }
    } else {
      hasError = hasError || batchResult.failed.length > 0;
    }
  }

  // ── Individual files ──
  if (a.outputPath && files.length > 1) {
    console.error('Error: --output can only be used with a single input file');
    process.exit(1);
  }

  for (const f of files) {
    try {
      const opts: ProcessFileOptions = { ...baseOpts };
      if (a.outputPath) opts.outputPath = a.outputPath;

      if (a.dryRun) {
        const data = new Uint8Array(await readFile(f));
        const { removeMetadataSync } = await import('./operations/remove.js');
        const r = removeMetadataSync(data, opts);
        if (!a.quiet) {
          const fields = r.removedMetadata.join(', ') || 'none';
          console.log(`  (dry) ${f}  [${fields}]`);
        }
        continue;
      }

      if (a.backup && a.inPlace) {
        await copyFile(f, f + a.backup);
      }

      const result = await processFile(f, opts);

      if (!a.quiet) {
        const metaDesc = result.removedMetadata.length > 0
          ? `removed ${result.removedMetadata.join(', ')}`
          : 'no metadata found';
        const sizeDesc = `${formatSize(result.originalSize)} → ${formatSize(result.cleanedSize)}`;
        console.log(`  ✓ ${f} → ${result.outputPath} (${metaDesc} | ${sizeDesc})`);
      }
    } catch (err) {
      hasError = true;
      console.error(`  ✗ ${f}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ── Write audit report ──
  if (a.report && allReports.length > 0) {
    const combined: AuditReport = {
      timestamp: new Date().toISOString(),
      totalFiles:         allReports.reduce((s, r) => s + r.totalFiles, 0),
      successful:         allReports.reduce((s, r) => s + r.successful, 0),
      failed:             allReports.reduce((s, r) => s + r.failed, 0),
      skipped:            allReports.reduce((s, r) => s + r.skipped, 0),
      totalOriginalBytes: allReports.reduce((s, r) => s + r.totalOriginalBytes, 0),
      totalCleanedBytes:  allReports.reduce((s, r) => s + r.totalCleanedBytes, 0),
      totalBytesRemoved:  allReports.reduce((s, r) => s + r.totalBytesRemoved, 0),
      entries:            allReports.flatMap(r => r.entries),
    };
    await mkdir(dirname(resolve(a.report)), { recursive: true });
    await writeFile(a.report, JSON.stringify(combined, null, 2));
    if (!a.quiet) console.log(`\n  Report written to ${a.report}`);
  }

  if (hasError) process.exit(1);
}

// ─── Entry ────────────────────────────────────────────────────────────────────

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
