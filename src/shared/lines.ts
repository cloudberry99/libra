import type { Endpoint } from './types';
import { baseURL } from './validation';

export function newAlternateLines(
  primary: Endpoint,
  existing: Endpoint[],
  discovered: Endpoint[],
): Endpoint[] {
  const seen = new Set([baseURL(primary.url)]);
  for (const line of existing) {
    try {
      seen.add(baseURL(line.url));
    } catch {
      /* Keep unfinished manual rows in the form. */
    }
  }
  return discovered.filter((line) => {
    const url = baseURL(line.url);
    if (seen.has(url)) return false;
    seen.add(url);
    return true;
  });
}
