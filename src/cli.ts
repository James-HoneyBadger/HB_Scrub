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
 *  • Metadata injection (copyright, software, artist, description, datetime)
 *  • Inspect mode: read & display metadata without removing
 *  • Verify mode: confirm output is metadata-free
 *  • Named profiles: privacy, sharing, archive
 *  • .hbscrubrc config file support
 */

import { readFileSync, watch, existsSync } from 'node:fs';
import { readFile, writeFile, copyFile, mkdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, basename } from 'node:path';
import { homedir } from 'node:os';
import { processFile } from './node.js';
import { processDir } from './operations/batch.js';
import { readMetadata } from './operations/read.js';
import { verifyCleanSync } from './operations/verify.js';
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

/**
 * Structured CLI exit codes for scripting and CI integration.
 *  0 = success
 *  1 = partial failure (some files failed)
 *  2 = total failure (all files failed)
 *  3 = configuration / argument error
 *  4 = no input files
 */
export const EXIT_CODES = {
  SUCCESS: 0,
  PARTIAL_FAILURE: 1,
  TOTAL_FAILURE: 2,
  CONFIG_ERROR: 3,
  NO_INPUT: 4,
} as const;
export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function formatMetadata(result: ReadResult): string {
  const lines: string[] = [];
  const m = result.metadata;

  lines.push(`  Format    : ${result.format}`);
  lines.push(`  File size : ${formatSize(result.fileSize)}`);
  if (m.make) {
    lines.push(`  Make      : ${m.make}`);
  }
  if (m.model) {
    lines.push(`  Model     : ${m.model}`);
  }
  if (m.software) {
    lines.push(`  Software  : ${m.software}`);
  }
  if (m.dateTime) {
    lines.push(`  DateTime  : ${m.dateTime}`);
  }
  if (m.artist) {
    lines.push(`  Artist    : ${m.artist}`);
  }
  if (m.copyright) {
    lines.push(`  Copyright : ${m.copyright}`);
  }
  if (m.imageDescription) {
    lines.push(`  Desc      : ${m.imageDescription}`);
  }
  if (m.orientation) {
    lines.push(`  Orient.   : ${m.orientation}`);
  }
  if (m.gps) {
    lines.push(`  GPS       : ${m.gps.latitude.toFixed(6)}, ${m.gps.longitude.toFixed(6)}`);
    if (m.gps.altitude !== undefined) {
      lines.push(`  Altitude  : ${m.gps.altitude.toFixed(1)} m`);
    }
  }
  if (m.exif?.dateTimeOriginal) {
    lines.push(`  Captured  : ${m.exif.dateTimeOriginal}`);
  }
  if (m.exif?.fNumber) {
    lines.push(`  f/        : ${m.exif.fNumber}`);
  }
  if (m.exif?.iso) {
    lines.push(`  ISO       : ${m.exif.iso}`);
  }
  if (m.exif?.focalLength) {
    lines.push(`  Focal     : ${m.exif.focalLength} mm`);
  }
  if (m.hasXmp) {
    lines.push(`  XMP       : yes`);
  }
  if (m.hasIcc) {
    lines.push(`  ICC       : yes`);
  }
  if (m.hasIptc) {
    lines.push(`  IPTC      : yes`);
  }
  if (m.hasThumbnail) {
    lines.push(`  Thumbnail : yes`);
  }

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
  --verify                    After scrubbing, re-verify output is clean
  --stego-check               Scan for steganography indicators
  --diff                      Show before/after metadata diff

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
  --inject-description <text> Inject image description into output
  --inject-datetime <text>    Inject date/time into output (ISO 8601 or TIFF format)

PDF
  --pdf-password <pass>       Password for encrypted PDFs

PROFILES (shorthand option sets)
  --profile privacy           Strip GPS, device info, software; keep orientation + ICC
  --profile sharing           Strip GPS & device info; keep orientation, ICC, copyright
  --profile archive           Keep orientation, ICC, copyright, title, description;
                              remove only GPS and software

BATCH / DIRECTORY
  --concurrency <N>           Max parallel files (default: 4)
  --dry-run                   Preview what would be done, write nothing
  --skip-existing             Skip files that already have an output
  --backup <suffix>           Back up originals (e.g. --backup .orig)
  --include <glob>            Only process files matching glob (e.g. "*.jpg")
  --exclude <glob>            Skip files matching glob (e.g. "*.svg")

STDIN / STDOUT
  Pass '-' as file argument to read from stdin and write to stdout.
  Example:  cat photo.jpg | hb-scrub - > clean.jpg

AUDIT REPORT
  --report <file.json>        Write JSON audit report to file
  --output-format <fmt>       Output format: table (default) | json | csv

WATCH MODE
  --watch <dir>               Watch directory for new files and process them

CONFIG FILE
  Options are also loaded from .hbscrubrc (JSON) in the current directory
  or home directory. CLI flags take precedence.
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
  verify: boolean;
  preserveOrientation: boolean;
  preserveColorProfile: boolean;
  preserveCopyright: boolean;
  remove?: MetadataFieldName[];
  keep?: MetadataFieldName[];
  gpsRedact?: GpsRedactPrecision;
  injectCopyright?: string;
  injectSoftware?: string;
  injectArtist?: string;
  injectDescription?: string;
  injectDatetime?: string;
  pdfPassword?: string;
  stegoCheck: boolean;
  diff: boolean;
  concurrency: number;
  dryRun: boolean;
  skipExisting: boolean;
  backup?: string;
  include?: string;
  exclude?: string;
  report?: string;
  watchDir?: string;
  outputFormat: 'table' | 'json' | 'csv';
  profile?: 'privacy' | 'sharing' | 'archive';
}

