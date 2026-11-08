'use strict';
/* Rapikan — semua proses lokal di perangkat. Tidak ada fetch ke server. */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const h = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
};
const fmt = b => { if (b == null) return '-'; const u = ['B', 'KB', 'MB', 'GB']; let i = 0; while (b >= 1024 && i < 3) { b /= 1024; i++; } return (i ? b.toFixed(b < 10 ? 1 : 0) : b) + ' ' + u[i]; };
const fdate = t => new Date(t).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const isImg = f => /^image\//.test(f.type) || /\.(jpe?g|png|heic|heif|webp|gif)$/i.test(f.name);
const isVid = f => /^video\//.test(f.type) || /\.(mov|mp4|m4v|webm)$/i.test(f.name);
const icon = f => f.kind === 'folder' ? '📁' : isImg(f) ? '🖼️' : isVid(f) ? '🎬' : /pdf/.test(f.type) || /\.pdf$/i.test(f.name) ? '📕' : /^audio/.test(f.type) ? '🎵' : /^text|json/.test(f.type) ? '📝' : /zip|compressed/.test(f.type) ? '🗜️' : '📄';
function toast(msg, ms = 2200) { const t = h('div', { class: 'toast' }, msg); document.body.append(t); setTimeout(() => t.remove(), ms); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const baseName = n => n.replace(/\.[^.]+$/, '');

/* ---------- Tab ---------- */
$$('nav button').forEach(b => b.onclick = () => showTab(b.dataset.tab));
function showTab(t) {
  $$('nav button').forEach(x => x.classList.toggle('on', x.dataset.tab === t));
  $$('main>section').forEach(s => s.classList.toggle('hide', s.id !== 'tab-' + t));
  if (t === 'file') renderVault();
  if (t === 'info') showUsage();
  scrollTo(0, 0);
}
function segVal(id) { return $(id + ' .on').dataset.v; }
$$('.seg').forEach(seg => seg.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  seg.dispatchEvent(new Event('change'));
}));

/* ---------- Bagikan / simpan ---------- */
function shareFiles(files) {
  // Harus dipanggil langsung dari klik (aturan iOS).
  if (!files.length) return toast('Tidak ada file');
  if (navigator.canShare && navigator.canShare({ files })) {
    navigator.share({ files }).catch(e => { if (e.name !== 'AbortError') downloadFiles(files); });
  } else downloadFiles(files);
}
function downloadFiles(files) {
  files.forEach((f, i) => setTimeout(() => {
    const a = h('a', { href: URL.createObjectURL(f), download: f.name }); document.body.append(a); a.click(); a.remove();
  }, i * 400));
}

/* ======================================================
   KOMPRES
   ====================================================== */
let kFiles = [], kResults = [];
$('#kQ').oninput = e => $('#kQv').textContent = e.target.value;
$('#kIn').onchange = e => setKFiles([...e.target.files]);
function setKFiles(files) {
  kFiles = files.filter(f => isImg(f) || isVid(f));
  const tot = kFiles.reduce((a, f) => a + f.size, 0);
  $('#kPicked').textContent = kFiles.length ? `${kFiles.length} file dipilih · ${fmt(tot)} (${kFiles.filter(isImg).length} foto, ${kFiles.filter(isVid).length} video)` : '';
  $('#kGo').disabled = !kFiles.length;
}

