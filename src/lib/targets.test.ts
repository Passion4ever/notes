import { describe, it, expect } from 'vitest'
import { loadTargets, getIndex } from './targets'
import { resolve } from './linkindex'

describe('loadTargets', () => {
  it('读取到仓库中已有的笔记', () => {
    const targets = loadTargets()
    const slugs = targets.map((t) => t.slug)
    expect(slugs).toContain('disulfide-bond')
    expect(slugs).toContain('protein-folding')
  })

  it('笔记的 href 指向 /n/<slug>', () => {
    const t = loadTargets().find((t) => t.slug === 'disulfide-bond')
    expect(t?.href).toBe('/n/disulfide-bond')
  })

  it('读到 frontmatter 中的 title 与 aliases', () => {
    const t = loadTargets().find((t) => t.slug === 'disulfide-bond')
    expect(t?.title).toBe('二硫键')
    expect(t?.aliases).toContain('S-S 键')
  })
})

describe('getIndex', () => {
  it('返回可用于 resolve 的索引', () => {
    expect(resolve(getIndex(), '二硫键')?.slug).toBe('disulfide-bond')
  })
})
