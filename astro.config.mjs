// @ts-check
import { defineConfig } from 'astro/config'
import tailwindcss from '@tailwindcss/vite'
import mdx from '@astrojs/mdx'
import { unified } from '@astrojs/markdown-remark'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { remarkWikilink } from './src/lib/wikilink.ts'
import { getIndex } from './src/lib/targets.ts'

export default defineConfig({
  site: 'https://notes.passion4ever.org',
  integrations: [mdx()],
  vite: {
    plugins: [tailwindcss()],
  },
  markdown: {
    processor: unified({
      remarkPlugins: [remarkMath, [remarkWikilink, { getIndex }]],
      rehypePlugins: [rehypeKatex],
    }),
  },
})
