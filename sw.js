importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");

// تم تحديث رقم الإصدار لضمان تحديث الملفات لدى المستخدمين
const CACHE_NAME = 'mg-home-v4.2';

// تمت إضافة جميع ملفات التطبيق الأساسية والصوتية لتعمل بدون إنترنت
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon.svg',
  './notification-sound.wav',
  './sound-sent.mp4',
  './sound-received.mp3'
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
          sharedFile = file; // 1. حفظ الملف في جيب الحارس (الذاكرة)
        }

        // 2. إعادة توجيه صامتة لفتح التطبيق بدون أي إرسال عشوائي
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

// 3. لما التطبيق (index.html) يفتح، هيبعت يسأل عن الملف
self.addEventListener('message', (event) => {
  if (event.data.type === 'CHECK_FOR_SHARED_FILE') {
    if (sharedFile) {
      // 4. تسليم الملف للنافذة اللي سألت فقط! (التطبيق)
      event.source.postMessage({ type: 'FILE_SHARED_FROM_OS', file: sharedFile });
      sharedFile = null; // تفريغ الذاكرة بعد التسليم
    }
  }
});
