// LightBluePrep's service worker: what lets a reload with no network still open
// the app and the questions this browser already has (PF-14). Registered from
// src/main.tsx in production builds only.
//
// It handles same-origin GET requests and nothing else. College Board, Desmos,
// Google sign-in, the sync Worker and Cloudflare's analytics are other origins,
// and the local server's /api is not on the list below, so all of those go to
// the network exactly as if this file did not exist.
//
//   navigations   network first; offline, the cached app shell
//   /process-types.json  network first; offline, the last copy
//   /assets/*     cache first: Vite's hashed names never change
//   /mathjax/*    cache first: one folder per MathJax version
//   /fonts/*      cache first: the static pages' fonts
//
// Questions themselves live in IndexedDB (src/lib/store.ts), not here.
//
// Bump VERSION when a cached file can change under the same name (the
// /fonts/ copies); activate then deletes every older lbp- cache.
// ponytail: hashed files from past deploys stay in the cache until the next
// bump (a few hundred KB a deploy); prune by the shell's own list if it grows.
const VERSION = 1
const PREFIX = 'lbp-'
const CACHE = `${PREFIX}${VERSION}`
const ROOT = new URL(self.registration.scope).pathname
const CACHE_FIRST = ['assets/', 'mathjax/', 'fonts/'].map((dir) => ROOT + dir)
const TYPES = `${ROOT}process-types.json`

const cacheable = (url) => url.origin === self.location.origin
  && CACHE_FIRST.some((dir) => url.pathname.startsWith(dir))

self.addEventListener('install', (event) => {
  // The visit that registered this worker loaded its page before the worker
  // existed, so the shell is fetched once more here.
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(ROOT)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const stale = (await caches.keys()).filter((key) => key.startsWith(PREFIX) && key !== CACHE)
    await Promise.all(stale.map((key) => caches.delete(key)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (request.mode === 'navigate') {
    // Every app route is the root page (routes are hashes), with or without
    // a ?q= link, so one copy of it is the offline shell for all of them.
    event.respondWith(networkFirst(event, url.pathname === ROOT ? ROOT : null, ROOT))
  } else if (url.pathname === TYPES) {
    event.respondWith(networkFirst(event, TYPES, TYPES))
  } else if (cacheable(url)) {
    event.respondWith(cacheFirst(event, request))
  }
})

// The page's list of files it loaded before this worker controlled it.
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'cache' || !Array.isArray(event.data.urls)) return
  const urls = event.data.urls.filter((u) => {
    try {
      const url = new URL(u)
      return cacheable(url) || (url.origin === self.location.origin && url.pathname === TYPES)
    } catch { return false }
  })
  event.waitUntil(caches.open(CACHE).then((cache) => Promise.all(urls.map(async (u) => {
    if (await cache.match(u, { ignoreVary: true })) return
    // Most come straight from the HTTP cache. A failure only means that file
    // is not offline yet: the next request for it fills the gap.
    await cache.add(u).catch(() => {})
  }))))
})

/**
 * The network's answer, kept under `store` (null: not kept); with no network,
 * the copy kept under `fallback`.
 */
async function networkFirst(event, store, fallback) {
  const cache = await caches.open(CACHE)
  try {
    const response = await fetch(event.request)
    if (store && response.ok && !response.redirected) event.waitUntil(cache.put(store, response.clone()))
    return response
  } catch (error) {
    const copy = await cache.match(fallback, { ignoreVary: true })
    if (copy) return copy
    throw error
  }
}

async function cacheFirst(event, request) {
  const cache = await caches.open(CACHE)
  // ignoreVary: a file this worker fetched itself (no Origin header) must
  // still answer the page's crossorigin request for it, and a hashed name
  // never varies anyway.
  const hit = await cache.match(request, { ignoreVary: true })
  if (hit) return hit
  const response = await fetch(request)
  if (response.ok) event.waitUntil(cache.put(request, response.clone()))
  return response
}
