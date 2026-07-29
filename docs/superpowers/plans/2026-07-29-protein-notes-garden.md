# 蛋白质知识笔记站 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭建一个 Astro 静态站点，以「数字花园」形态承载蛋白质／酶方向的个人知识笔记，支持双向链接、反链、小分子结构图、蛋白质三维结构与全文搜索。

**Architecture:** 内容为 `src/content/notes/` 下的原子 markdown 笔记，外加唯一一份数据驱动特例 `src/data/amino-acids.yaml`。链接系统由三个纯函数模块构成：`linkindex.ts`（名称 → 目标解析）、`wikilink.ts`（remark 插件，把 `[[x]]` 变成真链接）、`linkgraph.ts`（扫全站建反链）。链接索引从**文件系统直接读 frontmatter** 构建（`targets.ts`），不依赖 content collection —— 因为 remark 插件在 Astro 配置期就需要索引，而 collection 此时尚未加载。分子与蛋白组件均为客户端渲染，Mol\* 采取点击才加载的懒加载策略。

**Tech Stack:** Astro 6 · MDX · Tailwind 4 + typography · KaTeX · Vitest · smiles-drawer 2.4.1 · molstar 5.7 · Pagefind 1.x · js-yaml · gray-matter · unist-util-visit

## Global Constraints

- 站点单语中文，**不配置 Astro i18n**
- `site: 'https://notes.passion4ever.org'`
- Node 20（CI 与本地一致）
- 笔记 frontmatter 只允许 `title` / `tags` / `aliases` 三个字段，**不得引入 `date` / `description` / `draft`**
- 「最后更新时间」一律从 git 提交记录取，不写进 frontmatter
- 未解析的 `[[链接]]` **不得使构建失败**，只输出 warning
- Mol\* **必须懒加载**：用户点击前不得下载 `molstar.js`
- 单元测试用 Vitest，文件名 `*.test.ts`，与被测模块同目录
- 每个任务结束必须 commit

---

### Task 1: 项目脚手架与基础布局

**Files:**
- Create: `package.json`
- Create: `astro.config.mjs`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `src/styles/global.css`
- Create: `src/layouts/Base.astro`
- Create: `src/pages/index.astro`
- Create: `public/CNAME`

**Interfaces:**
- Consumes: 无（首个任务）
- Produces: `Base.astro` 接受 props `{ title: string; description?: string }`，提供 `<slot />`；全站 CSS 变量与 typography 样式

- [ ] **Step 1: 创建 `package.json`**

```json
{
  "name": "protein-notes",
  "type": "module",
  "version": "0.1.0",
  "scripts": {
    "dev": "astro dev --force",
    "build": "astro build --force && pagefind --site dist",
    "preview": "astro preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@astrojs/mdx": "^6.0.1",
    "@fontsource-variable/source-serif-4": "^5.2.9",
    "@fontsource/noto-serif-sc": "^5.2.8",
    "@tailwindcss/typography": "^0.5.19",
    "@tailwindcss/vite": "^4.1.17",
    "astro": "^6.2.0",
    "gray-matter": "^4.0.3",
    "js-yaml": "^4.1.0",
    "katex": "^0.16.27",
    "rehype-katex": "^7.0.1",
    "remark-math": "^6.0.0",
    "tailwindcss": "^4.1.17",
    "unist-util-visit": "^5.0.0"
  },
  "devDependencies": {
    "@types/js-yaml": "^4.0.9",
    "pagefind": "^1.3.0",
    "vitest": "^3.0.0"
  }
}
```

**`--force` 不是可选项，删掉它会产生静默的错误输出。** Astro 的内容缓存假设「一个 markdown 文件的渲染结果只取决于它自己的内容」。但 wikilink 插件的输出取决于**全站笔记集合** —— 新写一篇《半胱氨酸》后，别的笔记里 `[[半胱氨酸]]` 的解析结果就变了。不加 `--force` 时缓存会直接端出旧渲染，那个链接会永远停在灰色的 missing 状态。已实测复现并确认 `--force` 可解决。

- [ ] **Step 2: 安装依赖**

Run: `npm install`
Expected: 安装成功，生成 `package-lock.json` 与 `node_modules/`

- [ ] **Step 3: 创建 `tsconfig.json`**

```json
{
  "extends": "astro/tsconfigs/strict",
  "include": [".astro/types.d.ts", "**/*"],
  "exclude": ["dist"]
}
```

- [ ] **Step 4: 创建 `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
```

- [ ] **Step 5: 创建 `astro.config.mjs`**

**注意：`markdown.remarkPlugins` / `markdown.rehypePlugins` 在 Astro 6 已弃用**，必须用 `@astrojs/markdown-remark` 导出的 `unified({...})` 构造 processor。Task 4 会在此追加 wikilink 插件。

```js
// @ts-check
import { defineConfig } from 'astro/config'
import tailwindcss from '@tailwindcss/vite'
import mdx from '@astrojs/mdx'
import { unified } from '@astrojs/markdown-remark'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'

export default defineConfig({
  site: 'https://notes.passion4ever.org',
  integrations: [mdx()],
  vite: {
    plugins: [tailwindcss()],
  },
  markdown: {
    processor: unified({
      remarkPlugins: [remarkMath],
      rehypePlugins: [rehypeKatex],
    }),
  },
})
```

构建时**不应**出现 `markdown.remarkPlugins ... are deprecated` 警告。若出现，说明写法没改对。

- [ ] **Step 6: 创建 `src/styles/global.css`**

```css
@import 'tailwindcss';
@plugin '@tailwindcss/typography';

@import '@fontsource-variable/source-serif-4';
@import '@fontsource/noto-serif-sc/400.css';
@import '@fontsource/noto-serif-sc/600.css';
@import 'katex/dist/katex.min.css';

@theme {
  --font-serif: 'Source Serif 4 Variable', 'Noto Serif SC', Georgia, serif;
}

:root {
  --wikilink: #2563eb;
  --wikilink-missing: #9ca3af;
}

body {
  font-family: var(--font-serif);
}

/* 已存在的双向链接 */
.wikilink {
  color: var(--wikilink);
  text-decoration: none;
  border-bottom: 1px solid color-mix(in srgb, var(--wikilink) 35%, transparent);
}

/* 尚未写的双向链接 —— 虚线灰色，本身即待写清单 */
.wikilink-missing {
  color: var(--wikilink-missing);
  border-bottom: 1px dashed var(--wikilink-missing);
}
```

- [ ] **Step 7: 创建 `src/layouts/Base.astro`**

```astro
---
import '../styles/global.css'

interface Props {
  title: string
  description?: string
}

const { title, description } = Astro.props
---

<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title}</title>
    {description && <meta name="description" content={description} />}
  </head>
  <body class="mx-auto max-w-3xl px-5 py-10 text-neutral-900">
    <header class="mb-10 flex items-baseline gap-4 border-b border-neutral-200 pb-4">
      <a href="/" class="text-lg font-semibold no-underline">笔记</a>
      <a href="/aa" class="text-sm text-neutral-500 no-underline">氨基酸</a>
      <a href="https://passion4ever.org" class="ml-auto text-sm text-neutral-500 no-underline">主页 ↗</a>
    </header>
    <main>
      <slot />
    </main>
  </body>
</html>
```

- [ ] **Step 8: 创建占位首页 `src/pages/index.astro`**

Task 7 会重写这个文件。

```astro
---
import Base from '../layouts/Base.astro'
---

<Base title="笔记">
  <h1 class="text-2xl font-semibold">笔记</h1>
  <p class="mt-2 text-neutral-500">脚手架就绪。</p>
</Base>
```

- [ ] **Step 9: 创建 `public/CNAME`**

```
notes.passion4ever.org
```

- [ ] **Step 10: 验证构建通过**

Run: `npx astro build`
Expected: 构建成功，生成 `dist/index.html`

注意：此时 `npm run build` 会因为 pagefind 还没有可索引内容而可能告警，本步骤只跑 `astro build`。

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts astro.config.mjs src public
git commit -m "feat: Astro 项目脚手架与基础布局"
```

---

### Task 2: 笔记 content collection 与详情页

**Files:**
- Create: `src/content.config.ts`
- Create: `src/content/notes/disulfide-bond.md`
- Create: `src/content/notes/protein-folding.md`
- Create: `src/pages/n/[slug].astro`

**Interfaces:**
- Consumes: `Base.astro`（Task 1）
- Produces: content collection `notes`，每条 entry 具备 `id`（= 文件 slug）、`data.title`、`data.tags`、`data.aliases`、`body`（原始 markdown 字符串）

- [ ] **Step 1: 创建 `src/content.config.ts`**

```ts
import { defineCollection, z } from 'astro:content'
import { glob } from 'astro/loaders'

const notes = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/notes' }),
  schema: z.object({
    title: z.string(),
    tags: z.array(z.string()).default([]),
    aliases: z.array(z.string()).default([]),
  }),
})

export const collections = { notes }
```

- [ ] **Step 2: 创建示例笔记 `src/content/notes/disulfide-bond.md`**

正文中刻意包含一个指向尚不存在的笔记的链接（`[[半胱氨酸]]`），用于后续任务验证「未写链接」行为。

```markdown
---
title: 二硫键
tags: [蛋白质结构, 翻译后修饰]
aliases: [disulfide bond, S-S 键]
---

二硫键是两个 [[半胱氨酸]] 侧链巯基氧化偶联形成的共价键，对 [[蛋白质折叠]] 后的构象稳定性贡献很大。

胞质是还原环境（高浓度谷胱甘肽），因此胞内蛋白很少含二硫键；分泌蛋白在内质网中由 PDI 催化形成。
```

- [ ] **Step 3: 创建示例笔记 `src/content/notes/protein-folding.md`**

```markdown
---
title: 蛋白质折叠
tags: [蛋白质结构]
aliases: [protein folding]
---

折叠的驱动力主要是疏水效应：非极性侧链倾向于埋进核心以减少与水的接触面积。

[[二硫键]] 属于折叠完成后的共价锁定，不是折叠的驱动力。
```

- [ ] **Step 4: 创建 `src/pages/n/[slug].astro`**

本任务先只渲染真实笔记；Task 6 会加入反链与未写占位页。

```astro
---
import { getCollection, render } from 'astro:content'
import Base from '../../layouts/Base.astro'

export async function getStaticPaths() {
  const notes = await getCollection('notes')
  return notes.map((note) => ({
    params: { slug: note.id },
    props: { note },
  }))
}

