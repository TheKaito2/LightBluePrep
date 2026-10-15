import { useEffect, useId, useMemo, useRef } from 'react'
import { annotationIdAt, applyHighlights, selectionToOffsets } from '../lib/ranges'
import { typeset } from '../lib/mathjax'
import { sanitize } from '../lib/sanitize'
import type { Annotation } from '../types'

interface Props {
  html: string
  field: string
  annotations?: Annotation[]
  onSelect?: (range: { field: string; start: number; end: number }) => void
  /** A click on a highlight, with the clicked piece's box to anchor a menu on. */
  onAnnotationClick?: (id: number, rect: DOMRect) => void
  className?: string
}

/**
 * Give every table its own horizontal scroller.
 *
 * A figure scales down to fit a phone, but a table can't: the widest in the
 * bank is 7 columns and wants 728px, and squeezing that into 390px makes it
 * unreadable. Scrolling it inside its own box keeps the sideways drag on the
 * table instead of taking the whole question with it.
 *
 * Done here rather than with `display: block; overflow-x: auto` in CSS, which
 * looks like it should work and doesn't: it hands the table's sizing to an
 * anonymous box that stretches to fill, so a two-column table went from 95px to
 * the full width of the pane. The table has to stay a real table to shrink to
 * fit its own contents.
 *
 * A wrapper element adds no text node and reorders none, so the offsets every
 * saved highlight is anchored to are untouched (lib/ranges.ts).
 */
function wrapTables(host: HTMLElement): void {
  for (const table of host.querySelectorAll('table')) {
    const wrap = document.createElement('div')
    wrap.className = 'tablewrap'
    // Focusable so the arrow keys can scroll it, except inside an answer
    // choice, which is a button and cannot hold a second focus stop.
    if (!host.closest('button')) {
      wrap.tabIndex = 0
      wrap.setAttribute('role', 'region')
      wrap.setAttribute('aria-label', 'Table, scroll sideways')
    }
    table.replaceWith(wrap)
    wrap.appendChild(table)
  }
}

/**
 * The default when a caller has no highlights. One shared array rather than a
 * fresh `[]` per render, which the effect below took as a change and answered
 * by rebuilding the text and typesetting its maths again (PF-10).
 */
const NO_ANNOTATIONS: Annotation[] = []

/** Narrower than this, an image or SVG is an inline glyph or an answer-choice thumbnail. */
const FIGURE_MIN = 120

/** An SVG length attribute in CSS pixels, or NaN for a unit we do not convert. */
function svgLength(value: string | null): number {
  const match = /^\s*([\d.]+)\s*(px|pt)?\s*$/.exec(value ?? '')
  if (!match) return NaN
  return parseFloat(match[1]) * (match[2] === 'pt' ? 4 / 3 : 1)
}

/**
 * Mark the graphs and diagrams so CSS can size them as figures.
 *
 * The bank's own sizes are too small to read: a stopping-distance graph ships
 * as a 480px PNG tagged width="176", so its tick labels drew 7px tall. Figures
 * get a common reading width in bluebook.css instead; inline math images (the
 * disclosed items set every equation as a PNG) and anything inside an answer
 * choice keep their own size. The aspect ratio rides along as --fig-ar so a
 * tall diagram is capped by height rather than stretched to the full width.
 */
function markFigures(host: HTMLElement): void {
  if (host.closest('button')) return
  const mark = (el: HTMLElement | SVGElement, width: number, height: number) => {
    if (!(width > FIGURE_MIN)) return
    el.classList.add('fig-block')
    if (height > 0) el.style.setProperty('--fig-ar', String(width / height))
  }
  for (const svg of host.querySelectorAll('svg')) {
    if (svg.parentElement?.closest('svg')) continue
    let width = svgLength(svg.getAttribute('width'))
    let height = svgLength(svg.getAttribute('height'))
    // Without a viewBox a resized SVG crops its drawing instead of scaling it.
    // User units default to CSS pixels, so the drawn size is the viewBox.
    const box = svg.viewBox.baseVal
    if (box && box.width > 0) {
      width = Number.isNaN(width) ? box.width : width
      height = Number.isNaN(height) ? box.height : height
    } else if (width > 0 && height > 0) {
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
    }
    mark(svg, width, height)
  }
  for (const img of host.querySelectorAll('img')) {
    if (img.classList.contains('math-img') || img.closest('.math-container')) continue
    if (img.getAttribute('width')) mark(img, Number(img.getAttribute('width')), Number(img.getAttribute('height')))
    else if (img.naturalWidth) mark(img, img.naturalWidth, img.naturalHeight)
    // A data: image is still decoding when it is first inserted.
    else img.addEventListener('load', () => mark(img, img.naturalWidth, img.naturalHeight), { once: true })
  }
}

