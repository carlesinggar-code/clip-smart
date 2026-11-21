
const PAY_LINK = 'https://wa.me/628338975109?text=Halo%2C%20mau%20beli%20Clip%20Smart%20Pro'; // ganti dengan nomor WhatsApp-mu
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
const showPro = (v) => { $('pro').classList.toggle('hidden', !v); $('pro').classList.toggle('flex', v); };

async function loadQuota() {
  try { q = await (await fetch('/quota', { headers: { 'x-id': id } })).json(); } catch {}
  document.body.classList.toggle('is-pro', !!q.pro); $('up').textContent = q.pro ? 'Pro ✦' : 'Premium';
  $('quota').textContent = `${Math.max(q.max - q.used, 0)}/${q.max} minggu ini`;
}

const setOri = (o) => { ori = o; document.querySelectorAll('.ori').forEach((b) => { const on = b.dataset.o === o; b.className = 'ori py-2.5 rounded-full ' + (on ? 'bg-sky-300 text-neutral-900' : 'text-neutral-400'); }); };
document.querySelectorAll('.ori').forEach((b) => (b.onclick = () => setOri(b.dataset.o)));
setOri('p');
$('up').onclick = $('up2').onclick = () => showPro(true);
$('x').onclick = () => showPro(false);
$('pay').onclick = () => open(PAY_LINK);
$('redeem').onclick = async () => {
  try {
    const r = await fetch('/redeem', { method: 'POST', headers: { 'x-id': id }, body: JSON.stringify({ code: $('code').value }) });
    if (r.ok) { toast('Pro aktif'); showPro(false); loadQuota(); return; }
    const d = await r.json(); toast({ max: 'Kode sudah dipakai di 2 perangkat', expired: 'Kode kedaluwarsa' }[d.error] || 'Kode salah');
  } catch { toast('Tidak ada koneksi'); }
};
$('file').onchange = (e) => { file = e.target.files[0]; $('fname').textContent = file ? file.name : 'Pilih video'; };
['dragover', 'drop'].forEach((ev) => $('drop').addEventListener(ev, (e) => {
  e.preventDefault();
  if (ev === 'drop' && e.dataTransfer.files[0]) { file = e.dataTransfer.files[0]; $('fname').textContent = file.name; }
}));

// Audio 8 kHz mono -> WAV base64 (kecil, cukup untuk analisis suara)
async function audioWav(f) {
  const ctx = new (window.AudioContext || webkitAudioContext)();
  const buf = await ctx.decodeAudioData(await f.arrayBuffer());
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
  return { b64: btoa(b), dur: buf.duration, pcm };
}

async function analyze(b64, n) {
  const r = await fetch('/analyze', { method: 'POST', headers: { 'x-id': id, 'x-count': String(n), 'Content-Type': 'text/plain' }, body: b64 });
  if (r.status === 429) throw 'quota';
  if (!r.ok) return null;
  try { const c = JSON.parse((await r.json()).candidates[0].content.parts[0].text); return Array.isArray(c) && c.length ? c : null; } catch { return null; }
}

// Cadangan tanpa AI: ambil jendela 30 detik dengan suara paling ramai/keras
function localPick(pcm, n) {
  const R = 8000, secs = Math.floor(pcm.length / R), e = [];
  for (let s = 0; s < secs; s++) { let t = 0; for (let i = s * R; i < (s + 1) * R; i += 4) t += pcm[i] * pcm[i]; e.push(t); }
  const L = Math.min(30, secs), sc = [], out = [];
  let w = e.slice(0, L).reduce((x, y) => x + y, 0);
  for (let s = 0; s + L <= secs; s++) { if (s) w += e[s + L - 1] - e[s - 1]; sc.push([w, s]); }
  sc.sort((x, y) => y[0] - x[0]);
  for (const [, s] of sc) { if (out.length >= n) break; if (out.every((o) => Math.abs(o.start - s) >= L)) out.push({ start: s, end: s + L }); }
  return out;
}