const { note } = Astro.props
const { Content } = await render(note)
---

<Base title={note.data.title}>
  <article class="prose prose-neutral max-w-none">
    <h1>{note.data.title}</h1>
    <Content />
  </article>

  {
    note.data.tags.length > 0 && (
      <div class="mt-8 flex flex-wrap gap-2">
        {note.data.tags.map((tag) => (
          <a
            href={`/tags/${encodeURIComponent(tag)}`}
            class="rounded bg-neutral-100 px-2 py-1 text-sm text-neutral-600 no-underline"
          >
            {tag}
          </a>
        ))}
      </div>
    )
  }
</Base>
```

- [ ] **Step 5: 验证页面生成**

Run: `npx astro build && ls dist/n/`
Expected: 出现 `disulfide-bond/` 与 `protein-folding/` 两个目录

注意：此时 `[[半胱氨酸]]` 仍以字面文本 `[[半胱氨酸]]` 出现在页面上 —— 这是预期的，Task 4 才会转换它。`/tags/` 链接此时是死链，Task 8 会补上。

- [ ] **Step 6: Commit**

```bash
git add src/content.config.ts src/content src/pages/n
git commit -m "feat: 笔记 content collection 与详情页"
```

---

### Task 3: 链接索引模块 `linkindex.ts`

纯函数模块，不接触文件系统，可完全单元测试。这是 `wikilink.ts` 与 `linkgraph.ts` 共用的解析基础，避免两处各写一套解析逻辑。

**Files:**
- Create: `src/lib/linkindex.ts`
- Test: `src/lib/linkindex.test.ts`

**Interfaces:**
- Consumes: 无
- Produces:
  - `interface LinkTarget { slug: string; href: string; title: string; aliases?: string[] }`
  - `type LinkIndex = Map<string, LinkTarget>`
  - `normalizeName(name: string): string`
  - `buildIndex(targets: LinkTarget[]): LinkIndex`
  - `resolve(index: LinkIndex, name: string): LinkTarget | null`
  - `missingHref(name: string): string`

- [ ] **Step 1: 写失败的测试 `src/lib/linkindex.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { normalizeName, buildIndex, resolve, missingHref, type LinkTarget } from './linkindex'

const TARGETS: LinkTarget[] = [
  { slug: 'disulfide-bond', href: '/n/disulfide-bond', title: '二硫键', aliases: ['disulfide bond', 'S-S 键'] },
  { slug: 'protein-folding', href: '/n/protein-folding', title: '蛋白质折叠', aliases: ['protein folding'] },
  { slug: 'cys', href: '/aa/cys', title: '半胱氨酸', aliases: ['Cysteine', 'Cys'] },
]

describe('normalizeName', () => {
  it('去掉首尾空白并转小写', () => {
    expect(normalizeName('  Disulfide Bond  ')).toBe('disulfide bond')
  })
})

describe('resolve', () => {
  const index = buildIndex(TARGETS)

  it('按 title 命中', () => {
    expect(resolve(index, '二硫键')?.slug).toBe('disulfide-bond')
  })

  it('按 alias 命中', () => {
    expect(resolve(index, 'S-S 键')?.slug).toBe('disulfide-bond')
  })

  it('按 slug 命中', () => {
    expect(resolve(index, 'protein-folding')?.slug).toBe('protein-folding')
  })

  it('忽略大小写与首尾空白', () => {
    expect(resolve(index, '  CYSTEINE ')?.slug).toBe('cys')
  })

  it('未命中返回 null', () => {
    expect(resolve(index, '米氏方程')).toBeNull()
  })
})

describe('buildIndex 优先级', () => {
  it('title 优先于其它条目的 alias', () => {
    const targets: LinkTarget[] = [
      { slug: 'a', href: '/n/a', title: 'A 条目', aliases: ['共享名'] },
      { slug: 'b', href: '/n/b', title: '共享名' },
    ]
    // 即使 A 先出现且把「共享名」列为 alias，title 也应胜出
    expect(resolve(buildIndex(targets), '共享名')?.slug).toBe('b')
  })
})

