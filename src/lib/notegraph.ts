import { getCollection } from 'astro:content'
import { getIndex, loadTargets } from './targets'
import { buildLinkGraph, type NoteInput, type Ref } from './linkgraph'

let cached: { backlinks: Map<string, Ref[]>; unresolved: Map<string, Ref[]> } | null = null

/**
 * Astro 的 glob loader 用 github-slugger 给每篇笔记算 note.id；targets.ts
 * 的 loadTargets() 复刻同一算法独立算一遍 slug（remark 插件在 Astro 配置期
 * 就要用索引，那时 collection 还没加载，没法直接问 Astro 要 id）。两套独立
 * 实现万一某天分道扬镳——比如 Astro 升级换了默认 generateId——链接会全部
 * 悄悄解析到错误地址而不报任何错。这里做一次硬性断言：两边的笔记标识集合
 * 必须完全相同，不同就直接炸构建，而不是留一堆静默断链。
 */
function assertIdsMatchTargets(noteIds: string[], targetSlugs: string[]): void {
  const idSet = new Set(noteIds)
  const slugSet = new Set(targetSlugs)

  const onlyInAstro = [...idSet].filter((id) => !slugSet.has(id)).sort()
  const onlyInTargets = [...slugSet].filter((slug) => !idSet.has(slug)).sort()

  if (onlyInAstro.length === 0 && onlyInTargets.length === 0) return

  const lines = [
    '[notegraph] Astro collection 的笔记 id 与 targets.ts 算出的 slug 对不上，' +
      'wikilink 会解析到错误的地址。请把笔记文件名改成全小写、用连字符分词。',
  ]
  if (onlyInAstro.length > 0) {
    lines.push(`  只在 Astro collection 里出现：${onlyInAstro.join(', ')}`)
  }
  if (onlyInTargets.length > 0) {
    lines.push(`  只在 targets.ts 算出的列表里出现：${onlyInTargets.join(', ')}`)
  }
  throw new Error(lines.join('\n'))
}

export async function getNoteGraph() {
  // dev 模式下每次重建，保证新增笔记/新增链接后反链与未解析列表立即更新；
  // 构建时只建一次。与 targets.ts 的 getIndex() 保持同一条件，避免两者
  // 缓存策略不一致导致的诡异 stale 现象。
  if (process.env.NODE_ENV === 'production' && cached) return cached

  const notes = await getCollection('notes')

  assertIdsMatchTargets(
    notes.map((n) => n.id),
    loadTargets().map((t) => t.slug)
  )

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
