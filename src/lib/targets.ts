import fs from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import { buildIndex, type LinkIndex, type LinkTarget } from './linkindex'

const NOTES_DIR = path.resolve(process.cwd(), 'src/content/notes')

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (/\.mdx?$/.test(entry.name)) out.push(full)
  }
  return out
}

function loadNoteTargets(): LinkTarget[] {
  return walk(NOTES_DIR).map((file) => {
    const slug = path
      .relative(NOTES_DIR, file)
      .replace(/\.mdx?$/, '')
      .split(path.sep)
      .join('/')
    const { data } = matter(fs.readFileSync(file, 'utf8'))
    return {
      slug,
      href: `/n/${slug}`,
      title: String(data.title ?? slug),
      aliases: Array.isArray(data.aliases) ? data.aliases.map(String) : [],
    }
  })
}

/**
 * 全站链接目标。直接读文件系统而非 content collection ——
 * remark 插件在 Astro 配置期就需要索引，此时 collection 尚未加载。
 */
export function loadTargets(): LinkTarget[] {
  return loadNoteTargets()
}

let cached: LinkIndex | null = null

/**
 * dev 模式下每次重建，保证新建笔记后链接立即可解析；
 * 构建时只建一次。
 */
export function getIndex(): LinkIndex {
  if (process.env.NODE_ENV === 'production' && cached) return cached
  cached = buildIndex(loadTargets())
  return cached
}
