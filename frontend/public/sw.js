const CACHE_NAME = 'gym-erp-cache-v1';

// Add key routes to cache
const urlsToCache = [
    '/',
    '/login',
    '/dashboard/admin/scanner',
    // Next.js static assets
    '/_next/static/chunks/main.js',
    '/_next/static/chunks/webpack.js',
    '/_next/static/css/styles.css',
    // Icons/Manifests if any
    '/favicon.ico'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Opened cache');
                return cache.addAll(urlsToCache);
            })
    );
});

self.addEventListener('fetch', (event) => {
    // Only cache GET requests
    if (event.request.method !== 'GET') return;

    // API requests: Network First, fall back to nothing (handled by app Logic)
    // Actually, app logic handles API failures. SW just ensures the App Shell loads.

    // For App Shell (HTML, JS, CSS) -> Stale While Revalidate or Cache First
    // Let's use simple Cache First for static assets, Network First for navigation

    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // Cache hit - return response
                if (response) {
                    return response;
                }
                return fetch(event.request);
            })
    );
});
