import { createRemoteJWKSet, jwtVerify } from 'jose';

const TEAM_DOMAIN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.cloudflareaccess\.com$/;
const EMAIL = /^[^\s,@]+@[^\s,@]+\.[^\s,@]+$/;

export function accessConfig(env) {
  const teamDomain = env.ACCESS_TEAM_DOMAIN;
  const audience = env.ACCESS_AUD;
  const emailList = env.ADMIN_EMAILS;

  if (
    typeof teamDomain !== 'string' || !TEAM_DOMAIN.test(teamDomain) ||
    typeof audience !== 'string' || !audience || audience.trim() !== audience ||
    typeof emailList !== 'string' || !emailList.trim()
  ) return undefined;

  const emails = emailList.split(',').map((email) => email.trim().toLowerCase());
  if (emails.some((email) => !EMAIL.test(email))) return undefined;

  return {
    issuer: `https://${teamDomain}`,
    audience,
    emails: new Set(emails),
  };
}

function privateResponse(response) {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'private, no-store, max-age=0');
  headers.set('CDN-Cache-Control', 'no-store');
  headers.set('Cloudflare-CDN-Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('X-Robots-Tag', 'noindex, nofollow');
  headers.set('Referrer-Policy', 'same-origin');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function denied(status, message) {
  return privateResponse(new Response(message, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  }));
}

// Both production remote JWKS and an injected local JWKS use jwtVerify. There is
// no token-free or test-mode path. Only trusted deployment configuration chooses
// the issuer, never request headers or JWT claims.
export function createWorker({ keyResolverFactory = createRemoteJWKSet } = {}) {
  const resolvers = new Map();

  return {
    async fetch(request, env) {
      const config = accessConfig(env);
      if (!config || typeof env.ASSETS?.fetch !== 'function') {
        return denied(503, 'Admin access is not configured.');
      }

      const token = request.headers.get('Cf-Access-Jwt-Assertion');
      if (!token) return denied(401, 'Cloudflare Access authentication required.');

      let payload;
      try {
        let resolver = resolvers.get(config.issuer);
        if (!resolver) {
          resolver = keyResolverFactory(new URL(`${config.issuer}/cdn-cgi/access/certs`));
          resolvers.set(config.issuer, resolver);
        }
        ({ payload } = await jwtVerify(token, resolver, {
          algorithms: ['RS256'],
          issuer: config.issuer,
          audience: config.audience,
          requiredClaims: ['iss', 'aud', 'exp', 'email'],
        }));
      } catch {
        return denied(401, 'Invalid or expired Cloudflare Access authentication.');
      }

      // Ignore Cf-Access-Authenticated-User-Email and all other unsigned headers.
      if (
        typeof payload.email !== 'string' ||
        !EMAIL.test(payload.email) ||
        !config.emails.has(payload.email.toLowerCase())
      ) return denied(403, 'Administrator access required.');

      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return privateResponse(new Response('Method not allowed.', {
          status: 405,
          headers: { Allow: 'GET, HEAD' },
        }));
      }

      const url = new URL(request.url);
      if (url.pathname === '/' || url.pathname === '/admin') {
        url.pathname = '/admin/';
        return privateResponse(Response.redirect(url, 307));
      }

      try {
        return privateResponse(await env.ASSETS.fetch(request));
      } catch {
        return denied(502, 'Admin assets are unavailable.');
      }
    },
  };
}

export default createWorker();
