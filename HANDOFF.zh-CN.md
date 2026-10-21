# Kendrey Blog 维护交接文档

日常文章管理现可使用 [Sveltia CMS 后台](https://blog.kendrey.top/admin/)，手机和电脑均可操作。首次登录、草稿发布和图片管理见 [后台使用说明](_doc/CMS.zh-CN.md)。

## 1. 项目说明

这是一个使用 Jekyll 4 和 Liquid 模板构建的静态博客，通过 GitHub Actions 发布到 GitHub Pages。

- 本地项目目录：`D:UsersDoreyDocumentsChatGPTHomepage`
- GitHub 仓库：`https://github.com/kendreyx/kendreyx.github.io`
- 网站地址：`https://blog.kendrey.top`
- 默认分支：`master`
- 本机 Ruby：`C:Ruby31-x64`
- 本地预览默认地址：`http://127.0.0.1:4000`

## 2. 使用 VS Code 打开项目

在 PowerShell 中执行：

```powershell
cd D:UsersDoreyDocumentsChatGPTHomepage
code .
```

建议安装的 VS Code 扩展：

- Markdown All in One
- YAML
- Liquid
- markdownlint

这些扩展不是网站运行所必需的，只用于改善编辑体验。

## 3. 本地预览

重新打开 PowerShell 后，Ruby 通常已经加入 PATH。执行：

```powershell
cd D:UsersDoreyDocumentsChatGPTHomepage
bundle install
bundle exec jekyll serve --livereload
```

浏览器打开：

`http://127.0.0.1:4000`

保存文章或模板后，Jekyll 会自动重新构建，浏览器会自动刷新。

如果当前终端找不到 `bundle`，先执行：

```powershell
$env:Path = "C:Ruby31-x64in;$env:Path"
bundle exec jekyll serve --livereload
```

停止服务器：在运行服务器的终端中按 `Ctrl+C`。

## 4. 目录结构

| 路径 | 用途 |
| --- | --- |
| `_config.yml` | 网站标题、URL、邮箱、头像、分页和功能开关 |
| `_posts/` | 已发布文章 |
| `_drafts/` | 尚未发布的草稿和文章模板 |
| `img/posts/` | 新文章使用的图片 |
| `_layouts/` | 页面整体布局 |
| `_includes/` | 导航、页脚、页头、搜索和侧栏组件 |
| `index.html` | 首页文章列表及无文章占位状态 |
| `about.html` | About 页面入口 |
| `_includes/about/` | About 页中英文正文 |
| `css/particle-background.css` | 动态页头背景样式 |
| `js/particle-background.js` | 动态粒子背景逻辑 |
| `img/site-icon.png` | 网站图标母版 |
| `HANDOFF.zh-CN.md` | 本交接文档 |

## 5. 新建文章

从 `_drafts/post-template.md` 复制一份到 `_posts/`，然后将文件命名为：

`YYYY-MM-DD-title.md`

例如：

`2026-09-25-hello-world.md`

文章开头必须保留 Front Matter：

```yaml
---
layout: post
title: "文章标题"
subtitle: "可选副标题"
date: 2026-09-25 12:00:00 +0800
author: "KendreyX"
header-style: text
catalog: true
tags:
  - 随笔
  - 技术
---
```

字段说明：

- `layout: post`：使用文章布局。
- `title`：文章标题。
- `subtitle`：可选副标题。
- `date`：发布时间和时区。
- `author`：作者名称。
- `header-style: text`：使用当前粒子动态页头。
- `catalog: true`：显示文章目录。
- `tags`：首页和归档页使用的标签。

只有文件名符合日期格式并放入 `_posts/` 的文章才会正常发布。

## 6. 文章图片

将图片放到：

`img/posts/`

Markdown 中使用站点根路径引用：

```markdown
![图片说明](/img/posts/图片名称.png)
```

建议：

- 文件名使用小写英文、数字和短横线。
- 图片尽量压缩后再提交。
- 不要引用本机绝对路径。
- 不要把图片放入 `_site/`，因为该目录每次构建都会重新生成。

## 7. 草稿工作流

草稿可以继续保存在 `_drafts/`。预览草稿时执行：

```powershell
bundle exec jekyll serve --livereload --drafts
```

准备发布时：

1. 检查 Front Matter。
2. 将文件移动到 `_posts/`。
3. 按 `YYYY-MM-DD-title.md` 重命名。
4. 本地检查首页、文章页和归档页。
5. 提交并推送到 GitHub。

## 8. 修改网站信息

网站基础信息在 `_config.yml`：

```yaml
title: Kendrey Blog
SEOTitle: Kendrey Blog
email: helloworld@kendrey.top
url: "https://blog.kendrey.top"
```

修改 `_config.yml` 后需要重启本地 Jekyll 服务器，单纯保存文件可能不会让配置自动生效。

About 内容位于：

- `_includes/about/zh.md`
- `_includes/about/en.md`

首页副标题位于 `index.html` 顶部的 Front Matter。

## 9. 网站图标

图标文件：

- `img/site-icon.png`：高清母版
- `img/favicon.png`：浏览器标签页图标
- `img/apple-touch-icon.png`：Apple 设备图标
- `pwa/icons/128.png`：PWA 小图标
- `pwa/icons/512.png`：PWA 大图标

更换图标后如果浏览器仍显示旧图标：

1. 使用 `Ctrl+F5` 强制刷新。
2. 清除该站点缓存。
3. 在浏览器开发者工具的 Application 页面注销旧 Service Worker。
4. 关闭并重新打开标签页。

## 10. 发布到 GitHub Pages

确认本地预览正常后：

```powershell
git status
git add .
git commit -m "Update blog content"
git push origin master
```

推送到 `master` 后，`.github/workflows/jekyll.yml` 会自动构建并发布。

可在 GitHub 仓库的 Actions 页面查看部署状态。

## 11. 不应手工编辑的内容

- `_site/`：Jekyll 自动生成目录。
- `.jekyll-cache/`：Jekyll 缓存。
- `Gemfile.lock`：除非明确需要升级依赖。
- `css/hux-blog.min.css` 和 `js/hux-blog.min.js`：属于旧主题编译产物；普通文章编辑不需要修改。

## 12. 当前待办

原文章和文章专用配图已经清理，目前首页显示“内容准备中”。

后续建议依次处理：

1. 替换 `_config.yml` 中仍保留的站点描述、关键词和侧栏介绍。
2. 重写 `_includes/about/zh.md` 与 `_includes/about/en.md`。
3. 检查友情链接列表。
4. 编写第一篇正式文章。
5. 确认手机端样式和 GitHub Pages 线上效果。
