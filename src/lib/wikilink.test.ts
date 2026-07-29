import { describe, it, expect } from 'vitest'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import rehypeStringify from 'rehype-stringify'
import { buildIndex, type LinkTarget } from './linkindex'
import { remarkWikilink } from './wikilink'

const TARGETS: LinkTarget[] = [
  { slug: 'disulfide-bond', href: '/n/disulfide-bond', title: '二硫键', aliases: ['S-S 键'] },
  { slug: 'cys', href: '/aa/cys', title: '半胱氨酸' },
]

function render(md: string, unresolved: string[] = []) {
  const index = buildIndex(TARGETS)
  return unified()
    .use(remarkParse)
    .use(remarkWikilink, { getIndex: () => index, onUnresolved: (n: string) => unresolved.push(n) })
    .use(remarkRehype)
    .use(rehypeStringify)
    .processSync(md)
    .toString()
}

describe('remarkWikilink', () => {
  it('把 [[x]] 转成链接', () => {
    const html = render('见 [[二硫键]] 一节。')
    expect(html).toContain('href="/n/disulfide-bond"')
    expect(html).toContain('>二硫键</a>')
    expect(html).toContain('class="wikilink"')
  })

  it('支持 [[x|显示文本]]', () => {
    const html = render('见 [[二硫键|S-S 桥]]。')
    expect(html).toContain('href="/n/disulfide-bond"')
    expect(html).toContain('>S-S 桥</a>')
  })

  it('按 alias 解析', () => {
    expect(render('[[S-S 键]]')).toContain('href="/n/disulfide-bond"')
  })

  it('同一段落中的多个链接都被转换', () => {
    const html = render('[[二硫键]] 与 [[半胱氨酸]] 都要看。')
    expect(html).toContain('href="/n/disulfide-bond"')
    expect(html).toContain('href="/aa/cys"')
  })

  it('保留链接前后的文本', () => {
    const html = render('见 [[二硫键]] 一节。')
    expect(html).toContain('见 ')
    expect(html).toContain(' 一节。')
  })

  it('未解析链接渲染为 missing 样式并回调', () => {
    const unresolved: string[] = []
    const html = render('[[米氏方程]] 还没写。', unresolved)
    expect(html).toContain('wikilink-missing')
    expect(html).toContain(`href="/n/${encodeURIComponent('米氏方程')}"`)
    expect(unresolved).toEqual(['米氏方程'])
  })

  it('不转换行内代码中的 [[x]]', () => {
    const html = render('写作 `[[二硫键]]` 即可。')
    expect(html).not.toContain('href="/n/disulfide-bond"')
    expect(html).toContain('<code>[[二硫键]]</code>')
  })

  it('不转换代码块中的 [[x]]', () => {
    const html = render('```\n[[二硫键]]\n```')
    expect(html).not.toContain('href="/n/disulfide-bond"')
  })

  it('没有 wikilink 的文本原样通过', () => {
    expect(render('普通一句话。')).toContain('普通一句话。')
  })
})
