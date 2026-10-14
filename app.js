'use strict';
const $ = id => document.getElementById(id);
const FONT = 'Arial, Helvetica, sans-serif';
const GROUP = '#2A9D8F';
const API = 'https://generativelanguage.googleapis.com/v1beta';
const COLORS = {
  term:'#E63946', definition:'#457B9D', member:'#2A9D8F', value:'#F4A261',
  person:'#9B5DE5', substance:'#00B4D8', structure:'#6C757D', concept:'#7B2CBF',
  plant:'#70AD47', creature:'#F15BB5', food:'#E9C46A', label:'#ADB5BD', quotation:'#FF6B6B'
};
const NAMES = {
  term:'Term', definition:'Definition', member:'Member of a group', value:'Value / Number',
  person:'Name / person', substance:'Name / substance', structure:'Name / structure',
  concept:'Name / concept', plant:'Name / plant', creature:'Name / creature',
  food:'Name / food', label:'Label', quotation:'Quotation'
};
const S = {model: 'gemini-3.8-flash', partial: false};

/* ---------- helpers ---------- */
function hex2rgb(h){ h = h.replace('#',''); return [0,2,4].map(i => parseInt(h.substr(i,2),16)); }
function lum(h){ const [r,g,b] = hex2rgb(h); return (0.299*r + 0.587*g + 0.114*b) / 255; }
function mix(a,b){ const A = hex2rgb(a), B = hex2rgb(b);
  return '#' + A.map((v,i) => Math.round((v+B[i])/2).toString(16).padStart(2,'0')).join(''); }
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const status = m => { $('status').textContent = m; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

$('legend').innerHTML = Object.keys(COLORS).map(k =>
  `<span style="background:${COLORS[k]};color:${lum(COLORS[k]) > .55 ? '#111' : '#fff'}">${NAMES[k]}</span>`).join('') +
  `<span style="background:linear-gradient(90deg,${GROUP},#888)">Gradient = member of a group</span>`;

try {
  $('key').value = localStorage.getItem('gkey') || '';
  const m = localStorage.getItem('gmodel'); if (m) $('model').value = m;
} catch(e){}

/* ---------- error reporting ---------- */
const LOG = [];
function log(m){ LOG.push(new Date().toISOString().slice(11,19) + ' ' + m); if (LOG.length > 40) LOG.shift(); }
class ApiError extends Error {
  constructor(msg, status, body){ super(msg); this.name = 'ApiError'; this.status = status; this.body = body; }
}
function buildReport(stage, err){
  const e = err || {};
  return [
    'MINDMAPPER ERROR REPORT',
    'Stage: ' + stage,
    'Message: ' + (e.message || String(err)),
    e.status ? 'HTTP status: ' + e.status : '',
    e.body ? 'API response: ' + String(e.body).slice(0, 900) : '',
    'Model: ' + ($('model').value || S.model),
    'Text length: ' + $('text').value.length,
    'Libraries loaded: pdf.js=' + (typeof pdfjsLib !== 'undefined') + ' mammoth=' + (typeof mammoth !== 'undefined') +
      ' jspdf=' + !!(window.jspdf) + ' svg2pdf=' + !!(window.svg2pdf),
    'Page: ' + location.href.split('?')[0],
    'Browser: ' + navigator.userAgent,
    '--- recent log ---', ...LOG,
    e.stack ? '--- stack ---\n' + String(e.stack).split('\n').slice(0, 4).join('\n') : ''
  ].filter(Boolean).join('\n');
}
function showError(stage, err){
  if (err && err.name === 'AbortError') return status('Cancelled.');
  $('errtxt').value = buildReport(stage, err);
  $('err').hidden = false; $('panel').open = true;
  status('Something went wrong — see the error report below.');
}
$('copyerr').onclick = async () => {
  const t = $('errtxt'); t.select();
  try { await navigator.clipboard.writeText(t.value); } catch(e){ document.execCommand('copy'); }
  status('Error report copied. Paste it to Claude.');
};
window.addEventListener('error', ev => showError('Unexpected script error', ev.error || new Error(ev.message)));
window.addEventListener('unhandledrejection', ev => showError('Unexpected async error', ev.reason));

/* ---------- reading files ---------- */
async function readFile(f){
  const n = f.name.toLowerCase();
  if (n.endsWith('.pdf')) {
    if (typeof pdfjsLib === 'undefined') throw new Error('PDF reader library did not load (blocked or offline).');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const pdf = await pdfjsLib.getDocument({data: await f.arrayBuffer()}).promise;
    let t = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const c = await (await pdf.getPage(i)).getTextContent();
      t += c.items.map(x => x.str).join(' ') + '\n';
    }
    if (t.trim().length < 20) throw new Error('No readable text found in this PDF (it may be a scan/image).');
    return t;
  }
  if (n.endsWith('.docx')) {
    if (typeof mammoth === 'undefined') throw new Error('Word reader library did not load (blocked or offline).');
    return (await mammoth.extractRawText({arrayBuffer: await f.arrayBuffer()})).value;
  }
  return f.text();
}
$('file').addEventListener('change', async e => {
  let t = $('text').value;
  for (const f of e.target.files) {
    status('Reading ' + f.name + '…');
    try { t += (t ? '\n\n' : '') + await readFile(f); }
    catch (err) { return showError('Reading file "' + f.name + '"', err); }
  }
  $('text').value = t;
  status('Loaded ' + t.length.toLocaleString() + ' characters.');
});
$('clear').onclick = () => { $('text').value = ''; $('file').value = ''; $('err').hidden = true; status('Cleared.'); };

