import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
// Before styles.css so the faces are declared by the time anything uses them.
import './fonts.css'
// Design tokens first: styles.css reads them.
import '@fontsource-variable/bricolage-grotesque'
import './tokens.css'
import './styles.css'
import { loadBeacon } from './lib/usage'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
loadBeacon()
