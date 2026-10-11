import test from 'node:test';
import assert from 'node:assert/strict';
import './helpers/webcrypto';
import app from '../src/worker/index';
import { digest } from '../src/worker/crypto';
import { Store, SERVER_CATALOG_KEY } from '../src/worker/storage';
import { mergeVisibleOrder } from '../src/shared/server-order';
import type { DashboardData, ServerOrderResult } from '../src/shared/types';
import { legacySeal, legacyServer, memoryStorage } from './helpers/storage';

async function fixture() {
  const memory = memoryStorage();
  const store = new Store(memory.env);
  await store.put('admin', { version: 'admin-order-v1' });
  const token = 'b'.repeat(64);
  await store.put(`session:${await digest(token)}`, {
    adminVersion: 'admin-order-v1',
    expires: Date.now() + 60_000,
  });
  const headers = {
    Origin: 'https://libra.test',
    'Content-Type': 'application/json',
    'X-Libra-Request': '1',
    Cookie: `__Host-libra_session=${token}`,
  };
  const servers = [1, 2, 3].map((index) => ({
    ...legacyServer,
    id: `${index}`.repeat(8) + '-1111-4111-8111-111111111111',
    enabled: index !== 2,
    config: { ...legacyServer.config, name: `排序 ${index}` },
    createdAt: `2026-10-0${index}T00:00:00.000Z`,
  }));
  const revision = await store.saveServers(servers);
  const ids = servers.map((server) => server.id);
  const request = (path: string, method = 'GET', body?: unknown, overrides?: RequestInit) =>
    app.fetch(
      new Request(`https://libra.test${path}`, {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        ...overrides,
      }),
      memory.env,
    );
  return {
    ...memory,
    store,
    headers,
    servers,
    ids,
    revision,
    request,
    order: (serverIds: unknown, catalogRevision: unknown = revision) =>
      request('/api/servers/order', 'PUT', { serverIds, catalogRevision }),
  };
}

test('reordering writes one catalog, preserves every record, and orders dashboard and both kinds of feeds', async (t) => {
  const f = await fixture();
  for (const [slug, allServers] of [
    ['SortedAll1234', true],
    ['SortedSelected1234', false],
  ] as const) {
    await f.store.put(`route:${await digest(slug)}`, { id: slug });
    await f.store.put(`sub:${slug}`, {
      id: slug,
      slug,
      enabled: true,
      allServers,
      serverIds: [...f.ids, 'deleted', f.ids[0]],
      createdAt: '2026-10-01T00:00:00.000Z',
    });
  }
  const writes = t.mock.method(f.kv, 'put');
  const order = [f.ids[2], f.ids[0], f.ids[1]];
  const response = await f.order(order);
  assert.equal(response.status, 200);
  const result = (await response.json()) as ServerOrderResult;
  assert.deepEqual(result.serverIds, order);
  assert.notEqual(result.catalogRevision, f.revision);
  assert.equal(writes.mock.callCount(), 1);
  assert.equal(writes.mock.calls[0].arguments[0], SERVER_CATALOG_KEY);
  assert.deepEqual(await f.store.servers(), [f.servers[2], f.servers[0], f.servers[1]]);
  const dashboard = (await (await f.request('/api/dashboard')).json()) as DashboardData;
  assert.deepEqual(
    dashboard.servers.map((row) => row.id),
    order,
  );
  assert.equal(dashboard.revisions.servers, result.catalogRevision);
  for (const slug of ['SortedAll1234', 'SortedSelected1234']) {
    assert.deepEqual(await (await f.request(`/${slug}`)).json(), [f.servers[2].config, f.servers[0].config]);
  }
});

test('an order cannot omit, duplicate, invent or inject server records, including disabled records', async (t) => {
  const f = await fixture();
  const before = new Map(f.values);
  const writes = t.mock.method(f.kv, 'put');
  for (const ids of [
    undefined,
    null,
    {},
    '123',
    [],
    f.ids.slice(0, 2),
    [f.ids[0], f.ids[0], f.ids[2]],
    [f.ids[0], f.ids[2], 'unknown'],
    [f.ids[0], f.ids[2], { id: f.ids[1] }],
    [...f.ids, f.ids[0]],
  ]) {
    assert.equal((await f.order(ids)).status, 400);
  }
  assert.equal(writes.mock.callCount(), 0);
  assert.deepEqual(f.values, before);
});

test('unchanged and empty orders do not consume a KV write or change the catalog revision', async (t) => {
  const f = await fixture();
  const writes = t.mock.method(f.kv, 'put');
  const result = (await (await f.order(f.ids)).json()) as ServerOrderResult;
  assert.equal(result.catalogRevision, f.revision);
  assert.equal(writes.mock.callCount(), 0);
  const emptyRevision = await f.store.saveServers([]);
  writes.mock.resetCalls();
  assert.deepEqual(await (await f.order([], emptyRevision)).json(), {
    serverIds: [],
    catalogRevision: emptyRevision,
  });
  assert.equal(writes.mock.callCount(), 0);
});

