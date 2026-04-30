/**
 * HB_Scrub GUI — standalone local web application
 * Run with: node dist/hb-scrub.gui.js
 * Then open the printed localhost URL in your browser.
 *
 * This entry point is intentionally thin — all logic lives in:
 *   src/gui/template.ts  — embedded HTML/CSS/JS single-page application
 *   src/gui/server.ts    — HTTP request handler and buildOutputName helper
 */

import * as http from 'node:http';
import { fileURLToPath } from 'node:url';
import { handleRequest, buildOutputName, MAX_BODY_SIZE } from './gui/server.js';

export { handleRequest, buildOutputName, MAX_BODY_SIZE };

const PORT = Number(process.env['HB_SCRUB_PORT'] || 3777);
const HOST = process.env['HB_SCRUB_HOST'] ?? '127.0.0.1';

// ─── Start ───────────────────────────────────────────────────────────────────

// Only auto-start the server when executed directly (not imported by tests)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = http.createServer(handleRequest);
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n  HB Scrub could not start because port ${PORT} is already in use.\n`);
      console.error('  Close the existing instance or set HB_SCRUB_PORT to another local port.\n');
      process.exit(1);
      return;
    }
    throw err;
  });
  server.listen(PORT, HOST, () => {
    const addr = `http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`;
    console.log(`\n  🛡  HB Scrub GUI is running at ${addr}\n`);
    console.log(`  Open ${addr} in your browser.\n`);
    console.log('  Press Ctrl+C to stop.\n');
  });

  // Graceful shutdown on SIGTERM (e.g. from systemd or Docker)
  process.on('SIGTERM', () => {
    server.close(() => {
      process.exit(0);
    });
  });
}
