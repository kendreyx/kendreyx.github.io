import { assertPostPath, decodeText, gitBlobSha, MAX_FILE_BYTES, MAX_TOTAL_BYTES, toBase64 } from './core.mjs';

export class SyncConflict extends Error {
  constructor(sha) { super('CMS 已有更新，请先拉取并检查冲突副本。'); this.remoteSha = sha; }
}

export class GitHubClient {
  constructor(settings, token, request) {
    if (![settings.owner, settings.repo].every((v) => /^[A-Za-z0-9_.-]+$/.test(v) && !['.', '..'].includes(v))) throw new Error('GitHub 用户名或仓库名称无效。');
    if (!/^[A-Za-z0-9_./-]+$/.test(settings.branch) || settings.branch.includes('..') || settings.branch.split('/').some((s) => !s)) throw new Error('分支名称无效。');
    this.base = `https://api.github.com/repos/${encodeURIComponent(settings.owner)}/${encodeURIComponent(settings.repo)}`;
    this.branch = encodeURIComponent(settings.branch);
    this.token = token; this.request = request;
  }
  async call(method, path, data) {
    const token = this.token();
    if (!token) throw new Error('请先在插件设置中选择 GitHub Token。');
    let response;
    try {
      response = await this.request({ url: this.base + path, method,
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'Kendrey-Blog-Sync/0.1.0' },
        ...(data !== undefined ? { body: JSON.stringify(data), contentType: 'application/json' } : {}),
      });
    } catch { throw new Error('连接 GitHub 失败，请检查网络后重试。'); }
    if (response.status < 200 || response.status >= 300) {
      const messages = { 401: 'GitHub Token 无效或已过期。', 403: 'GitHub 权限不足或请求受限，请检查 Contents: Read and write。', 404: '无法访问 GitHub 仓库或文件，请检查仓库、分支和令牌范围。' };
      const error = new Error(messages[response.status] || `GitHub 请求未完成（HTTP ${response.status}）。`);
      error.status = response.status; throw error;
    }
    return response.json;
  }
  async check() { return this.call('GET', ''); }
  async snapshot() {
    const ref = await this.call('GET', `/git/ref/heads/${this.branch}`);
    const commit = await this.call('GET', `/git/commits/${ref.object.sha}`);
    const tree = await this.call('GET', `/git/trees/${commit.tree.sha}?recursive=1`);
    if (tree.truncated) throw new Error('仓库目录超过完整读取上限，已停止同步。');
    return { head: ref.object.sha, tree: commit.tree.sha, files: new Map(tree.tree.filter((n) => n.type === 'blob').map((n) => [n.path, n])) };
  }
  async readPost(path, snapshot) {
    assertPostPath(path);
    const current = snapshot ?? await this.snapshot();
    const entry = current.files.get(path);
    if (!entry) return null;
    if (entry.size > 1024 * 1024) throw new Error('单篇文章超过 1 MiB，已停止读取。');
    const blob = await this.call('GET', `/git/blobs/${entry.sha}`);
    if (blob.encoding !== 'base64' || blob.size > 1024 * 1024) throw new Error('文章内容格式或大小不受支持。');
    return { sha: entry.sha, text: decodeText(blob.content) };
  }
  async publish({ path, expectedSha, text, assets = [], message }) {
    assertPostPath(path);
    const bytes = new TextEncoder().encode(text);
    if (bytes.byteLength > 1024 * 1024) throw new Error('单篇文章上限为 1 MiB。');
    if (assets.some((a) => a.bytes.byteLength > MAX_FILE_BYTES)) throw new Error('单个附件上限为 8 MiB。');
    if (assets.length > 20 || assets.reduce((n, a) => n + a.bytes.byteLength, 0) > MAX_TOTAL_BYTES) throw new Error('单次最多 20 个附件，总大小上限为 20 MiB。');
    for (const a of assets) if (!/^img\/posts\/obsidian\/[a-f0-9]{64}-[^/\\]+\.[a-z0-9]+$/.test(a.path)) throw new Error('附件路径不在允许范围内。');
    const snapshot = await this.snapshot();
    const actual = snapshot.files.get(path)?.sha;
    if (actual !== expectedSha) throw new SyncConflict(actual);
    const changes = [];
    const files = [...assets, { path, bytes }];
    for (const file of files) {
      const sha = await gitBlobSha(file.bytes);
      const existing = snapshot.files.get(file.path)?.sha;
      if (existing === sha) continue;
      if (file.path !== path && existing) throw new Error('远端同名附件内容不同，已停止覆盖。');
      changes.push({ ...file, sha });
    }
    const sha = await gitBlobSha(bytes);
    if (!changes.length) return { sha, unchanged: true };
    const tree = [];
    for (const file of changes) {
      const blob = await this.call('POST', '/git/blobs', { content: toBase64(file.bytes), encoding: 'base64' });
      if (blob.sha !== file.sha) throw new Error('GitHub 返回的文件校验值不一致，已停止提交。');
      tree.push({ path: file.path, mode: '100644', type: 'blob', sha: blob.sha });
    }
    const nextTree = await this.call('POST', '/git/trees', { base_tree: snapshot.tree, tree });
    const commit = await this.call('POST', '/git/commits', { message: String(message || 'Sync selected Obsidian note').replace(/[\r\n]/g, ' ').slice(0, 150), tree: nextTree.sha, parents: [snapshot.head] });
    try {
      const ref = await this.call('PATCH', `/git/refs/heads/${this.branch}`, { sha: commit.sha, force: false });
      if (ref.object.sha !== commit.sha) throw new Error('无法确认 GitHub 提交结果，请先拉取检查。');
    } catch (error) {
      if ([409, 422].includes(error.status)) throw new Error('GitHub 拒绝更新分支，已停止覆盖；请检查远端新改动或分支保护规则。');
      throw error;
    }
    return { sha, commit: commit.sha, unchanged: false };
  }
}
