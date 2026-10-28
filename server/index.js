// Static file server for the single-player game (browsers need http for ES modules).

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT) || 8787;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
};

// --- Static files: /shared/* from shared/, everything else from public/ ---
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const base = urlPath.startsWith('/shared/') ? ROOT : path.join(ROOT, 'public');
  const file = path.join(base, urlPath === '/' ? 'index.html' : urlPath);
  if (!file.startsWith(base + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404).end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

server.on('error', (err) => {
  if (err.code !== 'EADDRINUSE') throw err;
  console.error(`Port ${PORT} is already in use. Run with another one: PORT=9000 npm run dev`);
  process.exit(1);
});
server.listen(PORT, () => console.log(`Game: http://localhost:${PORT}`));
