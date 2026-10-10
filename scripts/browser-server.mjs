import { createTestWorker } from './test-runtime.mjs';

const server = await createTestWorker({ port: 8789, secret: 'local-browser-test-secret-not-for-production' });
console.log(`Browser test server ready at ${await server.ready}`);
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, async () => {
    await server.dispose();
    process.exit(0);
  });