/**
 * Renders official question HTML: MathML, inline SVG figures, tables, and
 * base64 images all arrive from the bank, and pass through lib/sanitize.ts.
 *
 * Order matters. Highlights are applied while the math is still <math>, then
 * MathJax replaces it; because the offset space skips math entirely, typesetting
 * cannot move a highlight.
 */
export function RichText({
  html, field, annotations = NO_ANNOTATIONS, onSelect, onAnnotationClick, className,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const noteIdPrefix = useId()
  // Recomputed only when the highlights or the field change, so a parent
  // re-render (a mistake tag clicked under the explanation) rebuilds nothing.
  const own = useMemo(() => annotations.filter((a) => a.field === field), [annotations, field])

  useEffect(() => {
    const host = ref.current
    if (!host) return
    // Cleaned in an inert template first: nothing in it runs or loads until it
    // is in the page, and by then anything that could is gone (lib/sanitize.ts).
    // Until MathJax has run, bluebook.css hides the raw <math>: the browser's
    // own MathML rendering flashed in a different face on every re-render.
    // Set again once typesetting settles, failed or not, so a MathJax error
    // still leaves the native rendering readable.
    delete host.dataset.typeset
    host.replaceChildren(sanitize(html))
    wrapTables(host)
    markFigures(host)
    applyHighlights(host, own, noteIdPrefix)
    let current = true
    void typeset(host).then(() => { if (current) host.dataset.typeset = '' })
    return () => { current = false }
  }, [html, own, noteIdPrefix])

  const lastReported = useRef('')

  /** Hand the current selection up if it lies in this text. */
  function report(force: boolean) {
    const host = ref.current
    if (!onSelect || !host) return
    const offsets = selectionToOffsets(host)
    if (!offsets) {
      lastReported.current = ''
      return
    }
    const key = `${offsets.start}:${offsets.end}`
    // The debounced selectionchange also fires after a mouseup already opened
    // the menu, and after Escape closed it; neither should reopen it.
    if (!force && key === lastReported.current) return
    lastReported.current = key
    onSelect({ field, start: offsets.start, end: offsets.end })
  }
  // The latest report, so the document listeners below are added once per
  // mount rather than on every render of the question.
  const reportRef = useRef(report)
  reportRef.current = report

  /**
   * Mouseup alone missed phones and keyboards: a long-press selection fires no
   * mouseup, and a Shift+Arrow selection has no pointer at all. So also watch
   * the selection itself, debounced so a selection still being dragged (by
   * mouse or by the handles on a phone) does not open the menu halfway.
   *
   * A keyboard selection opens the menu when Shift comes up rather than on
   * every Shift+Arrow: the menu takes focus, and taking it after the first
   * arrow would stop you extending the selection past one character.
   */
  const selectable = Boolean(onSelect)
  useEffect(() => {
    if (!selectable) return
    let timer: ReturnType<typeof setTimeout> | undefined
    // Either one held means the selection is still being made.
    let mouseDown = false
    let shiftDown = false
    const later = () => {
      clearTimeout(timer)
      timer = setTimeout(() => { if (!mouseDown && !shiftDown) reportRef.current(false) }, 300)
    }
    const onMouseDown = (event: MouseEvent) => { mouseDown = true; shiftDown = event.shiftKey }
    // A drag that ends outside the text gets no mouseup here, so check then.
    const onMouseUp = () => { mouseDown = false; later() }
    // Read from every key rather than only Shift's own events, so a Shift
    // released while the window was in the background cannot stick.
    const onKeyDown = (event: KeyboardEvent) => { shiftDown = event.shiftKey }
    const onKeyUp = (event: KeyboardEvent) => {
      shiftDown = event.shiftKey
      if (event.key === 'Shift') reportRef.current(false)
    }
    document.addEventListener('selectionchange', later)
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('mouseup', onMouseUp)
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('keyup', onKeyUp)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('selectionchange', later)
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('mouseup', onMouseUp)
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('keyup', onKeyUp)
    }
  }, [selectable])

  function handleClick(event: React.MouseEvent) {
    if (!onAnnotationClick) return
    // The end of a drag that started on a highlight is a new selection, not a
    // click on the highlight.
    if (window.getSelection()?.isCollapsed === false) return
    const id = annotationIdAt(event.target)
    const mark = (event.target as HTMLElement).closest?.('mark.hl')
    if (id !== null && mark) onAnnotationClick(id, mark.getBoundingClientRect())
  }

  // `richtext` is always on, so the rules for official markup (figures that have
  // to scale, tables that have to scroll) key off the renderer rather than off a
  // list of its callers. Review and Explanation pass no className at all and
  // were getting none of them.
  return (
    <div
      ref={ref}
      className={className ? `richtext ${className}` : 'richtext'}
      onMouseUp={onSelect ? () => report(true) : undefined}
      onClick={handleClick}
    />
  )
}
