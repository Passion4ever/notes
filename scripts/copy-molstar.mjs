import fs from 'node:fs'
import path from 'node:path'

const src = path.resolve('node_modules/molstar/build/viewer')
const dest = path.resolve('public/molstar')

if (!fs.existsSync(src)) {
  console.error('[molstar] 未找到 node_modules/molstar/build/viewer，请先 npm install')
  process.exit(1)
}

fs.mkdirSync(dest, { recursive: true })
for (const file of ['molstar.js', 'molstar.css']) {
  fs.copyFileSync(path.join(src, file), path.join(dest, file))
  console.log(`[molstar] copied ${file}`)
}
