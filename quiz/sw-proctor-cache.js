const CACHE_NAME = 'neelaxmi-proctor-models-v1';

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
                if (response && response.status === 200) {
                    cache.put(event.request, response.clone());
                }
                return response;
            } catch (err) {
                throw err;
            }
        })
    );
});
