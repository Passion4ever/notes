import { getCollection } from 'astro:content'
import { getIndexWithCollisions, loadTargets } from './targets'
import type { CollisionEntry, MatchField } from './linkindex'
import { buildLinkGraph, findPlaceholderNoteCollisions, type NoteInput, type Ref } from './linkgraph'

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

/**
 * MatchField 到中文词的纯查表——不做任何"这个 target 到底是靠 title 还是
 * alias 命中"的推断。CollisionEntry.field 在 buildIndexWithCollisions()
 * 里写入索引的当下就已经记录好了（它当时就知道自己在哪一轮），这里只管
 * 照着 field 查表拼人话，不重新判断一遍——避免和 buildIndexWithCollisions
 * 的三轮顺序各自维护一份、将来两边悄悄分道扬镳。
 *
 * href 前缀（/n/ 笔记、/aa/ 氨基酸）用来决定用哪一列词——这个判断不涉及
 * title/alias/slug 的优先级顺序，只是纯粹的文案措辞选择，放在 notegraph
 * 这层做没问题。
 */
const FIELD_LABEL: Record<MatchField, { note: string; other: string }> = {
  title: { note: '笔记标题', other: '氨基酸中文名' },
  alias: { note: '笔记别名', other: '氨基酸别名' },
  slug: { note: '笔记文件名', other: '氨基酸代码' },
}

function describeMatch(entry: CollisionEntry): string {
  const isNote = entry.target.href.startsWith('/n/')
  const label = FIELD_LABEL[entry.field]
  return isNote ? label.note : label.other
}

export async function getNoteGraph() {
  // dev 模式下每次重建，保证新增笔记/新增链接后反链与未解析列表立即更新；
  // 构建时只建一次。与 targets.ts 的 getIndex() 保持同一条件，避免两者
  // 缓存策略不一致导致的诡异 stale 现象。
  if (process.env.NODE_ENV === 'production' && cached) return cached

  const notes = await getCollection('notes')

  // loadTargets() 只走一遍（全目录 walk + 逐文件读 frontmatter + 唯一性
  // 检查，代价不算小），下面把同一份结果直接传给 getIndexWithCollisions()
  // 复用，不再重新 loadTargets() 一遍。
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

  // 走 targets.ts 的 getIndexWithCollisions()，而不是自己 buildIndexWithCollisions()
  // 一遍——这样既保证"报告出来的赢家"和"buildLinkGraph 实际用来解析链接的
  // 索引"是同一次计算的产物，又和 astro.config.mjs 里 remarkWikilink 用的
  // getIndex() 共享同一个缓存单例（见 targets.ts 里 cached 的注释）。
  const { index, collisions } = getIndexWithCollisions(targets)

  const inputs: NoteInput[] = notes.map((n) => ({
    slug: n.id,
    title: n.data.title,
    href: `/n/${n.id}`,
    body: n.body ?? '',
  }))

  cached = buildLinkGraph(inputs, index)

  // 占位页 slug 与真实笔记 slug 相同 = 真实笔记的内容会被静默替换成"这篇
  // 还没写"的占位页，且没有任何报错——这是本项目最不能接受的失败模式。
  // findPlaceholderNoteCollisions() 的详细原理见 linkgraph.ts 的注释；这里
  // 只管把非空结果当硬错误处理，直接炸构建，绝不放行。
  const placeholderCollisions = findPlaceholderNoteCollisions(
    cached.unresolved,
    notes.map((n) => n.id)
  )
  if (placeholderCollisions.length > 0) {
    const lines = [
      `[notegraph] ${placeholderCollisions.length} 个未解析链接生成的占位页 slug 与真实笔记的 slug 完全相同，` +
        '会静默覆盖真实笔记，已阻断构建：',
    ]
    for (const { slug, refs } of placeholderCollisions) {
      const from = refs.map((r) => r.slug).join(', ')
      lines.push(`  - 占位页 "/n/${slug}" 与真实笔记 "/n/${slug}" 撞车（来自未解析链接，引用处：${from}）`)
    }
    lines.push('请修改上述笔记里指向该名称的 [[链接]]（可能是拼写错误，或链接名清洗后恰好与文件名撞车）。')
    throw new Error(lines.join('\n'))
  }

  if (collisions.length > 0) {
    // 同名笔记与氨基酸（或其他 target）同时存在是合理需求，不阻断构建；
    // 但用户应该知道自己刚写的名字劫持了一个已有的链接目标，否则会在
    // 完全不知情的情况下产生断链或误链。
    console.warn(
      `\n[wikilink] ${collisions.length} 个链接名称存在多个目标，已按 title > alias > slug 优先级取其一：`
    )
    for (const c of collisions) {
      const winnerDesc = describeMatch(c.winner)
      const losersDesc = c.losers.map((l) => `${l.target.href}（${describeMatch(l)}）`).join('、')
      console.warn(`  - 「${c.key}」 → ${c.winner.target.href}（${winnerDesc}）；被压住：${losersDesc}`)
    }
    console.warn('')
  }

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
