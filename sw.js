self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  // 1. التقاط طلبات المشاركة القادمة من نظام الهاتف (Share Target)
  if (e.request.method === 'POST' && e.request.url.endsWith('share-target')) {
    e.respondWith(
      (async () => {
        try {
          // استخراج الملف من الطلب
          const formData = await e.request.formData();
          const file = formData.get('shared_file');

          // البحث عن صفحات التطبيق المفتوحة حالياً وإرسال الملف إليها
          const clients = await self.clients.matchAll();
          for (const client of clients) {
            client.postMessage({
              type: 'FILE_SHARED_FROM_OS',
              file: file
            });
          }

          // إعادة التوجيه إلى الصفحة الرئيسية للتطبيق (متوافق مع GitHub Pages)
          return Response.redirect('./', 303);
        } catch (error) {
          console.error('Share Target Error:', error);
          return Response.redirect('./', 303);
        }
      })()
    );
    return; // إنهاء التنفيذ هنا حتى لا يكمل الكود للأسفل
  }

  // 2. الكود الأصلي الخاص بك: يخبر المتصفح أن التطبيق جاهز للعمل بدون إنترنت
  e.respondWith(
    fetch(e.request).catch(() => {
      return caches.match(e.request);
    })
  );
});