/* ---------- Gemini ---------- */
const SYS = `You turn text into a mind-map tree. Output ONLY valid JSON, no markdown.
Node format: {"t":"short text","k":"type","m":true|false,"c":[children]}
Types (k): term, definition, member, value, person, substance, structure, concept, plant, creature, food, label, quotation.
Rules:
- Root = the central concept. If the text covers several topics, the root is the overall subject and each topic is a "label" branch.
- Branch into categories (use "label" nodes), then specific items. Prefer wide fan-out over long chains; max depth 5.
- A term node has its meaning as a child "definition" node. Numbers and measurements are "value" nodes. Direct quotes are "quotation".
- Set "m":true on any node that is a member / example / sub-item of a group, class or category.
- Keep every node concise (max 10 words) but DO NOT drop any fact, name, number or detail from the text: split long sentences into several small nodes. Never invent information.
- Use the most specific type for names (person, substance, structure, concept, plant, creature, food).`;

function chunkText(t, max = 12000){
  const out = []; let cur = '';
  for (let p of t.split(/\n+/)) {
    while (p.length > max) { if (cur) { out.push(cur); cur = ''; } out.push(p.slice(0, max)); p = p.slice(max); }
    if ((cur + p).length > max && cur) { out.push(cur); cur = ''; }
    cur += p + '\n';
  }
  if (cur.trim()) out.push(cur);
  return out;
}

