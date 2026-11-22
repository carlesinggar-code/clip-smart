// ===== Pengaturan =====
const SHOWCASE = [
  ['Sunset', 'https://assets.mixkit.co/videos/1170/1170-360.mp4'],
  ['Air terjun', 'https://assets.mixkit.co/active_storage/video_items/100174/1721166924/100174-video-360.mp4'],
  ['Bunga', 'https://assets.mixkit.co/videos/1186/1186-360.mp4'],
  ['Kolam', 'https://assets.mixkit.co/videos/1280/1280-360.mp4'],
  ['Palem', 'https://assets.mixkit.co/videos/1191/1191-360.mp4'],
  ['Pantai', 'https://assets.mixkit.co/videos/51500/51500-360.mp4']
];
const $ = (i) => document.getElementById(i);
const id = localStorage.cid || (localStorage.cid = crypto.randomUUID());
let ori = 'p', file = null, q = { pro: false, max: 2, used: 0 };

const toast = (t) => { $('toast').textContent = t; $('toast').classList.remove('hidden'); setTimeout(() => $('toast').classList.add('hidden'), 3000); };
const prog = (l, p) => { $('prog').classList.remove('hidden'); $('plabel').textContent = l; $('ppct').textContent = p + '%'; $('pbar').style.width = p + '%'; };
const showPro = (v) => { $('pro').classList.toggle('hidden', !v); $('pro').classList.toggle('flex', v); $('chk').classList.toggle('hidden', !localStorage.cs_order); };

async function loadQuota() {
  try { q = await (await fetch('/quota', { headers: { 'x-id': id } })).json(); } catch {}
  document.body.classList.toggle('is-pro', !!q.pro); $('up').textContent = q.pro ? 'Pro ✦' : 'Premium';
  $('quota').textContent = `${Math.max(q.max - q.used, 0)}/${q.max} minggu ini`;
  // Pro aktif: tombol bayar dikunci, kolom kode disembunyikan
  $('pay').disabled = !!q.pro;
  $('pay').classList.toggle('opacity-60', !!q.pro);
  $('pay').textContent = q.pro ? 'Pro aktif sampai ' + new Date(q.until).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : 'Dapatkan Pro';
  $('code').parentElement.classList.toggle('hidden', !!q.pro);
  if (q.pro) { localStorage.removeItem('cs_order'); $('chk').classList.add('hidden'); }
  syncLocks();
}

const setOri = (o) => { ori = o; document.querySelectorAll('.ori').forEach((b) => { const on = b.dataset.o === o; b.className = 'ori py-2.5 rounded-full ' + (on ? 'bg-sky-300 text-neutral-900' : 'text-neutral-400'); }); };
document.querySelectorAll('.ori').forEach((b) => (b.onclick = () => setOri(b.dataset.o)));
setOri('p');

// Kunci Pro: kolom link & tombol Super HD
function syncLocks() {
  $('urlIn').readOnly = !q.pro; $('urlGo').textContent = q.pro ? 'Muat' : '🔒 Muat';
  document.querySelectorAll('.shd').forEach((b) => (b.textContent = q.pro ? 'Unduh Super HD' : '🔒 Super HD'));
}
$('up').onclick = $('up2').onclick = () => showPro(true);
$('x').onclick = () => showPro(false);
async function activate(code) {
  try {
    const r = await fetch('/redeem', { method: 'POST', headers: { 'x-id': id }, body: JSON.stringify({ code }) });
    if (r.ok) { toast('Pro aktif'); loadQuota(); return true; }
    const d = await r.json(); toast({ max: 'Kode sudah dipakai di 2 perangkat', expired: 'Kode kedaluwarsa' }[d.error] || 'Kode salah');
  } catch { toast('Tidak ada koneksi'); }
  return false;
}
$('redeem').onclick = async () => { if (await activate($('code').value)) showPro(false); };

