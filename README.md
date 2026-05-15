# Glitter

Glitter 是一个面向 Obsidian 的灵感记录插件，适合保存那些值得留下、却不一定需要立刻建成正式笔记的小点子、片段和灵感。它让你先把内容轻量收住，避免 vault 被大量临时笔记塞满；等真正需要沉淀时，再按需整理、建文件或插回正文。

Glitter is an Obsidian plugin for saving ideas that are worth keeping but not necessarily worth turning into full notes yet. It gives you a lightweight place to catch them first, so your vault does not fill up with throwaway files; when an idea is ready, you can organize it, turn it into a Markdown note, or insert it back into your writing.

<!-- Future media slot: product overview image or short demo -->

## Why Glitter / 为什么使用 Glitter

### 中文
Obsidian 原生内容大多依赖笔记文件承载，但很多灵感并不在出现的当下就值得新建一篇正式笔记。若每次冒出一个小想法都直接建文件，vault 很快会堆满零散、半成品、回头也不容易翻到的笔记。

Glitter 就是为这个空档而设计的：先把文本、链接、图片、视频等灵感轻量保存下来，不强迫它们立刻变成正式文件。之后你可以把它们放进灵感池整理、搜索与回看；当其中某条真的需要独立沉淀或进入写作上下文时，再选择创建 Markdown 文件，或把它作为片段插入正文。

### English
Most content in Obsidian lives in notes, but many ideas are not worth becoming full notes the moment they appear. If every small thought becomes a new file right away, your vault quickly fills with scattered, half-formed notes that are hard to revisit later.

Glitter is built for that gap. It lets you save text, links, images, and videos in a lighter way first, without forcing them to become formal files immediately. Later, you can organize them into pools, search and revisit them, and when an idea is ready to stand on its own or support a piece of writing, turn it into a Markdown note or insert it into a note body as a snippet.

## Quick Start / 快速上手

<!-- Future media slot: quick-start walkthrough -->

### 中文
1. 在 Obsidian 中打开 Glitter，用快速记录入口先把灵感收住，而不是先决定要不要新建笔记。
2. 输入文本，或直接粘贴链接；如果这条灵感本身包含图片或视频，也可以一并保存。
3. 选择合适的灵感池后保存；只有当这条内容真的需要独立沉淀时，再选择为它创建 Markdown 文件。
4. 之后你可以在 Glitter 中搜索、浏览和回看这些灵感；写作时，也可以把某条灵感作为片段插回当前笔记正文。

### English
1. Open Glitter in Obsidian and catch the idea first instead of deciding immediately whether it deserves a new note.
2. Type text or paste a link directly; if the idea includes images or videos, you can save those too.
3. Choose the right pool and save it. Only when the idea really needs to stand on its own do you turn it into a Markdown note.
4. Later, you can search, browse, and revisit the idea in Glitter, or insert it back into a note body as a snippet while writing.

## Feature Areas / 功能分区

<!-- Future media slot: feature overview gallery -->

### 中文
- **先记录，不先建笔记**：先把灵感留下来，避免每个小想法都立刻变成一篇独立文件。
- **多内容类型支持**：支持文本、链接、图片、视频等常见灵感内容；粘贴链接后可自动识别并补全基础信息。
- **灵感池整理**：把灵感放入不同的池中，便于分类、浏览、筛选与后续整理。
- **可选创建文件**：当某条灵感真的需要独立沉淀时，你再决定是否为它创建 Markdown 文件。
- **片段插入**：写笔记时，可以把已有灵感插入正文，方便引用、延展和继续写作。
- **回看与复用**：已经保存的灵感可以持续回看和再利用，而不是被埋在临时笔记里。

### English
- **Capture before note creation**: Keep the idea first instead of turning every small thought into a separate file right away.
- **Support for multiple content types**: Work with text, links, images, and videos, with automatic recognition and basic detail filling when you paste a link.
- **Pools for organization**: Group ideas into different pools so they are easier to classify, browse, filter, and sort later.
- **Optional file creation**: Only when an idea truly needs to stand on its own do you decide whether it should become a Markdown note.
- **Snippet insertion**: Insert an existing idea into a note body while writing so it can be referenced and expanded in context.
- **Revisit and reuse**: Saved ideas stay available for later review and reuse instead of disappearing into temporary notes.

## Design Philosophy / 设计理念

### 中文
Glitter 的设计核心，不是让每个想法都立刻服从 Obsidian 的文件结构，而是在“正式笔记”之前，先给灵感一个更轻的落点。

