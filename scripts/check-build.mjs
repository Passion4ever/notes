import fs from 'node:fs'
import path from 'node:path'

// 只保留结构性路由——网站骨架本身必然存在的产物，不依赖任何具体的
// 示例笔记内容。n/disulfide-bond、n/protein-folding、n/ubiquitin、
// tags/蛋白质结构 都只是仓库里当前的示例内容，用户删除或改名是完全
// 正常的写作动作，不该被冒烟检查钉死、拿来阻断部署。
// aa/cys 不属于此列：氨基酸速查表是固定的内置参考数据（src/data/amino-acids.yaml），
// 不是用户笔记，20 种标准氨基酸的条目不会被日常写作删除。
const REQUIRED = ['index.html', 'aa/index.html', 'aa/cys/index.html', 'pagefind/pagefind.js', 'CNAME']

const missing = REQUIRED.filter((rel) => !fs.existsSync(path.resolve('dist', rel)))

if (missing.length > 0) {
  console.error('[check-build] 缺少以下产物：')
  for (const rel of missing) console.error(`  - dist/${rel}`)
  process.exit(1)
}

/** 递归找出 dist/<dir> 下所有 index.html，返回相对 dist 的路径列表。 */
function findIndexHtmlFiles(dir) {
  const abs = path.resolve('dist', dir)
  if (!fs.existsSync(abs)) return []
  const out = []
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...findIndexHtmlFiles(rel))
    } else if (entry.name === 'index.html') {
      out.push(rel)
    }
  }
  return out
}

// 笔记类产物：只断言"笔记命名空间下至少生成了一篇页面"这个结构性事实，
// 不钉死具体是哪一篇——具体内容随用户写作自然增删。
const noteIndexFiles = findIndexHtmlFiles('n')
if (noteIndexFiles.length === 0) {
  console.error('[check-build] dist/n/ 下一篇笔记页面都没有生成')
  process.exit(1)
}

// 懒加载检查：页面里不得有会让浏览器立即请求 molstar 的静态标签。
//
// 注意不能简单地 includes('/molstar/molstar.js') —— 该 URL 字符串本来就存在于
// 内联脚本中（点击时用它动态创建 <script>），那是实现方式而非违规。真正的判据
// 是有没有 <script src> / <link href> 这类会立即触发下载的静态标签。
//
// 不钉死某一篇具体笔记（如 ubiquitin，那也是示例内容，可能被删除或改名）——
// 改为动态扫描全站所有生成页面，凡是渲染了 <Structure> 组件（带有
// "structure-host" 标记 class）的页面都要过这道检查；一篇都没有就跳过并
// 打印说明，而不是报错阻断构建。
const pages = findIndexHtmlFiles('.').map((rel) => ({
  rel,
  content: fs.readFileSync(path.resolve('dist', rel), 'utf8'),
}))
const structurePages = pages.filter((p) => p.content.includes('structure-host'))

if (structurePages.length === 0) {
  console.log('[check-build] 未找到包含 <Structure> 组件（structure-host）的页面，跳过懒加载检查')
} else {
  const eagerTag = /<(?:script|link)\b[^>]*\b(?:src|href)\s*=\s*["'][^"']*molstar[^"']*["']/i
  const eager = structurePages.filter((p) => eagerTag.test(p.content))
  if (eager.length > 0) {
    console.error('[check-build] 以下页面存在会立即加载 molstar 的静态标签，懒加载已失效：')
    for (const p of eager) console.error(`  - dist/${p.rel}`)
    process.exit(1)
  }
}

console.log(
  `[check-build] 通过，${REQUIRED.length} 项结构性产物齐备，${noteIndexFiles.length} 篇笔记页面，` +
    `${structurePages.length} 个含 3D 结构组件的页面已确认懒加载`
)
