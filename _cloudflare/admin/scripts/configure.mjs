import { chmod, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { accessConfig } from '../src/worker.mjs';

const root = new URL('../', import.meta.url);
const config = JSON.parse(await readFile(new URL('wrangler.example.jsonc', root), 'utf8'));
const required = ['ADMIN_EMAILS', 'ACCESS_TEAM_DOMAIN', 'ACCESS_AUD'];
const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length) {
  console.error(`Configuration not written. Missing environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

config.account_id = process.env.CLOUDFLARE_ACCOUNT_ID?.trim() || config.account_id;
config.routes[0].pattern = process.env.ADMIN_DOMAIN?.trim() || config.routes[0].pattern;
config.vars = {
  ACCESS_TEAM_DOMAIN: process.env.ACCESS_TEAM_DOMAIN.trim(),
  ACCESS_AUD: process.env.ACCESS_AUD.trim(),
  ADMIN_EMAILS: process.env.ADMIN_EMAILS.trim(),
};

if (
  !/^[a-f0-9]{32}$/i.test(config.account_id) ||
  !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(config.routes[0].pattern) ||
  !/^[a-f0-9]{64}$/i.test(config.vars.ACCESS_AUD) ||
  !accessConfig(config.vars)
) {
  console.error('Configuration not written. Check the account, admin hostname, Access team hostname, AUD, and admin email list.');
  process.exit(1);
}

const target = new URL('wrangler.production.jsonc', root);
await writeFile(target, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
await chmod(target, 0o600);
console.log(`Local deployment configuration written: ${fileURLToPath(target)}`);
