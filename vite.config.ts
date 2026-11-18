import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => ({
  base: process.env.VITE_BASE || loadEnv(mode, process.cwd(), 'VITE_').VITE_BASE || '/',
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (/\/node_modules\/(highlight\.js|lowlight)\//.test(id)) return 'code-languages'
          if (/\/node_modules\/(@tiptap|prosemirror-[^/]+|marked|orderedmap|rope-sequence|w3c-keyname|linkifyjs)\//.test(id)) return 'editor'
          if (/\/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react'
        },
      },
    },
  },
}))
