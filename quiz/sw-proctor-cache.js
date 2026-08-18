// ============================================================
// sw-proctor-cache.js
//
// Purpose: once a student has successfully downloaded the proctoring AI
// models (TensorFlow.js runtime + BlazeFace + COCO-SSD, ~6-8MB total) on
// this device, we never want them to pay that cost again on the same
// device — whether they retry after a failed/timed-out attempt, resume a
// saved quiz, or come back tomorrow for another test. This service worker
// intercepts requests to the CDN these models load from and serves them
// from the Cache Storage API after the first successful download.
//
// This is purely additive: if the service worker fails to register (older
// browser, blocked, etc.) everything still works exactly as before, just
// without the caching benefit.
// ============================================================

const CACHE_NAME = 'neelaxmi-proctor-models-v1';

// Only cache things that are safe to keep around long-term:
// 1. The jsdelivr CDN, in case you're still using it for anything else.
// 2. Your own /vendor/ folder — the self-hosted TF.js/Blazeface/COCO-SSD
//    library files (see netlify.toml for the matching long-term
//    Cache-Control header on the HTTP side; this is a second, belt-and-
//    braces layer in case that header is ever missing or a browser clears
//    its HTTP cache more aggressively than its Cache Storage).
const CACHEABLE_HOSTS = ['cdn.jsdelivr.net'];
const CACHEABLE_PATH_PREFIXES = ['/vendor/'];

self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((names) =>
            Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    let url;
    try {
        url = new URL(event.request.url);
    } catch (err) {
        return; // not a normal http(s) request — ignore
    }

    const isCacheableHost = CACHEABLE_HOSTS.includes(url.hostname);
    const isCacheablePath = CACHEABLE_PATH_PREFIXES.some((p) => url.pathname.startsWith(p));

    if (event.request.method !== 'GET' || (!isCacheableHost && !isCacheablePath)) {
        return; // let the browser handle everything else as usual
    }

    event.respondWith(
        caches.open(CACHE_NAME).then(async (cache) => {
            const cached = await cache.match(event.request);
            if (cached) return cached; // instant, no network at all

            try {
                const response = await fetch(event.request);
                // Only cache clean, successful responses.
                if (response && response.status === 200) {
                    cache.put(event.request, response.clone());
                }
                return response;
            } catch (err) {
                // Genuinely offline/blocked and nothing cached yet — let the
                // failure surface normally so the page's own timeout/error
                // handling can take over.
                throw err;
            }
        })
    );
});
