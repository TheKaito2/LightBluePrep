/**
 * The share card (G-01): a flat 1080x1350 PNG of a score or a streak, drawn on
 * a canvas in the browser and handed to the system share sheet. Where there is
 * no share sheet for files, the PNG is downloaded and the site link copied.
 *
 * Nothing is uploaded and nothing is fetched: Bulb comes from an SVG data URL
 * and the faces are the ones the page already loaded, so the picture goes only
 * where the student sends it (privacy.html says so).
 */
import { createElement, useCallback, useState } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { Mascot } from '../components/Mascot'
import { useToast } from './toast'
import type { Section } from '../types'

export interface Card {
  /** The hero figure: "8" of "8 / 10", or the "7" of a streak. */
  value: string
  /** Its quieter unit: "/ 10", "days". */
  unit: string
  /** Under it, up to two lines: "on Linear functions", "SAT practice streak". */
  line: string
  /** Smaller still, optional: "80% correct". */
  sub?: string
  /** Colours `line` when the card is about one section. */
  section?: Section | null
  /** The message the share sheet carries with the image. */
  text: string
  /** File name, without the extension. */
  name: string
}

const W = 1080
const H = 1350

/**
 * Light-theme values from tokens.css, fixed: the card is a picture that is
 * seen elsewhere, so it must not change with the sharer's dark mode.
 */
const C = {
  brand: '#1479c2', brandSoft: '#b9dcf6', panel: '#ffffff',
  fg1: '#11151a', fg3: '#5b636e', RW: '#a3245a', MATH: '#075f99',
}
const DISPLAY = '"Bricolage Grotesque Variable", "Noto Sans", sans-serif'
const SANS = '"Noto Sans", sans-serif'

/**
 * Bulb's fills for the image. An SVG drawn as an image cannot see the page's
 * stylesheet, so these copy the .bulb-* rules in styles/shell.css (light
 * values); keep the two in step.
 */
const BULB_CSS = '.bulb-glass,.bulb-limb-fill{fill:#3aa3ec}.bulb-base{fill:#1479c2}'
  + '.bulb-limb{fill:none;stroke:#3aa3ec;stroke-width:9;stroke-linecap:round}'
  + '.bulb-check{fill:none;stroke:#fff;stroke-width:9;stroke-linecap:round;stroke-linejoin:round}'
  + '.bulb-ink{fill:#11151a}.bulb-line{fill:none;stroke:#11151a;stroke-width:3.4;stroke-linecap:round;stroke-linejoin:round}'
  + '.bulb-shine{fill:#fff}.bulb-cheek{fill:#f6c4da}.bulb-sweat{fill:#b9dcf6}'
  + '.bulb-ray{fill:none;stroke:#f2771a;stroke-width:4;stroke-linecap:round}'

