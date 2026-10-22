import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';
import { parseHTML } from 'linkedom';
import { metadata, hashText, parseNote, DEFAULTS } from '../src/core.mjs';
import { MemoryGitHub } from './fixture.mjs';

let bundle;
before(async () => {
  const result = await build({ entryPoints: [new URL('../src/main.mjs', import.meta.url).pathname], bundle: true, format: 'cjs', platform: 'browser', external: ['obsidian'], write: false });
  bundle = result.outputFiles[0].text;
});

class File {
  constructor(path, text = '', bytes) { this.path = path; this.text = text; this.bytes = bytes; }
  get name() { return this.path.split('/').pop(); }
  get extension() { return this.name.split('.').pop(); }
  get basename() { return this.name.slice(0, -(this.extension.length + 1)); }
  get stat() { return { size: this.reportedSize ?? this.bytes?.byteLength ?? Buffer.byteLength(this.text) }; }
}
const rawNote = '---\ntitle: 选中的笔记\ndate: 2026-10-22 12:00:00 +0800\nprivate: 保留在本地\n---\n正文\n';

async function fixture(raw = rawNote) {
  const memory = new MemoryGitHub({ '_config.yml': 'site configuration' });
  const selected = new File('个人笔记/选中的笔记.md', raw);
  const secret = new File('个人笔记/不发布.md', '其他私人笔记内容');
  const image = new File('图片.png', '', new Uint8Array([1, 2, 3, 4]));
  const files = new Map([selected, secret, image].map((f) => [f.path, f]));
  const notices = []; const events = {}; const secretReads = [];
  const app = {
    secretStorage: { getSecret(id) { secretReads.push(id); return id === DEFAULTS.tokenSecretId ? 'synthetic-token' : null; } },
    workspace: { active: selected, opened: [], getActiveFile() { return this.active; }, getLeaf() {
      return { openFile: async (file) => { app.workspace.active = file; app.workspace.opened.push(file.path); } };
    } },
    vault: {
      getAbstractFileByPath: (path) => files.get(path) || null,
      read: async (file) => file.text,
      readBinary: async (file) => file.bytes.buffer.slice(file.bytes.byteOffset, file.bytes.byteOffset + file.bytes.byteLength),
      process: async (file, fn) => { file.text = fn(file.text); return file.text; },
      create: async (path, text) => { assert.equal(files.has(path), false); const file = new File(path, text); files.set(path, file); return file; },
      createFolder: async (path) => { assert.equal(files.has(path), false); files.set(path, { path }); },
      on: (event, callback) => { events[event] = callback; return {}; },
    },
    metadataCache: {
      getFirstLinkpathDest(link) { return files.get(link) || [...files.values()].find((f) => f instanceof File && (f.name === link || f.basename === link)) || null; },
      getFileCache(file) {
        const result = { links: [], embeds: [] };
        for (const match of file.text.matchAll(/(!)?\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g)) {
          result[match[1] ? 'embeds' : 'links'].push({ link: match[2], displayText: match[3] || match[2], original: match[0], position: { start: { offset: match.index }, end: { offset: match.index + match[0].length } } });
        }
        return result;
      },
    },
  };
  class Plugin {
    constructor() { this.app = app; this.commands = []; }
    async loadData() { return null; }
    async saveData(data) { this.saved = JSON.parse(JSON.stringify(data)); }
    addSettingTab(tab) { this.tab = tab; }
    addCommand(command) { this.commands.push(command); }
    addRibbonIcon() {}
    registerEvent() {}
  }
  class Modal {
    constructor() { this.contentEl = { empty() {} }; }
    open() {
      if (this.resolve) { this.answered = true; this.resolve(app.confirmOverwrite === true); }
      else app.lastModal = this;
    }
    close() { this.onClose?.(); }
    setPlaceholder() {}
  }
  const facade = { Plugin, PluginSettingTab: class { constructor() { this.app = app; } }, Setting: class {}, SecretComponent: class {}, Modal,
    FuzzySuggestModal: Modal, TFile: File, Notice: class { constructor(message) { notices.push(message); } },
    requestUrl: async (options) => { const response = await memory.request(options); return { ...response, text: JSON.stringify(response.json) }; },
  };
  const module = { exports: {} };
  vm.runInNewContext(bundle, { module, exports: module.exports, document: parseHTML('<html><body></body></html>').document, require: (name) => { assert.equal(name, 'obsidian'); return facade; },
    crypto: globalThis.crypto, TextEncoder, TextDecoder, URL, console, btoa, atob, setTimeout, clearTimeout,
  });
  const plugin = new module.exports.default();
  await plugin.onload();
  const publish = () => plugin.run(() => plugin.performPublish(selected, metadata(selected.text, selected.basename, DEFAULTS)));
  return { app, memory, plugin, files, selected, secret, notices, events, secretReads, publish };
}

