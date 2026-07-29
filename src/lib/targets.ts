import fs from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import GithubSlugger from 'github-slugger'
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

/**
 * 每段单独用一个全新的 GithubSlugger 实例。该库的 slug() 方法是有状态的
 * ——同一个实例遇到重复输入会自动加 -1 后缀去重。如果跨文件（甚至跨路径
 * 分段）复用同一个实例，两个文件本该真的撞出同一个 slug（例如
 * Flow Matching.md 与 Flow-Matching.md）会被实例悄悄改写成不同的
 * "flow-matching" / "flow-matching-1"，掩盖了真实冲突，下面的唯一性检查
 * 也就永远不会触发。每次都 new 一个实例，等价于该库导出的无状态 slug()
 * 函数——这也正是 Astro 的 glob loader 默认 generateId 实际调用的函数
 * （见 astro/dist/content/utils.js 的 getContentEntryIdAndSlug）。
 */
function slugifySegment(segment: string): string {
  return new GithubSlugger().slug(segment)
}

/**
 * 复刻 Astro glob loader 默认 generateId 的算法：相对路径按 path.sep 分段，
 * 每段单独 slug 化（转小写、空格转连字符），再用 '/' 拼回，最后去掉末尾的
 * /index（对应以 index.md 代表目录本身的写法）。两边算法不一致时，
 * [[wikilink]] 会解析出与 Astro 实际生成的页面路径不同的 slug，
 * 造成看似解析成功、点开却 404 的断链。
 */
function computeSlug(relPathWithoutExt: string): string {
  return relPathWithoutExt
    .split(path.sep)
    .map(slugifySegment)
    .join('/')
    .replace(/\/index$/, '')
}

/** slug 唯一性检查：不同文件算出同一个 slug 会在 Astro 里互相覆盖页面。 */
function assertUniqueSlugs(files: string[], targets: LinkTarget[]): void {
  const seenBy = new Map<string, string>() // slug -> 首次出现的文件（相对路径）

  for (let i = 0; i < targets.length; i++) {
    const slug = targets[i].slug
    const file = path.relative(NOTES_DIR, files[i])
    const prevFile = seenBy.get(slug)

    if (prevFile) {
      throw new Error(
        `[targets] 两个笔记文件算出了相同的 slug "${slug}"，会在 Astro 里互相覆盖页面：\n` +
          `  - ${prevFile}\n` +
          `  - ${file}\n` +
          '请修改其中一个文件名（建议全小写、用连字符分词），避免与 Astro 的 id 算法撞车。'
      )
    }

    seenBy.set(slug, file)
  }
}

function loadNoteTargets(): LinkTarget[] {
  const files = walk(NOTES_DIR)

  const targets: LinkTarget[] = files.map((file) => {
    const relPath = path.relative(NOTES_DIR, file).replace(/\.mdx?$/, '')
    const slug = computeSlug(relPath)
    const { data } = matter(fs.readFileSync(file, 'utf8'))
    return {
      slug,
      href: `/n/${slug}`,
      title: String(data.title ?? slug),
      aliases: Array.isArray(data.aliases) ? data.aliases.map(String) : [],
    }
  })

  assertUniqueSlugs(files, targets)

  return targets
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
