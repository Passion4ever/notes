import { describe, it, expect } from 'vitest'
import { buildIndex, missingHref, type LinkTarget } from './linkindex'
import { extractWikilinks, buildLinkGraph, type NoteInput } from './linkgraph'

const TARGETS: LinkTarget[] = [
  { slug: 'a', href: '/n/a', title: 'A 笔记' },
  { slug: 'b', href: '/n/b', title: 'B 笔记', aliases: ['B 别名'] },
]
const index = buildIndex(TARGETS)

const note = (slug: string, title: string, body: string): NoteInput => ({
  slug,
  title,
  href: `/n/${slug}`,
  body,
})

describe('extractWikilinks', () => {
  it('提取基本链接', () => {
    expect(extractWikilinks('见 [[A 笔记]]。')).toEqual(['A 笔记'])
  })

  it('提取带显示文本的链接，取名称部分', () => {
    expect(extractWikilinks('[[A 笔记|别名显示]]')).toEqual(['A 笔记'])
  })

  it('同一名称只出现一次', () => {
    expect(extractWikilinks('[[A 笔记]] 和 [[A 笔记]]')).toEqual(['A 笔记'])
  })

  it('忽略代码块中的链接', () => {
    expect(extractWikilinks('```\n[[A 笔记]]\n```')).toEqual([])
  })

  it('忽略行内代码中的链接', () => {
    expect(extractWikilinks('写作 `[[A 笔记]]`')).toEqual([])
  })

  it('忽略 4 空格缩进代码块中的链接', () => {
    const body = '一段说明。\n\n    [[A 笔记]]\n\n后续文字。'
    expect(extractWikilinks(body)).toEqual([])
  })

  it('忽略 ~~~ 围栏代码块中的链接', () => {
    expect(extractWikilinks('~~~\n[[A 笔记]]\n~~~')).toEqual([])
  })

  it('忽略双反引号行内代码中的链接', () => {
    expect(extractWikilinks('写法 ``[[A 笔记]]`` 示例')).toEqual([])
  })

  it('忽略跨行的行内代码中的链接', () => {
    expect(extractWikilinks('写作 `[[A\n笔记]]` 即可')).toEqual([])
  })

  it('忽略反引号总数为奇数的嵌套围栏代码块中的链接', () => {
    const body = '````\n```\n[[A 笔记]]\n```\n````'
    expect(extractWikilinks(body)).toEqual([])
  })
})

describe('buildLinkGraph', () => {
  it('建立反链', () => {
    const { backlinks } = buildLinkGraph([note('b', 'B 笔记', '见 [[A 笔记]]。')], index)
    expect(backlinks.get('a')?.map((r) => r.slug)).toEqual(['b'])
  })

  it('双向互链时两边都有反链', () => {
    const { backlinks } = buildLinkGraph(
      [note('a', 'A 笔记', '[[B 笔记]]'), note('b', 'B 笔记', '[[A 笔记]]')],
      index
    )
    expect(backlinks.get('a')?.map((r) => r.slug)).toEqual(['b'])
    expect(backlinks.get('b')?.map((r) => r.slug)).toEqual(['a'])
  })

  it('忽略自引用', () => {
    const { backlinks } = buildLinkGraph([note('a', 'A 笔记', '[[A 笔记]]')], index)
    expect(backlinks.get('a')).toBeUndefined()
  })

  it('同一来源多次引用只记一条反链', () => {
    const { backlinks } = buildLinkGraph([note('b', 'B 笔记', '[[A 笔记]] 又 [[A 笔记]]')], index)
    expect(backlinks.get('a')?.length).toBe(1)
  })

  it('收集未解析链接及其来源', () => {
    const { unresolved } = buildLinkGraph([note('a', 'A 笔记', '[[米氏方程]]')], index)
    expect(unresolved.get('米氏方程')?.map((r) => r.slug)).toEqual(['a'])
  })

  it('未解析链接不进入 backlinks', () => {
    const { backlinks } = buildLinkGraph([note('a', 'A 笔记', '[[米氏方程]]')], index)
    expect(backlinks.size).toBe(0)
  })

  it('同一篇笔记用标题和别名两个不同字面名称指向同一目标时只记一条反链', () => {
    // 'B 笔记' 是 target b 的标题，'B 别名' 是它的别名——两个不同的字面名称，
    // extractWikilinks 阶段的 Set 去重（按 normalizeName）不会合并它们，
    // 真正的去重要靠 buildLinkGraph 里 push() 按已解析目标 slug 做的去重。
    const { backlinks } = buildLinkGraph([note('a', 'A 笔记', '[[B 笔记]] 与 [[B 别名]]')], index)
    expect(backlinks.get('b')?.length).toBe(1)
    expect(backlinks.get('b')?.map((r) => r.slug)).toEqual(['a'])
  })
})

describe('missingHref 与 unresolved key 的跨模块一致性', () => {
  // 这两个值分别来自 linkindex.ts 和 linkgraph.ts 两个独立实现，
  // 已经在「大小写导致占位页 404」这个问题上栽过一次——用一条测试把
  // 二者钉死在一起，任何一边改了规范化算法而另一边没跟上都会在这里炸。
  it.each([['米氏方程'], ['Flow Matching'], ['flow matching'], ['  Transformer  ']])(
    'missingHref(%s) 解码后的最后一段应等于 unresolved 里的 key',
    (name) => {
      const { unresolved } = buildLinkGraph([note('a', 'A 笔记', `[[${name}]]`)], index)
      const [key] = [...unresolved.keys()]
      const href = missingHref(name)
      const decodedLastSegment = decodeURIComponent(href.split('/').pop()!)
      expect(decodedLastSegment).toBe(key)
    }
  )
})
