// ==========================================================
// ui.js — small helpers used everywhere:
// text formatting, C++ colors, the Segfault drawing, toasts,
// pop-up sheets, celebration and sounds.
// ==========================================================

// ---------- Safe text ----------
// Turns < > & " into harmless text, so content can never inject HTML.
export function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Content uses a tiny markup: **bold**, `code`, and \n for new lines.
export function md(s) {
  let out = esc(s);
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  return out.replace(/\n/g, '<br>');
}

// Shortcut to build an element from an HTML string.
export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

// ---------- C++ syntax colors (Visual Studio dark theme) ----------
const KEYWORDS = new Set(['int', 'double', 'float', 'char', 'bool', 'void', 'long', 'short', 'unsigned', 'signed', 'auto',
  'for', 'while', 'do', 'if', 'else', 'switch', 'case', 'default', 'break', 'continue', 'return', 'const', 'using', 'namespace',
  'true', 'false', 'struct', 'enum', 'class', 'sizeof', 'static', 'nullptr', 'new', 'delete']);
const TYPES = new Set(['string', 'vector', 'ifstream', 'ofstream', 'fstream', 'size_t', 'ios', 'streamsize', 'numeric_limits', 'std']);

export function highlightLine(line) {
  if (/^\s*#/.test(line)) {
    // preprocessor: #include <iostream>
    return line.replace(/^(\s*#\w+)(.*)$/, (_, a, b) => `<span class="pp">${esc(a)}</span><span class="str">${esc(b)}</span>`);
  }
  const re = /(\/\/.*$)|(\/\*.*?\*\/|\/\*.*$|^.*?\*\/)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(___)|([A-Za-z_]\w*)|(\d+(?:\.\d+)?f?)|(\s+)|(.)/g;
  let out = '';
  let m;
  while ((m = re.exec(line))) {
    if (m[1] || m[2]) out += `<span class="com">${esc(m[1] || m[2])}</span>`;
    else if (m[3]) out += `<span class="str">${esc(m[3])}</span>`;
    else if (m[4]) out += '<span class="blank">___</span>';
    else if (m[5]) {
      const w = m[5];
      out += KEYWORDS.has(w) ? `<span class="kw">${w}</span>` : TYPES.has(w) ? `<span class="ty">${w}</span>` : `<span class="id">${w}</span>`;
    } else if (m[6]) out += `<span class="nb">${m[6]}</span>`;
    else if (m[7]) out += m[7];
    else out += `<span class="op">${esc(m[8])}</span>`;
  }
  return out;
}

// Builds a <pre class="code"> with numbered lines.
// opts.tap = lines are clickable (calls opts.onTap(index, lineElement)).
export function codeBlock(code, opts = {}) {
  const pre = document.createElement('pre');
  pre.className = 'code';
  pre.setAttribute('aria-label', 'Code C++');
  // Track multi-line /* */ comments so every line inside is green.
  let inComment = false;
  pre.innerHTML = String(code).split('\n').map((l, i) => {
    let html;
    if (inComment) {
      const end = l.indexOf('*/');
      if (end === -1) html = `<span class="com">${esc(l)}</span>`;
      else { html = `<span class="com">${esc(l.slice(0, end + 2))}</span>` + highlightLine(l.slice(end + 2)); inComment = false; }
    } else {
      html = highlightLine(l);
      const open = l.lastIndexOf('/*');
      if (open !== -1 && l.indexOf('*/', open) === -1 && !/"[^"]*\/\*/.test(l)) inComment = true;
    }
    const tapAttrs = opts.tap ? ` role="button" tabindex="0" aria-label="Ligne ${i + 1}"` : '';
    return `<span class="ln${opts.tap ? ' tap' : ''}" data-i="${i}"${tapAttrs}><span class="num">${i + 1}</span>${html || ' '}</span>`;
  }).join('');
  if (opts.tap) {
    pre.querySelectorAll('.ln').forEach(el => {
      const fire = () => opts.onTap?.(Number(el.dataset.i), el);
      el.addEventListener('click', fire);
      el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fire(); } });
    });
  }
  return pre;
}

// ---------- Segfault, the glitchy cat ----------
// Drawn in SVG so it can change color (accent, fur) and wear an accessory.
let catLook = { accessory: 'headphones', fur: '#22123a' };
export function setCatLook(look) { catLook = { ...catLook, ...look }; drawCats(); }

