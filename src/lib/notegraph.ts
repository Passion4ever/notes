import { getCollection } from 'astro:content'
import { loadTargets } from './targets'
import { buildIndexWithCollisions, normalizeName, type LinkTarget } from './linkindex'
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

/**
 * 描述某个 target 是通过 title / alias / slug 里的哪一个匹配上给定 key 的，
 * 结合 target 是笔记还是氨基酸给出人话说明，方便用户判断该改哪边的名字。
 * 复用 buildIndexWithCollisions 内部同一套 normalizeName 比较方式，避免另
 * 写一套判定逻辑——这类"两套算法不一致"的坑在这个项目里已经踩过两次了。
 */
function describeMatchSource(target: LinkTarget, key: string): string {
  const isNote = target.href.startsWith('/n/')
  if (normalizeName(target.title) === key) return isNote ? '笔记标题' : '氨基酸中文名'
  if ((target.aliases ?? []).some((a) => normalizeName(a) === key)) return isNote ? '笔记别名' : '氨基酸别名'
  return isNote ? '笔记文件名' : '氨基酸代码'
}

export async function getNoteGraph() {
  // dev 模式下每次重建，保证新增笔记/新增链接后反链与未解析列表立即更新；
  // 构建时只建一次。与 targets.ts 的 getIndex() 保持同一条件，避免两者
  // 缓存策略不一致导致的诡异 stale 现象。
  if (process.env.NODE_ENV === 'production' && cached) return cached

  const notes = await getCollection('notes')

  // loadTargets() 只走一遍（全目录 walk + 逐文件读 frontmatter + 唯一性
  // 检查，代价不算小），下面把同一份结果直接传给 buildIndexWithCollisions()
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

  // 直接用同一个 buildIndexWithCollisions 建索引，而不是走 targets.ts 的
  // getIndex()——这样"报告出来的赢家"和"buildLinkGraph 实际用来解析链接
  // 的索引"保证是同一次计算的产物，不会因为两条路径各自建一遍索引而
  // 悄悄分道扬镳。
  const { index, collisions } = buildIndexWithCollisions(targets)

  const inputs: NoteInput[] = notes.map((n) => ({
    slug: n.id,
    title: n.data.title,
    href: `/n/${n.id}`,
    body: n.body ?? '',
  }))

  cached = buildLinkGraph(inputs, index)

  if (collisions.length > 0) {
    // 同名笔记与氨基酸（或其他 target）同时存在是合理需求，不阻断构建；
    // 但用户应该知道自己刚写的名字劫持了一个已有的链接目标，否则会在
    // 完全不知情的情况下产生断链或误链。
    console.warn(
      `\n[wikilink] ${collisions.length} 个链接名称存在多个目标，已按 title > alias > slug 优先级取其一：`
    )
    for (const c of collisions) {
      const winnerDesc = describeMatchSource(c.winner, c.key)
      const losersDesc = c.losers.map((l) => `${l.href}（${describeMatchSource(l, c.key)}）`).join('、')
      console.warn(`  - 「${c.key}」 → ${c.winner.href}（${winnerDesc}）；被压住：${losersDesc}`)
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
