import { Plugin, PluginSettingTab, Setting, SecretComponent, Modal, Notice, FuzzySuggestModal, TFile, requestUrl } from 'obsidian';
import { DEFAULTS, FIELDS, metadata, parseNote, postPath, postUrl, siteBase, localWithMetadata,
  publicNote, fromRemote, hashText, attachment, reference, label, rewriteReferences, pullState, MAX_FILE_BYTES, MAX_TOTAL_BYTES } from './core.mjs';
import { GitHubClient, SyncConflict } from './github.mjs';

class Decision extends Modal {
  constructor(app, title, message, action, resolve) {
    super(app); Object.assign(this, { title, message, action, resolve, answered: false });
  }
  onOpen() {
    this.contentEl.createEl('h2', { text: this.title });
    this.contentEl.createEl('p', { text: this.message });
    new Setting(this.contentEl).addButton((b) => b.setButtonText('取消').onClick(() => this.close()))
      .addButton((b) => b.setButtonText(this.action).setWarning().onClick(() => {
        this.answered = true; this.resolve(true); this.close();
      }));
  }
  onClose() { if (!this.answered) this.resolve(false); this.contentEl.empty(); }
}

class PublishDialog extends Modal {
  constructor(plugin, file, values) { super(plugin.app); Object.assign(this, { plugin, file, values }); }
  onOpen() {
    const { contentEl, values } = this;
    contentEl.addClass('kendrey-blog-dialog');
    contentEl.createEl('h2', { text: '发布或更新博客笔记' });
    contentEl.createEl('p', { text: `仅处理：${this.file.path}，以及正文引用的图片或附件。` });
    new Setting(contentEl).setName('标题').addText((t) => t.setValue(values.title).onChange((v) => { values.title = v; }));
    new Setting(contentEl).setName('文章日期').setDesc('YYYY-MM-DD，或完整日期、时间与时区。')
      .addText((t) => t.setValue(values.date).onChange((v) => { values.date = v; }));
    new Setting(contentEl).setName('公开发布').setDesc('关闭时保存为博客草稿。本仓库公开，草稿源码仍可在 GitHub 查看。')
      .addToggle((t) => t.setValue(values.published).onChange((v) => { values.published = v; }));
    new Setting(contentEl).setName('展示在首页').setDesc('关闭后仅在归档、搜索和文章链接中展示。')
      .addToggle((t) => t.setValue(!values.hidden).onChange((v) => { values.hidden = !v; }));
    new Setting(contentEl).setName('文章语言').addDropdown((d) => d.addOptions({ zh: '中文', en: 'English' })
      .setValue(values.lang).onChange((v) => { values.lang = v; }));
    new Setting(contentEl).setName('标签').addText((t) => t.setValue(values.tags.join(', ')).onChange((v) => {
      values.tags = v.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
    }));
    new Setting(contentEl).addButton((b) => b.setButtonText('取消').onClick(() => this.close()))
      .addButton((b) => b.setButtonText('提交到博客').setCta().onClick(async () => {
        b.setDisabled(true);
        const ok = await this.plugin.run(() => this.plugin.performPublish(this.file, values));
        b.setDisabled(false);
        if (ok) this.close();
      }));
  }
  onClose() { this.contentEl.empty(); }
}

class PostPicker extends FuzzySuggestModal {
  constructor(plugin, paths) { super(plugin.app); this.plugin = plugin; this.paths = paths; this.setPlaceholder('搜索要导入的博客文章'); }
  getItems() { return this.paths; }
  getItemText(path) { return path.slice(7); }
  onChooseItem(path) { void this.plugin.run(() => this.plugin.importPost(path)); }
}