async function listModels(key, signal){
  const r = await fetch(API + '/models?pageSize=200', {signal, headers: {'x-goog-api-key': key}});
  const raw = await r.text(); let j = null; try { j = JSON.parse(raw); } catch(e){}
  if (!r.ok) throw new ApiError(j?.error?.message || 'HTTP ' + r.status, r.status, raw);
  return (j.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map(m => m.name.replace(/^models\//, ''));
}
async function pickModel(key, signal){
  const ok = (await listModels(key, signal)).filter(n => /flash/.test(n) && !/lite|image|tts|audio|live|embed|thinking|exp/.test(n));
  ok.sort((a, b) => b.localeCompare(a, undefined, {numeric: true}));
  return ok[0] || null;
}

async function callGemini(model, prompt, key, signal, withMax){
  const cfg = {responseMimeType: 'application/json', temperature: 0.2};
  if (withMax) cfg.maxOutputTokens = 16384;
  const r = await fetch(`${API}/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST', signal,
    headers: {'Content-Type': 'application/json', 'x-goog-api-key': key},
    body: JSON.stringify({contents: [{parts: [{text: prompt}]}], generationConfig: cfg})
  });
  const raw = await r.text(); let j = null; try { j = JSON.parse(raw); } catch(e){}
  if (!r.ok) throw new ApiError(j?.error?.message || 'HTTP ' + r.status, r.status, raw);
  const cand = j?.candidates?.[0];
  const txt = (cand?.content?.parts || []).map(p => p.text || '').join('');
  if (!txt) throw new ApiError('Empty response (reason: ' + (cand?.finishReason || j?.promptFeedback?.blockReason || 'unknown') + ')', r.status, raw);
  return txt;
}

function repairJSON(s){
  const stack = []; let inStr = false, esc2 = false, cut = -1, cutStack = null;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) { if (esc2) esc2 = false; else if (ch === '\\') esc2 = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}' || ch === ']') { stack.pop(); cut = i + 1; cutStack = stack.slice(); }
  }
  if (cut < 0) throw new Error('No complete JSON found');
  return s.slice(0, cut) + cutStack.reverse().map(c => c === '{' ? '}' : ']').join('');
}
function parseTree(txt){
  const clean = txt.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();
  let o;
  try { o = JSON.parse(clean); }
  catch (e1) {
    try { o = JSON.parse(repairJSON(clean)); S.partial = true; log('Repaired cut-off JSON'); }
    catch (e2) { throw new Error('Gemini returned invalid JSON. Start of reply: ' + clean.slice(0, 200)); }
  }
  if (Array.isArray(o)) o = o[0];
  if (!o || typeof o !== 'object') throw new Error('Gemini reply was not a mind-map object.');
  return normalize(o);
}

async function askGemini(prompt, key, signal){
  let withMax = true, tries = 0, switched = false;
  for (;;) {
    const used = S.model;
    try {
      log('Request → ' + used);
      return parseTree(await callGemini(used, prompt, key, signal, withMax));
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      const st = e.status || 0, m = (e.message || '').toLowerCase();
      log('Failed: ' + (st || '') + ' ' + (e.message || '').slice(0, 120));
      if ([429, 500, 503].includes(st) && tries < 3) { tries++; await sleep(3000 * tries); continue; }
      if (st === 400 && withMax && m.includes('output')) { withMax = false; continue; }
      if (S.model !== used) continue;
      if (!switched && (st === 404 || m.includes('no longer available') || m.includes('not found'))) {
        switched = true;
        const alt = await pickModel(key, signal);
        if (alt && alt !== used) { S.model = alt; $('model').value = alt; log('Switched model to ' + alt); continue; }
      }
      throw e;
    }
  }
}

function normalize(n){
  return {
    t: String(n.t || '').trim() || '…',
    k: COLORS[n.k] ? n.k : 'label',
    m: !!n.m,
    c: (Array.isArray(n.c) ? n.c : []).filter(x => x && typeof x === 'object').map(normalize)
  };
}
function merge(base, add){
  for (const c of add.c) {
    const hit = base.c.find(b => b.t.toLowerCase() === c.t.toLowerCase());
    if (hit) merge(hit, c); else base.c.push(c);
  }
}
async function pool(items, n, fn){
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({length: Math.min(n, items.length)}, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

/* ---------- layout (radial + overlap removal) ---------- */
const ctx = document.createElement('canvas').getContext('2d');
const PAD = 18;

function measure(n, isRoot){
  ctx.font = (isRoot ? '700 17px ' : '600 13px ') + FONT;
  const maxW = isRoot ? 260 : 190, words = n.t.split(/\s+/), lines = []; let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; } else cur = test;
  }
  lines.push(cur);
  n.lines = lines;
  n.lh = isRoot ? 22 : 17;
  n.w = Math.ceil(Math.max(...lines.map(l => ctx.measureText(l).width))) + 26;
  n.h = lines.length * n.lh + 14;
}
function hit(a, b){
  return (a.w + b.w) / 2 + PAD - Math.abs(b.x - a.x) > 0 && (a.h + b.h) / 2 + PAD - Math.abs(b.y - a.y) > 0;
}
function hasOverlap(all){
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) if (hit(all[i], all[j])) return true;
  return false;
}
function relax(all, ms){
  const t0 = performance.now();
  for (let it = 0; it < 4000; it++) {
    let moved = false;
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      const a = all[i], b = all[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const ox = (a.w + b.w) / 2 + PAD - Math.abs(dx), oy = (a.h + b.h) / 2 + PAD - Math.abs(dy);
      if (ox > 0 && oy > 0) {
        moved = true;
        const fa = a.d === 0 ? 0 : (b.d === 0 ? 1 : .5), fb = b.d === 0 ? 0 : (a.d === 0 ? 1 : .5);
        if (ox < oy) {
          const s = dx === 0 ? (Math.random() < .5 ? -1 : 1) : Math.sign(dx), m = ox + 1;
          a.x -= s * m * fa; b.x += s * m * fb;
        } else {
          const s = dy === 0 ? (Math.random() < .5 ? -1 : 1) : Math.sign(dy), m = oy + 1;
          a.y -= s * m * fa; b.y += s * m * fb;
        }
      }
    }
    if (!moved || performance.now() - t0 > ms) break;
  }
}

function layout(root){
  const all = [];
  (function walk(n, d, p){ n.d = d; n.p = p; n.id = all.length; all.push(n); n.c.forEach(c => walk(c, d + 1, n)); })(root, 0, null);
  all.forEach(n => measure(n, n.d === 0));
  (function leaves(n){ n.l = n.c.length ? n.c.reduce((s, c) => s + leaves(c), 0) : 1; return n.l; })(root);

  const maxD = Math.max(...all.map(n => n.d)), R = [0];
  for (let d = 1; d <= maxD; d++) {
    const ring = all.filter(n => n.d === d), prev = all.filter(n => n.d === d - 1);
    const mw = Math.max(...ring.map(n => n.w)), pw = Math.max(...prev.map(n => n.w));
    const need = ring.reduce((s, n) => s + (n.w + n.h) / 2 + 18, 0) / (2 * Math.PI);
    R[d] = Math.max(R[d - 1] + pw / 2 + mw / 2 + 60, need);
  }
  root.x = 0; root.y = 0;
  (function place(n, a0, a1){
    if (!n.c.length) return;
    const total = n.c.reduce((s, c) => s + c.l, 0); let a = a0;
    for (const c of n.c) {
      const span = (a1 - a0) * c.l / total, mid = a + span / 2;
      c.x = R[c.d] * Math.cos(mid); c.y = R[c.d] * Math.sin(mid);
      place(c, a, a + span); a += span;
    }
  })(root, 0, Math.PI * 2);

  relax(all, 3000);
  for (let r = 0; r < 8 && hasOverlap(all); r++) {
    all.forEach(n => { n.x *= 1.15; n.y *= 1.15; });
    relax(all, 1500);
  }
  if (hasOverlap(all)) log('Warning: some boxes may still touch');
  return all;
}

/* ---------- rendering ---------- */
let CONTENT = '', B = null;

function render(all){
  let defs = '', edges = '', nodes = '';
  B = {minX: 1e9, minY: 1e9, maxX: -1e9, maxY: -1e9};
  for (const n of all) {
    const base = COLORS[n.k], grouped = n.m && n.p;
    let fill = base, txtBase = base;
    if (grouped) {
      const ux = n.p.x - n.x, uy = n.p.y - n.y, len = Math.hypot(ux, uy) || 1, dx = ux / len, dy = uy / len;
      defs += `<linearGradient id="g${n.id}" x1="${(.5 + dx * .5).toFixed(3)}" y1="${(.5 + dy * .5).toFixed(3)}" x2="${(.5 - dx * .5).toFixed(3)}" y2="${(.5 - dy * .5).toFixed(3)}">` +
              `<stop offset="0" stop-color="${GROUP}"/><stop offset="1" stop-color="${base}"/></linearGradient>`;
      fill = `url(#g${n.id})`; txtBase = mix(GROUP, base);
    }
    if (n.p) edges += `<line x1="${n.p.x.toFixed(1)}" y1="${n.p.y.toFixed(1)}" x2="${n.x.toFixed(1)}" y2="${n.y.toFixed(1)}" stroke="${grouped ? GROUP : base}" stroke-width="2.2" stroke-opacity=".75"/>`;
    const tc = lum(txtBase) > .55 ? '#111111' : '#ffffff';
    const x0 = n.x - n.w / 2, y0 = n.y - n.h / 2;
    nodes += `<rect x="${x0.toFixed(1)}" y="${y0.toFixed(1)}" width="${n.w}" height="${n.h}" rx="10" fill="${fill}" stroke="#ffffff" stroke-width="1.5"/>`;
    n.lines.forEach((l, i) => {
      nodes += `<text x="${n.x.toFixed(1)}" y="${(y0 + 7 + n.lh * (i + .5) + (n.d === 0 ? 6 : 4.5)).toFixed(1)}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${n.d === 0 ? 17 : 13}" font-weight="${n.d === 0 ? 700 : 600}" fill="${tc}">${esc(l)}</text>`;
    });
    B.minX = Math.min(B.minX, x0); B.minY = Math.min(B.minY, y0);
    B.maxX = Math.max(B.maxX, x0 + n.w); B.maxY = Math.max(B.maxY, y0 + n.h);
  }
  CONTENT = `<defs>${defs}</defs>${edges}${nodes}`;
  $('vp').innerHTML = CONTENT;
  fit();
}

/* ---------- infinite canvas ---------- */
const svg = $('svg'), vp = $('vp'); let V = {x: 0, y: 0, k: 1};
const apply = () => vp.setAttribute('transform', `translate(${V.x} ${V.y}) scale(${V.k})`);
function fit(){
  if (!B) return;
  const r = svg.getBoundingClientRect(), pad = 40, w = B.maxX - B.minX, h = B.maxY - B.minY;
  V.k = Math.min((r.width - pad * 2) / w, (r.height - pad * 2) / h, 2);
  V.x = r.width / 2 - (B.minX + w / 2) * V.k; V.y = r.height / 2 - (B.minY + h / 2) * V.k; apply();
}
function zoomAt(cx, cy, f){
  const r = svg.getBoundingClientRect(), px = cx - r.left, py = cy - r.top;
  const nk = Math.min(10, Math.max(0.01, V.k * f)); f = nk / V.k;
  V.x = px - (px - V.x) * f; V.y = py - (py - V.y) * f; V.k = nk; apply();
}
const zoomCenter = f => { const r = svg.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, f); };
svg.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * .0015)); }, {passive: false});
const P = new Map(); let lastD = 0;
svg.addEventListener('pointerdown', e => { svg.setPointerCapture(e.pointerId); P.set(e.pointerId, {x: e.clientX, y: e.clientY}); lastD = 0; });
svg.addEventListener('pointermove', e => {
  if (!P.has(e.pointerId)) return;
  const o = P.get(e.pointerId);
  if (P.size === 1) { V.x += e.clientX - o.x; V.y += e.clientY - o.y; apply(); }
  P.set(e.pointerId, {x: e.clientX, y: e.clientY});
  if (P.size === 2) {
    const [a, b] = [...P.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
    if (lastD) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / lastD);
    lastD = d;
  }
});
['pointerup', 'pointercancel'].forEach(ev => svg.addEventListener(ev, e => { P.delete(e.pointerId); lastD = 0; }));
$('fit').onclick = fit;
$('zin').onclick = () => zoomCenter(1.3);
$('zout').onclick = () => zoomCenter(1 / 1.3);
window.addEventListener('resize', fit);

