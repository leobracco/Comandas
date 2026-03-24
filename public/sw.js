// Un Service Worker básico para cumplir los requisitos de instalación PWA en Android.
// Como el sistema es en tiempo real (WebSockets), evitamos cachear peticiones 
// para que la cocina y el POS siempre tengan los datos vivos.

self.addEventListener('install', (e) => {
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(clients.claim());
});

self.addEventListener('fetch', (e) => {
    // No hacemos nada con el fetch, dejamos que todo pase directo al servidor
});