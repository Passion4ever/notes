import { describe, it, expect } from 'vitest'
import {
  normalizeName,
  buildIndex,
  buildIndexWithCollisions,
  resolve,
  missingHref,
  placeholderSlug,
  type LinkTarget,
} from './linkindex'

const TARGETS: LinkTarget[] = [
  { slug: 'disulfide-bond', href: '/n/disulfide-bond', title: '二硫键', aliases: ['disulfide bond', 'S-S 键'] },
  { slug: 'protein-folding', href: '/n/protein-folding', title: '蛋白质折叠', aliases: ['protein folding'] },
  { slug: 'cys', href: '/aa/cys', title: '半胱氨酸', aliases: ['Cysteine', 'Cys'] },
]

describe('normalizeName', () => {
  it('去掉首尾空白并转小写', () => {
    expect(normalizeName('  Disulfide Bond  ')).toBe('disulfide bond')
  })
})

describe('resolve', () => {
  const index = buildIndex(TARGETS)

  it('按 title 命中', () => {
    expect(resolve(index, '二硫键')?.slug).toBe('disulfide-bond')
  })

  it('按 alias 命中', () => {
    expect(resolve(index, 'S-S 键')?.slug).toBe('disulfide-bond')
  })

  it('按 slug 命中', () => {
    expect(resolve(index, 'protein-folding')?.slug).toBe('protein-folding')
  })

  it('忽略大小写与首尾空白', () => {
    expect(resolve(index, '  CYSTEINE ')?.slug).toBe('cys')
  })

  it('未命中返回 null', () => {
    expect(resolve(index, '米氏方程')).toBeNull()
  })
})

describe('buildIndex 优先级', () => {
  it('title 优先于其它条目的 alias', () => {
    const targets: LinkTarget[] = [
      { slug: 'a', href: '/n/a', title: 'A 条目', aliases: ['共享名'] },
      { slug: 'b', href: '/n/b', title: '共享名' },
    ]
    // 即使 A 先出现且把「共享名」列为 alias，title 也应胜出
    expect(resolve(buildIndex(targets), '共享名')?.slug).toBe('b')
  })

  it('alias 优先于其它条目的 slug', () => {
    const targets: LinkTarget[] = [
      { slug: 'a', href: '/n/a', title: 'A 条目', aliases: ['共享键'] },
      { slug: '共享键', href: '/n/共享键', title: 'B 条目' },
    ]
    // alias 轮先于 slug 轮写入，即使另一条目的 slug 恰好同名，alias 也应胜出
    expect(resolve(buildIndex(targets), '共享键')?.slug).toBe('a')
  })
})

describe('buildIndex 无 aliases 字段', () => {
  it('LinkTarget 完全没有 aliases 字段时不抛异常，title/slug 仍可解析', () => {
    const targets: LinkTarget[] = [
      { slug: 'no-alias', href: '/n/no-alias', title: '无别名条目' },
    ]
    expect(() => buildIndex(targets)).not.toThrow()
    const index = buildIndex(targets)
    expect(resolve(index, '无别名条目')?.slug).toBe('no-alias')
    expect(resolve(index, 'no-alias')?.slug).toBe('no-alias')
  })
})

describe('missingHref', () => {
  it('对中文名做 URL 编码', () => {
    expect(missingHref(' 半胱氨酸 ')).toBe(`/n/${encodeURIComponent(normalizeName('半胱氨酸'))}`)
  })

  it('大小写不同的同一英文名产生相同的 href（与 unresolved 的 placeholderSlug key 对齐）', () => {
    expect(missingHref('Flow Matching')).toBe(missingHref('flow matching'))
  })
})

describe('placeholderSlug', () => {
  it('把 / 替换成连字符（酶学笔记里 Ser/Thr 激酶这类写法不能再让路由炸掉）', () => {
    expect(placeholderSlug('Ser/Thr 激酶')).toBe('ser-thr 激酶')
  })

  it('把 # 替换成连字符（Obsidian 的 [[笔记#小节]] 写法）', () => {
    expect(placeholderSlug('某笔记#小节')).toBe('某笔记-小节')
  })

  it('把 ? 替换成连字符', () => {
    expect(placeholderSlug('a?b')).toBe('a-b')
  })

  it('连续的敏感字符折叠成一个连字符', () => {
    expect(placeholderSlug('a//b')).toBe('a-b')
  })

  it('把 \\ 与 % 也替换成连字符', () => {
    expect(placeholderSlug('a\\b')).toBe('a-b')
    expect(placeholderSlug('a%b')).toBe('a-b')
  })

  it('纯 .. 兜底为非退化值', () => {
    const slug = placeholderSlug('..')
    expect(slug).not.toBe('..')
    expect(slug).not.toBe('')
  })

  it('纯 . 兜底为非退化值', () => {
    const slug = placeholderSlug('.')
    expect(slug).not.toBe('.')
    expect(slug).not.toBe('')
  })

  it('替换后退化成空串的纯符号串兜底为非空、非 . / .. 的值', () => {
    const slug = placeholderSlug('???')
    expect(slug).not.toBe('')
    expect(slug).not.toBe('.')
    expect(slug).not.toBe('..')
  })

  it('首尾多余的连字符会被去掉', () => {
    expect(placeholderSlug('/a/')).toBe('a')
  })
})

