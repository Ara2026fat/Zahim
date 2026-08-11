/* زاحِم — عاملُ الخدمة
   بسيط: نحفظ الصدفة والأيقونات، ونخدمها من المخزن أولًا.
   وعند تغيّر النسخة يُمسح ما قبله، فلا تتراكم نسخٌ قديمة على جهاز المستخدم.

   ملحوظة: ارفع الرقم في VERSION مع كلّ تحديثٍ تريد أن يصل كلَّ جهاز نظيفًا. */
const VERSION = 'zahim-v2';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

/* مخزنٌ منفصل لخطوط المصحف وصفحاته — لا يُمسح مع تحديث التطبيق،
   فما نزّله القارئ مرّةً يبقى معه ولا يُطلب ثانية. */
const QURAN_CACHE = 'zahim-quran-v1';
const QURAN_HOSTS = ['cdn.jsdelivr.net', 'raw.githubusercontent.com'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSION)
      .then(c => c.addAll(SHELL).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== VERSION && k !== QURAN_CACHE)
            .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (err) { return; }

  /* ═══ خطوط المصحف وصفحاته ═══
     المخزنُ أولًا: ما نُزّل مرّةً يُقرأ بلا شبكة إلى الأبد.
     وما لم يُنزَّل بعد يُجلب ويُحفظ. */
  if (QURAN_HOSTS.indexOf(url.hostname) !== -1) {
    e.respondWith(
      caches.open(QURAN_CACHE).then(c =>
        c.match(req).then(hit => {
          if (hit) return hit;
          return fetch(req).then(r => {
            if (r && r.status === 200 && r.type !== 'opaque') {
              c.put(req, r.clone()).catch(() => {});
            }
            return r;
          });
        })
      ).catch(() => fetch(req))
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  /* ═══ فتحُ التطبيق ═══
     الشبكةُ أولًا ليصل التحديث، والمخزنُ احتياطًا عند انقطاعها. */
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(r => {
          const c = r.clone();
          caches.open(VERSION).then(cache => cache.put('./index.html', c)).catch(() => {});
          return r;
        })
        .catch(() => caches.match('./index.html').then(hit => hit || caches.match('./')))
    );
    return;
  }

  /* ═══ الأصول ═══ المخزنُ أولًا، ثم الشبكة. */
  e.respondWith(
    caches.match(req).then(hit =>
      hit || fetch(req).then(r => {
        if (r && r.status === 200) {
          const c = r.clone();
          caches.open(VERSION).then(cache => cache.put(req, c)).catch(() => {});
        }
        return r;
      }).catch(() => hit)
    )
  );
});

/* رسالةٌ من الصفحة تطلب تفعيل النسخة الجديدة فورًا */
self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
