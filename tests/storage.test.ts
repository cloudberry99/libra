import test from 'node:test';
import assert from 'node:assert/strict';
import './helpers/webcrypto';
import { digest, seal, unseal } from '../src/worker/crypto';
import { Store, SERVER_CATALOG_KEY } from '../src/worker/storage';
import app from '../src/worker/index';
import { legacySeal, legacyServer, memoryStorage } from './helpers/storage';

test('v1 data migrates without changing credentials; deleting all servers never restores legacy records', async () => {
  const { env, values, reads, lists } = memoryStorage();
  const key = `server:${legacyServer.id}`;
  const legacy = legacySeal(env.APP_SECRET, key, legacyServer);
  values.set(key, legacy);
  assert.deepEqual(await unseal(env.APP_SECRET, key, legacy), legacyServer);
  const store = new Store(env);
  assert.deepEqual(await store.servers(), [legacyServer]);
  assert.equal(values.has(SERVER_CATALOG_KEY), false, 'public reads cannot migrate');
  assert.deepEqual(await store.servers(true), [legacyServer]);
  assert.equal(JSON.parse(values.get(SERVER_CATALOG_KEY)!).v, 2);
  assert.equal(values.get(key), legacy, 'preserve the encrypted upgrade backup');
  reads.length = 0;
  lists.length = 0;
  assert.deepEqual(await store.servers(), [legacyServer]);
  assert.deepEqual(reads, [[SERVER_CATALOG_KEY]]);
  assert.deepEqual(lists, []);
  await store.saveServers([]);
  assert.deepEqual(await store.servers(true), []);
});

test('counts never fetch/decrypt values, and list uses batches of at most 100 with pagination', async () => {
  const { env, values, reads, lists } = memoryStorage();
  const store = new Store(env);
  for (let index = 0; index < 205; index++) values.set(`sub:${index}`, 'deliberately not ciphertext');
  assert.equal(await store.count('sub:'), 205);
  assert.equal(reads.length, 0);
  assert.equal(lists.length, 2);
  for (const key of values.keys()) values.set(key, await seal(env.APP_SECRET, key, { key }));
  const rows = await store.list<{ key: string }>('sub:');
  assert.equal(rows.length, 205);
  assert.deepEqual(
    reads.map((batch) => batch.length),
    [100, 100, 5],
  );
  assert.equal(new Set(rows.map((row) => row.key)).size, 205);
});

test('public feeds use exactly three KV reads for 200 servers and retain selected-server order', async () => {
  const { env, values, reads, lists } = memoryStorage();
  const store = new Store(env);
  const servers = Array.from({ length: 200 }, (_, i) => ({
    ...legacyServer,
    id: `server-${i}`,
    enabled: i !== 0,
    config: { ...legacyServer.config, name: `Server ${i}` },
  }));
  await store.saveServers(servers);
  const slug = 'ReadQuotaTest1234';
  const sub = { id: 'subscription', slug, enabled: true, allServers: true, serverIds: [] as string[] };
  await store.put(`route:${await digest(slug)}`, { id: sub.id });
  await store.put(`sub:${sub.id}`, sub);
  // A hidden legacy row must never leak into the authoritative catalog.
  values.set('server:legacy', legacySeal(env.APP_SECRET, 'server:legacy', legacyServer));
  const response = await app.fetch(new Request(`https://libra.test/${slug}`), env);
  assert.equal(response.status, 200);
  assert.equal(((await response.json()) as unknown[]).length, 199);
  assert.equal(reads.flat().length, 3);
  assert.equal(lists.length, 0);
  await store.put(`sub:${sub.id}`, {
    ...sub,
    allServers: false,
    serverIds: ['server-199', 'deleted', 'server-1', 'server-0'],
  });
  reads.length = 0;
  const selected = await app.fetch(new Request(`https://libra.test/${slug}`), env);
  assert.deepEqual(
    ((await selected.json()) as { name: string }[]).map((row) => row.name),
    ['Server 199', 'Server 1'],
  );
  assert.equal(reads.flat().length, 3);
});

test('HKDF keys are reused within an isolate, but different secrets derive different keys', async (t) => {
  const derive = t.mock.method(crypto.subtle, 'deriveKey');
  const secret = `cache-test-${crypto.randomUUID()}`;
  const encrypted = await seal(secret, 'key', { value: 1 });
  await seal(secret, 'another-key', { value: 2 });
  await unseal(secret, 'key', encrypted);
  assert.equal(derive.mock.callCount(), 1);
  await seal(`${secret}-other`, 'key', { value: 1 });
  assert.equal(derive.mock.callCount(), 2);
});

test('a changed deployment secret produces actionable status errors and sanitized logs', async (t) => {
  const { env, values } = memoryStorage();
  const encrypted = await seal('original-deployment-secret-do-not-log', 'admin', {
    password: 'private-credential',
  });
  values.set('admin', encrypted);
  const logs = t.mock.method(console, 'error', () => {});
  const response = await app.fetch(new Request('https://libra.test/api/status?secret=do-not-log'), env);
  assert.equal(response.status, 503);
  assert.match(response.headers.get('Cache-Control')!, /no-store/);
  const result = (await response.json()) as { code: string; error: string };
  assert.equal(result.code, 'DEPLOYMENT_KEY_MISMATCH');
  assert.match(result.error, /部署密钥与已有数据不匹配/);
  assert.match(result.error, /APP_SECRET/);
  assert.deepEqual(JSON.parse(logs.mock.calls[0].arguments[0]), {
    event: 'request_failed',
    status: 503,
    name: 'StorageDecryptionError',
    route: 'status',
  });
  assert.equal(values.get('admin'), encrypted);
  // Public-route diagnostics cannot include the bearer suffix, even on 500s.
  const slug = 'privateBearerSuffix123';
  values.set(`route:${await digest(slug)}`, 'broken-json-with-a-password');
  const failed = await app.fetch(new Request(`https://libra.test/${slug}`), env);
  assert.equal(failed.status, 500);
  assert.deepEqual(JSON.parse(logs.mock.calls[1].arguments[0]), {
    event: 'request_failed',
    status: 500,
    name: 'StorageFormatError',
    route: 'public_feed',
  });
});

test('KV write throttling has a short, recoverable retry message', async (t) => {
  const { env, kv } = memoryStorage();
  t.mock.method(kv, 'put', async () => {
    throw new Error('KV PUT failed: 429 Too Many Requests');
  });
  const response = await app.fetch(
    new Request('https://libra.test/api/auth/setup', {
      method: 'POST',
      headers: { Origin: 'https://libra.test', 'Content-Type': 'application/json', 'X-Libra-Request': '1' },
      body: JSON.stringify({ setupKey: env.APP_SECRET, password: 'StrongPass123!' }),
    }),
    env,
  );
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('Retry-After'), '1');
  assert.match(((await response.json()) as { error: string }).error, /保存过于频繁/);
});
