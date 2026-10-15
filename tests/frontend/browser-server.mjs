import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, extname, join } from 'node:path';
import { once } from 'node:events';
import { root } from './output.mjs';
export async function startBrowserServer({
  directory = 'apps/web/dist',
  fallback = 'index.html',
  port = 0,
} = {}) {
  const base = resolve(root, directory);
  if (!existsSync(join(base, fallback))) throw Error('Build the browser harness before running it');
  const server = createServer((request, response) => {
    let file = resolve(base, '.' + new URL(request.url, 'http://localhost').pathname);
    if (!file.startsWith(base + '/') && file !== base) {
      response.writeHead(403).end();
      return;
    }
    if (!existsSync(file) || !statSync(file).isFile()) file = join(base, fallback);
    response.setHeader(
      'Content-Type',
      {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.svg': 'image/svg+xml',
        '.woff2': 'font/woff2',
      }[extname(file)] ?? 'application/octet-stream',
    );
    response.end(readFileSync(file));
  });
  server.listen(port, '127.0.0.1');
  await once(server, 'listening');
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    stop: async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
