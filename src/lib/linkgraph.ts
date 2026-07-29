import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkMath from 'remark-math'
import { visit } from 'unist-util-visit'
import { resolve, normalizeName, placeholderSlug, type LinkIndex } from './linkindex'

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

// 必须挂 remarkMath，与 astro.config.mjs 里真实渲染管线（remarkMath +
// remarkWikilink）保持同一套节点类型判定。裸 unified().use(remarkParse)
// 会把 $[[A 笔记]]$ 这样的行内数学公式当成普通文本处理，[[A 笔记]] 落在
// text 节点里被当作 wikilink 提取出来，产生幽灵反链——公式里的方括号跟
// wikilink 语法毫无关系。挂上 remarkMath 后 $...$ 被解析成独立的
// inlineMath 节点，和 inlineCode/code 一样天然不会被 visit(tree, 'text', …)
// 访问到。
const parser = unified().use(remarkParse).use(remarkMath)

/**
 * 用 remark-parse 把正文解析成 AST，只访问 text 节点提取 [[x]]。
 * 与 wikilink.ts 走同一个解析器、同一套节点类型判定：代码块（code）
 * 与行内代码（inlineCode）是独立的节点类型，天然不会被当成 text 访问到，
 * 不需要（也不能用）正则去模拟"跳过代码"——那样永远追不平 CommonMark
 * 的围栏长度匹配、缩进代码块、跨行行内代码等规则。
 */
export function extractWikilinks(body: string): string[] {
  const tree = parser.parse(body)
  const names: string[] = []
  const seen = new Set<string>()

  visit(tree, 'text', (node: any) => {
    const value: string = node.value
    if (!value.includes('[[')) return

    let match: RegExpExecArray | null
    WIKILINK.lastIndex = 0
    while ((match = WIKILINK.exec(value)) !== null) {
      const name = match[1].trim()
      if (!name) continue
      const key = normalizeName(name)
      if (seen.has(key)) continue
      seen.add(key)
      names.push(name)
    }
  })

  return names
}

/**
 * backlinks 以 target.href（而非 target.slug）为 key。
 *
 * slug 只在各自的命名空间内唯一：笔记的 slug 来自文件名，氨基酸的 slug 是
 * 三字母代码，两个命名空间完全独立，可以合法地重名（例如笔记
 * src/content/notes/cys.md 与氨基酸 Cys 都会得到 slug "cys"）。如果 backlinks
 * 用 slug 当 key，/n/cys 与 /aa/cys 会互相覆盖、合并成同一份反链列表——
 * 对一个氨基酸主题的笔记站，cys.md/his.md/ser.md 这类文件名是完全自然的
 * 写作选择，不该因为撞了氨基酸代码就产生数据串台。
 *
 * href 由构造保证全站唯一（笔记 `/n/<slug>`、氨基酸 `/aa/<slug>`，前缀不同
 * 且各自命名空间内 slug 唯一），因此用它做 key 不会有这个问题。自引用判断
 * 同步改成比较 href（而不是 slug），道理相同。
 */
export function buildLinkGraph(notes: NoteInput[], index: LinkIndex) {
  const backlinks = new Map<string, Ref[]>()
  // unresolved 的 key 直接就是 placeholderSlug() 算出的路由 slug（而不是
  // normalizeName 的规范化名）。这样"两个不同的原始名字经 placeholderSlug
  // 折叠成同一个 slug"（例如 [[a/b]] 与 [[a\b]] 都会被替换成 "a-b"）在写入
  // 这个 map 的当下就自动合并成一条，而不是各自占一个 key、到了
  // [slug].astro 的 getStaticPaths 里才发现两个 placeholder 页面撞了同一个
  // params.slug——map 的 key 本身就是路由身份，从源头消除了这类碰撞。
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
        if (target.href === note.href) continue // 自引用无意义
        push(backlinks, target.href, ref)
      } else {
        push(unresolved, placeholderSlug(name), ref)
      }
    }
  }

  return { backlinks, unresolved }
}
