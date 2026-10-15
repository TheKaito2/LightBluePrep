/**
 * The install bar (G-04): after the 10th answer, one dismissible line under
 * the nav asking to add LightBluePrep to the device. An installed copy opens
 * like an app, and Safari does not wipe an installed site's storage after 7
 * days away, which is where signed-out progress lives.
 *
 * Chromium hands over a deferred install prompt (beforeinstallprompt), which
 * the Install button opens. iOS Safari has no prompt, so the bar says where
 * Add to Home Screen is. Anywhere else there is nothing to offer, and no bar.
 * Dismissing it, or answering the prompt, is remembered in store meta.
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import { Icon } from './Icon'
import * as store from '../lib/store'

/** Answers before the bar first shows: by then the site has earned the ask. */
const AFTER = 10

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/**
 * Caught at load, not when the bar mounts: Chromium fires the event once, often
 * before the first render. preventDefault keeps Chrome's own mini-infobar from
 * asking before the 10th answer; the address-bar install button stays.
 */
let deferred: InstallPromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => { for (const l of listeners) l() }
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferred = e as InstallPromptEvent
  notify()
})
window.addEventListener('appinstalled', () => { deferred = null; notify() })
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
const getDeferred = () => deferred

/** Already opened from the Home Screen or as an installed app. */
const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches
  || (navigator as { standalone?: boolean }).standalone === true

/**
 * Safari on an iPhone or iPad (iPadOS reports a Mac with touch). Not Chrome,
 * Firefox or Edge for iOS, and not an in-app browser (Instagram, TikTok),
 * which lack "Safari/" and have no Add to Home Screen to point at.
 */
function iosSafari(): boolean {
  const ua = navigator.userAgent
  const ios = /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
  return ios && /Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)
}

export function InstallBar({ answered }: { answered: number }) {
  const prompt = useSyncExternalStore(subscribe, getDeferred)
  // Unknown until meta answers, and hidden meanwhile: a bar that flashes in
  // and out for a student who dismissed it reads as a glitch.
  const [dismissed, setDismissed] = useState(true)
  useEffect(() => {
    let stale = false
    store.getMeta<boolean>(store.INSTALL_KEY)
      .then((v) => { if (!stale) setDismissed(v === true) })
      .catch(() => {})
    return () => { stale = true }
  }, [])

  const dismiss = () => {
    setDismissed(true)
    store.setMeta(store.INSTALL_KEY, true).catch(() => {})
  }
  const install = async () => {
    if (!prompt) return
    // A prompt can be shown once; whatever happens, this one is spent.
    deferred = null
    try {
      await prompt.prompt()
      await prompt.userChoice
    } finally {
      // Yes or no, the question was asked; the browser's own install button
      // is there if they change their mind.
      notify()
      dismiss()
    }
  }

  const ios = !prompt && iosSafari()
  if (dismissed || answered < AFTER || standalone() || (!prompt && !ios)) return null
  return (
    <div className="installbar" role="region" aria-label="Install LightBluePrep">
      <Icon name="download" size={18} />
      <p className="installbar-t">
        <strong>Install LightBluePrep:</strong> it opens like an app and keeps your progress safer.
        {ios ? (
          <span className="installbar-how">
            {' '}Open the Share menu <Icon name="share" size={16} className="installbar-ico" /> and
            choose Add to Home Screen.
          </span>
        ) : null}
      </p>
      {prompt ? (
        <button type="button" className="btn primary sm" onClick={() => { install().catch(() => {}) }}>
          Install
        </button>
      ) : null}
      <button type="button" className="btn quiet sm icon installbar-x" aria-label="Dismiss" onClick={dismiss}>
        <Icon name="close" size={16} />
      </button>
    </div>
  )
}
