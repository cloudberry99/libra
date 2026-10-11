import test from 'node:test';
import assert from 'node:assert/strict';
import './helpers/webcrypto';
import app from '../src/worker/index';
import { digest } from '../src/worker/crypto';
import { Store, SERVER_CATALOG_KEY } from '../src/worker/storage';
import { MAX_SERVER_IMPORT_BYTES } from '../src/shared/server-import';
import type { ServerConfig, ServerImportResult, ServerRecord } from '../src/shared/types';
import { legacyServer, memoryStorage } from './helpers/storage';

const config: ServerConfig = {
  type: 'emby',
  name: '新媒体库',
  primary: { url: 'https://import.example.com/emby' },
  credentials: { username: 'demo', password: ' 中文 &+#% ' },
};

async function fixture(servers: ServerRecord[] = [legacyServer]) {
  const memory = memoryStorage();
  const store = new Store(memory.env);
  const token = 'a'.repeat(64);
  await store.put('admin', { version: 'admin-v1' });
  await store.put(`session:${await digest(token)}`, {
    adminVersion: 'admin-v1',
    expires: Date.now() + 60_000,
  });
  const revision = await store.saveServers(servers);
  const headers = {
    Origin: 'https://libra.test',
    'Content-Type': 'application/json',
    'X-Libra-Request': '1',
    Cookie: `__Host-libra_session=${token}`,
  };
  const send = (body: string, options: RequestInit = {}) =>
    app.fetch(
      new Request('https://libra.test/api/servers/import', {
        method: 'POST',
        headers,
        body,
        ...options,
      }),
      memory.env,
    );
  return {
    ...memory,
    store,
    revision,
    headers,
    send,
    import: (configs: unknown, catalogRevision: unknown = revision) =>
      send(JSON.stringify({ configs, catalogRevision })),
  };
}

test('a single config imports as a new record with normalized lines and exact credentials', async (t) => {
  const f = await fixture();
  const writes = t.mock.method(f.kv, 'put');
  const input = {
    ...config,
    name: '  新媒体库  ',
    primary: { url: 'HTTPS://IMPORT.EXAMPLE.COM:443/emby/' },
    alternates: [{ url: 'https://import.example.com/emby' }, { url: 'http://[::1]:8096/' }],
  };
  const response = await f.import(input);
  assert.equal(response.status, 201);
  const result = (await response.json()) as ServerImportResult;
  assert.equal(result.servers.length, 1);
  const record = result.servers[0];
  assert.deepEqual(record.config, { ...config, alternates: [{ url: 'http://[::1]:8096' }] });
  assert.equal(record.enabled, true);
  assert.match(record.id, /^[a-f0-9-]{36}$/);
  assert.notEqual(record.id, legacyServer.id);
  assert.notEqual(result.catalogRevision, f.revision);
  assert.deepEqual(await f.store.servers(), [legacyServer, record]);
  assert.equal(writes.mock.callCount(), 1);
  assert.equal(writes.mock.calls[0].arguments[0], SERVER_CATALOG_KEY);
  assert.equal(f.values.get(SERVER_CATALOG_KEY)!.includes(config.credentials!.password!), false);
});

test('a public subscription array imports in its original order with exactly one catalog write', async (t) => {
  const f = await fixture();
  const slug = 'ImportRoundTrip1234';
  await f.store.saveServers([
    legacyServer,
    { ...legacyServer, id: 'second', config: { ...config, credentials: { password: '' } } },
    { ...legacyServer, id: 'disabled', enabled: false },
  ]);
  await f.store.put(`route:${await digest(slug)}`, { id: 'round-trip' });
  await f.store.put('sub:round-trip', {
    id: 'round-trip',
    slug,
    enabled: true,
    allServers: false,
    serverIds: ['second', legacyServer.id, 'disabled'],
  });
  const feed = await app.fetch(new Request(`https://libra.test/${slug}`), f.env);
  assert.equal(feed.status, 200);
  const configs = (await feed.json()) as ServerConfig[];
  assert.equal(configs.length, 2);
  const before = await f.store.serverCatalog();
  const writes = t.mock.method(f.kv, 'put');
  const response = await f.import(configs, before.revision);
  assert.equal(response.status, 201);
  const result = (await response.json()) as ServerImportResult;
  assert.deepEqual(
    result.servers.map((row) => row.config),
    configs,
  );
  assert.equal(new Set([...before.items, ...result.servers].map((row) => row.id)).size, 5);
  assert.deepEqual(await f.store.servers(), [...before.items, ...result.servers]);
  assert.equal(writes.mock.callCount(), 1);
});

test('all invalid rows are reported without echoing credentials or importing any valid rows', async (t) => {
  const f = await fixture();
  const before = new Map(f.values);
  const writes = t.mock.method(f.kv, 'put');
  const response = await f.import([
    config,
    { ...config, primary: { url: 'https://user:private-password@example.com' } },
    config,
    { ...config, type: 'unsupported' },
    { ...config, credentials: { password: 12345 } },
  ]);
  assert.equal(response.status, 400);
  const { error } = (await response.json()) as { error: string };
  assert.match(error, /整批未导入/);
  for (const index of [2, 4, 5]) assert.ok(error.includes(`第 ${index} 项：`));
  for (const index of [1, 3]) assert.ok(!error.includes(`第 ${index} 项：`));
  assert.ok(!error.includes('private-password'));
  assert.ok(!error.includes(config.credentials!.password!));
  assert.equal(writes.mock.callCount(), 0);
  assert.deepEqual(f.values, before);
});

