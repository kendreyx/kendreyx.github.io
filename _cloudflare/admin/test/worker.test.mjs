import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { createWorker } from '../src/worker.mjs';

const issuer = 'https://private-admin.cloudflareaccess.com';
const audience = 'private-admin-application';
const email = 'owner@example.test';
let privateKey;
let publicJwk;
let wrongPrivateKey;

before(async () => {
  const pair = await generateKeyPair('RS256');
  wrongPrivateKey = pair.privateKey;
  const signingPair = await generateKeyPair('RS256');
  privateKey = signingPair.privateKey;
  publicJwk = { ...await exportJWK(signingPair.publicKey), kid: 'admin-key', alg: 'RS256' };
});

function fixture({ keyResolverFactory } = {}) {
  let assetCalls = 0;
  const worker = createWorker({
    keyResolverFactory: keyResolverFactory ?? (() => createLocalJWKSet({ keys: [publicJwk] })),
  });
  const env = {
    ACCESS_TEAM_DOMAIN: 'private-admin.cloudflareaccess.com',
    ACCESS_AUD: audience,
    ADMIN_EMAILS: email,
    ASSETS: {
      async fetch() {
        assetCalls += 1;
        return new Response('private admin configuration', {
          headers: { 'Content-Type': 'text/yaml', 'Cache-Control': 'public, max-age=86400' },
        });
      },
    },
  };
  return { worker, env, assetCalls: () => assetCalls };
}

async function token(overrides = {}, { key = privateKey, omit = [] } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: issuer, aud: audience, exp: now + 120, iat: now, email, ...overrides };
  for (const claim of omit) delete claims[claim];
  return new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: 'admin-key' }).sign(key);
}

function request(jwt, path = '/admin/config.yml', extra = {}) {
  const headers = new Headers(extra.headers);
  if (jwt) headers.set('Cf-Access-Jwt-Assertion', jwt);
  return new Request(`https://admin.kendrey.top${path}`, { ...extra, headers });
}

function assertPrivate(response) {
  assert.match(response.headers.get('Cache-Control'), /no-store/);
  assert.equal(response.headers.get('CDN-Cache-Control'), 'no-store');
  assert.equal(response.headers.get('Cloudflare-CDN-Cache-Control'), 'no-store');
}

test('valid RS256 token and allowed signed email can read assets with caching disabled', async () => {
  const f = fixture();
  const response = await f.worker.fetch(request(await token()), f.env);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'private admin configuration');
  assert.equal(f.assetCalls(), 1);
  assertPrivate(response);
});

for (const path of ['/', '/admin', '/admin/', '/admin/config.yml', '/img/favicon.png']) {
  test(`missing JWT cannot read or redirect ${path}`, async () => {
    const f = fixture();
    const response = await f.worker.fetch(request(null, path), f.env);
    assert.equal(response.status, 401);
    assert.equal(f.assetCalls(), 0);
    assert.equal(response.headers.has('Location'), false);
    assertPrivate(response);
  });
}

const rejectedTokens = [
  ['expired token', () => token({ exp: Math.floor(Date.now() / 1000) - 10 })],
  ['wrong issuer', () => token({ iss: 'https://attacker.cloudflareaccess.com' })],
  ['wrong audience', () => token({ aud: 'another-application' })],
  ['missing expiration', () => token({}, { omit: ['exp'] })],
  ['missing email', () => token({}, { omit: ['email'] })],
  ['future not-before', () => token({ nbf: Math.floor(Date.now() / 1000) + 300 })],
  ['forged RSA signature', () => token({}, { key: wrongPrivateKey })],
  ['malformed JWT', async () => 'this.is.not.a.jwt'],
  ['unsigned JWT', async () => `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify({ iss: issuer, aud: audience, email })).toString('base64url')}.`],
  ['HS256 token', async () => new SignJWT({ iss: issuer, aud: audience, email, exp: Math.floor(Date.now() / 1000) + 120 }).setProtectedHeader({ alg: 'HS256', kid: 'admin-key' }).sign(new Uint8Array(32).fill(1))],
];

for (const [description, create] of rejectedTokens) {
  test(`${description} fails closed without calling ASSETS`, async () => {
    const f = fixture();
    const response = await f.worker.fetch(request(await create()), f.env);
    assert.equal(response.status, 401);
    assert.equal(f.assetCalls(), 0);
    assertPrivate(response);
  });
}

test('valid signature from an unlisted user is denied despite forged email headers', async () => {
  const f = fixture();
  const response = await f.worker.fetch(request(await token({ email: 'outsider@kendrey.top' }), undefined, {
    headers: { 'Cf-Access-Authenticated-User-Email': email, 'X-Forwarded-Email': email },
  }), f.env);
  assert.equal(response.status, 403);
  assert.equal(f.assetCalls(), 0);
  assertPrivate(response);
});

test('an email header without a signed JWT is never authentication', async () => {
  const f = fixture();
  const response = await f.worker.fetch(request(null, undefined, {
    headers: { 'Cf-Access-Authenticated-User-Email': email },
  }), f.env);
  assert.equal(response.status, 401);
  assert.equal(f.assetCalls(), 0);
});

for (const [key, value] of [
  ['ACCESS_TEAM_DOMAIN', ''],
  ['ACCESS_TEAM_DOMAIN', 'https://private-admin.cloudflareaccess.com'],
  ['ACCESS_TEAM_DOMAIN', 'attacker.invalid'],
  ['ACCESS_AUD', ''],
  ['ADMIN_EMAILS', ''],
  ['ADMIN_EMAILS', 'not-an-email'],
  ['ASSETS', undefined],
]) {
  test(`missing or invalid ${key} prevents all access`, async () => {
    const f = fixture();
    f.env[key] = value;
    const response = await f.worker.fetch(request(await token()), f.env);
    assert.equal(response.status, 503);
    assert.equal(f.assetCalls(), 0);
    assertPrivate(response);
  });
}

test('authorization is checked again after a previously authorized asset response', async () => {
  const f = fixture();
  assert.equal((await f.worker.fetch(request(await token()), f.env)).status, 200);
  const response = await f.worker.fetch(request(null), f.env);
  assert.equal(response.status, 401);
  assert.equal(f.assetCalls(), 1);
});

test('verified access at root redirects to admin and preserves query parameters', async () => {
  const f = fixture();
  const response = await f.worker.fetch(request(await token(), '/?lang=zh'), f.env);
  assert.equal(response.status, 307);
  assert.equal(response.headers.get('Location'), 'https://admin.kendrey.top/admin/?lang=zh');
  assert.equal(f.assetCalls(), 0);
  assertPrivate(response);
});

test('unknown JWKS errors deny access without leaking the error', async () => {
  const f = fixture({ keyResolverFactory: () => { throw new Error('private resolver detail'); } });
  const response = await f.worker.fetch(request(await token()), f.env);
  assert.equal(response.status, 401);
  assert.equal((await response.text()).includes('private resolver detail'), false);
  assert.equal(f.assetCalls(), 0);
});

test('only GET and HEAD are accepted after authentication', async () => {
  const f = fixture();
  const jwt = await token();
  const response = await f.worker.fetch(request(jwt, undefined, { method: 'POST' }), f.env);
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('Allow'), 'GET, HEAD');
  assert.equal(f.assetCalls(), 0);
  assertPrivate(response);
  assert.equal((await f.worker.fetch(request(jwt, undefined, { method: 'HEAD' }), f.env)).status, 200);
  assert.equal(f.assetCalls(), 1);
});