export function parseArgs(raw: string[]): CliArgs {
  const args: CliArgs = {
    files: [],
    inPlace: false,
    recursive: false,
    quiet: false,
    inspect: false,
    verify: false,
    stegoCheck: false,
    diff: false,
    preserveOrientation: false,
    preserveColorProfile: false,
    preserveCopyright: false,
    concurrency: 4,
    dryRun: false,
    skipExisting: false,
    outputFormat: 'table',
  };

  const take = (i: number, flag: string, rawArr: string[]): [number, string] => {
    const val = rawArr[i + 1];
    if (val === undefined || val.startsWith('-')) {
      console.error(`Error: ${flag} requires a value`);
      process.exit(EXIT_CODES.CONFIG_ERROR);
    }
    return [i + 1, val];
  };

  for (let i = 0; i < raw.length; i++) {
    const a = raw[i]!;
    switch (a) {
      case '-i':
      case '--in-place':
        args.inPlace = true;
        break;
      case '-r':
      case '--recursive':
        args.recursive = true;
        break;
      case '-q':
      case '--quiet':
        args.quiet = true;
        break;
      case '--inspect':
        args.inspect = true;
        break;
      case '--verify':
        args.verify = true;
        break;
      case '--stego-check':
        args.stegoCheck = true;
        break;
      case '--diff':
        args.diff = true;
        break;
      case '--preserve-orientation':
        args.preserveOrientation = true;
        break;
      case '--preserve-color-profile':
        args.preserveColorProfile = true;
        break;
      case '--preserve-copyright':
        args.preserveCopyright = true;
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--skip-existing':
        args.skipExisting = true;
        break;

      case '-o':
      case '--output': {
        const [ni, v] = take(i, a, raw);
        i = ni;
        args.outputPath = v;
        break;
      }
      case '-s':
      case '--suffix': {
        const [ni, v] = take(i, a, raw);
        i = ni;
        args.suffix = v;
        break;
      }
      case '--gps-redact': {
        const [ni, v] = take(i, a, raw);
        i = ni;
        const allowed = ['exact', 'city', 'region', 'country', 'remove'];
        if (!allowed.includes(v)) {
          console.error(`Error: --gps-redact must be one of: ${allowed.join(', ')}`);
          process.exit(EXIT_CODES.CONFIG_ERROR);
        }
        args.gpsRedact = v as GpsRedactPrecision;
        break;
      }
      case '--remove': {
        const [ni, v] = take(i, a, raw);
        i = ni;
        args.remove = v.split(',').map(s => s.trim());
        break;
      }
      case '--keep': {
        const [ni, v] = take(i, a, raw);
        i = ni;
        args.keep = v.split(',').map(s => s.trim());
        break;
      }
      case '--inject-copyright': {
        const [ni, v] = take(i, a, raw);
        i = ni;
        args.injectCopyright = v;
        break;
      }
      case '--inject-software': {
        const [ni, v] = take(i, a, raw);
        i = ni;
        args.injectSoftware = v;
        break;
      }
      case '--inject-artist': {
        const [ni, v] = take(i, a, raw);
        i = ni;
        args.injectArtist = v;
        break;
      }
      case '--inject-description': {
        const [ni, v] = take(i, a, raw);
        i = ni;
        args.injectDescription = v;
        break;
      }
      case '--inject-datetime': {
        const [ni, v] = take(i, a, raw);
        i = ni;
        args.injectDatetime = v;
        break;
      }
      case '--pdf-password': {
        const [ni, v] = take(i, a, raw);
        i = ni;
        args.pdfPassword = v;
        break;
      }
      case '--concurrency': {
        const [ni, v] = take(i, a, raw);
        i = ni;
        const n = parseInt(v, 10);
        if (isNaN(n) || n < 1) {
          console.error('Error: --concurrency must be a positive integer');
          process.exit(EXIT_CODES.CONFIG_ERROR);
        }
        args.concurrency = n;
        break;
      }
      case '--backup': {
        const [ni, v] = take(i, a, raw);
        i = ni;
        args.backup = v;
        break;
      }
      case '--include': {
        const [ni, v] = take(i, a, raw);
        i = ni;
        args.include = v;
        break;
      }
      case '--exclude': {
        const [ni, v] = take(i, a, raw);
        i = ni;
        args.exclude = v;
        break;
      }
      case '--report': {
        const [ni, v] = take(i, a, raw);
        i = ni;
        args.report = v;
        break;
      }
      case '--watch': {
        const [ni, v] = take(i, a, raw);
        i = ni;
        args.watchDir = v;
        break;
      }
      case '--output-format': {
        const [ni, v] = take(i, a, raw);
        i = ni;
        const allowed = ['table', 'json', 'csv'];
        if (!allowed.includes(v)) {
          console.error(`Error: --output-format must be one of: ${allowed.join(', ')}`);
          process.exit(EXIT_CODES.CONFIG_ERROR);
        }
        args.outputFormat = v as CliArgs['outputFormat'];
        break;
      }
      case '--profile': {
        const [ni, v] = take(i, a, raw);
        i = ni;
        const allowed = ['privacy', 'sharing', 'archive'];
        if (!allowed.includes(v)) {
          console.error(`Error: --profile must be one of: ${allowed.join(', ')}`);
          process.exit(EXIT_CODES.CONFIG_ERROR);
        }
        args.profile = v as NonNullable<CliArgs['profile']>;
        break;
      }
      default:
        if (a.startsWith('-')) {
          console.error(`Unknown option: ${a}`);
          process.exit(EXIT_CODES.CONFIG_ERROR);
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
  if (!quiet) {
    console.log(`Watching ${abs} for new files…`);
  }

  watch(abs, { recursive: true }, (_event, filename) => {
    if (!filename) {
      return;
    }
    const fullPath = join(abs, filename);

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    setTimeout(async () => {
      try {
        const s = await stat(fullPath);
        if (!s.isFile()) {
          return;
        }
        await processFile(fullPath, { ...batchOpts });
        if (!quiet) {
          console.log(`  ✓ ${basename(filename)}`);
        }
      } catch {
        /* file may be transient */
      }
    }, 200);
  });
}

// ─── Input classification ─────────────────────────────────────────────────────

/**
 * Simple glob matching: supports `*` (any chars) and `?` (single char).
 * Matches against the filename only (not path).
 */
function globMatch(name: string, pattern: string): boolean {
  const re = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${re}$`, 'i').test(name);
}

async function classifyInputs(inputs: string[]): Promise<{ files: string[]; dirs: string[] }> {
  const files: string[] = [];
  const dirs: string[] = [];

  for (const p of inputs) {
    if (p === '-') {
      files.push(p);
      continue;
    }
    try {
      const s = await stat(resolve(p));
      if (s.isDirectory()) {
        dirs.push(resolve(p));
      } else {
        files.push(resolve(p));
      }
    } catch {
      console.error(`Warning: cannot access ${p}`);
    }
  }

  return { files, dirs };
}

// ─── Profile presets ──────────────────────────────────────────────────────────

export const PROFILES: Record<string, Partial<CliArgs>> = {
  privacy: {
    preserveOrientation: true,
    preserveColorProfile: true,
    keep: ['Orientation', 'ICC Profile'],
  },
  sharing: {
    preserveOrientation: true,
    preserveColorProfile: true,
    preserveCopyright: true,
    keep: ['Orientation', 'ICC Profile', 'Copyright'],
  },
  archive: {
    preserveOrientation: true,
    preserveColorProfile: true,
    preserveCopyright: true,
    keep: ['Orientation', 'ICC Profile', 'Copyright', 'Title', 'Description'],
    remove: ['GPS', 'Software'],
  },
};

export function applyProfile(args: CliArgs): CliArgs {
  if (!args.profile) {
    return args;
  }
  const preset = PROFILES[args.profile];
  if (!preset) {
    return args;
  }
  // Profile sets base; explicit CLI flags override
  return { ...args, ...preset, profile: args.profile } as CliArgs;
}

// ─── .hbscrubrc config loader ─────────────────────────────────────────────────

export function loadRcFile(): string[] {
  const candidates = [
    join(process.cwd(), '.hbscrubrc'),
    join(homedir(), '.hbscrubrc'),
  ];

  /** Known valid keys that map to CLI flags. */
  const VALID_KEYS = new Set([
    'in-place', 'output', 'suffix', 'recursive', 'quiet',
    'inspect', 'verify', 'stego-check', 'diff',
    'preserve-orientation', 'preserve-color-profile', 'preserve-copyright',
    'remove', 'keep',
    'gps-redact',
    'inject-copyright', 'inject-software', 'inject-artist',
    'inject-description', 'inject-datetime',
    'concurrency', 'dry-run', 'skip-existing', 'backup',
    'include', 'exclude',
    'report', 'watch', 'output-format', 'profile',
    'pdf-password',
  ]);

  for (const candidate of candidates) {
    if (!existsSync(candidate)) {
      continue;
    }
    try {
      const raw = JSON.parse(readFileSync(candidate, 'utf-8')) as Record<string, unknown>;
      const extra: string[] = [];
      for (const [key, val] of Object.entries(raw)) {
        if (!VALID_KEYS.has(key)) {
          console.error(`Warning: unknown key "${key}" in ${candidate} — ignored`);
          continue;
        }
        const flag = '--' + key;
        if (val === true) {
          extra.push(flag);
        } else if (val === false || val === null || val === undefined) {
          // skip falsy booleans
        } else {
          extra.push(flag, String(val));
        }
      }
      return extra;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Warning: failed to parse ${candidate}: ${msg}`);
    }
    break;
  }
  return [];
}

