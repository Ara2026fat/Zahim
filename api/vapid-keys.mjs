// يولّد مفاتيح VAPID مرّةً واحدة:  node vapid-keys.mjs
const k = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const priv = await crypto.subtle.exportKey('jwk', k.privateKey);
const pubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', k.publicKey));
const b64u = (u) => Buffer.from(u).toString('base64url');
console.log('VAPID_PUBLIC     =', b64u(pubRaw));
console.log('VAPID_PRIVATE_JWK=', JSON.stringify(priv));
