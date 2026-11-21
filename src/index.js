// Cloudflare Worker: kuota, kode Pro, dan proxy Gemini. Frontend dilayani dari folder public (aset gratis).
// Dibuat hemat CPU (batas gratis 10 ms): audio tidak di-parse, hanya diteruskan.
const J = (o, s = 200, h = {}) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json', ...h } });
const wk = () => Math.floor(Date.now() / 6048e5);
const PRICE = 14999;
const A32 = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const rand = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => A32[b % A32.length]).join('');
const mint = async (env, days) => { const code = `CS-${rand(4)}-${rand(4)}`; await env.KV.put(`c:${code}`, JSON.stringify({ devices: [], days, exp: null })); return code; };
const sha512 = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-512', new TextEncoder().encode(s)))].map((x) => x.toString(16).padStart(2, '0')).join('');
const midBase = (env) => env.MIDTRANS_ENV === 'production' ? 'https://app.midtrans.com' : 'https://app.sandbox.midtrans.com';
const TTL = 2592000;
const PRE = '{"contents":[{"parts":[{"inline_data":{"mime_type":"audio/wav","data":"';
const suf = (n) => `"}},{"text":"Pilih ${n} momen paling menarik/viral dari audio ini, masing-masing 20-45 detik, tidak tumpang tindih. Balas JSON saja: [{\\"start\\":detik,\\"end\\":detik}]"}]}],"generationConfig":{"responseMimeType":"application/json"}}`;

