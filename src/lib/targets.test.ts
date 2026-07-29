import { describe, it, expect } from 'vitest'
import { loadTargets, getIndex } from './targets'
import { resolve, buildIndexWithCollisions, type LinkTarget } from './linkindex'

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

describe('loadTargets 氨基酸', () => {
  it('包含氨基酸条目', () => {
    const t = loadTargets().find((t) => t.slug === 'cys')
    expect(t).toBeDefined()
    expect(t?.href).toBe('/aa/cys')
    expect(t?.title).toBe('半胱氨酸')
  })

  it('英文名与三字母作为别名', () => {
    const t = loadTargets().find((t) => t.slug === 'cys')
    expect(t?.aliases).toContain('Cysteine')
    expect(t?.aliases).toContain('Cys')
  })

  it('单字母不作为别名，避免与正文冲突', () => {
    const t = loadTargets().find((t) => t.slug === 'cys')
    expect(t?.aliases).not.toContain('C')
  })

  it('[[半胱氨酸]] 解析到氨基酸详情页', () => {
    expect(resolve(getIndex(), '半胱氨酸')?.href).toBe('/aa/cys')
  })
})

describe('loadTargets 顺序：笔记优先于氨基酸（决定同名冲突时的胜出方）', () => {
  it('loadTargets 中笔记全部排在氨基酸之前（决定同名冲突时笔记胜出）', () => {
    // 这条测试钉住的是 loadTargets.ts 里 [...loadNoteTargets(), ...loadAminoAcidTargets()]
    // 这个拼接顺序本身——它是一条有意的设计决策（见 targets.ts 里 loadTargets() 的注释），
    // 不是随手写的顺序。buildIndexWithCollisions() 按数组顺序"先到先得"，一旦这个顺序被
    // 改成 [...氨基酸, ...笔记]，全站同名链接的归属会静默反转，但下面两条测试
    // （手工构造 [note, aa] 数组喂给 buildIndexWithCollisions）完全感知不到，
    // 因为它们不经过 loadTargets() 的真实拼接顺序。这条测试就是专门补上这个盲区的。
    const targets = loadTargets()
    const lastNoteIdx = targets.map((t) => t.href.startsWith('/n/')).lastIndexOf(true)
    const firstAaIdx = targets.findIndex((t) => t.href.startsWith('/aa/'))
    expect(lastNoteIdx).toBeGreaterThanOrEqual(0)
    expect(firstAaIdx).toBeGreaterThan(lastNoteIdx)
  })

  it('端到端：笔记与氨基酸真撞名时，笔记胜出（用 loadTargets() 的真实顺序 + 真实氨基酸数据验证）', () => {
    // 不手工捏造氨基酸数据，而是从 loadTargets() 的真实输出里取出真实的笔记列表和
    // 真实的氨基酸列表，只插入一个"假装新建的笔记"（title 与半胱氨酸撞名），按
    // loadTargets() 实际产生的相对顺序（笔记们排在氨基酸们前面）拼回去——模拟
    // "有人真的为半胱氨酸新建了一篇笔记" 这个场景下，冲突解析是否仍然选笔记赢。
    const targets = loadTargets()
    const notes = targets.filter((t) => t.href.startsWith('/n/'))
    const aminoAcids = targets.filter((t) => t.href.startsWith('/aa/'))
    const cysAa = aminoAcids.find((t) => t.slug === 'cys')
    expect(cysAa).toBeDefined()

    const fakeNote: LinkTarget = {
      slug: 'cysteine-deep-dive',
      href: '/n/cysteine-deep-dive',
      title: '半胱氨酸',
    }

    const { collisions } = buildIndexWithCollisions([...notes, fakeNote, ...aminoAcids])

    const collision = collisions.find((c) => c.key === '半胱氨酸')
    expect(collision?.winner.target).toBe(fakeNote)
    expect(collision?.losers.some((l) => l.target === cysAa)).toBe(true)
  })
})
