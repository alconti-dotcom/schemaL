const $ = id => document.getElementById(id);
const FONT = 'Arial, Helvetica, sans-serif';
const GROUP = '#2A9D8F';
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

/* ---------- legend ---------- */
$('legend').innerHTML = Object.keys(COLORS).map(k =>
  `<span style="background:${COLORS[k]};color:${lum(COLORS[k]) > .55 ? '#111' : '#fff'}">${NAMES[k]}</span>`).join('') +
  `<span style="background:linear-gradient(90deg,${GROUP},#888)">Gradient = member of a group</span>`;

/* ---------- helpers ---------- */
function hex2rgb(h){ h = h.replace('#',''); return [0,2,4].map(i => parseInt(h.substr(i,2),16)); }
function lum(h){ const [r,g,b] = hex2rgb(h); return (0.299*r + 0.587*g + 0.114*b) / 255; }
function mix(a,b){ const A = hex2rgb(a), B = hex2rgb(b);
  return '#' + A.map((v,i) => Math.round((v+B[i])/2).toString(16).padStart(2,'0')).join(''); }
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const status = m => $('status').textContent = m;

try { $('key').value = localStorage.getItem('gkey') || ''; } catch(e){}

/* ---------- reading files ---------- */
async function readFile(f){
  const n = f.name.toLowerCase();
  if (n.endsWith('.pdf')) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const pdf = await pdfjsLib.getDocument({data: await f.arrayBuffer()}).promise;
    let t = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const c = await (await pdf.getPage(i)).getTextContent();
      t += c.items.map(x => x.str).join(' ') + '\n';
    }
    return t;
  }
  if (n.endsWith('.docx')) return (await mammoth.extractRawText({arrayBuffer: await f.arrayBuffer()})).value;
  return f.text();
}
$('file').addEventListener('change', async e => {
  status('Reading files…');
  let t = $('text').value;
  for (const f of e.target.files) t += (t ? '\n\n' : '') + await readFile(f);
  $('text').value = t;
  status('Loaded ' + t.length.toLocaleString() + ' characters.');
});

/* ---------- AI: text -> tree ---------- */
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

function chunkText(t, max = 9000){
  const paras = t.split(/\n\s*\n|\n/), out = []; let cur = '';
  for (const p of paras) {
    if ((cur + p).length > max && cur) { out.push(cur); cur = ''; }
    cur += p + '\n';
  }
  if (cur.trim()) out.push(cur);
  return out;
}

async function askGemini(prompt, key, model){
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(url, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        contents: [{parts: [{text: prompt}]}],
        generationConfig: {responseMimeType: 'application/json', temperature: 0.2, maxOutputTokens: 30000}
      })
    });
    if (r.status === 429 || r.status === 503) { await new Promise(s => setTimeout(s, 4000 * (attempt + 1))); continue; }
    const j = await r.json();
    if (!r.ok) throw new Error(j.error?.message || 'API error ' + r.status);
    const txt = j.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
    return JSON.parse(txt.replace(/^```json|```$/g, '').trim());
  }
  throw new Error('The API is busy. Try again in a minute.');
}

function normalize(n){
  return {
    t: String(n.t || '').trim() || '…',
    k: COLORS[n.k] ? n.k : 'label',
    m: !!n.m,
    c: (Array.isArray(n.c) ? n.c : []).map(normalize)
  };
}
function merge(base, add){
  for (const c of add.c) {
    const hit = base.c.find(b => b.t.toLowerCase() === c.t.toLowerCase());
    if (hit) merge(hit, c); else base.c.push(c);
  }
}

/* ---------- layout (radial + overlap removal) ---------- */
const ctx = document.createElement('canvas').getContext('2d');

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

function layout(root){
  const all = [];
  (function walk(n, d, p){ n.d = d; n.p = p; all.push(n); n.c.forEach(c => walk(c, d + 1, n)); })(root, 0, null);
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

  // push overlapping boxes apart until none touch
  const PAD = 18;
  for (let it = 0; it < 5000; it++) {
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
    if (!moved) break;
  }
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
      defs += `<linearGradient id="g${n.id}" x1="${.5 + dx * .5}" y1="${.5 + dy * .5}" x2="${.5 - dx * .5}" y2="${.5 - dy * .5}">` +
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
window.addEventListener('resize', fit);

/* ---------- generate ---------- */
$('go').onclick = async () => {
  const text = $('text').value.trim(), key = $('key').value.trim(), model = $('model').value.trim();
  if (!text) return status('Add some text first.');
  if (!key) return status('Paste your Gemini API key.');
  try { localStorage.setItem('gkey', key); } catch(e){}
  $('go').disabled = true;
  try {
    const chunks = chunkText(text); let tree = null;
    for (let i = 0; i < chunks.length; i++) {
      status(`Building map… part ${i + 1} of ${chunks.length}`);
      const note = chunks.length > 1
        ? `This is part ${i + 1} of ${chunks.length} of one document.` + (tree ? ` Use exactly this root text: "${tree.t}".` : '')
        : '';
      const part = normalize(await askGemini(`${SYS}\n\n${note}\n\nTEXT:\n${chunks[i]}`, key, model));
      if (!tree) tree = part; else merge(tree, part);
    }
    status('Arranging layout…');
    await new Promise(r => setTimeout(r, 30));
    render(layout(tree));
    status('Done. Drag to pan, scroll or pinch to zoom.');
    $('panel').open = false;
  } catch (e) { status('Error: ' + e.message); }
  $('go').disabled = false;
};

/* ---------- PDF (vector, cropped to content) ---------- */
$('pdf').onclick = async () => {
  if (!B) return status('Generate a map first.');
  try {
    const pad = 40, w = B.maxX - B.minX + pad * 2, h = B.maxY - B.minY + pad * 2;
    const sc = Math.min(1, 14000 / Math.max(w, h)), {jsPDF} = window.jspdf;
    const doc = new jsPDF({unit: 'pt', format: [w * sc, h * sc], orientation: w > h ? 'l' : 'p'});
    const holder = document.createElement('div');
    holder.style.cssText = 'position:fixed;left:-99999px;top:0';
    holder.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${B.minX - pad} ${B.minY - pad} ${w} ${h}"><rect x="${B.minX - pad}" y="${B.minY - pad}" width="${w}" height="${h}" fill="#ffffff"/>${CONTENT}</svg>`;
    document.body.appendChild(holder);
    const fn = window.svg2pdf.svg2pdf || window.svg2pdf;
    await fn(holder.firstChild, doc, {x: 0, y: 0, width: w * sc, height: h * sc});
    holder.remove();
    doc.save('mindmap.pdf');
  } catch (e) { status('PDF error: ' + e.message); }
};
