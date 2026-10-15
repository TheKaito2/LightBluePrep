/** MathJax is loaded from /public as a plain script, so it has no module type. */
declare global {
  interface Window {
    MathJax?: {
      typesetPromise?: (elements: HTMLElement[]) => Promise<void>
      typesetClear?: (elements: HTMLElement[]) => void
      startup?: { promise: Promise<void> }
    }
  }
}

/**
 * Versioned path so _headers can cache it as immutable: a new MathJax goes in a
 * new folder. The config it reads is the inline window.MathJax block in
 * index.html, whose CSP hash is in _headers.
 */
const SRC = `${import.meta.env.BASE_URL}mathjax/3.2.2/mml-svg.js`

let loader: Promise<void> | null = null

/**
 * Load MathJax once, on first need. It is 1.9 MB and used to load before the
 * app could run at all (PF-01), on every page, though Home has no maths.
 * Resolves when MathJax has started up and can typeset.
 */
export function ensureMathJax(): Promise<void> {
  if (window.MathJax?.typesetPromise) return window.MathJax.startup?.promise ?? Promise.resolve()
  if (loader) return loader
  loader = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SRC
    script.async = true
    script.onload = () => {
      // The script swaps the config object for MathJax itself, startup included.
      const ready = window.MathJax?.startup?.promise
      if (ready) resolve(ready)
      else reject(new Error('MathJax loaded without starting up'))
    }
    script.onerror = () => reject(new Error('MathJax script failed to load'))
    document.head.appendChild(script)
  }).catch((error: unknown) => {
    // Let the next question try again rather than replay this failure.
    loader = null
    throw error
  })
  return loader
}

/** Typeset one container, loading MathJax first if it has maths in it. */
export async function typeset(element: HTMLElement): Promise<void> {
  // Most Reading and Writing text has no maths: never fetch MathJax for it.
  if (!element.querySelector('math')) return
  try {
    await ensureMathJax()
    const mathjax = window.MathJax
    if (!mathjax?.typesetPromise) return
    mathjax.typesetClear?.([element])
    await mathjax.typesetPromise([element])
  } catch (error) {
    // A typeset failure must not blank the question: RichText then shows the
    // browser's own MathML rendering.
    console.error('MathJax typeset failed', error)
  }
}
