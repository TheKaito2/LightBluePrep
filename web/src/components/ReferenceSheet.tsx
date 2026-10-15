/**
 * Math reference sheet, the same formulas Bluebook gives you on test day.
 *
 * Drawn here from scratch: the formulas are facts, the figures are our own
 * SVG, nothing is copied from College Board's sheet.
 *
 * A floating window in the calculator's shell rather than a drawer: Bluebook's
 * reference is non-modal, so you can read a formula while you work the
 * question, and nothing covers the toolbar button that closes it.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from './Icon'

interface Shape {
  name: string
  fig: ReactNode
  formulas: ReactNode[]
  /** Two figures side by side: takes the full row. */
  wide?: boolean
}

/** Label text inside the figures. */
const T = ({ x, y, children }: { x: number; y: number; children: ReactNode }) => (
  <text x={x} y={y} className="ref-lbl" textAnchor="middle">{children}</text>
)

const SHAPES: Shape[] = [
  {
    name: 'Circle',
    fig: <><circle cx="50" cy="40" r="28" /><path d="M50 40h28" /><circle cx="50" cy="40" r="1.6" className="ref-dot" /><T x={64} y={35}>r</T></>,
    formulas: [<>A = πr<sup>2</sup></>, <>C = 2πr</>],
  },
  {
    name: 'Rectangle',
    fig: <><rect x="16" y="20" width="68" height="40" /><T x={50} y={74}>ℓ</T><T x={92} y={44}>w</T></>,
    formulas: [<>A = ℓw</>],
  },
  {
    name: 'Triangle',
    fig: <><path d="M12 64h76L60 14z" /><path d="M60 14v50" className="ref-dash" /><path d="M60 58h-6v6" /><T x={50} y={77}>b</T><T x={66} y={44}>h</T></>,
    formulas: [<>A = ½bh</>],
  },
  {
    name: 'Right triangle',
    fig: <><path d="M20 64h60V16z" /><path d="M74 64v-6h6" /><T x={50} y={77}>a</T><T x={88} y={44}>b</T><T x={42} y={36}>c</T></>,
    formulas: [<>c<sup>2</sup> = a<sup>2</sup> + b<sup>2</sup></>],
  },
  {
    name: 'Special right triangles',
    wide: true,
    fig: (
      <>
        <path d="M20 66h70V14z" /><path d="M84 66v-6h6" />
        <T x={55} y={79}>x√3</T><T x={98} y={43}>x</T><T x={48} y={35}>2x</T>
        <T x={38} y={62}>30°</T><T x={82} y={31}>60°</T>
        <path d="M120 66h52V14z" /><path d="M166 66v-6h6" />
        <T x={146} y={79}>s</T><T x={180} y={43}>s</T><T x={138} y={36}>s√2</T>
        <T x={136} y={62}>45°</T><T x={164} y={31}>45°</T>
      </>
    ),
    formulas: [<>30°-60°-90°: x, x√3, 2x</>, <>45°-45°-90°: s, s, s√2</>],
  },
  {
    name: 'Rectangular box',
    fig: <><path d="M14 30h52v36H14zM14 30l18-14h52L66 30M84 16v36L66 66" /><T x={40} y={78}>ℓ</T><T x={82} y={68}>w</T><T x={6} y={51}>h</T></>,
    formulas: [<>V = ℓwh</>],
  },
  {
    name: 'Cylinder',
    fig: <><ellipse cx="50" cy="18" rx="26" ry="8" /><path d="M24 18v44M76 18v44" /><path d="M24 62a26 8 0 0052 0" /><path d="M24 62a26 8 0 0152 0" className="ref-dash" /><path d="M50 18h26" /><T x={69} y={8}>r</T><T x={84} y={44}>h</T></>,
    formulas: [<>V = πr<sup>2</sup>h</>],
  },
  {
    name: 'Sphere',
    fig: <><circle cx="50" cy="40" r="28" /><ellipse cx="50" cy="40" rx="28" ry="8" className="ref-dash" /><path d="M50 40h28" /><T x={64} y={35}>r</T></>,
    formulas: [<>V = <sup>4</sup>⁄<sub>3</sub>πr<sup>3</sup></>],
  },
  {
    name: 'Cone',
    fig: <><path d="M24 62L50 12l26 50" /><path d="M24 62a26 8 0 0052 0" /><path d="M24 62a26 8 0 0152 0" className="ref-dash" /><path d="M50 12v50h26" className="ref-dash" /><T x={63} y={58}>r</T><T x={44} y={42}>h</T></>,
    formulas: [<>V = <sup>1</sup>⁄<sub>3</sub>πr<sup>2</sup>h</>],
  },
  {
    name: 'Rectangular pyramid',
    fig: <><path d="M14 62h50l20-14M14 62l38-50 12 50M52 12l32 36" /><path d="M14 62l20-14h50" className="ref-dash" /><path d="M52 12v43" className="ref-dash" /><T x={38} y={75}>ℓ</T><T x={82} y={62}>w</T><T x={46} y={40}>h</T></>,
    formulas: [<>V = <sup>1</sup>⁄<sub>3</sub>ℓwh</>],
  },
]

