const CACHE_NAME = 'mg-home-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg'
];

let sharedFile = null;

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (e) => {
  if (e.request.method === 'POST' && e.request.url.includes('share-target')) {
    e.respondWith((async () => {
      try {
        const formData = await e.request.formData();
        const file = formData.get('shared_file');

        if (file) {
          sharedFile = file;
          
          // 1. إرسال رسالة فورية لجميع النوافذ المفتوحة (عشان لو التطبيق مفتوح أصلاً)
          const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
          let appClient = null;

          for (const client of clients) {
            // نحاول نلاقي النافذة اللي شغالة كـ "تطبيق مستقل" (أفضلية)
            if ('focused' in client) {
               appClient = client;
               break; 
            }
          }

          if (appClient) {
              appClient.focus(); // إجبار الموبايل يعرض نافذة التطبيق
              appClient.postMessage({ type: 'FILE_SHARED_FROM_OS', file: sharedFile });
              sharedFile = null;
          }
        }

        // 2. إعادة توجيه (عشان لو مفيش ولا نافذة مفتوحة، تفتح من جديد)
        return Response.redirect('./', 303);
      } catch (error) {
        console.error('Share Error:', error);
        return Response.redirect('./', 303);
      }
    })());
    return;
  }

  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});

// 3. لو التطبيق فتح جديد (بعد الـ Redirect) بيسأل على الملف
self.addEventListener('message', (event) => {
  if (event.data.type === 'CHECK_FOR_SHARED_FILE' && sharedFile) {
    event.source.postMessage({ type: 'FILE_SHARED_FROM_OS', file: sharedFile });
    sharedFile = null;
  }
});
