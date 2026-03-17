#!/usr/bin/env node

/**
 * Git pre-commit hook for HB Scrub.
 *
 * Checks every staged image/document file for metadata.  If any metadata is
 * found the commit is blocked with a descriptive error.
 *
 * Installation:
 *   cp hooks/pre-commit .git/hooks/pre-commit
 *   chmod +x .git/hooks/pre-commit
 *
 * Or add to package.json scripts:
 *   "prepare": "cp hooks/pre-commit .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit"
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { detectFormat } from '../src/detect.js';
import { verifyCleanSync } from '../src/operations/verify.js';

const IMAGE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.tiff', '.tif',
  '.heic', '.heif', '.avif', '.pdf', '.mp4', '.mov', '.dng',
]);

function getStagedFiles(): string[] {
  try {
    const output = execSync('git diff --cached --name-only --diff-filter=ACM', {
      encoding: 'utf-8',
    });
    return output.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function getExtension(file: string): string {
  const dot = file.lastIndexOf('.');
  return dot >= 0 ? file.slice(dot).toLowerCase() : '';
}

let hasMetadata = false;

const staged = getStagedFiles();
const imageFiles = staged.filter(f => IMAGE_EXTENSIONS.has(getExtension(f)));

for (const file of imageFiles) {
  try {
    const data = new Uint8Array(readFileSync(file));
    const format = detectFormat(data);
    if (format === 'unknown') continue;

    const result = verifyCleanSync(data);
    if (!result.clean) {
      console.error(`✗ ${file}: contains metadata [${result.remainingMetadata.join(', ')}]`);
      hasMetadata = true;
    }
  } catch {
    // Skip files that can't be read
  }
}

if (hasMetadata) {
  console.error('\nCommit blocked: staged files contain metadata.');
  console.error('Run `npx hb-scrub --in-place <files>` to strip metadata, then re-stage.\n');
  process.exit(1);
}