// ─── Build shared options ─────────────────────────────────────────────────────

export function buildOptions(a: CliArgs): ProcessFileOptions & BatchOptions {
  const opts: ProcessFileOptions & BatchOptions = {
    inPlace: a.inPlace,
    preserveOrientation: a.preserveOrientation,
    preserveColorProfile: a.preserveColorProfile,
    preserveCopyright: a.preserveCopyright,
    concurrency: a.concurrency,
    dryRun: a.dryRun,
    skipExisting: a.skipExisting,
    ...(a.suffix !== undefined && { suffix: a.suffix }),
    ...(a.remove !== undefined && { remove: a.remove }),
    ...(a.keep !== undefined && { keep: a.keep }),
    ...(a.gpsRedact !== undefined && { gpsRedact: a.gpsRedact }),
    ...(a.backup !== undefined && { backupSuffix: a.backup }),
    ...(a.pdfPassword !== undefined && { pdfPassword: a.pdfPassword }),
  };

  if (
    a.injectCopyright !== undefined ||
    a.injectSoftware !== undefined ||
    a.injectArtist !== undefined ||
    a.injectDescription !== undefined ||
    a.injectDatetime !== undefined
  ) {
    opts.inject = {
      ...(a.injectCopyright !== undefined && { copyright: a.injectCopyright }),
      ...(a.injectSoftware !== undefined && { software: a.injectSoftware }),
      ...(a.injectArtist !== undefined && { artist: a.injectArtist }),
      ...(a.injectDescription !== undefined && { imageDescription: a.injectDescription }),
      ...(a.injectDatetime !== undefined && { dateTime: a.injectDatetime }),
    };
  }

  return opts;
}

