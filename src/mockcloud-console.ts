import type { IncomingMessage, ServerResponse } from 'node:http';
import { existsSync, createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve, extname, join, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Middleware } from './types.js';

const PROJECT_ROOT = resolve(fileURLToPath(import.meta.url), '../..');
const DIST_DIR = join(PROJECT_ROOT, 'console', 'dist');
const INDEX_HTML = join(DIST_DIR, 'index.html');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

export function createMockCloudConsoleMiddleware(): Middleware {
  let distReady = existsSync(DIST_DIR);

  return async (req: IncomingMessage, res: ServerResponse, next: () => Promise<void>): Promise<void> => {
    if (!distReady && !(distReady = existsSync(DIST_DIR))) {
      await next();
      return;
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const pathname = url.pathname;

    if (pathname.startsWith('/api/')) {
      await next();
      return;
    }

    if (pathname.startsWith('/assets/')) {
      const filePath = resolve(DIST_DIR, pathname.slice(1));
      const rel = relative(DIST_DIR, filePath);
      if (rel.startsWith('..') || isAbsolute(rel)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
        return;
      }
      if (!existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
        return;
      }
      const ext = extname(filePath);
      const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      });
      createReadStream(filePath).pipe(res);
      return;
    }

    try {
      const html = await readFile(INDEX_HTML, 'utf-8');
      res.writeHead(200, {
        'Content-Type': 'text/html',
        'Cache-Control': 'no-cache',
      });
      res.end(html);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  };
}
