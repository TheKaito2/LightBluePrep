/**
 * The site's own Desmos API key, apart from components/Desmos.tsx so App can
 * decide which Calculator button to draw without loading the calculator's
 * chunk. See Desmos.tsx for why the key may be empty.
 */
export const DESMOS_KEY = (import.meta.env.VITE_DESMOS_KEY as string | undefined) || ''
export const DESMOS_EMBEDDED = Boolean(DESMOS_KEY)