let audioCtx = null;
$('#kGo').onclick = async () => {
  // Buat AudioContext di dalam klik (wajib di iOS) untuk menyalin suara video.
  if (kFiles.some(isVid)) {
    try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); audioCtx.resume(); } catch { audioCtx = null; }
  }
  const go = $('#kGo'); go.disabled = true; $('#kIn').disabled = true;
  kResults = [];
  $('#kResCard').classList.remove('hide'); $('#kList').innerHTML = ''; $('#kStat').innerHTML = '';
  const opt = { imgMax: +segVal('#kImgMax'), q: $('#kQ').value / 100, vidRes: +segVal('#kVidRes'), vidLvl: +segVal('#kVidBr') };
  const wake = await wakeLock();
  for (let i = 0; i < kFiles.length; i++) {
    const f = kFiles[i];
    const row = h('div', { class: 'item' }, h('div', { class: 'th' }, isVid(f) ? '🎬' : '🖼️'), h('div', { class: 'meta' }, h('div', { class: 'nm' }, f.name), h('div', { class: 'dt' }, 'menunggu…')));
    $('#kList').append(row);
    const dt = row.querySelector('.dt');
    const setP = p => { $('#kBar').style.width = ((i + p) / kFiles.length * 100) + '%'; };
    $('#kStatus').textContent = `Memproses ${i + 1}/${kFiles.length}: ${f.name}`;
    try {
      dt.textContent = 'memproses…';
      const out = isVid(f) ? await compressVideo(f, opt, p => { setP(p); dt.textContent = `memproses… ${Math.round(p * 100)}%`; }) : await compressImage(f, opt);
      const better = out.size < f.size;
      const r = { orig: f, out: better ? out : null };
      kResults.push(r);
      if (isImg(out)) { const u = URL.createObjectURL(out); row.querySelector('.th').replaceChildren(h('img', { src: u })); }
      dt.innerHTML = better
        ? `${fmt(f.size)} → <b class="good">${fmt(out.size)}</b> (−${Math.round((1 - out.size / f.size) * 100)}%)`
        : `<span class="warntx">Sudah kecil (${fmt(f.size)}) — tidak diubah</span>`;
    } catch (e) {
      console.error(e);
      kResults.push({ orig: f, out: null, err: e.message });
      dt.innerHTML = `<span class="badtx">Gagal: ${e.message}</span>`;
    }
    setP(1);
  }
  if (wake) wake.release().catch(() => {});
  const before = kResults.reduce((a, r) => a + r.orig.size, 0);
  const after = kResults.reduce((a, r) => a + (r.out ? r.out.size : r.orig.size), 0);
  $('#kStat').innerHTML = `<div><b>${fmt(before)}</b><span>Sebelum</span></div><div><b>${fmt(after)}</b><span>Sesudah</span></div><div><b class="good">${fmt(before - after)}</b><span>Hemat</span></div>`;
  $('#kStatus').textContent = `Selesai: ${kResults.filter(r => r.out).length} file dikompres.`;
  go.disabled = false; $('#kIn').disabled = false; $('#kIn').value = '';
};
$('#kShare').onclick = () => shareFiles(kResults.filter(r => r.out).map(r => r.out));
$('#kVault').onclick = async () => {
  const outs = kResults.filter(r => r.out).map(r => r.out);
  if (!outs.length) return toast('Tidak ada hasil');
  const dir = await ensureFolder('Hasil kompres');
  for (const f of outs) await vaultAddFile(f, dir);
  toast(`${outs.length} file disimpan ke Brankas › Hasil kompres`);
};

async function wakeLock() { try { return await navigator.wakeLock.request('screen'); } catch { return null; } }

function loadImage(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = () => res({ img, url });
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('format foto tidak didukung')); };
    img.src = url;
  });
}
const MAX_AREA = 16000000; // batas kanvas Safari iOS
async function compressImage(file, { imgMax, q }) {
  const { img, url } = await loadImage(file);
  try {
    let w = img.naturalWidth, hh = img.naturalHeight;
    let s = 1;
    if (imgMax && Math.max(w, hh) > imgMax) s = imgMax / Math.max(w, hh);
    if (w * hh * s * s > MAX_AREA) s = Math.sqrt(MAX_AREA / (w * hh));
    w = Math.max(1, Math.round(w * s)); hh = Math.max(1, Math.round(hh * s));
    const c = document.createElement('canvas'); c.width = w; c.height = hh;
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, hh);
    x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, 0, w, hh);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', q));
    c.width = c.height = 0;
    if (!blob) throw new Error('gagal membuat JPEG');
    return new File([blob], baseName(file.name) + '-kecil.jpg', { type: 'image/jpeg', lastModified: Date.now() });
  } finally { URL.revokeObjectURL(url); }
}

