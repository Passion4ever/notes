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
 * 分三轮写入，保证优先级：title > alias > slug。
 * 每轮内先到先得，因此同名冲突时靠前的条目胜出。
 */
export function buildIndex(targets: LinkTarget[]): LinkIndex {
  const index: LinkIndex = new Map()

  const put = (key: string | undefined, target: LinkTarget) => {
    if (!key) return
    const k = normalizeName(key)
    if (k && !index.has(k)) index.set(k, target)
  }

  for (const t of targets) put(t.title, t)
  for (const t of targets) for (const a of t.aliases ?? []) put(a, t)
  for (const t of targets) put(t.slug, t)

  return index
}

export function resolve(index: LinkIndex, name: string): LinkTarget | null {
  return index.get(normalizeName(name)) ?? null
}

/** 未解析链接指向的占位页地址 */
export function missingHref(name: string): string {
  return `/n/${encodeURIComponent(name.trim())}`
}
