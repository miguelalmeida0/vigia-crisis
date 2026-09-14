import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg'
});

function safePath(root, relative) {
  const rootPath = path.resolve(root);
  const normalized = path.normalize(relative).replace(/^([.][.](\/|\\|$))+/, '');
  const filePath = path.resolve(rootPath, normalized);
  if (filePath !== rootPath && !filePath.startsWith(`${rootPath}${path.sep}`)) throw new Error('invalid_path');
  return filePath;
}

export async function serveStatic(res, root, pathname) {
  if (pathname === '/api' || pathname.startsWith('/api/')) return false;
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
  const candidate = safePath(root, relative);
  try {
    const info = await stat(candidate);
    const filePath = info.isDirectory() ? safePath(root, path.join(relative, 'index.html')) : candidate;
    const fileInfo = info.isDirectory() ? await stat(filePath) : info;
    if (!fileInfo.isFile()) throw new Error('not_file');
    const body = await readFile(filePath);
    const immutable = /\/assets\/.*\.(?:webp|png|jpg|jpeg|svg)$/i.test(filePath);
    res.writeHead(200, {
      'content-type': TYPES[path.extname(filePath)] ?? 'application/octet-stream',
      'content-length': body.length,
      'cache-control': filePath.endsWith('index.html') ? 'no-store' : immutable ? 'public, max-age=86400' : 'no-cache',
      'x-content-type-options': 'nosniff'
    });
    res.end(body);
    return true;
  } catch {
    if (!pathname.includes('.')) {
      try {
        const index = await readFile(path.join(root, 'index.html'));
        res.writeHead(200, {
          'content-type': TYPES['.html'],
          'content-length': index.length,
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff'
        });
        res.end(index);
        return true;
      } catch {}
    }
    return false;
  }
}
