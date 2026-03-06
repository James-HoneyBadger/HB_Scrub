/**
 * Tests for the HB Scrub GUI HTTP server (src/gui.ts)
 *
 * Covers:
 *  - buildOutputName (unit)
 *  - GET  /             → serve HTML
 *  - GET  /api/formats  → list supported formats
 *  - POST /api/read     → read metadata
 *  - POST /api/process  → strip metadata
 *  - Unknown routes     → 404
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, type Mock } from 'vitest';
import * as http from 'node:http';

// ── Mock src/index.js before gui.ts is loaded ─────────────────────────────
vi.mock('../src/index.js', () => ({
  removeMetadataSync: vi.fn(),
  readMetadataSync:   vi.fn(),
  getMetadataTypes:   vi.fn(),
  getSupportedFormats: vi.fn(),
}));

import {
  removeMetadataSync,
  readMetadataSync,
  getMetadataTypes,
  getSupportedFormats,
} from '../src/index.js';

import { handleRequest, buildOutputName } from '../src/gui.js';

// ── Test server ───────────────────────────────────────────────────────────
let server: http.Server;
let baseUrl: string;

/** Make a JSON POST request to the test server. */
function jsonPost(path: string, body: unknown) {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const SAMPLE_B64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0]).toString('base64');

beforeAll(async () => {
  // Default mock implementations
  (getSupportedFormats as Mock).mockReturnValue([
    'jpeg', 'png', 'webp', 'gif', 'svg', 'tiff', 'heic', 'avif', 'pdf', 'mp4', 'raw',
  ]);
  (readMetadataSync as Mock).mockReturnValue({ format: 'jpeg', metadata: {} });
  (getMetadataTypes as Mock).mockReturnValue(['exif', 'gps']);
  (removeMetadataSync as Mock).mockReturnValue({
    data: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
    format: 'jpeg',
    removedMetadata: ['exif', 'gps'],
  });

  server = http.createServer(handleRequest);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as { port: number };
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  );
});

