import { copyFile, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const repository = new URL('../../', root);
const output = new URL('.assets/', root);

// Rebuild only this package's ignored output. Copy an explicit list so unrelated
// repository files and credentials can never become public Worker assets.
await rm(output, { recursive: true, force: true });
await mkdir(new URL('admin/', output), { recursive: true });
await mkdir(new URL('img/', output), { recursive: true });
for (const path of ['admin/index.html', 'admin/config.yml', 'img/favicon.png']) {
  await copyFile(new URL(path, repository), new URL(path, output));
}
console.log(`Admin assets built: ${fileURLToPath(output)}`);