class SettingsTab extends PluginSettingTab {
  constructor(plugin) { super(plugin.app, plugin); this.plugin = plugin; }
  display() {
    const { containerEl, plugin } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Kendrey Blog Sync' });
    containerEl.createEl('p', { text: '只同步明确发布或导入的笔记，Sveltia 继续使用同一 GitHub 仓库。' });
    for (const [key, title, description] of [
      ['owner', 'GitHub 用户名', '默认 kendreyx'], ['repo', '仓库名称', '默认 kendreyx.github.io'],
      ['branch', '分支', '默认 master'], ['siteUrl', '博客地址', '用于在 Obsidian 中显示博客图片和文章链接。'],
      ['author', '默认作者', '新文章使用的作者名称。'], ['importFolder', '导入目录', 'CMS 导入文章与冲突副本存放于此；使用笔记库内的相对目录。'],
    ]) {
      new Setting(containerEl).setName(title).setDesc(description).addText((t) => t.setValue(plugin.settings[key]).onChange(async (value) => {
        plugin.settings[key] = value.trim(); await plugin.save();
      }));
    }
    const token = new Setting(containerEl).setName('GitHub Token')
      .setDesc('选择或新建 Obsidian 共享密钥。令牌仅授权博客仓库的 Contents: Read and write。插件配置只保存密钥名称。');
    new SecretComponent(this.app, token.controlEl).setValue(plugin.settings.tokenSecretId).onChange(async (id) => {
      plugin.settings.tokenSecretId = id || ''; await plugin.save();
    });
    new Setting(containerEl).addButton((b) => b.setButtonText('测试连接').onClick(() => plugin.run(async () => {
      await plugin.client().check(); new Notice('已连接 GitHub 仓库。发布需要 Contents: Read and write 权限。');
    })));
    containerEl.createEl('p', { text: '正文使用普通 Markdown。发布时转换 Obsidian 链接，上传当前笔记直接引用的本地图片与附件；已有 R2 URL 可直接使用。' });
  }
}