function pickRecMime() {
  const c = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  if (!window.MediaRecorder) return null;
  return c.find(m => MediaRecorder.isTypeSupported(m)) || '';
}
async function compressVideo(file, { vidRes, vidLvl }, onProg) {
  const mime = pickRecMime();
  if (mime == null) throw new Error('perangkat tidak mendukung perekaman video');
  const url = URL.createObjectURL(file);
  const v = document.createElement('video');
  v.playsInline = true; v.setAttribute('playsinline', ''); v.preload = 'auto'; v.src = url;
  v.style.cssText = 'position:fixed;left:-9999px;width:2px;height:2px';
  document.body.append(v);
  const cleanup = () => { v.pause(); v.remove(); URL.revokeObjectURL(url); };
  try {
    await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error('video tidak bisa dibaca')); });
    let w = v.videoWidth, hh = v.videoHeight;
    if (!w || !hh) throw new Error('ukuran video tidak terbaca');
    const short = Math.min(w, hh);
    if (short > vidRes) { const s = vidRes / short; w = Math.round(w * s / 2) * 2; hh = Math.round(hh * s / 2) * 2; }
    const pixels = w * hh;
    const bpp = [0, 0.06, 0.09, 0.13][vidLvl]; // bit per piksel per frame @30fps
    const vbr = Math.round(Math.max(400000, pixels * 30 * bpp));
    const c = document.createElement('canvas'); c.width = w; c.height = hh;
    const x = c.getContext('2d');
    const stream = c.captureStream(30);
    let hasAudio = false;
    if (audioCtx) {
      try {
        const src = audioCtx.createMediaElementSource(v);
        const dest = audioCtx.createMediaStreamDestination();
        src.connect(dest);
        dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
        hasAudio = true;
      } catch (e) { console.warn('audio', e); }
    }
    if (!hasAudio) v.muted = true;
    const rec = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: vbr, audioBitsPerSecond: 128000 });
    const chunks = [];
    rec.ondataavailable = e => e.data.size && chunks.push(e.data);
    const done = new Promise(r => rec.onstop = r);
    let running = true;
    const draw = () => {
      if (!running) return;
      x.drawImage(v, 0, 0, w, hh);
      if (v.duration) onProg(Math.min(1, v.currentTime / v.duration));
      if ('requestVideoFrameCallback' in v) v.requestVideoFrameCallback(draw); else requestAnimationFrame(draw);
    };
    x.fillStyle = '#000'; x.fillRect(0, 0, w, hh);
    rec.start(1000);
    try { await v.play(); }
    catch (e) { v.muted = true; await v.play(); }
    draw();
    await new Promise((res, rej) => { v.onended = res; v.onerror = () => rej(new Error('pemutaran video gagal')); });
    running = false;
    x.drawImage(v, 0, 0, w, hh);
    await sleep(250);
    rec.stop(); await done;
    stream.getTracks().forEach(t => t.stop());
    const type = (rec.mimeType || mime || 'video/mp4').split(';')[0];
    const ext = type.includes('webm') ? 'webm' : 'mp4';
    return new File(chunks, baseName(file.name) + '-kecil.' + ext, { type, lastModified: Date.now() });
  } finally { cleanup(); }
}

/* ======================================================
   BERSIHKAN
   ====================================================== */
let bEntries = []; // {id, name, size, type, file(Blob), thumb, dhash, sha, vaultId, lastModified}
let bSel = new Set();
$('#bSrc').addEventListener('change', () => {
  const v = segVal('#bSrc') === 'vault';
  $('#bPickLbl').classList.toggle('hide', v); $('#bScanVault').classList.toggle('hide', !v);
});
$('#bIn').onchange = e => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) scan(fs.map((f, i) => ({ id: 'p' + i, name: f.name, size: f.size, type: f.type, file: f, lastModified: f.lastModified }))); };
$('#bScanVault').onclick = async () => {
  const all = (await dbAll()).filter(x => x.kind === 'file');
  if (!all.length) return toast('Brankas masih kosong');
  scan(all.map(x => ({ id: x.id, name: x.name, size: x.size, type: x.type, file: x.blob, vaultId: x.id, lastModified: x.modified })));
};

