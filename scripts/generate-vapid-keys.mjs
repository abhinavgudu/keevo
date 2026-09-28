// Generate a VAPID key pair for Web Push and write it into .env.local.
//
//   node scripts/generate-vapid-keys.mjs
//
// Re-running with existing keys is a no-op, so it is safe to call again after
// pulling someone else's .env.local: it only fills in what is missing. Pass
// --force to rotate, which invalidates every existing push subscription because
// a subscription is bound to the key pair that created it.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import webpush from 'web-push';

const ENV_PATH = resolve(process.cwd(), '.env.local');
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:abhin@keeva.app';

const KEYS = {
  public: 'NEXT_PUBLIC_VAPID_PUBLIC_KEY',
  private: 'VAPID_PRIVATE_KEY',
};

if (!existsSync(ENV_PATH)) {
  console.error('.env.local not found. Create it from .env.local.example first.');
  process.exit(1);
}

const force = process.argv.includes('--force');
let contents = readFileSync(ENV_PATH, 'utf8');

// webpush returns { publicKey, privateKey }; normalise to the shape used below
// and reject anything that is not a plausible base64url key. Writing a literal
// "undefined" into .env.local is a confusing failure to debug much later.
const readKey = (name) => new RegExp(`^${name}=(.*)$`, 'm').exec(contents)?.[1]?.trim();

// A VAPID public key is a 65-byte uncompressed point (~87 base64url chars) and
// the private key is 32 bytes (~43), so 40 is a floor both comfortably clear
// while "undefined" or a truncated paste is rejected.
const isRealKey = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{40,}$/.test(v);

const existing = {
  public: isRealKey(readKey(KEYS.public)) ? readKey(KEYS.public) : undefined,
  private: isRealKey(readKey(KEYS.private)) ? readKey(KEYS.private) : undefined,
};

if (readKey(KEYS.public) && !existing.public) {
  console.warn(`! ${KEYS.public} was set to a non-key value — regenerating.`);
}
if (readKey(KEYS.private) && !existing.private) {
  console.warn(`! ${KEYS.private} was set to a non-key value — regenerating.`);
}

if (!force && existing.public && existing.private) {
  console.log('VAPID keys already present in .env.local — nothing to do.');
  console.log('Public key:', existing.public);
  process.exit(0);
}

const generated = webpush.generateVAPIDKeys();
const merged = { public: generated.publicKey, private: generated.privateKey };

for (const [name, value] of [
  [KEYS.public, merged.public],
  [KEYS.private, merged.private],
  ['VAPID_SUBJECT', VAPID_SUBJECT],
]) {
  const line = `${name}=${value}`;
  contents = new RegExp(`^${name}=.*$`, 'm').test(contents)
    ? contents.replace(new RegExp(`^${name}=.*$`, 'm'), line)
    : `${contents.trimEnd()}\n${line}\n`;
}

writeFileSync(ENV_PATH, contents);

console.log('VAPID keys written to .env.local');
console.log('Public key :', merged.public);
console.log('Private key: (written to .env.local, not printed)');
if (force && existing.public) {
  console.log('\nKeys were rotated. Every existing push subscription is now dead and');
  console.log('each member has to re-enable notifications on their device.');
}
