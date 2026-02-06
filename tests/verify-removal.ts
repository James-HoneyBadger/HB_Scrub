/**
 * Quick verification script to test metadata removal
 * Run with: npx tsx tests/verify-removal.ts
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { removeMetadata, getMetadataTypes, detectFormat } from '../src/index';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, 'fixtures');

async function verifyFile(filename: string): Promise<void> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${filename}`);
  console.log('='.repeat(60));

  const imagePath = join(FIXTURES_DIR, filename);
  const imageBytes = new Uint8Array(readFileSync(imagePath));

  console.log(`Format: ${detectFormat(imageBytes)}`);
  console.log(`Original size: ${imageBytes.length.toLocaleString()} bytes`);

  const originalMetadata = getMetadataTypes(imageBytes);
  console.log(`Original metadata: ${originalMetadata.length > 0 ? originalMetadata.join(', ') : '(none)'}`);

  const result = await removeMetadata(imageBytes);

  console.log(`\nAfter removal:`);
  console.log(`Cleaned size: ${result.cleanedSize.toLocaleString()} bytes`);
  console.log(`Size reduction: ${(result.originalSize - result.cleanedSize).toLocaleString()} bytes (${((1 - result.cleanedSize / result.originalSize) * 100).toFixed(1)}%)`);
  console.log(`Removed: ${result.removedMetadata.length > 0 ? result.removedMetadata.join(', ') : '(none)'}`);

  const cleanedMetadata = getMetadataTypes(result.data);
  console.log(`Remaining metadata: ${cleanedMetadata.length > 0 ? cleanedMetadata.join(', ') : '(none)'}`);

  // Save cleaned file for manual inspection
  const outputPath = join(FIXTURES_DIR, `cleaned_${filename}`);
  writeFileSync(outputPath, result.data);
  console.log(`\nSaved cleaned file to: cleaned_${filename}`);
}

async function main(): Promise<void> {
  console.log('PicScrub Metadata Removal Verification');
  console.log('======================================\n');

  // Test various formats
  const testFiles = [
    'r_canon.jpg',
    'r_sony.jpg',
    'example.webp',
    '1.png',
  ];

  for (const file of testFiles) {
    try {
      await verifyFile(file);
    } catch (error) {
      console.error(`Error processing ${file}:`, error);
    }
  }

  console.log('\n\nVerification complete!');
  console.log('You can open the cleaned_* files to verify image quality is preserved.');
}

main().catch(console.error);