test('empty arrays, scalars, missing fields, invalid JSON and oversized batches never write', async (t) => {
  const f = await fixture();
  const before = new Map(f.values);
  const writes = t.mock.method(f.kv, 'put');
  for (const input of [[], null, 'text', 42, {}, [config, null], [[config]], Array(201).fill(config)]) {
    assert.equal((await f.import(input)).status, 400, JSON.stringify(input).slice(0, 100));
  }
  assert.equal((await f.send('{')).status, 400);
  assert.equal((await f.send(JSON.stringify({ catalogRevision: f.revision }))).status, 400);
  assert.equal(writes.mock.callCount(), 0);
  assert.deepEqual(f.values, before);
});

test('200 valid configs larger than 128 KB import once, but exceeding the remaining capacity imports none', async (t) => {
  const f = await fixture([]);
  const configs = Array.from({ length: 200 }, (_, index) => ({
    ...config,
    name: `媒体库 ${index}`,
    note: '中'.repeat(500),
  }));
  assert.ok(new TextEncoder().encode(JSON.stringify(configs)).byteLength > 128 * 1024);
  const writes = t.mock.method(f.kv, 'put');
  const response = await f.import(configs);
  assert.equal(response.status, 201);
  const result = (await response.json()) as ServerImportResult;
  assert.equal(result.servers.length, 200);
  assert.equal(writes.mock.callCount(), 1);
  const full = new Map(f.values);
  assert.equal((await f.import(config, result.catalogRevision)).status, 400);
  assert.deepEqual(f.values, full);
  const revision = await f.store.saveServers(result.servers.slice(0, 199));
  const before = new Map(f.values);
  writes.mock.resetCalls();
  const tooMany = await f.import([config, config], revision);
  assert.equal(tooMany.status, 400);
  assert.match(((await tooMany.json()) as { error: string }).error, /当前已有 199 台，本次导入 2 台/);
  assert.equal(writes.mock.callCount(), 0);
  assert.deepEqual(f.values, before);
  assert.equal((await f.import(config, revision)).status, 201);
  assert.equal((await f.store.servers()).length, 200);
});

test('missing or stale catalog revisions reject the whole batch and a replay cannot duplicate records', async (t) => {
  const f = await fixture();
  const response = await f.import([config, config]);
  assert.equal(response.status, 201);
  const before = new Map(f.values);
  const writes = t.mock.method(f.kv, 'put');
  assert.equal((await f.import([config, config])).status, 409);
  assert.equal((await f.import(config, null)).status, 409);
  assert.equal((await f.send(JSON.stringify({ configs: [config] }))).status, 409);
  assert.equal(writes.mock.callCount(), 0);
  assert.deepEqual(f.values, before);
});

test('the import body limit and combined catalog size are enforced before writing', async (t) => {
  const f = await fixture();
  const writes = t.mock.method(f.kv, 'put');
  const before = new Map(f.values);
  const oversized = await f.send(' '.repeat(MAX_SERVER_IMPORT_BYTES) + '{}');
  assert.equal(oversized.status, 413);
  assert.match(((await oversized.json()) as { error: string }).error, /8 MiB/);
  assert.equal(writes.mock.callCount(), 0);
  assert.deepEqual(f.values, before);
  const largeConfig: ServerConfig = {
    ...config,
    alternates: Array.from({ length: 32 }, (_, index) => ({
      url: `https://line-${index}.example.com/${'a'.repeat(1350)}`,
    })),
  };
  const records = Array.from({ length: 100 }, (_, index) => ({
    ...legacyServer,
    id: `old-${index}`,
    config: largeConfig,
  }));
  const revision = await f.store.saveServers(records);
  const configs = Array(100).fill(largeConfig);
  assert.ok(
    new TextEncoder().encode(JSON.stringify({ configs, catalogRevision: revision })).byteLength <
      MAX_SERVER_IMPORT_BYTES,
  );
  const prior = new Map(f.values);
  writes.mock.resetCalls();
  const tooLarge = await f.import(configs, revision);
  assert.equal(tooLarge.status, 400);
  assert.match(((await tooLarge.json()) as { error: string }).error, /总大小不能超过 8 MiB/);
  assert.equal(writes.mock.callCount(), 0);
  assert.deepEqual(f.values, prior);
});

test('a throttled KV write leaves the original catalog intact for a full retry', async (t) => {
  const f = await fixture();
  const before = new Map(f.values);
  const writes = t.mock.method(f.kv, 'put', async () => {
    throw { status: 429 };
  });
  const response = await f.import([config, config]);
  assert.equal(response.status, 429);
  assert.equal(((await response.json()) as { code: string }).code, 'KV_WRITE_RATE_LIMIT');
  assert.equal(writes.mock.callCount(), 1);
  assert.deepEqual(f.values, before);
  writes.mock.restore();
  assert.equal((await f.import([config, config])).status, 201);
  assert.equal((await f.store.servers()).length, 3);
});

test('bulk import requires a signed-in same-origin JSON POST', async (t) => {
  const f = await fixture();
  const writes = t.mock.method(f.kv, 'put');
  const body = JSON.stringify({ configs: [config], catalogRevision: f.revision });
  assert.equal((await f.send(body, { headers: { ...f.headers, Cookie: '' } })).status, 401);
  assert.equal(
    (await f.send(body, { headers: { ...f.headers, Origin: 'https://other.example.com' } })).status,
    403,
  );
  assert.equal((await f.send(body, { headers: { ...f.headers, 'X-Libra-Request': '' } })).status, 403);
  assert.equal((await f.send(body, { headers: { ...f.headers, 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await f.send(body, { method: 'PUT' })).status, 405);
  assert.equal(writes.mock.callCount(), 0);
});
