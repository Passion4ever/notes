import { describe, it, expect } from 'vitest'
import { buildIndex, type LinkTarget } from './linkindex'
import { extractWikilinks, buildLinkGraph, type NoteInput } from './linkgraph'

const TARGETS: LinkTarget[] = [
  { slug: 'a', href: '/n/a', title: 'A 笔记' },
  { slug: 'b', href: '/n/b', title: 'B 笔记' },
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
})
