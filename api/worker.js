/* زاحِم — الخدمة الخلفية
   ١) POST /api/ping       {id, v}                  → عدٌّ مجهول للأجهزة
   ٢) GET  /api/stats      (ترويسة x-stats-key)      → أرقامٌ لك وحدك
   ٣) POST /api/subscribe  {id, sub, times}         → اشتراكُ إشعارات الصلاة (اختياريّ)
   ٤) POST /api/unsubscribe {id}
   ٥) GET  /api/next?id=   → اسمُ الصلاة التي حان وقتُها (يقرؤه عاملُ الخدمة عند وصول الإشعار)
   ٦) scheduled (كلَّ دقيقة) → يوقظ الأجهزةَ عند مواعيد الصلاة.
   الأسرار: جدولُ cfg في D1 (STATS_KEY ، VAPID_*). يمكن تجاوزُها بمتغيّراتِ بيئةٍ بالاسم نفسه. */

const ORIGINS = ['https://zahim.app', 'https://www.zahim.app'];
const PRAYER_AR = { fajr:'الفجر', dhuhr:'الظهر', asr:'العصر', maghrib:'المغرب', isha:'العشاء' };
const RIYADH = 3 * 3600 * 1000;

const day = (ms = Date.now()) => new Date(ms + RIYADH).toISOString().slice(0, 10);
const cors = (req) => {
  const o = req.headers.get('Origin');
  return {
    'Access-Control-Allow-Origin': ORIGINS.includes(o) ? o : ORIGINS[0],
    'Access-Control-Allow-Headers': 'content-type,x-stats-key',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Vary': 'Origin'
  };
};
const json = (req, data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...cors(req) } });
const okId = (s) => typeof s === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(s);

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
    try {
      if (url.pathname === '/api/ping' && req.method === 'POST') {
        const b = await req.json().catch(() => ({}));
        if (!okId(b.id)) return json(req, { ok: false }, 400);
        const d = day(), ver = String(b.v || '').slice(0, 40), country = req.cf?.country || null;
        await env.DB.prepare(
          `INSERT INTO devices(id,first_day,last_day,ver,country) VALUES(?1,?2,?2,?3,?4)
           ON CONFLICT(id) DO UPDATE SET last_day=?2, ver=?3, country=COALESCE(?4,country)`
        ).bind(b.id, d, ver, country).run();
        return json(req, { ok: true });
      }

      if (url.pathname === '/api/stats' && req.method === 'GET') {
        const sk = await cfgGet(env, 'STATS_KEY');
        if (!sk || req.headers.get('x-stats-key') !== sk) return json(req, { ok: false }, 401);
        const d = day(), d7 = day(Date.now() - 6 * 864e5), d30 = day(Date.now() - 29 * 864e5);
        const q = (sql, ...a) => env.DB.prepare(sql).bind(...a).first();
        const [total, today, w, m, subs] = await Promise.all([
          q('SELECT COUNT(*) n FROM devices'),
          q('SELECT COUNT(*) n FROM devices WHERE last_day=?1', d),
          q('SELECT COUNT(*) n FROM devices WHERE last_day>=?1', d7),
          q('SELECT COUNT(*) n FROM devices WHERE last_day>=?1', d30),
          q('SELECT COUNT(*) n FROM subs')
        ]);
        const byCountry = (await env.DB.prepare(
          'SELECT country c, COUNT(*) n FROM devices WHERE last_day>=?1 GROUP BY country ORDER BY n DESC LIMIT 10'
        ).bind(d30).all()).results;
        const byVer = (await env.DB.prepare(
          'SELECT ver v, COUNT(*) n FROM devices WHERE last_day>=?1 GROUP BY ver ORDER BY n DESC LIMIT 6'
        ).bind(d30).all()).results;
        return json(req, { everInstalled: total.n, activeToday: today.n, active7d: w.n, active30d: m.n,
                           notificationDevices: subs.n, byCountry, byVersion: byVer });
      }

      if (url.pathname === '/api/vapid' && req.method === 'GET') {
        const { pub } = await ensureVapid(env);          // المفتاحُ العامّ فقط
        return json(req, { ok: true, key: pub });
      }

      if (url.pathname === '/api/subscribe' && req.method === 'POST') {
        const b = await req.json().catch(() => ({}));
        if (!okId(b.id) || !b.sub?.endpoint || !/^https:\/\//.test(b.sub.endpoint) || !Array.isArray(b.times))
          return json(req, { ok: false }, 400);
        const now = Date.now();
        const times = b.times
          .filter(t => Array.isArray(t) && Number.isFinite(t[0]) && PRAYER_AR[t[1]] && t[0] > now - 3600e3 && t[0] < now + 9 * 864e5)
          .slice(0, 60);
        await env.DB.prepare(
          `INSERT INTO subs(id,endpoint,times,sent_to) VALUES(?1,?2,?3,?4)
           ON CONFLICT(id) DO UPDATE SET endpoint=?2, times=?3`
        ).bind(b.id, b.sub.endpoint, JSON.stringify(times), now).run();
        return json(req, { ok: true, n: times.length });
      }

      if (url.pathname === '/api/unsubscribe' && req.method === 'POST') {
        const b = await req.json().catch(() => ({}));
        if (!okId(b.id)) return json(req, { ok: false }, 400);
        await env.DB.prepare('DELETE FROM subs WHERE id=?1').bind(b.id).run();
        return json(req, { ok: true });
      }

      if (url.pathname === '/api/next' && req.method === 'GET') {
        const id = url.searchParams.get('id');
        if (!okId(id)) return json(req, { ok: false }, 400);
        const r = await env.DB.prepare('SELECT times FROM subs WHERE id=?1').bind(id).first();
        if (!r) return json(req, { ok: false });
        const now = Date.now();
        const list = JSON.parse(r.times);
        let best = null;                       // أقربُ موعدٍ مضى خلال ١٥ دقيقة
        for (const [t, k] of list) if (t <= now && now - t < 15 * 60e3) best = [t, k];
        return json(req, best ? { ok: true, key: best[1], name: PRAYER_AR[best[1]], at: best[0] } : { ok: false });
      }
      return json(req, { ok: false }, 404);
    } catch (e) {
      return json(req, { ok: false, error: 'server' }, 500);
    }
  },

  async scheduled(_evt, env, ctx) { ctx.waitUntil(sendDue(env)); }
};

