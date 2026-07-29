import { visit, SKIP } from 'unist-util-visit'
import { resolve, missingHref, type LinkIndex } from './linkindex'

/**
 * 匹配 [[名称]] 或 [[名称|显示文本]]。
 * 名称部分不允许出现 [ ] |，显示文本部分不允许出现 [ ]。
 */
const WIKILINK = /\[\[([^[\]|]+)(?:\|([^[\]]+))?\]\]/g

export interface WikilinkOptions {
  /** 延迟获取索引：Astro 配置期尚无法确定内容，必须在实际渲染时才读取 */
  getIndex: () => LinkIndex
  /** 每遇到一个无法解析的名称回调一次 */
  onUnresolved?: (name: string) => void
}

export function remarkWikilink(options: WikilinkOptions) {
  const { getIndex, onUnresolved } = options

  return function transformer(tree: any) {
    const index = getIndex()

    // 只访问 text 节点。inlineCode 与 code 是独立节点类型，
    // 因此代码内容天然不会被匹配到。
    visit(tree, 'text', (node: any, i: number | undefined, parent: any) => {
      if (!parent || typeof i !== 'number') return
      const value: string = node.value
      if (!value.includes('[[')) return

      const out: any[] = []
      let last = 0
      let match: RegExpExecArray | null

      WIKILINK.lastIndex = 0
      while ((match = WIKILINK.exec(value)) !== null) {
        if (match.index > last) {
          out.push({ type: 'text', value: value.slice(last, match.index) })
        }

        const name = match[1].trim()
        const label = (match[2] ?? match[1]).trim()
        const target = resolve(index, name)

        if (!target) onUnresolved?.(name)

        out.push({
          type: 'link',
          url: target ? target.href : missingHref(name),
          children: [{ type: 'text', value: label }],
          data: {
            hProperties: {
              className: target ? 'wikilink' : 'wikilink wikilink-missing',
            },
          },
        })

        last = match.index + match[0].length
      }

      if (out.length === 0) return
      if (last < value.length) out.push({ type: 'text', value: value.slice(last) })

      parent.children.splice(i, 1, ...out)
      return [SKIP, i + out.length]
    })
  }
}
