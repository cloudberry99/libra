import { InputError } from './validation';

/** An order is a permutation, never a way to add, update or remove records. */
export function applyServerOrder<T extends { id: string }>(servers: T[], ids: unknown): T[] {
  if (
    !Array.isArray(ids) ||
    ids.length !== servers.length ||
    ids.some((id) => typeof id !== 'string') ||
    new Set(ids).size !== ids.length
  )
    throw new InputError('排序必须包含全部服务器，且不能重复或遗漏');
  const records = new Map(servers.map((server) => [server.id, server]));
  return ids.map((id) => {
    const server = records.get(id);
    if (!server) throw new InputError('排序包含不存在的服务器，请刷新后重试');
    return server;
  });
}

/** Keep hidden records in their slots when reordering search/filter results. */
export function mergeVisibleOrder(allIds: string[], visibleIds: string[]): string[] {
  const visible = new Set(visibleIds);
  let index = 0;
  return allIds.map((id) => (visible.has(id) ? visibleIds[index++] : id));
}
