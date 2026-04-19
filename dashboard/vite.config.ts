import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const cwd = process.cwd()
  const fromFiles = loadEnv(mode, cwd, '')
  const viteWorkerUrl =
    fromFiles.VITE_MAHORAGA_API_BASE ?? process.env.VITE_MAHORAGA_API_BASE ?? ''

  const apiTarget = process.env.MAHORAGA_API_URL || `http://localhost:${process.env.WRANGLER_PORT || '8787'}`

  return {
    plugins: [react(), tailwindcss()],
    define: {
      'import.meta.env.VITE_MAHORAGA_API_BASE': JSON.stringify(viteWorkerUrl),
    },
    server: {
      port: 3000,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api/, '/agent'),
        },
      },
    },
  }
})
