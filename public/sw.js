// ============================================================
// Service Worker - DeliveryHub PWA
// ============================================================

const CACHE_NAME = 'deliveryhub-v1';
const STATIC_ASSETS = [
    '/',
    '/store',
    '/login',
    '/admin',
    '/manifest.json',
    '/icon-192.png',
    '/icon-512.png'
];

// Install - Cache recursos estaticos
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting())
    );
});

// Activate - Limpar caches antigos
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

// Fetch - Network first, fallback to cache
self.addEventListener('fetch', event => {
    // Ignorar requisicoes para API
    if (event.request.url.includes('/api/')) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then(response => {
                // Cachear resposta valida
                if (response.status === 200) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME)
                        .then(cache => cache.put(event.request, responseClone));
                }
                return response;
            })
            .catch(() => {
                // Fallback para cache
                return caches.match(event.request);
            })
    );
});

// Push Notifications
self.addEventListener('push', event => {
    if (!event.data) return;

    try {
        const data = event.data.json();

        const options = {
            body: data.body,
            icon: data.icon || '/icon-192.png',
            badge: '/icon-192.png',
            vibrate: [200, 100, 200],
            data: {
                url: data.url || '/'
            },
            actions: [
                { action: 'open', title: 'Abrir' },
                { action: 'close', title: 'Fechar' }
            ]
        };

        event.waitUntil(
            self.registration.showNotification(data.title, options)
        );
    } catch (e) {
        console.error('Push event error:', e);
    }
});

// Notification click
self.addEventListener('notificationclick', event => {
    event.notification.close();

    if (event.action === 'close') return;

    const url = event.notification.data?.url || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(windowClients => {
                // Focar janela existente ou abrir nova
                for (const client of windowClients) {
                    if (client.url.includes(self.location.origin) && 'focus' in client) {
                        client.navigate(url);
                        return client.focus();
                    }
                }
                return clients.openWindow(url);
            })
    );
});

// Background Sync (para pedidos offline)
self.addEventListener('sync', event => {
    if (event.tag === 'sync-orders') {
        event.waitUntil(syncOrders());
    }
});

async function syncOrders() {
    // Implementar sincronizacao de pedidos offline
    console.log('Syncing offline orders...');
}
