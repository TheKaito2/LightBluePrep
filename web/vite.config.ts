import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Two build targets from one source tree.
 *
 *   npm run build        localhost. Talks to the Python server on :8000, so
 *                        assets are served from the root and /api is proxied
 *                        in dev.
 *   npm run build:pages  The static site (Cloudflare Pages). No server, and the
 *                        output goes to dist-pages so the two builds never
 *                        overwrite each other.
 *
 * Served from the root, so `base` is `/` by default. It used to default to
 * `/Bluebank/` (upstream's GitHub Pages path), which meant forgetting BASE=/
 * on a deploy shipped a site whose every asset 404s. Set BASE only to serve
 * from a sub-path, e.g. BASE=/repo-name/ for username.github.io/repo-name.
 */
export default defineConfig(({ mode }) => {
  const pages = mode === 'pages'
  return {
    plugins: [react()],
    base: pages ? (process.env.BASE ?? '/') : '/',
    server: {
      port: 5173,
      proxy: { '/api': 'http://127.0.0.1:8000' },
    },
    build: {
      outDir: pages ? 'dist-pages' : 'dist',
      // MathJax is 1.9 MB and vendored on purpose; the warning is noise.
      chunkSizeWarningLimit: 2048,
    },
  }
})
