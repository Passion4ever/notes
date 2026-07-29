import { unified } from 'unified'
import remarkParse from 'remark-parse'
import { visit } from 'unist-util-visit'
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

const parser = unified().use(remarkParse)

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