/**
 * Where you last left the window, kept past unmount like the calculator's.
 * Null until it is first dragged: it opens at the right, clear of the
 * calculator, which opens at the left.
 */
let remembered: { x: number; y: number } | null = null

export function ReferenceSheet({ onClose }: { onClose: () => void }) {
  const panel = useRef<HTMLElement>(null)
  const [pos, setPos] = useState(remembered)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => { remembered = pos }, [pos])

  function onTitleDown(event: React.PointerEvent) {
    const el = panel.current
    const parent = el?.parentElement
    if (!el || !parent) return
    event.preventDefault()
    const startX = event.clientX - el.offsetLeft
    const startY = event.clientY - el.offsetTop
    const maxX = Math.max(0, parent.clientWidth - el.offsetWidth)
    const maxY = Math.max(0, parent.clientHeight - el.offsetHeight)
    document.body.classList.add('dragging-panel')
    const move = (e: PointerEvent) => setPos({
      x: Math.min(maxX, Math.max(0, e.clientX - startX)),
      y: Math.min(maxY, Math.max(0, e.clientY - startY)),
    })
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.classList.remove('dragging-panel')
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  // CSS clamps the stored spot to the pane, so a smaller window later cannot
  // leave the sheet out of reach.
  const style = pos ? ({ '--ref-x': `${pos.x}px`, '--ref-y': `${pos.y}px` } as React.CSSProperties) : undefined

  return (
    <aside ref={panel} className={pos ? 'desmos-panel ref-panel is-placed' : 'desmos-panel ref-panel'}
           style={style} role="dialog" aria-label="Reference sheet">
      <div className="desmos-head" onPointerDown={onTitleDown}>
        <span className="desmos-title">Reference</span>
        <Icon name="dots9" size={23} className="desmos-grab" strokeWidth={3.4} />
        <button className="desmos-btn"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={onClose}
                aria-label="Close reference sheet" title="Close reference sheet">
          <Icon name="close" size={21} strokeWidth={1.9} />
        </button>
      </div>
      <div className="ref-body">
        <ul className="ref-grid">
          {SHAPES.map((s) => (
            <li key={s.name} className={s.wide ? 'ref-card wide' : 'ref-card'}>
              <svg viewBox={s.wide ? '0 0 200 82' : '0 0 100 82'} className="ref-fig" aria-hidden="true">{s.fig}</svg>
              <span className="ref-name">{s.name}</span>
              {s.formulas.map((f, i) => <span key={i} className="ref-f">{f}</span>)}
            </li>
          ))}
        </ul>
        <ul className="ref-facts">
          <li>A circle has 360°, which is 2π radians.</li>
          <li>The angles in a triangle add up to 180°.</li>
        </ul>
      </div>
    </aside>
  )
}