test('stale and missing revisions cannot overwrite a newer order', async (t) => {
  const f = await fixture();
  assert.equal((await f.order([...f.ids].reverse())).status, 200);
  const before = new Map(f.values);
  const writes = t.mock.method(f.kv, 'put');
  assert.equal((await f.order(f.ids)).status, 409);
  assert.equal((await f.order(f.ids, null)).status, 409);
  assert.equal((await f.request('/api/servers/order', 'PUT', { serverIds: f.ids })).status, 409);
  assert.equal(writes.mock.callCount(), 0);
  assert.deepEqual(f.values, before);
});

test('edits, toggles, new imports and deletes preserve the saved relative order', async () => {
  const f = await fixture();
  await f.order([f.ids[2], f.ids[0], f.ids[1]]);
  let catalog = await f.store.serverCatalog();
  assert.equal(
    (
      await f.request(`/api/servers/${f.ids[0]}`, 'PUT', {
        version: f.servers[0].version,
        catalogRevision: catalog.revision,
        config: { ...f.servers[0].config, name: '改名' },
      })
    ).status,
    200,
  );
  catalog = await f.store.serverCatalog();
  assert.equal(
    (
      await f.request(`/api/servers/${f.ids[1]}`, 'PUT', {
        version: f.servers[1].version,
        catalogRevision: catalog.revision,
        enabled: true,
      })
    ).status,
    200,
  );
  catalog = await f.store.serverCatalog();
  assert.equal(
    (
      await f.request('/api/servers/import', 'POST', {
        catalogRevision: catalog.revision,
        configs: [legacyServer.config, legacyServer.config],
      })
    ).status,
    201,
  );
  catalog = await f.store.serverCatalog();
  assert.deepEqual(
    catalog.items.slice(0, 3).map((item) => item.id),
    [f.ids[2], f.ids[0], f.ids[1]],
  );
  const expected = catalog.items.filter((item) => item.id !== f.ids[0]).map((item) => item.id);
  const edited = catalog.items.find((item) => item.id === f.ids[0])!;
  assert.equal(
    (
      await f.request(`/api/servers/${edited.id}`, 'DELETE', {
        version: edited.version,
        catalogRevision: catalog.revision,
      })
    ).status,
    200,
  );
  assert.deepEqual(
    (await f.store.servers()).map((item) => item.id),
    expected,
  );
});

test('a failed order write preserves the old order and remains retryable', async (t) => {
  const f = await fixture();
  const before = new Map(f.values);
  const writes = t.mock.method(f.kv, 'put', async () => {
    throw { status: 429 };
  });
  assert.equal((await f.order([...f.ids].reverse())).status, 429);
  assert.deepEqual(f.values, before);
  assert.equal(writes.mock.callCount(), 1);
  writes.mock.restore();
  assert.equal((await f.order([...f.ids].reverse())).status, 200);
});

test('ordering requires authentication, same origin and a JSON PUT', async (t) => {
  const f = await fixture();
  const writes = t.mock.method(f.kv, 'put');
  const body = { serverIds: [...f.ids].reverse(), catalogRevision: f.revision };
  for (const [headers, status] of [
    [{ ...f.headers, Cookie: '' }, 401],
    [{ ...f.headers, Origin: 'https://other.example.com' }, 403],
    [{ ...f.headers, 'X-Libra-Request': '' }, 403],
    [{ ...f.headers, 'Content-Type': 'text/plain' }, 415],
  ] as const) {
    assert.equal((await f.request('/api/servers/order', 'PUT', body, { headers })).status, status);
  }
  assert.equal((await f.request('/api/servers/order', 'POST', body)).status, 405);
  assert.equal(writes.mock.callCount(), 0);
});

test('legacy records retain chronological order on read, then an explicit order becomes authoritative', async (t) => {
  const f = await fixture();
  f.values.delete(SERVER_CATALOG_KEY);
  const old = [f.servers[2], f.servers[0], f.servers[1]].map((server, index) => ({
    ...server,
    id: f.ids[index],
  }));
  for (const row of old)
    f.values.set(`server:${row.id}`, legacySeal(f.env.APP_SECRET, `server:${row.id}`, row));
  const writes = t.mock.method(f.kv, 'put');
  const catalog = await f.store.serverCatalog();
  assert.deepEqual(
    catalog.items.map((item) => item.config.name),
    ['排序 1', '排序 2', '排序 3'],
  );
  assert.equal(writes.mock.callCount(), 0);
  const ids = catalog.items.map((item) => item.id).reverse();
  assert.equal((await f.order(ids, catalog.revision)).status, 200);
  assert.deepEqual(
    (await new Store(f.env).servers()).map((item) => item.id),
    ids,
  );
  assert.equal(writes.mock.callCount(), 1);
});

test('reordering filtered results keeps hidden records at their original positions', () => {
  const ids = ['a', 'hidden-1', 'b', 'hidden-2', 'c'];
  assert.deepEqual(mergeVisibleOrder(ids, ['c', 'a', 'b']), ['c', 'hidden-1', 'a', 'hidden-2', 'b']);
  assert.deepEqual(mergeVisibleOrder(ids, ['c']), ids);
  assert.deepEqual(mergeVisibleOrder(ids, []), ids);
});
