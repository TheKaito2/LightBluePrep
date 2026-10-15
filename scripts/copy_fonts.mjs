// Copy the two brand faces into web/public/fonts/ for the static pages
// (privacy.html, 404.html, skills/*), which are plain HTML outside the Vite
// bundle and so cannot import them. web/public/static.css declares them by
// these stable names. Runs before `npm run dev`, `build` and `build:pages`
// (see web/package.json); the output is not committed.
//
//   node scripts/copy_fonts.mjs
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const web = join(dirname(fileURLToPath(import.meta.url)), '..', 'web')
const out = join(web, 'public', 'fonts')

// Latin only: the static pages are English. Bricolage is the variable weight
// axis file the app's @fontsource-variable import also loads.
const FILES = {
  'bricolage-grotesque-latin.woff2':
    'node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2',
  'noto-sans-latin.woff2': 'src/fonts/NotoSans-normal-latin.woff2',
  'noto-sans-latin-ext.woff2': 'src/fonts/NotoSans-normal-latin-ext.woff2',
}

mkdirSync(out, { recursive: true })
for (const [name, src] of Object.entries(FILES)) copyFileSync(join(web, src), join(out, name))
console.log(`copy_fonts: ${Object.keys(FILES).length} files -> web/public/fonts/`)
