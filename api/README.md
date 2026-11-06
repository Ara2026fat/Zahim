# زاحِم — الخدمة الخلفية (العدّ المجهول + إشعارات الصلاة)

**معطَّلة حتى تُنشر.** التطبيق لا يرسل ولا يطلب شيئًا ما دام `window.ZAHIM_CLOUD.api` فارغًا.

## النشر (مرّةً واحدة)
```bash
cd api
npx wrangler d1 create zahim-db            # انسخ database_id إلى wrangler.jsonc
npx wrangler d1 execute zahim-db --remote --file=schema.sql
node vapid-keys.mjs                        # يطبع المفتاحين
npx wrangler secret put VAPID_PRIVATE_JWK  # الصق قيمة VAPID_PRIVATE_JWK
npx wrangler secret put VAPID_PUBLIC       # الصق قيمة VAPID_PUBLIC
npx wrangler secret put STATS_KEY          # كلمة سرٍّ طويلة تختارها أنت
npx wrangler deploy
```
ثم في `index.html` اضبط قبل وسم `</body>`:
`window.ZAHIM_CLOUD = { api: 'https://zahim-api.<حسابك>.workers.dev', vapid: '<VAPID_PUBLIC>' }`
(والأفضل ربطها بنطاقٍ فرعيّ `api.zahim.app` ثم تعديل `ORIGINS` في worker.js إن لزم).

## الأرقام
```bash
curl -H "x-stats-key: <STATS_KEY>" https://<عنوان-الخدمة>/api/stats
```
تعطي: الأجهزة التي استُعمل فيها التطبيق (اليوم / ٧ أيام / ٣٠ يومًا)، والدول، والإصدارات، وعدد من فعّل الإشعارات.

## الخصوصيّة
- العدّ: رقمٌ عشوائيّ يولَّد على الجهاز + تاريخ آخر استعمال + نسخة التطبيق + رمز الدولة (من Cloudflare). لا اسم ولا بريد ولا جوال ولا موقع.
- الإشعارات: اختياريّة بموافقة صريحة، تُرسل للصلوات الخمس فقط، وتُحذف بيانات الاشتراك عند إلغائه.
- مسح بيانات المتصفح يُنتج رقمًا جديدًا، فالعدّ تقريبيّ (يزيد قليلًا).
