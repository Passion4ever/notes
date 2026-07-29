# protein-notes

蛋白质笔记站，Astro 构建的数字花园形态个人知识笔记站 → <https://notes.passion4ever.org>

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

**文件名必须全小写、用连字符分词**（例如 `flow-matching.md`，不要
`Flow Matching.md` 或 `flow_matching.md`）。原因：Astro 的 content collection
用 github-slugger 给每篇笔记算 id（转小写、空格转连字符），如果文件名本身带大写
字母或空格，算出来的 id 会和链接索引独立计算的 slug 对不上，wikilink 会悄悄解析
到错误地址。构建期对此有一条硬性断言（`src/lib/notegraph.ts`），命名不规范会
直接报错拦住构建，而不是留一堆静默断链——所以规则要一开始就守住，省得构建失败
时再回头改文件名。

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

## Pagefind 版本锁死在 1.4.0 —— 请勿升级，除非你先读完这一节

`package.json` 里 `pagefind` 是精确版本号 `"1.4.0"`（不是 `^1.4.0`），`package-lock.json` 也锁在这个版本。这不是疏忽，是**有意钉死**的，原因如下。

### 坏在哪

Pagefind 从 **1.5.0** 起，查询端（浏览器里跑的 `pagefind.js`）改用浏览器内置的
`Intl.Segmenter` 给中文查询词分词，但构建端（`pagefind` CLI 里的 Rust 分词器，负责
把网页正文切词写进索引）用的是另一套完全独立的分词实现。这两套分词器对**常见词**
（蛋白质、半胱氨酸、翻译后修饰……）切分结果碰巧一致，但对**生化领域的专业复合词**
（二硫键、谷胱甘肽……）切分结果不一致：

- 构建端（Rust）把「二硫键」整体当一个词索引。
- 查询端（`Intl.Segmenter`）把用户输入的「二硫键」拆成「二」「硫」「键」三个独立单字。

Pagefind 的多词查询要求除最后一个词外都要在索引里**精确匹配**到独立词条，而索引里
「二」从未脱离「硫键」单独存在过，于是这个查询在 1.5.x 上**永远搜不到任何结果**——
即使正文里逐字包含「二硫键」这个词。

**这个坏法是静默的：不会报错、不会崩溃，只是安安静静地返回「没有找到」，非常容易被
当成"这个词本来就没收录"而被忽略，直到有人真的去对着搜索框敲这几个字才会发现。**

降级到 1.4.0 后，构建端和查询端用的是同一套（更早期、更简单的）分词逻辑，两端切法
一致，问题消失，且没有观察到其它词（蛋白质、半胱氨酸、泛素、ubiquitin、Cys 等）的
搜索质量退化。

### 怎么复现验证

如果将来有人（包括未来的你）想再升级 pagefind，请先按下面的步骤验证，而不是直接
`npm update`：

```bash
npm run build
npx astro preview --port 4399
# 打开 http://localhost:4399/，在首页搜索框里实际输入：
#   「二硫键」 —— 期望：出现指向 /n/disulfide-bond 的结果（1.5.x 上这里会是 0 条结果）
#   「谷胱甘肽」 —— 期望：有结果（1.5.x 上这里也是 0 条结果）
#   「半胱氨酸」 —— 期望：出现指向 /aa/cys 的结果（两个版本都正常，作为对照）
#   「ubiquitin」 —— 期望：出现指向泛素笔记页的结果（两个版本都正常，作为对照）
pkill -f "astro preview"
```

只有当「二硫键」「谷胱甘肽」这两个词也能搜到结果时，才说明新版本修复了构建端/
查询端分词不一致的问题，才可以放心升级并把 `package.json` 里的版本号改回去。
如果只测了「蛋白质」「半胱氨酸」这类常见词就判断"搜索正常"，是不够的——这两个词
在 1.5.x 上本来就搜得到，测不出问题。

### 相关代码

- `src/components/Search.astro` —— 挂载 Pagefind 默认搜索 UI（`PagefindUI`）。
- Pagefind 官方对该问题的讨论：<https://github.com/Pagefind/pagefind/issues/987>
  （截至本文写作时，官方尚未提供 CLI 配置项或自定义词典来修复这类领域词汇的
  分词不一致，1.5.x 系列上没有已知的绕过方式）。

## 开发

```bash
npm install
npm run dev      # 开发模式；/pagefind/* 会 404，搜索框不工作，这是预期行为
npm run build    # astro build + pagefind 索引；只有 build 之后搜索才可用
npm run preview  # 预览 build 产物，可以实际测试搜索
npm test         # 单元测试
npm run check    # 构建产物冒烟检查（校验关键路由都产出了，且 molstar 懒加载没被破坏）
```

推到 `main` 分支会触发 GitHub Actions 自动部署：`npm ci` → `npm test` →
`npm run build` → `npm run check` → 发布到 GitHub Pages（见
`.github/workflows/deploy.yml`）。任何一步失败都不会上线。

### 为什么 dev / build 都带 `--force`

不要删掉它。Astro 的内容缓存假设一篇 markdown 的渲染只取决于它自己的内容，
但 `[[双向链接]]` 的解析取决于**全站笔记集合** —— 你新写一篇《米氏方程》后，
其它笔记里 `[[米氏方程]]` 的解析结果就变了。不带 `--force` 时缓存会端出旧渲染，
那些链接会永远停在灰色的「未写」状态。
