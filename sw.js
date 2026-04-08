const CACHE_NAME = 'mg-home-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg'
];

let sharedFile = null; // مخزن مؤقت لحفظ الملف القادم من الواتساب

self.addEventListener('install', (e) => {
  self.skipWaiting(); // تفعيل التحديثات فوراً
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (e) => {
  // 1. التقاط طلبات المشاركة القادمة من الواتساب والنظام
  if (e.request.method === 'POST' && e.request.url.includes('share-target')) {
    e.respondWith(
      (async () => {
        try {
          // استخراج الملف من الطلب
          const formData = await e.request.formData();
          const file = formData.get('shared_file');

          if (file) {
            sharedFile = file; // حفظ الملف في الذاكرة المؤقتة (الأمانات)
          }

          // إعادة التوجيه لفتح التطبيق (الصفحة الرئيسية)
          return Response.redirect('./', 303);
        } catch (error) {
          console.error('Share Target Error:', error);
          return Response.redirect('./', 303);
        }
      })()
    );
    return; // إنهاء التنفيذ هنا
  }

  // 2. الكود الأساسي: يخبر المتصفح أن التطبيق جاهز للعمل بدون إنترنت (الكاش)
  e.respondWith(
    fetch(e.request).catch(() => {
      return caches.match(e.request);
    })
  );
});

// 3. دالة التسليم: لما التطبيق يفتح (index.html) هيبعت رسالة يطلب فيها الملف
self.addEventListener('message', (event) => {
  if (event.data.type === 'CHECK_FOR_SHARED_FILE' && sharedFile) {
    // تسليم الملف للتطبيق ليعرضه في مربع المعاينة
    event.source.postMessage({ 
      type: 'FILE_SHARED_FROM_OS', 
      file: sharedFile 
    });
    sharedFile = null; // تفريغ المخزن بعد التسليم بنجاح
  }
});
