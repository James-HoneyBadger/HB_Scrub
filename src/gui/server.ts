/**
 * HB_Scrub GUI — HTTP request handler.
 * Kept separate from the HTML template (template.ts) and the entry point (../gui.ts)
 * so that each concern can be read and tested in isolation.
 */

import * as http from 'node:http';
import {
  removeMetadataSync,
  readMetadataSync,
  getMetadataTypes,
  getSupportedFormats,
} from '../index.js';
import { HTML } from './template.js';

// ─── HTTP Server ─────────────────────────────────────────────────────────────

/** Maximum request body size in bytes (default 50 MB, configurable via env). */
export const MAX_BODY_SIZE = parseInt(process.env['HB_SCRUB_MAX_BODY'] ?? '', 10) || 50 * 1024 * 1024;

export function handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  const parsedUrl = new URL(req.url ?? '/', 'http://localhost');
  const pathname = parsedUrl.pathname;

  // ── CORS pre-flight (loopback-only) ─────────────────────────────────────
  const corsHeaders = {
    'Access-Control-Allow-Origin': 'http://localhost',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  // Attach a per-request ID for tracing.
  const requestId =
    (req.headers['x-request-id'] as string | undefined) ??
    Math.random().toString(36).slice(2);
  res.setHeader('X-Request-ID', requestId);

  // ── GET / → serve UI ────────────────────────────────────────────────────
  if (req.method === 'GET' && pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(HTML);
    return;
  }

  // ── GET /health ──────────────────────────────────────────────────────────
  if (req.method === 'GET' && pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', pid: process.pid }));
    return;
  }

  // ── GET /api/formats ─────────────────────────────────────────────────────
  if (req.method === 'GET' && pathname === '/api/formats') {
    const fmts = getSupportedFormats().filter(f => f !== 'unknown');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(fmts));
    return;
  }

  // ── POST helpers ─────────────────────────────────────────────────────────
  if (req.method === 'POST' && (pathname === '/api/process' || pathname === '/api/read')) {
    const chunks: Buffer[] = [];
    let bodySize = 0;
    let aborted = false;

    req.on('data', (chunk: Buffer) => {
      bodySize += chunk.length;
      if (bodySize > MAX_BODY_SIZE) {
        if (!aborted) {
          aborted = true;
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Request body exceeds ${MAX_BODY_SIZE} byte limit` }));
          req.destroy();
        }
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (aborted) return;
      let parsed: { name?: unknown; data?: unknown; options?: Record<string, unknown> };
      try {
        parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as typeof parsed;
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON in request body' }));
        return;
      }

      const { name, data, options } = parsed;
      if (typeof name !== 'string' || typeof data !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing required fields: name (string) and data (base64 string)' }));
        return;
      }

      try {
        const bytes = Uint8Array.from(Buffer.from(data, 'base64'));

        if (pathname === '/api/read') {
          // Read metadata without modifying
          const result = readMetadataSync(bytes);
          const metadataTypes = getMetadataTypes(bytes);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              format: result.format,
              metadataTypes,
            })
          );
          return;
        }

        // /api/process — strip metadata
        const result = removeMetadataSync(bytes, options ?? {});
        const outName = buildOutputName(name);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            name: outName,
            format: result.format,
            removed: result.removedMetadata,
            warnings: result.warnings,
            data: Buffer.from(result.data).toString('base64'),
          })
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: msg }));
      }
    });
    return;
  }

  // ── 404 ──────────────────────────────────────────────────────────────────
  res.writeHead(404);
  res.end('Not found');
}

export function buildOutputName(original: string): string {
  const dot = original.lastIndexOf('.');
  if (dot === -1) {
    return original + '_clean';
  }
  return original.slice(0, dot) + '_clean' + original.slice(dot);
}