/* ---------- check models ---------- */
$('check').onclick = async () => {
  const key = $('key').value.trim();
  if (!key) return status('Paste your Gemini API key first.');
  status('Checking models…');
  try {
    const list = await listModels(key);
    $('models').innerHTML = list.map(n => `<option value="${esc(n)}">`).join('');
    const flash = list.filter(n => /flash/.test(n)).slice(0, 6).join(', ');
    status(`Key works. ${list.length} models available. Flash models: ${flash || 'none found'}. Tap the model box to pick one.`);
  } catch (e) { showError('Checking models', e); }
};

/* ---------- generate ---------- */
let ctrl = null;
$('cancel').onclick = () => { if (ctrl) ctrl.abort(); };

$('go').onclick = async () => {
  const text = $('text').value.trim(), key = $('key').value.trim();
  if (!text) return status('Add some text first.');
  if (!key) return status('Paste your Gemini API key.');
  S.model = $('model').value.trim() || S.model; S.partial = false;
  try { localStorage.setItem('gkey', key); } catch(e){}
  $('err').hidden = true; $('go').disabled = true; $('cancel').disabled = false;
  ctrl = new AbortController();
  const t0 = Date.now(); let stage = 'Starting';
  try {
    const chunks = chunkText(text); let done = 0;
    log('Text ' + text.length + ' chars, ' + chunks.length + ' part(s), model ' + S.model);
    const tick = () => status(`Building map… ${done}/${chunks.length} parts done (${Math.round((Date.now() - t0) / 1000)}s)`);
    const note = i => chunks.length > 1 ? `This is part ${i + 1} of ${chunks.length} of one document.` : '';

    stage = 'Asking Gemini (part 1 of ' + chunks.length + ')'; tick();
    const tree = await askGemini(`${SYS}\n\n${note(0)}\n\nTEXT:\n${chunks[0]}`, key, ctrl.signal);
    done = 1; tick();

    if (chunks.length > 1) {
      stage = 'Asking Gemini (remaining parts)';
      const rest = await pool(chunks.slice(1), 3, async (c, k) => {
        const t = await askGemini(`${SYS}\n\n${note(k + 1)} Use exactly this root text: "${tree.t}".\n\nTEXT:\n${c}`, key, ctrl.signal);
        done++; tick(); return t;
      });
      rest.forEach(t => merge(tree, t));
    }

    stage = 'Arranging layout'; status('Arranging layout…'); await sleep(20);
    const all = layout(tree);
    stage = 'Drawing the map'; render(all);
    try { localStorage.setItem('gmodel', S.model); } catch(e){}

    status(`Done — ${all.length} boxes in ${Math.round((Date.now() - t0) / 1000)}s. Drag to pan, scroll or pinch to zoom.` +
      (S.partial ? ' Gemini’s output was cut off, so the map may be incomplete — try splitting your text.' : ''));
    $('panel').open = S.partial;
  } catch (e) { ctrl.abort(); showError(stage, e); }
  $('go').disabled = false; $('cancel').disabled = true;
};

