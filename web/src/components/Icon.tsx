/**
 * Inline 24x24 stroke icons. Hand-rolled rather than pulled from a library so
 * there is no extra dependency and no icon font to load.
 */
type Name =
  | 'chevron-left' | 'chevron-right' | 'chevron-down' | 'chevron-up'
  | 'bookmark' | 'highlighter' | 'more' | 'close' | 'note' | 'calculator'
  | 'grip' | 'check' | 'sliders' | 'pin' | 'trash' | 'underline' | 'arrow-right'
  | 'split' | 'expand' | 'shrink' | 'grip-h' | 'dots9' | 'tag' | 'search'
  | 'flame' | 'lock' | 'heart' | 'coffee' | 'trend-up' | 'trend-down' | 'qr'
  | 'book' | 'target' | 'layers' | 'sigma' | 'grid' | 'history' | 'chart' | 'info' | 'compass' | 'play' | 'external' | 'star' | 'ruler'
  | 'gear' | 'cloud' | 'refresh' | 'clock' | 'download' | 'check-circle' | 'alert' | 'user'
  | 'shield' | 'message' | 'code'

const PATHS: Record<Name, string> = {
  // Eight teeth at r 9.4, roots at r 6.9, hole r 3; computed, not traced.
  gear: 'M18.7 10.2L21.3 10.6L21.3 13.4L18.7 13.8L18 15.4L19.6 17.6L17.6 19.6L15.5 18L13.8 18.7L13.4 21.3L10.6 21.3L10.2 18.7L8.6 18L6.4 19.6L4.4 17.6L6 15.4L5.3 13.8L2.7 13.4L2.7 10.6L5.3 10.2L6 8.5L4.4 6.4L6.4 4.4L8.5 6L10.2 5.3L10.6 2.7L13.4 2.7L13.8 5.3L15.5 6L17.6 4.4L19.6 6.4L18 8.5zM15 12a3 3 0 11-6 0 3 3 0 016 0z',
  'chevron-left': 'M15 18l-6-6 6-6',
  'chevron-right': 'M9 18l6-6-6-6',
  'chevron-down': 'M6 9l6 6 6-6',
  'chevron-up': 'M18 15l-6-6-6 6',
  bookmark: 'M6 4a1 1 0 011-1h10a1 1 0 011 1v17l-6-4.5L6 21z',
  highlighter: 'M4 20h6M13.5 3.2a2 2 0 012.9 2.8L8.6 17 5 18l.8-3.7z',
  more: 'M12 5.2h.01M12 12h.01M12 18.8h.01',
  close: 'M18 6L6 18M6 6l12 12',
  note: 'M15 3H5a2 2 0 00-2 2v14a2 2 0 002 2h10l6-6V5a2 2 0 00-2-2zM15 21v-6h6',
  calculator: 'M4 3h16v18H4zM8 7h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15v4',
  grip: 'M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01',
  check: 'M20 6L9 17l-5-5',
  sliders: 'M4 6h16M4 12h16M4 18h16M9 4v4M15 10v4M7 16v4',
  pin: 'M12 21s7-6.3 7-11a7 7 0 10-14 0c0 4.7 7 11 7 11zM12 12a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6',
  underline: 'M6 4v6a6 6 0 0012 0V4M4 20h16',
  'arrow-right': 'M5 12h14M13 6l6 6-6 6',
  split: 'M12 4v16',
  search: 'M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4.2-4.2',
  flame: 'M12 3c.6 3.2 4.8 5.3 4.8 10.2A4.8 4.8 0 0112 18a4.8 4.8 0 01-4.8-4.8c0-2.2 1.2-3.7 2.3-4.7.2 1.8 1 2.9 2.1 3.5.4-3 .1-5.6.4-9zM12 18v3',
  lock: 'M6 11h12v9H6zM8.5 11V7.5a3.5 3.5 0 017 0V11M12 15v2',
  heart: 'M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0112 7.3a4.2 4.2 0 017.5 2.5C19.5 15.4 12 20 12 20z',
  coffee: 'M4 9h12v5a5 5 0 01-5 5H9a5 5 0 01-5-5zM16 10.5h1.5a2.5 2.5 0 010 5H16M8 3.5v2.5M12 3.5v2.5',
  'trend-up': 'M4 16.5l5-5 4 4 7-7.5M15 8h5v5',
  'trend-down': 'M4 7.5l5 5 4-4 7 7.5M15 16h5v-5',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM7 7h.01M17 7h.01M7 17h.01M14 14h2.5v2.5H14zM18.5 14H20M14 19h.01M17.5 18.5H20V20M20 16.5v.5',
  book: 'M12 6.5C10.5 5.2 8.3 4.5 4 4.5v13c4.3 0 6.5.7 8 2 1.5-1.3 3.7-2 8-2v-13c-4.3 0-6.5.7-8 2zM12 6.5v13',
  target: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 16.5a4.5 4.5 0 100-9 4.5 4.5 0 000 9zM12 12.5a.5.5 0 100-1 .5.5 0 000 1z',
  layers: 'M12 3.5l8.5 4.5-8.5 4.5L3.5 8zM3.5 12.5l8.5 4.5 8.5-4.5M3.5 16.5L12 21l8.5-4.5',
  sigma: 'M17.5 5H6.5l6 7-6 7h11',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  history: 'M3.5 12a8.5 8.5 0 102.5-6L3.5 8.5M3.5 3.5v5h5M12 7.5V12l3 2',
  chart: 'M4 20V11M10 20V5M16 20v-6M20.5 20h-17',
  ruler: 'M3 17L17 3l4 4L7 21zM7.5 12.5l2 2M10.5 9.5l2 2M13.5 6.5l2 2',
  info: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v5.5M12 7.5h.01',
  compass: 'M12 21a9 9 0 100-18 9 9 0 000 18zM15.6 8.4l-2.1 5.1-5.1 2.1 2.1-5.1z',
  play: 'M7 4.5v15l12.5-7.5z',
  external: 'M14 4h6v6M20 4l-9 9M18 13.5V19a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5.5',
  star: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z',
  expand: 'M20 4l-6.5 6.5M20 4v5M20 4h-5M4 20l6.5-6.5M4 20v-5M4 20h5',
  shrink: 'M4 10.5l6.5-6.5M10.5 4v6.5M10.5 10.5H4M20 13.5l-6.5 6.5M13.5 20v-6.5M13.5 13.5H20',
  dots9: 'M6 6h.01M12 6h.01M18 6h.01M6 12h.01M12 12h.01M18 12h.01M6 18h.01M12 18h.01M18 18h.01',
  'grip-h': 'M5 9h14M5 15h14',
  cloud: 'M7 18.5a4 4 0 01-.6-7.96A6 6 0 0117 10a4.25 4.25 0 010 8.5z',
  // Feather's refresh-cw scaled to 80% so it sits in the same box as the rest.
  refresh: 'M20.8 5.6v4.8H16M3.2 18.4v-4.8H8M5.21 9.6a7.2 7.2 0 0111.88-2.69L20.8 10.4M3.2 13.6l3.71 3.49a7.2 7.2 0 0011.88-2.69',
  clock: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2',
  download: 'M12 4v11M7 10l5 5 5-5M4 19.5h16',
  'check-circle': 'M12 21a9 9 0 100-18 9 9 0 000 18zM8 12.2l2.8 2.8L16 9.5',
  alert: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7.5V13M12 16.5h.01',
  user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4.5 20.5a7.5 7.5 0 0115 0',
  shield: 'M12 3l7.5 3v5.5c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V6z',
  message: 'M20 15.5a1.5 1.5 0 01-1.5 1.5H8l-4 3.5V5.5A1.5 1.5 0 015.5 4h13A1.5 1.5 0 0120 5.5z',
  code: 'M8.5 7l-5 5 5 5M15.5 7l5 5-5 5M13.5 4.5l-3 15',
  tag: 'M20.6 13.4l-7.2 7.2a2 2 0 01-2.8 0l-6.8-6.8A2 2 0 013.2 12.4V5a2 2 0 012-2h7.4a2 2 0 011.4.6l6.6 6.6a2 2 0 010 2.8zM8 8h.01',
}

interface Props {
  name: Name
  size?: number
  strokeWidth?: number
  className?: string
}

export function Icon({ name, size = 18, strokeWidth = 1.8, className }: Props) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}

/** Filled variant, used for the bookmark once a question is marked. */
/**
 * The drag handle inside the pane divider: two arrowheads pointing outward with
 * a gap between them. Proportions measured off the real handle (11 wide, a
 * 2-unit gap); there is no centre bar, the gap is the handle showing through.
 */
export function SplitHandle({ className }: { className?: string }) {
  return (
    <svg className={className} width="12" height="11" viewBox="0 0 12 11"
         fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M5 0L0 5.5 5 11z" />
      <path d="M7 0L12 5.5 7 11z" />
    </svg>
  )
}

export function BookmarkFilled({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24"
         fill="currentColor" stroke="currentColor" strokeWidth={1.8}
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 4a1 1 0 011-1h10a1 1 0 011 1v17l-6-4.5L6 21z" />
    </svg>
  )
}
