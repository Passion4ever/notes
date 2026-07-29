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
  const from = path.join(src, file)
  if (!fs.existsSync(from)) {
    console.error(
      `[molstar] 未找到 ${from}——node_modules/molstar/build/viewer 目录存在但缺这个文件，` +
        `molstar 的构建产物可能不完整或版本不对，请重新 npm install molstar 或检查其版本`
    )
    process.exit(1)
  }
  fs.copyFileSync(from, path.join(dest, file))
  console.log(`[molstar] copied ${file}`)
}
