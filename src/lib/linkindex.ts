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
 * 把未解析的链接名转成可安全用作路由段的 slug。
 *
 * 这是"占位页地址怎么算"这条规则的唯一权威实现。此前 missingHref()（用
 * encodeURIComponent 编码）与 [slug].astro 的 getStaticPaths（把规范化后的
 * 原始名字直接丢给 Astro 路由 stringifier）各自维护一套判断，对 `/ \ # ? %`
 * 这类路径/URL 敏感字符的处理结论不一致：
 *   - `/` 被 Astro 的 [slug]（非 [...slug]）路由当作路径分隔符，直接
 *     `TypeError: Missing parameter: slug` 炸掉整个构建；
 *   - `#`、`?` 不炸构建，但 Astro 生成的目录名是字面量、href 里却是
 *     encodeURIComponent 编码后的形式，浏览器解码后两者对不上 → 占位页 404。
 *
 * 因此 missingHref()、linkgraph.ts 的 unresolved key、[slug].astro 的
 * getStaticPaths 三处都必须调用这一个函数，不允许任何一处自己再算一遍。
 *
 * 建立在 normalizeName() 之上：先规范化大小写与首尾空白，再把 `/ \ # ? %`
 * 这些字符替换成 `-`（连续出现折叠成一个），去掉结果首尾的 `-`。对替换后
 * 退化成空串、或纯由 `.` 组成（`.`、`..` 在文件系统/路由里有"当前目录"
 * "上级目录"的特殊含义）的结果做兜底，避免产出这类危险或无意义的路由段。
 */
export function placeholderSlug(name: string): string {
  const normalized = normalizeName(name)
  const slug = normalized
    .replace(/[/\\#?%]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')

  if (slug === '' || /^\.+$/.test(slug)) return 'untitled'

  return slug
}

/** target 是以自身的哪个字段争夺某个 key 的：标题、别名、还是 slug。 */
export type MatchField = 'title' | 'alias' | 'slug'

/** 争夺同一个 key 的一方：是谁、以什么身份。 */
export interface CollisionEntry {
  target: LinkTarget
  field: MatchField
}

/**
 * 一个 normalize 后的名字被两个不同的 target 争抢，只有其中一个能生效。
 * 这不是错误——同名笔记与氨基酸完全可能同时存在，只是链接会指向其中
 * 一个——调用方（notegraph.ts）负责把这些冲突当作警告展示给用户，而
 * 不是让构建失败。
 *
 * winner/losers 各自记录 field：这是 put() 写入当下就知道的事实（当时正
 * 处在 title/alias/slug 哪一轮），直接记下来，而不是让调用方事后拿 key
 * 去反推"这是撞的 title 还是 alias"——事后反推等于在别处又实现一遍这里
 * 的三轮优先级顺序，一旦这里的轮次顺序调整而忘了同步，反推那边会静默
 * 给出错误结论且没有测试能抓到。
 */
export interface KeyCollision {
  /** normalize 后的键 */
  key: string
  /** 实际生效的一方（三轮优先级下的赢家） */
  winner: CollisionEntry
  /** 争抢同一个键但没能生效的一方（可能不止一个） */
  losers: CollisionEntry[]
}

/**
 * 分三轮写入，保证优先级：title > alias > slug。
 * 每轮内先到先得，因此同名冲突时靠前的条目胜出。
 *
 * 同时记录下这个过程中发生的键冲突：某个 target 的 title/alias/slug
 * 想写入的键已经被另一个不同的 target 占了。注意"同一个 target 自己的
 * title/alias/slug 互相撞名"（例如笔记标题恰好和文件名相同）不算冲突，
 * 用引用相等（===）把这种自撞排除掉——这依赖一个隐含前提：每个逻辑条目
 * （每篇笔记/每个氨基酸）在 loadTargets() 返回的数组里只对应恰好一个
 * LinkTarget 对象实例。如果将来 loadTargets() 为同一个逻辑条目在数组里
 * 放进两个不同的对象（哪怕字段完全一样），这里的自撞判定会失效，把它
 * 误判成真实冲突。
 */
export function buildIndexWithCollisions(targets: LinkTarget[]): {
  index: LinkIndex
  collisions: KeyCollision[]
} {
  // winners 是唯一的真相来源：key -> 当前赢家 + 它是以什么身份赢下这个 key 的。
  // index 只是最后从 winners 里派生出的、给一般调用方用的简化视图（key -> target）。
  const winners = new Map<string, CollisionEntry>()
  const collisionsByKey = new Map<string, KeyCollision>()

  const put = (key: string | undefined, target: LinkTarget, field: MatchField) => {
    if (!key) return
    const k = normalizeName(key)
    if (!k) return

    const existingWinner = winners.get(k)
    if (!existingWinner) {
      winners.set(k, { target, field })
      return
    }
    if (existingWinner.target === target) return // 同一个 target 自己的字段互相撞名，不是冲突

    let collision = collisionsByKey.get(k)
    if (!collision) {
      collision = { key: k, winner: existingWinner, losers: [] }
      collisionsByKey.set(k, collision)
    }
    if (!collision.losers.some((l) => l.target === target)) {
      collision.losers.push({ target, field })
    }
  }

  for (const t of targets) put(t.title, t, 'title')
  for (const t of targets) for (const a of t.aliases ?? []) put(a, t, 'alias')
  for (const t of targets) put(t.slug, t, 'slug')

  const index: LinkIndex = new Map()
  for (const [k, entry] of winners) index.set(k, entry.target)

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
 * 对 placeholderSlug() 的结果做 encodeURIComponent，保证中文字符在
 * URL 里安全——但路由段本身的计算规则完全交给 placeholderSlug()，
 * 这里不再自己判断哪些字符需要处理。与 linkgraph 的 unresolved key
 * （同样调用 placeholderSlug）、[slug].astro 的 getStaticPaths 三处
 * 保持一致，否则会重演"两套逻辑各自编码，占位页 404 或直接炸构建"。
 */
export function missingHref(name: string): string {
  return `/n/${encodeURIComponent(placeholderSlug(name))}`
}