async function sha256(blob) {
  const buf = await blob.arrayBuffer();
  const d = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function imgInfo(blob) {
  const { img, url } = await loadImage(blob);
  try {
    const c = document.createElement('canvas'); const x = c.getContext('2d', { willReadFrequently: true });
    c.width = 9; c.height = 8; x.drawImage(img, 0, 0, 9, 8);
    const d = x.getImageData(0, 0, 9, 8).data; let bits = '';
    const g = i => d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    for (let y = 0; y < 8; y++) for (let k = 0; k < 8; k++) { const i = (y * 9 + k) * 4; bits += g(i) > g(i + 4) ? '1' : '0'; }
    const tw = 120, s = tw / Math.max(img.naturalWidth, img.naturalHeight);
    c.width = Math.max(1, Math.round(img.naturalWidth * s)); c.height = Math.max(1, Math.round(img.naturalHeight * s));
    x.drawImage(img, 0, 0, c.width, c.height);
    return { dhash: bits, thumb: c.toDataURL('image/jpeg', 0.6), w: img.naturalWidth, h: img.naturalHeight };
  } finally { URL.revokeObjectURL(url); }
}
const ham = (a, b) => { let n = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++; return n; };

async function scan(entries) {
  bEntries = entries; bSel = new Set();
  $('#bResCard').classList.remove('hide'); $('#bGroups').classList.add('hide'); $('#bStat').innerHTML = '';
  const bar = $('#bBar'), st = $('#bStatus');
  // 1) duplikat persis: kelompokkan per ukuran, hash hanya yang ukurannya sama
  const bySize = new Map();
  entries.forEach(e => { if (!bySize.has(e.size)) bySize.set(e.size, []); bySize.get(e.size).push(e); });
  const needHash = [...bySize.values()].filter(g => g.length > 1).flat();
  const imgs = entries.filter(e => isImg(e));
  const total = needHash.length + imgs.length || 1; let done = 0;
  for (const e of needHash) { st.textContent = `Cek duplikat ${++done}/${total}…`; try { e.sha = await sha256(e.file); } catch {} bar.style.width = (done / total * 100) + '%'; }
  for (const e of imgs) {
    st.textContent = `Analisis foto ${++done}/${total}…`;
    try { Object.assign(e, await imgInfo(e.file)); } catch {}
    bar.style.width = (done / total * 100) + '%';
    if (done % 10 === 0) await sleep(0);
  }
  // kelompok duplikat persis
  const bySha = new Map();
  entries.filter(e => e.sha).forEach(e => { if (!bySha.has(e.sha)) bySha.set(e.sha, []); bySha.get(e.sha).push(e); });
  const dupGroups = [...bySha.values()].filter(g => g.length > 1);
  // anggota duplikat tidak ikut "mirip", kecuali wakil pertama tiap grup
  const inDup = new Set(dupGroups.flatMap(g => g.slice(1)).map(e => e.id));
  // kelompok foto mirip (dHash jarak <= 6), tidak termasuk duplikat persis
  const cand = imgs.filter(e => e.dhash && !inDup.has(e.id));
  const used = new Set(); const simGroups = [];
  for (let i = 0; i < cand.length; i++) {
    if (used.has(cand[i].id)) continue;
    const g = [cand[i]];
    for (let j = i + 1; j < cand.length; j++) if (!used.has(cand[j].id) && ham(cand[i].dhash, cand[j].dhash) <= 6) { g.push(cand[j]); used.add(cand[j].id); }
    if (g.length > 1) { used.add(cand[i].id); simGroups.push(g); }
  }
  // screenshot: PNG atau nama mengandung screenshot/tangkapan
  const shots = entries.filter(e => /screenshot|tangkapan|screen shot/i.test(e.name) || (isImg(e) && (/png/i.test(e.type) || /\.png$/i.test(e.name))));
  const biggest = [...entries].sort((a, b) => b.size - a.size).slice(0, 15).filter(e => e.size > 0);

  // saran otomatis: di tiap kelompok, simpan satu (terbesar / resolusi tertinggi), tandai sisanya
  const keepBest = g => [...g].sort((a, b) => ((b.w || 0) * (b.h || 0) - (a.w || 0) * (a.h || 0)) || (b.size - a.size))[0];
  dupGroups.forEach(g => { const k = g[0]; g.forEach(e => e !== k && bSel.add(e.id)); });
  simGroups.forEach(g => { const k = keepBest(g); g.forEach(e => e !== k && bSel.add(e.id)); });

  const dupWaste = dupGroups.reduce((a, g) => a + g.slice(1).reduce((s, e) => s + e.size, 0), 0);
  bar.style.width = '100%';
  st.textContent = `Selesai memeriksa ${entries.length} file (${fmt(entries.reduce((a, e) => a + e.size, 0))}).`;
  $('#bStat').innerHTML = `<div><b>${dupGroups.length}</b><span>Grup duplikat</span></div><div><b>${simGroups.length}</b><span>Grup mirip</span></div><div><b>${fmt(dupWaste)}</b><span>Boros duplikat</span></div>`;

  const out = $('#bOut'); out.innerHTML = '';
  const section = (title, groups, note) => {
    if (!groups.length) return;
    out.append(h('h2', {}, title));
    if (note) out.append(h('p', { class: 'mut' }, note));
    groups.forEach((g, i) => {
      const box = h('div', { class: 'grp' }, h('h3', {}, g.label || `Grup ${i + 1} · ${g.length} file`));
      (g.items || g).forEach(e => box.append(bRow(e)));
      out.append(box);
    });
  };
  section('Duplikat persis', dupGroups, 'Isi file sama persis. Yang pertama disimpan, sisanya ditandai.');
  section('Foto mirip', simGroups, 'Foto beruntun / hampir sama. Yang resolusinya tertinggi disimpan, sisanya ditandai — cek dulu.');
  if (shots.length) section('Kemungkinan screenshot', [{ label: `${shots.length} file`, items: shots }]);
  section('File terbesar', [{ label: 'Kandidat untuk dikompres', items: biggest }]);
  if (!out.children.length) out.append(h('p', {}, 'Tidak ada yang perlu dibersihkan 🎉'));
  const vault = entries.some(e => e.vaultId);
  $('#bDel').classList.toggle('hide', !vault);
  $('#bNote').innerHTML = vault ? '' : 'iPhone tidak mengizinkan app web menghapus dari app Foto. Hapus manual file yang ditandai di app <b>Foto</b> (nama & tanggal tercantum), atau <b>kompres</b> dulu yang besar.';
  $('#bGroups').classList.remove('hide');
  updSel();
}
function bRow(e) {
  const cb = h('input', { type: 'checkbox' }); cb.checked = bSel.has(e.id);
  cb.dataset.id = e.id;
  cb.onchange = () => { $$(`#bOut input[data-id="${CSS.escape(e.id)}"]`).forEach(x => x.checked = cb.checked); cb.checked ? bSel.add(e.id) : bSel.delete(e.id); updSel(); };
  const th = h('div', { class: 'th' }, e.thumb ? h('img', { src: e.thumb }) : icon(e));
  th.onclick = () => openPreview({ name: e.name, type: e.type, blob: e.file });
  return h('div', { class: 'item' }, cb, th,
    h('div', { class: 'meta' }, h('div', { class: 'nm' }, e.name), h('div', { class: 'dt' }, `${fmt(e.size)}${e.w ? ` · ${e.w}×${e.h}` : ''}${e.lastModified ? ' · ' + fdate(e.lastModified) : ''}`)));
}
function updSel() {
  const sel = bEntries.filter(e => bSel.has(e.id));
  $('#bSelInfo').textContent = `${sel.length} ditandai · ${fmt(sel.reduce((a, e) => a + e.size, 0))}`;
}
$('#bAct1').onclick = () => {
  const sel = bEntries.filter(e => bSel.has(e.id) && (isImg(e) || isVid(e)));
  if (!sel.length) return toast('Tandai foto/video dulu');
  setKFiles(sel.map(e => e.file instanceof File ? e.file : new File([e.file], e.name, { type: e.type })));
  showTab('kompres'); toast(`${sel.length} file siap dikompres`);
};
$('#bDel').onclick = async () => {
  const ids = bEntries.filter(e => bSel.has(e.id) && e.vaultId).map(e => e.vaultId);
  if (!ids.length) return toast('Tidak ada yang ditandai');
  if (!confirm(`Hapus ${ids.length} file dari Brankas? Tidak bisa dibatalkan.`)) return;
  for (const id of ids) await dbDel(id);
  toast(`${ids.length} file dihapus`);
  $('#bScanVault').click();
};

/* ======================================================
   BRANKAS (IndexedDB)
   ====================================================== */
let dbP = null;
function db() {
  return dbP ||= new Promise((res, rej) => {
    const r = indexedDB.open('rapikan', 1);
    r.onupgradeneeded = () => { const s = r.result.createObjectStore('items', { keyPath: 'id' }); s.createIndex('parent', 'parent'); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function tx(mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction('items', mode); const s = t.objectStore('items');
    let out; const r = fn(s); if (r) r.onsuccess = () => out = r.result;
    t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('dibatalkan'));
  });
}
const dbAll = () => tx('readonly', s => s.getAll());
const dbGet = id => tx('readonly', s => s.get(id));
const dbPut = o => tx('readwrite', s => s.put(o));
const dbKids = p => tx('readonly', s => s.index('parent').getAll(p));
async function dbDel(id) { const kids = await dbKids(id); for (const k of kids) await dbDel(k.id); await tx('readwrite', s => s.delete(id)); }
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

let cwd = 'root', fSelMode = false, fSel = new Set();
async function uniqueName(name, parent, skipId) {
  const names = new Set((await dbKids(parent)).filter(x => x.id !== skipId).map(x => x.name.toLowerCase()));
  if (!names.has(name.toLowerCase())) return name;
  const m = name.match(/^(.*?)(\.[^.]+)?$/); let i = 2;
  while (names.has(`${m[1]} (${i})${m[2] || ''}`.toLowerCase())) i++;
  return `${m[1]} (${i})${m[2] || ''}`;
}
async function vaultAddFile(f, parent = cwd) {
  const now = Date.now();
  await dbPut({ id: uid(), kind: 'file', parent, name: await uniqueName(f.name || 'file', parent), type: f.type || '', size: f.size, blob: f, created: now, modified: f.lastModified || now });
}
async function ensureFolder(name, parent = 'root') {
  const ex = (await dbKids(parent)).find(x => x.kind === 'folder' && x.name === name);
  if (ex) return ex.id;
  const id = uid(); await dbPut({ id, kind: 'folder', parent, name, created: Date.now(), modified: Date.now() }); return id;
}
async function folderSize(id) { let t = 0; for (const k of await dbKids(id)) t += k.kind === 'folder' ? await folderSize(k.id) : k.size; return t; }

$('#fIn').onchange = async e => {
  const fs = [...e.target.files]; e.target.value = '';
  if (!fs.length) return;
  toast(`Mengimpor ${fs.length} file…`);
  for (const f of fs) await vaultAddFile(f);
  navigator.storage?.persist?.();
  renderVault(); toast(`${fs.length} file masuk Brankas`);
};
$('#fNewDir').onclick = async () => {
  const n = prompt('Nama folder baru:', 'Folder baru'); if (!n || !n.trim()) return;
  const name = await uniqueName(n.trim(), cwd);
  await dbPut({ id: uid(), kind: 'folder', parent: cwd, name, created: Date.now(), modified: Date.now() });
  renderVault();
};
$('#fSelMode').onclick = () => { fSelMode = !fSelMode; fSel.clear(); $('#fSelMode').textContent = fSelMode ? 'Batal' : 'Pilih'; $('#fSelBar').classList.toggle('hide', !fSelMode); renderVault(); };
$('#fSearch').oninput = () => renderVault();
$('#fSort').onchange = () => renderVault();
$('#fSelAll').onclick = async () => { const ks = await currentList(); const all = ks.every(k => fSel.has(k.id)); ks.forEach(k => all ? fSel.delete(k.id) : fSel.add(k.id)); renderVault(); };
$('#fDelSel').onclick = async () => {
  if (!fSel.size) return toast('Belum ada yang dipilih');
  if (!confirm(`Hapus ${fSel.size} item (termasuk isi folder)?`)) return;
  for (const id of fSel) await dbDel(id);
  fSel.clear(); renderVault(); toast('Dihapus');
};
let shareCache = [];
$('#fShareSel').onclick = () => shareFiles(shareCache);
$('#fMove').onclick = async () => {
  if (!fSel.size) return toast('Belum ada yang dipilih');
  const dest = await pickFolder([...fSel]); if (dest == null) return;
  for (const id of fSel) { const o = await dbGet(id); o.parent = dest; o.name = await uniqueName(o.name, dest, o.id); await dbPut(o); }
  fSel.clear(); renderVault(); toast('Dipindahkan');
};

async function pathOf(id) { const p = []; while (id && id !== 'root') { const o = await dbGet(id); if (!o) break; p.unshift(o); id = o.parent; } return p; }
async function currentList() {
  const q = $('#fSearch').value.trim().toLowerCase();
  let ks = q ? (await dbAll()).filter(x => x.name.toLowerCase().includes(q)) : await dbKids(cwd);
  const so = $('#fSort').value;
  ks.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'folder' ? -1 : 1) ||
    (so === 'size' ? (b.size || 0) - (a.size || 0) : so === 'date' ? b.modified - a.modified : a.name.localeCompare(b.name, 'id', { numeric: true })));
  return ks;
}
async function renderVault() {
  const crumb = $('#fCrumb'); crumb.innerHTML = '';
  const path = await pathOf(cwd);
  const link = (name, id) => h('a', { onclick: () => { cwd = id; $('#fSearch').value = ''; fSel.clear(); renderVault(); } }, name);
  crumb.append(link('🏠 Brankas', 'root'));
  path.forEach(p => crumb.append(' › ', link(p.name, p.id)));
  const ks = await currentList();
  const list = $('#fList'); list.innerHTML = '';
  for (const k of ks) {
    const th = h('div', { class: 'th' }, icon(k));
    if (k.kind === 'file' && isImg(k)) { const u = URL.createObjectURL(k.blob); const im = h('img', { src: u, loading: 'lazy' }); im.onload = () => URL.revokeObjectURL(u); th.replaceChildren(im); }
    const meta = h('div', { class: 'meta' }, h('div', { class: 'nm' }, k.name),
      h('div', { class: 'dt' }, k.kind === 'folder' ? 'Folder' : `${fmt(k.size)} · ${fdate(k.modified)}`));
    const row = h('div', { class: 'item' });
    if (fSelMode) {
      const cb = h('input', { type: 'checkbox' }); cb.checked = fSel.has(k.id);
      cb.onchange = () => { cb.checked ? fSel.add(k.id) : fSel.delete(k.id); prepShare(); };
      row.append(cb);
    }
    row.append(th, meta);
    if (!fSelMode) row.append(h('button', { class: 'sm', onclick: ev => { ev.stopPropagation(); itemMenu(k); } }, '⋯'));
    row.onclick = ev => {
      if (ev.target.tagName === 'INPUT') return;
      if (fSelMode) { const cb = row.querySelector('input'); cb.checked = !cb.checked; cb.onchange(); return; }
      if (k.kind === 'folder') { cwd = k.id; $('#fSearch').value = ''; renderVault(); } else openPreview(k);
    };
    list.append(row);
  }
  $('#fEmpty').textContent = ks.length ? '' : ($('#fSearch').value ? 'Tidak ditemukan.' : 'Kosong. Ketuk “＋ Impor” untuk menambah file dari Foto/File.');
  prepShare(); showUsage();
}
async function prepShare() {
  // siapkan File sebelum tombol diketuk (iOS butuh share() langsung dari klik)
  const items = await Promise.all([...fSel].map(dbGet));
  shareCache = items.filter(o => o && o.kind === 'file').map(o => new File([o.blob], o.name, { type: o.type }));
}
async function pickFolder(moving) {
  const all = (await dbAll()).filter(x => x.kind === 'folder');
  const bad = new Set(moving);
  const isBad = f => { let p = f; while (p) { if (bad.has(p.id)) return true; p = all.find(x => x.id === p.parent); } return false; };
  const opts = [{ id: 'root', label: '🏠 Brankas' }];
  for (const f of all) if (!isBad(f)) opts.push({ id: f.id, label: '📁 ' + (await pathOf(f.id)).map(p => p.name).join(' › ') });
  return new Promise(res => {
    const sel = h('select', {}, opts.map(o => h('option', { value: o.id }, o.label)));
    openModal('Pindah ke…', h('div', { style: 'padding:16px;width:100%;align-self:flex-start' }, sel),
      [h('button', { onclick: () => { closeModal(); res(null); } }, 'Batal'), h('button', { class: 'pri', onclick: () => { closeModal(); res(sel.value); } }, 'Pindahkan')]);
  });
}
function itemMenu(k) {
  const file = k.kind === 'file' ? new File([k.blob], k.name, { type: k.type }) : null;
  const btns = [
    h('button', { onclick: async () => { const n = prompt('Nama baru:', k.name); if (!n || !n.trim() || n === k.name) return; k.name = await uniqueName(n.trim(), k.parent, k.id); k.modified = Date.now(); await dbPut(k); closeModal(); renderVault(); } }, '✏️ Ganti nama'),
    h('button', { onclick: async () => { closeModal(); const d = await pickFolder([k.id]); if (d == null) return; k.parent = d; k.name = await uniqueName(k.name, d, k.id); await dbPut(k); renderVault(); } }, '📂 Pindah'),
  ];
  if (file) btns.push(h('button', { onclick: () => shareFiles([file]) }, '📤 Bagikan / Simpan'));
  if (file && (isImg(k) || isVid(k))) btns.push(h('button', { onclick: () => { closeModal(); setKFiles([file]); showTab('kompres'); } }, '🗜️ Kompres'));
  btns.push(h('button', { class: 'bad', onclick: async () => { if (!confirm(`Hapus “${k.name}”?`)) return; await dbDel(k.id); closeModal(); renderVault(); } }, '🗑️ Hapus'));
  const info = k.kind === 'folder' ? 'Folder' : `${fmt(k.size)} · ${k.type || 'tidak diketahui'} · ${fdate(k.modified)}`;
  openModal(k.name, h('div', { style: 'display:flex;flex-direction:column;gap:8px;padding:16px;width:100%;align-self:flex-start' }, h('div', { class: 'mut' }, info), btns), []);
  if (k.kind === 'folder') folderSize(k.id).then(s => { const m = $('#mBody .mut'); if (m) m.textContent = `Folder · ${fmt(s)}`; });
}

