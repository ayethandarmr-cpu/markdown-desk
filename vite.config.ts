import { defineConfig, loadEnv } from 'vite'
export default defineConfig(({mode}) => ({
  base: process.env.VITE_BASE || loadEnv(mode,process.cwd(),'VITE_').VITE_BASE || '/',
  server:{hmr:false},
  build:{
    rollupOptions:{
      output:{
        manualChunks(id) {
          if (id.includes('/node_modules/highlight.js/')) return 'code-languages'
          if (/\/node_modules\/@(?:codemirror|lezer)\//.test(id)) return 'source-editor'
          if (/\/node_modules\/(?:react|react-dom|scheduler)\//.test(id)) return 'react'
        },
      },
    },
  },
}))
