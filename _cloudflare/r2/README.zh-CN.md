# 公开 R2 媒体库接入

已记录用户提供的公开桶 `timeless782`、Account ID 和开发公开地址，见 `public-bucket.json`。此目录是接入准备材料；不会自动修改线上桶，也不会自动启用 CMS 的 R2 媒体库。

## 在 GitHub Pages 启用（推荐）

1. 在 Cloudflare 的 R2「管理 API 令牌」创建仅授权 `timeless782` 的 **Object Read & Write** 凭据。保留其中的 Access Key ID 和 Secret Access Key；两者用途不同。
2. 先保存此桶已有的 CORS，再合并 `cors.json` 的规则，保留其他必要规则。它只允许当前博客管理域名，匹配 Sveltia 0.250.0 的列出、读取、上传、复制和删除请求。CORS 不是登录验证，也不授予对象权限。
3. 打开本 GitHub 仓库的 **Settings → Secrets and variables → Actions → Variables → New repository variable**，名称填 `R2_PUBLIC_ACCESS_KEY_ID`，值填 **Access Key ID**（32 位十六进制公开标识）。**不要填 Secret Access Key**。
4. 在仓库 **Actions → Deploy Jekyll site to Pages → Run workflow** 中选择 `master` 并运行。构建会将公开 R2 配置注入发布产物的 `admin/config.yml`；以后每次文章提交仍自动沿用该变量。仓库已经有 `media_libraries` 配置时优先使用仓库配置，不覆盖已有媒体库。
5. 等待 Pages 部署成功后，在 Sveltia「设置 → 媒体 → Cloudflare R2」输入 **Secret Access Key**。它只保存在当前浏览器的本地设置中，手机和电脑分别录入，不发送到本仓库。
6. 在媒体库选择 Cloudflare R2，验证图片上传、预览、文章引用及删除，再切换日常使用。

博客和 CMS 继续托管在 GitHub Pages。上述操作不需要发布 Codex 云环境，也不需要账户级 `CLOUDFLARE_API_TOKEN`；桶 CORS 由本人在 Cloudflare 控制台配置，文件操作由浏览器使用限定桶的对象凭据完成。

也可将 Access Key ID 放入本地 `R2_PUBLIC_ACCESS_KEY_ID` 环境变量，执行 `node _cloudflare/r2/configure.mjs`，检查变更后提交配置。ID 会作为公开配置提供给浏览器。脚本拒绝缺失值、Account ID、64 位 Secret 和不符合格式的输入；Actions 变量没有配置时，现有 GitHub 图片上传方式继续正常使用。

原生 R2 集成必须同时有 Account ID、Bucket 和 Access Key ID 才会启用。只填写桶地址不能完成上传，不使用占位 ID 激活媒体库。接入后，原仓库的 `img/posts/` 和已有链接继续保留。

`r2.dev` 用于联调，存在开发用途和限流限制；正式图床应绑定自定义域名，再更新 `public-bucket.json` 和 CMS 的 `public_url`。S3 API 端点不能作为文章图片的公开地址。

此桶用于公开资源。私密文件需要另建不启用公开地址的桶，并通过经过身份验证的文件服务访问；限时分享由该服务检查有效期和撤销状态。

## 验收

- 未持有有效 R2 凭据时，不能上传或删除对象。
- CMS 上传后写入文章的链接使用 `public_url`，访客无需管理员身份即可查看图片。
- 非白名单网页来源不能通过浏览器读取带凭据的 R2 API 响应。
- Sveltia 通过现有 GitHub Token 登录管理文章；后台继续使用博客的 `/admin/` 入口。
