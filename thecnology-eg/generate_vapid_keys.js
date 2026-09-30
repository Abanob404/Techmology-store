// Generate standards-compatible VAPID keys without any external npm package.
const crypto = require('crypto');
const toBuf = (value) => { let s = String(value).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Buffer.from(s, 'base64'); };
const toUrl = (value) => Buffer.from(value).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const jwk = privateKey.export({ format: 'jwk' });
const publicRaw = Buffer.concat([Buffer.from([4]), toBuf(jwk.x), toBuf(jwk.y)]);
console.log('VAPID_PUBLIC_KEY=' + toUrl(publicRaw));
console.log('VAPID_PRIVATE_KEY=' + jwk.d);
console.log('VAPID_SUBJECT=mailto:technology.store.official1@gmail.com');
