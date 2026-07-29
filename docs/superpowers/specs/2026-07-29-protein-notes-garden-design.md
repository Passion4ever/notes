# 蛋白质知识笔记站设计文档

日期：2026-07-29
状态：已确认，待实现

## 1. 背景与目标

作者是蛋白质／酶方向的博士生，已有一个 Astro 学术主页（`academic-homepage` → `passion4ever.org`）。现在需要一个**可回看的个人知识笔记站**，用来记录：

- 蛋白质基础知识（氨基酸的一/三字母代号、中文名、化学结构、理化性质等）
- 算法与方法的个人理解（flow matching、transformer 等）

明确排除的形态：

- **不是 blog** —— 不要时间线、不要「第 N 篇文章」、不要发布仪式感
- **不用笔记软件** —— 内容是纯文本 markdown，存在自己的 git 仓库里

核心使用场景是**回看**：几个月后想起「二硫键那事儿」，能快速找到，并且能顺着链接跳到相关概念。

### 成功标准

1. 想到什么就能写一篇，不需要先决定它「属于哪一章」
2. 回看时既能搜到，也能靠概念之间的链接跳转
3. 化学结构图不需要手工找图、存图
4. 写完 `git push` 就上线，没有别的步骤

## 2. 组织模型：数字花园

采用**数字花园（digital garden）**而非分层手册。

每篇笔记是一个**原子概念**（「二硫键」「米氏方程」「flow matching」），没有时间顺序，没有章节编号。笔记之间通过 `[[双向链接]]` 和标签互联。

**为什么不用分层手册：** `flow matching` 同时属于「生成模型」「与 diffusion 的对比」「蛋白质结构生成」。树状目录只能选一个父节点，其余关系会丢失。而且固定目录会产生「这一章还没写完」的债务感，抑制随手记录。

**回看路径的差异：** 手册靠目录找，花园靠链接跳。

## 3. 内容模型

### 3.1 原子笔记

位置：`src/content/notes/**/*.{md,mdx}`

frontmatter 刻意保持最小，降低写作摩擦：

```yaml
---
title: 二硫键
tags: [蛋白质结构, 翻译后修饰]
aliases: [disulfide bond, S-S 键]   # 可选
---
```

- **没有** `date` / `description` / `draft` —— 这些属于 blog，不属于笔记
- 文件名是英文 slug（`disulfide-bond.md` → `/n/disulfide-bond`），保证 URL 干净可复制
- `aliases` 让中文和英文都能链接过去

**「最后更新时间」不由 frontmatter 提供**，而是构建时从 git 取该文件最后一次提交的时间（`git log -1 --format=%cI -- <file>`）。这样既能在首页做「最近更新」排序，又完全不增加写作负担。若文件尚未提交（本地新建），回退到文件 mtime。

Astro content collection 用 zod 校验 schema，frontmatter 写错在构建时直接报错。

### 3.2 氨基酸数据

位置：`src/data/amino-acids.yaml`

**这不是一套通用的「结构化数据系统」，而是全站唯一一份特例。**

判断某类内容该用数据驱动还是直接写 markdown 表格，标准只有一条：**是否需要从别的笔记 `[[链接]]` 到单个条目**。需要 → 每个条目得有自己的页面 → 数据驱动；不需要 → 就是一张表，直接写在笔记正文里。

氨基酸符合前者：写「二硫键」时会链到 `[[半胱氨酸]]`，写「疏水核心」时会链到 `[[亮氨酸]]`。20 个页面结构完全相同，手写 20 遍没有意义。

字段：

```yaml
- code1: C
  code3: Cys
  name_zh: 半胱氨酸
  name_en: Cysteine
  smiles: "N[C@@H](CS)C(=O)O"
  mw: 121.16
  pka_side: 8.33          # 侧链 pKa，无则省略
  hydropathy: 2.5         # Kyte-Doolittle
  charge: neutral         # positive | negative | neutral
  polarity: polar         # polar | nonpolar
  essential: false
  note: 可形成二硫键；活性位点常见亲核残基
```

