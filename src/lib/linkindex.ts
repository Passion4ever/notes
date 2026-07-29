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
 * 一个 normalize 后的名字被两个不同的 target 争抢，只有其中一个能生效。
 * 这不是错误——同名笔记与氨基酸完全可能同时存在，只是链接会指向其中
 * 一个——调用方（notegraph.ts）负责把这些冲突当作警告展示给用户，而
 * 不是让构建失败。
 */
export interface KeyCollision {
  /** normalize 后的键 */
  key: string
  /** 实际生效的 target（三轮优先级下的赢家） */
  winner: LinkTarget
  /** 争抢同一个键但没能生效的 target（可能不止一个） */
  losers: LinkTarget[]
}

/**
 * 分三轮写入，保证优先级：title > alias > slug。
 * 每轮内先到先得，因此同名冲突时靠前的条目胜出。
 *
 * 同时记录下这个过程中发生的键冲突：某个 target 的 title/alias/slug
 * 想写入的键已经被另一个不同的 target 占了。注意"同一个 target 自己的
 * title/alias/slug 互相撞名"（例如笔记标题恰好和文件名相同）不算冲突，
 * 用引用相等（===）把这种自撞排除掉。
 */
export function buildIndexWithCollisions(targets: LinkTarget[]): {
  index: LinkIndex
  collisions: KeyCollision[]
} {
  const index: LinkIndex = new Map()
  const collisionsByKey = new Map<string, KeyCollision>()

  const put = (key: string | undefined, target: LinkTarget) => {
    if (!key) return
    const k = normalizeName(key)
    if (!k) return

    const existing = index.get(k)
    if (!existing) {
      index.set(k, target)
      return
    }
    if (existing === target) return // 同一个 target 自己的字段互相撞名，不是冲突

    let collision = collisionsByKey.get(k)
    if (!collision) {
      collision = { key: k, winner: existing, losers: [] }
      collisionsByKey.set(k, collision)
    }
    if (!collision.losers.includes(target)) collision.losers.push(target)
  }

  for (const t of targets) put(t.title, t)
  for (const t of targets) for (const a of t.aliases ?? []) put(a, t)
  for (const t of targets) put(t.slug, t)

  return { index, collisions: [...collisionsByKey.values()] }
}

/** 薄包装：多数调用方只关心索引本身，不关心冲突详情。 */
export function buildIndex(targets: LinkTarget[]): LinkIndex {
  return buildIndexWithCollisions(targets).index
}

export function resolve(index: LinkIndex, name: string): LinkTarget | null {
  return index.get(normalizeName(name)) ?? null
}

/**
 * 未解析链接指向的占位页地址。
 * 对 normalizeName() 之后的结果编码，与 linkgraph 的 unresolved key
 * （同样经 normalizeName 规范化）保持一致 —— 否则英文名会因大小写
 * 不一致生成两个不同的 href，导致占位页 404。
 */
export function missingHref(name: string): string {
  return `/n/${encodeURIComponent(normalizeName(name))}`
}
