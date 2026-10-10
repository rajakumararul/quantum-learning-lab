import {describe, test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {request} from 'node:http';
import {mkdtempSync, writeFileSync, mkdirSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createDevServer, resolveRequestPath, MIME_TYPES, ROOT} from '../scripts/serve.mjs';

// Raw HTTP so paths such as /../ reach the server unnormalized (fetch would clean them up).
function get(port, path, method = 'GET') {
  return new Promise((done, fail) => {
    const req = request({host: '127.0.0.1', port, path, method}, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => done({status: res.statusCode, type: res.headers['content-type'], cache: res.headers['cache-control'], body}));
    });
    req.on('error', fail);
    req.end();
  });
}

describe('development server', () => {
  let server, port;
  before(async () => {
    server = createDevServer();
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    port = server.address().port;
  });
  after(() => new Promise((r) => server.close(r)));

  test('/ serves index.html', async () => {
    const r = await get(port, '/');
    assert.equal(r.status, 200);
    assert.equal(r.type, 'text/html; charset=utf-8');
    assert.match(r.body, /<title>Quantum Learning Lab/);
  });

  test('serves the project\'s file types with the right MIME types', async () => {
    for (const [path, type] of [['/app.js', 'text/javascript'], ['/styles.css', 'text/css'], ['/favicon.svg', 'image/svg+xml'], ['/package.json', 'application/json'], ['/scripts/serve.mjs', 'text/javascript']]) {
      const r = await get(port, path);
      assert.equal(r.status, 200, path);
      assert.ok(r.type.startsWith(type), `${path}: ${r.type}`);
    }
  });

  test('every response is uncached so edited modules are never stale', async () => {
    for (const path of ['/', '/app.js', '/missing.js']) assert.equal((await get(port, path)).cache, 'no-store');
  });

  test('missing files give 404, query strings are ignored', async () => {
    assert.equal((await get(port, '/no-such-file.js')).status, 404);
    assert.equal((await get(port, '/index.html?v=123')).status, 200);
  });

  test('path traversal outside the repository is refused', async () => {
    for (const path of ['/../package.json', '/..%2f..%2fetc%2fpasswd', '/%2e%2e/%2e%2e/etc/passwd', '/test/../../x', '/%00index.html', '/%E0%A4%A']) {
      assert.equal((await get(port, path)).status, 404, path);
    }
  });

  test('hidden files such as .git and .github are never served', async () => {
    for (const path of ['/.git/config', '/.github/workflows/deploy.yml', '/.gitignore', '/%2egit/HEAD']) assert.equal((await get(port, path)).status, 404, path);
  });

  test('HEAD is allowed without a body; other methods get 405', async () => {
    const h = await get(port, '/app.js', 'HEAD');
    assert.equal(h.status, 200);
    assert.equal(h.body, '');
    assert.equal((await get(port, '/', 'POST')).status, 405);
  });
});

describe('request path resolution', () => {
  test('stays inside the root and maps directories to index.html', () => {
    const dir = mkdtempSync(join(tmpdir(), 'qll-')), root = resolve(dir);
    try {
      mkdirSync(join(root, 'sub'));
      writeFileSync(join(root, 'sub', 'index.html'), 'x');
      assert.equal(resolveRequestPath(root, '/'), join(root, 'index.html'));
      assert.equal(resolveRequestPath(root, '/sub/'), join(root, 'sub', 'index.html'));
      assert.equal(resolveRequestPath(root, '/a/b.js'), join(root, 'a', 'b.js'));
      assert.equal(resolveRequestPath(root, '/../x'), null);
      assert.equal(resolveRequestPath(root, '/sub/../../x'), null);
      assert.equal(resolveRequestPath(root, '/%zz'), null);
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });

  test('defaults: repository root and required MIME types', () => {
    assert.equal(ROOT, resolve(fileURLToPath(new URL('..', import.meta.url))));
    for (const ext of ['.html', '.js', '.mjs', '.css', '.svg', '.json']) assert.ok(MIME_TYPES[ext], ext);
  });
});
