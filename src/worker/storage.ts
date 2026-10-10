import { seal, unseal } from './crypto';

export class Store {
  constructor(private env: Env) {}
  async get<T>(key: string): Promise<T | null> {
    const value = await this.env.LIBRA_KV.get(key);
    return value === null ? null : unseal<T>(this.env.APP_SECRET, key, value);
  }
  async put(key: string, value: unknown, ttl?: number): Promise<void> {
    await this.env.LIBRA_KV.put(
      key,
      await seal(this.env.APP_SECRET, key, value),
      ttl ? { expirationTtl: ttl } : undefined,
    );
  }
  async delete(key: string): Promise<void> {
    await this.env.LIBRA_KV.delete(key);
  }
  async list<T>(prefix: string): Promise<T[]> {
    const values: T[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.env.LIBRA_KV.list({ prefix, cursor, limit: 1000 });
      // Keep reads bounded instead of opening hundreds of operations at once.
      for (let offset = 0; offset < page.keys.length; offset += 16) {
        const rows = await Promise.all(
          page.keys.slice(offset, offset + 16).map((key) => this.get<T>(key.name)),
        );
        for (const row of rows) if (row !== null) values.push(row as T);
      }
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);
    return values;
  }
}
