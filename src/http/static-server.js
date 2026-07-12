'use strict';
/**
 * Static file server for the web client. Separate from src/http/server.js (the API) because
 * Stage 4 §2 kept the frontend as a plain static app - no bundler, no framework, matching the
 * "existing vanilla HTML/CSS/JS core" decision. Serves /web as the site root, and exposes
 * /shared-kernel/* so the browser loads the exact same calculation-engine file Node runs
 * (Stage 9 §1's anti-duplication rule) rather than a copy-pasted client version.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const WEB_DIR = path.join(ROOT, 'web');
const KERNEL_DIR = path.join(ROOT, 'src', 'shared-kernel');

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json' };

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

function createStaticServer() {
  return http.createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);

    if (urlPath.startsWith('/shared-kernel/')) {
      const rel = urlPath.replace('/shared-kernel/', '');
      return serveFile(res, path.join(KERNEL_DIR, rel));
    }

    const rel = urlPath === '/' ? '/index.html' : urlPath;
    const filePath = path.join(WEB_DIR, rel);
    // Prevent path traversal outside WEB_DIR - real, tested security concern even for a dev static server.
    if (!filePath.startsWith(WEB_DIR)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }
    fs.access(filePath, fs.constants.F_OK, (err) => {
      if (err) return serveFile(res, path.join(WEB_DIR, 'index.html')); // SPA fallback for hash routes
      serveFile(res, filePath);
    });
  });
}

module.exports = { createStaticServer };
