import { defineCollection, z } from 'astro:content'
import { glob } from 'astro/loaders'

const notes = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/notes' }),
  schema: z.object({
    title: z.string(),
    tags: z.array(z.string()).default([]),
    aliases: z.array(z.string()).default([]),
  }),
})

export const collections = { notes }
