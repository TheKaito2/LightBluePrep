import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * The two faces every page paints with, by their source names. Only these:
 * preloading the other subsets (latin-ext, Greek, serif, italic) would spend
 * bandwidth on files most pages never use.
 */
const PRELOAD_FONTS = ['NotoSans-normal-latin.woff2', 'bricolage-grotesque-latin-wght-normal.woff2']

/**
 * Preload links for PRELOAD_FONTS. Otherwise the browser finds them only once
 * the CSS has loaded and the page has rendered text, which on 3G was 5s after
 * the CSS arrived, and the headline visibly swapped (PF-11). 'post' so the
 * hashed file names exist; nothing to do in dev.
 */
function preloadFonts(): Plugin {
  let base = '/'
  return {
    name: 'preload-fonts',
    configResolved(config) { base = config.base },
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        if (!ctx.bundle) return
        return Object.values(ctx.bundle)
          .filter((file) => file.type === 'asset' && file.names.some((n) => PRELOAD_FONTS.includes(n)))
          .map((file) => ({
            tag: 'link',
            attrs: { rel: 'preload', as: 'font', type: 'font/woff2', href: base + file.fileName, crossorigin: '' },
            injectTo: 'head' as const,
          }))
      },
    },
  }
}

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
    plugins: [react(), preloadFonts()],
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
