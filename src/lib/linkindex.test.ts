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
})

describe('missingHref', () => {
  it('对中文名做 URL 编码', () => {
    expect(missingHref(' 半胱氨酸 ')).toBe(`/n/${encodeURIComponent('半胱氨酸')}`)
  })
})