// ─── Output formatters ────────────────────────────────────────────────────────

export interface ProcessedEntry {
  file: string;
  output: string;
  format: string;
  original: number;
  cleaned: number;
  removed: string[];
  error?: string | undefined;
}

export function printTable(entries: ProcessedEntry[], quiet: boolean): void {
  if (quiet) return;
  for (const e of entries) {
    if (e.error) {
      console.error(`  ✗ ${e.file}: ${e.error}`);
    } else {
      const meta = e.removed.length > 0 ? `removed ${e.removed.join(', ')}` : 'no metadata found';
      console.log(`  ✓ ${e.file} → ${e.output} (${meta} | ${formatSize(e.original)} → ${formatSize(e.cleaned)})`);
    }
  }
}

export function printJson(entries: ProcessedEntry[]): void {
  console.log(JSON.stringify(entries, null, 2));
}

export function printCsv(entries: ProcessedEntry[]): void {
  console.log('file,output,format,original_bytes,cleaned_bytes,removed,error');
  for (const e of entries) {
    const row = [
      `"${e.file}"`,
      `"${e.output}"`,
      e.format,
      e.original,
      e.cleaned,
      `"${e.removed.join(';')}"`,
      `"${e.error ?? ''}"`
    ].join(',');
    console.log(row);
  }
}

