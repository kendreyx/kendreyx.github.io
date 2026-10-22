import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Only the public Access Key ID belongs in the configuration. The Secret Access
// Key must be entered in Sveltia's browser settings, never in this script.
const args = process.argv.slice(2);
const preferExisting = args.includes('--prefer-existing');
const paths = args.filter((arg) => arg !== '--prefer-existing');
if (paths.length > 1) throw new Error('Usage: configure.mjs [--prefer-existing] [config.yml]');
const configPath = paths[0] ?? fileURLToPath(new URL('../../admin/config.yml', import.meta.url));
const config = await readFile(configPath, 'utf8');
if (/^media_libraries\s*:/m.test(config)) {
  if (preferExisting) {
    console.log('Using the existing repository media_libraries configuration.');
    process.exit(0);
  }
  throw new Error('media_libraries already exists. Review the existing configuration before changing it.');
}
const accessKeyId = process.env.R2_PUBLIC_ACCESS_KEY_ID;
// R2 Access Key IDs are token IDs (32 hex characters). R2 Secret Access Keys
// are SHA-256 values (64 hex characters) and must never enter a public build.
if (!accessKeyId || !/^[a-f0-9]{32}$/i.test(accessKeyId)) {
  throw new Error('R2_PUBLIC_ACCESS_KEY_ID must be the 32-character hexadecimal R2 Access Key ID. Do not supply the Secret Access Key.');
}
const bucket = JSON.parse(await readFile(new URL('./public-bucket.json', import.meta.url), 'utf8'));
if (accessKeyId.toLowerCase() === bucket.account_id.toLowerCase()) {
  throw new Error('Use the R2 Access Key ID, not the Cloudflare Account ID.');
}
const lines = ['media_libraries:', '  cloudflare_r2:'];
for (const [key, value] of Object.entries({ ...bucket, access_key_id: accessKeyId })) {
  lines.push(`    ${key}: ${JSON.stringify(value)}`);
}
const anchor = /^(public_folder:.*\r?\n)/m;
if (!anchor.test(config)) throw new Error('Cannot find the existing public_folder setting. No changes made.');
await writeFile(configPath, config.replace(anchor, (match) => `${match}\n${lines.join('\n')}\n`));
console.log('R2 configuration added. Configure bucket CORS and enter the Secret Access Key in Sveltia before use.');
