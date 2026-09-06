/* ═══════════════════════════════════════════════════════════════
   زاحِم — عاملُ الخدمة
   ═══════════════════════════════════════════════════════════════
   قاعدةُ التحديث
   ───────────────────────────────────────────────────────────────
   صفحاتُ التصفّح تُطلب من الشبكة أوّلًا، والذاكرةُ احتياطٌ عند
   الانقطاع — فلا تعلق على نسخةٍ قديمةٍ ولو نسيتَ رفعَ الرقم.

   ومع ذلك: **غيّر التاريخَ في السطر التالي مع كلّ نشرة.**
   رقمٌ واحدٌ يُبطل القديمَ كلَّه ويُنظّف مخازنَه.

   وخطوطُ المصحف في مخزنٍ اسمُه ثابتٌ لا يتبدّل مع الإصدارات،
   فرفعُ الرقم لا يُسقطها ولا يُعيد تنزيلَ ميغاباتٍ بلا حاجة.
   ═══════════════════════════════════════════════════════════════ */

const VERSION = 'zahim-2026-09-06';        // ← ارفعه مع كلّ نشرة
const SHELL   = VERSION + '-shell';
const RUNTIME = VERSION + '-runtime';

/* مخزنُ المصحف والخطوط: اسمُه ثابتٌ عمدًا فلا يُمحى مع تبديل
   الإصدار. ارفع رقمَه وحدَه إن تبدّل مصدرُ الخطوط أو الرسم. */
const QURAN = 'zahim-quran-v1';

/* ما يبقى بعد التفعيل — وما سواه يُمحى */
const KEEP = [SHELL, RUNTIME, QURAN];

/* ما يُحفظ عند التثبيت. أبقِ القائمة قصيرة: كلُّ إخفاقٍ هنا
   يُفشل التثبيت كلَّه. */
const SHELL_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

/* ═══ التثبيت ═══ */
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    /* addAll يسقط كلُّه بسقوط واحد، فنضيف كلًّا على حدة */
    await Promise.all(SHELL_URLS.map(u =>
      cache.add(new Request(u, { cache: 'reload' })).catch(() => {})
    ));
    /* لا ننتظر إغلاق كلّ الألسنة: النسخةُ الجديدة تحلّ فورًا */
    await self.skipWaiting();
  })());
});

/* ═══ التفعيل: تُمحى مخازنُ الإصدارات السابقة، ويبقى المصحف ═══ */
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(k => !KEEP.includes(k)).map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

/* ═══ الجلب ═══ */
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  /* ١. صفحاتُ التصفّح: الشبكةُ أوّلًا.
        وهذا هو الفرقُ الحاسم — لو كانت الذاكرةُ أوّلًا لبقيت على
        القديم حتى بعد تغيير الإصدار. */
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(SHELL);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch (e) {
        return (await caches.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  /* ٢. المصحفُ وخطوطُه: الذاكرةُ أوّلًا. لا تتبدّل، وحجمُها كبير.
        ومخزنُها مستقلٌّ عن الإصدار فتنجو من كلّ نشرة. */
  const isQuran =
    url.hostname.includes('githubusercontent.com') ||
    url.hostname.includes('jsdelivr.net') ||
    url.hostname.includes('fonts.gstatic.com');

  if (isQuran) {
    event.respondWith((async () => {
      const hit = await caches.match(req, { cacheName: QURAN });
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res && res.status === 200) {
          const cache = await caches.open(QURAN);
          cache.put(req, res.clone());
        }
        return res;
      } catch (e) {
        /* قد تكون محفوظةً في مخزنٍ قديمٍ قبل هذا التقسيم */
        return (await caches.match(req)) || Response.error();
      }
    })());
    return;
  }

  /* ٣. ما بقي من أصولنا: الذاكرةُ أوّلًا مع تحديثٍ صامتٍ في الخلفيّة،
        فيُعرض السريعُ ويُحدَّث للمرّة القادمة. */
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const hit = await caches.match(req);
      const net = fetch(req).then(res => {
        if (res && res.status === 200) {
          caches.open(RUNTIME).then(c => c.put(req, res.clone()));
        }
        return res;
      }).catch(() => hit || Response.error());
      return hit || net;
    })());
  }
});

/* ═══ للطوارئ: تفريغُ كلّ المخازن من وحدة التحكّم ═══
     navigator.serviceWorker.controller.postMessage('zahim-purge');   */
self.addEventListener('message', event => {
  if (event.data === 'zahim-purge') {
    event.waitUntil(
      caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
    );
  }
});