/* ── الأسرارُ في D1 (جدول cfg) فلا حاجةَ لأسرارِ لوحة التحكّم ──
   الجدولُ لا يُقرأ إلا من حسابك أنت أو من هذا العامل؛ والمفتاحُ الخاصّ لا يخرج في أيِّ استجابة. */
async function cfgGet(env, k) {
  if (env[k]) return env[k];
  const r = await env.DB.prepare('SELECT v FROM cfg WHERE k=?1').bind(k).first();
  return r ? r.v : null;
}
async function ensureVapid(env) {
  let pub = await cfgGet(env, 'VAPID_PUBLIC'), priv = await cfgGet(env, 'VAPID_PRIVATE_JWK');
  if (pub && priv) return { pub, priv };
  const k = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  priv = JSON.stringify(await crypto.subtle.exportKey('jwk', k.privateKey));
  pub = b64u(await crypto.subtle.exportKey('raw', k.publicKey));
  // INSERT OR IGNORE: إن سبقه طلبٌ آخر نقرأ ما كُتب أوّلًا فلا يختلف المفتاحان
  await env.DB.prepare('INSERT OR IGNORE INTO cfg(k,v) VALUES(?1,?2),(?3,?4)')
    .bind('VAPID_PUBLIC', pub, 'VAPID_PRIVATE_JWK', priv).run();
  return { pub: await cfgGet(env, 'VAPID_PUBLIC'), priv: await cfgGet(env, 'VAPID_PRIVATE_JWK') };
}

/* ── الإرسال ── */
async function sendDue(env) {
  const now = Date.now();
  const { pub, priv } = await ensureVapid(env);
  env = { ...env, VAPID_PUBLIC: pub, VAPID_PRIVATE_JWK: priv };
  const rows = (await env.DB.prepare('SELECT id,endpoint,times,sent_to FROM subs').all()).results;
  const key = await crypto.subtle.importKey('jwk', JSON.parse(env.VAPID_PRIVATE_JWK),
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const jwtCache = new Map();
  for (const r of rows) {
    const list = JSON.parse(r.times);
    // الموعدُ المستحقّ: مضى ولم يمضِ عليه أكثر من ١٠ دقائق، ولم يُرسَل بعد
    const due = list.find(([t]) => t <= now && now - t < 10 * 60e3 && t > r.sent_to);
    if (!due) continue;
    const aud = new URL(r.endpoint).origin;
    let jwt = jwtCache.get(aud);
    if (!jwt) { jwt = await vapidJwt(key, aud, env.VAPID_SUBJECT); jwtCache.set(aud, jwt); }
    const res = await fetch(r.endpoint, {
      method: 'POST',
      headers: { TTL: '600', Urgency: 'high', Topic: 'zahim-prayer',
                 Authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC}`, 'Content-Length': '0' }
    }).catch(() => null);
    if (res && (res.status === 404 || res.status === 410)) {
      await env.DB.prepare('DELETE FROM subs WHERE id=?1').bind(r.id).run();   // انتهى الاشتراك
    } else if (res && res.ok) {
      await env.DB.prepare('UPDATE subs SET sent_to=?2 WHERE id=?1').bind(r.id, due[0]).run();
    }
  }
}

function b64u(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const enc = (o) => b64u(new TextEncoder().encode(JSON.stringify(o)));

async function vapidJwt(key, aud, sub) {
  const head = enc({ typ: 'JWT', alg: 'ES256' });
  const body = enc({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub });
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key,
    new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${b64u(sig)}`;
}
