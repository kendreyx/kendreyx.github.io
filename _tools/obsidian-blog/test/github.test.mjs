import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubClient, SyncConflict } from '../src/github.mjs';
import { DEFAULTS, attachment } from '../src/core.mjs';
import { MemoryGitHub, note, selectedPath } from './fixture.mjs';

function fixture(files = {}) {
  const memory = new MemoryGitHub(files);
  return { memory, client: new GitHubClient(DEFAULTS, () => 'synthetic-token', memory.request.bind(memory)) };
}

test('publishes only a selected post and assets in one non-force commit', async () => {
  const { memory, client } = fixture({ '_config.yml': 'unchanged', '_posts/2020-01-01-existing.md': 'other article' });
  const asset = await attachment('图.png', new Uint8Array([1, 2, 3]));
  const result = await client.publish({ path: selectedPath, text: note, assets: [asset] });
  assert.equal(memory.text(selectedPath), note);
  assert.equal(memory.text('_config.yml'), 'unchanged');
  assert.equal(memory.text('_posts/2020-01-01-existing.md'), 'other article');
  assert.equal(memory.updates, 1);
  assert.equal(memory.files().get(selectedPath), result.sha);
  const patch = memory.requests.find((r) => r.method === 'PATCH');
  assert.equal(patch.data.force, false);
  assert.deepEqual([...memory.files().keys()].sort(), ['_config.yml', '_posts/2020-01-01-existing.md', selectedPath, asset.path].sort());
});
test('updates the expected note and reads UTF-8 CMS contents', async () => {
  const { memory, client } = fixture({ [selectedPath]: note });
  const old = await client.readPost(selectedPath);
  await client.publish({ path: selectedPath, expectedSha: old.sha, text: `${note}CMS 与 Obsidian😀\n` });
  assert.equal((await client.readPost(selectedPath)).text, `${note}CMS 与 Obsidian😀\n`);
  assert.equal(memory.updates, 1);
});
test('remote version mismatch stops before uploading blobs or modifying the branch', async () => {
  const { memory, client } = fixture({ [selectedPath]: note });
  const old = await client.readPost(selectedPath);
  memory.update(selectedPath, `${note}CMS修改`);
  await assert.rejects(client.publish({ path: selectedPath, expectedSha: old.sha, text: `${note}本地修改` }), SyncConflict);
  assert.equal(memory.requests.filter((r) => r.method !== 'GET').length, 0);
  assert.equal(memory.text(selectedPath), `${note}CMS修改`);
});
test('concurrent branch updates cannot be force-overwritten', async () => {
  const { memory, client } = fixture({ [selectedPath]: note });
  const old = await client.readPost(selectedPath);
  memory.hook = () => memory.update(selectedPath, `${note}另一个客户端`);
  await assert.rejects(client.publish({ path: selectedPath, expectedSha: old.sha, text: `${note}本地` }), /停止覆盖/);
  assert.equal(memory.text(selectedPath), `${note}另一个客户端`);
  assert.equal(memory.updates, 0);
});
test('identical note and attachments cause no new commits', async () => {
  const { memory, client } = fixture();
  const asset = await attachment('图.png', new Uint8Array([3, 4]));
  const first = await client.publish({ path: selectedPath, text: note, assets: [asset] });
  const result = await client.publish({ path: selectedPath, text: note, expectedSha: first.sha, assets: [asset] });
  assert.equal(result.unchanged, true); assert.equal(memory.updates, 1);
});
test('new-note collisions and deleted remote notes require an explicit resolution', async () => {
  const { memory, client } = fixture({ [selectedPath]: note });
  await assert.rejects(client.publish({ path: selectedPath, text: 'new' }), SyncConflict);
  const previous = await client.readPost(selectedPath);
  memory.update(selectedPath, null);
  assert.equal(await client.readPost(selectedPath), null);
  await assert.rejects(client.publish({ path: selectedPath, text: note, expectedSha: previous.sha }), SyncConflict);
  assert.equal(memory.updates, 0);
});
test('missing token and unsafe target paths never reach GitHub', async () => {
  let requests = 0;
  const missing = new GitHubClient(DEFAULTS, () => '', async () => { requests++; });
  await assert.rejects(missing.check(), /Token/);
  const client = new GitHubClient(DEFAULTS, () => 'synthetic-token', async () => { requests++; });
  await assert.rejects(client.publish({ path: '_config.yml', text: 'bad' }), /_posts/);
  await assert.rejects(client.publish({ path: '_posts/../../_config.yml', text: 'bad' }), /_posts/);
  assert.throws(() => new GitHubClient({ ...DEFAULTS, owner: 'attacker.invalid/steal' }, () => '', () => {}));
  assert.equal(requests, 0);
});
test('truncated repository trees and asset collisions stop publishing', async () => {
  const { memory, client } = fixture();
  memory.truncated = true;
  await assert.rejects(client.publish({ path: selectedPath, text: note }), /完整读取/);
  assert.equal(memory.updates, 0);
  memory.truncated = false;
  const asset = await attachment('图.png', new Uint8Array([1, 2]));
  memory.update(asset.path, 'unexpected changed asset');
  await assert.rejects(client.publish({ path: selectedPath, text: note, assets: [asset] }), /附件内容不同/);
  assert.equal(memory.updates, 0);
});
test('network errors cannot leak authorization values into displayed errors', async () => {
  const client = new GitHubClient(DEFAULTS, () => 'synthetic-token', async () => { throw new Error('authorization synthetic-token'); });
  await assert.rejects(client.check(), (error) => error.message.includes('连接 GitHub') && !error.message.includes('synthetic-token'));
});
