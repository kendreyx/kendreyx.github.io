# R2 与文件服务接入状态

博客和 Sveltia 后台继续托管在 **GitHub Pages**，入口为博客的 `/admin/`。用户已选择仅使用 Sveltia 的 GitHub Token 登录管理文章。文章提交后，现有 GitHub Actions 自动构建和发布。

## 公开图床

使用用户已创建的 R2 桶 `timeless782`，在 Sveltia 原生媒体库管理图片及公开附件。初期用已提供的 `r2.dev` 地址联调，正式使用再绑定图片域名。

1. 在 R2 控制台配置桶 CORS。
2. 在 GitHub 仓库的 Actions **Variables** 中配置 `R2_PUBLIC_ACCESS_KEY_ID`。
3. 运行现有 Pages 工作流；之后每次文章更新都会沿用该配置。
4. 在 Sveltia 浏览器设置中填写限定此桶的 Secret Access Key。

完整操作见 [R2 接入步骤](r2/README.zh-CN.md)。这里的 Access Key ID 是公开标识；Secret 不进入仓库、Actions 变量或博客构建产物。

此流程直接使用 GitHub Pages 与浏览器，不依赖 Codex 云环境发布，也无需为公开图床配置账户级 `CLOUDFLARE_API_TOKEN`。

## 私密文件及限时分享

仍按[存储服务规划](../_doc/Media-storage-plan.zh-CN.md)另行实施。私密文件使用独立私有桶与经过鉴权的服务端接口，分享接口检查有效期和撤销状态；GitHub Pages 承担静态页面托管。

此目录以 `_` 开头，不进入默认 Jekyll 网站产物。公开桶接入材料已准备，真实桶权限、CORS 和上传行为仍须按接入说明验收；私密文件服务尚未上线。
