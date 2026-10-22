import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { accessConfig } from '../src/worker.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const file = process.argv[2] ?? 'wrangler.production.jsonc';

let config;
try {
  // The template uses strict JSON, which is also valid JSONC.
  config = JSON.parse(await readFile(resolve(root, file), 'utf8'));
} catch {
  console.error('Deployment is disabled until configured. Run npm run configure with the required environment variables first. The resulting configuration must use strict JSON.');
  process.exit(1);
}

const domain = config.routes?.[0]?.pattern;
const configured =
  /^[a-f0-9]{32}$/i.test(config.account_id ?? '') &&
  typeof domain === 'string' &&
  /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(domain) &&
  !/(?:^|\.)(?:example\.(?:com|net|org)|workers\.dev|invalid)$/i.test(domain) &&
  config.routes.length === 1 && config.routes[0].custom_domain === true &&
  config.workers_dev === false && config.preview_urls === false &&
  config.assets?.run_worker_first === true && config.assets?.binding === 'ASSETS' &&
  config.assets?.directory === '.assets' &&
  config.main === 'src/worker.mjs' &&
  /^[a-f0-9]{64}$/i.test(config.vars?.ACCESS_AUD ?? '') &&
  accessConfig(config.vars ?? {});

if (!configured) {
  console.error('Deployment refused: real account, protected custom domain, Access issuer/AUD/admin emails, disabled public preview URLs, and Worker-first ASSETS are required.');
  process.exit(1);
}

for (const args of [
  ['scripts/build-assets.mjs'],
  ['node_modules/wrangler/bin/wrangler.js', 'deploy', '--config', resolve(root, file)],
]) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
