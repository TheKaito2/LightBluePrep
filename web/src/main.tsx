import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ToastProvider } from './components/Toast'
import { ErrorBoundary } from './components/ErrorBoundary'
import { urlFor } from './lib/route'
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
import './styles/plan.css'
import './styles/pages.css'
import './styles/account.css'
import { loadBeacon } from './lib/usage'
import { applyTheme } from './lib/theme'

// The head's inline line already set data-theme; this keeps it in step from
// here on (System follows the device live).
applyTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      {/* Reset drops the hash so the fresh App mounts on Home, not on the
          view that broke. */}
      <ErrorBoundary standalone context="app"
                     onReset={() => history.replaceState(null, '', urlFor('home', window.location.href))}>
        <App />
      </ErrorBoundary>
    </ToastProvider>
  </StrictMode>,
)
loadBeacon()

// Offline support (public/sw.js). Production only: in dev it would cache
// Vite's modules and serve stale code. After 'load', so registering never
// competes with the first paint.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`)
      .then(() => navigator.serviceWorker.ready)
      .then((registration) => {
        // This visit loaded its files before the worker existed, so hand it the
        // list; it keeps the ones it caches (assets, MathJax, fonts).
        const urls = performance.getEntriesByType('resource').map((entry) => entry.name)
        registration.active?.postMessage({ type: 'cache', urls })
      })
      .catch((error: unknown) => console.warn('Offline support unavailable:', error))
  })
}
