# Cloudflare 接入与部署状态

公开桶信息已记录，独立 CMS 管理入口和 R2 接入材料已准备。此目录以 `_` 开头，不进入默认 Jekyll 网站产物。配置草稿、代码和本地测试均不代表线上资源已经配置完成。

## 准备的入口

- `admin.kendrey.top/admin/`：Sveltia 文章管理。Cloudflare Access 邮箱验证通过后才返回后台页面，Worker 再校验 Access JWT 与邮箱白名单。
- 公开图床：R2 桶 `timeless782`，初期联调用用户提供的 `r2.dev` 地址，正式使用再绑定图片域名。
- 私密文件及限时分享：仍按[存储服务规划](../_doc/Media-storage-plan.zh-CN.md)实施，使用另一个不启用公开地址的桶。

## 安全配置

通过云环境设置填写 `CLOUDFLARE_API_TOKEN`，不要放进聊天、源码或提交历史。部署身份需要下列权限；账户范围仅选择目标账户，Zone 范围仅选择 `kendrey.top`：

| 权限 | 用途 |
| --- | --- |
| Account → Workers Scripts → Edit | 部署管理 Worker 和绑定 Custom Domain |
| Account → Access: Apps and Policies → Edit | 创建 Access 应用和允许登录的邮箱策略 |
| Account → Access: Organizations, Identity Providers, and Groups → Edit | 读取 Access 团队配置，配置邮箱验证码身份提供者 |
| Account → Workers R2 Storage → Edit | 读取并配置公开桶 CORS |
| Zone → Zone → Read | 查找该域名的 Zone ID |

若已开通 Zero Trust 且配置好邮箱验证码身份提供者，组织与身份提供者权限可降为 Read。仅使用 Workers Custom Domain API 自动绑定 DNS，无需请求 DNS Edit 或 Workers Routes Edit。若尚未开通 Zero Trust，先在 Cloudflare 控制台完成 Free 套餐开通，再进行 Access 配置；开桶不会自动开通 Zero Trust。部署时不自动升级付费套餐。

`ADMIN_EMAILS` 是管理入口的允许列表，只保存在环境设置及被 Git 忽略的部署配置中，不提交公开仓库。`CLOUDFLARE_ACCOUNT_ID`、`ADMIN_DOMAIN` 已有非密钥建议值。

公开媒体库另需 `R2_PUBLIC_ACCESS_KEY_ID`（R2 的 **Access Key ID**，不是 Account ID，也不是 Secret Access Key）。其对象读写权限仅授权 `timeless782`。对应 Secret 由管理员在 Sveltia 浏览器设置中填写，不绑定到管理 Worker，也不提交配置。

## 部署顺序

1. 检查部署凭据、域名和现有 Zero Trust 配置。创建或复用邮箱 OTP 身份提供者，并为独立管理域名创建覆盖全路径的 Access 应用，仅允许确认的邮箱。不得增加 Everyone 或 Bypass 策略。
2. 将该应用的团队域名和 audience 写入 Worker 部署配置，构建管理静态资源并部署。设置 `workers_dev: false`、`preview_urls: false`、`assets.run_worker_first: true`；缺配置时拒绝返回管理资源。
3. 验证无登录、错误账号、过期或伪造 JWT 被拒绝；验证正确账号能读取后台 HTML 和配置。可用时再在 Workers 控制台启用 Worker 级 Access「All traffic」。
4. 验证新后台可用后，再将原来的 CMS HTML/config 从公开 Jekyll 产物排除，并更新博客页脚管理链接。旧 `/admin/` 仅保留跳转；检查 GitHub Pages 域名和旧博客域名不会再返回原 CMS 页面。此步骤在真实部署验证前不执行，避免中断现有编辑。
5. 按 [R2 接入说明](r2/README.zh-CN.md)配置媒体库。修改 CORS 前先读取并保存现有规则，合并必要配置后再写回，不直接覆盖未知的现有规则。验证手机、电脑上传及公开图片链接。

Access 登录控制管理页面访问；Sveltia 原有 GitHub PAT 仍控制文章读写，R2 对象凭据控制媒体读写。部署令牌不发给浏览器。公开仓库源代码及公开图床资源仍可被访客读取。

云环境的配置草稿需要用户在环境设置中填写、保存并发布后才能应用；保存草稿不会自动部署 Worker，也不会修改 R2。线上启用状态应以真实 Access、Worker 和上传验收结果为准。
