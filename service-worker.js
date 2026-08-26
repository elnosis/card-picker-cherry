// 상단 버전 수정 시 메인 화면 버전 배지도 자동으로 업데이트됩니다.
const APP_VERSION = 'v1.0.61';
const CACHE_NAME = `card-picker-cherry-${APP_VERSION}`;

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// HTML/문서: 네트워크 우선 (업데이트 반영), 그 외: 캐시 우선
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  const isHTML = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html') ||
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('/');

  if (isHTML) {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then((res) => res || caches.match('./index.html')))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((res) => res || fetch(req))
  );
});

async function scheduleAlerts(schedules) {
  if (!schedules || !schedules.length) return;
  const hasTrigger = typeof TimestampTrigger !== 'undefined';

  for (const s of schedules) {
    const tag = 'remaining-alert-' + s.id;
    const options = {
      body: s.body || '이 달의 남은 카드 혜택을 확인해 보세요.',
      tag: tag,
      renotify: true,
      data: { action: 'open-remaining-list' },
      icon: './icon-192.png',
      badge: './icon-192.png'
    };

    if (hasTrigger && s.timestamp && s.timestamp > Date.now()) {
      try {
        options.showTrigger = new TimestampTrigger(s.timestamp);
        await self.registration.showNotification('🍒 남은 혜택 알림', options);
      } catch (err) { /* ignore */ }
    }
  }
}

self.addEventListener('message', (e) => {
  if (!e.data) return;
  if (e.data.type === 'GET_VERSION') {
    if (e.ports && e.ports[0]) {
      e.ports[0].postMessage({ version: APP_VERSION });
    }
    return;
  }
  if (e.data.type === 'SCHEDULE_REMAINING_ALERTS') {
    e.waitUntil(scheduleAlerts(e.data.schedules || []));
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL('index.html', self.registration.scope);
  targetUrl.searchParams.set('open', 'remaining-list');

  event.waitUntil((async () => {
    const clientList = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    });
    for (const client of clientList) {
      try {
        if ('navigate' in client) await client.navigate(targetUrl.href);
        if ('focus' in client) await client.focus();
        client.postMessage({ type: 'OPEN_REMAINING_LIST' });
        return;
      } catch (err) { /* next */ }
    }
    if (self.clients.openWindow) {
      await self.clients.openWindow(targetUrl.href);
    }
  })());
});