/** Bulb cheering, as a data URL, from the same component the app shows. */
function bulbUrl(width: number): string {
  const host = document.createElement('div')
  const root = createRoot(host)
  flushSync(() => root.render(createElement(Mascot, { mood: 'cheer', size: width })))
  const svg = host.innerHTML
    .replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')
    .replace(/(<svg[^>]*>)/, `$1<style>${BULB_CSS}</style>`)
  root.unmount()
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/**
 * Greedy word wrap into at most `max` lines; a last line that still overflows
 * ends in an ellipsis. `measure` is the canvas's text width.
 */
export function wrapLines(text: string, width: number, max: number, measure: (s: string) => number): string[] {
  const lines: string[] = []
  let line = ''
  const words = text.split(/\s+/).filter(Boolean)
  for (let i = 0; i < words.length; i++) {
    const next = line ? `${line} ${words[i]}` : words[i]!
    if (measure(next) <= width || !line) { line = next; continue }
    lines.push(line)
    line = words[i]!
    if (lines.length === max - 1) { line = words.slice(i).join(' '); break }
  }
  if (line) lines.push(line)
  const last = lines.length - 1
  if (last >= 0 && measure(lines[last]!) > width) {
    let cut = lines[last]!
    while (cut && measure(`${cut}…`) > width) cut = cut.slice(0, -1).trimEnd()
    lines[last] = `${cut}…`
  }
  return lines
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.fill()
}

/** The site's own address, which is also what the card prints. */
export const siteUrl = () => `${window.location.origin}${import.meta.env.BASE_URL}`

export async function drawCard(card: Card): Promise<Blob> {
  // Already loaded by the page in practice; this only waits if they are not.
  await Promise.all([
    document.fonts.load(`800 200px ${DISPLAY}`),
    document.fonts.load(`600 40px ${SANS}`),
    document.fonts.load(`500 40px ${SANS}`),
  ])
  const bulb = new Image()
  bulb.src = bulbUrl(240)
  await bulb.decode()

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No 2D canvas')
  ctx.textBaseline = 'alphabetic'

  ctx.fillStyle = C.brand
  ctx.fillRect(0, 0, W, H)

  // Brand row: the logo mark (a white tile with the blue check), then the
  // wordmark with "Blue" picked out, as in the nav.
  ctx.fillStyle = C.panel
  roundRect(ctx, 72, 64, 80, 80, 20)
  ctx.save()
  ctx.translate(72, 64)
  ctx.scale(80 / 48, 80 / 48)
  ctx.strokeStyle = C.brand
  ctx.lineWidth = 5
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.stroke(new Path2D('M14.5 24.5l6.5 6.5 12.5-13'))
  ctx.restore()
  ctx.font = `800 56px ${DISPLAY}`
  ctx.letterSpacing = '-1px'
  let x = 176
  for (const [part, colour] of [['Light', C.panel], ['Blue', C.brandSoft], ['Prep', C.panel]] as const) {
    ctx.fillStyle = colour
    ctx.fillText(part, x, 124)
    x += ctx.measureText(part).width
  }
  ctx.letterSpacing = '0px'

  const panel = { x: 64, y: 200, w: W - 128, h: 900 }
  ctx.fillStyle = C.panel
  roundRect(ctx, panel.x, panel.y, panel.w, panel.h, 40)

  ctx.font = `800 64px ${DISPLAY}`
  ctx.letterSpacing = '-1px'
  const lines = wrapLines(card.line, panel.w - 144, 2, (s) => ctx.measureText(s).width)
  ctx.letterSpacing = '0px'

  // Stack Bulb, the figure, the line(s) and the sub, centred in the panel.
  const bulbH = 240 * 142 / 120
  const NUM = 220
  const NUM_ASCENT = 160
  const stack = bulbH + 56 + NUM_ASCENT + 96 + (lines.length - 1) * 76 + (card.sub ? 72 : 0) + 16
  let y = panel.y + (panel.h - stack) / 2
  ctx.drawImage(bulb, (W - 240) / 2, y, 240, bulbH)
  y += bulbH + 56 + NUM_ASCENT

  // The figure and its unit share a baseline and are centred together. The
  // display tracking is the app's (--num-xl -0.045em, headings -0.03em);
  // a browser without canvas letterSpacing just draws it a little looser.
  const NUM_TRACK = `${Math.round(-0.045 * NUM)}px`
  ctx.font = `800 ${NUM}px ${DISPLAY}`
  ctx.letterSpacing = NUM_TRACK
  const numW = ctx.measureText(card.value).width
  ctx.letterSpacing = '0px'
  ctx.font = `600 72px ${SANS}`
  const unitW = ctx.measureText(card.unit).width
  const left = (W - numW - 20 - unitW) / 2
  ctx.fillStyle = C.fg1
  ctx.font = `800 ${NUM}px ${DISPLAY}`
  ctx.letterSpacing = NUM_TRACK
  ctx.fillText(card.value, left, y)
  ctx.letterSpacing = '0px'
  ctx.fillStyle = C.fg3
  ctx.font = `600 72px ${SANS}`
  ctx.fillText(card.unit, left + numW + 20, y)

  ctx.textAlign = 'center'
  ctx.fillStyle = card.section ? C[card.section] : C.fg1
  ctx.font = `800 64px ${DISPLAY}`
  ctx.letterSpacing = '-1px'
  y += 96
  lines.forEach((l, i) => ctx.fillText(l, W / 2, y + i * 76))
  ctx.letterSpacing = '0px'
  y += (lines.length - 1) * 76
  if (card.sub) {
    ctx.fillStyle = C.fg3
    ctx.font = `500 40px ${SANS}`
    ctx.fillText(card.sub, W / 2, y + 72)
  }

  ctx.fillStyle = C.panel
  ctx.font = `600 40px ${SANS}`
  ctx.fillText(`Free SAT practice · ${window.location.host}`, W / 2, 1236)

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('Canvas export failed')
  return blob
}

/** Save a file made in the browser (the card, a backup, a reminder) to the device. */
export function saveBlob(blob: Blob, name: string): void {
  const href = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = href
  a.download = name
  a.click()
  // Revoked later, not now: some browsers start reading the URL after click() returns.
  setTimeout(() => URL.revokeObjectURL(href), 10_000)
}

type Outcome = 'shared' | 'cancelled' | 'saved' | 'saved-copied'

/** The share sheet when it takes files; otherwise download the PNG and copy the link. */
export async function shareCard(card: Card): Promise<Outcome> {
  const blob = await drawCard(card)
  const file = new File([blob], `${card.name}.png`, { type: 'image/png' })
  const url = siteUrl()
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: card.text, url })
      return 'shared'
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
      // Anything else (a browser that let the click's permission lapse while
      // the card drew) still leaves the student with the picture below.
    }
  }
  saveBlob(blob, file.name)
  const copied = navigator.clipboard
    ? await navigator.clipboard.writeText(url).then(() => true, () => false)
    : false
  return copied ? 'saved-copied' : 'saved'
}

/** For a Share button: one card at a time, and a toast for every way it ends but the sheet. */
export function useShareCard() {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const share = useCallback((card: Card) => {
    setBusy(true)
    shareCard(card)
      .then((outcome) => {
        if (outcome === 'saved-copied') toast('Image saved and link copied', { tone: 'ok' })
        else if (outcome === 'saved') toast('Image saved', { tone: 'ok' })
      })
      .catch((e: unknown) => {
        console.warn('Share card failed:', e)
        toast("Couldn't make the image. Try again.", { tone: 'bad' })
      })
      .finally(() => setBusy(false))
  }, [toast])
  return { busy, share }
}