test('loading the plugin never uploads or reads unrelated notes', async () => {
  const f = await fixture();
  assert.equal(f.memory.requests.length, 0);
  assert.deepEqual(Object.keys(f.events), ['rename']);
  assert.equal(f.plugin.commands.length, 4);
});
test('publishes only the chosen note, omits private properties, and stores no token in plugin data', async () => {
  const f = await fixture();
  assert.equal(await f.publish(), true);
  const paths = [...f.memory.files().keys()];
  assert.equal(paths.length, 2);
  assert.ok(paths.includes('_posts/2026-10-22-选中的笔记.md'));
  const remote = parseNote(f.memory.text('_posts/2026-10-22-选中的笔记.md'));
  assert.equal(remote.data.private, undefined);
  assert.equal(remote.data.published, false);
  assert.equal(parseNote(f.selected.text).data.private, '保留在本地');
  assert.equal(f.secret.text, '其他私人笔记内容');
  assert.equal(JSON.stringify(f.plugin.saved).includes('synthetic-token'), false);
});
test('Obsidian image embeds upload only their referenced file with the selected note', async () => {
  const f = await fixture(`${rawNote}![[图片.png]]\n[[不发布|只显示文字]]\n[[不发布|2026]]\n`);
  assert.equal(await f.publish(), true);
  const remote = f.memory.text('_posts/2026-10-22-选中的笔记.md');
  assert.ok(remote.includes('![图片.png](/img/posts/obsidian/'));
  assert.ok(remote.includes('只显示文字'));
  assert.ok(remote.includes('\n2026\n'));
  assert.equal(remote.includes('其他私人笔记内容'), false);
  assert.equal(f.memory.files().size, 3);
  assert.equal(f.memory.updates, 1);
});
test('clean local notes accept CMS changes and preserve local-only properties', async () => {
  const f = await fixture(); await f.publish();
  const link = f.plugin.links[0];
  f.memory.update(link.remotePath, f.memory.text(link.remotePath).replace('正文', 'CMS 修改'));
  assert.equal(await f.plugin.run(() => f.plugin.pullPost(f.selected)), true);
  assert.ok(f.selected.text.includes('CMS 修改'));
  assert.equal(parseNote(f.selected.text).data.private, '保留在本地');
  assert.equal(f.plugin.links[0].localHash, await hashText(f.selected.text));
  assert.equal(f.memory.updates, 1);
});
test('oversized attachments are rejected before loading their bytes or contacting GitHub', async () => {
  const f = await fixture(`${rawNote}![[图片.png]]\n`);
  f.files.get('图片.png').reportedSize = 8 * 1024 * 1024 + 1;
  f.app.vault.readBinary = async () => { throw new Error('Must not read oversized attachment'); };
  assert.equal(await f.publish(), false);
  assert.ok(f.notices.some((notice) => notice.includes('8 MiB')));
  assert.equal(f.memory.requests.length, 0);
});
test('conflicting local/CMS edits preserve the original and create an unpublishable CMS copy', async () => {
  const f = await fixture(); await f.publish();
  const baselineSha = f.plugin.links[0].remoteSha;
  const path = f.plugin.links[0].remotePath;
  f.selected.text += '本地改动';
  const original = f.selected.text;
  f.memory.update(path, `${f.memory.text(path)}CMS 改动`);
  assert.equal(await f.plugin.run(() => f.plugin.pullPost(f.selected)), true);
  assert.equal(f.selected.text, original);
  const copy = [...f.files.values()].find((file) => file instanceof File && file.path.includes('/同步冲突/'));
  assert.ok(copy.text.includes('CMS 改动'));
  assert.equal(parseNote(copy.text).data['blog-sync-backup'], true);
  assert.throws(() => metadata(copy.text, copy.basename), /冲突副本/);
  assert.equal(f.plugin.links[0].remoteSha, baselineSha);
});
test('remote conflicts never overwrite CMS without explicit confirmation', async () => {
  const f = await fixture(); await f.publish();
  const path = f.plugin.links[0].remotePath;
  f.selected.text += '本地版本';
  f.memory.update(path, `${f.memory.text(path)}CMS 新版本`);
  const latest = f.memory.text(path);
  assert.equal(await f.publish(), false);
  assert.equal(f.memory.text(path), latest);
  f.app.confirmOverwrite = true;
  assert.equal(await f.publish(), true);
  assert.ok(f.memory.text(path).includes('本地版本'));
  assert.equal(f.memory.updates, 2);
});
test('edits made during an upload remain local and dirty after the captured version is published', async () => {
  const f = await fixture();
  let edited = false;
  f.memory.onRequest = async (request) => {
    if (!edited && request.method === 'POST') { edited = true; f.selected.text += '上传期间新增'; }
  };
  assert.equal(await f.publish(), true);
  assert.ok(f.selected.text.includes('上传期间新增'));
  const link = f.plugin.links[0];
  assert.equal(f.memory.text(link.remotePath).includes('上传期间新增'), false);
  assert.notEqual(link.localHash, await hashText(f.selected.text));
});
test('edits made during a pull are not overwritten and do not advance the baseline', async () => {
  const f = await fixture(); await f.publish();
  const path = f.plugin.links[0].remotePath;
  const previous = f.plugin.links[0].remoteSha;
  f.memory.update(path, `${f.memory.text(path)}CMS 新版本`);
  f.memory.onRequest = async (request) => {
    if (request.method === 'GET' && request.url.includes('/git/blobs/')) f.selected.text += '拉取期间新增';
  };
  assert.equal(await f.plugin.run(() => f.plugin.pullPost(f.selected)), false);
  assert.ok(f.selected.text.includes('拉取期间新增'));
  assert.equal(f.plugin.links[0].remoteSha, previous);
});
test('a deleted remote note does not delete or silently resurrect the local note', async () => {
  const f = await fixture(); await f.publish();
  const path = f.plugin.links[0].remotePath;
  const original = f.selected.text;
  f.memory.update(path, null);
  assert.equal(await f.plugin.run(() => f.plugin.pullPost(f.selected)), false);
  assert.equal(await f.publish(), false);
  assert.equal(f.selected.text, original);
  assert.equal(f.memory.text(path), null);
});
test('importing uses a unique local filename and does not overwrite existing notes', async () => {
  const f = await fixture();
  const path = '_posts/2026-10-22-已有文章.md';
  f.memory.update(path, rawNote.replace('private: 保留在本地', 'layout: post'));
  const existing = new File('博客/2026-10-22-已有文章.md', '原来的私人笔记');
  f.files.set(existing.path, existing);
  assert.equal(await f.plugin.run(() => f.plugin.importPost(path)), true);
  assert.equal(existing.text, '原来的私人笔记');
  assert.equal(f.plugin.links[0].localPath, '博客/2026-10-22-已有文章 (2).md');
});
test('repository and secret selection are frozen throughout an in-flight operation', async () => {
  const f = await fixture();
  f.memory.onRequest = async () => { f.plugin.settings.owner = 'different-owner'; f.plugin.settings.tokenSecretId = 'different-secret'; };
  assert.equal(await f.publish(), true);
  assert.equal(f.plugin.links[0].repository, 'kendreyx/kendreyx.github.io@master');
  assert.ok(f.secretReads.every((id) => id === DEFAULTS.tokenSecretId));
  assert.equal(f.plugin.saved.settings.owner, 'different-owner');
});
test('reimporting a locally deleted note replaces its stale association without creating repeated copies', async () => {
  const f = await fixture(); await f.publish();
  const path = f.plugin.links[0].remotePath;
  f.files.delete(f.selected.path);
  assert.equal(await f.plugin.run(() => f.plugin.importPost(path)), true);
  const importedPath = f.plugin.links[0].localPath;
  assert.equal(f.plugin.links.length, 1);
  const size = f.files.size;
  assert.equal(await f.plugin.run(() => f.plugin.importPost(path)), true);
  assert.equal(f.files.size, size);
  assert.equal(f.plugin.links[0].localPath, importedPath);
});
