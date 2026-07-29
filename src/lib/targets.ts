import fs from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import GithubSlugger from 'github-slugger'
import yaml from 'js-yaml'
import { buildIndexWithCollisions, type KeyCollision, type LinkIndex, type LinkTarget } from './linkindex'

const NOTES_DIR = path.resolve(process.cwd(), 'src/content/notes')
const AMINO_ACIDS_FILE = path.resolve(process.cwd(), 'src/data/amino-acids.yaml')

interface AminoAcidRow {
  code1: string
  code3: string
  name_zh: string
  name_en: string
}

function loadAminoAcidTargets(): LinkTarget[] {
  if (!fs.existsSync(AMINO_ACIDS_FILE)) return []
  const rows = yaml.load(fs.readFileSync(AMINO_ACIDS_FILE, 'utf8')) as AminoAcidRow[]
  return rows.map((row) => {
    const slug = row.code3.toLowerCase()
    return {
      slug,
      href: `/aa/${slug}`,
      title: row.name_zh,
      // 单字母（C、A…）太短，会与正文普通文本冲突，故不作别名
      aliases: [row.name_en, row.code3],
    }
  })
}

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
 *
 * 笔记排在氨基酸前面是有意的决策，不是随手写的顺序：buildIndexWithCollisions()
 * 按数组顺序"先到先得"，靠前的一方在同名冲突里胜出。用户手写的笔记比内置的
 * 氨基酸参考数据更具体、更能代表当前语境下的写作意图——比如有人专门为半胱
 * 氨基酸写了一篇深入笔记（title: 半胱氨酸），[[半胱氨酸]] 就应该指向那篇笔记，
 * 而不是氨基酸速查表；氨基酸数据本质是一份兜底的百科参考，笔记不存在时才轮
 * 到它响应同名链接。这种情况下另一方（被压住的氨基酸条目）仍然可以通过完整
 * 路径 /aa/xxx 直接访问，只是同名的裸链接 [[名字]] 不会指向它——构建期会为
 * 这类冲突打印警告（见 notegraph.ts），不会静默发生。
 *
 * 如果哪天要反过来（氨基酸优先于笔记），请先想清楚上面这条取舍是否仍然
 * 成立，并同步修改 targets.test.ts 里 describe('loadTargets 顺序：笔记优先
 * 于氨基酸（决定同名冲突时的胜出方）') 下的回归测试——那条测试就是专门用来
 * 防止这个顺序被无声改动的。
 */
export function loadTargets(): LinkTarget[] {
  return [...loadNoteTargets(), ...loadAminoAcidTargets()]
}

let cached: { index: LinkIndex; collisions: KeyCollision[] } | null = null

/**
 * dev 模式下每次重建，保证新建笔记后链接立即可解析；
 * 构建时只建一次。
 *
 * 可选参数 `targets`：调用方若已经手头有一份 loadTargets() 的结果（例如
 * notegraph.ts 同一次调用里刚为别的目的算过一遍），可以直接传进来复用，
 * 避免同一轮构建里重复走一遍全目录 walk + 逐文件读 frontmatter。注意
 * 这个参数只在缓存未命中时才会被用到——缓存命中时函数在用到它之前就已
 * 经 return 了，不会因为"多接受了一个参数"而破坏 production 只建一次 /
 * dev 每次重建的缓存语义。不传时行为与之前完全一致（内部自己
 * loadTargets()）。
 *
 * 这个缓存是全站唯一的索引单例：astro.config.mjs 里 remarkWikilink 用它
 * 把笔记正文里的 [[wikilink]] 解析成真正的 href，notegraph.ts 用它建反链
 * 图、报告键冲突。两边都调这一个函数，保证拿到的是同一次计算的结果——
 * 不会出现"两边各自独立算一遍索引，假设文件系统没变所以结果应该相同"
 * 这种弱保证。
 */
export function getIndexWithCollisions(targets?: LinkTarget[]): {
  index: LinkIndex
  collisions: KeyCollision[]
} {
  if (process.env.NODE_ENV === 'production' && cached) return cached
  cached = buildIndexWithCollisions(targets ?? loadTargets())
  return cached
}

/** 薄包装：多数调用方（例如 remarkWikilink）只关心索引本身，不关心冲突详情。 */
export function getIndex(targets?: LinkTarget[]): LinkIndex {
  return getIndexWithCollisions(targets).index
}