它想拆开两件常被绑在一起的事：**值得留下来**，和 **值得立刻建文件**。你可以先把灵感保存下来，再决定是否分类、是否创建 Markdown 文件、是否插回正文继续写。这样既能减少 vault 里为了速记而产生的大量临时文件，也能让真正重要的灵感更容易被回看、复用和沉淀。

### English
Glitter is not designed around making every thought fit Obsidian’s file structure immediately. Its core idea is to give an idea a lighter landing place before it has to become a formal note.

It separates two decisions that are often forced together: **this is worth keeping**, and **this deserves its own file right now**. You can save first, then decide whether to classify it, turn it into a Markdown note, or bring it back into a note body as a snippet. That keeps your vault from filling with quick-capture clutter while making important ideas easier to revisit, reuse, and develop.

## Install & Update / 安装与更新

### 中文
**安装**

1. 从本仓库最新 Release 下载 Glitter 发布包。
2. 在你的 vault 中创建文件夹：`.obsidian/plugins/glitter-idea-plugin/`
3. 将发布包中的 `manifest.json`、`main.js` 和 `styles.css` 复制到这个文件夹中。
4. 重新打开 Obsidian，或重新加载社区插件。
5. 打开 **Settings → Community plugins**，启用 **Glitter**。

**更新**

1. 下载最新版本的 Glitter 发布包。
2. 用新的 `manifest.json`、`main.js` 和 `styles.css` 替换旧文件。
3. 重新加载 Obsidian，然后确认 Glitter 已正常启用。

### English
**Install**

1. Download the latest Glitter release package from this repository’s Releases page.
2. In your vault, create this folder: `.obsidian/plugins/glitter-idea-plugin/`
3. Copy `manifest.json`, `main.js`, and `styles.css` from the release package into that folder.
4. Restart Obsidian or reload community plugins.
5. Open **Settings → Community plugins** and enable **Glitter**.

**Update**

1. Download the newest Glitter release package.
2. Replace the existing `manifest.json`, `main.js`, and `styles.css` files with the new ones.
3. Reload Obsidian and confirm Glitter is enabled.

## FAQ / Notes / 常见问题与说明

### 中文
**Q: 为什么不直接在 Obsidian 里新建一篇笔记？**  
A: 因为很多灵感值得留下，但并不值得在出现当下就变成正式笔记。Glitter 的作用，就是先把它们轻量保存下来，减少 vault 里因速记产生的大量临时文件。

**Q: Glitter 适合记录哪些内容？**  
A: 适合快速记录文本、链接、图片和视频等内容；如果你粘贴的是链接，Glitter 还可以自动识别并补全相关信息。

**Q: 每条灵感都会自动创建一个 Markdown 文件吗？**  
A: 不会。是否创建文件是可选的，你可以按自己的整理方式决定。

**Q: Pool（灵感池）是做什么的？**  
A: 灵感池是用来分组整理灵感的。你可以按主题、项目、写作阶段或任何适合自己的方式来分类。

**Q: 我可以把已经保存的灵感重新放回笔记正文吗？**  
A: 可以。Glitter 支持把灵感作为片段插入笔记正文，方便在写作时继续展开和引用。

**Q: 这份 README 之后会补充演示图或视频吗？**  
A: 会。当前版本先聚焦于安装说明和功能说明，后续会在相同章节结构中补充截图与演示媒体。

### English
**Q: Why not just create a note in Obsidian directly?**  
A: Because many ideas are worth keeping without being worth a full note yet. Glitter gives them a lighter place to live first, so your vault does not fill up with quick-capture clutter.

**Q: What kinds of content can Glitter capture?**  
A: Glitter is designed for quickly saving text, links, images, and videos. If you paste a link, it can also recognize it and fill in relevant details automatically.

**Q: Does every idea automatically become a Markdown file?**  
A: No. File creation is optional, so you can decide when an idea should stay lightweight and when it should become its own note.

**Q: What is a pool for?**  
A: A pool is a way to group and organize ideas. You can sort them by topic, project, writing stage, or any structure that fits your workflow.

**Q: Can I bring saved ideas back into my notes later?**  
A: Yes. Glitter supports inserting ideas into note bodies as snippets so they can be reused, referenced, and expanded while you write.

**Q: Will screenshots or demo media be added later?**  
A: Yes. This version focuses on installation and capability overview first, and visual walkthrough media can be added later within the same section structure.
