import { timingSafeEqual } from 'node:crypto';

const encoder = new TextEncoder();
const bytes = (value: string) => encoder.encode(value);
const hex = (value: ArrayBuffer | Uint8Array) =>
  Array.from(new Uint8Array(value), (b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (value: string) => Uint8Array.from(value.match(/.{2}/g) ?? [], (b) => parseInt(b, 16));
export const random = (length = 24) => hex(crypto.getRandomValues(new Uint8Array(length)));
export const digest = async (value: string) => hex(await crypto.subtle.digest('SHA-256', bytes(value)));
export async function equal(a: string, b: string): Promise<boolean> {
  return timingSafeEqual(unhex(await digest(a)), unhex(await digest(b)));
}
async function encryptionKey(secret: string) {
  const raw = await crypto.subtle.digest('SHA-256', bytes(`libra:encryption:v1:${secret}`));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function seal(secret: string, key: string, value: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: bytes(key) },
    await encryptionKey(secret),
    bytes(JSON.stringify(value)),
  );
  return JSON.stringify({ v: 1, iv: hex(iv), data: hex(encrypted) });
}
export async function unseal<T>(secret: string, key: string, value: string): Promise<T> {
  const envelope = JSON.parse(value);
  if (envelope.v !== 1) throw new Error('Unsupported storage envelope');
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: unhex(envelope.iv), additionalData: bytes(key) },
    await encryptionKey(secret),
    unhex(envelope.data),
  );
  return JSON.parse(new TextDecoder().decode(decrypted)) as T;
}
export interface PasswordHash {
  salt: string;
  hash: string;
  iterations: number;
}
export async function hashPassword(
  password: string,
  secret: string,
  salt = random(16),
  iterations = 100_000,
): Promise<PasswordHash> {
  const pepperKey = await crypto.subtle.importKey(
    'raw',
    bytes(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const peppered = await crypto.subtle.sign('HMAC', pepperKey, bytes(`libra:password:v1:${password}`));
  const material = await crypto.subtle.importKey('raw', peppered, 'PBKDF2', false, ['deriveBits']);
  const hash = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: unhex(salt), iterations, hash: 'SHA-256' },
    material,
    256,
  );
  return { salt, hash: hex(hash), iterations };
}
export async function checkPassword(
  password: string,
  secret: string,
  stored: PasswordHash,
): Promise<boolean> {
  const candidate = await hashPassword(password, secret, stored.salt, stored.iterations);
  return equal(candidate.hash, stored.hash);
}