export function printEntries(entries: ProcessedEntry[], fmt: CliArgs['outputFormat'], quiet: boolean): void {
  if (fmt === 'json') {
    printJson(entries);
  } else if (fmt === 'csv') {
    printCsv(entries);
  } else {
    printTable(entries, quiet);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Load rc file first; CLI flags override it
  const rcArgs = loadRcFile();
  const rawArgs = [...rcArgs, ...process.argv.slice(2)];

  if (rawArgs.length === 0 || rawArgs.includes('-h') || rawArgs.includes('--help')) {
    console.log(HELP);
    return;
  }
  if (rawArgs.includes('-v') || rawArgs.includes('--version')) {
    console.log(getVersion());
    return;
  }

  const a = applyProfile(parseArgs(rawArgs));
  const baseOpts = buildOptions(a);

  // ── Watch mode ──
  if (a.watchDir) {
    startWatch(a.watchDir, baseOpts, a.quiet);
    process.stdin.resume();
    return;
  }

  if (a.files.length === 0) {
    console.error('Error: No input files or directories specified');
    process.exit(EXIT_CODES.NO_INPUT);
  }

  let { files, dirs } = await classifyInputs(a.files);  
  let hasError = false;
  const allReports: AuditReport[] = [];

  // Apply --include / --exclude glob filters
  if (a.include || a.exclude) {
    files = files.filter(f => {
      if (f === '-') return true;
      const name = basename(f);
      if (a.include && !globMatch(name, a.include)) return false;
      if (a.exclude && globMatch(name, a.exclude)) return false;
      return true;
    });
  }

  // ── Stdin → stdout ──
  if (files.includes('-')) {
    try {
      await processStdin(baseOpts);
    } catch (err) {
      console.error(`✗ stdin: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(EXIT_CODES.TOTAL_FAILURE);
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
    if (hasError) {
      process.exit(EXIT_CODES.PARTIAL_FAILURE);
    }
    return;
  }

  // ── Steganography check mode ──
  if (a.stegoCheck) {
    const { detectSteganography } = await import('./security/stego.js');
    for (const f of files) {
      try {
        const data = new Uint8Array(await readFile(f));
        const warnings = detectSteganography(data);
        if (warnings.length === 0) {
          if (!a.quiet) console.log(`✓ ${f}: no steganography indicators detected`);
        } else {
          for (const w of warnings) {
            console.warn(`⚠ ${f}: [${w.code}] ${w.message}`);
          }
          hasError = true;
        }
      } catch (err) {
        console.error(`✗ ${f}: ${err instanceof Error ? err.message : String(err)}`);
        hasError = true;
      }
    }
    if (hasError) {
      process.exit(EXIT_CODES.PARTIAL_FAILURE);
    }
    return;
  }

  // ── Batch directories ──
  for (const dir of dirs) {
    const batchResult = await processDir(dir, baseOpts, a.recursive);
    allReports.push(batchResult.report);

    const dirEntries: ProcessedEntry[] = [];
    for (const entry of batchResult.successful) {
      dirEntries.push({
        file: entry.file,
        output: entry.outputPath ?? entry.file,
        format: entry.format ?? '',
        original: entry.originalSize ?? 0,
        cleaned: entry.cleanedSize ?? 0,
        removed: entry.removedMetadata ?? [],
      });
      if (a.verify && entry.outputPath && !a.dryRun) {
        try {
          const outData = new Uint8Array(await readFile(entry.outputPath));
          const vr = verifyCleanSync(outData);
          if (!vr.clean && !a.quiet) {
            console.warn(`  ⚠ verify: ${entry.outputPath} still has [${vr.remainingMetadata.join(', ')}] (confidence: ${vr.confidence})`);
            hasError = true;
          }
        } catch { /* skip verify on read error */ }
      }
    }
    for (const entry of batchResult.failed) {
      dirEntries.push({
        file: entry.file,
        output: '',
        format: entry.format ?? '',
        original: entry.originalSize ?? 0,
        cleaned: 0,
        removed: [],
        error: entry.error,
      });
      hasError = true;
    }

    if (a.dryRun && !a.quiet) {
      for (const e of dirEntries) console.log(`  (dry) ${e.file}`);
    } else {
      printEntries(dirEntries, a.outputFormat, a.quiet);
    }
  }

  // ── Individual files ──
  if (a.outputPath && files.length > 1) {
    console.error('Error: --output can only be used with a single input file');
    process.exit(EXIT_CODES.CONFIG_ERROR);
  }

  const fileEntries: ProcessedEntry[] = [];

  for (const f of files) {
    try {
      const opts: ProcessFileOptions = { ...baseOpts };
      if (a.outputPath) {
        opts.outputPath = a.outputPath;
      }

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

      // Capture before-metadata for diff mode
      let beforeMeta: Partial<Record<string, unknown>> | undefined;
      if (a.diff) {
        try {
          const beforeData = new Uint8Array(await readFile(f));
          const { readMetadataSync } = await import('./operations/read.js');
          beforeMeta = readMetadataSync(beforeData) as unknown as Partial<Record<string, unknown>>;
        } catch { /* ignore read errors for diff */ }
      }

      if (a.backup && a.inPlace) {
        await copyFile(f, f + a.backup);
      }

      const result = await processFile(f, opts);

      if (a.verify && result.outputPath) {
        try {
          const outData = new Uint8Array(await readFile(result.outputPath));
          const vr = verifyCleanSync(outData);
          if (!vr.clean) {
            if (!a.quiet) {
              console.warn(`  ⚠ verify: ${result.outputPath} still has [${vr.remainingMetadata.join(', ')}] (confidence: ${vr.confidence})`);
            }
            hasError = true;
          }
        } catch { /* skip verify on read error */ }
      }

      // Print before/after metadata diff
      if (a.diff && beforeMeta && result.outputPath) {
        try {
          const afterData = new Uint8Array(await readFile(result.outputPath));
          const { readMetadataSync } = await import('./operations/read.js');
          const afterMeta = readMetadataSync(afterData) as unknown as Partial<Record<string, unknown>>;
          const allKeys = new Set([...Object.keys(beforeMeta), ...Object.keys(afterMeta)]);
          console.log(`\n  diff: ${f}`);
          for (const key of [...allKeys].sort()) {
            const before = beforeMeta[key];
            const after = (afterMeta as Record<string, unknown>)[key];
            const bStr = before !== undefined ? String(before) : '(absent)';
            const aStr = after !== undefined ? String(after) : '(absent)';
            if (bStr !== aStr) {
              console.log(`    - ${key}: ${bStr}`);
              console.log(`    + ${key}: ${aStr}`);
            }
          }
        } catch { /* skip diff on read error */ }
      }

      fileEntries.push({
        file: f,
        output: result.outputPath ?? f,
        format: result.format,
        original: result.originalSize,
        cleaned: result.cleanedSize,
        removed: result.removedMetadata,
      });
    } catch (err) {
      hasError = true;
      fileEntries.push({
        file: f,
        output: '',
        format: '',
        original: 0,
        cleaned: 0,
        removed: [],
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  printEntries(fileEntries, a.outputFormat, a.quiet);

  // ── Write audit report ──
  if (a.report && allReports.length > 0) {
    const combined: AuditReport = {
      timestamp: new Date().toISOString(),
      totalFiles: allReports.reduce((s, r) => s + r.totalFiles, 0),
      successful: allReports.reduce((s, r) => s + r.successful, 0),
      failed: allReports.reduce((s, r) => s + r.failed, 0),
      skipped: allReports.reduce((s, r) => s + r.skipped, 0),
      totalOriginalBytes: allReports.reduce((s, r) => s + r.totalOriginalBytes, 0),
      totalCleanedBytes: allReports.reduce((s, r) => s + r.totalCleanedBytes, 0),
      totalBytesRemoved: allReports.reduce((s, r) => s + r.totalBytesRemoved, 0),
      entries: allReports.flatMap(r => r.entries),
    };
    await mkdir(dirname(resolve(a.report)), { recursive: true });
    await writeFile(a.report, JSON.stringify(combined, null, 2));
    if (!a.quiet) {
      console.log(`\n  Report written to ${a.report}`);
    }
  }

  if (hasError) {
    // Determine whether it was a partial or total failure
    const totalProcessed = fileEntries.length + allReports.reduce((s, r) => s + r.totalFiles, 0);
    const totalFailed = fileEntries.filter(e => e.error).length + allReports.reduce((s, r) => s + r.failed, 0);
    process.exit(totalFailed >= totalProcessed ? EXIT_CODES.TOTAL_FAILURE : EXIT_CODES.PARTIAL_FAILURE);
  }
}

// ─── Entry ────────────────────────────────────────────────────────────────────

// Run when invoked directly. The argv[1] check accounts for Vite's code-splitting:
// the entry file (hb-scrub.cli.js) re-exports from a chunk, so __filename points
// to the chunk rather than argv[1]. We match both the exact path and the CLI entry name.
const entryScript = process.argv[1] ?? '';
if (entryScript === __filename || basename(entryScript).startsWith('hb-scrub.cli')) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(EXIT_CODES.TOTAL_FAILURE);
  });
}
