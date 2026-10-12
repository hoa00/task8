import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, request } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { root } from './harness.mjs';

// Local test server: isolated ephemeral port and proxy to this suite's Worker.
export async function serveHttpBuild(apiUrl) {
  const folder = resolve(root, 'apps/web/dist-http');
  const types = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2',
    '.png': 'image/png',
    '.json': 'application/json',
  };
  const server = createServer(async (incoming, outgoing) => {
    if (incoming.url.startsWith('/api/')) {
      const proxy = request(
        new URL(incoming.url, apiUrl),
        { method: incoming.method, headers: incoming.headers },
        (response) => {
          outgoing.writeHead(response.statusCode, response.headers);
          response.pipe(outgoing);
        },
      );
      proxy.on('error', () => {
        outgoing.writeHead(502);
        outgoing.end();
      });
      incoming.pipe(proxy);
      return;
    }
    try {
      const path = decodeURIComponent(new URL(incoming.url, 'http://localhost').pathname);
      let file = resolve(folder, '.' + path);
      if (!file.startsWith(folder + sep)) {
        outgoing.writeHead(403);
        outgoing.end();
        return;
      }
      try {
        if (!(await stat(file)).isFile()) file = resolve(folder, 'index.html');
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        file = resolve(folder, 'index.html');
      }
      outgoing.writeHead(200, {
        'content-type': types[extname(file)] ?? 'application/octet-stream',
      });
      createReadStream(file)
        .on('error', () => outgoing.destroy())
        .pipe(outgoing);
    } catch {
      outgoing.writeHead(500);
      outgoing.end();
    }
  });
  await new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', accept);
  });
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: () =>
      new Promise((accept, reject) => {
        server.close((error) => (error ? reject(error) : accept()));
        server.closeAllConnections();
      }),
  };
}
