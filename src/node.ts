import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, basename, extname, join } from 'node:path';
import { removeMetadataSync } from './operations/remove.js';
import type { RemoveOptions, RemoveResult } from './types.js';

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
  options: ProcessFileOptions = {},
): Promise<ProcessFileResult> {
  const absInput = resolve(inputPath);
  const fileData = await readFile(absInput);
  const result = removeMetadataSync(new Uint8Array(fileData));

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
  await writeFile(absOutput, result.data);

  return { ...result, inputPath: absInput, outputPath: absOutput };
}
