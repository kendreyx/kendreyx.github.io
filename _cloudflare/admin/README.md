# 独立 Cloudflare Access 后台入口（当前未启用）

当前博客已选择 GitHub Pages 托管 Sveltia，并使用现有 GitHub Token 登录。本目录不参与博客发布；公开图床按 [R2 接入说明](../r2/README.zh-CN.md)配置。以下是独立入口实现的说明。

此目录提供独立的 `admin.kendrey.top` Worker。它尚未部署，现有 GitHub Pages 的 `/admin/` 入口未改动。只有在 Cloudflare Access 应用、管理员策略、Worker 部署和真实访问验证完成后，才能切换或关闭原公开入口。

每个请求都先验证 `Cf-Access-Jwt-Assertion`：只接受 RS256，使用配置的 Cloudflare Access 团队公钥核验签名、issuer、应用 AUD 和过期时间，再检查签名内的邮箱是否在管理员白名单。仅伪造邮箱请求头不能登录。配置缺失、令牌缺失、签名错误或公钥获取失败都会拒绝访问。响应一律 `no-store`，HTML、配置和图标均须鉴权后读取。

## 当前可验证的部分

```bash
cd /workspace/kendreyx.github.io/_cloudflare/admin
npm ci --cache /workspace/.cache/npm
npm run check
WRANGLER_SEND_METRICS=false npm run dry-run
```

资产构建仅把仓库的 `admin/index.html`、`admin/config.yml` 和 `img/favicon.png` 复制到本目录忽略的 `.assets/`，不复制其他源码、文档或凭据。`workers_dev` 和 `preview_urls` 均关闭，`assets.run_worker_first: true` 确保资源请求先经过 Worker，禁止由资产绑定绕过验证。

Node 测试注入本地 JWKS，并使用真实 RSA 密钥签发、校验 JWT；生产代码和测试均调用同一 `jwtVerify`，没有测试免登录分支。

## 上线前需要的 Cloudflare 配置

1. 在对应 Cloudflare 账号中，为实际后台域名创建 **Cloudflare Access Self-hosted 应用**，保护整个域名的所有路径；管理员登录策略仅允许指定邮箱。不要添加 Allow Everyone、Bypass 或公开路径。
2. 记录团队域名和该应用的 Application Audience（AUD）。团队域名填写主机名形式，例如团队实际的 `*.cloudflareaccess.com`，不含协议和路径。
3. 在安全的执行环境配置以下变量。管理员邮箱只读自环境，不写入公开模板；Cloudflare API Token 只提供给 Wrangler，也不进入 Worker 或静态资源。

| 环境变量 | 用途 |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Account ID；可覆盖模板已确认账号 |
| `ADMIN_DOMAIN` | 实际后台域名；可覆盖模板的 `admin.kendrey.top` |
| `ADMIN_EMAILS` | 管理员邮箱，多个邮箱以英文逗号分隔 |
| `ACCESS_TEAM_DOMAIN` | Access 团队主机名 |
| `ACCESS_AUD` | 此后台 Access 应用的 AUD |
| `CLOUDFLARE_API_TOKEN` | Wrangler 部署凭据，值不得提交到 Git |

4. 环境变量就绪后执行：

```bash
npm run configure
npm run deploy
```

`configure` 在本目录生成 Git 忽略、权限为 `0600` 的 `wrangler.production.jsonc`。此文件包含实际管理员白名单，禁止提交或贴出。模板和默认配置没有管理员邮箱或 Access 凭据；缺必要配置时 `configure` 和 `deploy` 会停止，默认 Worker 返回 503。

部署脚本只接受已填写实际 Account ID、受保护自定义域名、Access 配置、Worker-first ASSETS 且公共预览关闭的配置。也可用 `npm run deploy -- wrangler.production.jsonc` 指定本地文件。不要使用其他发布命令跳过这项检查。

## 必须完成的上线验证

- 未登录访问后台 HTML、配置文件和图标时，先出现 Access 登录；不能直接读到资源。
- 白名单管理员正常登录后，可读取后台；不在白名单的已登录账号被拒绝。
- 直接伪造邮箱请求头、移除 JWT、使用过期或其他应用的 JWT 都不能访问。
- 对每次资源访问检查 `Cache-Control: private, no-store, max-age=0`；确认 Workers 公共域名和预览入口关闭。
- 在真实域名验证后再切换站点入口；在原公开入口仍可访问时，不应称整个后台已经私有化。

此 Worker 负责后台入口访问控制。Sveltia 对 GitHub 的写入仍使用后台自己的 GitHub 授权，两层授权分别生效。
