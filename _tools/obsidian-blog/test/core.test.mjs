import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'yaml';
import { parseNote, metadata, postPath, postUrl, publicNote, localWithMetadata, fromRemote,
  shanghaiDate, datePart, attachment, hashText, gitBlobSha, toBase64, decodeText, absoluteBlogLinks,
  reference, rewriteReferences, pullState, DEFAULTS } from '../src/core.mjs';
import { blobSha, note, selectedPath } from './fixture.mjs';

test('new notes are drafts; YAML strings do not accidentally publish a note', () => {
  assert.equal(metadata('正文', '标题').published, false);
  assert.equal(metadata('---\npublished: "true"\nhidden: "false"\n---\n文', '标题').published, false);
  const m = metadata(note, '标题'); assert.equal(m.published, false); assert.equal(m.hidden, true);
});
test('remote CMS booleans and existing published-by-default posts remain correct', () => {
  const imported = fromRemote('', note.replace('published: false\n', ''), selectedPath, DEFAULTS.siteUrl);
  assert.equal(parseNote(imported.text).data.published, true);
  assert.equal(parseNote(imported.text).data.hidden, true);
});
test('private properties are retained locally and excluded from public front matter', () => {
  const raw = '---\n# Keep this comment\nprivate: 仅本地\ntitle: 测试\n---\n正文';
  const fields = metadata(raw, '标题');
  const remote = parseNote(publicNote(raw, fields));
  assert.equal(remote.data.private, undefined);
  assert.equal(remote.body, '正文');
  const local = localWithMetadata(raw, fields);
  assert.equal(parseNote(local).data.private, '仅本地');
  assert.ok(local.includes('# Keep this comment'));
  assert.equal(parseNote(localWithMetadata('无属性正文', fields)).body, '无属性正文');
});
test('Chinese filenames and permalink encoding are compatible without double escaping', () => {
  const fields = metadata(note, '标题');
  assert.equal(postPath(fields), selectedPath);
  const url = postUrl(selectedPath, fields, DEFAULTS.siteUrl);
  const markdown = reference('中文标题', url);
  assert.ok(markdown.includes(encodeURIComponent('选中的笔记')));
  assert.equal(markdown.includes('%25E9'), false);
});
test('Shanghai date and calendar checks avoid invalid publication dates', () => {
  assert.equal(shanghaiDate(new Date('2026-10-21T16:01:02Z')), '2026-10-22 00:01:02 +0800');
  assert.equal(datePart('2024-02-29 12:00:00 +0800'), '2024-02-29');
  for (const value of ['2026-02-30', '2026-13-01', 'not-a-date', '2026-10-22 invalid', '2026-10-22 25:00:00 +0800', '2026-10-22 12:60 +0800', '2026-10-22 12:00 +9999']) assert.throws(() => datePart(value));
  assert.ok(!postPath({ title: '../../secret', date: '2026-10-22' }).includes('..'));
});
test('pull converts real image/link/reference URLs but preserves code examples', () => {
  const input = '![图](/img/posts/a.png)\n\n[文章](/2026/10/22/test/)\n\n[图床]: /img/a.png\n\n`![代码](/img/code.png)`\n\n```md\n![代码](/img/code.png)\n```\n';
  const result = absoluteBlogLinks(input, DEFAULTS.siteUrl);
  assert.ok(result.includes('https://www.kendrey.top/img/posts/a.png'));
  assert.ok(result.includes('https://www.kendrey.top/2026/10/22/test/'));
  assert.ok(result.includes('https://www.kendrey.top/img/a.png'));
  assert.ok(result.includes('`![代码](/img/code.png)`'));
  assert.ok(result.includes('```md\n![代码](/img/code.png)\n```'));
});
test('pull preserves local-only properties while accepting CMS changes', () => {
  const local = '---\nprivate: 保留\n---\n旧正文';
  const result = fromRemote(local, note, selectedPath, DEFAULTS.siteUrl);
  assert.equal(parseNote(result.text).data.private, '保留');
  assert.equal(parseNote(result.text).data.published, false);
  assert.equal(parseNote(result.text).body, '正文\n');
});
test('conflict backup cannot be republished by mistake', () => {
  assert.throws(() => metadata('---\nblog-sync-backup: true\n---\n备份', '备份'), /冲突副本/);
});
test('attachment hashing, UTF-8 round trips and Git blob IDs are correct', async () => {
  const bytes = new TextEncoder().encode('中文😀');
  assert.equal(decodeText(toBase64(bytes)), '中文😀');
  assert.equal(await gitBlobSha(bytes), blobSha(Buffer.from(bytes)));
  const asset = await attachment('图片.png', bytes);
  assert.match(asset.path, /^img\/posts\/obsidian\/[a-f0-9]{64}-图片\.png$/);
  assert.equal(asset.path, (await attachment('图片.png', bytes)).path);
  await assert.rejects(attachment('script.html', bytes), /格式/);
  await assert.rejects(attachment('large.png', new Uint8Array(8 * 1024 * 1024 + 1)), /8 MiB/);
});
test('rewrite uses Obsidian positions; stale caches cannot corrupt source', async () => {
  const raw = '正文 ![[图片.png]] 结束';
  const original = '![[图片.png]]'; const start = raw.indexOf(original);
  const refs = [{ original, position: { start: { offset: start }, end: { offset: start + original.length } } }];
  assert.equal(await rewriteReferences(raw, refs, async () => '![图](/img/x.png)'), '正文 ![图](/img/x.png) 结束');
  await assert.rejects(rewriteReferences(`前缀${raw}`, refs, async () => '替换'), /索引/);
});
test('pull distinguishes unchanged, local-only, remote-only and conflicting edits', async () => {
  const base = await hashText('基线'); const changed = await hashText('本地改动');
  assert.equal(pullState(base, base, 'one', 'one'), 'unchanged');
  assert.equal(pullState(changed, base, 'one', 'one'), 'local-only');
  assert.equal(pullState(base, base, 'two', 'one'), 'remote');
  assert.equal(pullState(changed, base, 'two', 'one'), 'conflict');
});
test('public serialization produces YAML booleans used by Sveltia', () => {
  const text = publicNote(note, metadata(note, 'note', DEFAULTS, { published: true, hidden: false }));
  const fields = parse(text.split('---\n')[1]);
  assert.equal(fields.published, true); assert.equal(fields.hidden, false);
});
