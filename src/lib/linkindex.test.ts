import { describe, it, expect } from 'vitest'
import { normalizeName, buildIndex, resolve, missingHref, type LinkTarget } from './linkindex'

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
    expect(missingHref(' 半胱氨酸 ')).toBe(`/n/${encodeURIComponent('半胱氨酸')}`)
  })
})
