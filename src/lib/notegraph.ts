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
