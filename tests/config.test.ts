import test from 'node:test';
import './helpers/webcrypto';
import assert from 'node:assert/strict';
import { baseURL, validateConfig, validatePassword, validateSlug } from '../src/shared/validation';
import { playerLink, PLAYERS } from '../src/shared/players';
import {
  seal,
  unseal,
  hashPassword,
  checkPassword,
  StorageDecryptionError,
  StorageFormatError,
} from '../src/worker/crypto';

const config = {
  type: 'emby',
  name: '  家庭媒体库  ',
  note: ' 家庭影音 ',
  logo: 'https://example.com/logo.png',
  credentials: { username: ' demo ', password: ' 中文 &+#% password ' },
  primary: { url: 'https://MEDIA.example.com:443/emby/', name: ' 主线路 ' },
  alternates: [{ url: 'http://192.168.1.10:8096', name: '家中直连' }, { url: 'http://[fd00::1]:8096/emby' }],
};
test('configuration trims display fields and normalizes addresses, never passwords', () => {
  const result = validateConfig(config);
  assert.equal(result.name, '家庭媒体库');
  assert.equal(result.primary.url, 'https://media.example.com/emby');
  assert.equal(result.primary.name, '主线路');
  assert.equal(result.credentials?.username, 'demo');
  assert.equal(result.credentials?.password, config.credentials.password);
  assert.equal(result.alternates?.[1].url, 'http://[fd00::1]:8096/emby');
});
test('omitted passwords and explicit empty passwords remain distinct', () => {
  const omitted = validateConfig({ ...config, credentials: { username: 'demo' } });
  const empty = validateConfig({ ...config, credentials: { password: '' } });
  assert.equal(Object.hasOwn(omitted.credentials!, 'password'), false);
  assert.equal(empty.credentials?.password, '');
  for (const value of [omitted, empty]) {
    const url = new URL(playerLink('libra', value).url);
    const decoded = JSON.parse(Buffer.from(url.searchParams.get('data')!, 'base64url').toString('utf8'));
    assert.deepEqual(decoded.credentials, value.credentials);
  }
});
test('Libra v1 preserves UTF-8 and multi-line configuration, excludes logos', () => {
  const validated = validateConfig(config);
  const url = new URL(playerLink('libra', validated).url);
  assert.equal(url.protocol, 'libra:');
  assert.equal(url.host, 'import');
  assert.equal(url.pathname, '/server');
  assert.equal(url.searchParams.get('v'), '1');
  const encoded = url.searchParams.get('data')!;
  assert.match(encoded, /^[A-Za-z0-9_-]+$/);
  const decoded = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  const { logo, ...payload } = validated;
  assert.deepEqual(decoded, payload);
  assert.equal(decoded.credentials!.password, config.credentials.password);
});
test('the other four player links preserve credentials after one query decode', () => {
  const validated = validateConfig({ ...config, primary: { url: 'http://[fd00::1]:8096' } });
  for (const player of PLAYERS.filter((item) => item.id !== 'libra')) {
    const result = playerLink(player.id, validated);
    assert.ok(result.url, player.id);
    const url = new URL(result.url);
    assert.equal(url.searchParams.get('password'), config.credentials.password, player.id);
    assert.equal(url.searchParams.get('username'), 'demo');
    assert.equal(url.searchParams.get('type'), 'emby');
  }
  const sen = new URL(playerLink('senplayer', validated).url);
  assert.equal(sen.host, 'importserver');
  assert.equal(sen.searchParams.get('address1'), 'http://192.168.1.10:8096');
  assert.equal(sen.searchParams.get('address1name'), '家中直连');
  const eplayer = new URL(playerLink('eplayerx', validated).url);
  assert.equal(
    eplayer.searchParams.get('backupHref'),
    'http://192.168.1.10:8096;家中直连,http://[fd00::1]:8096/emby;',
  );
  for (const player of ['hills', 'rodelplayer'] as const) {
    const url = new URL(playerLink(player, validated).url);
    assert.equal(url.searchParams.get('host'), '[fd00::1]');
    assert.equal(url.searchParams.get('port'), '8096');
    assert.equal(url.searchParams.get('scheme'), 'http');
    assert.equal(playerLink(player, validateConfig(config)).url, '');
  }
});
test('ambiguous ePlayerX backup separators are not silently corrupted', () => {
  const value = validateConfig({ ...config, alternates: [{ url: 'http://example.com', name: 'a,b' }] });
  assert.equal(playerLink('eplayerx', value).url, '');
  assert.ok(playerLink('eplayerx', value).warning);
});
test('reject invalid endpoints; allow LAN, IPv6, proxy paths and encoded whitespace', () => {
  for (const value of [
    'https://user:pass@example.com',
    'http://@example.com',
    'http://example.com?q=x',
    'http://example.com#x',
    'http://example.com?',
    'http://example.com#',
    'http://example.com/a b',
    'http://example.com\n',
    'http://example.com:0',
    'http://example.com:65536',
    'http://example.com:',
    'http://example.com\\evil',
    'ftp://example.com',
    'javascript:alert(1)',
    '//example.com',
    'https://',
  ])
    assert.throws(() => baseURL(value), value);
  assert.equal(baseURL('http://192.168.1.1:1/path'), 'http://192.168.1.1:1/path');
  assert.equal(baseURL('https://[::1]:65535/emby'), 'https://[::1]:65535/emby');
  assert.equal(baseURL('http://example.com/base%20path'), 'http://example.com/base%20path');
});
test('deduplicate normalized routes while keeping first occurrence and priority', () => {
  const result = validateConfig({
    ...config,
    alternates: [
      { url: 'https://media.example.com/emby' },
      { url: 'http://example.com:80/', name: 'first' },
      { url: 'http://EXAMPLE.com', name: 'second' },
      { url: 'http://example.net', name: 'third' },
    ],
  });
  assert.deepEqual(result.alternates, [
    { url: 'http://example.com', name: 'first' },
    { url: 'http://example.net', name: 'third' },
  ]);
  assert.throws(() =>
    validateConfig({
      ...config,
      alternates: Array.from({ length: 33 }, () => ({ url: 'http://example.com' })),
    }),
  );
});
test('strong admin passwords and alphanumeric slugs', () => {
  for (const password of ['Aa1!abc', 'abcdefgh1', '12345678!', 'Abcdefgh ', 'a'.repeat(129) + '1!'])
    assert.throws(() => validatePassword(password));
  assert.equal(validatePassword('Abc123! '), 'Abc123! ');
  for (const slug of ['12345678', 'abcdefgh', 'ABCDef123456']) assert.equal(validateSlug(slug), slug);
  for (const slug of ['1234567', 'with-dash', 'with_under', 'abcdefgh/', 'a'.repeat(65)])
    assert.throws(() => validateSlug(slug));
});
test('encrypted data is authenticated and tied to both secret and KV key', async () => {
  const encrypted = await seal('secret-1', 'server:1', config);
  assert.equal(encrypted.includes('demo'), false);
  assert.equal(encrypted.includes(config.credentials.password), false);
  assert.deepEqual(await unseal('secret-1', 'server:1', encrypted), config);
  assert.equal(JSON.parse(encrypted).v, 2);
  await assert.rejects(unseal('secret-2', 'server:1', encrypted), StorageDecryptionError);
  await assert.rejects(unseal('secret-1', 'server:2', encrypted), StorageDecryptionError);
  const tampered = JSON.parse(encrypted);
  tampered.data = `${tampered.data[0] === 'A' ? 'B' : 'A'}${tampered.data.slice(1)}`;
  await assert.rejects(unseal('secret-1', 'server:1', JSON.stringify(tampered)));
});
test('Logo URLs require HTTPS and cannot embed credentials', () => {
  for (const logo of ['http://example.com/logo.png', 'https://user:pass@example.com/a', 'data:image/png,a'])
    assert.throws(() => validateConfig({ ...config, logo }));
});
test('invalid ciphertext is reported separately from authenticated-decryption failure', async () => {
  for (const value of ['broken', 'null', '{"v":3}', '{"v":1,"iv":"zz","data":"00"}'])
    await assert.rejects(unseal('secret', 'admin', value), StorageFormatError);
});
test('password hashing uses independent salts and a deployment-secret pepper', async () => {
  const first = await hashPassword('Abcd1234!', 'secret');
  const second = await hashPassword('Abcd1234!', 'secret');
  assert.notEqual(first.salt, second.salt);
  assert.notEqual(first.hash, second.hash);
  assert.equal(await checkPassword('Abcd1234!', 'secret', first), true);
  assert.equal(await checkPassword('Abcd1234! ', 'secret', first), false);
  assert.equal(await checkPassword('Abcd1234!', 'other-secret', first), false);
});
