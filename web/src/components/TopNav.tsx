/**
 * The bar over every page but practice, which renders its own Bluebook header.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { AccountBadge } from './Account'
import { GithubLink } from './Github'
import { Icon } from './Icon'
import { Mark } from './Mark'
import { SupportLink } from './Support'
import { prefetchPage } from '../lib/pages'
import type { View } from '../lib/route'

const NAV = [
  { key: 'home', label: 'Practice', icon: 'grid' },
  { key: 'plan', label: 'Plan', icon: 'calendar' },
  { key: 'review', label: 'Review', icon: 'history' },
  { key: 'stats', label: 'Stats', icon: 'chart' },
  { key: 'resources', label: 'Resources', icon: 'compass' },
  { key: 'about', label: 'About', icon: 'info' },
] as const

/** Moves focus to an in-page target without letting the hash reach the router. */
export function SkipLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <a className="skiplink" href={`#${to}`}
       onClick={(event) => { event.preventDefault(); document.getElementById(to)?.focus() }}>
      {children}
    </a>
  )
}

export function TopNav({ view, navigate }: { view: View; navigate: (next: View) => void }) {
  /**
   * The nav takes a hairline shadow once the page under it has scrolled. On a
   * desktop #main scrolls, or Home's own .home inside it, and scroll does not
   * bubble, hence the capture listener. On a phone the document scrolls
   * instead (base.css), which the window hears.
   */
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const main = document.getElementById('main')
    if (!main) return
    const read = (el: Element | null) => (el?.scrollTop ?? 0) > 0
    const onScroll = (e: Event) => {
      const el = e.target as Element
      if (el === main || el.classList.contains('home')) setScrolled(read(el))
    }
    const onWindow = () => setScrolled(window.scrollY > 0)
    main.addEventListener('scroll', onScroll, { capture: true, passive: true })
    window.addEventListener('scroll', onWindow, { passive: true })
    // oxlint-disable-next-line react/set-state-in-effect -- the first read of the scroll position, which only the DOM knows
    setScrolled(window.scrollY > 0 || read(main) || read(main.querySelector('.home')))
    return () => {
      main.removeEventListener('scroll', onScroll, { capture: true })
      window.removeEventListener('scroll', onWindow)
    }
  }, [view])

  // Results is the end of a set, read back from Review, so Review stays lit.
  const current = view === 'results' ? 'review' : view
  return (
    <nav className={scrolled ? 'tabs scrolled' : 'tabs'} aria-label="Main">
      <div className="tabs-inner">
        <button className="brand" onClick={() => navigate('home')} aria-label="LightBluePrep home">
          <Mark size={28} />
          <span className="wordmark">Light<span className="wordmark-blue">Blue</span>Prep</span>
        </button>
        <div className="tablinks">
          {NAV.map((t) => (
            <button key={t.key}
                    className={`tab tab-${t.key}${current === t.key ? ' on' : ''}`}
                    title={t.label} aria-label={t.label}
                    aria-current={current === t.key ? 'page' : undefined}
                    onPointerEnter={() => prefetchPage(t.key)}
                    onFocus={() => prefetchPage(t.key)}
                    onClick={() => navigate(t.key)}>
              <span className="tab-ico"><Icon name={t.icon} size={18} strokeWidth={2} /></span>
              <span className="tab-label">{t.label}</span>
            </button>
          ))}
        </div>
        {/*
          In the nav rather than in a page corner, so every page shows them
          from one instance. The practice view renders its own header and
          deliberately does not get them.
        */}
        <div className="navright">
          <button className="navicon" onClick={() => navigate('settings')}
                  aria-label="Settings" title="Settings"
                  aria-current={view === 'settings' ? 'page' : undefined}
                  onPointerEnter={() => prefetchPage('settings')}
                  onFocus={() => prefetchPage('settings')}>
            <Icon name="gear" size={20} strokeWidth={2} />
            <span className="navicon-t">Settings</span>
          </button>
          <GithubLink />
          <SupportLink />
          <AccountBadge />
        </div>
      </div>
    </nav>
  )
}
