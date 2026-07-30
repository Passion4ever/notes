import { defineCollection, z } from 'astro:content'
import { glob, file } from 'astro/loaders'
import yaml from 'js-yaml'

const notes = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/notes' }),
  schema: z.object({
    title: z.string(),
    tags: z.array(z.string()).default([]),
    aliases: z.array(z.string()).default([]),
    /**
     * 可选的信息框字段，浮在条目右上角（维基 infobox）。
     * 不填就不显示 —— 写作摩擦为零，这一点与「frontmatter 不要有必填仪式」
     * 的原则一致。适合放常查的定量事实：键长、pKa、Km、典型浓度、催化酶。
     *
     *   infobox:
     *     - k: Sγ–Sγ 距离
     *       v: 2.05 Å
     *     - k: 催化
     *       v: PDI 家族 · Ero1
     */
    infobox: z
      .array(z.object({ k: z.string(), v: z.string() }))
      .default([]),
  }),
})

const aminoAcids = defineCollection({
  loader: file('src/data/amino-acids.yaml', {
    // 返回以 id 为 key 的对象，id 取三字母小写 → /aa/cys
    parser: (text) => {
      const rows = yaml.load(text) as Record<string, unknown>[]
      return Object.fromEntries(
        rows.map((row) => [String(row.code3).toLowerCase(), row])
      )
    },
  }),
  // 数据源唯一且可控，字段缺失应当构建失败
  schema: z.object({
    code1: z.string().length(1),
    code3: z.string().length(3),
    name_zh: z.string(),
    name_en: z.string(),
    smiles: z.string(),
    mw: z.number(),
    pka_side: z.number().optional(),
    hydropathy: z.number(),
    charge: z.enum(['positive', 'negative', 'neutral']),
    polarity: z.enum(['polar', 'nonpolar']),
    essential: z.boolean(),
    note: z.string().default(''),
  }),
})

export const collections = { notes, aminoAcids }
