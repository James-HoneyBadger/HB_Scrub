import { createServer, type Server } from 'node:http';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  DEFAULT_PORT,
  isPortAvailable,
  isServerReachable,
  pickServerPort,
} = require('../electron/server-utils.cjs');

const servers: Server[] = [];

async function listen(server: Server, port = 0): Promise<number> {
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to resolve server address');
  }
  return address.port;
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          try {
            server.close(() => resolve());
          } catch {
            resolve();
          }
        })
    )
  );
});

describe('electron server utilities', () => {
  it('reports a free port as available', async () => {
    expect(await isPortAvailable(DEFAULT_PORT + 41)).toBe(true);
  });

  it('detects when an HTTP server is already reachable', async () => {
    const port = await listen(
      createServer((_, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('ok');
      })
    );

    expect(await isServerReachable(port)).toBe(true);
  });

  it('reuses the preferred port when HB Scrub is already serving there', async () => {
    const preferredPort = await listen(
      createServer((_, res) => {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<!DOCTYPE html><title>HB Scrub</title>');
      })
    );

    expect(await pickServerPort(preferredPort, 3)).toBe(preferredPort);
  });

  it('falls back to the next available port when the preferred one is busy', async () => {
    const busyPort = await listen(createServer());

    expect(await pickServerPort(busyPort, 5)).toBeGreaterThan(busyPort);
  });
});
