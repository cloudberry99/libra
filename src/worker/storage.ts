import { seal, unseal } from './crypto';
import type { IconLibrary, ServerRecord } from '../shared/types';
import { InputError } from '../shared/validation';
import { defaultIconLibraries, ICON_LIBRARIES_KEY } from './icon-libraries';

export const SERVER_CATALOG_KEY = 'catalog:servers:v1';
export class StorageBusyError extends Error {
  name = 'StorageBusyError';
}

export class Store {
  constructor(private env: Env) {}
  async iconLibraries(): Promise<IconLibrary[]> {
    const saved = await this.get<IconLibrary[]>(ICON_LIBRARIES_KEY);
    // An empty list means the user removed every library; never re-seed it.
    if (saved !== null) return saved;
    const defaults = defaultIconLibraries();
    await this.put(ICON_LIBRARIES_KEY, defaults);
    return defaults;
  }
  async get<T>(key: string): Promise<T | null> {
    const value = await this.env.LIBRA_KV.get(key);
    return value === null ? null : unseal<T>(this.env.APP_SECRET, key, value);
  }
  async put(key: string, value: unknown, ttl?: number): Promise<void> {
    const encrypted = await seal(this.env.APP_SECRET, key, value);
    try {
      await this.env.LIBRA_KV.put(key, encrypted, ttl ? { expirationTtl: ttl } : undefined);
    } catch (error) {
      // KV allows only one write per key per second. Do not retry a stale snapshot.
      if (error instanceof Error && /KV PUT failed: 429\b/.test(error.message)) throw new StorageBusyError();
      throw error;
    }
  }
  async delete(key: string): Promise<void> {
    await this.env.LIBRA_KV.delete(key);
  }
  async keys(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.env.LIBRA_KV.list({ prefix, cursor, limit: 1000 });
      keys.push(...page.keys.map((key) => key.name));
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);
    return keys;
  }
  async count(prefix: string): Promise<number> {
    return (await this.keys(prefix)).length;
  }
  async getMany<T>(keys: string[]): Promise<(T | null)[]> {
    const rows: (T | null)[] = [];
    // Bulk reads reduce round trips; Cloudflare still bills one read per key.
    for (let offset = 0; offset < keys.length; offset += 100) {
      const batch = keys.slice(offset, offset + 100);
      const values = await this.env.LIBRA_KV.get(batch);
      rows.push(
        ...(await Promise.all(
          batch.map((key) => {
            const value = values.get(key);
            return value == null ? null : unseal<T>(this.env.APP_SECRET, key, value);
          }),
        )),
      );
    }
    return rows;
  }
  async list<T>(prefix: string): Promise<T[]> {
    return (await this.getMany<T>(await this.keys(prefix))).filter((row): row is T => row !== null);
  }
  async servers(migrate = false): Promise<ServerRecord[]> {
    const catalog = await this.get<ServerRecord[]>(SERVER_CATALOG_KEY);
    // An empty catalog is authoritative too: never resurrect deleted legacy rows.
    if (catalog !== null) return catalog;
    const legacy = await this.list<ServerRecord>('server:');
    // Only authenticated admin loads migrate. Public requests remain read-only.
    // Leave legacy ciphertext untouched as an upgrade backup; it is no longer read
    // once the catalog exists. Like all KV mutations, migration assumes one writer.
    if (migrate) await this.saveServers(legacy);
    return legacy;
  }
  async saveServers(servers: ServerRecord[]): Promise<void> {
    // Leave ample headroom under KV's 25 MiB value and Workers' memory limits,
    // including Base64 encryption overhead and temporary serialization buffers.
    if (new TextEncoder().encode(JSON.stringify(servers)).byteLength > 8 * 1024 * 1024)
      throw new InputError('服务器配置总大小不能超过 8 MiB，请缩短过长的备注或线路地址');
    await this.put(SERVER_CATALOG_KEY, servers);
  }
}
