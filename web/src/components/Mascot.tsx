/**
 * Bulb, the LightBluePrep mascot: a light-blue light bulb ("Light Blue"
 * sounds like "light bulb") whose filament is the check mark from the logo.
 *
 * Hand-built SVG from the concept art, flat fills from tokens.css, no
 * gradients. Moods for the places a face helps: an empty screen, a result, a
 * 404, the Home hero, thinking through a question of its own, a streak.
 */
import type { ReactNode } from 'react'

type Mood = 'neutral' | 'cheer' | 'oops' | 'think' | 'streak'

const ARMS: Record<Mood, string> = {
  neutral: 'M22 74 Q11 68 9 56 M98 78 Q107 88 107 98',
  cheer: 'M20 76 Q5 68 4 50 M100 76 Q115 68 116 50',
  oops: 'M22 80 Q13 90 13 99 M98 80 Q107 90 107 99',
  think: 'M22 78 Q13 88 13 98 M98 74 Q106 82 84 90',
  streak: 'M20 76 Q5 68 4 50 M100 76 Q115 68 116 50',
}

export function Mascot({ mood = 'neutral', size = 120, className }: {
  mood?: Mood; size?: number; className?: string
}) {
  const happy = mood === 'cheer' || mood === 'streak'
  return (
    <svg className={className ? `bulb ${className}` : 'bulb'} viewBox="0 0 120 142"
         width={size} height={size * 142 / 120} aria-hidden="true" focusable="false">
      {mood === 'cheer' ? (
        <path className="bulb-ray" d="M8 30l9 4M112 30l-9 4M20 9l7 7M100 9l-7 7" />
      ) : null}
      <path className="bulb-limb" d={ARMS[mood]} />
      {/* Glass: a circle merged into a short tapered neck. */}
      <circle className="bulb-glass" cx="60" cy="52" r="44" />
      <path className="bulb-glass" d="M24 76 Q40 92 41 104 H79 Q80 92 96 76 Z" />
      <rect className="bulb-base" x="38" y="102" width="44" height="11" rx="5.5" />
      <rect className="bulb-base" x="40" y="115" width="40" height="10" rx="5" />
      <rect className="bulb-limb-fill" x="40" y="128" width="15" height="9" rx="4.5" />
      <rect className="bulb-limb-fill" x="65" y="128" width="15" height="9" rx="4.5" />
      {/* The filament is the logo's check mark. */}
      <path className="bulb-check" d="M43 43 L54 54 L77 31" />
      <ellipse className="bulb-cheek" cx="36" cy="80" rx="6.5" ry="4.2" />
      <ellipse className="bulb-cheek" cx="84" cy="80" rx="6.5" ry="4.2" />
      {happy ? (
        <>
          <path className="bulb-line" d="M38 72 Q44 64 50 72 M70 72 Q76 64 82 72" />
          <path className="bulb-ink" d="M52 78 Q60 92 68 78 Z" />
        </>
      ) : (
        <>
          <ellipse className="bulb-ink" cx="44" cy="70" rx="4.8" ry="5.8" />
          <ellipse className="bulb-ink" cx="76" cy="70" rx="4.8" ry="5.8" />
          <circle className="bulb-shine" cx="45.6" cy="67.6" r="1.6" />
          <circle className="bulb-shine" cx="77.6" cy="67.6" r="1.6" />
          <path className="bulb-line"
                d={mood === 'oops' ? 'M51 82 q2.25 -3 4.5 0 t4.5 0 t4.5 0 t4.5 0'
                  : mood === 'think' ? 'M54 82 H66' : 'M53 79 Q60 86 67 79'} />
        </>
      )}
      {mood === 'oops' ? <path className="bulb-sweat" d="M92 30 q-6 9 0 12 q6 -3 0 -12 Z" /> : null}
      {mood === 'think' ? (
        <>
          <circle className="bulb-dot" cx="100" cy="14" r="4" />
          <circle className="bulb-dot" cx="110" cy="6" r="2.6" />
        </>
      ) : null}
      {mood === 'streak' ? <path className="bulb-flame" d="M104 14 q9 10 6 18 q-2 7 -8 7 q-7 0 -9 -7 q-1 -6 4 -9 q0 4 3 5 q3 -5 4 -14 Z" /> : null}
    </svg>
  )
}

/** Bulb saying one short line, to its right. Lines are plain text, so they read in order. */
export function BulbSays({ mood, size = 64, children }: { mood?: Mood; size?: number; children: ReactNode }) {
  return (
    <div className="bulbsays">
      <Mascot mood={mood} size={size} />
      <p className="bulbsays-t">{children}</p>
    </div>
  )
}
