import fs from 'node:fs'
import path from 'node:path'

const REQUIRED = [
  'index.html',
  'n/disulfide-bond/index.html',
  'n/protein-folding/index.html',
  'n/ubiquitin/index.html',
  'aa/index.html',
  'aa/cys/index.html',
  'tags/蛋白质结构/index.html',
  'pagefind/pagefind.js',
  'CNAME',
]

const missing = REQUIRED.filter((rel) => !fs.existsSync(path.resolve('dist', rel)))

if (missing.length > 0) {
  console.error('[check-build] 缺少以下产物：')
  for (const rel of missing) console.error(`  - dist/${rel}`)
  process.exit(1)
}

// 懒加载检查：页面里不得有会让浏览器立即请求 molstar 的静态标签。
//
// 注意不能简单地 includes('/molstar/molstar.js') —— 该 URL 字符串本来就存在于
// 内联脚本中（点击时用它动态创建 <script>），那是实现方式而非违规。真正的判据
// 是有没有 <script src> / <link href> 这类会立即触发下载的静态标签。
const ubiquitin = fs.readFileSync(path.resolve('dist/n/ubiquitin/index.html'), 'utf8')
const eagerTag = /<(?:script|link)\b[^>]*\b(?:src|href)\s*=\s*["'][^"']*molstar[^"']*["']/i
if (eagerTag.test(ubiquitin)) {
  console.error('[check-build] ubiquitin 页面存在会立即加载 molstar 的静态标签，懒加载已失效')
  process.exit(1)
}

console.log(`[check-build] 通过，${REQUIRED.length} 项产物齐备`)
