import { defineCollection, z } from 'astro:content'
import { glob, file } from 'astro/loaders'
import yaml from 'js-yaml'

const notes = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/notes' }),
  schema: z.object({
    title: z.string(),
    tags: z.array(z.string()).default([]),
    aliases: z.array(z.string()).default([]),
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