describe('missingHref 与 placeholderSlug 一致性（钉死"两套逻辑各自编码"不再复发）', () => {
  // missingHref 与 [slug].astro 的 getStaticPaths、linkgraph.ts 的 unresolved
  // key 已经在"大小写导致占位页 404""/ 导致构建直接炸掉"这两个问题上栽过。
  // 这条测试断言 missingHref 的最后一段解码后必须严格等于 placeholderSlug()
  // 的直接输出——如果将来有人在 missingHref 里重新引入一套自己的编码逻辑，
  // 这里会立刻炸。
  it.each([
    ['Ser/Thr 激酶'],
    ['某笔记#小节'],
    ['a?b'],
    ['a//b'],
    ['..'],
    ['.'],
    ['???'],
    ['米氏方程'],
    ['Flow Matching'],
  ])('missingHref(%s) 的最后一段解码后应等于 placeholderSlug(%s)', (name) => {
    const href = missingHref(name)
    const lastSegment = decodeURIComponent(href.split('/').pop()!)
    expect(lastSegment).toBe(placeholderSlug(name))
  })
})

describe('buildIndexWithCollisions', () => {
  it('笔记 title 与氨基酸 name_zh 撞名 → 返回一条冲突，winner 是笔记，losers 含氨基酸，双方 field 都是 title', () => {
    const note: LinkTarget = { slug: 'cysteine-deep-dive', href: '/n/cysteine-deep-dive', title: '半胱氨酸' }
    const aa: LinkTarget = { slug: 'cys', href: '/aa/cys', title: '半胱氨酸', aliases: ['Cysteine', 'Cys'] }

    const { collisions } = buildIndexWithCollisions([note, aa])

    expect(collisions).toHaveLength(1)
    expect(collisions[0].key).toBe('半胱氨酸')
    expect(collisions[0].winner.target).toBe(note)
    expect(collisions[0].winner.field).toBe('title')
    const loser = collisions[0].losers.find((l) => l.target === aa)
    expect(loser?.field).toBe('title')
  })

  it('笔记 slug 与氨基酸 alias 撞名 → 返回一条冲突，winner 是氨基酸（field=alias），loser 的 field=slug', () => {
    // 笔记文件名恰好叫 cys，氨基酸的三字母别名也是 Cys（normalize 后同为 "cys"）。
    // alias 轮先于 slug 轮写入，所以即使笔记在数组里排在前面，氨基酸的 alias 仍应胜出。
    const note: LinkTarget = { slug: 'cys', href: '/n/cys', title: '半胱氨酸笔记' }
    const aa: LinkTarget = { slug: 'cys-aa', href: '/aa/cys', title: '半胱氨酸', aliases: ['Cysteine', 'Cys'] }

    const { collisions } = buildIndexWithCollisions([note, aa])

    expect(collisions).toHaveLength(1)
    expect(collisions[0].key).toBe('cys')
    expect(collisions[0].winner.target).toBe(aa)
    expect(collisions[0].winner.field).toBe('alias')
    const loser = collisions[0].losers.find((l) => l.target === note)
    expect(loser?.field).toBe('slug')
  })

  it('无冲突时返回空数组', () => {
    const targets: LinkTarget[] = [
      { slug: 'a', href: '/n/a', title: 'A 条目' },
      { slug: 'b', href: '/n/b', title: 'B 条目' },
    ]

    expect(buildIndexWithCollisions(targets).collisions).toEqual([])
  })

  it('同一个 target 自身的 title 与 slug 相同时不应报告为冲突', () => {
    const targets: LinkTarget[] = [
      { slug: 'disulfide-bond', href: '/n/disulfide-bond', title: 'disulfide-bond' },
    ]

    expect(buildIndexWithCollisions(targets).collisions).toEqual([])
  })

  it('buildIndex 的返回值与 buildIndexWithCollisions().index 完全一致', () => {
    expect(buildIndex(TARGETS)).toEqual(buildIndexWithCollisions(TARGETS).index)
  })
})
