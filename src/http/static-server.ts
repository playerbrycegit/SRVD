/**
 * Static file server for the web client, converted to strict TypeScript. Separate from
 * src/http/server.ts (the API) per Stage 4 §2's vanilla-frontend decision.
 * NOTE: after the TypeScript migration, KERNEL_DIR points at the *compiled* dist/shared-kernel
 * output, not src — a browser cannot execute .ts directly. `npm run build` must run before this
 * server is started for the /shared-kernel/* route to serve anything.
 */
import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.join(__dirname, '..', '..', '..');
const WEB_DIR = path.join(ROOT, 'web');
const KERNEL_DIR = path.join(ROOT, 'dist', 'src', 'shared-kernel');

const MIME: Record<string, string> = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json',
};

function serveFile(res: http.ServerResponse, filePath: string): void {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' });
    res.end(data);
  });
}

export function createStaticServer(): http.Server {
  return http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/');

    if (urlPath.startsWith('/shared-kernel/')) {
      const rel = urlPath.replace('/shared-kernel/', '');
      serveFile(res, path.join(KERNEL_DIR, rel));
      return;
    }

    const rel = urlPath === '/' ? '/index.html' : urlPath;
    const filePath = path.join(WEB_DIR, rel);
    // Prevent path traversal outside WEB_DIR - real, tested security concern even for a dev static server.
    if (!filePath.startsWith(WEB_DIR)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    fs.access(filePath, fs.constants.F_OK, (err) => {
      if (err) {
        serveFile(res, path.join(WEB_DIR, 'index.html')); // SPA fallback for hash routes
        return;
      }
      serveFile(res, filePath);
    });
  });
}
