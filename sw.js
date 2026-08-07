/* زاحِم — عاملُ الخدمة
   التطبيق ملفٌ واحد، فالتخزين بسيط: نحفظ الصدفة والأيقونات، ونخدمها من المخزن أولًا.
   وكل إصدارٍ يمسح ما قبله، فلا تتراكم نسخٌ قديمة على جهاز المستخدم. */
const VERSION = 'zahim-v1';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSION)
      .then(c => c.addAll(SHELL).catch(() => c.add('./index.html')))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // الخطوط الخارجية تمرّ كما هي

  // التنقّل: الشبكة أولًا ليصل التحديث، والمخزن احتياطًا عند انقطاعها
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(r => { const c = r.clone(); caches.open(VERSION).then(x => x.put('./index.html', c)); return r; })
        .catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    );
    return;
  }
  // الأصول: المخزن أولًا
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(r => {
      if (r && r.status === 200) { const c = r.clone(); caches.open(VERSION).then(x => x.put(req, c)); }
      return r;
    }).catch(() => hit))
  );
});
