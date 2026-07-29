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