describe('missingHref', () => {
  it('对中文名做 URL 编码', () => {
    expect(missingHref(' 半胱氨酸 ')).toBe(`/n/${encodeURIComponent('半胱氨酸')}`)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/lib/linkindex.test.ts`
Expected: FAIL —— 报错 `Failed to resolve import "./linkindex"`

- [ ] **Step 3: 实现 `src/lib/linkindex.ts`**

```ts
export interface LinkTarget {
  /** 唯一标识，笔记为文件 slug，氨基酸为三字母小写 */
  slug: string
  /** 目标 URL */
  href: string
  /** 主名称 */
  title: string
  /** 别名 */
  aliases?: string[]
}

export type LinkIndex = Map<string, LinkTarget>

export function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}

/**
 * 分三轮写入，保证优先级：title > alias > slug。
 * 每轮内先到先得，因此同名冲突时靠前的条目胜出。
 */
export function buildIndex(targets: LinkTarget[]): LinkIndex {
  const index: LinkIndex = new Map()

  const put = (key: string | undefined, target: LinkTarget) => {
    if (!key) return
    const k = normalizeName(key)
    if (k && !index.has(k)) index.set(k, target)
  }

  for (const t of targets) put(t.title, t)
  for (const t of targets) for (const a of t.aliases ?? []) put(a, t)
  for (const t of targets) put(t.slug, t)

  return index
}

export function resolve(index: LinkIndex, name: string): LinkTarget | null {
  return index.get(normalizeName(name)) ?? null
}

/** 未解析链接指向的占位页地址 */
export function missingHref(name: string): string {
  return `/n/${encodeURIComponent(name.trim())}`
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/lib/linkindex.test.ts`
Expected: PASS，9 个测试全绿

- [ ] **Step 5: Commit**

```bash
git add src/lib/linkindex.ts src/lib/linkindex.test.ts
git commit -m "feat: 链接索引解析模块"
```

---

### Task 4: wikilink remark 插件

**Files:**
- Create: `src/lib/wikilink.ts`
- Test: `src/lib/wikilink.test.ts`
- Create: `src/lib/targets.ts`
- Test: `src/lib/targets.test.ts`
- Modify: `astro.config.mjs`

**Interfaces:**
- Consumes: `LinkIndex` / `resolve` / `missingHref`（Task 3）
- Produces:
  - `remarkWikilink(options: { getIndex: () => LinkIndex; onUnresolved?: (name: string) => void })` —— unified 插件
  - `loadTargets(): LinkTarget[]` —— 从文件系统读取全部链接目标
  - `getIndex(): LinkIndex` —— 带缓存的索引获取（dev 下每次重建）

- [ ] **Step 1: 写失败的测试 `src/lib/wikilink.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import rehypeStringify from 'rehype-stringify'
import { buildIndex, type LinkTarget } from './linkindex'
import { remarkWikilink } from './wikilink'

const TARGETS: LinkTarget[] = [
  { slug: 'disulfide-bond', href: '/n/disulfide-bond', title: '二硫键', aliases: ['S-S 键'] },
  { slug: 'cys', href: '/aa/cys', title: '半胱氨酸' },
]

function render(md: string, unresolved: string[] = []) {
  const index = buildIndex(TARGETS)
  return unified()
    .use(remarkParse)
    .use(remarkWikilink, { getIndex: () => index, onUnresolved: (n: string) => unresolved.push(n) })
    .use(remarkRehype)
    .use(rehypeStringify)
    .processSync(md)
    .toString()
}

describe('remarkWikilink', () => {
  it('把 [[x]] 转成链接', () => {
    const html = render('见 [[二硫键]] 一节。')
    expect(html).toContain('href="/n/disulfide-bond"')
    expect(html).toContain('>二硫键</a>')
    expect(html).toContain('class="wikilink"')
  })

  it('支持 [[x|显示文本]]', () => {
    const html = render('见 [[二硫键|S-S 桥]]。')
    expect(html).toContain('href="/n/disulfide-bond"')
    expect(html).toContain('>S-S 桥</a>')
  })

  it('按 alias 解析', () => {
    expect(render('[[S-S 键]]')).toContain('href="/n/disulfide-bond"')
  })

  it('同一段落中的多个链接都被转换', () => {
    const html = render('[[二硫键]] 与 [[半胱氨酸]] 都要看。')
    expect(html).toContain('href="/n/disulfide-bond"')
    expect(html).toContain('href="/aa/cys"')
  })

  it('保留链接前后的文本', () => {
    const html = render('见 [[二硫键]] 一节。')
    expect(html).toContain('见 ')
    expect(html).toContain(' 一节。')
  })

  it('未解析链接渲染为 missing 样式并回调', () => {
    const unresolved: string[] = []
    const html = render('[[米氏方程]] 还没写。', unresolved)
    expect(html).toContain('wikilink-missing')
    expect(html).toContain(`href="/n/${encodeURIComponent('米氏方程')}"`)
    expect(unresolved).toEqual(['米氏方程'])
  })

  it('不转换行内代码中的 [[x]]', () => {
    const html = render('写作 `[[二硫键]]` 即可。')
    expect(html).not.toContain('href="/n/disulfide-bond"')
    expect(html).toContain('<code>[[二硫键]]</code>')
  })

  it('不转换代码块中的 [[x]]', () => {
    const html = render('```\n[[二硫键]]\n```')
    expect(html).not.toContain('href="/n/disulfide-bond"')
  })

  it('没有 wikilink 的文本原样通过', () => {
    expect(render('普通一句话。')).toContain('普通一句话。')
  })
})
```

- [ ] **Step 2: 安装测试所需的 unified 相关依赖**

Run: `npm install -D remark-parse remark-rehype rehype-stringify unified`
Expected: 安装成功

- [ ] **Step 3: 运行测试确认失败**

Run: `npx vitest run src/lib/wikilink.test.ts`
Expected: FAIL —— 报错 `Failed to resolve import "./wikilink"`

- [ ] **Step 4: 实现 `src/lib/wikilink.ts`**

```ts
import { visit, SKIP } from 'unist-util-visit'
import { resolve, missingHref, type LinkIndex } from './linkindex'

/**
 * 匹配 [[名称]] 或 [[名称|显示文本]]。
 * 名称部分不允许出现 [ ] |，显示文本部分不允许出现 [ ]。
 */
const WIKILINK = /\[\[([^[\]|]+)(?:\|([^[\]]+))?\]\]/g

export interface WikilinkOptions {
  /** 延迟获取索引：Astro 配置期尚无法确定内容，必须在实际渲染时才读取 */
  getIndex: () => LinkIndex
  /** 每遇到一个无法解析的名称回调一次 */
  onUnresolved?: (name: string) => void
}

export function remarkWikilink(options: WikilinkOptions) {
  const { getIndex, onUnresolved } = options

  return function transformer(tree: any) {
    const index = getIndex()

    // 只访问 text 节点。inlineCode 与 code 是独立节点类型，
    // 因此代码内容天然不会被匹配到。
    visit(tree, 'text', (node: any, i: number | undefined, parent: any) => {
      if (!parent || typeof i !== 'number') return
      const value: string = node.value
      if (!value.includes('[[')) return

      const out: any[] = []
      let last = 0
      let match: RegExpExecArray | null

      WIKILINK.lastIndex = 0
      while ((match = WIKILINK.exec(value)) !== null) {
        if (match.index > last) {
          out.push({ type: 'text', value: value.slice(last, match.index) })
        }

        const name = match[1].trim()
        const label = (match[2] ?? match[1]).trim()
        const target = resolve(index, name)

        if (!target) onUnresolved?.(name)

        out.push({
          type: 'link',
          url: target ? target.href : missingHref(name),
          children: [{ type: 'text', value: label }],
          data: {
            hProperties: {
              className: target ? 'wikilink' : 'wikilink wikilink-missing',
            },
          },
        })

        last = match.index + match[0].length
      }

      if (out.length === 0) return
      if (last < value.length) out.push({ type: 'text', value: value.slice(last) })

      parent.children.splice(i, 1, ...out)
      return [SKIP, i + out.length]
    })
  }
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run src/lib/wikilink.test.ts`
Expected: PASS，9 个测试全绿

- [ ] **Step 6: 写失败的测试 `src/lib/targets.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { loadTargets, getIndex } from './targets'
import { resolve } from './linkindex'

describe('loadTargets', () => {
  it('读取到仓库中已有的笔记', () => {
    const targets = loadTargets()
    const slugs = targets.map((t) => t.slug)
    expect(slugs).toContain('disulfide-bond')
    expect(slugs).toContain('protein-folding')
  })

  it('笔记的 href 指向 /n/<slug>', () => {
    const t = loadTargets().find((t) => t.slug === 'disulfide-bond')
    expect(t?.href).toBe('/n/disulfide-bond')
  })

  it('读到 frontmatter 中的 title 与 aliases', () => {
    const t = loadTargets().find((t) => t.slug === 'disulfide-bond')
    expect(t?.title).toBe('二硫键')
    expect(t?.aliases).toContain('S-S 键')
  })
})

describe('getIndex', () => {
  it('返回可用于 resolve 的索引', () => {
    expect(resolve(getIndex(), '二硫键')?.slug).toBe('disulfide-bond')
  })
})
```

- [ ] **Step 7: 运行测试确认失败**

Run: `npx vitest run src/lib/targets.test.ts`
Expected: FAIL —— 报错 `Failed to resolve import "./targets"`

- [ ] **Step 8: 实现 `src/lib/targets.ts`**

氨基酸部分留到 Task 11 接入，本步骤只处理笔记。

```ts
import fs from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import { buildIndex, type LinkIndex, type LinkTarget } from './linkindex'

const NOTES_DIR = path.resolve(process.cwd(), 'src/content/notes')

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (/\.mdx?$/.test(entry.name)) out.push(full)
  }
  return out
}

function loadNoteTargets(): LinkTarget[] {
  return walk(NOTES_DIR).map((file) => {
    const slug = path
      .relative(NOTES_DIR, file)
      .replace(/\.mdx?$/, '')
      .split(path.sep)
      .join('/')
    const { data } = matter(fs.readFileSync(file, 'utf8'))
    return {
      slug,
      href: `/n/${slug}`,
      title: String(data.title ?? slug),
      aliases: Array.isArray(data.aliases) ? data.aliases.map(String) : [],
    }
  })
}

/**
 * 全站链接目标。直接读文件系统而非 content collection ——
 * remark 插件在 Astro 配置期就需要索引，此时 collection 尚未加载。
 */
export function loadTargets(): LinkTarget[] {
  return loadNoteTargets()
}

let cached: LinkIndex | null = null

/**
 * dev 模式下每次重建，保证新建笔记后链接立即可解析；
 * 构建时只建一次。
 */
export function getIndex(): LinkIndex {
  if (process.env.NODE_ENV === 'production' && cached) return cached
  cached = buildIndex(loadTargets())
  return cached
}
```

- [ ] **Step 9: 运行测试确认通过**

Run: `npx vitest run src/lib/targets.test.ts`
Expected: PASS，4 个测试全绿

- [ ] **Step 10: 在 `astro.config.mjs` 中接入插件**

修改 import 区与 `markdown.processor`（注意 Astro 6 已弃用 `markdown.remarkPlugins`，必须走 `unified({...})`）：

```js
// @ts-check
import { defineConfig } from 'astro/config'
import tailwindcss from '@tailwindcss/vite'
import mdx from '@astrojs/mdx'
import { unified } from '@astrojs/markdown-remark'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { remarkWikilink } from './src/lib/wikilink.ts'
import { getIndex } from './src/lib/targets.ts'

export default defineConfig({
  site: 'https://notes.passion4ever.org',
  integrations: [mdx()],
  vite: {
    plugins: [tailwindcss()],
  },
  markdown: {
    processor: unified({
      remarkPlugins: [remarkMath, [remarkWikilink, { getIndex }]],
      rehypePlugins: [rehypeKatex],
    }),
  },
})
```

- [ ] **Step 11: 验证真实页面中的链接被转换**

Run: `npx astro build && grep -o 'href="/n/protein-folding"' dist/n/disulfide-bond/index.html`
Expected: 输出 `href="/n/protein-folding"`（`disulfide-bond.md` 中的 `[[蛋白质折叠]]` 已成为真链接）

Run: `grep -o 'wikilink-missing' dist/n/disulfide-bond/index.html`
Expected: 输出 `wikilink-missing`（`[[半胱氨酸]]` 尚未存在，渲染为未写样式）

- [ ] **Step 12: Commit**

```bash
git add src/lib/wikilink.ts src/lib/wikilink.test.ts src/lib/targets.ts src/lib/targets.test.ts astro.config.mjs package.json package-lock.json
git commit -m "feat: wikilink remark 插件与链接目标加载"
```

---

### Task 5: 链接图与反链 `linkgraph.ts`

**Files:**
- Create: `src/lib/linkgraph.ts`
- Test: `src/lib/linkgraph.test.ts`

**Interfaces:**
- Consumes: `LinkIndex` / `resolve` / `normalizeName`（Task 3）
- Produces:
  - `interface NoteInput { slug: string; title: string; href: string; body: string }`
  - `interface Ref { slug: string; title: string; href: string }`
  - `extractWikilinks(body: string): string[]`
  - `buildLinkGraph(notes: NoteInput[], index: LinkIndex): { backlinks: Map<string, Ref[]>; unresolved: Map<string, Ref[]> }`
    - `backlinks` 的 key 是目标 slug
    - `unresolved` 的 key 是 `normalizeName` 后的名称

- [ ] **Step 1: 写失败的测试 `src/lib/linkgraph.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { buildIndex, type LinkTarget } from './linkindex'
import { extractWikilinks, buildLinkGraph, type NoteInput } from './linkgraph'

const TARGETS: LinkTarget[] = [
  { slug: 'a', href: '/n/a', title: 'A 笔记' },
  { slug: 'b', href: '/n/b', title: 'B 笔记' },
]
const index = buildIndex(TARGETS)

const note = (slug: string, title: string, body: string): NoteInput => ({
  slug,
  title,
  href: `/n/${slug}`,
  body,
})

describe('extractWikilinks', () => {
  it('提取基本链接', () => {
    expect(extractWikilinks('见 [[A 笔记]]。')).toEqual(['A 笔记'])
  })

  it('提取带显示文本的链接，取名称部分', () => {
    expect(extractWikilinks('[[A 笔记|别名显示]]')).toEqual(['A 笔记'])
  })

  it('同一名称只出现一次', () => {
    expect(extractWikilinks('[[A 笔记]] 和 [[A 笔记]]')).toEqual(['A 笔记'])
  })

  it('忽略代码块中的链接', () => {
    expect(extractWikilinks('```\n[[A 笔记]]\n```')).toEqual([])
  })

  it('忽略行内代码中的链接', () => {
    expect(extractWikilinks('写作 `[[A 笔记]]`')).toEqual([])
  })
})

describe('buildLinkGraph', () => {
  it('建立反链', () => {
    const { backlinks } = buildLinkGraph([note('b', 'B 笔记', '见 [[A 笔记]]。')], index)
    expect(backlinks.get('a')?.map((r) => r.slug)).toEqual(['b'])
  })

  it('双向互链时两边都有反链', () => {
    const { backlinks } = buildLinkGraph(
      [note('a', 'A 笔记', '[[B 笔记]]'), note('b', 'B 笔记', '[[A 笔记]]')],
      index
    )
    expect(backlinks.get('a')?.map((r) => r.slug)).toEqual(['b'])
    expect(backlinks.get('b')?.map((r) => r.slug)).toEqual(['a'])
  })

  it('忽略自引用', () => {
    const { backlinks } = buildLinkGraph([note('a', 'A 笔记', '[[A 笔记]]')], index)
    expect(backlinks.get('a')).toBeUndefined()
  })

  it('同一来源多次引用只记一条反链', () => {
    const { backlinks } = buildLinkGraph([note('b', 'B 笔记', '[[A 笔记]] 又 [[A 笔记]]')], index)
    expect(backlinks.get('a')?.length).toBe(1)
  })

  it('收集未解析链接及其来源', () => {
    const { unresolved } = buildLinkGraph([note('a', 'A 笔记', '[[米氏方程]]')], index)
    expect(unresolved.get('米氏方程')?.map((r) => r.slug)).toEqual(['a'])
  })

  it('未解析链接不进入 backlinks', () => {
    const { backlinks } = buildLinkGraph([note('a', 'A 笔记', '[[米氏方程]]')], index)
    expect(backlinks.size).toBe(0)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/lib/linkgraph.test.ts`
Expected: FAIL —— 报错 `Failed to resolve import "./linkgraph"`

- [ ] **Step 3: 实现 `src/lib/linkgraph.ts`**

```ts
import { resolve, normalizeName, type LinkIndex } from './linkindex'

export interface NoteInput {
  slug: string
  title: string
  href: string
  /** 原始 markdown 正文 */
  body: string
}

export interface Ref {
  slug: string
  title: string
  href: string
}

const WIKILINK = /\[\[([^[\]|]+)(?:\|[^[\]]+)?\]\]/g

/**
 * 去掉围栏代码块与行内代码，避免把示例代码里的 [[x]] 当成真链接。
 * 与 remark 插件的行为保持一致（那边靠 AST 节点类型天然隔离）。
 */
function stripCode(body: string): string {
  return body.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '')
}

export function extractWikilinks(body: string): string[] {
  const text = stripCode(body)
  const names: string[] = []
  const seen = new Set<string>()
  let match: RegExpExecArray | null

  WIKILINK.lastIndex = 0
  while ((match = WIKILINK.exec(text)) !== null) {
    const name = match[1].trim()
    if (!name) continue
    const key = normalizeName(name)
    if (seen.has(key)) continue
    seen.add(key)
    names.push(name)
  }

  return names
}

export function buildLinkGraph(notes: NoteInput[], index: LinkIndex) {
  const backlinks = new Map<string, Ref[]>()
  const unresolved = new Map<string, Ref[]>()

  const push = (map: Map<string, Ref[]>, key: string, ref: Ref) => {
    const list = map.get(key) ?? []
    if (list.some((r) => r.slug === ref.slug)) return
    list.push(ref)
    map.set(key, list)
  }

  for (const note of notes) {
    const ref: Ref = { slug: note.slug, title: note.title, href: note.href }

    for (const name of extractWikilinks(note.body)) {
      const target = resolve(index, name)
      if (target) {
        if (target.slug === note.slug) continue // 自引用无意义
        push(backlinks, target.slug, ref)
      } else {
        push(unresolved, normalizeName(name), ref)
      }
    }
  }

  return { backlinks, unresolved }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/lib/linkgraph.test.ts`
Expected: PASS，12 个测试全绿

- [ ] **Step 5: Commit**

```bash
git add src/lib/linkgraph.ts src/lib/linkgraph.test.ts
git commit -m "feat: 链接图与反链构建"
```

---

### Task 6: 笔记页接入反链与未写占位页

**Files:**
- Create: `src/lib/notegraph.ts`
- Create: `src/components/Backlinks.astro`
- Modify: `src/pages/n/[slug].astro`

**Interfaces:**
- Consumes: `buildLinkGraph` / `Ref`（Task 5）、`getIndex` / `loadTargets`（Task 4）、`notes` collection（Task 2）
- Produces:
  - `getNoteGraph(): Promise<{ backlinks: Map<string, Ref[]>; unresolved: Map<string, Ref[]> }>` —— 基于真实 collection 内容构建，并在构建时打印未解析链接汇总
  - `Backlinks.astro` 接受 props `{ refs: Ref[] }`

- [ ] **Step 1: 创建 `src/lib/notegraph.ts`**

```ts
import { getCollection } from 'astro:content'
import { getIndex } from './targets'
import { buildLinkGraph, type NoteInput, type Ref } from './linkgraph'

let cached: { backlinks: Map<string, Ref[]>; unresolved: Map<string, Ref[]> } | null = null

export async function getNoteGraph() {
  if (cached) return cached

  const notes = await getCollection('notes')
  const inputs: NoteInput[] = notes.map((n) => ({
    slug: n.id,
    title: n.data.title,
    href: `/n/${n.id}`,
    body: n.body ?? '',
  }))

  cached = buildLinkGraph(inputs, getIndex())

  if (cached.unresolved.size > 0) {
    const names = [...cached.unresolved.keys()].sort()
    // 未写的链接是待写清单，不是错误 —— 只提示，绝不让构建失败
    console.warn(`\n[wikilink] ${names.length} 个链接尚未有对应笔记：`)
    for (const name of names) {
      const from = cached.unresolved.get(name)!.map((r) => r.slug).join(', ')
      console.warn(`  - ${name}  ←  ${from}`)
    }
    console.warn('')
  }

  return cached
}
```

- [ ] **Step 2: 创建 `src/components/Backlinks.astro`**

```astro
---
import type { Ref } from '../lib/linkgraph'

interface Props {
  refs: Ref[]
}

const { refs } = Astro.props
---

{
  refs.length > 0 && (
    <section class="mt-12 border-t border-neutral-200 pt-6">
      <h2 class="text-sm font-semibold tracking-wide text-neutral-500">被这些页面提到</h2>
      <ul class="mt-3 space-y-1">
        {refs.map((ref) => (
          <li>
            <a href={ref.href} class="text-blue-600 no-underline">
              {ref.title}
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
```

- [ ] **Step 3: 重写 `src/pages/n/[slug].astro`**

同时生成真实笔记页与未写占位页。

```astro
---
import { getCollection, render } from 'astro:content'
import Base from '../../layouts/Base.astro'
import Backlinks from '../../components/Backlinks.astro'
import { getNoteGraph } from '../../lib/notegraph'
import type { Ref } from '../../lib/linkgraph'

export async function getStaticPaths() {
  const notes = await getCollection('notes')
  const { backlinks, unresolved } = await getNoteGraph()

  const real = notes.map((note) => ({
    params: { slug: note.id },
    props: {
      note,
      refs: backlinks.get(note.id) ?? [],
      missingName: null as string | null,
    },
  }))

  // 未写的笔记也生成页面：上面列出谁提到了它，本身即待写清单
  const placeholders = [...unresolved.entries()].map(([name, refs]) => ({
    params: { slug: name },
    props: {
      note: null,
      refs,
      missingName: name,
    },
  }))

  return [...real, ...placeholders]
}

const { note, refs, missingName } = Astro.props as {
  note: any
  refs: Ref[]
  missingName: string | null
}

const Content = note ? (await render(note)).Content : null
const title = note ? note.data.title : missingName!
---

<Base title={title}>
  <article class="prose prose-neutral max-w-none">
    <h1>{title}</h1>
    {
      Content ? (
        <Content />
      ) : (
        <p class="text-neutral-500">这篇还没写。</p>
      )
    }
  </article>

  {
    note && note.data.tags.length > 0 && (
      <div class="mt-8 flex flex-wrap gap-2">
        {note.data.tags.map((tag: string) => (
          <a
            href={`/tags/${encodeURIComponent(tag)}`}
            class="rounded bg-neutral-100 px-2 py-1 text-sm text-neutral-600 no-underline"
          >
            {tag}
          </a>
        ))}
      </div>
    )
  }

  <Backlinks refs={refs} />
</Base>
```

- [ ] **Step 4: 验证反链与占位页**

Run: `npx astro build`
Expected: 控制台出现 `[wikilink] 1 个链接尚未有对应笔记：` 及 `- 半胱氨酸  ←  disulfide-bond`，且构建**成功**

Run: `grep -o '被这些页面提到' dist/n/protein-folding/index.html`
Expected: 输出 `被这些页面提到`（`disulfide-bond` 链接了它）

Run: `ls dist/n/`
Expected: 除两篇笔记外，还出现 `半胱氨酸` 目录（未写占位页）

- [ ] **Step 5: Commit**

```bash
git add src/lib/notegraph.ts src/components/Backlinks.astro src/pages/n
git commit -m "feat: 反链渲染与未写笔记占位页"
```

---

### Task 7: git 时间戳与首页

**Files:**
- Create: `src/lib/gitdate.ts`
- Test: `src/lib/gitdate.test.ts`
- Modify: `src/pages/index.astro`

**Interfaces:**
- Consumes: `notes` collection（Task 2）
- Produces: `getLastModified(relPath: string): Date` —— 取 git 最后提交时间，无提交记录时回退到文件 mtime

- [ ] **Step 1: 写失败的测试 `src/lib/gitdate.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { getLastModified } from './gitdate'

describe('getLastModified', () => {
  it('对已提交文件返回合理日期', () => {
    const d = getLastModified('package.json')
    expect(d).toBeInstanceOf(Date)
    expect(Number.isNaN(d.getTime())).toBe(false)
    expect(d.getFullYear()).toBeGreaterThan(2000)
  })

  it('对不存在的文件不抛异常，返回 Date', () => {
    const d = getLastModified('does-not-exist-xyz.md')
    expect(d).toBeInstanceOf(Date)
    expect(Number.isNaN(d.getTime())).toBe(false)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/lib/gitdate.test.ts`
Expected: FAIL —— 报错 `Failed to resolve import "./gitdate"`

- [ ] **Step 3: 实现 `src/lib/gitdate.ts`**

```ts
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

/**
 * 「最后更新时间」的唯一来源是 git 提交记录 ——
 * 这样写笔记时完全不用维护 frontmatter 里的日期。
 * 尚未提交的新文件回退到文件 mtime；文件不存在则用当前时间。
 */
export function getLastModified(relPath: string): Date {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cI', '--', relPath], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    if (out) return new Date(out)
  } catch {
    // 不在 git 仓库中，或 git 不可用 —— 继续走 mtime
  }

  try {
    return fs.statSync(path.resolve(process.cwd(), relPath)).mtime
  } catch {
    return new Date()
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/lib/gitdate.test.ts`
Expected: PASS，2 个测试全绿

- [ ] **Step 5: 重写 `src/pages/index.astro`**

```astro
---
import { getCollection } from 'astro:content'
import Base from '../layouts/Base.astro'
import { getLastModified } from '../lib/gitdate'

const notes = await getCollection('notes')

// glob loader 的 entry 自带 filePath（相对项目根目录）。
// 不要用 `notes/${id}.md` 拼路径 —— 用到组件的笔记是 .mdx，会拼错。
const sourcePath = (note: (typeof notes)[number]) =>
  (note as { filePath?: string }).filePath ?? `src/content/notes/${note.id}.md`

const enriched = notes.map((note) => ({
  slug: note.id,
  title: note.data.title,
  tags: note.data.tags,
  updated: getLastModified(sourcePath(note)),
}))

const recent = [...enriched].sort((a, b) => b.updated.getTime() - a.updated.getTime()).slice(0, 10)

// 按标签分组，标签内按标题排序
const byTag = new Map<string, typeof enriched>()
for (const note of enriched) {
  const tags = note.tags.length > 0 ? note.tags : ['未分类']
  for (const tag of tags) {
    const list = byTag.get(tag) ?? []
    list.push(note)
    byTag.set(tag, list)
  }
}
const tagGroups = [...byTag.entries()]
  .map(([tag, list]) => [tag, [...list].sort((a, b) => a.title.localeCompare(b.title, 'zh'))] as const)
  .sort((a, b) => b[1].length - a[1].length)

const fmt = (d: Date) => d.toISOString().slice(0, 10)
---

<Base title="笔记">
  <h1 class="text-2xl font-semibold">笔记</h1>

  <section class="mt-8">
    <h2 class="text-sm font-semibold tracking-wide text-neutral-500">最近更新</h2>
    <ul class="mt-3 space-y-1">
      {
        recent.map((note) => (
          <li class="flex gap-3">
            <span class="tabular-nums text-sm text-neutral-400">{fmt(note.updated)}</span>
            <a href={`/n/${note.slug}`} class="text-blue-600 no-underline">
              {note.title}
            </a>
          </li>
        ))
      }
    </ul>
  </section>

  <section class="mt-12">
    <h2 class="text-sm font-semibold tracking-wide text-neutral-500">全部笔记</h2>
    {
      tagGroups.map(([tag, list]) => (
        <div class="mt-6">
          <h3 class="text-base font-medium">
            <a href={`/tags/${encodeURIComponent(tag)}`} class="no-underline">
              {tag}
            </a>
            <span class="ml-2 text-sm font-normal text-neutral-400">{list.length}</span>
          </h3>
          <ul class="mt-2 space-y-1">
            {list.map((note) => (
              <li>
                <a href={`/n/${note.slug}`} class="text-blue-600 no-underline">
                  {note.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))
    }
  </section>
</Base>
```

- [ ] **Step 6: 验证首页**

Run: `npx astro build && grep -o '最近更新' dist/index.html && grep -o '蛋白质结构' dist/index.html`
Expected: 两个 grep 均有输出

- [ ] **Step 7: Commit**

```bash
git add src/lib/gitdate.ts src/lib/gitdate.test.ts src/pages/index.astro
git commit -m "feat: git 时间戳与首页（最近更新 + 标签分组）"
```

---

### Task 8: 标签页

**Files:**
- Create: `src/pages/tags/[tag].astro`

**Interfaces:**
- Consumes: `notes` collection（Task 2）、`Base.astro`（Task 1）
- Produces: `/tags/<encodeURIComponent(tag)>` 路由

- [ ] **Step 1: 创建 `src/pages/tags/[tag].astro`**

```astro
---
import { getCollection } from 'astro:content'
import Base from '../../layouts/Base.astro'

export async function getStaticPaths() {
  const notes = await getCollection('notes')
  const byTag = new Map<string, typeof notes>()

  for (const note of notes) {
    const tags = note.data.tags.length > 0 ? note.data.tags : ['未分类']
    for (const tag of tags) {
      const list = byTag.get(tag) ?? []
      list.push(note)
      byTag.set(tag, list)
    }
  }

  return [...byTag.entries()].map(([tag, list]) => ({
    params: { tag },
    props: { tag, notes: list },
  }))
}

const { tag, notes } = Astro.props
const sorted = [...notes].sort((a, b) => a.data.title.localeCompare(b.data.title, 'zh'))
---

<Base title={`标签：${tag}`}>
  <h1 class="text-2xl font-semibold">
    <span class="text-neutral-400">标签 /</span>
    {tag}
  </h1>
  <ul class="mt-6 space-y-1">
    {
      sorted.map((note) => (
        <li>
          <a href={`/n/${note.id}`} class="text-blue-600 no-underline">
            {note.data.title}
          </a>
        </li>
      ))
    }
  </ul>
</Base>
```

- [ ] **Step 2: 验证标签页生成**

Run: `npx astro build && ls dist/tags/`
Expected: 出现 `蛋白质结构` 与 `翻译后修饰` 两个目录

- [ ] **Step 3: Commit**

```bash
git add src/pages/tags
git commit -m "feat: 标签页"
```

---

### Task 9: `<Mol>` 小分子结构图组件

**Files:**
- Create: `src/components/Mol.astro`
- Create: `src/content/notes/cysteine-demo.mdx`（用到组件必须是 `.mdx`，不能是 `.md`）
- Modify: `package.json`（新增 `smiles-drawer` 依赖）

**Interfaces:**
- Consumes: 无
- Produces: `Mol.astro`，props `{ smiles: string; width?: number; height?: number; caption?: string }`

关键实现事实（已实测验证，不要改动）：
- 渲染目标必须是 `<svg>` 元素，**不能是 `<canvas>`** —— `SmiDrawer` 底层走 `SvgDrawer`
- ESM 是 default 导出：`import SmilesDrawer from 'smiles-drawer'`，命名空间上取 `SmilesDrawer.SmiDrawer`
- 绘制签名：`drawer.draw(smiles, svgElement, theme, successCallback, errorCallback)`

- [ ] **Step 1: 安装依赖**

Run: `npm install smiles-drawer@^2.4.1`
Expected: 安装成功

- [ ] **Step 2: 创建 `src/components/Mol.astro`**

```astro
---
interface Props {
  smiles: string
  width?: number
  height?: number
  caption?: string
}

const { smiles, width = 260, height = 200, caption } = Astro.props
---

<figure class="my-6 text-center">
  <svg
    class="mol-target mx-auto"
    data-smiles={smiles}
    data-width={width}
    data-height={height}
    width={width}
    height={height}></svg>
  <figcaption class="mol-error mt-2 hidden font-mono text-xs text-red-600"></figcaption>
  {caption && <figcaption class="mt-2 text-sm text-neutral-500">{caption}</figcaption>}
</figure>

<script>
  import SmilesDrawer from 'smiles-drawer'

  const targets = document.querySelectorAll<SVGElement>('.mol-target')

  targets.forEach((svg) => {
    const smiles = svg.dataset.smiles ?? ''
    const width = Number(svg.dataset.width ?? 260)
    const height = Number(svg.dataset.height ?? 200)

    const showError = (message: string) => {
      const box = svg.parentElement?.querySelector<HTMLElement>('.mol-error')
      if (!box) return
      box.textContent = `SMILES 无法解析：${smiles} —— ${message}`
      box.classList.remove('hidden')
      svg.remove()
    }

    try {
      const drawer = new SmilesDrawer.SmiDrawer({ width, height, padding: 14, bondThickness: 1.0 })
      drawer.draw(smiles, svg, 'light', null, (err: unknown) => showError(String(err)))
    } catch (err) {
      showError(String(err))
    }
  })
</script>
```

- [ ] **Step 3: 创建示例笔记 `src/content/notes/cysteine-demo.mdx`**

```mdx
---
title: 半胱氨酸
tags: [氨基酸]
aliases: [Cysteine, Cys]
---

import Mol from '../../components/Mol.astro'

半胱氨酸是唯一含巯基（—SH）的常见氨基酸，两个巯基氧化即形成 [[二硫键]]。

<Mol smiles="N[C@@H](CS)C(=O)O" caption="半胱氨酸" />

侧链 pKa 约 8.3，在生理 pH 下部分去质子化，因此常见于酶活性位点作为亲核残基。
```

- [ ] **Step 4: 验证渲染与打包**

Run: `npx astro build`
Expected: 构建成功；控制台**不再**出现「半胱氨酸」未解析警告（因为已经写了这篇笔记）

Run: `grep -o 'data-smiles' dist/n/cysteine-demo/index.html`
Expected: 输出 `data-smiles`

- [ ] **Step 5: 人工验收**

Run: `npm run dev`
打开 `http://localhost:4321/n/cysteine-demo`
Expected: 页面上出现半胱氨酸的结构图，元素带配色（N 蓝、O 红、S 黄）；浏览器控制台无报错

- [ ] **Step 6: Commit**

```bash
git add src/components/Mol.astro src/content/notes/cysteine-demo.mdx package.json package-lock.json
git commit -m "feat: Mol 小分子结构图组件（SmilesDrawer）"
```

---

### Task 10: 氨基酸数据与页面

**Files:**
- Create: `src/data/amino-acids.yaml`
- Modify: `src/content.config.ts`
- Create: `src/pages/aa/index.astro`
- Create: `src/pages/aa/[code].astro`
- Delete: `src/content/notes/cysteine-demo.mdx`

删除 `cysteine-demo.mdx` 的原因：半胱氨酸从此由氨基酸数据提供页面（`/aa/cys`），保留笔记会造成同名冲突。

**Interfaces:**
- Consumes: `Base.astro`（Task 1）、`Mol.astro`（Task 9）
- Produces: content collection `aminoAcids`，entry `id` = 三字母小写（如 `cys`），字段见下

- [ ] **Step 1: 创建 `src/data/amino-acids.yaml`**

先写 5 条打通链路，Step 7 补齐 20 条。

```yaml
- code1: A
  code3: Ala
  name_zh: 丙氨酸
  name_en: Alanine
  smiles: "C[C@@H](N)C(=O)O"
  mw: 89.09
  hydropathy: 1.8
  charge: neutral
  polarity: nonpolar
  essential: false
  note: 最小的手性氨基酸，α 螺旋倾向强

- code1: C
  code3: Cys
  name_zh: 半胱氨酸
  name_en: Cysteine
  smiles: "N[C@@H](CS)C(=O)O"
  mw: 121.16
  pka_side: 8.33
  hydropathy: 2.5
  charge: neutral
  polarity: polar
  essential: false
  note: 唯一含巯基；可形成二硫键，活性位点常见亲核残基

- code1: F
  code3: Phe
  name_zh: 苯丙氨酸
  name_en: Phenylalanine
  smiles: "N[C@@H](Cc1ccccc1)C(=O)O"
  mw: 165.19
  hydropathy: 2.8
  charge: neutral
  polarity: nonpolar
  essential: true
  note: 芳香族，常参与疏水核心堆积

- code1: H
  code3: His
  name_zh: 组氨酸
  name_en: Histidine
  smiles: "N[C@@H](Cc1c[nH]cn1)C(=O)O"
  mw: 155.15
  pka_side: 6.0
  hydropathy: -3.2
  charge: positive
  polarity: polar
  essential: true
  note: 侧链 pKa 接近生理 pH，催化三联体中的常客

- code1: W
  code3: Trp
  name_zh: 色氨酸
  name_en: Tryptophan
  smiles: "N[C@@H](Cc1c[nH]c2ccccc12)C(=O)O"
  mw: 204.23
  hydropathy: -0.9
  charge: neutral
  polarity: nonpolar
  essential: true
  note: 最大的侧链；280 nm 吸收的主要贡献者
```

- [ ] **Step 2: 在 `src/content.config.ts` 中新增 collection**

```ts
import { defineCollection, z } from 'astro:content'
import { glob, file } from 'astro/loaders'
import yaml from 'js-yaml'

const notes = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/notes' }),
  schema: z.object({
    title: z.string(),
    tags: z.array(z.string()).default([]),
    aliases: z.array(z.string()).default([]),
  }),
})

const aminoAcids = defineCollection({
  loader: file('src/data/amino-acids.yaml', {
    // 返回以 id 为 key 的对象，id 取三字母小写 → /aa/cys
    parser: (text) => {
      const rows = yaml.load(text) as Record<string, unknown>[]
      return Object.fromEntries(
        rows.map((row) => [String(row.code3).toLowerCase(), row])
      )
    },
  }),
  // 数据源唯一且可控，字段缺失应当构建失败
  schema: z.object({
    code1: z.string().length(1),
    code3: z.string().length(3),
    name_zh: z.string(),
    name_en: z.string(),
    smiles: z.string(),
    mw: z.number(),
    pka_side: z.number().optional(),
    hydropathy: z.number(),
    charge: z.enum(['positive', 'negative', 'neutral']),
    polarity: z.enum(['polar', 'nonpolar']),
    essential: z.boolean(),
    note: z.string().default(''),
  }),
})

export const collections = { notes, aminoAcids }
```

- [ ] **Step 3: 删除与氨基酸页面冲突的示例笔记**

```bash
git rm src/content/notes/cysteine-demo.mdx
```

- [ ] **Step 4: 创建总表 `src/pages/aa/index.astro`**

客户端排序与筛选，无需框架。

```astro
---
import { getCollection } from 'astro:content'
import Base from '../../layouts/Base.astro'

const rows = (await getCollection('aminoAcids')).sort((a, b) =>
  a.data.code3.localeCompare(b.data.code3)
)

const CHARGE_ZH = { positive: '正电', negative: '负电', neutral: '中性' } as const
const POLARITY_ZH = { polar: '极性', nonpolar: '非极性' } as const
---

<Base title="氨基酸速查">
  <h1 class="text-2xl font-semibold">氨基酸速查</h1>

  <div class="mt-6 flex flex-wrap gap-2 text-sm">
    <button data-filter="all" class="filter rounded bg-neutral-900 px-3 py-1 text-white">全部</button>
    <button data-filter="polar" class="filter rounded bg-neutral-100 px-3 py-1">极性</button>
    <button data-filter="nonpolar" class="filter rounded bg-neutral-100 px-3 py-1">非极性</button>
    <button data-filter="positive" class="filter rounded bg-neutral-100 px-3 py-1">正电</button>
    <button data-filter="negative" class="filter rounded bg-neutral-100 px-3 py-1">负电</button>
    <button data-filter="essential" class="filter rounded bg-neutral-100 px-3 py-1">必需</button>
  </div>

  <table class="mt-6 w-full text-sm" id="aa-table">
    <thead class="border-b border-neutral-300 text-left">
      <tr>
        <th class="cursor-pointer py-2" data-sort="code3">三字母</th>
        <th class="cursor-pointer py-2" data-sort="code1">单字母</th>
        <th class="py-2">中文名</th>
        <th class="cursor-pointer py-2 text-right" data-sort="mw">分子量</th>
        <th class="cursor-pointer py-2 text-right" data-sort="hydropathy">疏水性</th>
        <th class="py-2 text-right">电荷</th>
      </tr>
    </thead>
    <tbody>
      {
        rows.map((aa) => (
          <tr
            class="border-b border-neutral-100"
            data-polarity={aa.data.polarity}
            data-charge={aa.data.charge}
            data-essential={String(aa.data.essential)}
            data-code3={aa.data.code3}
            data-code1={aa.data.code1}
            data-mw={aa.data.mw}
            data-hydropathy={aa.data.hydropathy}
          >
            <td class="py-2">
              <a href={`/aa/${aa.id}`} class="text-blue-600 no-underline">
                {aa.data.code3}
              </a>
            </td>
            <td class="py-2 font-mono">{aa.data.code1}</td>
            <td class="py-2">{aa.data.name_zh}</td>
            <td class="py-2 text-right tabular-nums">{aa.data.mw.toFixed(2)}</td>
            <td class="py-2 text-right tabular-nums">{aa.data.hydropathy.toFixed(1)}</td>
            <td class="py-2 text-right">
              {CHARGE_ZH[aa.data.charge]} · {POLARITY_ZH[aa.data.polarity]}
            </td>
          </tr>
        ))
      }
    </tbody>
  </table>
</Base>

<script>
  const table = document.getElementById('aa-table') as HTMLTableElement | null
  if (table) {
    const tbody = table.tBodies[0]
    const rows = () => Array.from(tbody.rows)

    document.querySelectorAll<HTMLButtonElement>('.filter').forEach((btn) => {
      btn.addEventListener('click', () => {
        const filter = btn.dataset.filter!

        document.querySelectorAll<HTMLButtonElement>('.filter').forEach((b) => {
          b.className = b === btn
            ? 'filter rounded bg-neutral-900 px-3 py-1 text-white'
            : 'filter rounded bg-neutral-100 px-3 py-1'
        })

        rows().forEach((row) => {
          const match =
            filter === 'all' ||
            row.dataset.polarity === filter ||
            row.dataset.charge === filter ||
            (filter === 'essential' && row.dataset.essential === 'true')
          row.style.display = match ? '' : 'none'
        })
      })
    })

    let lastKey = ''
    let asc = true
    table.querySelectorAll<HTMLElement>('[data-sort]').forEach((th) => {
      th.addEventListener('click', () => {
        const key = th.dataset.sort!
        asc = key === lastKey ? !asc : true
        lastKey = key

        const numeric = key === 'mw' || key === 'hydropathy'
        const sorted = rows().sort((a, b) => {
          const x = a.dataset[key] ?? ''
          const y = b.dataset[key] ?? ''
          const cmp = numeric ? Number(x) - Number(y) : x.localeCompare(y)
          return asc ? cmp : -cmp
        })
        sorted.forEach((row) => tbody.appendChild(row))
      })
    })
  }
</script>
```

- [ ] **Step 5: 创建详情页 `src/pages/aa/[code].astro`**

反链接入留到 Task 11。

```astro
---
import { getCollection } from 'astro:content'
import Base from '../../layouts/Base.astro'
import Mol from '../../components/Mol.astro'

export async function getStaticPaths() {
  const rows = await getCollection('aminoAcids')
  return rows.map((aa) => ({ params: { code: aa.id }, props: { aa } }))
}

const { aa } = Astro.props
const d = aa.data

const CHARGE_ZH = { positive: '正电', negative: '负电', neutral: '中性' } as const
const POLARITY_ZH = { polar: '极性', nonpolar: '非极性' } as const

const fields: [string, string][] = [
  ['单字母 / 三字母', `${d.code1} / ${d.code3}`],
  ['英文名', d.name_en],
  ['分子量', d.mw.toFixed(2)],
  ['侧链 pKa', d.pka_side !== undefined ? String(d.pka_side) : '—'],
  ['疏水性 (Kyte-Doolittle)', d.hydropathy.toFixed(1)],
  ['电荷 / 极性', `${CHARGE_ZH[d.charge]} · ${POLARITY_ZH[d.polarity]}`],
  ['必需氨基酸', d.essential ? '是' : '否'],
]
---

<Base title={d.name_zh}>
  <h1 class="text-2xl font-semibold">
    {d.name_zh}
    <span class="ml-2 font-mono text-lg font-normal text-neutral-400">{d.code3} · {d.code1}</span>
  </h1>

  <Mol smiles={d.smiles} width={300} height={230} />

  <table class="mt-6 w-full text-sm">
    <tbody>
      {
        fields.map(([label, value]) => (
          <tr class="border-b border-neutral-100">
            <td class="py-2 text-neutral-500">{label}</td>
            <td class="py-2 text-right tabular-nums">{value}</td>
          </tr>
        ))
      }
    </tbody>
  </table>

  {d.note && <p class="mt-6 text-neutral-700">{d.note}</p>}

  <p class="mt-8">
    <a href="/aa" class="text-blue-600 no-underline">← 返回氨基酸速查</a>
  </p>
</Base>
```

- [ ] **Step 6: 验证页面生成**

Run: `npx astro build && ls dist/aa/`
Expected: 出现 `index.html` 与 `ala/` `cys/` `phe/` `his/` `trp/`

Run: `npm run dev` 并打开 `http://localhost:4321/aa`
Expected: 表格可点击表头排序、可点筛选按钮过滤

- [ ] **Step 7: 补齐剩余 15 种氨基酸**

在 `src/data/amino-acids.yaml` 中按同样字段补齐：Arg、Asn、Asp、Gln、Glu、Gly、Ile、Leu、Lys、Met、Pro、Ser、Thr、Tyr、Val。

SMILES 参考（均为 L 型，Gly 无手性）：

```
Arg  N[C@@H](CCCNC(N)=N)C(=O)O
Asn  N[C@@H](CC(N)=O)C(=O)O
Asp  N[C@@H](CC(=O)O)C(=O)O
Gln  N[C@@H](CCC(N)=O)C(=O)O
Glu  N[C@@H](CCC(=O)O)C(=O)O
Gly  NCC(=O)O
Ile  CC[C@H](C)[C@@H](N)C(=O)O
Leu  CC(C)C[C@@H](N)C(=O)O
Lys  N[C@@H](CCCCN)C(=O)O
Met  N[C@@H](CCSC)C(=O)O
Pro  OC(=O)[C@@H]1CCCN1
Ser  N[C@@H](CO)C(=O)O
Thr  C[C@@H](O)[C@@H](N)C(=O)O
Tyr  N[C@@H](Cc1ccc(O)cc1)C(=O)O
Val  CC(C)[C@@H](N)C(=O)O
```

- [ ] **Step 8: 验证 20 条全部通过 schema 校验且能渲染**

Run: `npx astro build && ls dist/aa/ | wc -l`
Expected: 21（20 个氨基酸目录 + `index.html`）

Run: `npm run dev` 打开 `http://localhost:4321/aa`，逐个点开检查结构图
Expected: 20 张结构图全部正常渲染，无红色报错

- [ ] **Step 9: Commit**

Step 3 的 `git rm` 已经把删除操作暂存，此处无需再处理。

```bash
git add src/data src/content.config.ts src/pages/aa
git commit -m "feat: 氨基酸数据、速查总表与详情页"
```

---

### Task 11: 氨基酸并入链接索引与反链

完成后 `[[半胱氨酸]]` 会解析到 `/aa/cys`，且氨基酸详情页也显示反链。

**Files:**
- Modify: `src/lib/targets.ts`
- Modify: `src/lib/targets.test.ts`
- Modify: `src/pages/aa/[code].astro`
- Modify: `src/content/notes/disulfide-bond.md`

**Interfaces:**
- Consumes: `loadTargets`（Task 4）、`getNoteGraph`（Task 6）、`aminoAcids` collection（Task 10）
- Produces: `loadTargets()` 的返回值中新增氨基酸条目，`href` 为 `/aa/<code3 小写>`，`title` 为 `name_zh`，`aliases` 为 `[name_en, code3]`

**注意：`code1` 不作为别名。** 单字母（`C`、`A`）过短，会与正文中的普通文本冲突。

- [ ] **Step 1: 在 `src/lib/targets.test.ts` 追加失败的测试**

```ts
describe('loadTargets 氨基酸', () => {
  it('包含氨基酸条目', () => {
    const t = loadTargets().find((t) => t.slug === 'cys')
    expect(t).toBeDefined()
    expect(t?.href).toBe('/aa/cys')
    expect(t?.title).toBe('半胱氨酸')
  })

  it('英文名与三字母作为别名', () => {
    const t = loadTargets().find((t) => t.slug === 'cys')
    expect(t?.aliases).toContain('Cysteine')
    expect(t?.aliases).toContain('Cys')
  })

  it('单字母不作为别名，避免与正文冲突', () => {
    const t = loadTargets().find((t) => t.slug === 'cys')
    expect(t?.aliases).not.toContain('C')
  })

  it('[[半胱氨酸]] 解析到氨基酸详情页', () => {
    expect(resolve(getIndex(), '半胱氨酸')?.href).toBe('/aa/cys')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/lib/targets.test.ts`
Expected: FAIL —— `expect(t).toBeDefined()` 失败，`t` 为 `undefined`

- [ ] **Step 3: 修改 `src/lib/targets.ts`**

在文件顶部追加 import：

```ts
import yaml from 'js-yaml'
```

在 `NOTES_DIR` 常量下方追加：

```ts
const AMINO_ACIDS_FILE = path.resolve(process.cwd(), 'src/data/amino-acids.yaml')

interface AminoAcidRow {
  code1: string
  code3: string
  name_zh: string
  name_en: string
}

function loadAminoAcidTargets(): LinkTarget[] {
  if (!fs.existsSync(AMINO_ACIDS_FILE)) return []
  const rows = yaml.load(fs.readFileSync(AMINO_ACIDS_FILE, 'utf8')) as AminoAcidRow[]
  return rows.map((row) => {
    const slug = row.code3.toLowerCase()
    return {
      slug,
      href: `/aa/${slug}`,
      title: row.name_zh,
      // 单字母（C、A…）太短，会与正文普通文本冲突，故不作别名
      aliases: [row.name_en, row.code3],
    }
  })
}
```

把 `loadTargets` 改为：

```ts
export function loadTargets(): LinkTarget[] {
  return [...loadNoteTargets(), ...loadAminoAcidTargets()]
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run`
Expected: 全部测试 PASS

- [ ] **Step 5: 在氨基酸详情页加入反链**

修改 `src/pages/aa/[code].astro`，在 frontmatter 追加：

```ts
import Backlinks from '../../components/Backlinks.astro'
import { getNoteGraph } from '../../lib/notegraph'
```

`getStaticPaths` 改为：

```ts
export async function getStaticPaths() {
  const rows = await getCollection('aminoAcids')
  const { backlinks } = await getNoteGraph()
  return rows.map((aa) => ({
    params: { code: aa.id },
    props: { aa, refs: backlinks.get(aa.id) ?? [] },
  }))
}
```

props 解构改为：

```ts
const { aa, refs } = Astro.props
```

在「返回氨基酸速查」那段 `<p>` 之前插入：

```astro
<Backlinks refs={refs} />
```

- [ ] **Step 6: 在示例笔记中补一条指向氨基酸的链接**

修改 `src/content/notes/disulfide-bond.md`，在正文末尾追加一段：

```markdown
形成二硫键的两个残基必须是 [[Cys]]，且空间上足够接近（Sγ–Sγ 距离约 2.05 Å）。
```

- [ ] **Step 7: 验证 wikilink 解析到氨基酸页且反链生效**

Run: `npx astro build`
Expected: 控制台**不再**出现 `半胱氨酸` 的未解析警告

Run: `grep -o 'href="/aa/cys"' dist/n/disulfide-bond/index.html`
Expected: 有输出（`[[半胱氨酸]]` 与 `[[Cys]]` 都解析到了 `/aa/cys`）

Run: `grep -o '被这些页面提到' dist/aa/cys/index.html`
Expected: 有输出

- [ ] **Step 8: Commit**

```bash
git add src/lib/targets.ts src/lib/targets.test.ts src/pages/aa src/content/notes/disulfide-bond.md
git commit -m "feat: 氨基酸并入链接索引与反链"
```

---

### Task 12: `<Structure>` 蛋白质三维结构组件

**Files:**
- Create: `scripts/copy-molstar.mjs`
- Create: `src/components/Structure.astro`
- Create: `src/content/notes/ubiquitin.mdx`
- Modify: `package.json`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `Base.astro`（Task 1）
- Produces: `Structure.astro`，props `{ pdb?: string; src?: string; format?: string; caption?: string; height?: number }`；`pdb` 与 `src` 二选一

**懒加载是硬性要求：** 页面初始只渲染占位卡片，用户点击后才注入 `molstar.js` / `molstar.css` 并初始化 viewer。

- [ ] **Step 1: 安装 molstar**

Run: `npm install molstar@^5.7.0`
Expected: 安装成功

- [ ] **Step 2: 创建 `scripts/copy-molstar.mjs`**

Mol\* 的 viewer 是预构建 UMD 产物，直接当静态资源用，避免走打包器。

```js
import fs from 'node:fs'
import path from 'node:path'

const src = path.resolve('node_modules/molstar/build/viewer')
const dest = path.resolve('public/molstar')

if (!fs.existsSync(src)) {
  console.error('[molstar] 未找到 node_modules/molstar/build/viewer，请先 npm install')
  process.exit(1)
}

fs.mkdirSync(dest, { recursive: true })
for (const file of ['molstar.js', 'molstar.css']) {
  fs.copyFileSync(path.join(src, file), path.join(dest, file))
  console.log(`[molstar] copied ${file}`)
}
```

- [ ] **Step 3: 在 `package.json` 中接入该脚本**

`scripts` 改为：

**保留 `--force`**（原因见 Task 1 Step 1 的说明：wikilink 解析依赖全站笔记集合，Astro 内容缓存会产生陈旧渲染）。

```json
{
  "dev": "node scripts/copy-molstar.mjs && astro dev --force",
  "build": "node scripts/copy-molstar.mjs && astro build --force && pagefind --site dist",
  "preview": "astro preview",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 4: 在 `.gitignore` 中忽略拷贝产物**

追加一行：

```
public/molstar/
```

- [ ] **Step 5: 创建 `src/components/Structure.astro`**

`MOLSTAR_CONFIG` 直接沿用 `vscode-mol-viewer` 仓库中已验证的配置。

```astro
---
interface Props {
  /** PDB ID，与 src 二选一 */
  pdb?: string
  /** 本地或远程结构文件 URL，与 pdb 二选一 */
  src?: string
  /** src 的格式，默认 mmcif */
  format?: string
  caption?: string
  height?: number
}

const { pdb, src, format = 'mmcif', caption, height = 420 } = Astro.props

if (!pdb && !src) {
  throw new Error('<Structure> 必须提供 pdb 或 src 之一')
}

const label = caption ?? pdb ?? src!
---

<figure class="my-8">
  <div
    class="structure-host relative flex items-center justify-center rounded border border-neutral-200 bg-neutral-50"
    style={`height:${height}px`}
    data-pdb={pdb}
    data-src={src}
    data-format={format}
  >
    <button
      class="structure-load rounded bg-neutral-900 px-4 py-2 text-sm text-white"
      type="button"
    >
      加载 3D 结构 · {pdb ?? '本地文件'}
    </button>
    <p class="structure-status absolute bottom-3 hidden text-xs text-neutral-500"></p>
  </div>
  <figcaption class="mt-2 text-sm text-neutral-500">{label}</figcaption>
</figure>

<script>
  const MOLSTAR_CONFIG = {
    layoutIsExpanded: false,
    layoutShowControls: false,
    layoutShowRemoteState: false,
    layoutShowSequence: false,
    layoutShowLog: false,
    layoutShowLeftPanel: false,
    collapseLeftPanel: true,
    collapseRightPanel: true,
    viewportShowExpand: false,
    viewportShowToggleFullscreen: false,
    viewportShowControls: false,
    viewportShowSettings: false,
    viewportShowSelectionMode: false,
    viewportShowAnimation: false,
    volumeStreamingDisabled: true,
  }

  let assetsPromise: Promise<void> | null = null

  /** molstar.js 约 7 MB，只在首次点击时加载一次 */
  function loadMolstarAssets(): Promise<void> {
    if (assetsPromise) return assetsPromise

    assetsPromise = new Promise<void>((resolve, reject) => {
      const css = document.createElement('link')
      css.rel = 'stylesheet'
      css.href = '/molstar/molstar.css'
      document.head.appendChild(css)

      const script = document.createElement('script')
      script.src = '/molstar/molstar.js'
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('molstar.js 加载失败'))
      document.head.appendChild(script)
    })

    return assetsPromise
  }

  let viewerSeq = 0

  document.querySelectorAll<HTMLElement>('.structure-host').forEach((host) => {
    const button = host.querySelector<HTMLButtonElement>('.structure-load')
    const status = host.querySelector<HTMLElement>('.structure-status')
    if (!button || !status) return

    const setStatus = (message: string) => {
      status.textContent = message
      status.classList.remove('hidden')
    }

    button.addEventListener('click', async () => {
      button.disabled = true
      button.textContent = '加载中…'

      try {
        await loadMolstarAssets()

        const mount = document.createElement('div')
        mount.id = `molstar-viewer-${viewerSeq++}`
        mount.style.position = 'absolute'
        mount.style.inset = '0'
        host.appendChild(mount)
        button.remove()

        const viewer = await (window as any).molstar.Viewer.create(mount.id, MOLSTAR_CONFIG)

        if (host.dataset.pdb) {
          await viewer.loadPdb(host.dataset.pdb)
        } else {
          await viewer.loadStructureFromUrl(host.dataset.src, host.dataset.format, false)
        }

        viewer.handleResize()
        status.classList.add('hidden')
      } catch (err) {
        setStatus(`结构加载失败：${String(err)}`)
        button.disabled = false
        button.textContent = '重试'
      }
    })
  })
</script>
```

- [ ] **Step 6: 创建示例笔记 `src/content/notes/ubiquitin.mdx`**

```mdx
---
title: 泛素
tags: [蛋白质结构]
aliases: [ubiquitin]
---

import Structure from '../../components/Structure.astro'

泛素是 76 个残基的小蛋白，折叠为典型的 β-grasp（ubiquitin-like）拓扑：一段 α 螺旋横贴在混合 β 折叠片上。

<Structure pdb="1UBQ" caption="1UBQ · 泛素，β-grasp 折叠" />

C 端的 Gly76 通过异肽键连到底物赖氨酸的 ε-氨基上，这是泛素化的化学本质。
```

- [ ] **Step 7: 验证懒加载行为**

Run: `npm run build`
Expected: 构建成功，`public/molstar/molstar.js` 已生成

Run: `grep -c 'molstar.js' dist/n/ubiquitin/index.html`
Expected: 输出 `0` —— **HTML 中不得直接引用 molstar.js**，证明确实是点击后才动态注入

Run: `npm run dev` 打开 `http://localhost:4321/n/ubiquitin`
Expected: 页面显示「加载 3D 结构 · 1UBQ」按钮；打开浏览器 Network 面板确认此时**没有**请求 `molstar.js`；点击按钮后才开始下载并渲染出泛素结构

- [ ] **Step 8: Commit**

```bash
git add scripts/copy-molstar.mjs src/components/Structure.astro src/content/notes/ubiquitin.mdx package.json package-lock.json .gitignore
git commit -m "feat: Structure 组件（Mol* 懒加载）"
```

---

### Task 13: Pagefind 全文搜索

**Files:**
- Create: `src/components/Search.astro`
- Modify: `src/pages/index.astro`
- Modify: `src/layouts/Base.astro`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `Base.astro`（Task 1）
- Produces: `Search.astro` —— 挂载 Pagefind UI 的搜索框

**注意：** Pagefind 索引在 `astro build` 之后由 `pagefind --site dist` 生成，因此**只有 `npm run build && npm run preview` 才能测试搜索**，`npm run dev` 下搜索框不工作（这是预期行为）。

- [ ] **Step 1: 在 `Base.astro` 中标记可索引区域**

把 `<main>` 改为：

```astro
    <main data-pagefind-body>
      <slot />
    </main>
```

- [ ] **Step 2: 创建 `src/components/Search.astro`**

```astro
<div id="search" class="mt-6"></div>

<link rel="stylesheet" href="/pagefind/pagefind-ui.css" />

<script>
  // Pagefind 的产物只在 astro build 之后由 pagefind CLI 生成，
  // dev 模式下会 404 —— 静默降级即可。
  async function mountSearch() {
    const el = document.getElementById('search')
    if (!el) return

    try {
      const response = await fetch('/pagefind/pagefind-ui.js', { method: 'HEAD' })
      if (!response.ok) return
    } catch {
      return
    }

    const script = document.createElement('script')
    script.src = '/pagefind/pagefind-ui.js'
    script.onload = () => {
      new (window as any).PagefindUI({
        element: '#search',
        showSubResults: true,
        showImages: false,
        translations: {
          placeholder: '搜索笔记…',
          zero_results: '没有找到「[SEARCH_TERM]」',
        },
      })
    }
    document.head.appendChild(script)
  }

  mountSearch()
</script>
```

- [ ] **Step 3: 在首页挂载搜索框**

修改 `src/pages/index.astro`，在 frontmatter 追加：

```ts
import Search from '../components/Search.astro'
```

在 `<h1 class="text-2xl font-semibold">笔记</h1>` 之后插入：

```astro
  <Search />
```

- [ ] **Step 4: 验证搜索可用**

Run: `npm run build && ls dist/pagefind/ | head`
Expected: 出现 `pagefind.js`、`pagefind-ui.js`、`pagefind-ui.css` 等文件

Run: `npm run preview` 打开 `http://localhost:4321/`
在搜索框输入「二硫键」
Expected: 出现指向 `/n/disulfide-bond` 的结果

- [ ] **Step 5: Commit**

```bash
git add src/components/Search.astro src/pages/index.astro src/layouts/Base.astro
git commit -m "feat: Pagefind 全文搜索"
```

---

### Task 14: 构建冒烟检查与 GitHub Actions 部署

**Files:**
- Create: `scripts/check-build.mjs`
- Create: `.github/workflows/deploy.yml`
- Modify: `package.json`
- Create: `README.md`

**Interfaces:**
- Consumes: 前置全部任务的构建产物
- Produces: `npm run check` —— 断言关键路由已产出；CI 工作流

- [ ] **Step 1: 创建 `scripts/check-build.mjs`**

```js
import fs from 'node:fs'
import path from 'node:path'

const REQUIRED = [
  'index.html',
  'n/disulfide-bond/index.html',
  'n/protein-folding/index.html',
  'n/ubiquitin/index.html',
  'aa/index.html',
  'aa/cys/index.html',
  'tags/蛋白质结构/index.html',
  'pagefind/pagefind.js',
  'CNAME',
]

const missing = REQUIRED.filter((rel) => !fs.existsSync(path.resolve('dist', rel)))

if (missing.length > 0) {
  console.error('[check-build] 缺少以下产物：')
  for (const rel of missing) console.error(`  - dist/${rel}`)
  process.exit(1)
}

// 懒加载检查：页面里不得有会让浏览器立即请求 molstar 的静态标签。
//
// 注意不能简单地 includes('/molstar/molstar.js') —— 该 URL 字符串本来就存在于
// 内联脚本中（点击时用它动态创建 <script>），那是实现方式而非违规。真正的判据
// 是有没有 <script src> / <link href> 这类会立即触发下载的静态标签。
const ubiquitin = fs.readFileSync(path.resolve('dist/n/ubiquitin/index.html'), 'utf8')
const eagerTag = /<(?:script|link)\b[^>]*\b(?:src|href)\s*=\s*["'][^"']*molstar[^"']*["']/i
if (eagerTag.test(ubiquitin)) {
  console.error('[check-build] ubiquitin 页面存在会立即加载 molstar 的静态标签，懒加载已失效')
  process.exit(1)
}

console.log(`[check-build] 通过，${REQUIRED.length} 项产物齐备`)
```

- [ ] **Step 2: 在 `package.json` 中加入 check 脚本**

`scripts` 中追加：

```json
"check": "node scripts/check-build.mjs"
```

- [ ] **Step 3: 运行冒烟检查**

Run: `npm run build && npm run check`
Expected: 输出 `[check-build] 通过，9 项产物齐备`

- [ ] **Step 4: 创建 `.github/workflows/deploy.yml`**

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          # git 提交时间用于「最近更新」排序，需要完整历史
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
      - run: npm run check
      - uses: actions/upload-pages-artifact@v3
        with:
          path: ./dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/deploy-pages@v4
        id: deployment
```

**`fetch-depth: 0` 是必须的** —— 默认的浅克隆会让 `git log` 取不到文件历史，首页「最近更新」全部塌缩成同一时间。

- [ ] **Step 5: 创建 `README.md`**

```markdown
# 蛋白质知识笔记

数字花园形态的个人知识笔记站 → https://notes.passion4ever.org

## 写一篇笔记

在 `src/content/notes/` 下新建 `.md` 文件（用到组件时用 `.mdx`）：

```markdown
---
title: 米氏方程
tags: [酶动力学]
aliases: [Michaelis-Menten]
---

正文里用 [[双向链接]] 指向别的笔记。链接到还没写的笔记不是错误 ——
它会渲染成虚线，本身就是待写清单。
```

frontmatter 只有 `title` / `tags` / `aliases` 三个字段。**不要加日期**，
「最后更新」由 git 提交时间自动提供。

## 组件

```mdx
import Mol from '../../components/Mol.astro'
import Structure from '../../components/Structure.astro'

<Mol smiles="N[C@@H](CS)C(=O)O" caption="半胱氨酸" />
<Structure pdb="1UBQ" caption="泛素" />
<Structure src="/structures/my-design.cif" caption="自己跑的设计" />
```

自己的结构文件放 `public/structures/`。

## 氨基酸数据

`src/data/amino-acids.yaml` 驱动 `/aa` 速查表与 20 个详情页。
这是全站唯一一处数据驱动的内容 —— 其它表格直接写 markdown 表格即可。

## 命令

```bash
npm run dev       # 本地预览（搜索功能不可用）
npm run build     # 构建 + 生成 Pagefind 索引
npm run preview   # 预览构建产物（搜索可用）
npm test          # 单元测试
npm run check     # 构建产物冒烟检查
```

推到 `main` 分支自动部署。

## 为什么 dev / build 都带 `--force`

不要删掉它。Astro 的内容缓存假设一篇 markdown 的渲染只取决于它自己的内容，
但 `[[双向链接]]` 的解析取决于**全站笔记集合** —— 你新写一篇《米氏方程》后，
其它笔记里 `[[米氏方程]]` 的解析结果就变了。不带 `--force` 时缓存会端出旧渲染，
那些链接会永远停在灰色的「未写」状态。
```

- [ ] **Step 6: 最终全量验证**

Run: `npm test && npm run build && npm run check`
Expected: 测试全绿，构建成功，冒烟检查通过

- [ ] **Step 7: Commit**

```bash
git add scripts/check-build.mjs .github/workflows/deploy.yml package.json README.md
git commit -m "feat: 构建冒烟检查与 GitHub Actions 部署"
```

---

## 上线后需人工完成的步骤

这些无法由代码完成，实现全部结束后由作者操作：

1. 在 GitHub 上创建仓库并 `git remote add origin` + `git push -u origin main`
2. 仓库 Settings → Pages → Source 选 **GitHub Actions**
3. 在 DNS 服务商为 `passion4ever.org` 添加 CNAME 记录：`notes` → `<用户名>.github.io`
4. 等待证书签发后确认 `https://notes.passion4ever.org` 可访问
5. 在 `academic-homepage` 的导航栏添加指向该域名的外链
