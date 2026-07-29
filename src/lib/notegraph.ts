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

  // loadTargets() 只走一遍（全目录 walk + 逐文件读 frontmatter + 唯一性
  // 检查，代价不算小），下面把同一份结果直接传给 getIndex()复用，不再让
  // 它内部自己重新 loadTargets() 一遍。
  const targets = loadTargets()

  // 只比对笔记类 target 的 slug。loadTargets() 后续会扩展成"笔记 + 氨基酸
  // 条目"的合集，氨基酸条目的 href 形如 /aa/cys、slug 是 cys，天然不会
  // 出现在 notes collection 的 id 里——这条断言本来断言的就是"笔记的 slug
  // 与笔记 collection 的 id 一致"，混进非笔记 target 只会制造假阳性差集，
  // 让每次构建都误报，所以先按 href 前缀筛出笔记类的再比。
  const noteTargets = targets.filter((t) => t.href.startsWith('/n/'))

  assertIdsMatchTargets(
    notes.map((n) => n.id),
    noteTargets.map((t) => t.slug)
  )

  const inputs: NoteInput[] = notes.map((n) => ({
    slug: n.id,
    title: n.data.title,
    href: `/n/${n.id}`,
    body: n.body ?? '',
  }))

  cached = buildLinkGraph(inputs, getIndex(targets))

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
