const CACHE_NAME = 'marketday-v1'
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
]

// Install — cache shell
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

// Activate — clean old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// Fetch — cache-first for static, network-first for API
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)

  // Skip non-GET and API calls
  if (e.request.method !== 'GET') return
  if (url.pathname.startsWith('/api/')) return

  // For navigation requests, try network first then cache
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match('/'))
    )
    return
  }

  // Static assets: cache-first
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached
      return fetch(e.request).then(response => {
        if (response.ok && response.type === 'basic') {
          const clone = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone))
        }
        return response
      })
    }).catch(() => caches.match('/'))
  )
})
