# Obsidian 与 Sveltia CMS 双向同步

使用博客专用插件 **Kendrey Blog Sync 0.1.0**，让 Obsidian 与 Sveltia 编辑 GitHub 中同一批文章。

[下载安装包](https://www.kendrey.top/downloads/obsidian-kendrey-blog-sync-0.1.0.zip) · [完整安装和使用说明](../_tools/obsidian-blog/README.zh-CN.md)

## 安装一次

1. Obsidian 更新到 **1.11.4 或更新版本**，将压缩包内的 `kendrey-blog-sync` 目录放入笔记库的 `.obsidian/plugins/`，在第三方插件中启用。
2. 插件已预设博客仓库和 `master` 分支。在设置里选择或新建 GitHub Token 共享密钥，只授权该仓库 **Contents: Read and write**，点击「测试连接」。

令牌由 Obsidian 的官方 SecretStorage 管理；插件不会把整个笔记库作为博客仓库同步。

## 日常三个操作

| 操作 | 使用方式 |
| --- | --- |
| 发布一篇笔记 | 打开笔记，点击上传图标，选择草稿/公开、首页展示和语言后提交 |
| 接收 CMS 改动 | 在原笔记运行「拉取当前笔记的 CMS 修改」 |
| 编辑已有博客 | 运行「从博客选择文章导入」，随后本地编辑并发布 |

双方同时修改时保留原笔记，并把 CMS 最新版放进「博客/同步冲突」供比较。博客文章和本地笔记的删除不自动互相传播。

本地图片和附件随选中的笔记上传到 GitHub `img/posts/obsidian/`，同一次提交发布；现有 R2 URL 可以直接使用。本版本尚未在 Obsidian 中实现直接上传 R2。

新笔记默认是博客草稿。因为 GitHub 仓库公开，草稿源码与附件也能被查看；私密内容请继续保留在未选择发布的笔记中。

插件已通过模拟 GitHub 和 Obsidian API 的自动测试，实际电脑/手机的安装、共享密钥及网络访问仍需本地验收。
