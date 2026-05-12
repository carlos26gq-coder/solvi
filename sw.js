// SOLVI SW v22
// Arquitectura Híbrida: Network-First para lógica/datos, Cache-First para recursos estáticos.

const CACHE = "solvi-v22";

const PRECACHE = [
    "/",
    "/static/app.js",
    "/static/icon-192.png",
    "/static/icon-512.png",
    "/data/all_manuals.json",
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"
];

self.addEventListener("install", e => {
    e.waitUntil(
        caches.open(CACHE).then(cache => {
            // Instalación resiliente: Un fallo de red no detiene el caché de los demás archivos
            return Promise.all(
                PRECACHE.map(url => {
                    return cache.add(url).catch(err => console.warn("SW: Omitido por red ->", url));
                })
            );
        }).then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", e => {
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => k !== CACHE).map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", e => {
    // 1. Reglas de Seguridad Base
    if (e.request.method !== "GET") return; // NUNCA interceptar POST/PUT/DELETE

    const url = new URL(e.request.url);

    // 2. Bypass Absoluto (Rutas estrictamente de nube)
    if (url.pathname.startsWith("/search") ||
        url.pathname.startsWith("/notes")  ||
        url.pathname.startsWith("/admin")  ||
        url.pathname.startsWith("/reset")  ||
        url.hostname.includes("r2.dev")    ||
        url.hostname.includes("supabase.co") ||
        url.pathname.endsWith(".pdf")) {
        return;
    }

    // 3. Estrategia A: NETWORK FIRST (Primero Internet, Fallback Caché)
    // Aplicado a: HTML, JS, JSON. Garantiza la última versión si hay red, offline seguro sin ella.
    if (e.request.mode === "navigate" || url.pathname === "/" || url.pathname.endsWith(".js") || url.pathname.endsWith(".json")) {
        e.respondWith(
            fetch(e.request)
                .then(res => {
                    if (res.ok) {
                        const clone = res.clone();
                        caches.open(CACHE).then(c => c.put(e.request, clone));
                    }
                    return res;
                })
                .catch(() => {
                    // IMPORTANTE: { ignoreSearch: true } es vital para no fallar por variables como ?v=123
                    return caches.match(e.request, { ignoreSearch: true }).then(cached => {
                        if (cached) return cached;
                        // Salvavidas final de navegación
                        if (e.request.mode === "navigate") return caches.match("/", { ignoreSearch: true });
                        // Salvavidas JSON
                        if (url.pathname.endsWith(".json")) return new Response("[]", { headers: { "Content-Type": "application/json" } });
                    });
                })
        );
        return;
    }

    // 4. Estrategia B: CACHE FIRST (Primero Caché, Fallback Internet)
    // Aplicado a: Íconos, imágenes, pdf.js (Archivos estáticos pesados)
    e.respondWith(
        caches.match(e.request, { ignoreSearch: true }).then(cached => {
            if (cached) return cached; // Respuesta instantánea (0ms)
            
            return fetch(e.request).then(res => {
                if (res && res.ok) {
                    const clone = res.clone();
                    caches.open(CACHE).then(c => c.put(e.request, clone));
                }
                return res;
            }).catch(() => {
                return new Response("Offline", { status: 503, statusText: "Offline" });
            });
        })
    );
});