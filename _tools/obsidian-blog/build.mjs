import { build } from 'esbuild';
import { zipSync, strToU8 } from 'fflate';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('./', import.meta.url);
await mkdir(new URL('dist/', root), { recursive: true });
const output = await build({
  absWorkingDir: fileURLToPath(root), metafile: true,
  entryPoints: [fileURLToPath(new URL('src/main.mjs', root))], bundle: true,
  format: 'cjs', platform: 'browser', target: 'es2022', external: ['obsidian'],
  minify: true, legalComments: 'eof', write: false,
});
const manifest = await readFile(new URL('manifest.json', root), 'utf8');
const version = JSON.parse(manifest).version;
const packages = new Map();
for (const input of Object.keys(output.metafile.inputs).filter((p) => p.startsWith('node_modules/'))) {
  let folder = dirname(resolve(fileURLToPath(root), input));
  while (folder.startsWith(fileURLToPath(new URL('node_modules/', root)))) {
    try {
      const pkg = JSON.parse(await readFile(join(folder, 'package.json'), 'utf8'));
      if (pkg.name) { packages.set(`${pkg.name}@${pkg.version}`, folder); break; }
    } catch {}
    folder = dirname(folder);
  }
}
const notices = [];
for (const [name, folder] of [...packages].sort(([a], [b]) => a.localeCompare(b, 'en'))) {
  const licenses = (await readdir(folder)).filter((n) => /^(?:license|copying)(?:[.\-_]|$)/i.test(n)).sort();
  if (!licenses.length) throw new Error(`License text missing for bundled dependency ${name}`);
  for (const license of licenses) notices.push(`${name}\n${await readFile(join(folder, license), 'utf8')}`);
}
const files = {
  'main.js': output.outputFiles[0].contents,
  'manifest.json': strToU8(manifest),
  'styles.css': new Uint8Array(await readFile(new URL('styles.css', root))),
  'README.md': new Uint8Array(await readFile(new URL('README.zh-CN.md', root))),
  'LICENSE': new Uint8Array(await readFile(new URL('../../LICENSE', root))),
  'THIRD-PARTY-LICENSES.txt': strToU8(notices.join('\n\n--------------------\n\n')),
};
for (const [name, content] of Object.entries(files)) await writeFile(new URL(`dist/${name}`, root), content);
const zip = Object.fromEntries(Object.entries(files).map(([name, content]) => [`kendrey-blog-sync/${name}`, [content, { mtime: new Date('2020-01-01T00:00:00Z') }]]));
const downloads = new URL('../../downloads/', root);
await mkdir(downloads, { recursive: true });
await writeFile(new URL(`obsidian-kendrey-blog-sync-${version}.zip`, downloads), zipSync(zip, { level: 9 }));
console.log(`Built Obsidian plugin ${version}; archive contains plugin code, manifest, styles, instructions and licenses.`);
