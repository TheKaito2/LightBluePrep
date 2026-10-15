/**
 * Clean question HTML before it reaches the page.
 *
 * Everything RichText renders is College Board's own markup, fetched straight
 * from their API, and the CSP already refuses inline script. This is the second
 * layer for the day that feed is ever tampered with: no element that runs
 * code, loads another page or submits anything survives, no event handler, and
 * no link that leaves the question, and no image from anywhere but the
 * question itself. What the bank actually uses (MathML, inline SVG figures with
 * <style> and <use>, tables, data: images, style attributes) still renders.
 *
 * A figure's <style> is the one thing rewritten: a <style> element applies to
 * the whole page, so a figure's `*{stroke-linecap:butt}` re-capped every icon
 * in the app. Its rules are scoped to the figure (scopeStyle).
 *
 * A deny list rather than an allow list on purpose: an unfamiliar but harmless
 * tag in a future question should still show, and the CSP covers what a deny
 * list could miss.
 */

const DROP = new Set([
  'script', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'portal',
  'link', 'meta', 'base', 'form', 'input', 'button', 'textarea', 'select', 'option',
  'template', 'noscript', 'audio', 'video', 'source', 'track',
  // SVG: animation can rewrite an href after the fact, and foreignObject
  // re-enters HTML inside a figure. The bank uses neither.
  'animate', 'set', 'animatemotion', 'animatetransform', 'foreignobject',
])

/** Attributes that load or navigate somewhere, and what each may point at. */
const URL_ATTRS: Record<string, (value: string) => boolean> = {
  href: (v) => v.startsWith('#'),
  'xlink:href': (v) => v.startsWith('#'),
  // Every image in the bank is inline, and img-src in _headers refuses the rest.
  src: (v) => /^data:image\//i.test(v),
}
const ALWAYS_DROP = new Set(['srcset', 'action', 'formaction', 'ping', 'poster', 'background'])

function cleanAttributes(el: Element): void {
  for (const attr of [...el.attributes]) {
    const name = attr.name.toLowerCase()
    const value = attr.value.trim()
    const allowed = URL_ATTRS[name]
    if (name.startsWith('on') || ALWAYS_DROP.has(name) || (allowed && !allowed(value))) {
      el.removeAttribute(attr.name)
    }
  }
}

let scopes = 0

/**
 * Whether a serialized rule opens and closes its own braces. A browser's CSSOM
 * never serializes anything else, but jsdom keeps `} body {...}` as a rule, and
 * that text would close the scope wrapper and land page-wide.
 * ponytail: quotes are not skipped, so a rule with a brace inside a string is
 * dropped too; no figure in the bank has one.
 */
function balanced(css: string): boolean {
  let depth = 0
  for (const ch of css) {
    if (ch === '{') depth++
    else if (ch === '}' && --depth < 0) return false
  }
  return depth === 0
}

/**
 * Confine a <style> to the SVG it sits in. The browser parses the rules (so a
 * stray `}` cannot close the wrapper early and escape it), and the re-serialized
 * rules are nested under an attribute only that SVG carries. A <style> outside
 * any SVG has nothing to scope to and is dropped; the bank has none.
 */
function scopeStyle(style: Element): void {
  const root = style.closest('svg')
  if (!root) { style.remove(); return }
  const sheet = new CSSStyleSheet()
  sheet.replaceSync(style.textContent ?? '')
  const id = `f${++scopes}`
  root.setAttribute('data-css-scope', id)
  const rules = [...sheet.cssRules].map((rule) => rule.cssText).filter(balanced).join('\n')
  style.textContent = `[data-css-scope="${id}"] {\n${rules}\n}`
}

/**
 * Parse into an inert template (nothing runs and nothing loads while it is
 * cleaned), strip it, and hand back the fragment to insert.
 */
export function sanitize(html: string): DocumentFragment {
  const template = document.createElement('template')
  template.innerHTML = html
  for (const el of [...template.content.querySelectorAll('*')]) {
    if (DROP.has(el.localName.toLowerCase())) el.remove()
    else cleanAttributes(el)
  }
  for (const style of [...template.content.querySelectorAll('style')]) scopeStyle(style)
  return template.content
}