以后若出现第二张表（缓冲液、限制酶等），默认先写成 markdown 表格；只有当确实需要单条目页面时才升级为数据驱动。升级是纯机械操作，先写表格不会浪费。

## 4. 双向链接机制

这是整个系统的核心，也是唯一需要自己实现的部分。

### 4.1 语法

正文中书写：

```markdown
[[半胱氨酸]]
[[半胱氨酸|Cys 残基]]     显示为「Cys 残基」
```

### 4.2 解析

remark 插件在构建时将 `[[...]]` 转换为真实链接，解析顺序：

1. 匹配笔记的 `title`
2. 匹配 `aliases` 中任一项
3. 匹配文件 slug
4. 匹配氨基酸条目的 `name_zh` / `name_en` / `code3`

匹配忽略大小写和首尾空白。

### 4.3 未解析链接不是错误

链接到还不存在的笔记，**渲染为虚线下划线的灰色链接**，指向占位页 `/n/[slug]`，页面内容为：

> 这篇还没写。以下页面提到了它：（反链列表）

这是刻意的设计：**未写链接就是待写清单**，从实际阅读需求中自然生长，而不是预先规划。

构建时在控制台输出所有未解析链接的汇总，但**不使构建失败**。

### 4.4 反链

构建时扫描全部笔记，建立链接图。每个页面底部渲染「被这些页面提到」列表。氨基酸详情页同样参与。

**明确不做力导向关系图。** 节点超过五十个后即为一团乱线，实际不用于导航；反链已经完整回答了「这个概念还和什么相关」。

## 5. 页面结构

| 路由 | 内容 |
| --- | --- |
| `/` | 全部笔记按标签分组 + 最近更新 + 搜索框 |
| `/n/[slug]` | 笔记正文 + 标签 + 反链（含未写占位页） |
| `/tags/[tag]` | 该标签下所有笔记（中文标签在 URL 中做 encodeURIComponent，页面上显示原文） |
| `/aa` | 氨基酸总表，可按疏水性 / 电荷 / 分子量筛选排序 |
| `/aa/[code]` | 单个氨基酸详情：结构图 + 性质 + 反链 |

**搜索**使用 Pagefind：构建时自动生成静态索引，无需维护，支持中文。

## 6. 组件

### 6.1 `<Mol smiles="..." />` —— 小分子结构图

使用 **SmilesDrawer 2.4.1**，客户端渲染 SVG。

关键实现细节（已验证）：

- 目标元素必须是 `<svg>`，不是 `<canvas>` —— `SmiDrawer` 底层走 `SvgDrawer` 路径
- 使用高层 `SmiDrawer` API：`new SmiDrawer({width, height}).draw(smiles, svgEl, 'light', onSuccess, onError)`
- 脚本仅在含分子的页面加载

选型依据：与 RDKit.js 实际渲染对比后选定，元素配色（N 蓝、O 红、S 黄）有助于快速辨认残基性质，适合速查场景。

**错误处理：** SMILES 解析失败时原样显示字符串并给出提示，不影响页面其余部分。

### 6.2 `<Structure />` —— 蛋白质三维结构

使用 **Mol\* (molstar 5.7)**，复用 `vscode-mol-viewer` 仓库中已有的 `molstar.Viewer.create()` 高层封装与 `MOLSTAR_CONFIG` 配置。不使用底层 plugin API。

```jsx
<Structure pdb="1UBQ" caption="泛素，典型的 β-grasp 折叠" />
<Structure src="/structures/my-design.cif" caption="自己跑的设计" />
```

支持远程 PDB ID 和本地文件（`public/structures/`）。

**懒加载是硬性要求：** Mol\* 构建产物约 3–5 MB。页面初始只渲染占位卡片（PDB ID + 名称 + 静态缩略图），**用户点击后才加载 Mol\* 并初始化 viewer**。未点击则零字节下载。

### 6.3 其他

- `<Backlinks />` —— 反链列表
- `<NoteCard />` —— 首页 / 标签页的笔记卡片

