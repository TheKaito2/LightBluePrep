/**
 * Clean question HTML before it reaches the page.
 *
 * Everything RichText renders is College Board's own markup, fetched straight
 * from their API, and the CSP already refuses inline script. This is the second
 * layer for the day that feed is ever tampered with: no element that runs
 * code, loads another page or submits anything survives, no event handler, and
 * no link that leaves the question. What the bank actually uses (MathML, inline
 * SVG figures with <style> and <use>, tables, data: images, style attributes)
 * passes through untouched.
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
  src: (v) => /^data:image\//i.test(v) || /^https:\/\//i.test(v),
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
  return template.content
}
