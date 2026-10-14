/**
 * The LightBluePrep mark: Bulb's face (see Mascot.tsx) on a deep-blue tile.
 * Inline so it costs no request and cannot flash in after the nav paints.
 *
 * Below 40px the face blurs into a blob, so small sizes (the nav, 24 to 28px)
 * draw the simplified mark: the white tick alone on the blue tile.
 *
 * Keep the geometry in step with public/favicon.svg; they are the same mark.
 */
export function Mark({ size = 26 }: { size?: number }) {
  if (size < 40) {
    return (
      <svg className="mark" width={size} height={size} viewBox="0 0 48 48"
           fill="none" aria-hidden="true" focusable="false">
        <rect x="2" y="2" width="44" height="44" rx="12" fill="#1479c2" />
        <path d="M14.5 24.5l6.5 6.5 12.5-13" stroke="#fff" strokeWidth="5"
              strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  return (
    <svg className="mark" width={size} height={size} viewBox="0 0 48 48"
         fill="none" aria-hidden="true" focusable="false">
      <rect x="2" y="2" width="44" height="44" rx="12" fill="#1479c2" />
      <circle cx="24" cy="20" r="12.5" fill="#3aa3ec" />
      <path d="M14.4 26.5Q19 30.5 19.4 34h9.2q.4-3.5 5-7.5z" fill="#3aa3ec" />
      <rect x="18.6" y="33.4" width="10.8" height="3.6" rx="1.8" fill="#0b3d6b" />
      <rect x="19.3" y="37.8" width="9.4" height="3.4" rx="1.7" fill="#0b3d6b" />
      <path d="M18.4 16.6l3.2 3.2 6.6-6.7" stroke="#fff" strokeWidth="2.9"
            strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="19.6" cy="24.2" r="1.7" fill="#1c1f23" />
      <circle cx="28.4" cy="24.2" r="1.7" fill="#1c1f23" />
      <path d="M22.2 27q1.8 1.6 3.6 0" stroke="#1c1f23" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}
