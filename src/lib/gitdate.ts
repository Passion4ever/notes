import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

/**
 * 「最后更新时间」的唯一来源是 git 提交记录 ——
 * 这样写笔记时完全不用维护 frontmatter 里的日期。
 * 尚未提交的新文件回退到文件 mtime；文件不存在则用当前时间。
 */
export function getLastModified(relPath: string): Date {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cI', '--', relPath], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    if (out) return new Date(out)
  } catch {
    // 不在 git 仓库中，或 git 不可用 —— 继续走 mtime
  }

  try {
    return fs.statSync(path.resolve(process.cwd(), relPath)).mtime
  } catch {
    return new Date()
  }
}
