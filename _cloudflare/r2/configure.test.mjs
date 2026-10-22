import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./configure.mjs', import.meta.url));
const bucket = JSON.parse(await readFile(new URL('./public-bucket.json', import.meta.url), 'utf8'));
const id = '0123456789abcdef0123456789abcdef';
const original = '# Preserve CMS settings and comments.\nbackend:\n  name: github\nmedia_folder: img/posts\npublic_folder: /img/posts\ncollections: []\n';

async function withConfig(check, content = original) {
  const folder = await mkdtemp(join(tmpdir(), 'kendrey-r2-'));
  const config = join(folder, 'config.yml');
  await writeFile(config, content);
  const run = (key, flags = []) => {
    const env = { ...process.env };
    delete env.R2_PUBLIC_ACCESS_KEY_ID;
    if (key !== undefined) env.R2_PUBLIC_ACCESS_KEY_ID = key;
    return spawnSync(process.execPath, [script, ...flags, config], {
      env, encoding: 'utf8', timeout: 5000,
    });
  };
  try {
    await check({ config, run, read: () => readFile(config, 'utf8') });
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

test('adds the public bucket and ID while preserving existing CMS settings', async () => {
  await withConfig(async ({ run, read }) => {
    const result = run(id);
    assert.equal(result.status, 0, result.stderr);
    const output = await read();
    assert.ok(output.startsWith('# Preserve CMS settings and comments.\nbackend:\n  name: github\n'));
    assert.ok(output.endsWith('collections: []\n'));
    for (const value of [bucket.account_id, bucket.bucket, bucket.public_url, id]) {
      assert.ok(output.includes(JSON.stringify(value)));
    }
    assert.equal(output.includes('secret_access_key'), false);
  });
});

for (const [label, value] of [
  ['missing ID', undefined],
  ['Account ID instead of Access Key ID', bucket.account_id],
  ['64-character Secret Access Key', 'a'.repeat(64)],
  ['API endpoint instead of ID', 'https://example.r2.cloudflarestorage.com'],
  ['multiline input', `${id}\nsecret_access_key: accidental`],
]) {
  test(`rejects ${label} without modifying or printing the value`, async () => {
    await withConfig(async ({ run, read }) => {
      const result = run(value);
      assert.notEqual(result.status, 0);
      assert.equal(await read(), original);
      if (value) assert.equal(`${result.stdout}${result.stderr}`.includes(value), false);
    });
  });
}

test('refuses to replace an existing media library by default', async () => {
  const existing = `${original}media_libraries:\n  cloudinary:\n    cloud_name: existing\n`;
  await withConfig(async ({ run, read }) => {
    assert.notEqual(run(id).status, 0);
    assert.equal(await read(), existing);
  }, existing);
});

test('Pages build can preserve an existing media library', async () => {
  const existing = `${original}media_libraries:\n  cloudinary:\n    cloud_name: existing\n`;
  await withConfig(async ({ run, read }) => {
    assert.equal(run(id, ['--prefer-existing']).status, 0);
    assert.equal(await read(), existing);
  }, existing);
});

test('prefer-existing validates the ID when configuration must be generated', async () => {
  await withConfig(async ({ run, read }) => {
    assert.notEqual(run('a'.repeat(64), ['--prefer-existing']).status, 0);
    assert.equal(await read(), original);
  });
});
