// Zero-dependency local development server (Node.js built-ins only).
//
//   npm run serve                 → http://localhost:8000
//   npm run serve -- --port 8080  → another port (or PORT=8080 npm run serve)
//
// Serves the repository root as static files. It exists because the app loads ~30 ES modules in
// parallel, which overwhelms `python3 -m http.server` (it resets connections beyond a small queue).
// Development-friendly: every response is sent with Cache-Control: no-store, so edited modules are
// never served stale. Only for local use; GitHub Pages serves the deployed site.
import {createServer} from 'node:http';
import {readFile, stat} from 'node:fs/promises';
import {extname, join, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

export const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

export const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

// Maps a request path to a file inside root, or null if it is invalid, hidden or outside root.
export function resolveRequestPath(root, urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  } catch {
    return null; // malformed percent-encoding
  }
  if (decoded.includes('\0')) return null;
  // Hidden files and folders (.git, .github, .DS_Store) are never served.
  if (decoded.split(/[/\\]/).some((part) => part.startsWith('.') && part !== '.' && part !== '..')) return null;
  const file = resolve(root, '.' + (decoded.endsWith('/') ? decoded + 'index.html' : decoded));
  return file === root || file.startsWith(root + sep) ? file : null;
}

function send(res, status, body, type = 'text/plain; charset=utf-8', head = false) {
  res.writeHead(status, {'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'});
  res.end(head ? undefined : body);
}

export function createDevServer(root = ROOT) {
  return createServer(async (req, res) => {
    const head = req.method === 'HEAD';
    if (req.method !== 'GET' && !head) return send(res, 405, 'Method not allowed\n', undefined, head);
    let file = resolveRequestPath(root, req.url);
    if (!file) return send(res, 404, 'Not found\n', undefined, head);
    try {
      if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
      const body = await readFile(file);
      send(res, 200, body, MIME_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream', head);
    } catch {
      send(res, 404, 'Not found\n', undefined, head);
    }
  });
}

function portFromArgs(argv, env) {
  const i = argv.indexOf('--port');
  const port = Number(i >= 0 ? argv[i + 1] : env.PORT ?? 8000);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw Error(`Invalid port: ${i >= 0 ? argv[i + 1] : env.PORT}`);
  return port;
}

// Run directly (npm run serve), not when imported by the tests.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // Bind the IPv4 loopback address explicitly. Binding the name "localhost" can pick IPv6 ::1 on macOS
  // and silently share a port with another server on 127.0.0.1; this way a conflict is reported.
  // Browsers opening http://localhost:<port> fall back to 127.0.0.1, so that URL still works.
  const host = '127.0.0.1';
  let port;
  try {
    port = portFromArgs(process.argv, process.env);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  const server = createDevServer();
  server.on('error', (error) => {
    console.error(error.code === 'EADDRINUSE' ? `Port ${port} is already in use. Try: npm run serve -- --port ${port + 1}` : error.message);
    process.exit(1);
  });
  server.listen(port, host, () => {
    console.log(`Quantum Learning Lab running at http://localhost:${server.address().port}/ (${host})`);
    console.log('Serving', ROOT, '· Press Ctrl+C to stop.');
  });
  const stop = () => {
    console.log('\nStopping server.');
    server.close(() => process.exit(0));
    server.closeAllConnections?.();
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
