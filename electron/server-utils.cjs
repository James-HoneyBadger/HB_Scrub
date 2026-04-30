'use strict';

const http = require('http');
const net = require('net');

const DEFAULT_PORT = Number(process.env.HB_SCRUB_PORT || 3777);
const TIMEOUT_MS = Number(process.env.HB_SCRUB_CONNECT_TIMEOUT) || 800;
const DEBUG = process.env.HB_SCRUB_DEBUG === '1';

function debug(...args) {
  if (DEBUG) console.debug('[server-utils]', ...args);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPortAvailable(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();

    server.once('error', () => {
      resolve(false);
    });

    server.listen(port, host, () => {
      server.close(() => resolve(true));
    });
  });
}

function isServerReachable(port, host = '127.0.0.1', requestPath = '/', timeout = TIMEOUT_MS) {
  return new Promise((resolve) => {
    const req = http.get({ host, port, path: requestPath, timeout }, (res) => {
      res.resume();
      resolve((res.statusCode || 0) >= 200 && (res.statusCode || 0) < 500);
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });

    req.on('error', () => {
      resolve(false);
    });
  });
}

function isHbScrubServer(port, host = '127.0.0.1', timeout = TIMEOUT_MS) {
  return new Promise((resolve) => {
    const req = http.get({ host, port, path: '/', timeout }, (res) => {
      let body = '';
      res.setEncoding('utf8');

      res.on('data', (chunk) => {
        if (body.length < 4096) {
          body += chunk;
        }
      });

      res.on('end', () => {
        const isExpectedHtml = /HB Scrub|Metadata Remover/i.test(body);
        resolve((res.statusCode || 0) === 200 && isExpectedHtml);
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });

    req.on('error', () => {
      resolve(false);
    });
  });
}

/**
 * Locate a suitable port for the HB Scrub server.
 * @returns {{ port: number, source: 'existing'|'preferred'|'fallback', attempts: number }}
 */
async function pickServerPort(preferredPort = DEFAULT_PORT, maxOffset = 20) {
  if (await isHbScrubServer(preferredPort)) {
    debug(`Reusing existing HB Scrub server on port ${preferredPort}`);
    return { port: preferredPort, source: 'existing', attempts: 1 };
  }

  if (await isPortAvailable(preferredPort)) {
    debug(`Using preferred port ${preferredPort}`);
    return { port: preferredPort, source: 'preferred', attempts: 2 };
  }

  for (let offset = 1; offset <= maxOffset; offset++) {
    const candidate = preferredPort + offset;
    if (await isPortAvailable(candidate)) {
      debug(`Using fallback port ${candidate} (offset ${offset})`);
      return { port: candidate, source: 'fallback', attempts: offset + 2 };
    }
  }

  debug(`All ports busy; falling back to preferred port ${preferredPort}`);
  return { port: preferredPort, source: 'preferred', attempts: maxOffset + 2 };
}

async function waitForServer(port, retries = 50, delayMs = 200) {
  for (let attempt = 0; attempt < retries; attempt++) {
    if (await isServerReachable(port)) {
      return;
    }
    await delay(delayMs);
  }

  throw new Error(`GUI server did not start in time on port ${port}`);
}

module.exports = {
  DEFAULT_PORT,
  TIMEOUT_MS,
  isPortAvailable,
  isServerReachable,
  isHbScrubServer,
  pickServerPort,
  waitForServer,
};


function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPortAvailable(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();

    server.once('error', () => {
      resolve(false);
    });

    server.listen(port, host, () => {
      server.close(() => resolve(true));
    });
  });
}

function isServerReachable(port, host = '127.0.0.1', requestPath = '/', timeout = 500) {
  return new Promise((resolve) => {
    const req = http.get({ host, port, path: requestPath, timeout }, (res) => {
      res.resume();
      resolve((res.statusCode || 0) >= 200 && (res.statusCode || 0) < 500);
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });

    req.on('error', () => {
      resolve(false);
    });
  });
}

function isHbScrubServer(port, host = '127.0.0.1', timeout = 800) {
  return new Promise((resolve) => {
    const req = http.get({ host, port, path: '/', timeout }, (res) => {
      let body = '';
      res.setEncoding('utf8');

      res.on('data', (chunk) => {
        if (body.length < 4096) {
          body += chunk;
        }
      });

      res.on('end', () => {
        const isExpectedHtml = /HB Scrub|Metadata Remover/i.test(body);
        resolve((res.statusCode || 0) === 200 && isExpectedHtml);
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });

    req.on('error', () => {
      resolve(false);
    });
  });
}

async function pickServerPort(preferredPort = DEFAULT_PORT, maxOffset = 20) {
  if (await isHbScrubServer(preferredPort)) {
    return preferredPort;
  }

  if (await isPortAvailable(preferredPort)) {
    return preferredPort;
  }

  for (let offset = 1; offset <= maxOffset; offset++) {
    const candidate = preferredPort + offset;
    if (await isPortAvailable(candidate)) {
      return candidate;
    }
  }

  return preferredPort;
}

async function waitForServer(port, retries = 50, delayMs = 200) {
  for (let attempt = 0; attempt < retries; attempt++) {
    if (await isServerReachable(port)) {
      return;
    }
    await delay(delayMs);
  }

  throw new Error(`GUI server did not start in time on port ${port}`);
}

module.exports = {
  DEFAULT_PORT,
  isPortAvailable,
  isServerReachable,
  isHbScrubServer,
  pickServerPort,
  waitForServer,
};