## 7. 技术栈

沿用主页技术选型，保证心智负担最小：

- Astro 6 + MDX
- Tailwind 4 + `@tailwindcss/typography`
- KaTeX（`remark-math` + `rehype-katex`）—— flow matching 等笔记需要
- 字体：Source Serif 4 + Noto Serif SC

**单语中文，不配置 i18n。** 笔记是给自己看的，双语切换是纯负担。

视觉上与主页同一家族（相同字体与基调），但不必逐像素一致。

## 8. 目录结构

```
notes/
├─ src/
│  ├─ content/
│  │  └─ notes/              *.md — 原子笔记
│  ├─ data/
│  │  └─ amino-acids.yaml
│  ├─ components/
│  │  ├─ Mol.astro
│  │  ├─ Structure.astro
│  │  ├─ Backlinks.astro
│  │  └─ NoteCard.astro
│  ├─ layouts/
│  │  └─ Note.astro
│  ├─ lib/
│  │  ├─ wikilink.ts         remark 插件：[[x]] → <a>
│  │  └─ linkgraph.ts        链接图与反链构建
│  ├─ pages/
│  │  ├─ index.astro
│  │  ├─ n/[slug].astro
│  │  ├─ tags/[tag].astro
│  │  └─ aa/
│  │     ├─ index.astro
│  │     └─ [code].astro
│  ├─ content.config.ts
│  └─ styles/
├─ public/
│  └─ structures/            自己的 PDB / CIF 文件
├─ docs/
├─ astro.config.mjs
├─ package.json
└─ .github/workflows/deploy.yml
```

`src/lib/` 中两个模块职责明确、可独立测试：

- `wikilink.ts` —— 输入 markdown AST 与名称解析表，输出改写后的 AST。不接触文件系统。
- `linkgraph.ts` —— 输入全部笔记与氨基酸条目，输出 `{ slug → 出链[] }` 与 `{ slug → 反链[] }`。纯函数。

## 9. 部署

- 新建独立仓库，与 `academic-homepage` 完全分离
- GitHub Actions，复用主页 `deploy.yml` 的结构（checkout → setup-node 20 → `npm ci` → `npm run build` → `upload-pages-artifact` → `deploy-pages`）
- 域名：`notes.passion4ever.org`（CNAME）
- 主页导航栏增加一个指向该域名的外链

**写作流程：** 编辑器写 markdown → `git push` → 自动上线。本地 `npm run dev` 实时预览。

## 10. 错误处理

| 情况 | 行为 |
| --- | --- |
| frontmatter 字段缺失或类型错误 | zod 校验失败，构建报错 |
| `[[链接]]` 无法解析 | 渲染为虚线占位链接；控制台汇总输出；**不中断构建** |
| SMILES 解析失败 | 该位置显示原始字符串 + 错误提示；页面其余正常 |
| PDB ID 不存在 / 结构文件加载失败 | 占位卡片显示错误信息，不影响页面 |
| 氨基酸 YAML 字段缺失 | 构建报错（数据源唯一且可控，应严格） |

## 11. 测试

- **`wikilink.ts`** —— 单元测试覆盖：基本链接、带显示文本的链接、alias 命中、大小写差异、未解析链接、同一段落多个链接、代码块内的 `[[...]]` 不应被转换
- **`linkgraph.ts`** —— 单元测试覆盖：反链正确性、自引用、双向互链、指向不存在笔记的链接
- **构建冒烟测试** —— `npm run build` 成功，且断言关键路由（`/`、`/n/*`、`/aa`、`/aa/cys`）产出了 HTML
- 组件渲染（`Mol` / `Structure`）依赖浏览器运行时，不做自动化测试；以少量固定样例人工验收

## 12. 明确不做的事

- 力导向关系图
- 双语 / i18n
- 评论系统
- RSS（这不是 blog）
- 通用化的「结构化数据」框架 —— 氨基酸是唯一特例
- 构建时预渲染分子结构图（客户端渲染已足够；如日后成为性能瓶颈再议）
