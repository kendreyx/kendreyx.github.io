import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Only the public Access Key ID belongs in the configuration. The Secret Access
// Key must be entered in Sveltia's browser settings, never in this script.
const accessKeyId = process.env.R2_PUBLIC_ACCESS_KEY_ID;
if (!accessKeyId || !/^[A-Za-z0-9]{16,128}$/.test(accessKeyId)) {
  throw new Error('Set R2_PUBLIC_ACCESS_KEY_ID to the R2 Access Key ID (not the Secret Access Key).');
}

const configPath = process.argv[2] ?? fileURLToPath(new URL('../../admin/config.yml', import.meta.url));
const config = await readFile(configPath, 'utf8');
if (/^media_libraries\s*:/m.test(config)) {
  throw new Error('media_libraries already exists. Review the existing configuration before changing it.');
}
const bucket = JSON.parse(await readFile(new URL('./public-bucket.json', import.meta.url), 'utf8'));
const lines = ['media_libraries:', '  cloudflare_r2:'];
for (const [key, value] of Object.entries({ ...bucket, access_key_id: accessKeyId })) {
  lines.push(`    ${key}: ${JSON.stringify(value)}`);
}
const anchor = /^(public_folder:.*\r?\n)/m;
if (!anchor.test(config)) throw new Error('Cannot find the existing public_folder setting. No changes made.');
await writeFile(configPath, config.replace(anchor, (match) => `${match}\n${lines.join('\n')}\n`));
console.log('R2 configuration added. Configure bucket CORS and enter the Secret Access Key in Sveltia before use.');
