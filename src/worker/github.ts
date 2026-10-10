import { InputError } from '../shared/validation';

export const GITHUB_SETTINGS_KEY = 'settings:github:v1';
export interface GitHubSettings {
  token?: string;
  version: string;
  updatedAt: string;
}

export function validateGitHubToken(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_]{20,255}$/.test(value.trim()))
    throw new InputError('请填写有效的 GitHub Token，不能包含空白或换行');
  return value.trim();
}

export function isGitHubContentAPI(url: URL): boolean {
  return (
    url.origin === 'https://api.github.com' &&
    !url.username &&
    !url.password &&
    /^\/(?:repos\/[^/]+\/[^/]+|repositories\/[1-9]\d*)\/contents\/.+/.test(url.pathname)
  );
}

/** Map public raw/blob URLs to the read-only GitHub contents API. */
export function githubContentURL(source: string): string | null {
  const url = new URL(source);
  if (isGitHubContentAPI(url)) return url.href;
  if (!['raw.githubusercontent.com', 'github.com'].includes(url.hostname)) return null;
  const parts = url.pathname.slice(1).split('/');
  const [owner, repo] = parts;
  if (!owner || !repo || !/^[A-Za-z0-9_.-]+$/.test(owner + repo)) return null;
  let rest = parts.slice(2);
  if (url.hostname === 'github.com') {
    if (!['blob', 'raw'].includes(rest[0])) return null;
    rest = rest.slice(1);
  }
  if (rest[0] === 'refs' && ['heads', 'tags'].includes(rest[1])) rest = rest.slice(2);
  const [ref, ...path] = rest;
  if (!ref || !path.length || path.some((part) => !part)) return null;
  try {
    const target = new URL(`https://api.github.com/repos/${owner}/${repo}/contents/${path.join('/')}`);
    target.searchParams.set('ref', decodeURIComponent(ref));
    return isGitHubContentAPI(target) ? target.href : null;
  } catch {
    return null;
  }
}

export function githubRequestHeaders(url: string, token?: string): Record<string, string> {
  if (!isGitHubContentAPI(new URL(url))) return { Accept: 'application/json' };
  return {
    Accept: 'application/vnd.github.raw+json',
    'User-Agent': 'Libra-Icon-Libraries',
    'X-GitHub-Api-Version': '2026-03-10',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}