// Potong klip 9:16 langsung di browser (tanpa server)
function cut(src, start, end, hd, o) {
  return new Promise((res) => {
    const v = document.createElement('video'); v.src = src; v.playsInline = true;
    const L = o === 'l', W = L ? (hd ? 1920 : 1280) : (hd ? 1080 : 720), H = L ? (hd ? 1080 : 720) : (hd ? 1920 : 1280);
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    v.onloadedmetadata = () => { v.currentTime = start; };
    v.onseeked = () => {
      v.onseeked = null;
      const ac = new AudioContext(), d = ac.createMediaStreamDestination();
      ac.createMediaElementSource(v).connect(d);
      const st = c.captureStream(30); d.stream.getAudioTracks().forEach((t) => st.addTrack(t));
      const mime = ['video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
      const rec = new MediaRecorder(st, { mimeType: mime, videoBitsPerSecond: hd ? 8e6 : 4e6 }), ch = [];
      rec.ondataavailable = (e) => ch.push(e.data);
      rec.onstop = () => { ac.close(); const blob = new Blob(ch, { type: mime }); res({ url: URL.createObjectURL(blob), blob, ext: mime.includes('mp4') ? 'mp4' : 'webm' }); };
      const wide = v.videoWidth / v.videoHeight > W / H;
      const sh = wide ? v.videoHeight : v.videoWidth * H / W, sw = wide ? v.videoHeight * W / H : v.videoWidth;
      const draw = () => {
        g.drawImage(v, (v.videoWidth - sw) / 2, (v.videoHeight - sh) / 2, sw, sh, 0, 0, W, H);
        if (v.currentTime >= end || v.ended) { rec.stop(); v.pause(); } else requestAnimationFrame(draw);
      };
      rec.start(); v.play(); draw();
    };
  });
}

$('go').onclick = async () => {
  if (!file) return toast('Pilih video dulu');
  if (q.used >= q.max) return showPro(true);
  $('go').disabled = true; $('out').innerHTML = '';
  try {
    prog('Membaca audio', 10);
    const { b64, dur, pcm } = await audioWav(file);
    if (dur > 720) throw 'long';
    prog('Mencari momen terbaik', 35);
    const n = q.pro ? 2 : 1;
    let clips = await analyze(b64, n);
    if (!clips) clips = localPick(pcm, n);
    clips = clips.filter((c) => c.end > c.start).slice(0, n);
    if (!clips.length) throw 'err';
    const src = URL.createObjectURL(file);
    for (let i = 0; i < clips.length; i++) {
      const { start, end } = clips[i];
      prog(`Membuat klip ${i + 1}/${clips.length}`, 50 + (i * 45) / clips.length);
      const { url, ext, blob } = await cut(src, start, Math.min(end, start + 60), q.pro, ori);
      await tx('readwrite', (s) => s.put({ id: Date.now() + i, blob, ext, ori, date: Date.now() }));
      $('out').insertAdjacentHTML('beforeend',
        `<div class="rounded-2xl overflow-hidden bg-neutral-900 ${ori === 'l' ? 'col-span-2' : ''}"><video src="${url}" controls playsinline class="w-full ${ori === 'l' ? 'aspect-video' : 'aspect-[9/16]'} object-cover"></video>
         <a href="${url}" download="clip-${i + 1}.${ext}" class="block text-center py-3 font-bold text-sky-300">Unduh</a></div>`);
    }
    prog('Selesai', 100); q.used++; loadQuota(); renderHist();
  } catch (e) {
    toast({ quota: 'Kuota habis', long: 'Maksimal 12 menit' }[e] || 'Gagal, coba lagi');
    if (e === 'quota') showPro(true);
    $('prog').classList.add('hidden');
  }
  $('go').disabled = false;
};

// ===== Riwayat (tersimpan di perangkat) =====
const db = new Promise((ok) => { const r = indexedDB.open('clipsmart', 1); r.onupgradeneeded = () => r.result.createObjectStore('h', { keyPath: 'id' }); r.onsuccess = () => ok(r.result); r.onerror = () => ok(null); });
const tx = async (m, f) => { const d = await db; if (!d) return []; return new Promise((ok) => { const t = d.transaction('h', m); const r = f(t.objectStore('h')); t.oncomplete = () => ok(r && r.result); }); };
async function renderHist() {
  const all = ((await tx('readonly', (s) => s.getAll())) || []).sort((x, y) => y.date - x.date);
  for (const o of all.slice(20)) await tx('readwrite', (s) => s.delete(o.id));
  const list = all.slice(0, 20);
  $('hempty').classList.toggle('hidden', list.length > 0); $('clr').classList.toggle('hidden', !list.length);
  $('hist').innerHTML = list.map((o) => { const u = URL.createObjectURL(o.blob); return `<div class="rounded-2xl overflow-hidden bg-neutral-900 ${o.ori === 'l' ? 'col-span-2' : ''}">
    <video src="${u}#t=0.1" controls playsinline preload="metadata" class="w-full ${o.ori === 'l' ? 'aspect-video' : 'aspect-[9/16]'} object-cover"></video>
    <div class="flex items-center justify-between px-4 py-3 text-sm"><span class="text-neutral-500">${new Date(o.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</span>
    <span><a href="${u}" download="clip.${o.ext}" class="font-bold text-sky-300">Unduh</a> <button data-d="${o.id}" class="ml-3 text-neutral-500">Hapus</button></span></div></div>`; }).join('');
  document.querySelectorAll('[data-d]').forEach((b) => (b.onclick = async () => { await tx('readwrite', (s) => s.delete(+b.dataset.d)); renderHist(); }));
}
$('clr').onclick = async () => { await tx('readwrite', (s) => s.clear()); renderHist(); };

$('show').innerHTML = SHOWCASE.map(([t, u]) => `<div class="relative shrink-0 snap-start w-36 h-60 rounded-2xl overflow-hidden bg-neutral-900">
  <video src="${u}" autoplay muted loop playsinline preload="metadata" class="w-full h-full object-cover"></video>
  <div class="absolute inset-x-0 bottom-0 p-3 pt-10 bg-gradient-to-t from-black/80 text-sm font-bold">${t}</div></div>`).join('');

loadQuota(); renderHist();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
