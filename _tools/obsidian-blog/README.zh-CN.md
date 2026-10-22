# Kendrey Blog Sync 0.1.0

这是一个 Obsidian 插件，把**明确选中的笔记**与 Sveltia 使用的 GitHub 博客文章连接起来：

```text
Obsidian 中选中的笔记 ↔ GitHub 的 _posts ↔ Sveltia CMS
                              ↓
                         GitHub Pages
```

## 安装

1. 使用 Obsidian **1.11.4 或更新版本**。插件使用官方 SecretStorage 和共享密钥选择器。
2. 下载 `obsidian-kendrey-blog-sync-0.1.0.zip`，将其中的 `kendrey-blog-sync` 文件夹解压到自己的笔记库 `.obsidian/plugins/` 下。最终路径应为 `.obsidian/plugins/kendrey-blog-sync/manifest.json`。
3. 在 Obsidian「设置 → 第三方插件」重新加载插件列表，启用 **Kendrey Blog Sync**。受限模式需要关闭。
4. 打开插件设置，默认仓库已填写为 `kendreyx/kendreyx.github.io`、分支 `master`。在 **GitHub Token** 处选择或新建 Obsidian 共享密钥，填入只对该仓库授权 **Contents: Read and write** 的 GitHub 令牌，然后点击「测试连接」。可使用 Sveltia 的同等权限令牌。

令牌由 Obsidian 官方 SecretStorage 管理；本插件的 `data.json` 只保存密钥名称、配置及已关联笔记的同步基线。此工具不依赖 Codex 云环境，也不需要克隆整个博客仓库。

插件使用 Obsidian 跨平台 API，安装包没有桌面专属依赖。电脑可按以上路径安装；Android/iOS 也需要把插件文件放入笔记库对应目录。真实设备上的安装、共享密钥和网络访问仍需本地验证，本仓库的自动测试不能替代设备验收。

## 日常使用

### 发布本地笔记

打开要发布的 Markdown 笔记，点击左侧上传图标，或在命令面板选择 **Kendrey Blog Sync: 发布或更新当前笔记**。

- 填写标题、日期、语言和标签。
- 新笔记的「公开发布」默认关闭，提交后是博客草稿；打开后随 GitHub Pages 构建公开。
- 「展示在首页」关闭时生成 `hidden: true`，仍在归档、搜索和文章链接中展示。
- 只处理当前笔记及正文直接引用的附件。其他笔记不自动上传；未关联的笔记链接转为显示文字，并在提交后提示。
- 标题生成 `_posts/YYYY-MM-DD-标题.md`；关联建立后，修改标题不会创建第二篇文章。
- Obsidian 的私有属性保留在本地，远端只写入当前 CMS 支持的文章字段。

仓库公开，因此博客草稿的源码和附件也能通过 GitHub 查看。「草稿」表示不进入博客前台，不表示私密存储。

### 拉取 CMS 修改

在 Sveltia 修改并保存文章后，打开对应的本地笔记，运行 **拉取当前笔记的 CMS 修改**。

- 本地未改动时，更新正文与博客属性，保留其他本地属性。
- 双方都修改时，原笔记不动，CMS 最新版本保存到「博客/同步冲突」副本中。比较、合并后再发布。
- 发布碰到远端更新时先保留 CMS 副本，再由你明确决定是否使用本地版本替换；写入期间再次发生远端更新则停止提交。
- 远端删除不会删除本地笔记，本地删除也不会触发远端删除。

### 导入已有文章

运行 **从博客选择文章导入**，搜索日期文件名并选择。默认导入到笔记库的「博客」目录，随后可以继续在 Obsidian 或 Sveltia 编辑。重名的本地文件会另存，不覆盖原文件。

**解除当前笔记的博客关联**只移除同步记录，保留双方文件。不要用它绕过冲突；应先查看 CMS 副本并完成合并。

## 图片、附件与 Markdown

- `![[图片.png]]`、本地 Markdown 图片和普通附件链接会转换为博客链接。
- 本地附件上传到 `img/posts/obsidian/`，按内容哈希命名。文章和附件合成一次 Git 提交，减少重复构建。
- 每个附件上限 8 MiB，单次最多 20 个、合计 20 MiB；图片、PDF、TXT、ZIP 和常见 Office 格式受支持。文章正文上限 1 MiB。
- 已有 R2 图片 URL 直接保留；本版本上传本地附件使用 GitHub，尚未实现 Obsidian 内直接上传 R2。
- 已关联文章的双链转换为博客文章链接。笔记嵌入 `![[另一篇笔记]]`、块引用和 Dataview 等专有语法不作为网页动态内容执行；嵌入笔记需先改为文字或普通链接。
- 从 CMS 导入的站内图片链接在本地转换为完整博客 URL，代码示例保持原样。远端图片显示需要网络。

## 维护与验证

在此目录运行：

```text
npm ci
npm test
npm run build
```

构建输出为忽略的 `dist/`，并生成博客 `downloads/` 下的安装包。打包文件只有 `main.js`、`manifest.json`、样式、本文档和许可证，不包含笔记、令牌、插件用户配置或依赖目录。

GitHub API 端点固定为 `api.github.com`。所有提交使用版本校验及非强制的分支更新；API 请求测试使用内存仓库，不向真实 GitHub 写入笔记。
