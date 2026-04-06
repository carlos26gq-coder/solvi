// ⚡ Interlocks SW v14
// CAMBIO CLAVE: app.js NUNCA se cachea — siempre se pide fresco al servidor.
// Esto elimina el problema de ver versiones viejas en todos los dispositivos.

const CACHE_NAME = "interlocks-v14";

// Solo cacheamos assets que NO cambian con cada deploy
const STATIC_ASSETS = [
    "/",
    "/manifest.json",
    "/static/icon-192.png",
    "/static/icon-512.png",
    "/data/all_manuals.json"
    // ❌ NO incluir /static/app.js — se pide siempre fresco
];

self.addEventListener("message", event => {
    if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

// INSTALL
self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting())
    );
});

// ACTIVATE
self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

// FETCH
self.addEventListener("fetch", event => {
    const url = new URL(event.request.url);

    // Nunca interceptar: API, admin, reset, recursos externos
    if (url.pathname.startsWith("/search") ||
        url.pathname.startsWith("/notes")  ||
        url.pathname.startsWith("/admin")  ||
        url.pathname.startsWith("/reset")  ||
        url.origin !== self.location.origin) {
        return;
    }

    // app.js → siempre red primero, cache como fallback offline
    if (url.pathname === "/static/app.js") {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    // Guardar copia fresca en caché
                    if (response.ok) {
                        caches.open(CACHE_NAME)
                            .then(c => c.put(event.request, response.clone()));
                    }
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // Navegación HTML → red primero, luego caché
    if (event.request.mode === "navigate") {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    if (response.ok) {
                        caches.open(CACHE_NAME)
                            .then(c => c.put(event.request, response.clone()));
                    }
                    return response;
                })
                .catch(() => caches.match("/"))
        );
        return;
    }

    // Resto de assets: caché primero, luego red
    event.respondWith(
        caches.match(event.request).then(cached => {
            if (cached) return cached;
            return fetch(event.request).then(response => {
                if (response?.ok && response.type === "basic") {
                    caches.open(CACHE_NAME)
                        .then(c => c.put(event.request, response.clone()));
                }
                return response;
            }).catch(() => caches.match("/"));
        })
    );
});
