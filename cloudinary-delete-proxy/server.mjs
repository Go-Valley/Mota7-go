/**
 * وسيط حذف Cloudinary بدون Firebase Blaze:
 * - يتحقق من Firebase ID Token (مستخدم مسجّل في mota7-go).
 * - يحذف public_id فقط ضمن banners/ أو products/ أو stores/.
 *
 * التشغيل المحلي: npm install && npm start
 * النشر: Render / Railway / Fly.io / VPS — عيّن المتغيرات في env.sample.txt
 *
 * المسار: POST /delete
 * Headers: Authorization: Bearer <Firebase ID token>
 * Body: { "publicIds": ["banners/xxx"] }
 */
import express from 'express';
import cors from 'cors';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { v2 as cloudinary } from 'cloudinary';

const app = express();
// Allow mobile WebViews and browsers (some omit Origin on native fetch)
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '128kb' }));

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'mota7-go';
const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

const ALLOWED_PREFIXES = ['banners/', 'products/', 'stores/'];

function validatePublicIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error('publicIds required');
  }
  if (ids.length > 25) {
    throw new Error('too many publicIds');
  }
  for (const id of ids) {
    if (typeof id !== 'string' || !id.trim()) {
      throw new Error('invalid publicId');
    }
    if (!ALLOWED_PREFIXES.some((p) => id.startsWith(p))) {
      throw new Error('publicId prefix not allowed');
    }
  }
}

app.get('/', (_req, res) => {
  res.type('text/plain').send('mota7 cloudinary delete proxy OK');
});

app.post('/delete', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing Authorization Bearer token' });
    }
    const token = auth.slice(7).trim();
    await jwtVerify(token, JWKS, {
      issuer: `https://securetoken.google.com/${PROJECT_ID}`,
      audience: PROJECT_ID,
    });

    const { publicIds } = req.body || {};
    validatePublicIds(publicIds);

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    if (!cloudName || !apiKey || !apiSecret) {
      return res.status(500).json({ error: 'Server missing Cloudinary env vars' });
    }

    cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });

    const results = [];
    for (const publicId of publicIds) {
      const r = await cloudinary.uploader.destroy(publicId, { invalidate: true });
      results.push({ publicId, result: r.result });
    }
    return res.json({ ok: true, results });
  } catch (e) {
    const msg = e?.message || String(e);
    const code = msg.includes('signature') || msg.includes('expired') || msg.includes('jwt') ? 401 : 400;
    console.error('[delete]', msg);
    return res.status(code).json({ error: msg });
  }
});

const port = Number(process.env.PORT) || 8787;
app.listen(port, () => {
  console.log(`cloudinary-delete-proxy listening on ${port}`);
});
