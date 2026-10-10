import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { build } from 'esbuild';
import { randomBytes } from 'node:crypto';

let worker: Miniflare;
const secret = randomBytes(32).toString('hex');
const origin = 'https://libra.test';
let cookie = '';
let ip = 0;
type Data = Record<string, any>;
async function request(
  path: string,
  method = 'GET',
  body?: unknown,
  options: { auth?: boolean; origin?: string; raw?: string; ip?: string } = {},
) {
  const headers: Record<string, string> = { 'CF-Connecting-IP': options.ip ?? `192.0.2.${++ip}` };
  if (options.auth !== false && cookie) headers.Cookie = cookie;
  if (method !== 'GET' && method !== 'HEAD')
    Object.assign(headers, {
      'Content-Type': 'application/json',
      Origin: options.origin ?? origin,
      'X-Libra-Request': '1',
    });
  return worker.dispatchFetch(`${origin}${path}`, {
    method,
    headers,
    ...(body === undefined && !options.raw ? {} : { body: options.raw ?? JSON.stringify(body) }),
  });
}
async function read(response: Awaited<ReturnType<typeof request>>): Promise<Data> {
  return response.json() as Promise<Data>;
}
async function createServer(name = '家庭媒体库', enabled = true) {
  const response = await request('/api/servers', 'POST', {
    enabled,
    config: {
      type: 'emby',
      name,
      note: '家庭影音',
      logo: 'https://example.com/logo.png',
      primary: { url: 'https://media.example.com:8920/emby', name: '主线路' },
      credentials: { username: 'demo', password: ' 中文 &+#% ' },
      alternates: [{ url: 'http://192.168.1.10:8096', name: '局域网' }],
    },
  });
  assert.equal(response.status, 201, await response.clone().text());
  return read(response);
}
before(async () => {
  const bundled = await build({
    entryPoints: ['src/worker/index.ts'],
    bundle: true,
    write: false,
    platform: 'neutral',
    target: 'es2022',
    format: 'esm',
    external: ['node:crypto'],
  });
  const options = convertV4MiniflareOptions({
    modules: true,
    script: bundled.outputFiles[0].text,
    compatibilityDate: '2026-10-10',
    compatibilityFlags: ['nodejs_compat'],
    bindings: { APP_SECRET: secret },
    kvNamespaces: ['LIBRA_KV'],
    ratelimits: {
      AUTH_LIMITER: { namespace_id: '1', simple: { limit: 10, period: 60 } },
      PUBLIC_LIMITER: { namespace_id: '2', simple: { limit: 120, period: 60 } },
    },
  });
  options.workers[0].dev.stripCfConnectingIp = false;
  worker = new Miniflare(options);
});
after(async () => {
  await worker?.dispose();
});
test('unauthenticated requests cannot read or change admin data, and headers prevent caching', async () => {
  assert.equal((await request('/api/dashboard')).status, 401);
  assert.equal((await request('/api/servers', 'POST', { config: {} })).status, 401);
  const status = await request('/api/status');
  assert.deepEqual(await read(status), { initialized: false, configured: true });
  assert.match(status.headers.get('Cache-Control')!, /no-store/);
  const page = await request('/');
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Libra/);
  assert.match(page.headers.get('Content-Security-Policy')!, /frame-ancestors 'none'/);
  assert.equal(page.headers.get('Referrer-Policy'), 'no-referrer');
  assert.equal(page.headers.get('Access-Control-Allow-Origin'), null);
});
test('first-time setup requires deployment key, strong password and matching origin', async () => {
  assert.equal(
    (await request('/api/auth/setup', 'POST', { setupKey: 'wrong', password: 'Abcdef12!' })).status,
    403,
  );
  assert.equal(
    (await request('/api/auth/setup', 'POST', { setupKey: secret, password: 'password' })).status,
    400,
  );
  assert.equal(
    (
      await request(
        '/api/auth/setup',
        'POST',
        { setupKey: secret, password: 'Abcdef12!' },
        { origin: 'https://evil.example' },
      )
    ).status,
    403,
  );
  const response = await request('/api/auth/setup', 'POST', { setupKey: secret, password: 'Abcdef12!' });
  assert.equal(response.status, 200, await response.clone().text());
  const setCookie = response.headers.get('Set-Cookie')!;
  for (const flag of ['HttpOnly', 'SameSite=Strict', 'Secure', 'Path=/']) assert.ok(setCookie.includes(flag));
  cookie = setCookie.split(';')[0];
  assert.equal((await request('/api/me')).status, 200);
  assert.equal(
    (await request('/api/auth/setup', 'POST', { setupKey: secret, password: 'Abcdef12!' })).status,
    409,
  );
});
test('credentials are encrypted in KV and raw bodies or cross-origin changes rejected', async () => {
  const server = await createServer();
  const kv = await worker.getKVNamespace('LIBRA_KV');
  const raw = (await kv.get(`server:${server.id}`)) as string | null;
  assert.ok(raw);
  assert.equal(raw.includes('demo'), false);
  assert.equal(raw.includes('media.example'), false);
  assert.equal(
    (
      await request(
        `/api/servers/${server.id}`,
        'PUT',
        { version: server.version, enabled: false },
        { origin: 'https://evil.example' },
      )
    ).status,
    403,
  );
  assert.equal((await request('/api/servers', 'POST', undefined, { raw: 'broken-json' })).status, 400);
  assert.equal(
    (await request('/api/servers', 'POST', undefined, { raw: 'x'.repeat(130 * 1024) })).status,
    413,
  );
  assert.equal(
    (await request(`/api/servers/${server.id}`, 'PUT', { version: 'stale', enabled: false })).status,
    409,
  );
});
test('public feeds return only selected enabled configurations, allow CORS, and preserve exact password', async () => {
  const selected = await createServer('Selected');
  const disabled = await createServer('Disabled', false);
  const response = await request('/api/subscriptions', 'POST', {
    name: 'My phone',
    slug: '12345678',
    allServers: false,
    serverIds: [selected.id, disabled.id],
  });
  assert.equal(response.status, 201, await response.clone().text());
  const feed = await request('/12345678', 'GET', undefined, { auth: false });
  assert.equal(feed.status, 200);
  assert.equal(feed.headers.get('Access-Control-Allow-Origin'), '*');
  assert.match(feed.headers.get('Cache-Control')!, /no-store/);
  const configs = (await feed.json()) as Data[];
  assert.deepEqual(configs, [selected.config]);
  assert.equal(configs[0].credentials.password, ' 中文 &+#% ');
  for (const key of ['id', 'enabled', 'version', 'createdAt', 'updatedAt'])
    assert.equal(Object.hasOwn(configs[0], key), false);
  assert.equal((await request('/12345678', 'HEAD')).status, 200);
  assert.equal(await (await request('/12345678', 'HEAD')).text(), '');
  assert.equal((await request('/12345678', 'OPTIONS')).status, 204);
  assert.equal((await request('/unknownX', 'GET', undefined, { auth: false })).status, 404);
  assert.equal((await request('/1234567', 'GET', undefined, { auth: false })).status, 404);
});
test('subscription disable, rotation, delete, and suffix reuse work', async () => {
  let response = await request('/api/subscriptions', 'POST', {
    name: 'All',
    slug: 'abcdefgh',
    allServers: true,
  });
  let sub = await read(response);
  assert.equal(
    (await request('/api/subscriptions', 'POST', { name: 'Collision', slug: 'abcdefgh' })).status,
    409,
  );
  assert.equal((await request('/api/subscriptions', 'POST', { name: 'Bad', slug: 'abc' })).status, 400);
  response = await request(`/api/subscriptions/${sub.id}`, 'PUT', { version: sub.version, enabled: false });
  sub = await read(response);
  assert.equal((await request('/abcdefgh', 'GET', undefined, { auth: false })).status, 404);
  response = await request(`/api/subscriptions/${sub.id}`, 'PUT', {
    version: sub.version,
    enabled: true,
    slug: 'rotatedAbc',
  });
  sub = await read(response);
  assert.equal((await request('/abcdefgh')).status, 404);
  assert.equal((await request('/rotatedAbc')).status, 200);
  assert.equal(
    (await request('/api/subscriptions', 'POST', { name: 'Reused after rotation', slug: 'abcdefgh' })).status,
    201,
  );
  assert.equal(
    (await request(`/api/subscriptions/${sub.id}`, 'DELETE', { version: sub.version })).status,
    200,
  );
  assert.equal((await request('/rotatedAbc')).status, 404);
  assert.equal(
    (await request('/api/subscriptions', 'POST', { name: 'Reused after deletion', slug: 'rotatedAbc' }))
      .status,
    201,
  );
  assert.equal((await request('/rotatedAbc')).status, 200);
});
test('all-server feeds reflect updates, disabled records and deleted servers', async () => {
  const subResponse = await request('/api/subscriptions', 'POST', { name: 'Dynamic feed' });
  const sub = await read(subResponse);
  assert.match(sub.slug, /^[a-z0-9]{32}$/);
  const created = await createServer('Dynamic');
  const before = (await (await request(`/${sub.slug}`)).json()) as Data[];
  assert.ok(before.some((item) => item.name === 'Dynamic'));
  assert.ok(!before.some((item) => item.name === 'Disabled'));
  const updated = await read(
    await request(`/api/servers/${created.id}`, 'PUT', {
      version: created.version,
      config: { ...created.config, name: 'Changed' },
    }),
  );
  const changed = (await (await request(`/${sub.slug}`)).json()) as Data[];
  assert.ok(changed.some((item) => item.name === 'Changed'));
  assert.ok(!changed.some((item) => item.name === 'Dynamic'));
  assert.equal(
    (await request(`/api/servers/${created.id}`, 'DELETE', { version: updated.version })).status,
    200,
  );
  const after = (await (await request(`/${sub.slug}`)).json()) as Data[];
  assert.ok(!after.some((item) => item.name === 'Changed'));
});
test('login rate limiting uses IP and protects repeated guesses', async () => {
  for (let i = 0; i < 10; i++)
    assert.equal(
      (await request('/api/auth/login', 'POST', { password: 'invalid' }, { ip: '198.51.100.99' })).status,
      401,
    );
  const blocked = await request('/api/auth/login', 'POST', { password: 'invalid' }, { ip: '198.51.100.99' });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get('Retry-After'), '60');
});
test('password changes invalidate older sessions, and logout removes the active session', async () => {
  assert.equal(
    (await request('/api/auth/password', 'POST', { currentPassword: 'wrong', password: 'Newpass1!' })).status,
    403,
  );
  const changed = await request('/api/auth/password', 'POST', {
    currentPassword: 'Abcdef12!',
    password: 'Newpass1!',
  });
  assert.equal(changed.status, 200);
  assert.equal((await request('/api/me')).status, 401);
  cookie = changed.headers.get('Set-Cookie')!.split(';')[0];
  assert.equal((await request('/api/me')).status, 200);
  assert.equal((await request('/api/auth/login', 'POST', { password: 'Abcdef12!' })).status, 401);
  assert.equal((await request('/api/auth/login', 'POST', { password: 'Newpass1!' })).status, 200);
  const logout = await request('/api/auth/logout', 'POST', {});
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get('Set-Cookie')!, /Max-Age=0/);
  assert.equal((await request('/api/me')).status, 401);
});
