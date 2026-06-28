// Digital DTH — offline app-shell service worker
// Goal: let the app OPEN and show the last-synced data (from localStorage)
// even with no internet connection. This only caches the page itself and
// the Supabase JS library script — it deliberately does NOT touch calls
// to the Supabase API/realtime endpoints, which should fail naturally
// offline (the app already handles that gracefully with its own
// online/offline checks and sync-status indicator).

const CACHE_NAME = 'digital-dth-shell-v1';
const CDN_SUPABASE = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
const SHELL_URLS = ['./', './index.html', CDN_SUPABASE];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) {
        return Promise.all(
          SHELL_URLS.map(function (url) {
            return cache.add(url).catch(function () { /* ignore individual failures */ });
          })
        );
      })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(
          keys.filter(function (k) { return k !== CACHE_NAME; })
              .map(function (k) { return caches.delete(k); })
        );
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  const req = event.request;

  // Never intercept non-GET requests (Supabase writes are POST/PATCH/DELETE) —
  // those must always go straight to the network, untouched.
  if (req.method !== 'GET') return;

  const isNavigation = req.mode === 'navigate';
  const isAppShellAsset = req.url === CDN_SUPABASE || req.url.endsWith('/index.html');

  // Anything else (Supabase REST/realtime calls, third-party requests we
  // don't recognize) — let the browser handle it completely normally.
  if (!isNavigation && !isAppShellAsset) return;

  event.respondWith(
    fetch(req)
      .then(function (networkResponse) {
        // Got a fresh copy — update the cache for next time, then return it.
        const copy = networkResponse.clone();
        caches.open(CACHE_NAME).then(function (cache) { cache.put(req, copy); });
        return networkResponse;
      })
      .catch(function () {
        // Offline (or request failed) — serve the cached version instead.
        return caches.match(req).then(function (cached) {
          if (cached) return cached;
          // Page navigation with nothing cached yet for this exact URL —
          // fall back to the cached index.html app shell.
          if (isNavigation) return caches.match('./index.html');
        });
      })
  );
});
