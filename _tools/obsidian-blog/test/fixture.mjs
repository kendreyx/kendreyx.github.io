import { createHash } from 'node:crypto';

export const blobSha = (bytes) => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
const objectSha = (value) => createHash('sha1').update(JSON.stringify(value)).digest('hex');

export class MemoryGitHub {
  constructor(files = {}) {
    this.blobs = new Map(); this.trees = new Map(); this.commits = new Map();
    this.requests = []; this.updates = 0; this.hook = null; this.truncated = false;
    const tree = new Map();
    for (const [path, text] of Object.entries(files)) tree.set(path, this.putBlob(Buffer.from(text)));
    this.head = this.commit(tree, []);
  }
  putBlob(bytes) { const sha = blobSha(bytes); this.blobs.set(sha, Buffer.from(bytes)); return sha; }
  putTree(tree) { const sha = objectSha([...tree].sort()); this.trees.set(sha, new Map(tree)); return sha; }
  commit(tree, parents) {
    const data = { tree: { sha: this.putTree(tree) }, parents };
    const sha = objectSha(data); this.commits.set(sha, data); return sha;
  }
  files() { return new Map(this.trees.get(this.commits.get(this.head).tree.sha)); }
  text(path) { const sha = this.files().get(path); return sha ? this.blobs.get(sha).toString('utf8') : null; }
  update(path, text) {
    const tree = this.files();
    if (text === null) tree.delete(path); else tree.set(path, this.putBlob(Buffer.from(text)));
    this.head = this.commit(tree, [this.head]);
  }
  async request(options) {
    const url = new URL(options.url);
    if (url.origin !== 'https://api.github.com' || !url.pathname.startsWith('/repos/kendreyx/kendreyx.github.io')) throw new Error('Unexpected destination');
    if (options.headers.Authorization !== 'Bearer synthetic-token') return { status: 401, json: {} };
    const path = decodeURIComponent(url.pathname.slice('/repos/kendreyx/kendreyx.github.io'.length));
    const data = options.body ? JSON.parse(options.body) : null;
    this.requests.push({ method: options.method, path, data });
    if (this.onRequest) await this.onRequest(options);
    const ok = (json, status = 200) => ({ status, json });
    if (options.method === 'GET' && !path) return ok({ permissions: { push: true } });
    if (options.method === 'GET' && path === '/git/ref/heads/master') return ok({ object: { sha: this.head } });
    if (options.method === 'GET' && path.startsWith('/git/commits/')) return ok(this.commits.get(path.split('/').pop()));
    if (options.method === 'GET' && path.startsWith('/git/trees/')) {
      const tree = this.trees.get(path.split('/').pop());
      return ok({ truncated: this.truncated, tree: [...tree].map(([name, sha]) => ({ path: name, type: 'blob', sha, size: this.blobs.get(sha).length })) });
    }
    if (options.method === 'GET' && path.startsWith('/git/blobs/')) {
      const bytes = this.blobs.get(path.split('/').pop());
      return ok({ content: bytes.toString('base64'), encoding: 'base64', size: bytes.length });
    }
    if (options.method === 'POST' && path === '/git/blobs') return ok({ sha: this.putBlob(Buffer.from(data.content, 'base64')) }, 201);
    if (options.method === 'POST' && path === '/git/trees') {
      const tree = new Map(this.trees.get(data.base_tree));
      for (const node of data.tree) tree.set(node.path, node.sha);
      return ok({ sha: this.putTree(tree) }, 201);
    }
    if (options.method === 'POST' && path === '/git/commits') {
      const tree = this.trees.get(data.tree);
      return ok({ sha: this.commit(tree, data.parents) }, 201);
    }
    if (options.method === 'PATCH' && path === '/git/refs/heads/master') {
      if (this.hook) { const hook = this.hook; this.hook = null; await hook(); }
      if (data.force !== false || !this.commits.get(data.sha).parents.includes(this.head)) return ok({}, 422);
      this.head = data.sha; this.updates += 1;
      return ok({ object: { sha: this.head } });
    }
    throw new Error(`Unhandled test request: ${options.method} ${path}`);
  }
}

export const selectedPath = '_posts/2026-10-22-选中的笔记.md';
export const note = '---\nlayout: post\ntitle: 选中的笔记\ndate: 2026-10-22 12:00:00 +0800\npublished: false\nhidden: true\n---\n正文\n';
