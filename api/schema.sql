-- جهازٌ = رقمٌ عشوائيٌّ يولّده التطبيق على الجهاز. لا اسم ولا بريد ولا جوال ولا موقعَ دقيق.
CREATE TABLE IF NOT EXISTS devices (
  id         TEXT PRIMARY KEY,
  first_day  TEXT NOT NULL,      -- YYYY-MM-DD (توقيت السعودية)
  last_day   TEXT NOT NULL,
  ver        TEXT,
  country    TEXT               -- رمز الدولة من ترويسة Cloudflare، لا من التطبيق
);
CREATE INDEX IF NOT EXISTS idx_devices_last ON devices(last_day);

-- اشتراك الإشعارات (اختياريّ، بموافقة صريحة). لا حمولة مشفّرة: الإشعار يُوقظ عامل الخدمة فقط.
CREATE TABLE IF NOT EXISTS subs (
  id        TEXT PRIMARY KEY,    -- نفس رقم الجهاز
  endpoint  TEXT NOT NULL,
  times     TEXT NOT NULL,       -- JSON: [[epochMs,"fajr"],...] الأسبوعُ القادم
  sent_to   INTEGER NOT NULL DEFAULT 0   -- آخرُ موعدٍ أُرسل له
);