export default class KendreyBlogSync extends Plugin {
  async onload() {
    const saved = await this.loadData() || {};
    this.settings = Object.fromEntries(Object.entries(DEFAULTS).map(([key, value]) => [key, typeof saved.settings?.[key] === 'string' ? saved.settings[key] : value]));
    this.links = Array.isArray(saved.links) ? saved.links.filter((s) => typeof s.localPath === 'string' && typeof s.remotePath === 'string' && typeof s.repository === 'string') : [];
    this.busy = false; this.saveQueue = Promise.resolve();
    this.addSettingTab(new SettingsTab(this));
    this.addCommand({ id: 'publish-current-note', name: '发布或更新当前笔记', checkCallback: (checking) => {
      const file = this.activeNote();
      if (!file) return false;
      if (!checking) void this.showPublisher(file);
      return true;
    } });
    this.addCommand({ id: 'pull-current-note', name: '拉取当前笔记的 CMS 修改', checkCallback: (checking) => {
      const file = this.activeNote();
      if (!file || !this.linkFor(file.path)) return false;
      if (!checking) void this.run(() => this.pullPost(file));
      return true;
    } });
    this.addCommand({ id: 'import-blog-post', name: '从博客选择文章导入', callback: () => this.run(async () => {
      const snapshot = await this.client().snapshot();
      const paths = [...snapshot.files.keys()].filter((p) => /^_posts\/\d{4}-\d{2}-\d{2}-[^/]+\.md$/.test(p)).sort().reverse();
      new PostPicker(this, paths).open();
    }) });
    this.addCommand({ id: 'unlink-current-note', name: '解除当前笔记的博客关联', checkCallback: (checking) => {
      const file = this.activeNote();
      if (!file || !this.linkFor(file.path)) return false;
      if (!checking) void this.run(async () => {
        const key = this.repositoryKey();
        this.links = this.links.filter((s) => s.repository !== key || s.localPath !== file.path);
        await this.save(); new Notice('关联已解除，笔记和博客文章均已保留。');
      });
      return true;
    } });
    this.addRibbonIcon('cloud-upload', '发布当前博客笔记', () => {
      const file = this.activeNote();
      if (file) void this.showPublisher(file); else new Notice('请先打开一篇 Markdown 笔记。');
    });
    this.registerEvent(this.app.vault.on('rename', (_file, oldPath) => {
      for (const link of this.links) {
        if (link.localPath === oldPath || link.localPath.startsWith(`${oldPath}/`)) link.localPath = _file.path + link.localPath.slice(oldPath.length);
      }
      void this.save();
    }));
  }
  activeNote() { const file = this.app.workspace.getActiveFile(); return file instanceof TFile && file.extension.toLowerCase() === 'md' ? file : null; }
  config() { return this.operationSettings || this.settings; }
  repositoryKey() { const s = this.config(); return `${s.owner}/${s.repo}@${s.branch}`; }
  linkFor(path) { return this.links.find((s) => s.repository === this.repositoryKey() && s.localPath === path); }
  async save() {
    this.saveQueue = this.saveQueue.catch(() => {}).then(() => this.saveData({ settings: Object.fromEntries(Object.keys(DEFAULTS).map((k) => [k, this.settings[k]])), links: this.links }));
    await this.saveQueue;
  }
  client() {
    const settings = { ...this.config() };
    siteBase(settings.siteUrl);
    return new GitHubClient(settings, () => this.app.secretStorage.getSecret(settings.tokenSecretId), async (options) => {
      const result = await requestUrl({ ...options, throw: false });
      return { status: result.status, json: result.text ? result.json : null };
    });
  }
  async run(task) {
    if (this.busy) { new Notice('正在同步，请稍候。'); return false; }
    this.busy = true;
    this.operationSettings = { ...this.settings };
    try { await task(); return true; }
    catch (error) { new Notice(error.message || '同步未完成，请重试。', 9000); return false; }
    finally { this.busy = false; this.operationSettings = null; }
  }
  async showPublisher(file) {
    try {
      const raw = await this.app.vault.read(file);
      new PublishDialog(this, file, metadata(raw, file.basename, this.config())).open();
    } catch (error) { new Notice(error.message, 8000); }
  }
  async storeLink(file, path, sha, localText, date) {
    const repository = this.repositoryKey();
    this.links = this.links.filter((s) => s.repository !== repository || (s.localPath !== file.path && s.remotePath !== path));
    this.links.push({ repository, localPath: file.path, remotePath: path, remoteSha: sha, localHash: await hashText(localText), date });
    await this.save();
  }
  async prepare(raw, file, fields, path) {
    const assets = new Map();
    let omitted = 0;
    let totalBytes = 0;
    const addAsset = async (target) => {
      if (!assets.has(target.path)) {
        if (target.stat?.size > MAX_FILE_BYTES) throw new Error('单个附件上限为 8 MiB。');
        if (assets.size >= 20 || totalBytes + (target.stat?.size || 0) > MAX_TOTAL_BYTES) throw new Error('单次最多 20 个附件，总大小上限为 20 MiB。');
        const asset = await attachment(target.name, await this.app.vault.readBinary(target));
        if (totalBytes + asset.bytes.byteLength > MAX_TOTAL_BYTES) throw new Error('附件总大小上限为 20 MiB。');
        totalBytes += asset.bytes.byteLength;
        assets.set(target.path, asset);
      }
      return assets.get(target.path);
    };
    const cache = this.app.metadataCache.getFileCache(file);
    if (!cache && /\[\[|!\[/.test(parseNote(raw).body)) throw new Error('Obsidian 尚未完成笔记索引，请稍后重试。');
    const refs = [...(cache?.embeds ?? []).map((r) => ({ ...r, embed: true })), ...(cache?.links ?? []).map((r) => ({ ...r, embed: false }))]
      .filter((r) => r.position.start.offset >= parseNote(raw).bodyStart);
    const converted = await rewriteReferences(raw, refs, async (r) => {
      if (/^(?:https?:|mailto:|data:)/i.test(r.link)) {
        return /^!?\[\[/.test(r.original) ? reference(r.displayText || r.link, r.link, r.embed) : undefined;
      }
      const [linkPath, ...anchorParts] = r.link.split('#');
      const anchor = anchorParts.join('#');
      const target = linkPath ? this.app.metadataCache.getFirstLinkpathDest(linkPath, file.path) : file;
      if (!target && r.link.startsWith('/') && !/^!?\[\[/.test(r.original)) return undefined;
      const text = r.displayText && (!r.embed || !/^\d+(?:x\d+)?$/.test(r.displayText)) ? r.displayText : target?.basename || linkPath;
      if (!target) { omitted += 1; return label(text); }
      if (target.extension.toLowerCase() !== 'md') {
        const asset = await addAsset(target);
        const image = r.embed && /^(?:png|jpe?g|webp|gif|svg|avif|bmp|ico)$/i.test(target.extension);
        return reference(text, `/${asset.path}`, image);
      }
      if (r.embed) throw new Error('暂不发布嵌入笔记。请先将 ![[笔记]] 改为文字或普通链接。');
      const linked = target.path === file.path ? { remotePath: path, date: fields.date } : this.linkFor(target.path);
      if (!linked || anchor.startsWith('^')) { omitted += 1; return label(text); }
      const suffix = anchor ? `#${encodeURIComponent(anchor.toLowerCase().replace(/\s+/g, '-'))}` : '';
      return reference(text, postUrl(linked.remotePath, { date: linked.date }, this.config().siteUrl) + suffix);
    });
    const remoteFields = { ...fields };
    if (remoteFields['header-img'] && !/^(?:https?:|\/)/.test(remoteFields['header-img'])) {
      const target = this.app.metadataCache.getFirstLinkpathDest(remoteFields['header-img'], file.path);
      if (!target || target.extension.toLowerCase() === 'md') throw new Error('页头图片未找到，请使用本地图片路径或公开图片 URL。');
      remoteFields['header-img'] = `/${(await addAsset(target)).path}`;
    }
    return { text: publicNote(converted, remoteFields), assets: [...assets.values()], omitted };
  }
  async performPublish(file, overrides) {
    const raw = await this.app.vault.read(file);
    const fields = metadata(raw, file.basename, this.config(), overrides);
    const linked = this.linkFor(file.path);
    const path = linked?.remotePath || postPath(fields);
    const prepared = await this.prepare(raw, file, fields, path);
    const client = this.client();
    let result;
    const input = { path, expectedSha: linked?.remoteSha, text: prepared.text, assets: prepared.assets, message: `Obsidian: ${fields.title}` };
    try { result = await client.publish(input); }
    catch (error) {
      if (!(error instanceof SyncConflict)) throw error;
      if (!linked) throw new Error('同名文章已存在，请先使用“从博客选择文章导入”，再修改和发布。');
      if (!error.remoteSha) throw new Error('CMS 中的文章已被删除，本地笔记已保留。若要重新发布，请先解除博客关联。');
      const latest = await client.readPost(path);
      if (!latest) throw new Error('CMS 中的文章已被删除，本地笔记已保留。');
      const copy = await this.backup(latest.text, path, 'CMS');
      const confirmed = await new Promise((resolve) => new Decision(this.app, 'CMS 也修改了这篇文章',
        `CMS 最新版本已保存为 ${copy.path}。请先比较副本；继续将使用当前笔记替换该远端版本。`, '发布本地版本', resolve).open());
      if (!confirmed) throw new Error('已保留两份版本，未替换 CMS 内容。');
      result = await client.publish({ ...input, expectedSha: latest.sha });
    }
    const updated = localWithMetadata(raw, fields);
    const current = await this.app.vault.process(file, (value) => value === raw ? updated : value);
    await this.storeLink(file, path, result.sha, updated, fields.date);
    const suffix = current !== updated ? ' 写作期间的新改动已留在本地，尚未提交。' : '';
    new Notice((result.unchanged ? '博客内容没有变化。' : fields.published ? '已提交文章，等待 GitHub Pages 构建。' : '已保存为博客草稿。') + suffix, 8000);
    if (prepared.omitted) new Notice(`${prepared.omitted} 个未发布笔记链接已转为显示文字，其目标笔记未上传。`, 8000);
  }
  async pullPost(file) {
    const link = this.linkFor(file.path);
    const raw = await this.app.vault.read(file);
    const remote = await this.client().readPost(link.remotePath);
    if (!remote) throw new Error('CMS 中的文章已删除，本地笔记保留。');
    const state = pullState(await hashText(raw), link.localHash, remote.sha, link.remoteSha);
    if (state === 'unchanged' || state === 'local-only') {
      new Notice(state === 'local-only' ? 'CMS 没有新修改，本地改动尚待发布。' : '当前笔记已是最新版本。'); return;
    }
    if (state === 'conflict') {
      const copy = await this.backup(remote.text, link.remotePath, 'CMS');
      new Notice(`双方都有修改。原笔记保持不变，CMS 最新版本保存在 ${copy.path}。`, 10000);
      await this.app.workspace.getLeaf(true).openFile(copy); return;
    }
    const imported = fromRemote(raw, remote.text, link.remotePath, this.config().siteUrl, this.config());
    await this.app.vault.process(file, (value) => {
      if (value !== raw) throw new Error('拉取期间本地笔记发生了变化，已停止替换；请再次拉取。');
      return imported.text;
    });
    await this.storeLink(file, link.remotePath, remote.sha, imported.text, imported.fields.date);
    new Notice('已拉取 CMS 修改，本地其他属性已保留。');
  }
  folder() {
    const value = this.config().importFolder.replace(/\\/g, '/').replace(/\/+$/, '');
    if (!value || value.startsWith('/') || value.split('/').some((s) => !s || s.startsWith('.'))) throw new Error('请使用笔记库内的普通相对目录。');
    return value;
  }
  async createLocal(path, text) {
    const parts = path.split('/'); parts.pop();
    let folder = '';
    for (const part of parts) {
      folder = folder ? `${folder}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
    }
    let next = path;
    for (let index = 2; this.app.vault.getAbstractFileByPath(next); index += 1) next = path.replace(/\.md$/, ` (${index}).md`);
    return this.app.vault.create(next, text);
  }
  async importPost(path) {
    const existing = this.links.find((s) => s.repository === this.repositoryKey() && s.remotePath === path);
    if (existing) {
      const file = this.app.vault.getAbstractFileByPath(existing.localPath);
      if (file instanceof TFile) { await this.app.workspace.getLeaf(true).openFile(file); new Notice('该文章已关联，使用“拉取当前笔记的 CMS 修改”更新。'); return; }
    }
    const remote = await this.client().readPost(path);
    if (!remote) throw new Error('文章已从 CMS 删除，请刷新列表。');
    const imported = fromRemote('', remote.text, path, this.config().siteUrl, this.config());
    const file = await this.createLocal(`${this.folder()}/${path.slice(7)}`, imported.text);
    await this.storeLink(file, path, remote.sha, imported.text, imported.fields.date);
    await this.app.workspace.getLeaf(true).openFile(file);
    new Notice('已导入博客文章，可以在本地编辑后发布。');
  }
  async backup(raw, path, source) {
    const imported = fromRemote('', raw, path, this.config().siteUrl, this.config());
    const parsed = parseNote(imported.text);
    parsed.doc.set('blog-sync-backup', true);
    const text = `---\n${parsed.doc.toString({ lineWidth: 0 })}---\n${parsed.body}`;
    return this.createLocal(`${this.folder()}/同步冲突/${path.slice(7, -3)}-${source}-${Date.now()}.md`, text);
  }
}