// Kuota: n = klip yang sudah jadi (terhitung). h = "tahanan" selama klip diproses; hanya dihitung setelah klip benar-benar jadi (/commit).
const HOLD_MS = 20 * 60 * 1000;
const urec = async (env, id) => { const v = await env.KV.get(`u:${id}:${wk()}`, 'json'); return v && typeof v === 'object' ? v : { n: +v || 0 }; };
const live = (r) => !!r.h && Date.now() - r.ht < HOLD_MS;
const uput = (env, id, r) => env.KV.put(`u:${id}:${wk()}`, JSON.stringify(r), { expirationTtl: 864000 });
async function status(env, id) {
  const [p, r] = await Promise.all([env.KV.get(`p:${id}`, 'json'), urec(env, id)]);
  const pro = !!p && p.exp > Date.now();
  return { pro, max: pro ? 5 : 2, used: (r.n || 0) + (live(r) ? 1 : 0), until: pro ? p.exp : 0 };
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url), path = url.pathname, id = (req.headers.get('x-id') || 'anon').slice(0, 64);

    if (path === '/health') return J({ ok: true });
    if (path === '/quota') return J(await status(env, id));

    if (path === '/redeem' && req.method === 'POST') {
      const code = String((await req.json().catch(() => ({}))).code || '').trim().toUpperCase();
      const rec = await env.KV.get(`c:${code}`, 'json');
      if (!rec) return J({ error: 'invalid' }, 404);
      if (rec.exp && rec.exp < Date.now()) return J({ error: 'expired' }, 410);
      if (!rec.devices.includes(id)) {
        if (rec.devices.length >= 2) return J({ error: 'max' }, 403);
        rec.devices.push(id);
      }
      if (!rec.exp) rec.exp = Date.now() + rec.days * 864e5;
      await env.KV.put(`c:${code}`, JSON.stringify(rec));
      await env.KV.put(`p:${id}`, JSON.stringify({ exp: rec.exp }));
      return J({ ok: true });
    }

    if (path === '/admin/new') {   // /admin/new?token=XXX&n=5&days=30
      if (!env.ADMIN_TOKEN || url.searchParams.get('token') !== env.ADMIN_TOKEN) return J({ error: 'no' }, 403);
      const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', part = () => [...crypto.getRandomValues(new Uint8Array(4))].map((b) => A[b % A.length]).join('');
      const out = [], days = +url.searchParams.get('days') || 30;
      for (let i = 0; i < Math.min(+url.searchParams.get('n') || 1, 50); i++) {
        const code = `CS-${part()}-${part()}`;
        await env.KV.put(`c:${code}`, JSON.stringify({ devices: [], days, exp: null })); out.push(code);
      }
      return J({ codes: out });
    }

    // ---- Midtrans: buat transaksi ----
    if (path === '/pay' && req.method === 'POST') {
      if (!env.MIDTRANS_SERVER_KEY || !env.MIDTRANS_CLIENT_KEY) return J({ error: 'off' }, 503);
      if ((await status(env, id)).pro) return J({ error: 'active' }, 409);   // Pro masih aktif, tidak perlu bayar lagi
      const order = `CS${Date.now().toString(36)}${rand(8)}`;
      const payload = {
        transaction_details: { order_id: order, gross_amount: PRICE },
        item_details: [{ id: 'pro30', price: PRICE, quantity: 1, name: 'Clip Smart Pro 30 hari' }]
      };
      if (env.MIDTRANS_METHODS) payload.enabled_payments = env.MIDTRANS_METHODS.split(',').map((x) => x.trim());
      const r = await fetch(`${midBase(env)}/snap/v1/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: 'Basic ' + btoa(env.MIDTRANS_SERVER_KEY + ':') },
        body: JSON.stringify(payload)
      });
      if (!r.ok) return J({ error: 'mid' }, 502);
      const { token } = await r.json();
      await env.KV.put(`o:${order}`, JSON.stringify({ id, status: 'pending' }), { expirationTtl: TTL });
      return J({ token, order, clientKey: env.MIDTRANS_CLIENT_KEY, snapUrl: `${midBase(env)}/snap/snap.js` });
    }

    // ---- Midtrans: notifikasi pembayaran (webhook) ----
    if (path === '/midtrans-notify' && req.method === 'POST') {
      const n = await req.json().catch(() => null);
      if (!n || !env.MIDTRANS_SERVER_KEY) return J({ error: 'bad' }, 400);
      const sig = await sha512(`${n.order_id}${n.status_code}${n.gross_amount}${env.MIDTRANS_SERVER_KEY}`);
      if (sig !== n.signature_key) return J({ error: 'sig' }, 403);
      const o = await env.KV.get(`o:${n.order_id}`, 'json');
      if (!o || o.code) return J({ ok: true });
      const paid = (n.transaction_status === 'settlement' || (n.transaction_status === 'capture' && n.fraud_status === 'accept'))
        && Math.round(parseFloat(n.gross_amount)) === PRICE;
      if (paid) { o.code = await mint(env, 30); o.status = 'paid'; }
      else if (['expire', 'cancel', 'deny', 'failure'].includes(n.transaction_status)) o.status = 'failed';
      else return J({ ok: true });
      await env.KV.put(`o:${n.order_id}`, JSON.stringify(o), { expirationTtl: TTL });
      return J({ ok: true });
    }

    // ---- Ambil kode setelah bayar (hanya perangkat yang memesan) ----
    if (path === '/claim') {
      const o = await env.KV.get(`o:${(url.searchParams.get('order') || '').slice(0, 60)}`, 'json');
      if (!o || o.id !== id) return J({ status: 'none' });
      return J(o.code ? { status: 'paid', code: o.code } : { status: o.status });
    }

    // ---- Ambil video dari link langsung (khusus Pro, maks 500 MB, hanya diteruskan tanpa diolah) ----
    if (path === '/fetch') {
      if (!(await status(env, id)).pro) return J({ error: 'pro' }, 403);
      let u; try { u = new URL(url.searchParams.get('url') || ''); } catch { return J({ error: 'url' }, 400); }
      if (!/^https?:$/.test(u.protocol) || u.hostname === 'localhost' || /^[\d.]+$/.test(u.hostname) || u.hostname.includes(':')) return J({ error: 'url' }, 400);
      const r = await fetch(u.toString(), { headers: { 'User-Agent': 'Mozilla/5.0 ClipSmart' } }).catch(() => null);
      if (!r || !r.ok) return J({ error: 'upstream' }, 502);
      const ct = (r.headers.get('content-type') || '').toLowerCase(), len = +r.headers.get('content-length') || 0;
      if (!(ct.startsWith('video/') || ct.includes('octet-stream') || ct.includes('mp4'))) return J({ error: 'notvideo' }, 415);
      if (!len) return J({ error: 'nosize' }, 411);
      if (len > 500e6) return J({ error: 'big' }, 413);
      return new Response(r.body, { headers: { 'Content-Type': ct, 'Content-Length': String(len) } });
    }

    // ---- Klip jadi -> jatah terpakai | klip gagal -> jatah dikembalikan ----
    if ((path === '/commit' || path === '/refund') && req.method === 'POST') {
      const ur = await urec(env, id), t = req.headers.get('x-hold');
      if (!t || ur.h !== t) return J({ ok: true });
      if (path === '/commit') ur.n = (ur.n || 0) + 1;
      else { if ((ur.rf || 0) >= 3) return J({ ok: true }); ur.rf = (ur.rf || 0) + 1; }   // batas pengembalian: 3x/minggu
      ur.h = null;
      await uput(env, id, ur);
      return J({ ok: true });
    }

    if (path === '/analyze' && req.method === 'POST') {
      const [ur, pr] = await Promise.all([urec(env, id), env.KV.get(`p:${id}`, 'json')]);
      const max = pr && pr.exp > Date.now() ? 5 : 2;
      if (live(ur)) return J({ error: 'busy' }, 409);
      if ((ur.n || 0) >= max) return J({ error: 'quota' }, 429);
      const audio = await req.arrayBuffer();
      if (audio.byteLength > 26e6) return J({ error: 'big' }, 413);
      const hold = rand(12); ur.h = hold; ur.ht = Date.now();
      // Batas tulis harian KV habis -> browser pakai cadangan tanpa AI
      try { await uput(env, id, ur); } catch { return J({ error: 'ai' }, 503); }
      const hh = { 'x-hold': hold };

      const body = new Blob([PRE, audio, suf(Math.min(+req.headers.get('x-count') || 1, 2))]);
      const keys = (env.GEMINI_KEYS || '').split(',').map((x) => x.trim()).filter(Boolean);
      const models = (env.GEMINI_MODELS || 'gemini-2.5-flash,gemini-2.5-flash-lite').split(',').map((x) => x.trim());
      const st = Math.floor(Math.random() * keys.length);
      for (const m of models) for (let i = 0; i < keys.length; i++) {
        try {
          const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`,
            { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': keys[(st + i) % keys.length] }, body });
          if (r.ok) return new Response(r.body, { headers: { 'Content-Type': 'application/json', ...hh } });
        } catch {}
      }
      return J({ error: 'ai' }, 503, hh);
    }
    return env.ASSETS.fetch(req);
  }
};
