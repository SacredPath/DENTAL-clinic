// DentaFlow Service Worker
// Caching strategy:
//   Supabase API calls  -> network only (never cache patient data)
//   CDN scripts         -> cache first, then network
//   App HTML            -> network first, fallback to cache
// Bump CACHE_VERSION when you deploy a new version of the app.

var CACHE_VERSION = 'v2';
var CACHE     = 'dentaflow-app-' + CACHE_VERSION;
var CDN_CACHE = 'dentaflow-cdn-' + CACHE_VERSION;

// ── Install ──────────────────────────────────────────────────
self.addEventListener('install', function(e) {
  self.skipWaiting(); // activate immediately
  e.waitUntil(
    caches.open(CACHE).then(function(c) {
      // Pre-cache the app shell — fails silently if offline at install time
      return c.add('/').catch(function() {});
    })
  );
});

// ── Activate ─────────────────────────────────────────────────
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys
          .filter(function(k) { return k !== CACHE && k !== CDN_CACHE; })
          .map(function(k) { return caches.delete(k); })
      );
    }).then(function() {
      return self.clients.claim(); // take control immediately
    })
  );
});

// ── Fetch ─────────────────────────────────────────────────────
self.addEventListener('fetch', function(e) {
  var url = e.request.url;

  // 1. Supabase: always network, never cache patient data
  if (url.includes('supabase.co')) {
    return; // let browser handle it normally
  }

  // 2. CDN assets (Chart.js etc): cache-first
  if (url.includes('cdn.jsdelivr.net')) {
    e.respondWith(
      caches.open(CDN_CACHE).then(function(cache) {
        return cache.match(e.request).then(function(cached) {
          if (cached) return cached;
          return fetch(e.request).then(function(res) {
            if (res && res.ok) cache.put(e.request, res.clone());
            return res;
          });
        });
      })
    );
    return;
  }

  // 3. Navigation requests (app HTML): network-first, cache fallback
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(function(res) {
          // Update cache with latest version from network
          if (res && res.ok) {
            var clone = res.clone();
            caches.open(CACHE).then(function(c) { c.put(e.request, clone); });
          }
          return res;
        })
        .catch(function() {
          // Offline: serve from cache
          return caches.match(e.request).then(function(cached) {
            return cached || caches.match('/');
          });
        })
    );
    return;
  }
});

// ── Messages ──────────────────────────────────────────────────
self.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
