'use strict';

const http = require('http');
const net = require('net');

const DEFAULT_PORT = Number(process.env.HB_SCRUB_PORT || 3777);

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
