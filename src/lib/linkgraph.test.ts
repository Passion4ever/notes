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

  it('忽略数学公式内的方括号，不当作 wikilink 提取（parser 须与真实渲染管线一样挂 remarkMath）', () => {
    // $[[A 笔记]]$ 是行内数学公式，方括号在这里跟 wikilink 语法毫无关系。
    // 裸 unified().use(remarkParse)（不挂 remarkMath）会把 $...$ 当普通文本，
    // [[A 笔记]] 落在 text 节点里被误当成 wikilink 提取出来，产生幽灵反链。
    expect(extractWikilinks('见 $[[A 笔记]]$ 中的记号。')).toEqual([])
  })

  it('忽略块级数学公式内的方括号', () => {
    expect(extractWikilinks('$$\n[[A 笔记]]\n$$')).toEqual([])
  })
})

describe('buildLinkGraph', () => {
  it('建立反链', () => {
    const { backlinks } = buildLinkGraph([note('b', 'B 笔记', '见 [[A 笔记]]。')], index)
    expect(backlinks.get('/n/a')?.map((r) => r.slug)).toEqual(['b'])
  })

  it('双向互链时两边都有反链', () => {
    const { backlinks } = buildLinkGraph(
      [note('a', 'A 笔记', '[[B 笔记]]'), note('b', 'B 笔记', '[[A 笔记]]')],
      index
    )
    expect(backlinks.get('/n/a')?.map((r) => r.slug)).toEqual(['b'])
    expect(backlinks.get('/n/b')?.map((r) => r.slug)).toEqual(['a'])
  })

  it('忽略自引用', () => {
    const { backlinks } = buildLinkGraph([note('a', 'A 笔记', '[[A 笔记]]')], index)
    expect(backlinks.get('/n/a')).toBeUndefined()
  })

  it('同一来源多次引用只记一条反链', () => {
    const { backlinks } = buildLinkGraph([note('b', 'B 笔记', '[[A 笔记]] 又 [[A 笔记]]')], index)
    expect(backlinks.get('/n/a')?.length).toBe(1)
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
    // 真正的去重要靠 buildLinkGraph 里 push() 按已解析目标 href 做的去重。
    const { backlinks } = buildLinkGraph([note('a', 'A 笔记', '[[B 笔记]] 与 [[B 别名]]')], index)
    expect(backlinks.get('/n/b')?.length).toBe(1)
    expect(backlinks.get('/n/b')?.map((r) => r.slug)).toEqual(['a'])
  })
})

describe('buildLinkGraph 用 href（而非 slug）作 backlinks key，避免跨命名空间同名串台', () => {
  it('两个不同 href 但 slug 相同的 target，反链各自独立、互不包含对方', () => {
    // 复现审查实测场景：新建 src/content/notes/cys.md 后，它的 slug 是
    // 'cys'，与氨基酸半胱氨酸（/aa/cys，slug 也是 'cys'）撞了 slug 但
    // href 不同。若 backlinks 用 slug 当 key，两者会被合并成同一份列表。
    const targets: LinkTarget[] = [
      { slug: 'cys', href: '/n/cys', title: 'Cys 笔记' },
      { slug: 'cys', href: '/aa/cys', title: '半胱氨酸' },
    ]
    const idx = buildIndex(targets)

    const { backlinks } = buildLinkGraph(
      [note('a', 'A 笔记', '见 [[Cys 笔记]]。'), note('b', 'B 笔记', '见 [[半胱氨酸]]。')],
      idx
    )

    expect(backlinks.get('/n/cys')?.map((r) => r.slug)).toEqual(['a'])
    expect(backlinks.get('/aa/cys')?.map((r) => r.slug)).toEqual(['b'])
    // 互不包含对方的条目
    expect(backlinks.get('/n/cys')?.some((r) => r.slug === 'b')).toBe(false)
    expect(backlinks.get('/aa/cys')?.some((r) => r.slug === 'a')).toBe(false)
  })
})

describe('missingHref 与 unresolved key 的跨模块一致性', () => {
  // unresolved 的 key 现在就是 placeholderSlug(name)（linkgraph.ts 写入时
  // 直接转换），missingHref() 同样调用 placeholderSlug()——两处调用同一个
  // 权威实现，理应天然一致。这条测试走完整的 extractWikilinks → resolve →
  // buildLinkGraph 链路（而不是直接单测 placeholderSlug），把「大小写/路径
  // 敏感字符导致占位页 404 或直接炸构建」这个问题钉死在端到端层面：任何一边
  // 改了算法而另一边没跟上都会在这里炸。
  it.each([
    ['米氏方程'],
    ['Flow Matching'],
    ['flow matching'],
    ['  Transformer  '],
    ['Ser/Thr 激酶'],
    ['某笔记#小节'],
    ['a?b'],
  ])('missingHref(%s) 解码后的最后一段应等于 unresolved 里的 key', (name) => {
    const { unresolved } = buildLinkGraph([note('a', 'A 笔记', `[[${name}]]`)], index)
    const [key] = [...unresolved.keys()]
    const href = missingHref(name)
    const decodedLastSegment = decodeURIComponent(href.split('/').pop()!)
    expect(decodedLastSegment).toBe(key)
  })
})
