import { describe, it, expect, afterEach } from 'vitest';
import { execFile } from 'child_process';
import { existsSync, mkdirSync, rmSync, copyFileSync } from 'fs';
import { join } from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const CLI_PATH = join(__dirname, '../../dist/picscrub.cli.js');
const FIXTURES_DIR = join(__dirname, '../fixtures');
const TMP_DIR = join(__dirname, '../tmp-cli');

function setupTmp(): void {
  mkdirSync(TMP_DIR, { recursive: true });
}

function cleanupTmp(): void {
  if (existsSync(TMP_DIR)) {
    rmSync(TMP_DIR, { recursive: true, force: true });
  }
}

describe('CLI integration', () => {
  afterEach(() => {
    cleanupTmp();
  });

  it('should show help with --help', async () => {
    const { stdout } = await execFileAsync('node', [CLI_PATH, '--help']);
    expect(stdout).toContain('picscrub <file...> [options]');
    expect(stdout).toContain('--in-place');
    expect(stdout).toContain('--output');
  });

  it('should show help with -h', async () => {
    const { stdout } = await execFileAsync('node', [CLI_PATH, '-h']);
    expect(stdout).toContain('picscrub <file...> [options]');
  });

  it('should show version with --version', async () => {
    const { stdout } = await execFileAsync('node', [CLI_PATH, '--version']);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('should show version with -v', async () => {
    const { stdout } = await execFileAsync('node', [CLI_PATH, '-v']);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('should show help when no args provided', async () => {
    const { stdout } = await execFileAsync('node', [CLI_PATH]);
    expect(stdout).toContain('picscrub <file...> [options]');
  });

  it('should process a JPEG file', async () => {
    setupTmp();
    const inputPath = join(TMP_DIR, 'test.jpg');
    copyFileSync(join(FIXTURES_DIR, 'L01.jpg'), inputPath);

    const { stdout } = await execFileAsync('node', [CLI_PATH, inputPath]);

    expect(stdout).toContain('✓');
    expect(stdout).toContain('test.jpg');
    const outputPath = join(TMP_DIR, 'test-clean.jpg');
    expect(existsSync(outputPath)).toBe(true);
  });

  it('should process a file with --in-place', async () => {
    setupTmp();
    const inputPath = join(TMP_DIR, 'test.jpg');
    copyFileSync(join(FIXTURES_DIR, 'L01.jpg'), inputPath);

    const { stdout } = await execFileAsync('node', [CLI_PATH, '-i', inputPath]);

    expect(stdout).toContain('✓');
    // No -clean file should be created
    expect(existsSync(join(TMP_DIR, 'test-clean.jpg'))).toBe(false);
    expect(existsSync(inputPath)).toBe(true);
  });

  it('should suppress output with --quiet', async () => {
    setupTmp();
    const inputPath = join(TMP_DIR, 'test.jpg');
    copyFileSync(join(FIXTURES_DIR, 'L01.jpg'), inputPath);

    const { stdout } = await execFileAsync('node', [CLI_PATH, '-q', inputPath]);

    expect(stdout).toBe('');
  });

  it('should exit with code 1 for non-existent file', async () => {
    try {
      await execFileAsync('node', [CLI_PATH, '/nonexistent/file.jpg']);
      expect.fail('Should have thrown');
    } catch (err: unknown) {
      const error = err as { code: number; stderr: string };
      expect(error.code).toBe(1);
      expect(error.stderr).toContain('✗');
    }
  });

  it('should exit with code 1 for unknown option', async () => {
    try {
      await execFileAsync('node', [CLI_PATH, '--badopt']);
      expect.fail('Should have thrown');
    } catch (err: unknown) {
      const error = err as { code: number; stderr: string };
      expect(error.code).toBe(1);
      expect(error.stderr).toContain('Unknown option');
    }
  });
});
