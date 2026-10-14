import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
// Before the stylesheets so the faces are declared by the time anything uses them.
import './fonts.css'
// Design tokens first: every stylesheet below reads them.
import '@fontsource-variable/bricolage-grotesque'
import './tokens.css'
// One file per surface. The order is the cascade: a later file wins a tie in
// specificity, so keep shared pieces (shell, home) ahead of the pages that
// override them (review, stats, pages, account).
import './styles/base.css'
import './styles/bluebook.css'
import './styles/bluebook-tools.css'
import './styles/shell.css'
import './styles/home.css'
import './styles/review.css'
import './styles/stats.css'
import './styles/pages.css'
import './styles/account.css'
import { loadBeacon } from './lib/usage'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
loadBeacon()
