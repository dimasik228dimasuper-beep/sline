/**
 * Vercel Serverless: send email verification code via Resend
 * POST { email, code }
 * 200 { ok: true }
 * 429 { ok: false, skip: true }  — quota / rate limit → client skips verification
 */
const RESEND_API_KEY = process.env.RESEND_API_KEY || 're_KS2fNkXA_G7F2M4Ekqrkfw6qUUwSUJ8PZ';
const FROM = process.env.RESEND_FROM || 'SLine <onboarding@resend.dev>';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};
  const email = String(body.email || '').trim().toLowerCase();
  const code = String(body.code || '').trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email' });
  }
  if (!/^\d{4,8}$/.test(code)) {
    return res.status(400).json({ error: 'Invalid code' });
  }

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + RESEND_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: FROM,
        to: [email],
        subject: 'Код подтверждения SLine: ' + code,
        html:
          '<div style="font-family:system-ui,-apple-system,sans-serif;max-width:420px;margin:0 auto;padding:24px">' +
          '<h2 style="margin:0 0 12px;color:#1a1d21">SLine</h2>' +
          '<p style="color:#555;font-size:15px;line-height:1.5;margin:0 0 16px">Ваш код подтверждения email:</p>' +
          '<div style="font-size:32px;font-weight:800;letter-spacing:8px;text-align:center;padding:16px;background:#f0f4ff;border-radius:12px;color:#4C7CF3">' +
          code +
          '</div>' +
          '<p style="color:#888;font-size:13px;margin:16px 0 0">Код действует 15 минут. Если это были не вы — просто игнорируйте письмо.</p>' +
          '</div>',
        text: 'Код подтверждения SLine: ' + code + '\nДействует 15 минут.'
      })
    });

    const data = await r.json().catch(() => ({}));

    // Rate limit / quota exhausted → client skips verification
    if (r.status === 429 || r.status === 402) {
      return res.status(429).json({ ok: false, skip: true, error: 'limit' });
    }
    // Resend free tier: often 403/422 when domain not verified or daily limit
    const msg = String(data.message || data.error || '').toLowerCase();
    if (
      r.status === 403 ||
      /rate.?limit|too many|quota|limit exceeded|daily limit|monthly limit|insufficient/i.test(msg)
    ) {
      return res.status(429).json({ ok: false, skip: true, error: msg || 'limit' });
    }

    if (!r.ok) {
      return res.status(r.status || 500).json({
        ok: false,
        skip: false,
        error: data.message || data.error || 'send failed',
        status: r.status
      });
    }

    return res.status(200).json({ ok: true, id: data.id || null });
  } catch (e) {
    // Network / unexpected — allow skip so registration is not blocked
    return res.status(503).json({ ok: false, skip: true, error: String(e.message || e) });
  }
};