/* ---------- Modal & pratinjau ---------- */
let modalUrls = [];
function openModal(title, body, bot) {
  $('#mTitle').textContent = title; $('#mBody').replaceChildren(body); $('#mBot').replaceChildren(...bot);
  $('#modal').classList.remove('hide');
}
function closeModal() { $('#modal').classList.add('hide'); $('#mBody').innerHTML = ''; modalUrls.forEach(URL.revokeObjectURL); modalUrls = []; }
$('#mClose').onclick = closeModal;
async function openPreview(k) {
  const url = URL.createObjectURL(k.blob); modalUrls.push(url);
  let body;
  if (isImg(k)) body = h('img', { src: url });
  else if (isVid(k)) body = h('video', { src: url, controls: true, playsinline: true });
  else if (/^audio/.test(k.type)) body = h('audio', { src: url, controls: true });
  else if (/pdf/.test(k.type) || /\.pdf$/i.test(k.name)) body = h('iframe', { src: url });
  else if (/^text|json|xml|csv/.test(k.type) || /\.(txt|md|csv|json|log)$/i.test(k.name)) body = h('pre', {}, (await k.blob.slice(0, 200000).text()));
  else body = h('div', { class: 'mut', style: 'padding:20px;text-align:center' }, `${icon(k)} Pratinjau tidak tersedia. ${fmt(k.blob.size)}`);
  const file = new File([k.blob], k.name, { type: k.type });
  openModal(k.name, body, [h('button', { class: 'pri', onclick: () => shareFiles([file]) }, '📤 Bagikan / Simpan')]);
}

/* ---------- Penyimpanan ---------- */
async function showUsage() {
  if (!navigator.storage?.estimate) return;
  const e = await navigator.storage.estimate();
  const per = await navigator.storage.persisted?.();
  $('#fUse').textContent = `${fmt(e.usage)} terpakai`;
  $('#iUse').innerHTML = `Terpakai <b>${fmt(e.usage)}</b> dari kuota ${fmt(e.quota)}.<br>Penyimpanan permanen: <b>${per ? 'Ya ✅' : 'Belum'}</b>`;
}
$('#iPersist').onclick = async () => { const ok = await navigator.storage?.persist?.(); toast(ok ? 'Penyimpanan permanen aktif' : 'Belum diizinkan — pasang app di Layar Utama dulu'); showUsage(); };

/* ---------- Service worker (offline) ---------- */
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js');
