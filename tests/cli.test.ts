/**
 * Tests for src/cli.ts exported helpers
 *
 * Features 1-5:
 *  1. --inject-description / --inject-datetime
 *  2. --verify flag
 *  3. --output-format json | csv | table
 *  4. --profile privacy | sharing | archive
 *  5. .hbscrubrc config file loading
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';

import {
  parseArgs,
  applyProfile,
  loadRcFile,
  buildOptions,
  printTable,
  printJson,
  printCsv,
  printEntries,
  type ProcessedEntry,
} from '../src/cli.js';

// ─── parseArgs ────────────────────────────────────────────────────────────────

describe('parseArgs (Features 1-5)', () => {

  // ── Feature 1: inject-description / inject-datetime ──────────────────────
  it('parses --inject-description', () => {
    const a = parseArgs(['file.jpg', '--inject-description', 'Sunset at the beach']);
    expect(a.injectDescription).toBe('Sunset at the beach');
  });

  it('parses --inject-datetime', () => {
    const a = parseArgs(['file.jpg', '--inject-datetime', '2024:01:15 12:30:00']);
    expect(a.injectDatetime).toBe('2024:01:15 12:30:00');
  });

  it('injectDescription is undefined when not supplied', () => {
    const a = parseArgs(['file.jpg']);
    expect(a.injectDescription).toBeUndefined();
  });

  it('injectDatetime is undefined when not supplied', () => {
    const a = parseArgs(['file.jpg']);
    expect(a.injectDatetime).toBeUndefined();
  });

  // ── Feature 2: --verify ───────────────────────────────────────────────────
  it('--verify sets verify: true', () => {
    const a = parseArgs(['file.jpg', '--verify']);
    expect(a.verify).toBe(true);
  });

  it('verify defaults to false', () => {
    const a = parseArgs(['file.jpg']);
    expect(a.verify).toBe(false);
  });

  // ── Feature 3: --output-format ────────────────────────────────────────────
  it('--output-format json sets outputFormat: "json"', () => {
    const a = parseArgs(['file.jpg', '--output-format', 'json']);
    expect(a.outputFormat).toBe('json');
  });

  it('--output-format csv sets outputFormat: "csv"', () => {
    const a = parseArgs(['file.jpg', '--output-format', 'csv']);
    expect(a.outputFormat).toBe('csv');
  });

  it('--output-format table sets outputFormat: "table"', () => {
    const a = parseArgs(['file.jpg', '--output-format', 'table']);
    expect(a.outputFormat).toBe('table');
  });

  it('outputFormat defaults to "table"', () => {
    const a = parseArgs(['file.jpg']);
    expect(a.outputFormat).toBe('table');
  });

  // ── Feature 4: --profile ─────────────────────────────────────────────────
  it('--profile privacy sets profile: "privacy"', () => {
    const a = parseArgs(['file.jpg', '--profile', 'privacy']);
    expect(a.profile).toBe('privacy');
  });

  it('--profile sharing sets profile: "sharing"', () => {
    const a = parseArgs(['file.jpg', '--profile', 'sharing']);
    expect(a.profile).toBe('sharing');
  });

  it('--profile archive sets profile: "archive"', () => {
    const a = parseArgs(['file.jpg', '--profile', 'archive']);
    expect(a.profile).toBe('archive');
  });

  it('profile is undefined by default', () => {
    const a = parseArgs(['file.jpg']);
    expect(a.profile).toBeUndefined();
  });

  // ── Other existing flags still work ───────────────────────────────────────
  it('parses positional files', () => {
    const a = parseArgs(['a.jpg', 'b.png']);
    expect(a.files).toEqual(['a.jpg', 'b.png']);
  });

  it('parses --gps-redact city', () => {
    const a = parseArgs(['file.jpg', '--gps-redact', 'city']);
    expect(a.gpsRedact).toBe('city');
  });

  it('parses --inject-copyright', () => {
    const a = parseArgs(['file.jpg', '--inject-copyright', '© 2024 Acme']);
    expect(a.injectCopyright).toBe('© 2024 Acme');
  });

  it('parses --inject-artist', () => {
    const a = parseArgs(['file.jpg', '--inject-artist', 'Jane Doe']);
    expect(a.injectArtist).toBe('Jane Doe');
  });
});

// ─── applyProfile ─────────────────────────────────────────────────────────────

describe('applyProfile (Feature 4)', () => {
  const baseArgs = () => parseArgs(['file.jpg']);

  it('no profile: returns args unchanged', () => {
    const a = baseArgs();
    const result = applyProfile(a);
    expect(result.preserveOrientation).toBe(false);
    expect(result.preserveColorProfile).toBe(false);
  });

  it('privacy profile: sets preserveOrientation + preserveColorProfile', () => {
    const a = { ...baseArgs(), profile: 'privacy' as const };
    const result = applyProfile(a);
    expect(result.preserveOrientation).toBe(true);
    expect(result.preserveColorProfile).toBe(true);
    expect(result.preserveCopyright).toBe(false);
  });

  it('sharing profile: also sets preserveCopyright', () => {
    const a = { ...baseArgs(), profile: 'sharing' as const };
    const result = applyProfile(a);
    expect(result.preserveOrientation).toBe(true);
    expect(result.preserveColorProfile).toBe(true);
    expect(result.preserveCopyright).toBe(true);
  });

  it('archive profile: sets remove: ["GPS","Software"]', () => {
    const a = { ...baseArgs(), profile: 'archive' as const };
    const result = applyProfile(a);
    expect(result.remove).toEqual(['GPS', 'Software']);
  });

  it('archive profile: sets keep list including Copyright and Description', () => {
    const a = { ...baseArgs(), profile: 'archive' as const };
    const result = applyProfile(a);
    expect(result.keep).toContain('Copyright');
    expect(result.keep).toContain('Description');
  });

  it('profile field is preserved in result', () => {
    const a = { ...baseArgs(), profile: 'privacy' as const };
    const result = applyProfile(a);
    expect(result.profile).toBe('privacy');
  });

  it('explicit CLI flag is not overwritten by profile', () => {
    // If user passes --preserve-copyright explicitly AND uses privacy profile,
    // the profile merge should retain the explicit value (spread order)
    const a = { ...baseArgs(), profile: 'privacy' as const, preserveCopyright: true };
    const result = applyProfile(a);
    // The privacy preset has preserveCopyright: false (not set), but since
    // applyProfile does { ...args, ...preset, profile }, the preset wins for keys it has.
    // Only keys explicitly in the preset override, so preserveCopyright (not in privacy preset) stays true.
    expect(result.preserveCopyright).toBe(true);
  });
});

// ─── buildOptions ─────────────────────────────────────────────────────────────

describe('buildOptions (Feature 1 — inject)', () => {
  const base = () => parseArgs(['file.jpg']);

  it('no inject fields → opts.inject is undefined', () => {
    const opts = buildOptions(base());
    expect(opts.inject).toBeUndefined();
  });

  it('--inject-description → opts.inject.imageDescription', () => {
    const a = parseArgs(['file.jpg', '--inject-description', 'My Caption']);
    const opts = buildOptions(a);
    expect(opts.inject?.imageDescription).toBe('My Caption');
  });

  it('--inject-datetime → opts.inject.dateTime', () => {
    const a = parseArgs(['file.jpg', '--inject-datetime', '2024:06:15 10:00:00']);
    const opts = buildOptions(a);
    expect(opts.inject?.dateTime).toBe('2024:06:15 10:00:00');
  });

  it('--inject-copyright → opts.inject.copyright', () => {
    const a = parseArgs(['file.jpg', '--inject-copyright', '© 2024']);
    const opts = buildOptions(a);
    expect(opts.inject?.copyright).toBe('© 2024');
  });

  it('multiple inject fields are all included', () => {
    const a = parseArgs([
      'file.jpg',
      '--inject-description', 'Desc',
      '--inject-artist',      'Alice',
      '--inject-datetime',    '2024:01:01 00:00:00',
    ]);
    const opts = buildOptions(a);
    expect(opts.inject?.imageDescription).toBe('Desc');
    expect(opts.inject?.artist).toBe('Alice');
    expect(opts.inject?.dateTime).toBe('2024:01:01 00:00:00');
  });

  it('--gps-redact is forwarded to opts.gpsRedact', () => {
    const a = parseArgs(['file.jpg', '--gps-redact', 'region']);
    const opts = buildOptions(a);
    expect(opts.gpsRedact).toBe('region');
  });
});

// ─── loadRcFile ───────────────────────────────────────────────────────────────

describe('loadRcFile (Feature 5)', () => {
  let tmpDir: string;
  let cwdSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hb-test-'));
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
  });

  afterEach(() => {
    cwdSpy.mockRestore();
    // Cleanup tmp dir
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  it('returns [] when no .hbscrubrc exists', () => {
    expect(loadRcFile()).toEqual([]);
  });

  it('boolean true → single flag in argv', () => {
    fs.writeFileSync(path.join(tmpDir, '.hbscrubrc'), JSON.stringify({ verify: true }));
    const result = loadRcFile();
    expect(result).toContain('--verify');
  });

  it('boolean false → flag is skipped', () => {
    fs.writeFileSync(path.join(tmpDir, '.hbscrubrc'), JSON.stringify({ verify: false }));
    const result = loadRcFile();
    expect(result).not.toContain('--verify');
  });

  it('string value → [flag, value] pair', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.hbscrubrc'),
      JSON.stringify({ 'output-format': 'json' })
    );
    const result = loadRcFile();
    expect(result).toContain('--output-format');
    expect(result).toContain('json');
  });

  it('multiple keys are all converted', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.hbscrubrc'),
      JSON.stringify({ verify: true, 'gps-redact': 'city' })
    );
    const result = loadRcFile();
    expect(result).toContain('--verify');
    expect(result).toContain('--gps-redact');
    expect(result).toContain('city');
  });

  it('returns [] for malformed JSON', () => {
    fs.writeFileSync(path.join(tmpDir, '.hbscrubrc'), 'not json!!');
    expect(loadRcFile()).toEqual([]);
  });

  it('null value → key is skipped', () => {
    fs.writeFileSync(path.join(tmpDir, '.hbscrubrc'), JSON.stringify({ verify: null }));
    const result = loadRcFile();
    expect(result).not.toContain('--verify');
  });
});

// ─── printJson / printCsv / printTable / printEntries ─────────────────────────

describe('printJson (Feature 3)', () => {
  it('outputs valid JSON array to console.log', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const entries: ProcessedEntry[] = [
      { file: 'a.jpg', output: 'a_clean.jpg', format: 'jpeg', original: 100, cleaned: 80, removed: ['EXIF'] },
    ];
    printJson(entries);
    expect(spy).toHaveBeenCalledOnce();
    const output = JSON.parse(spy.mock.calls[0]![0] as string) as unknown[];
    expect(output).toHaveLength(1);
    spy.mockRestore();
  });

  it('JSON output contains all entry fields', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const entries: ProcessedEntry[] = [
      { file: 'pic.png', output: 'pic_clean.png', format: 'png', original: 500, cleaned: 450, removed: ['XMP', 'EXIF'] },
    ];
    printJson(entries);
    const parsed = JSON.parse(spy.mock.calls[0]![0] as string) as typeof entries;
    expect(parsed[0]?.file).toBe('pic.png');
    expect(parsed[0]?.removed).toEqual(['XMP', 'EXIF']);
    spy.mockRestore();
  });
});

describe('printCsv (Feature 3)', () => {
  it('first line is the CSV header', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    printCsv([]);
    expect(spy.mock.calls[0]![0]).toMatch(/^file,output,format/);
    spy.mockRestore();
  });

  it('data rows are emitted for each entry', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const entries: ProcessedEntry[] = [
      { file: 'x.jpg', output: 'x_clean.jpg', format: 'jpeg', original: 200, cleaned: 180, removed: ['GPS'] },
    ];
    printCsv(entries);
    expect(spy).toHaveBeenCalledTimes(2); // header + row
    spy.mockRestore();
  });

  it('removed fields are semicolon-separated inside the CSV field', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const entries: ProcessedEntry[] = [
      { file: 'x.jpg', output: 'x.jpg', format: 'jpeg', original: 1, cleaned: 1, removed: ['EXIF', 'GPS', 'XMP'] },
    ];
    printCsv(entries);
    const row = spy.mock.calls[1]![0] as string;
    expect(row).toContain('EXIF;GPS;XMP');
    spy.mockRestore();
  });
});

describe('printTable (Feature 3)', () => {
  it('prints nothing when quiet is true', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    printTable([
      { file: 'a.jpg', output: 'a_clean.jpg', format: 'jpeg', original: 100, cleaned: 80, removed: [] },
    ], true);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('prints a line per entry when quiet is false', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const entries: ProcessedEntry[] = [
      { file: 'a.jpg', output: 'a_clean.jpg', format: 'jpeg', original: 100, cleaned: 80, removed: ['EXIF'] },
      { file: 'b.png', output: 'b_clean.png', format: 'png',  original: 200, cleaned: 180, removed: [] },
    ];
    printTable(entries, false);
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  it('error entries use console.error instead of console.log', () => {
    const logSpy   = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    printTable([
      { file: 'bad.jpg', output: '', format: '', original: 0, cleaned: 0, removed: [], error: 'unsupported format' },
    ], false);
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(logSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

describe('printEntries (Feature 3)', () => {
  const sample: ProcessedEntry[] = [
    { file: 'x.jpg', output: 'x_clean.jpg', format: 'jpeg', original: 1024, cleaned: 900, removed: ['EXIF'] },
  ];

  it('dispatches to printJson when fmt is "json"', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    printEntries(sample, 'json', false);
    const parsed = JSON.parse(spy.mock.calls[0]![0] as string) as unknown;
    expect(parsed).toBeInstanceOf(Array);
    spy.mockRestore();
  });

  it('dispatches to printCsv when fmt is "csv"', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    printEntries(sample, 'csv', false);
    expect(spy.mock.calls[0]![0]).toMatch(/^file,output,format/);
    spy.mockRestore();
  });

  it('dispatches to printTable when fmt is "table"', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    printEntries(sample, 'table', false);
    expect(spy.mock.calls[0]![0]).toContain('x.jpg');
    spy.mockRestore();
  });
});
