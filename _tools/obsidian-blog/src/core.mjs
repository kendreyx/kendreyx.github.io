import { Document, parseDocument, stringify } from 'yaml';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { toMarkdown } from 'mdast-util-to-markdown';

export const DEFAULTS = Object.freeze({
  owner: 'kendreyx', repo: 'kendreyx.github.io', branch: 'master',
  siteUrl: 'https://www.kendrey.top', author: 'Kendrey',
  importFolder: '博客', tokenSecretId: 'kendrey-blog-github-token',
});
export const FIELDS = ['layout', 'title', 'subtitle', 'published', 'hidden', 'date', 'author',
  'lang', 'tags', 'header-style', 'header-img', 'catalog'];
export const MAX_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
const TYPES = new Set('png jpg jpeg webp gif svg avif bmp ico pdf txt zip doc docx xls xlsx ppt pptx'.split(' '));

export function parseNote(raw) {
  const opening = /^(?:\uFEFF)?---\r?\n/.exec(raw);
  if (!opening) return { doc: new Document({}), data: {}, body: raw, bodyStart: 0 };
  const closing = /^---[ \t]*\r?$/m.exec(raw.slice(opening[0].length));
  if (!closing) throw new Error('笔记的 YAML 属性缺少结束分隔线。');
  const end = opening[0].length + closing.index;
  const doc = parseDocument(raw.slice(opening[0].length, end), { version: '1.2' });
  if (doc.errors.length) throw new Error('笔记的 YAML 属性格式有误，请先修正。');
  const data = doc.toJS({ maxAliasCount: 20 }) ?? {};
  if (typeof data !== 'object' || Array.isArray(data)) throw new Error('笔记属性必须是 YAML 对象。');
  let bodyStart = end + closing[0].length;
  if (raw[bodyStart] === '\n') bodyStart += 1;
  return { doc, data, body: raw.slice(bodyStart), bodyStart };
}

