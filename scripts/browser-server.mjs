import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

// Ephemeral local test server. No production KV, accounts, or secrets are used.
const bundled = await build({
  entryPoints: ['src/worker/index.ts'],
  bundle: true,
  write: false,
  platform: 'neutral',
  format: 'esm',
  target: 'es2022',
  external: ['node:crypto'],
});
const server = new Miniflare(
  convertV4MiniflareOptions({
    host: '127.0.0.1',
    port: 8789,
    modules: true,
    script: bundled.outputFiles[0].text,
    compatibilityDate: '2026-10-10',
    compatibilityFlags: ['nodejs_compat'],
    bindings: { APP_SECRET: 'local-browser-test-secret-not-for-production' },
    kvNamespaces: ['LIBRA_KV'],
    ratelimits: {
      AUTH_LIMITER: { namespace_id: '1', simple: { limit: 10, period: 60 } },
      PUBLIC_LIMITER: { namespace_id: '2', simple: { limit: 120, period: 60 } },
    },
  }),
);
console.log(`Browser test server ready at ${await server.ready}`);
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, async () => {
    await server.dispose();
    process.exit(0);
  });
