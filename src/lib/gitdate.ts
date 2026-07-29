import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

export interface LastModifiedInfo {
  /** 用于排序的 Date 对象。 */
  date: Date
  /**
   * 日历日（`YYYY-MM-DD`）。git 成功时直接取 `%cI` 原始输出的前 10 个字符 ——
   * 那是提交者本地时区下的日历日，不经过 Date 往返，因此不受构建机器时区影响
   * （构建机可能在 UTC，把 `2026-07-30T01:00:00+08:00` 转成 Date 再 toISOString()
   * 会变回 UTC 的 2026-07-29，差一天）。走 mtime 或当前时间兜底时，同样用本地
   * 时间的年月日手工拼接，不用 toISOString()。
   */
  day: string
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function localDay(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/**
 * 「最后更新时间」的唯一来源是 git 提交记录 ——
 * 这样写笔记时完全不用维护 frontmatter 里的日期。
 * 尚未提交的新文件回退到文件 mtime；文件不存在则用当前时间（并打印警告，
 * 因为这意味着调用方传入的路径既不在 git 历史里也不在磁盘上，多半是路径算错了）。
 */
export function getLastModifiedInfo(relPath: string): LastModifiedInfo {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cI', '--', relPath], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    if (out) {
      // out 形如 2026-07-30T01:00:00+08:00：严格 ISO 8601，带提交者时区偏移。
      return { date: new Date(out), day: out.slice(0, 10) }
    }
  } catch {
    // 不在 git 仓库中，或 git 不可用 —— 继续走 mtime
  }

  try {
    const mtime = fs.statSync(path.resolve(process.cwd(), relPath)).mtime
    return { date: mtime, day: localDay(mtime) }
  } catch {
    const now = new Date()
    console.warn(
      `[gitdate] 取不到 "${relPath}" 的 git 提交时间，文件在磁盘上也不存在，退化为当前时间 ${now.toISOString()}。` +
        '这通常意味着传入的路径是错的（例如对 .mdx 笔记按 .md 拼路径）。',
    )
    return { date: now, day: localDay(now) }
  }
}

/** 薄包装：只要排序用的 Date 时用这个，保持既有调用方与测试不用改。 */
export function getLastModified(relPath: string): Date {
  return getLastModifiedInfo(relPath).date
}
