import { readFile, writeFile, mkdir, rename, unlink } from 'node:fs/promises';
import { resolve, dirname, basename, extname, join } from 'node:path';
import { removeMetadataSync } from './operations/remove.js';
import type { RemoveOptions, RemoveResult } from './types.js';

// Re-export batch processing and stream helpers for Node.js consumers
export { processDir, processFiles } from './operations/batch.js';
export { createScrubStream, ScrubTransform } from './node-stream.js';

export interface ProcessFileOptions extends RemoveOptions {
  /** Overwrite the original file */
  inPlace?: boolean;
  /** Suffix for output filename (default: '-clean') */
  suffix?: string;
  /** Explicit output path (overrides suffix and inPlace) */
  outputPath?: string;
}

export interface ProcessFileResult extends RemoveResult {
  inputPath: string;
  outputPath: string;
}

export async function processFile(
  inputPath: string,
  options: ProcessFileOptions = {}
): Promise<ProcessFileResult> {
  const absInput = resolve(inputPath);
  const fileData = await readFile(absInput);
  const result = removeMetadataSync(new Uint8Array(fileData), options);

  // Determine output path
  let absOutput: string;
  if (options.outputPath) {
    absOutput = resolve(options.outputPath);
  } else if (options.inPlace) {
    absOutput = absInput;
  } else {
    const dir = dirname(absInput);
    const ext = extname(absInput);
    const name = basename(absInput, ext);
    const suffix = options.suffix ?? '-clean';
    // If format changed (e.g., RAW → JPEG), use the output format's extension
    const outExt = result.outputFormat
      ? `.${result.outputFormat === 'jpeg' ? 'jpg' : result.outputFormat}`
      : ext;
    absOutput = join(dir, `${name}${suffix}${outExt}`);
  }

  await mkdir(dirname(absOutput), { recursive: true });
  // Atomic write: write to a temp file then rename to avoid partial output on crash.
  const tmpPath = `${absOutput}.hbtmp.${Math.random().toString(36).slice(2)}`;
  try {
    await writeFile(tmpPath, result.data);
    await rename(tmpPath, absOutput);
  } catch (err) {
    await unlink(tmpPath).catch(() => {
      /* ignore cleanup errors */
    });
    throw err;
  }

  return { ...result, inputPath: absInput, outputPath: absOutput };
}
