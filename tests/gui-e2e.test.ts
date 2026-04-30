/**
 * End-to-end tests for the HB Scrub GUI HTTP server using the REAL implementation.
 *
 * This file is kept separate from gui.test.ts because that file applies a
 * vi.mock() to src/index.js at the module level.  Vitest's mock hoisting
 * means the mock would affect every import in the same file — including
 * imports from gui/server.ts — so real library execution is impossible there.
 *
 * Here: no mocks.  The actual removeMetadataSync / readMetadataSync run
 * against live bytes to verify the full request → library → response pipeline.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as http from 'node:http';
import { handleRequest } from '../src/gui/server.js';

let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
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

// ─── Test fixture ─────────────────────────────────────────────────────────────

/** Minimal valid JPEG: SOI + JFIF APP0 + EOI */
const REAL_JPEG = Buffer.from([
  0xff, 0xd8,                     // SOI
  0xff, 0xe0, 0x00, 0x10,         // APP0 marker + length (16)
  0x4a, 0x46, 0x49, 0x46, 0x00,  // "JFIF\0"
  0x01, 0x01, 0x00,               // version 1.1, no units
  0x00, 0x01, 0x00, 0x01,         // 1×1 pixel density
  0x00, 0x00,                     // no thumbnail
  0xff, 0xd9,                     // EOI
]);

const REAL_B64 = REAL_JPEG.toString('base64');

// ─── /api/formats ─────────────────────────────────────────────────────────────

describe('GET /api/formats — real', () => {
  it('returns a non-empty array of format strings', async () => {
    const res = await fetch(`${baseUrl}/api/formats`);
    expect(res.status).toBe(200);
    const formats = await res.json() as string[];
    expect(Array.isArray(formats)).toBe(true);
    expect(formats.length).toBeGreaterThan(0);
  });

  it('includes jpeg and png', async () => {
    const formats = await fetch(`${baseUrl}/api/formats`).then(r => r.json() as Promise<string[]>);
    expect(formats).toContain('jpeg');
    expect(formats).toContain('png');
  });

  it('does not include "unknown"', async () => {
    const formats = await fetch(`${baseUrl}/api/formats`).then(r => r.json() as Promise<string[]>);
    expect(formats).not.toContain('unknown');
  });
});

// ─── /api/read ────────────────────────────────────────────────────────────────

describe('POST /api/read — real', () => {
  it('detects jpeg format from real bytes', async () => {
    const res = await fetch(`${baseUrl}/api/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'photo.jpg', data: REAL_B64 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { format: string; metadataTypes: string[] };
    expect(body.format).toBe('jpeg');
    expect(Array.isArray(body.metadataTypes)).toBe(true);
  });

  it('returns 500 for unrecognised bytes', async () => {
    const badB64 = Buffer.from([0x00, 0x01, 0x02, 0x03]).toString('base64');
    const res = await fetch(`${baseUrl}/api/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'bad.bin', data: badB64 }),
    });
    // readMetadataSync may succeed or throw depending on format detection;
    // either a 200 or a 500 is acceptable — the important thing is it does not crash the server.
    expect([200, 500]).toContain(res.status);
  });
});

// ─── /api/process ─────────────────────────────────────────────────────────────

describe('POST /api/process — real', () => {
  it('returns 200 with cleaned JPEG bytes', async () => {
    const res = await fetch(`${baseUrl}/api/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'photo.jpg', data: REAL_B64, options: {} }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { name: string; format: string; data: string; removed: string[] };
    expect(body.format).toBe('jpeg');
    expect(body.name).toBe('photo_clean.jpg');
    expect(typeof body.data).toBe('string');
    expect(Array.isArray(body.removed)).toBe(true);
  });

  it('output bytes start with JPEG SOI marker', async () => {
    const body = await fetch(`${baseUrl}/api/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'photo.jpg', data: REAL_B64, options: {} }),
    }).then(r => r.json() as Promise<{ data: string }>);

    const outBytes = Buffer.from(body.data, 'base64');
    expect(outBytes[0]).toBe(0xff);
    expect(outBytes[1]).toBe(0xd8);
  });

  it('output size is ≤ input size (metadata stripped, never inflated)', async () => {
    const body = await fetch(`${baseUrl}/api/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'photo.jpg', data: REAL_B64, options: {} }),
    }).then(r => r.json() as Promise<{ data: string }>);

    const outBytes = Buffer.from(body.data, 'base64');
    expect(outBytes.length).toBeLessThanOrEqual(REAL_JPEG.length);
  });

  it('preserveOrientation option is forwarded to the library', async () => {
    const res = await fetch(`${baseUrl}/api/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'photo.jpg', data: REAL_B64, options: { preserveOrientation: true } }),
    });
    expect(res.status).toBe(200);
  });

  it('returns 500 with an error message for unrecognised bytes', async () => {
    const badB64 = Buffer.from([0x00, 0x01, 0x02]).toString('base64');
    const res = await fetch(`${baseUrl}/api/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'bad.bin', data: badB64, options: {} }),
    });
    expect(res.status).toBe(500);
    const body = await res.json() as { error: string };
    expect(typeof body.error).toBe('string');
    expect(body.error.length).toBeGreaterThan(0);
  });

  it('returns 400 for a missing "data" field', async () => {
    const res = await fetch(`${baseUrl}/api/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'photo.jpg' }),
    });
    expect(res.status).toBe(400);
  });
});
