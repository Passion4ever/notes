import { Buffer } from 'node:buffer'

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
 * 纯符号/全部退化字符的兜底 slug。
 *
 * 含一个字面 `~`：github-slugger（Astro 的 glob loader 给笔记算 id 时用的
 * 同一个库，也是 targets.ts 的 computeSlug() 复刻的对象）的字符过滤表会
 * 无条件剔除 `~`（验证：`slug('a~b')` === `'ab'`，`slug('unresolved~link')`
 * === `'unresolvedlink'`——`~` 无论出现在哪个位置、原始输入是什么，都不会
 * 留在输出里）。因此任何真实笔记文件名，不管叫什么，经 computeSlug() 算出
 * 的 slug 都不可能是这个含 `~` 的字面量——不是"不太可能"，是结构上不可能，
 * 不依赖于"用户不会这样取名"这种概率性假设（上一轮的 'untitled' 就是反例：
 * Obsidian 新建笔记的默认文件名恰好就叫 Untitled，撞上是必然会发生的事）。
 * `~` 同时也不在下面 placeholderSlug() 自身的白名单字符集里，所以也不会跟
 * 另一个"正常"（非退化）名称清洗后的占位 slug 撞车。`~` 本身是 RFC 3986
 * 的 unreserved 字符，在 URL 路径段和常见文件系统里都是安全字符，不需要
 * 额外转义。
 *
 * 即便如此，findPlaceholderNoteCollisions()（linkgraph.ts）仍然会在真实
 * 构建时做一次硬性断言：这个兜底值本身不可能撞车，不代表"正常清洗路径"
 * 产生的占位 slug 也不可能撞车——两个不同的未解析名仍可能塌缩成同一个
 * slug 并恰好等于某篇真实笔记的 slug（例如 [[a/b]] → "a-b"，而用户真的
 * 有一篇 a-b.md）。静默顶替真实笔记内容必须是硬失败，不能只靠"精心挑选
 * 一个不会撞的常量"来防。
 */
const PLACEHOLDER_FALLBACK_SLUG = 'unresolved~link'

/**
 * 单个路由段允许的最大字节数（UTF-8）。远低于常见文件系统单段路径长度
 * 上限（多数 Unix 文件系统含 macOS APFS、Linux ext4 是 255 字节/段）。
 * 超长的未解析链接名（比如整段句子被误写进 [[ ]]）如果不截断，会在生成
 * 占位页目录时触发 ENAMETOOLONG——这和"未解析链接把构建炸掉"是同一件
 * 事，只是触发条件从字符类型换成了长度，因此也要在这个函数里统一处理。
 */
const MAX_SLUG_BYTES = 150

/** 按 Unicode 码位（而不是 UTF-16 code unit）截断，不会切断代理对/emoji。 */
function truncateToByteLimit(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, 'utf8') <= maxBytes) return value

  let out = ''
  for (const ch of value) {
    // for...of 按码位迭代字符串，天然不会把一个代理对拆成两半
    const next = out + ch
    if (Buffer.byteLength(next, 'utf8') > maxBytes) break
    out = next
  }
  return out
}

/**
 * 把未解析的链接名转成可安全用作路由段的 slug。
 *
 * 这是"占位页地址怎么算"这条规则的唯一权威实现。此前 missingHref()（用
 * encodeURIComponent 编码）与 [slug].astro 的 getStaticPaths（把规范化后的
 * 原始名字直接丢给 Astro 路由 stringifier）各自维护一套判断，对路径/URL
 * 敏感字符的处理结论不一致，`/` 直接炸构建，`#`/`?` 生成 404 占位页。
 *
 * 用白名单而不是黑名单：黑名单枚举"哪些字符危险"永远列不全——这条规则
 * 已经在这上面栽过两次了。先是漏了 `/`（构建直接炸掉），补上 `/ \ # ? %`
 * 之后，又漏了控制字符（比如 wikilink 名称因为手动换行带上的字面 `\n`，
 * 会让 Astro 的静态路径生成报 NoMatchingStaticPathFound）——同一个失败
 * 类别，只是换了个触发字符，永远补不完。反过来，只保留已知安全的字符：
 * `\p{L}`（各语言文字，含中日韩表意文字、希腊字母等）、`\p{N}`（各语言
 * 数字）、下划线与连字符；其余一律替换成连字符，不需要再逐一列举"还有
 * 哪些字符是危险的"。
 *
 * 因此 missingHref()、linkgraph.ts 的 unresolved key、[slug].astro 的
 * getStaticPaths 三处都必须调用这一个函数，不允许任何一处自己再算一遍。
 *
 * 建立在 normalizeName() 之上：先规范化大小写与首尾空白，替换掉不安全
 * 字符（连续出现折叠成一个连字符，首尾连字符去掉），按字节数截断避免
 * 超长路由段，最后对退化成空串的结果兜底为 PLACEHOLDER_FALLBACK_SLUG
 * （不再是 'untitled' 这种可能撞上真实笔记文件名的普通词——理由见上）。
 * 注意 `.`/`..` 不需要单独判断：`.` 本身也不在白名单里，纯 `.`/`..` 会
 * 先被替换成连字符、再被首尾 trim 掉，天然退化成空串，走同一条兜底路径。
 */
export function placeholderSlug(name: string): string {
  const normalized = normalizeName(name)

  const sanitized = normalized
    .replace(/[^\p{L}\p{N}_-]+/gu, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')

  const truncated = truncateToByteLimit(sanitized, MAX_SLUG_BYTES).replace(/-+$/g, '')

  return truncated === '' ? PLACEHOLDER_FALLBACK_SLUG : truncated
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