/* ---------- PDF (vector, cropped to content) ---------- */
$('pdf').onclick = async () => {
  if (!B) return status('Generate a map first.');
  try {
    if (!window.jspdf || !window.svg2pdf) throw new Error('PDF libraries did not load (blocked or offline).');
    status('Making PDF…');
    const pad = 40, w = B.maxX - B.minX + pad * 2, h = B.maxY - B.minY + pad * 2;
    const sc = Math.min(1, 14000 / Math.max(w, h)), {jsPDF} = window.jspdf;
    const doc = new jsPDF({unit: 'pt', format: [w * sc, h * sc], orientation: w > h ? 'l' : 'p'});
    const holder = document.createElement('div');
    holder.style.cssText = 'position:fixed;left:-99999px;top:0';
    holder.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${B.minX - pad} ${B.minY - pad} ${w} ${h}"><rect x="${B.minX - pad}" y="${B.minY - pad}" width="${w}" height="${h}" fill="#ffffff"/>${CONTENT}</svg>`;
    document.body.appendChild(holder);
    try {
      const fn = window.svg2pdf.svg2pdf || window.svg2pdf;
      await fn(holder.firstChild, doc, {x: 0, y: 0, width: w * sc, height: h * sc});
    } finally { holder.remove(); }
    doc.save('mindmap.pdf');
    status('PDF downloaded.');
  } catch (e) { showError('Making the PDF', e); }
};
