/**
 * Batch / directory processing for Node.js environments.
 *
 * Provides processDir() and processGlob() which walk all matching files,
 * run removeMetadata on each one, and return an AuditReport.
 */

import { readFile, writeFile, copyFile, mkdir, readdir, stat } from 'node:fs/promises';
import { resolve, dirname, basename, extname, join } from 'node:path';
import { removeMetadataSync } from './remove.js';
import type { BatchOptions, BatchResult, AuditEntry, AuditReport, SupportedFormat } from '../types.js';
import { detectFormat } from '../detect.js';

// ─── Supported extensions ─────────────────────────────────────────────────────

const SUPPORTED_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg',
  '.tif', '.tiff', '.heic', '.heif', '.avif',
  '.dng', '.raw', '.cr2', '.nef', '.arw',
  '.pdf', '.mp4', '.mov', '.m4v',
]);

// ─── File collection ──────────────────────────────────────────────────────────

/**
 * Recursively collect all processable files under a directory.
 */
async function collectFiles(
  dir: string,
  recursive: boolean,
  include: string[] | undefined,
  exclude: string[] | undefined,
): Promise<string[]> {
  const results: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (recursive) {
        const sub = await collectFiles(fullPath, recursive, include, exclude);
        results.push(...sub);
      }
    } else if (entry.isFile()) {
      const ext = extname(entry.name).toLowerCase();
      if (!SUPPORTED_EXTENSIONS.has(ext)) continue;
      if (exclude?.some(p => matchGlob(entry.name, p))) continue;
      if (include && include.length > 0 && !include.some(p => matchGlob(entry.name, p))) continue;
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * Very lightweight glob matcher (supports * and ? only, no **).
 */
function matchGlob(filename: string, pattern: string): boolean {
  const regex = new RegExp(
    '^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$',
    'i',
  );
  return regex.test(filename);
}

// ─── Output path computation ──────────────────────────────────────────────────

function computeOutputPath(
  inputPath: string,
  options: BatchOptions,
  outputFormat?: SupportedFormat,
): string {
  if (options.inPlace) return inputPath;

  const dir = options.outputDir ? resolve(options.outputDir) : dirname(inputPath);
  const ext = extname(inputPath);
  const name = basename(inputPath, ext);
  const suffix = options.suffix ?? '-clean';
  const outExt =
    outputFormat && outputFormat !== 'unknown'
      ? `.${outputFormat === 'jpeg' ? 'jpg' : outputFormat}`
      : ext;

  return join(dir, `${name}${suffix}${outExt}`);
}

// ─── Single-file processor ────────────────────────────────────────────────────

async function processSingleFile(
  inputPath: string,
  options: BatchOptions,
): Promise<AuditEntry> {
  const entry: AuditEntry = {
    file: inputPath,
    success: false,
    dryRun: options.dryRun === true,
  };

  try {
    const fileData = await readFile(inputPath);
    const dataArr = new Uint8Array(fileData.buffer, fileData.byteOffset, fileData.byteLength);

    entry.originalSize = dataArr.length;
    entry.format = detectFormat(dataArr);

    if (options.dryRun) {
      // Just detect metadata types without writing
      entry.removedMetadata = [];
      entry.cleanedSize = dataArr.length;
      entry.outputPath = computeOutputPath(inputPath, options, entry.format);
      entry.success = true;
      return entry;
    }

    const result = removeMetadataSync(dataArr, options);

    const outputPath = computeOutputPath(inputPath, options, result.outputFormat);
    entry.outputPath = outputPath;
    entry.cleanedSize = result.cleanedSize;
    entry.removedMetadata = result.removedMetadata;
    entry.format = result.format;

    if (options.skipExisting) {
      try {
        await stat(outputPath);
        entry.success = true; // skip
        return entry;
      } catch { /* doesn't exist, continue */ }
    }

    if (options.backupSuffix && options.inPlace) {
      await copyFile(inputPath, inputPath + options.backupSuffix);
    }

    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, result.data);

    entry.success = true;
  } catch (err) {
    entry.error = err instanceof Error ? err.message : String(err);
    entry.success = false;
  }

  return entry;
}

// ─── Concurrency helper ───────────────────────────────────────────────────────

async function runConcurrent<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<AuditEntry>,
): Promise<AuditEntry[]> {
  const results: AuditEntry[] = [];
  const queue = [...items];

  const worker = async () => {
    while (queue.length > 0) {
      const item = queue.shift()!;
      results.push(await fn(item));
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Process all supported image/document files in a directory.
 *
 * @param dirPath    Path to the directory to scan.
 * @param options    Batch options (inPlace, outputDir, concurrency, dryRun, …)
 * @param recursive  Recurse into sub-directories (default: true)
 */
export async function processDir(
  dirPath: string,
  options: BatchOptions = {},
  recursive = true,
): Promise<BatchResult> {
  const absDir = resolve(dirPath);
  const files = await collectFiles(absDir, recursive, options.include, options.exclude);
  return processFiles(files, options);
}

/**
 * Process an explicit list of file paths.
 *
 * @param filePaths  Absolute or relative paths to process.
 * @param options    Batch options.
 */
export async function processFiles(
  filePaths: string[],
  options: BatchOptions = {},
): Promise<BatchResult> {
  const concurrency = Math.max(1, options.concurrency ?? 4);
  const entries = await runConcurrent(
    filePaths.map(f => resolve(f)),
    concurrency,
    file => processSingleFile(file, options),
  );

  const successful = entries.filter(e => e.success);
  const failed = entries.filter(e => !e.success);

  const totalOriginalBytes = entries.reduce((s, e) => s + (e.originalSize ?? 0), 0);
  const totalCleanedBytes = entries.reduce((s, e) => s + (e.cleanedSize ?? 0), 0);

  const report: AuditReport = {
    timestamp: new Date().toISOString(),
    totalFiles: entries.length,
    successful: successful.length,
    failed: failed.length,
    skipped: successful.filter(e => e.dryRun).length,
    totalOriginalBytes,
    totalCleanedBytes,
    totalBytesRemoved: totalOriginalBytes - totalCleanedBytes,
    entries,
  };

  return { successful, failed, report };
}