export function catSVG(mood = 'happy') {
  const head = 'M22 44 L26 16 L42 32 Q50 30 58 32 L74 16 L78 44 Q82 72 50 78 Q18 72 22 44 Z';
  const accessories = {
    headphones: '<path d="M20 44 Q18 10 50 10 Q82 10 80 44" stroke="var(--accent2)" stroke-width="4" fill="none"/><rect x="12" y="40" width="12" height="18" rx="4" fill="var(--accent2)" stroke="none"/><rect x="76" y="40" width="12" height="18" rx="4" fill="var(--accent2)" stroke="none"/>',
    bow: '<path d="M60 22 L72 14 L72 30 Z M60 22 L48 14 L48 30 Z" fill="var(--accent)" stroke="var(--accent)" stroke-width="2"/><circle cx="60" cy="22" r="3" fill="#fff" stroke="none"/>',
    glasses: '<circle cx="38" cy="50" r="8" stroke="var(--accent2)" stroke-width="2.5" fill="none"/><circle cx="62" cy="50" r="8" stroke="var(--accent2)" stroke-width="2.5" fill="none"/><path d="M46 50 L54 50" stroke="var(--accent2)" stroke-width="2.5"/>',
    none: '',
  };
  const mouth = mood === 'sad' ? '<path d="M45 65 Q50 60 55 65"/>' : '<path d="M46 62 Q50 66 54 62"/>';
  return `<svg viewBox="0 0 100 100" role="img" aria-label="Segfault, le chat">
    <g class="layer-cyan" fill="none" stroke="var(--accent2)" stroke-width="3" stroke-linejoin="round" opacity=".8"><path d="${head}"/></g>
    <g class="layer-pink" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linejoin="round" opacity=".8"><path d="${head}"/></g>
    <g fill="none" stroke="#f4ecff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
      <path d="${head}" fill="${catLook.fur}"/>
      <path d="M34 48 L42 52 M34 52 L42 48" stroke="var(--accent2)"/>
      <circle cx="62" cy="50" r="4" fill="var(--accent)" stroke="none"/>
      ${mouth}
      <path d="M18 58 L8 56 M18 64 L8 66 M82 58 L92 56 M82 64 L92 66" stroke-width="2"/>
      ${accessories[catLook.accessory] ?? ''}
    </g></svg>`;
}
// Fills every element that has data-cat (optionally data-cat="sad").
export function drawCats(root = document) {
  root.querySelectorAll('[data-cat]').forEach(el => { el.innerHTML = catSVG(el.dataset.cat || 'happy'); });
}
export function catHTML(width = 84, mood = '') {
  return `<div class="cat" data-cat="${mood}" style="width:${width}px">${catSVG(mood || 'happy')}</div>`;
}

// ---------- Toast (small message at the bottom) ----------
export function toast(msg, ms = 2000) {
  const app = document.getElementById('app');
  app.querySelectorAll('.toast').forEach(t => t.remove());
  const t = h(`<div class="toast" role="status">${esc(msg)}</div>`);
  app.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

// ---------- Sheet (pop-up from the bottom) ----------
export function openSheet(html, onReady) {
  const bg = document.getElementById('sheetBg');
  const sheet = document.getElementById('sheet');
  sheet.innerHTML = html;
  bg.hidden = false;
  const close = () => { bg.hidden = true; sheet.innerHTML = ''; };
  bg.onclick = e => { if (e.target === bg) close(); };
  sheet.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
  sheet.querySelector('input, textarea, button')?.focus();
  onReady?.(sheet, close);
  return close;
}

// Yes/no confirmation that returns a Promise<boolean>.
export function confirmSheet(title, text, yes = 'Oui', danger = false) {
  return new Promise(resolve => {
    openSheet(`<h2>${esc(title)}</h2><p class="muted">${md(text)}</p>
      <button class="btn ${danger ? 'danger' : ''}" data-yes>${esc(yes)}</button>
      <button class="btn ghost" data-close>Annuler</button>`, (sheet, close) => {
      sheet.querySelector('[data-yes]').onclick = () => { close(); resolve(true); };
      sheet.querySelector('[data-close]').addEventListener('click', () => resolve(false));
    });
  });
}

// ---------- Celebration: "COMPILATION RÉUSSIE !" ----------
export function celebrate(text, onClose) {
  const box = document.getElementById('celebrate');
  const conf = document.getElementById('confetti');
  conf.innerHTML = '';
  const colors = ['var(--accent)', 'var(--accent2)', '#ffffff', '#b388ff'];
  for (let k = 0; k < 44; k++) {
    const i = document.createElement('i');
    i.style.left = Math.random() * 100 + '%';
    i.style.background = colors[k % colors.length];
    i.style.animationDelay = (Math.random() * 0.7) + 's';
    conf.appendChild(i);
  }
  document.getElementById('celebrateText').innerHTML = md(text);
  box.hidden = false;
  drawCats(box);
  sound('win');
  const btn = document.getElementById('celebrateClose');
  btn.focus();
  btn.onclick = () => { box.hidden = true; onClose?.(); };
}

// ---------- Sounds (off by default, tiny beeps made in the browser) ----------
let soundsOn = false;
let audioCtx = null;
export function setSounds(on) { soundsOn = on; }
export function sound(kind) {
  if (!soundsOn) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const notes = { ok: [660, 880], no: [300, 220], win: [523, 659, 784, 1046], tap: [500] }[kind] || [440];
    notes.forEach((f, i) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'square';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.05, audioCtx.currentTime + i * 0.09);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + i * 0.09 + 0.12);
      o.connect(g).connect(audioCtx.destination);
      o.start(audioCtx.currentTime + i * 0.09);
      o.stop(audioCtx.currentTime + i * 0.09 + 0.13);
    });
  } catch { /* no sound available: that's fine */ }
}

// ---------- Small utilities ----------
export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
// Same answer check for typed answers: trim ends, collapse spaces. Case matters (like C++).
export function sameAnswer(a, b) {
  const norm = s => String(s).replace(/\r/g, '').split('\n').map(l => l.trim().replace(/\s+/g, ' ')).join('\n').trim();
  return norm(a) === norm(b);
}