beforeEach(() => {
  vi.clearAllMocks();

  // Re-apply defaults after clearAllMocks
  (getSupportedFormats as Mock).mockReturnValue([
    'jpeg', 'png', 'webp', 'gif', 'svg', 'tiff', 'heic', 'avif', 'pdf', 'mp4', 'raw',
  ]);
  (readMetadataSync as Mock).mockReturnValue({ format: 'jpeg', metadata: {} });
  (getMetadataTypes as Mock).mockReturnValue(['exif', 'gps']);
  (removeMetadataSync as Mock).mockReturnValue({
    data: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
    format: 'jpeg',
    removedMetadata: ['exif', 'gps'],
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildOutputName
// ─────────────────────────────────────────────────────────────────────────────

describe('buildOutputName', () => {
  it('adds _clean before the extension', () => {
    expect(buildOutputName('photo.jpg')).toBe('photo_clean.jpg');
  });

  it('handles multiple dots — only the last extension is preserved', () => {
    expect(buildOutputName('my.photo.jpeg')).toBe('my.photo_clean.jpeg');
  });

  it('appends _clean when there is no extension', () => {
    expect(buildOutputName('photo')).toBe('photo_clean');
  });

  it('works with uppercase extensions', () => {
    expect(buildOutputName('IMAGE.JPEG')).toBe('IMAGE_clean.JPEG');
  });

  it('works with single-char filenames', () => {
    expect(buildOutputName('a.png')).toBe('a_clean.png');
  });

  it('handles hidden files (dot-leading names)', () => {
    // ".hidden" → last dot is at index 0, so no extension detected? depends on impl
    // The impl uses lastIndexOf('.'); for ".hidden" that returns 0
    expect(buildOutputName('.hidden')).toBe('_clean.hidden');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /', () => {
  it('returns 200 with HTML content-type', async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
  });

  it('returns the HTML UI document', async () => {
    const html = await fetch(`${baseUrl}/`).then((r) => r.text());
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('HB Scrub');
  });

  it('HTML contains the drop-zone element', async () => {
    const html = await fetch(`${baseUrl}/`).then((r) => r.text());
    expect(html).toContain('id="drop-zone"');
  });

  it('HTML contains the scrub button', async () => {
    const html = await fetch(`${baseUrl}/`).then((r) => r.text());
    expect(html).toContain('btn-scrub');
  });

  it('HTML contains the profile selector', async () => {
    const html = await fetch(`${baseUrl}/`).then((r) => r.text());
    expect(html).toContain('id="opt-profile"');
    expect(html).toContain('Privacy');
    expect(html).toContain('Sharing');
    expect(html).toContain('Archive');
  });

  it('HTML contains the inject metadata panel', async () => {
    const html = await fetch(`${baseUrl}/`).then((r) => r.text());
    expect(html).toContain('id="inject-panel"');
    expect(html).toContain('id="inj-copyright"');
    expect(html).toContain('id="inj-artist"');
    expect(html).toContain('id="inj-software"');
    expect(html).toContain('id="inj-description"');
    expect(html).toContain('id="inj-datetime"');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/formats
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/formats', () => {
  it('returns 200 with JSON content-type', async () => {
    const res = await fetch(`${baseUrl}/api/formats`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('returns an array of format strings', async () => {
    const formats = await fetch(`${baseUrl}/api/formats`).then((r) => r.json() as Promise<string[]>);
    expect(Array.isArray(formats)).toBe(true);
    expect(formats.length).toBeGreaterThan(0);
    expect(formats).toContain('jpeg');
  });

  it('filters out the "unknown" format', async () => {
    (getSupportedFormats as Mock).mockReturnValueOnce(['jpeg', 'unknown', 'png']);
    const formats = await fetch(`${baseUrl}/api/formats`).then((r) => r.json() as Promise<string[]>);
    expect(formats).not.toContain('unknown');
    expect(formats).toContain('jpeg');
    expect(formats).toContain('png');
  });

  it('returns an empty array when no formats pass the filter', async () => {
    (getSupportedFormats as Mock).mockReturnValueOnce(['unknown']);
    const formats = await fetch(`${baseUrl}/api/formats`).then((r) => r.json() as Promise<string[]>);
    expect(formats).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/read
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/read', () => {
  it('returns 200 with format and metadataTypes', async () => {
    const res = await jsonPost('/api/read', { name: 'test.jpg', data: SAMPLE_B64 });
    expect(res.status).toBe(200);
    const body = await res.json() as { format: string; metadataTypes: string[] };
    expect(body.format).toBe('jpeg');
    expect(Array.isArray(body.metadataTypes)).toBe(true);
    expect(body.metadataTypes).toEqual(['exif', 'gps']);
  });

  it('passes the decoded bytes to readMetadataSync', async () => {
    await jsonPost('/api/read', { name: 'test.jpg', data: SAMPLE_B64 });
    expect(readMetadataSync).toHaveBeenCalledOnce();
    const [bytes] = (readMetadataSync as Mock).mock.calls[0] as [Uint8Array];
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes[0]).toBe(0xff);
    expect(bytes[1]).toBe(0xd8);
  });

  it('uses getMetadataTypes to populate metadataTypes', async () => {
    (getMetadataTypes as Mock).mockReturnValueOnce(['xmp', 'iptc']);
    const body = await jsonPost('/api/read', { name: 'test.jpg', data: SAMPLE_B64 })
      .then((r) => r.json() as Promise<{ metadataTypes: string[] }>);
    expect(body.metadataTypes).toEqual(['xmp', 'iptc']);
  });

  it('returns 500 with error message when readMetadataSync throws', async () => {
    (readMetadataSync as Mock).mockImplementationOnce(() => {
      throw new Error('corrupt file');
    });
    const res = await jsonPost('/api/read', { name: 'bad.jpg', data: SAMPLE_B64 });
    expect(res.status).toBe(500);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('corrupt file');
  });

  it('returns 500 with error message when getMetadataTypes throws', async () => {
    (getMetadataTypes as Mock).mockImplementationOnce(() => {
      throw new Error('type error');
    });
    const res = await jsonPost('/api/read', { name: 'bad.jpg', data: SAMPLE_B64 });
    expect(res.status).toBe(500);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('type error');
  });

  it('returns 400 for invalid JSON body', async () => {
    const res = await fetch(`${baseUrl}/api/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-valid-json',
    });
    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/process
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/process', () => {
  it('returns 200 with cleaned file data', async () => {
    const res = await jsonPost('/api/process', { name: 'photo.jpg', data: SAMPLE_B64, options: {} });
    expect(res.status).toBe(200);
    const body = await res.json() as { name: string; format: string; removed: unknown; data: string };
    expect(body.name).toBe('photo_clean.jpg');
    expect(body.format).toBe('jpeg');
    expect(typeof body.data).toBe('string'); // base64
    expect(body).toHaveProperty('removed');
  });

  it('output name uses buildOutputName convention', async () => {
    const res = await jsonPost('/api/process', { name: 'my.scan.tiff', data: SAMPLE_B64, options: {} });
    const body = await res.json() as { name: string };
    expect(body.name).toBe('my.scan_clean.tiff');
  });

  it('passes decoded bytes to removeMetadataSync', async () => {
    await jsonPost('/api/process', { name: 'photo.jpg', data: SAMPLE_B64, options: {} });
    expect(removeMetadataSync).toHaveBeenCalledOnce();
    const [bytes] = (removeMetadataSync as Mock).mock.calls[0] as [Uint8Array, unknown];
    expect(bytes).toBeInstanceOf(Uint8Array);
  });

  it('passes options to removeMetadataSync', async () => {
    const opts = { preserveColorProfile: true, preserveCopyright: true };
    await jsonPost('/api/process', { name: 'photo.jpg', data: SAMPLE_B64, options: opts });
    const [, receivedOpts] = (removeMetadataSync as Mock).mock.calls[0] as [Uint8Array, unknown];
    expect(receivedOpts).toEqual(opts);
  });

  it('defaults to empty options when options field is omitted', async () => {
    await jsonPost('/api/process', { name: 'photo.jpg', data: SAMPLE_B64 });
    expect(removeMetadataSync).toHaveBeenCalledOnce();
    const [, opts] = (removeMetadataSync as Mock).mock.calls[0] as [Uint8Array, unknown];
    expect(opts).toEqual({});
  });

  it('returned data is valid base64 of the processed bytes', async () => {
    const body = await jsonPost('/api/process', { name: 'photo.jpg', data: SAMPLE_B64, options: {} })
      .then((r) => r.json() as Promise<{ data: string }>);
    const decoded = Buffer.from(body.data, 'base64');
    expect(decoded[0]).toBe(0xff);
    expect(decoded[1]).toBe(0xd8);
  });

  it('returns 500 with error message when removeMetadataSync throws', async () => {
    (removeMetadataSync as Mock).mockImplementationOnce(() => {
      throw new Error('unsupported format');
    });
    const res = await jsonPost('/api/process', { name: 'photo.jpg', data: SAMPLE_B64, options: {} });
    expect(res.status).toBe(500);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('unsupported format');
  });

  it('returns 400 for invalid JSON body', async () => {
    const res = await fetch(`${baseUrl}/api/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{bad json',
    });
    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GUI Features 10-13: server-side behaviour that drives client features
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/process — removed field (Feature 12 before/after diff)', () => {
  it('removed field is an array of metadata type strings', async () => {
    const body = await jsonPost('/api/process', { name: 'photo.jpg', data: SAMPLE_B64, options: {} })
      .then(r => r.json() as Promise<{ removed: unknown }>);
    expect(Array.isArray(body.removed)).toBe(true);
  });

  it('removed field matches removedMetadata from removeMetadataSync', async () => {
    (removeMetadataSync as Mock).mockReturnValueOnce({
      data: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
      format: 'jpeg',
      removedMetadata: ['EXIF', 'GPS', 'XMP'],
    });
    const body = await jsonPost('/api/process', { name: 'photo.jpg', data: SAMPLE_B64, options: {} })
      .then(r => r.json() as Promise<{ removed: string[] }>);
    expect(body.removed).toEqual(['EXIF', 'GPS', 'XMP']);
  });

  it('removed is [] when no metadata was present (already-clean file)', async () => {
    (removeMetadataSync as Mock).mockReturnValueOnce({
      data: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
      format: 'jpeg',
      removedMetadata: [],
    });
    const body = await jsonPost('/api/process', { name: 'photo.jpg', data: SAMPLE_B64, options: {} })
      .then(r => r.json() as Promise<{ removed: string[] }>);
    expect(body.removed).toEqual([]);
  });

  it('response includes name, format, data, and removed (all fields for ZIP + diff)', async () => {
    const body = await jsonPost('/api/process', { name: 'photo.jpg', data: SAMPLE_B64, options: {} })
      .then(r => r.json() as Promise<Record<string, unknown>>);
    expect(body).toHaveProperty('name');
    expect(body).toHaveProperty('format');
    expect(body).toHaveProperty('data');
    expect(body).toHaveProperty('removed');
  });
});

describe('POST /api/process — option persistence (Feature 10 localStorage)', () => {
  it('accepts gpsRedact option when passed from persisted settings', async () => {
    await jsonPost('/api/process', {
      name: 'photo.jpg',
      data: SAMPLE_B64,
      options: { gpsRedact: 'city', preserveColorProfile: false },
    });
    const [, opts] = (removeMetadataSync as Mock).mock.calls[0] as [Uint8Array, Record<string, unknown>];
    expect(opts).toMatchObject({ gpsRedact: 'city' });
  });

  it('all GUI option fields are forwarded to removeMetadataSync intact', async () => {
    const options = {
      preserveColorProfile: true,
      preserveCopyright: true,
      preserveOrientation: true,
      gpsRedact: 'region',
    };
    await jsonPost('/api/process', { name: 'photo.jpg', data: SAMPLE_B64, options });
    const [, received] = (removeMetadataSync as Mock).mock.calls[0] as [Uint8Array, Record<string, unknown>];
    expect(received).toMatchObject(options);
  });
});

// ─── GUI inject options forwarding ────────────────────────────────────────────

describe('POST /api/process — inject options from GUI', () => {
  it('inject fields are forwarded to removeMetadataSync', async () => {
    const options = {
      preserveColorProfile: false,
      inject: {
        copyright: '© 2025 Test',
        artist: 'Jane',
        software: 'HB Scrub',
        imageDescription: 'Test image',
        dateTime: '2025-01-15T10:30:00',
      },
    };
    await jsonPost('/api/process', { name: 'photo.jpg', data: SAMPLE_B64, options });
    const [, received] = (removeMetadataSync as Mock).mock.calls[0] as [Uint8Array, Record<string, unknown>];
    expect(received).toMatchObject({ inject: options.inject });
  });

  it('works without inject option (backward compat)', async () => {
    await jsonPost('/api/process', {
      name: 'photo.jpg',
      data: SAMPLE_B64,
      options: { preserveColorProfile: false },
    });
    const [, received] = (removeMetadataSync as Mock).mock.calls[0] as [Uint8Array, Record<string, unknown>];
    expect(received['inject']).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Unknown / unmatched routes
// ─────────────────────────────────────────────────────────────────────────────

describe('Unknown routes → 404', () => {
  it('GET /unknown returns 404', async () => {
    const res = await fetch(`${baseUrl}/unknown`);
    expect(res.status).toBe(404);
  });

  it('GET /api/unknown returns 404', async () => {
    const res = await fetch(`${baseUrl}/api/unknown`);
    expect(res.status).toBe(404);
  });

  it('DELETE / returns 404', async () => {
    const res = await fetch(`${baseUrl}/`, { method: 'DELETE' });
    expect(res.status).toBe(404);
  });

  it('PUT /api/formats returns 404', async () => {
    const res = await fetch(`${baseUrl}/api/formats`, { method: 'PUT' });
    expect(res.status).toBe(404);
  });

  it('GET /api/formats with trailing slash returns 404', async () => {
    const res = await fetch(`${baseUrl}/api/formats/`);
    expect(res.status).toBe(404);
  });
});