export function shanghaiDate(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} +0800`;
}

export function datePart(value) {
  const text = String(value ?? '');
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\s*(Z|[+-]\d{2}:?\d{2}))?)?$/.exec(text);
  if (!match) throw new Error('日期格式应为 YYYY-MM-DD，或包含时间与时区。');
  const [, y, m, d] = match.map(Number);
  const check = new Date(Date.UTC(y, m - 1, d));
  if (y < 1000 || check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) {
    throw new Error('文章日期无效。');
  }
  if (match[4] !== undefined && (+match[4] > 23 || +match[5] > 59 || +(match[6] || 0) > 59)) throw new Error('文章时间无效。');
  if (match[7] && match[7] !== 'Z') {
    const offset = match[7].slice(1).replace(':', '');
    if (+offset.slice(0, 2) > 14 || +offset.slice(2) > 59 || (+offset.slice(0, 2) === 14 && +offset.slice(2) !== 0)) throw new Error('文章时区无效。');
  }
  return text.slice(0, 10);
}

export function metadata(raw, basename, defaults = DEFAULTS, overrides = {}) {
  const { data } = parseNote(raw);
  if (data['blog-sync-backup'] === true) throw new Error('这是同步冲突副本，请在原笔记中合并后发布。');
  const input = { ...data, ...overrides };
  const title = String(input.title ?? basename).trim();
  if (!title) throw new Error('请填写文章标题。');
  const date = String(input.date || shanghaiDate());
  datePart(date);
  const result = {
    layout: 'post', title, published: input.published === true, hidden: input.hidden === true,
    date, author: String(input.author || defaults.author), lang: input.lang === 'en' ? 'en' : 'zh',
    tags: Array.isArray(input.tags) ? input.tags.filter((t) => typeof t === 'string').map((t) => t.trim()).filter(Boolean) : [],
    'header-style': input['header-style'] === 'image' ? 'image' : 'text', catalog: input.catalog !== false,
  };
  for (const key of ['subtitle', 'header-img']) if (typeof input[key] === 'string' && input[key]) result[key] = input[key];
  return result;
}

function slug(value) {
  return String(value).normalize('NFKC').replace(/[^\p{M}\p{L}\p{Nd}]+/gu, '-')
    .replace(/^-|-$/g, '').slice(0, 90).replace(/-$/, '') || 'post';
}

export function postPath(meta) { return `_posts/${datePart(meta.date)}-${slug(meta.title)}.md`; }
export function assertPostPath(path) {
  if (!/^_posts\/\d{4}-\d{2}-\d{2}-[^/\\\x00-\x1f]+\.md$/.test(path) || path.includes('/../')) {
    throw new Error('同步目标必须是 _posts 中的日期命名 Markdown 文章。');
  }
  return path;
}

export function siteBase(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('博客地址应为不含账号和查询参数的 HTTPS 地址。');
  return url.href.replace(/\/+$/, '');
}
export function postUrl(path, meta, site) {
  assertPostPath(path);
  const date = datePart(meta.date || path.slice(7, 17));
  const title = path.slice(18, -3).replace(/[^\p{M}\p{L}\p{Nd}._~!$&'()+,;=@]+/gu, '-').replace(/^-|-$/g, '');
  return `${siteBase(site)}/${date.replaceAll('-', '/')}/${encodeURIComponent(title)}/`;
}

export function localWithMetadata(raw, fields, body) {
  const parsed = parseNote(raw);
  for (const key of FIELDS) {
    if (Object.hasOwn(fields, key)) parsed.doc.set(key, fields[key]);
    else parsed.doc.delete(key);
  }
  return `---\n${parsed.doc.toString({ lineWidth: 0 })}---\n${body ?? parsed.body}`;
}

export function publicNote(raw, fields) {
  return `---\n${stringify(Object.fromEntries(FIELDS.filter((k) => Object.hasOwn(fields, k)).map((k) => [k, fields[k]])), { lineWidth: 0 })}---\n${parseNote(raw).body}`;
}

function renderNode(node) {
  const children = node.type === 'definition' ? [node] : [{ type: 'paragraph', children: [node] }];
  return toMarkdown({ type: 'root', children }).trimEnd();
}

// Parse Markdown so examples inside code fences and inline code remain intact.
export function absoluteBlogLinks(body, site) {
  const base = siteBase(site);
  const patches = [];
  function normalize(node) {
    const result = { ...node };
    if (typeof node.url === 'string' && /^\/(?!\/)/.test(node.url)) result.url = base + node.url;
    if (node.children) result.children = node.children.map(normalize);
    return result;
  }
  function visit(node) {
    if (['link', 'image', 'definition'].includes(node.type) && /^\/(?!\/)/.test(node.url)) {
      patches.push({ start: node.position.start.offset, end: node.position.end.offset, text: renderNode(normalize(node)) });
    } else for (const child of node.children ?? []) visit(child);
  }
  visit(fromMarkdown(body));
  for (const p of patches.sort((a, b) => b.start - a.start)) body = body.slice(0, p.start) + p.text + body.slice(p.end);
  return body;
}

export function fromRemote(localRaw, remoteRaw, path, site, defaults = DEFAULTS) {
  const remote = parseNote(remoteRaw);
  if (remote.data.layout !== 'post') throw new Error('远端文件不是博客文章。');
  const fields = metadata(remoteRaw, path.slice(18, -3), defaults, {
    published: remote.data.published !== false,
    date: remote.data.date || `${path.slice(7, 17)} 12:00:00 +0800`,
  });
  return { text: localWithMetadata(localRaw, fields, absoluteBlogLinks(remote.body, site)), fields };
}

export async function hash(bytes, algorithm = 'SHA-256') {
  const digest = await globalThis.crypto.subtle.digest(algorithm, bytes);
  return [...new Uint8Array(digest)].map((n) => n.toString(16).padStart(2, '0')).join('');
}
export function hashText(text) { return hash(new TextEncoder().encode(text)); }
export async function gitBlobSha(bytes) {
  const header = new TextEncoder().encode(`blob ${bytes.byteLength}\0`);
  const value = new Uint8Array(header.length + bytes.byteLength);
  value.set(header); value.set(bytes, header.length);
  return hash(value, 'SHA-1');
}
export function toBase64(bytes) {
  let text = '';
  for (let i = 0; i < bytes.length; i += 32768) text += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(text);
}
export function decodeText(base64) {
  const binary = atob(base64.replace(/\s/g, ''));
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}
export async function attachment(name, buffer) {
  const bytes = new Uint8Array(buffer);
  const extension = name.split('.').pop().toLowerCase();
  if (!TYPES.has(extension)) throw new Error(`附件格式暂不支持：${extension}`);
  if (bytes.byteLength > MAX_FILE_BYTES) throw new Error('单个附件上限为 8 MiB。');
  const stem = slug(name.slice(0, -(extension.length + 1))).replace(/%/g, '-').slice(0, 40);
  return { path: `img/posts/obsidian/${await hash(bytes)}-${stem}.${extension}`, bytes };
}
export function label(text) { return String(text).replace(/[\r\n]/g, ' ').replace(/[\\[\]]/g, '\\$&'); }
export function reference(text, url, image = false) {
  const encoded = encodeURI(url).replace(/%25([a-f\d]{2})/gi, '%$1').replace(/[()]/g, (c) => `%${c.charCodeAt(0).toString(16)}`);
  return `${image ? '!' : ''}[${label(text)}](${encoded})`;
}
export async function rewriteReferences(raw, refs, resolve) {
  const patches = [];
  for (const item of refs) {
    const start = item.position.start.offset;
    const end = item.position.end.offset;
    if (raw.slice(start, end) !== item.original) throw new Error('笔记索引正在更新，请稍后重试。');
    const text = await resolve(item);
    if (text !== undefined) patches.push({ start, end, text });
  }
  let previous = raw.length;
  for (const p of patches.sort((a, b) => b.start - a.start)) {
    if (p.end > previous) throw new Error('笔记包含需要同时转换的嵌套链接，请先改为单独图片或普通链接。');
    raw = raw.slice(0, p.start) + p.text + raw.slice(p.end);
    previous = p.start;
  }
  return raw;
}
export function pullState(localHash, baseHash, remoteSha, baseSha) {
  if (remoteSha === baseSha) return localHash === baseHash ? 'unchanged' : 'local-only';
  return localHash === baseHash ? 'remote' : 'conflict';
}