// ===== Pembayaran Midtrans =====
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let snapReady;
const loadSnap = (url, key) => snapReady || (snapReady = new Promise((ok, no) => {
  const s = document.createElement('script'); s.src = url; s.dataset.clientKey = key; s.onload = ok; s.onerror = () => { snapReady = null; no(); };
  document.head.appendChild(s);
}));
async function claim(order, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const d = await (await fetch('/claim?order=' + order, { headers: { 'x-id': id } })).json();
      if (d.code) return d.code;
      if (d.status === 'failed' || d.status === 'none') { localStorage.removeItem('cs_order'); return null; }
    } catch {}
    if (i < tries - 1) await sleep(3000);
  }
  return null;
}
async function got(code) {
  localStorage.removeItem('cs_order');
  $('gotCode').textContent = code; $('code').value = code; $('got').classList.remove('hidden'); $('chk').classList.add('hidden');
  await activate(code);
}
$('help').onclick = () => $('helpbox').classList.toggle('hidden');
$('copy').onclick = () => { navigator.clipboard.writeText($('gotCode').textContent).then(() => toast('Kode disalin')).catch(() => {}); };
$('chk').onclick = async () => {
  const o = localStorage.cs_order; if (!o) return toast('Belum ada pembayaran');
  toast('Mengecek...'); const c = await claim(o, 1);
  c ? got(c) : toast('Belum lunas');
};
$('pay').onclick = async () => {
  $('pay').disabled = true;
  try {
    const r = await fetch('/pay', { method: 'POST', headers: { 'x-id': id } }), d = await r.json();
    if (!r.ok) throw d.error;
    localStorage.cs_order = d.order;
    await loadSnap(d.snapUrl, d.clientKey);
    const done = async () => { const c = await claim(d.order); c ? got(c) : toast('Menunggu pembayaran. Tekan Cek pembayaran nanti'); };
    snap.pay(d.token, { onSuccess: done, onPending: done, onError: () => toast('Pembayaran gagal'), onClose: () => {} });
  } catch (e) { toast(e === 'off' ? 'Pembayaran belum aktif' : e === 'active' ? 'Pro masih aktif' : 'Gagal memulai pembayaran'); if (e === 'active') loadQuota(); }
  $('pay').disabled = !!q.pro;
};
$('file').onchange = (e) => setFile(e.target.files[0] || null);
['dragover', 'drop'].forEach((ev) => $('drop').addEventListener(ev, (e) => {
  e.preventDefault();
  if (ev === 'drop' && e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
}));

// Audio 8 kHz mono -> WAV base64 (kecil, cukup untuk analisis suara)
async function audioWav(f) {
  const ctx = new (window.AudioContext || webkitAudioContext)();
  let buf;
  try { buf = await ctx.decodeAudioData(await f.arrayBuffer()); } catch { throw 'noaudio'; } finally { ctx.close(); }
  const off = new OfflineAudioContext(1, Math.ceil(buf.duration * 8000), 8000);
  const s = off.createBufferSource(); s.buffer = buf; s.connect(off.destination); s.start();
  const pcm = (await off.startRendering()).getChannelData(0);
  const w = new DataView(new ArrayBuffer(44 + pcm.length * 2));
  const str = (o, t) => [...t].forEach((c, i) => w.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); w.setUint32(4, 36 + pcm.length * 2, true); str(8, 'WAVEfmt ');
  w.setUint32(16, 16, true); w.setUint16(20, 1, true); w.setUint16(22, 1, true);
  w.setUint32(24, 8000, true); w.setUint32(28, 16000, true); w.setUint16(32, 2, true); w.setUint16(34, 16, true);
  str(36, 'data'); w.setUint32(40, pcm.length * 2, true);
  pcm.forEach((v, i) => w.setInt16(44 + i * 2, Math.max(-1, Math.min(1, v)) * 32767, true));
  let b = ''; const u = new Uint8Array(w.buffer);
  for (let i = 0; i < u.length; i += 8192) b += String.fromCharCode(...u.subarray(i, i + 8192));
  return { b64: btoa(b), dur: buf.duration, pcm, buf };
}

// Jatah baru terpakai setelah klip JADI. Gagal/berhenti -> dikembalikan.
let HOLD = null;
const release = async (what) => {
  const h = HOLD || localStorage.cs_hold; HOLD = null; localStorage.removeItem('cs_hold');
  if (!h) return;
  try { await fetch('/' + what, { method: 'POST', headers: { 'x-id': id, 'x-hold': h } }); } catch {}
};
async function analyze(b64, n) {
  const r = await fetch('/analyze', { method: 'POST', headers: { 'x-id': id, 'x-count': String(n), 'Content-Type': 'text/plain' }, body: b64 });
  if (r.status === 429) throw 'quota';
  if (r.status === 409) throw 'busy';
  HOLD = r.headers.get('x-hold'); if (HOLD) localStorage.cs_hold = HOLD;
  if (!r.ok) return null;
  try { const c = JSON.parse((await r.json()).candidates[0].content.parts[0].text); return Array.isArray(c) && c.length ? c : null; } catch { return null; }
}

// Cadangan tanpa AI: ambil jendela 30 detik dengan suara paling ramai/keras
function localPick(pcm, n) {
  const R = 8000, secs = Math.floor(pcm.length / R), e = [];
  for (let s = 0; s < secs; s++) { let t = 0; for (let i = s * R; i < (s + 1) * R; i += 4) t += pcm[i] * pcm[i]; e.push(t); }
  const L = Math.min(45, secs), sc = [], out = [];
  let w = e.slice(0, L).reduce((x, y) => x + y, 0);
  for (let s = 0; s + L <= secs; s++) { if (s) w += e[s + L - 1] - e[s - 1]; sc.push([w, s]); }
  sc.sort((x, y) => y[0] - x[0]);
  for (const [, s] of sc) { if (out.length >= n) break; if (out.every((o) => Math.abs(o.start - s) >= L)) out.push({ start: s, end: s + L }); }
  return out;
}

// ===== Ambil video dari link (Pro) =====
$('urlIn').onclick = () => { if (!q.pro) showPro(true); };
$('urlGo').onclick = async () => {
  if (!q.pro) return showPro(true);
  const u = $('urlIn').value.trim(); if (!u) return toast('Tempel link video dulu');
  $('urlGo').disabled = true;
  try {
    const r = await fetch('/fetch?url=' + encodeURIComponent(u), { headers: { 'x-id': id } });
    if (!r.ok) throw (await r.json().catch(() => ({}))).error || 'urlfail';
    const total = +r.headers.get('content-length') || 0, rd = r.body.getReader(), parts = []; let got = 0;
    for (;;) {
      const { done, value } = await rd.read(); if (done) break;
      parts.push(value); got += value.length;
      if (got > 500e6) { rd.cancel(); throw 'big'; }
      prog('Mengunduh link', total ? Math.round((got / total) * 100) : 50);
    }
    const name = decodeURIComponent(new URL(u).pathname.split('/').pop() || 'video.mp4').slice(-60);
    setFile(new File(parts, name, { type: r.headers.get('content-type') || 'video/mp4' }));
    $('prog').classList.add('hidden'); toast('Video siap');
  } catch (e) {
    $('prog').classList.add('hidden');
    toast({ pro: 'Khusus Pro', notvideo: 'Link harus langsung ke file video (.mp4), bukan halaman YouTube/TikTok', nosize: 'Server link tidak memberi ukuran file', big: 'Maksimal 500 MB', url: 'Link tidak valid', upstream: 'Link tidak bisa dibuka' }[e] || 'Gagal mengambil video');
  }
  $('urlGo').disabled = false;
};

// ===== Ekspor klip =====
// Utama: WebCodecs -> MP4 standar (H.264 + AAC), frame rate tetap, suara diambil dari file asli.
// Cadangan: MediaRecorder untuk browser yang belum mendukung WebCodecs.
const wcOK = () => 'VideoEncoder' in window && 'AudioEncoder' in window && 'VideoFrame' in window && 'AudioData' in window;
let muxLib;
const loadMux = () => window.Mp4Muxer ? Promise.resolve() : muxLib || (muxLib = new Promise((ok, no) => {
  const s = document.createElement('script'); s.src = 'mp4-muxer.js'; s.onload = ok; s.onerror = () => { muxLib = null; no('lib'); };
  document.head.appendChild(s);
}));
const sizeOf = (o, hd) => (o === 'l' ? [hd ? 1920 : 1280, hd ? 1080 : 720] : [hd ? 1080 : 720, hd ? 1920 : 1280]);
const cropOf = (v, W, H) => {
  const wide = v.videoWidth / v.videoHeight > W / H;
  const sh = wide ? v.videoHeight : v.videoWidth * H / W, sw = wide ? v.videoHeight * W / H : v.videoWidth;
  return [(v.videoWidth - sw) / 2, (v.videoHeight - sh) / 2, sw, sh];
};
function sliceAudio(buf, s, e) {
  const sr = buf.sampleRate, a = Math.floor(Math.max(s, 0) * sr), b = Math.min(Math.floor(e * sr), buf.length);
  return { sampleRate: sr, chans: Array.from({ length: Math.min(buf.numberOfChannels, 2) }, (_, c) => buf.getChannelData(c).slice(a, Math.max(a, b))) };
}
const probe = (f) => new Promise((ok) => {
  const v = document.createElement('video'), u = URL.createObjectURL(f);
  const end = (d) => { URL.revokeObjectURL(u); ok(d); };
  v.preload = 'metadata'; v.onloadedmetadata = () => end(v.duration); v.onerror = () => end(NaN); v.src = u;
});
function openVideo(src, start) {
  return new Promise((ok, no) => {
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto';
    v.onerror = () => no('decode');
    v.onloadedmetadata = () => {
      if (start > 0.05) { v.onseeked = () => ok(v); v.currentTime = start; }
      else if (v.readyState >= 2) ok(v); else v.onloadeddata = () => ok(v);
    };
    v.src = src;
  });
}
const closeVideo = (v) => { try { v.pause(); v.removeAttribute('src'); v.load(); } catch {} };

const timeout = (p, ms, e = 'stall') => Promise.race([p, new Promise((_, no) => setTimeout(() => no(e), ms))]);
// Pengawas: batal jika 20 detik tanpa kemajuan (saat layar mati / tab di belakang tidak dihitung).
function guard(v, fail) {
  let beat = Date.now();
  const iv = setInterval(() => { if (!document.hidden && Date.now() - beat > 20000) fail('stall'); }, 2000);
  const vis = () => { if (!document.hidden) { beat = Date.now(); if (v.paused) v.play().catch(() => {}); } };
  document.addEventListener('visibilitychange', vis);
  return { beat: () => { beat = Date.now(); }, stop: () => { clearInterval(iv); document.removeEventListener('visibilitychange', vis); } };
}

async function exportWC(src, au, start, end, W, H, hd, onp) {
  await loadMux();
  const { Muxer, ArrayBufferTarget } = Mp4Muxer, ch = au.chans.length, sr = au.sampleRate;
  const vcfg = { codec: 'avc1.640028', width: W, height: H, bitrate: hd ? 8e6 : 4e6, framerate: 30 };
  const acfg = { codec: 'mp4a.40.2', sampleRate: sr, numberOfChannels: ch, bitrate: 128000 };
  if (!(await VideoEncoder.isConfigSupported(vcfg)).supported || !(await AudioEncoder.isConfigSupported(acfg)).supported) throw 'nosupport';
  const v = await timeout(openVideo(src, start), 30000);
  let gd;
  try {
    const mux = new Muxer({
      target: new ArrayBufferTarget(), fastStart: 'in-memory', firstTimestampBehavior: 'cross-track-offset',
      video: { codec: 'avc', width: W, height: H }, audio: { codec: 'aac', numberOfChannels: ch, sampleRate: sr }
    });
    let err = null, failNow = null;
    const onErr = (e) => { err = e; if (failNow) failNow(e); };
    const venc = new VideoEncoder({ output: (c, m) => mux.addVideoChunk(c, m), error: onErr });
    const aenc = new AudioEncoder({ output: (c, m) => mux.addAudioChunk(c, m), error: onErr });
    venc.configure(vcfg); aenc.configure(acfg);

    const total = au.chans[0].length; let ap = 0;
    const pump = (upTo) => {   // kirim audio sampai detik ke-upTo (relatif awal klip)
      while (ap < total && ap / sr <= upTo) {
        const n = Math.min(4096, total - ap), d = new Float32Array(n * ch);
        au.chans.forEach((c, i) => d.set(c.subarray(ap, ap + n), i * n));
        const a = new AudioData({ format: 'f32-planar', sampleRate: sr, numberOfFrames: n, numberOfChannels: ch, timestamp: Math.round(ap / sr * 1e6), data: d });
        aenc.encode(a); a.close(); ap += n;
      }
    };
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d'), [sx, sy, sw, sh] = cropOf(v, W, H);

    await new Promise((done, fail) => {
      let last = -1, n = 0, fin = false;
      const stop = () => { if (!fin) { fin = true; done(); } };
      const die = (e) => { if (!fin) { fin = true; fail(e); } };
      failNow = die; gd = guard(v, die);
      v.onended = stop; v.onerror = () => die('decode');
      venc.ondequeue = () => { gd.beat(); if (v.paused && !fin && venc.encodeQueueSize <= 2) v.play().catch(() => {}); };
      const tick = (now, meta) => {
        if (fin) return;
        gd.beat();
        if (err) return die(err);
        const t = meta && meta.mediaTime != null ? meta.mediaTime : v.currentTime, ts = Math.round((t - start) * 1e6);
        if (t >= end) return stop();
        if (ts >= 0 && ts > last) {
          g.drawImage(v, sx, sy, sw, sh, 0, 0, W, H);
          const f = new VideoFrame(cv, { timestamp: ts, duration: 33333 });
          venc.encode(f, { keyFrame: n % 60 === 0 }); f.close(); n++; last = ts;
          if (venc.encodeQueueSize > 8) v.pause();   // encoder kewalahan: tunggu agar tidak ada frame hilang
        }
        pump(t - start + 0.5);
        if (onp) onp(Math.min((t - start) / (end - start), 1));
        v.requestVideoFrameCallback(tick);
      };
      v.requestVideoFrameCallback(tick);
      v.play().catch(die);
    });
    v.pause(); pump(1e9);
    await timeout(venc.flush(), 30000); await timeout(aenc.flush(), 30000);
    if (err) throw err;
    mux.finalize();
    return new Blob([mux.target.buffer], { type: 'video/mp4' });
  } finally { if (gd) gd.stop(); closeVideo(v); }
}

async function exportMR(src, start, end, W, H, hd, onp) {
  const v = await timeout(openVideo(src, start), 30000); v.muted = false;
  const ac = new AudioContext(); await ac.resume().catch(() => {});
  let gd;
  try {
    const dest = ac.createMediaStreamDestination(); ac.createMediaElementSource(v).connect(dest);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d'), [sx, sy, sw, sh] = cropOf(v, W, H), st = cv.captureStream(30);
    dest.stream.getAudioTracks().forEach((t) => st.addTrack(t));
    const mime = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/webm;codecs=vp9,opus', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
    if (!mime) throw 'nosupport';
    const rec = new MediaRecorder(st, { mimeType: mime, videoBitsPerSecond: hd ? 8e6 : 4e6, audioBitsPerSecond: 128000 }), chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    await new Promise((done, fail) => {
      let fin = false;
      const finish = (e) => { if (fin) return; fin = true; try { rec.stop(); } catch {} e ? fail(e) : done(); };
      rec.onstop = () => finish();
      gd = guard(v, finish); v.onerror = () => finish('decode');
      const draw = () => {
        if (fin) return;
        gd.beat(); g.drawImage(v, sx, sy, sw, sh, 0, 0, W, H);
        if (onp) onp(Math.min((v.currentTime - start) / (end - start), 1));
        if (v.currentTime >= end || v.ended) finish();
        else if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(draw); else requestAnimationFrame(draw);
      };
      rec.start(1000);
      v.play().then(draw).catch(finish);
    });
    return { blob: new Blob(chunks, { type: mime.split(';')[0] }), ext: mime.startsWith('video/mp4') ? 'mp4' : 'webm' };
  } finally { if (gd) gd.stop(); closeVideo(v); ac.close(); }
}

async function cut(src, au, start, end, hd, o, onp) {
  const [W, H] = sizeOf(o, hd);
  if (wcOK()) {
    try { return { blob: await exportWC(src, au, start, end, W, H, hd, onp), ext: 'mp4' }; }
    catch (e) { console.warn('WebCodecs gagal, pakai cadangan:', e); }
  }
  return exportMR(src, start, end, W, H, hd, onp);
}

// Rapikan hasil AI: dalam durasi video, 3-60 detik
const fixClips = (arr, dur, n) => {
  const cap = dur > 300 ? 80 : 60;   // klip 30-60 detik (maks 80 detik untuk video panjang)
  const list = (arr || []).map((c) => {
    let s = Math.max(0, Math.min(+c.start || 0, dur - 5)), e = Math.min(+c.end || 0, dur, s + cap);
    if (e - s < 30) { e = Math.min(dur, s + 30); s = Math.max(0, e - 30); }
    return { start: s, end: e };
  }).filter((c) => c.end - c.start >= 3);
  const out = [];
  for (const c of list) if (out.every((o) => c.start >= o.end || c.end <= o.start)) out.push(c);   // tidak tumpang tindih
  return out.slice(0, n);
};

// ===== Cari highlight -> klip jadi otomatis -> unduh =====
let H = null, working = false;   // H = { src, clips, audios, out: [{hd, shd}], committed, ori }
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// Pilih video: tampilkan gambar kecil + durasi + ukuran agar jelas sudah masuk
async function setFile(f) {
  file = f; $('fname').textContent = f ? f.name : 'Berikan video';
  $('thumb').classList.add('hidden'); $('finfo').textContent = 'Maks 500 MB · 12 menit';
  if (!f) return;
  const mb = Math.round(f.size / 1e6) + ' MB', u = URL.createObjectURL(f), v = document.createElement('video');
  let done = false;
  const fin = (dur, img, bad) => {
    if (done) return; done = true; URL.revokeObjectURL(u);
    if (file !== f) return;
    $('finfo').textContent = bad ? 'Format ini mungkin tidak didukung browser' : `✓ Video siap${dur > 0 ? ' · ' + mmss(dur) : ''} · ${mb}`;
    if (img) { $('thumb').src = img; $('thumb').classList.remove('hidden'); }
  };
  v.muted = true; v.playsInline = true; v.preload = 'auto';
  v.onloadedmetadata = () => { v.currentTime = Math.min(1, (v.duration || 2) / 2); };
  v.onseeked = () => {
    try {
      const c = document.createElement('canvas'), r = 480 / Math.max(v.videoWidth, v.videoHeight);
      c.width = Math.round(v.videoWidth * r); c.height = Math.round(v.videoHeight * r);
      c.getContext('2d').drawImage(v, 0, 0, c.width, c.height); fin(v.duration, c.toDataURL('image/jpeg', 0.7));
    } catch { fin(v.duration); }
  };
  v.onerror = () => fin(NaN, null, true);
  setTimeout(() => fin(v.duration), 6000);
  v.src = u;
}

// Buat satu klip. Jatah baru terpotong saat klip PERTAMA selesai dan masuk riwayat.
async function makeClip(i, hd, onp) {
  const c = H.clips[i];
  const { blob, ext } = await cut(H.src, H.audios[i], c.start, c.end, hd, H.ori, onp);
  if (!H.committed) { H.committed = true; await release('commit'); q.used++; loadQuota(); }
  H.out[i][hd ? 'shd' : 'hd'] = { url: URL.createObjectURL(blob), name: `clip-${i + 1}-${hd ? 'superhd' : 'hd'}.${ext}` };
  await tx('readwrite', (s) => s.put({ id: Date.now() + i, blob, ext, ori: H.ori, hd, date: Date.now() }));
  await renderHist();
}

const btnsHtml = (i) => {
  const o = H.out[i];
  const hd = o.hd
    ? `<a href="${o.hd.url}" download="${o.hd.name}" class="py-2.5 text-center rounded-full bg-sky-300 text-neutral-900 text-sm font-extrabold">Unduh HD</a>`
    : `<button data-k="hd" class="dl py-2.5 rounded-full bg-neutral-800 text-sm font-bold">Unduh HD</button>`;
  const shd = o.shd
    ? `<a href="${o.shd.url}" download="${o.shd.name}" class="gpro py-2.5 text-center rounded-full text-neutral-900 text-sm font-extrabold">Unduh Super HD</a>`
    : `<button data-k="shd" class="dl shd gpro py-2.5 rounded-full text-neutral-900 text-sm font-extrabold">${q.pro ? 'Unduh Super HD' : '🔒 Super HD'}</button>`;
  return hd + shd;
};

const cardHtml = (i) => {
  const c = H.clips[i], o = H.out[i], L = H.ori === 'l', url = (o.shd || o.hd).url;
  return `<div class="rounded-2xl overflow-hidden bg-neutral-900 mx-auto w-full ${L ? '' : 'max-w-sm'}" data-i="${i}">
    <video src="${url}" controls playsinline preload="metadata" class="w-full ${L ? 'aspect-video' : 'aspect-[9/16]'} object-cover bg-black"></video>
    <div class="px-4 pt-3 text-sm font-bold">Highlight ${i + 1} <span class="font-medium text-neutral-500">· ${Math.round(c.end - c.start)} detik</span></div>
    <p class="px-4 text-xs text-neutral-500">Dari menit ${mmss(c.start)} – ${mmss(c.end)}</p>
    <p class="st px-4 pt-1 text-xs text-neutral-400 min-h-[1rem]"></p>
    <div class="btns grid grid-cols-2 gap-2 p-3">${btnsHtml(i)}</div>
  </div>`;
};

const bindCard = (card) => card.querySelectorAll('.dl').forEach((b) => (b.onclick = () => onDemand(+card.dataset.i, b.dataset.k === 'shd', card)));

// Versi lain (mis. HD untuk Pro, atau Super HD setelah upgrade) dibuat saat diminta
async function onDemand(i, hd, card) {
  if (hd && !q.pro) return showPro(true);
  if (working) return toast('Tunggu proses yang berjalan selesai');
  const st = card.querySelector('.st'), box = card.querySelector('.btns'), key = hd ? 'shd' : 'hd', lab = `${hd ? 'Super HD' : 'HD'} · tetap di halaman ini`;
  working = true; box.querySelectorAll('.dl').forEach((b) => (b.disabled = true));
  let wl; try { wl = await navigator.wakeLock?.request('screen'); } catch {}
  try {
    st.textContent = lab;
    await makeClip(i, hd, (f) => { st.textContent = `${lab} · ${Math.round(f * 100)}%`; });
    st.textContent = 'Selesai'; box.innerHTML = btnsHtml(i); bindCard(card);
    const a = document.createElement('a'); a.href = H.out[i][key].url; a.download = H.out[i][key].name; document.body.appendChild(a); a.click(); a.remove();
  } catch (e) {
    st.textContent = ''; box.querySelectorAll('.dl').forEach((b) => (b.disabled = false));
    toast({ decode: 'Format video tidak didukung', stall: 'Proses terhenti, coba lagi' }[e] || 'Gagal, coba lagi');
  }
  if (wl) wl.release().catch(() => {});
  working = false;
}

$('go').onclick = async () => {
  if (working) return;
  if (!file) return toast('Berikan video dulu');
  if (file.size > 500e6) return toast('Video terlalu besar (maks 500 MB)');
  working = true; $('go').disabled = true; $('out').innerHTML = '';
  if (H) { URL.revokeObjectURL(H.src); H.out.forEach((o) => Object.values(o).forEach((x) => URL.revokeObjectURL(x.url))); H = null; }
  let wl; try { wl = await navigator.wakeLock?.request('screen'); } catch {}
  try {
    if (HOLD || localStorage.cs_hold) { await release('refund'); await loadQuota(); }   // proses sebelumnya belum selesai: jatah dikembalikan
    if (q.used >= q.max) throw 'quota';
    prog('Memeriksa video', 5);
    const d0 = await probe(file);
    if (d0 !== d0) throw 'decode';
    if (d0 > 720) throw 'long';
    prog('Membaca video', 12);
    let { b64, dur, pcm, buf } = await audioWav(file);
    prog('Mencari highlight', 35);
    const n = q.pro ? 2 : 1;
    let clips = fixClips(await analyze(b64, n), dur, n);
    if (!clips.length) clips = fixClips(localPick(pcm, n), dur, n);
    if (!clips.length) throw 'err';
    const audios = clips.map((c) => sliceAudio(buf, c.start, c.end)); buf = null; b64 = null;
    H = { src: URL.createObjectURL(file), clips, audios, out: clips.map(() => ({})), committed: false, ori };
    for (let i = 0; i < clips.length; i++) {   // klip dibuat langsung (Pro: Super HD, gratis: HD), lalu tampil siap unduh
      const lab = `Menyiapkan klip ${i + 1}/${clips.length} · tetap di halaman ini`, span = 58 / clips.length;
      prog(lab, Math.round(40 + i * span));
      await makeClip(i, !!q.pro, (f) => prog(lab, Math.round(40 + (i + f) * span)));
      $('out').insertAdjacentHTML('beforeend', cardHtml(i)); bindCard($('out').lastElementChild);
    }
    prog('Selesai', 100); setTimeout(() => $('prog').classList.add('hidden'), 600);
  } catch (e) {
    await release('refund');   // belum ada klip jadi -> jatah dikembalikan (kalau sudah ada, tidak berpengaruh)
    toast({ quota: 'Kuota habis', long: 'Maksimal 12 menit', noaudio: 'Suara video tidak terbaca', decode: 'Format video tidak didukung', busy: 'Selesaikan proses sebelumnya dulu, atau coba lagi sebentar', stall: 'Proses terhenti. Jatah tidak berkurang, coba lagi' }[e] || 'Gagal. Jatah tidak berkurang, coba lagi');
    if (e === 'quota') showPro(true);
    $('prog').classList.add('hidden'); loadQuota();
  }
  if (wl) wl.release().catch(() => {});
  working = false; $('go').disabled = false;
};

// ===== Riwayat (tersimpan di perangkat) =====
const db = new Promise((ok) => { const r = indexedDB.open('clipsmart', 1); r.onupgradeneeded = () => r.result.createObjectStore('h', { keyPath: 'id' }); r.onsuccess = () => ok(r.result); r.onerror = () => ok(null); });
const tx = async (m, f) => { const d = await db; if (!d) return []; return new Promise((ok) => { try { const t = d.transaction('h', m); const r = f(t.objectStore('h')); t.oncomplete = () => ok(r && r.result); t.onerror = t.onabort = () => ok([]); } catch { ok([]); } }); };
async function renderHist() {
  const all = ((await tx('readonly', (s) => s.getAll())) || []).sort((x, y) => y.date - x.date);
  for (const o of all.slice(10)) await tx('readwrite', (s) => s.delete(o.id));
  const list = all.slice(0, 10);
  $('hempty').classList.toggle('hidden', list.length > 0);
  $('hist').innerHTML = list.map((o) => { const u = URL.createObjectURL(o.blob); return `<div class="rounded-2xl overflow-hidden bg-neutral-900 ${o.ori === 'l' ? 'col-span-2' : ''}">
    <video src="${u}#t=0.1" controls playsinline preload="metadata" class="w-full ${o.ori === 'l' ? 'aspect-video' : 'aspect-[9/16]'} object-cover"></video>
    <div class="flex items-center justify-between px-4 py-3 text-sm"><span class="text-neutral-500">${new Date(o.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}${o.hd === true ? ' · Super HD' : o.hd === false ? ' · HD' : ''}</span>
    <span><a href="${u}" download="clip.${o.ext}" class="font-bold text-sky-300">Unduh</a></span></div></div>`; }).join('');
}

$('show').innerHTML = SHOWCASE.map(([t, u]) => `<div class="relative shrink-0 snap-start w-36 h-60 rounded-2xl overflow-hidden bg-neutral-900">
  <video src="${u}" autoplay muted loop playsinline preload="metadata" class="w-full h-full object-cover"></video>
  <div class="absolute inset-x-0 bottom-0 p-3 pt-10 bg-gradient-to-t from-black/80 text-sm font-bold">${t}</div></div>`).join('');

loadQuota(); renderHist();
if (localStorage.cs_hold) release('refund').then(loadQuota);
if (localStorage.cs_order) claim(localStorage.cs_order, 1).then((c) => { if (c) { showPro(true); got(c); } });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
