/* =====================================================================
   Easy Read — MOS Arcade
   A calm reader for people with dyslexia. Works offline.
   Sections:
    1. Helpers + words (i18n) + icons
    2. Native bridge (Android) with browser fallbacks
    3. Storage (settings, presets, unlocks, library in IndexedDB)
    4. Catalog (fonts, tints, helps)
    5. Ads (optional rewarded only)
    6. Screens, back button, toast, dialogs, sheets
    7. Text parsing + rendering
    8. Speech (native / browser / simulated)
    9. Reader (ruler, taps, quick bar, bookmarks, menu)
   10. Focus mode (one sentence)
   11. Home, Edit, Library, Settings, Welcome, Backup, Share-in
   12. Start
   ===================================================================== */
(() => {
'use strict';

/* ══ 1. HELPERS ═══════════════════════════════════════════════════════ */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const LANG = (navigator.language || 'en').toLowerCase().startsWith('fr') ? 'fr' : 'en';
document.documentElement.lang = LANG;
const T = window.I18N[LANG];
function tr(k, vars) {
  let s = T[k] != null ? T[k] : (window.I18N.en[k] != null ? window.I18N.en[k] : k);
  if (vars) for (const v in vars) s = s.replace('{' + v + '}', vars[v]);
  return s;
}
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

const SV = (p, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${p}</svg>`;
const ICONS = {
  glasses: `<svg viewBox="0 0 48 48"><rect x="9" y="4" width="30" height="38" rx="5" fill="#FFF9EE" stroke="#9A5B34" stroke-width="2.5"/><path d="M15 13h18M15 19h18M15 25h10" stroke="#C98A5A" stroke-width="2.5" stroke-linecap="round"/><circle cx="16" cy="33" r="6.5" fill="#DDEBF6" stroke="#3B2F25" stroke-width="3"/><circle cx="32" cy="33" r="6.5" fill="#DDEBF6" stroke="#3B2F25" stroke-width="3"/><path d="M22.5 32.5q1.5-2 3 0" stroke="#3B2F25" stroke-width="3" fill="none" stroke-linecap="round"/></svg>`,
  gear: SV('<circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  back: SV('<path d="M15 5l-7 7 7 7"/>'),
  left: SV('<path d="M15 5l-7 7 7 7"/>'),
  right: SV('<path d="M9 5l7 7-7 7"/>'),
  up: SV('<path d="M5 15l7-7 7 7"/>'),
  down: SV('<path d="M5 9l7 7 7-7"/>'),
  play: SV('<path d="M7 4.5v15l12.5-7.5z" fill="currentColor"/>'),
  pause: SV('<rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor"/><rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor"/>'),
  paste: SV('<rect x="5" y="4" width="14" height="17" rx="2.5"/><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3"/>'),
  camera: SV('<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.6"/>'),
  image: SV('<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>'),
  file: SV('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>'),
  books: SV('<path d="M4 4h4v16H4zM10 4h4v16h-4z"/><path d="M16 5.5l3.6-1 3 15.2-3.7 1z"/>'),
  book: SV('<path d="M3 5.5C5.5 4 9 4 12 6c3-2 6.5-2 9-.5V19c-2.5-1.5-6-1.5-9 .5-3-2-6.5-2-9-.5z"/><path d="M12 6v13.5"/>'),
  bookmark: SV('<path d="M6 3h12v18l-6-4.5L6 21z"/>'),
  dots: SV('<circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/>'),
  plus: SV('<path d="M12 5v14M5 12h14"/>'),
  close: SV('<path d="M6 6l12 12M18 6L6 18"/>'),
  search: SV('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>'),
  folder: SV('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  trash: SV('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
  edit: SV('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
  copy: SV('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>'),
  share: SV('<circle cx="18" cy="5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="19" r="2.6"/><path d="M8.3 10.8l7.4-4.4M8.3 13.2l7.4 4.4"/>'),
  lock: SV('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', 'stroke-width="2.6"'),
  ruler: SV('<rect x="2.5" y="8" width="19" height="8" rx="2"/><path d="M6 8v3M10 8v4M14 8v3M18 8v4"/>'),
  focus: SV('<path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4M8 12h8"/>'),
  voice: SV('<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>'),
  save: SV('<path d="M5 3h11l3 3v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M7 3v5h8V3M7 21v-7h10v7"/>'),
  check: SV('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  speaker: SV('<path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/>')
};
function icon(n) { return ICONS[n] || ''; }
function fillStatic() {
  $$('[data-icon]').forEach(e => { e.innerHTML = icon(e.dataset.icon); });
  $$('[data-t]').forEach(e => { e.textContent = tr(e.dataset.t); });
  $$('[data-ph]').forEach(e => { e.placeholder = tr(e.dataset.ph); });
  $$('[data-aria]').forEach(e => { e.setAttribute('aria-label', tr(e.dataset.aria)); e.title = tr(e.dataset.aria); });
  $('#edit-body').placeholder = tr('pasteHere');
}

/* ══ 2. NATIVE BRIDGE ═════════════════════════════════════════════════ */
const CAP = window.Capacitor;
const NATIVE = !!(CAP && CAP.isNativePlatform && CAP.isNativePlatform());
const P = NATIVE ? CAP.Plugins.EasyRead : null;   // our own Android plugin (TTS, OCR, files…)
const APP = NATIVE ? CAP.Plugins.App : null;
const Native = {
  async copy(text) {
    if (P) return P.copyText({ text });
    try { await navigator.clipboard.writeText(text); } catch (e) {}
  },
  async readClip() {
    try { if (P) return (await P.readClipboard()).text || ''; return await navigator.clipboard.readText(); }
    catch (e) { return ''; }
  },
  async share(text, title) {
    if (P) return P.shareText({ text, title });
    if (navigator.share) { try { await navigator.share({ text, title }); } catch (e) {} return; }
    await this.copy(text); toast(tr('copied'));
  },
  keepAwake(on) { if (P) P.keepAwake({ on }).catch(() => {}); },
  async saveFile(name, content) {
    if (P) { const r = await P.saveFile({ name, content, mime: 'application/json' }); return !!(r && r.saved); }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    return true;
  }
};

/* ══ 3. STORAGE ═══════════════════════════════════════════════════════ */
const LS = {
  get(k, d) { try { const v = localStorage.getItem('er_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('er_' + k, JSON.stringify(v)); } catch (e) {} }
};
const DEFAULTS = { font: 'opendyslexic', size: 21, letter: 0.03, word: 0.12, line: 1.8, para: 1, width: 65,
  tint: 'cream', color: 'auto', ruler: 'band', rulerLast: 'band', syll: false, bold: false, focus: false,
  rate: 1, pause: true, tap: 'read' };
const SETTING_KEYS = Object.keys(DEFAULTS);
let S = Object.assign({}, DEFAULTS, LS.get('settings', {}));
const saveS = debounce(() => LS.set('settings', S), 250);
let UNLOCKS = new Set(LS.get('unlocks', []));
const isUnlocked = id => !LOCKED[id] || UNLOCKS.has(id);
function unlock(id) { UNLOCKS.add(id); LS.set('unlocks', [...UNLOCKS]); }
let PRESETS = LS.get('presets', null);
if (!PRESETS) {
  PRESETS = [
    { id: 'day', name: tr('day'), s: Object.assign({}, DEFAULTS) },
    { id: 'night', name: tr('night'), s: Object.assign({}, DEFAULTS, { tint: 'dark', ruler: 'dim', rulerLast: 'dim' }) }
  ];
  LS.set('presets', PRESETS);
}
const savePresets = () => LS.set('presets', PRESETS);

/* Library: IndexedDB (stays on the phone) */
const DB = {
  db: null,
  open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('easyread', 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains('texts')) d.createObjectStore('texts', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('folders')) d.createObjectStore('folders', { keyPath: 'id' });
      };
      r.onsuccess = () => { this.db = r.result; res(); };
      r.onerror = () => rej(r.error);
    });
  },
  tx(store, mode, fn) {
    return new Promise((res, rej) => {
      const t = this.db.transaction(store, mode); const st = t.objectStore(store);
      const out = fn(st); t.oncomplete = () => res(out && out.result !== undefined ? out.result : out); t.onerror = () => rej(t.error);
    });
  },
  all(store) { return this.tx(store, 'readonly', s => s.getAll()); },
  get(store, id) { return this.tx(store, 'readonly', s => s.get(id)); },
  put(store, v) { return this.tx(store, 'readwrite', s => s.put(v)); },
  del(store, id) { return this.tx(store, 'readwrite', s => s.delete(id)); }
};

/* ══ 4. CATALOG ═══════════════════════════════════════════════════════ */
const FONTS = [
  { id: 'opendyslexic', name: 'OpenDyslexic', css: '"OpenDyslexic", sans-serif' },
  { id: 'lexend', name: 'Lexend', css: '"Lexend", sans-serif' },
  { id: 'atkinson', name: 'Atkinson Hyperlegible', css: '"Atkinson Hyperlegible", sans-serif' },
  { id: 'comic', name: 'Comic Neue', css: '"Comic Neue", sans-serif', lock: true },
  { id: 'andika', name: 'Andika', css: '"Andika", sans-serif', lock: true },
  { id: 'nunito', name: 'Nunito', css: '"Nunito", sans-serif', lock: true },
  { id: 'literata', name: 'Literata', css: '"Literata", serif', lock: true }
];
const TINTS = [
  { id: 'cream', bg: '#FBF3E0', ink: '#2E2620' }, { id: 'blue', bg: '#DDEBF6', ink: '#1F2A36' },
  { id: 'green', bg: '#E2F0DD', ink: '#23301F' }, { id: 'peach', bg: '#FCE6D6', ink: '#3A2A20' },
  { id: 'gray', bg: '#E7E7E4', ink: '#262626' }, { id: 'dark', bg: '#1F2023', ink: '#E6E1D8', dark: true },
  { id: 'lavender', bg: '#ECE4F6', ink: '#2C2438', lock: true }, { id: 'yellow', bg: '#FBF6C9', ink: '#33301A', lock: true },
  { id: 'rose', bg: '#F8E1E5', ink: '#3A2328', lock: true }, { id: 'mint', bg: '#D9F3EA', ink: '#1E332C', lock: true },
  { id: 'sepia', bg: '#2B2219', ink: '#EAD7B7', dark: true, lock: true }
];
const HELPS = [ { id: 'syll', k: 'syll', d: 'syllD' }, { id: 'bold', k: 'bold', d: 'boldD' }, { id: 'focus', k: 'focus', d: 'focusD' } ];
const COLORS = ['auto', '#000000', '#3B2F25', '#1D3557', '#1F4D2B', '#4A2545', '#FFFFFF', '#F1E3C8'];
const LOCKED = {};
FONTS.forEach(f => { if (f.lock) LOCKED['font:' + f.id] = f.name; });
TINTS.forEach(t => { if (t.lock) LOCKED['tint:' + t.id] = 'tint:' + t.id; });
HELPS.forEach(h => { LOCKED['help:' + h.id] = 'help:' + h.id; });
function lockName(id) {
  if (id.startsWith('tint:')) return T.tints[id.slice(5)];
  if (id.startsWith('help:')) return tr(id.slice(5));
  return LOCKED[id];
}
const fontOf = id => FONTS.find(f => f.id === id) || FONTS[0];
const tintOf = id => TINTS.find(t => t.id === id) || TINTS[0];

/* ══ 5. ADS (optional, rewarded only) ═════════════════════════════════
   Change REWARDED_ID to your real AdMob id before release.
   The one below is Google's official TEST id (safe to click). */
const ADS = {
  REWARDED_ID: 'ca-app-pub-3940256099942544/5224354917',
  plugin: null, ready: false, loading: false, started: false,
  async start() {               // only when the person first asks for an ad
    if (this.started || !NATIVE) return; this.started = true;
    this.plugin = CAP.Plugins.AdMob; if (!this.plugin) return;
    try { await this.plugin.initialize({}); } catch (e) {}
    try {
      const c = await this.plugin.requestConsentInfo();
      if (c && c.isConsentFormAvailable && c.status === 'REQUIRED') await this.plugin.showConsentForm();
    } catch (e) {}
    await this.load();
  },
  async load() {
    if (!this.plugin || this.loading || this.ready) return;
    this.loading = true;
    try { await this.plugin.prepareRewardVideoAd({ adId: this.REWARDED_ID }); this.ready = true; }
    catch (e) { this.ready = false; }
    this.loading = false;
  },
  /* resolves true only if the person watched to the end */
  async show() {
    if (!NATIVE) return true;          // browser (Mobile Arcade site): no ads, unlock right away
    await this.start();
    if (!this.plugin) return false;
    if (!this.ready) await this.load();
    if (!this.ready) { toast(tr('adFail')); return false; }
    this.ready = false;
    let rewarded = false;
    const h = await this.plugin.addListener('onRewardedVideoAdReward', () => { rewarded = true; });
    try { const r = await this.plugin.showRewardVideoAd(); if (r && r.amount !== undefined) rewarded = true; } catch (e) {}
    try { h.remove(); } catch (e) {}
    this.load();
    if (!rewarded) toast(tr('adNotDone'));
    return rewarded;
  }
};
function fakeAd() {   // browser test only
  return new Promise(res => {
    const d = document.createElement('div'); d.id = 'fakead';
    d.innerHTML = '<div>' + tr('adWatch') + '</div><div class="n">3</div>';
    document.body.appendChild(d);
    let n = 3;
    const t = setInterval(() => { n--; d.querySelector('.n').textContent = n; if (n <= 0) { clearInterval(t); d.remove(); res(true); } }, 700);
  });
}
function askUnlock(id, after) {
  const name = lockName(id);
  const online = navigator.onLine !== false;
  dialog(`<div class="unl"><span class="lock" style="position:static;width:64px;height:64px">${icon('lock')}</span></div>
    <h3>${esc(tr('unlockQ', { n: name }))}</h3><p>${esc(online ? tr('unlockP') : tr('needNet'))}</p>
    <div class="row gap"><button class="btn ghost" data-x>${esc(tr('cancel'))}</button>
    ${online ? `<button class="btn primary" data-ad>${icon('play')}${esc(tr('watchAd'))}</button>` : ''}</div>`,
    box => {
      box.querySelector('[data-x]').onclick = closeDialog;
      const b = box.querySelector('[data-ad]');
      if (b) b.onclick = async () => {
        closeDialog();
        if (await ADS.show()) { unlock(id); toast(tr('unlocked', { n: name })); after && after(); }
      };
    });
}

/* ══ 6. SCREENS / OVERLAYS ════════════════════════════════════════════ */
const stack = ['home'];
function show(name) {
  $$('.screen').forEach(s => s.classList.toggle('on', s.id === 's-' + name));
  if (name === 'reader') { Native.keepAwake(true); requestAnimationFrame(() => Reader.relayout()); }
  else Native.keepAwake(false);
  if (name === 'home') Home.refresh();
  if (name === 'library') Lib.render();
  if (name === 'settings') Settings.render();
}
function go(name) { if (stack[stack.length - 1] === name) return; stack.push(name); show(name); }
function back() {
  if (!$('#bubble').classList.contains('hidden')) return hideBubble();
  if (!$('#dialog').classList.contains('hidden')) return closeDialog();
  if (!$('#sheet').classList.contains('hidden')) return closeSheet();
  if (!$('#welcome').classList.contains('hidden')) return Welcome.close();
  if (!$('#focus').classList.contains('hidden')) return Focus.close();
  const top = stack[stack.length - 1];
  if (top === 'edit') Edit.autoSave();
  if (stack.length <= 1) { if (APP) APP.exitApp(); return; }
  stack.pop();
  const now = stack[stack.length - 1];
  if (top === 'reader' && now !== 'settings') Speech.stop();
  show(now);
}
/* leaving the reader for anything but settings stops the voice */
function goHome() { Speech.stop(); stack.length = 1; show('home'); }

let toastT;
function toast(msg, act, fn) {
  const t = $('#toast');
  t.innerHTML = esc(msg) + (act ? `<button class="act">${esc(act)}</button>` : '');
  if (act) t.querySelector('.act').onclick = () => { t.classList.add('hidden'); fn(); };
  t.classList.remove('hidden'); clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.add('hidden'), act ? 4200 : 2400);
}
function dialog(html, wire) {
  const d = $('#dialog'), box = $('#dialog-in'); box.innerHTML = html; d.classList.remove('hidden');
  d.onclick = e => { if (e.target === d) closeDialog(); };
  wire && wire(box);
}
function closeDialog() { $('#dialog').classList.add('hidden'); }
function confirmBox(title, text, okLabel, fn) {
  dialog(`<h3>${esc(title)}</h3><p>${esc(text)}</p><div class="row gap"><button class="btn ghost" data-x>${esc(tr('cancel'))}</button>
    <button class="btn danger" data-ok>${esc(okLabel)}</button></div>`, box => {
    box.querySelector('[data-x]').onclick = closeDialog;
    box.querySelector('[data-ok]').onclick = () => { closeDialog(); fn(); };
  });
}
function askText(title, value, fn) {
  dialog(`<h3>${esc(title)}</h3><input class="field" type="text" maxlength="40" value="${esc(value || '')}">
    <div class="row gap" style="margin-top:16px"><button class="btn ghost" data-x>${esc(tr('cancel'))}</button>
    <button class="btn primary" data-ok>${esc(tr('save'))}</button></div>`, box => {
    const inp = box.querySelector('input'); setTimeout(() => inp.focus(), 50);
    box.querySelector('[data-x]').onclick = closeDialog;
    const ok = () => { const v = inp.value.trim(); if (!v) return; closeDialog(); fn(v); };
    box.querySelector('[data-ok]').onclick = ok;
    inp.onkeydown = e => { if (e.key === 'Enter') ok(); };
  });
}
/* options: [{icon, label, fn, lock}] */
function sheet(title, options, extraHTML) {
  const s = $('#sheet'), box = $('#sheet-in');
  box.innerHTML = (title ? `<h3>${esc(title)}</h3>` : '') + (extraHTML || '') +
    options.map((o, i) => `<button class="opt" data-i="${i}">${icon(o.icon)}<span style="flex:1">${esc(o.label)}</span>${o.lock ? `<span class="lock" style="position:static">${icon('lock')}</span>` : ''}${o.on ? icon('check') : ''}</button>`).join('');
  box.querySelectorAll('.opt').forEach(b => b.onclick = () => { const o = options[+b.dataset.i]; if (!o.keep) closeSheet(); o.fn(); });
  s.classList.remove('hidden');
  s.onclick = e => { if (e.target === s) closeSheet(); };
  return box;
}
function closeSheet() { $('#sheet').classList.add('hidden'); }

/* ══ 7. TEXT PARSING + RENDERING ═════════════════════════════════════ */
const FR_W = new Set('le la les des est et une un que qui pas pour dans je vous nous avec sur au aux du ce cette mais ou il elle ils sont été être très plus tout fait comme'.split(' '));
const EN_W = new Set('the and is are of to you that it with for this was have be not on at by from they we his her an or but what all were when there can'.split(' '));
function detectLang(text) {
  const words = text.toLowerCase().slice(0, 4000).split(/[^a-zà-ÿœæ']+/);
  let fr = 0, en = 0;
  for (const w of words) { if (FR_W.has(w)) fr++; if (EN_W.has(w)) en++; }
  fr += (text.slice(0, 4000).match(/[éèêàçùâîôœ]/gi) || []).length * 0.3;
  return fr > en ? 'fr' : 'en';
}
const ABBR = new Set(['mr.', 'mrs.', 'ms.', 'dr.', 'st.', 'vs.', 'e.g.', 'i.e.', 'm.', 'mme.', 'mlle.', 'mm.', 'p.', 'no.', 'jr.', 'sr.', 'prof.', 'fig.', 'etc.,']);
function endsSentence(tok) {
  if (!/[.!?…]+["'»”’)\]]*$/.test(tok)) return false;
  const low = tok.toLowerCase().replace(/^[("'«“‘\[]+/, '');
  if (ABBR.has(low)) return false;
  if (/^[a-z]\.$/i.test(low)) return false;             // initials: J. K.
  return true;
}
function splitParas(body) {
  const lines = body.replace(/\r\n?/g, '\n').split('\n');
  const out = []; let cur = '';
  for (const raw of lines) {
    const t = raw.replace(/\s+/g, ' ').trim();
    if (!t) { if (cur) out.push(cur); cur = ''; continue; }
    if (cur) {
      const soft = !/[.!?:;…»"”)\]]$/.test(cur) && /^[a-zà-ÿœ(«"“]/.test(t);   // hard-wrapped line (PDF / photo)
      if (soft && /[a-zà-ÿ]-$/.test(cur)) { cur = cur.slice(0, -1) + t; continue; }
      if (soft) { cur += ' ' + t; continue; }
      out.push(cur);
    }
    cur = t;
  }
  if (cur) out.push(cur);
  return out;
}
function parseDoc(body) {
  const paras = splitParas(body);
  const tokens = [], sents = [], pr = [];
  for (let p = 0; p < paras.length; p++) {
    const toks = paras[p].split(' ').filter(Boolean);
    const pFrom = tokens.length;
    let sFrom = tokens.length;
    toks.forEach((t, k) => {
      tokens.push({ t, p, s: sents.length });
      if (endsSentence(t) || k === toks.length - 1) {
        sents.push(makeSent(tokens, sFrom, tokens.length - 1, p));
        sFrom = tokens.length;
      }
    });
    pr.push({ from: pFrom, to: tokens.length - 1 });
  }
  return { tokens, sents, paras: pr };
}
function makeSent(tokens, from, to, p) {
  const offs = []; let text = '';
  for (let i = from; i <= to; i++) { if (i > from) text += ' '; offs.push(text.length); text += tokens[i].t; }
  return { from, to, p, text, offs };
}
function wordHTML(tok, lang, syll, bold) {
  if (!syll && !bold) return esc(tok);
  const m = tok.match(/^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u);
  const pre = m[1], core = m[2], post = m[3];
  if (!core) return esc(tok);
  let parts = [core];
  if (syll && core.length >= 5 && /^[\p{L}'’-]+$/u.test(core) && window.Hyph) {
    try { parts = (window.Hyph[lang] || window.Hyph.en)(core).split('­'); } catch (e) {}
  }
  const n = [...core].length;
  const nb = bold ? (n <= 3 ? 1 : Math.ceil(n * 0.45)) : 0;
  let html = esc(pre), c = 0, inB = false;
  parts.forEach((part, pi) => {
    if (pi > 0) { if (inB) { html += '</b>'; inB = false; } html += '<i class="sy">·</i>'; }
    for (const ch of part) {
      if (c < nb && !inB) { html += '<b>'; inB = true; }
      if (c >= nb && inB) { html += '</b>'; inB = false; }
      html += esc(ch); c++;
    }
  });
  if (inB) html += '</b>';
  return html + esc(post);
}
function syllables(word, lang) {
  const core = word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  try { return (window.Hyph[lang] || window.Hyph.en)(core).split('­'); } catch (e) { return [core]; }
}
function cleanWord(w) { return w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''); }

/* ══ 8. SPEECH ═══════════════════════════════════════════════════════
   One interface, three engines:
   - Native (Android TextToSpeech + background service + lock screen)
   - Web (browser speechSynthesis, for testing on a computer)
   - Sim  (no voice available: just moves the highlight, for tests)       */
const Speech = {
  playing: false, doc: null, key: 0, engine: null,
  pauseMs() { return S.pause ? 450 : 0; },
  pick() {
    if (P) return NativeTTS;
    if (window.speechSynthesis && speechSynthesis.getVoices().length) return WebTTS;
    return SimTTS;
  },
  play(doc, from, lang, title) {
    const next = this.pick();
    // native speak() replaces what is playing by itself (no stop event to race with)
    if (this.engine && !(this.engine === NativeTTS && next === NativeTTS)) this.engine.stop();
    this.playing = false;
    this.doc = doc; this.key++;
    this.engine = next;
    const t = doc.tokens[from]; if (!t) return;
    const s = t.s, off = doc.sents[s].offs[from - doc.sents[s].from];
    this.setPlaying(true);
    this.engine.speak(doc, s, off, { rate: S.rate, lang, pauseMs: this.pauseMs(), title, key: this.key });
  },
  stop(quiet) {
    if (this.engine) this.engine.stop();
    if (!quiet) this.setPlaying(false); else this.playing = false;
  },
  setPlaying(v) { this.playing = v; Reader.onPlaying(v); Focus.onPlaying(v); },
  onWord(key, s, start) {
    if (key !== this.key || !this.doc) return;
    const se = this.doc.sents[s]; if (!se) return;
    let k = 0; while (k + 1 < se.offs.length && se.offs[k + 1] <= start) k++;
    Reader.onSpeechWord(se.from + k);
  },
  onDone(key) { if (key !== this.key) return; this.setPlaying(false); },
  say(word, lang) {           // one word, slowly
    if (this.playing) this.stop();
    const e = this.pick();
    e.say && e.say(word, lang);
  }
};
const NativeTTS = {
  wired: false, key: 0,
  wire() {
    if (this.wired) return; this.wired = true;
    P.addListener('ttsWord', d => Speech.onWord(this.key, d.s, d.start));
    P.addListener('ttsState', d => { if (Speech.engine === NativeTTS && Speech.playing !== !!d.playing) Speech.setPlaying(!!d.playing); });
    P.addListener('ttsDone', () => Speech.onDone(this.key));
    P.addListener('ttsError', d => { toast(tr('noVoice')); Speech.setPlaying(false); });
  },
  speak(doc, s, off, o) {
    this.wire(); this.key = o.key;
    P.ttsSpeak({ sentences: doc.sents.map(x => x.text), index: s, offset: off, rate: o.rate, lang: o.lang, pauseMs: o.pauseMs, title: o.title || 'Easy Read' })
      .catch(() => { toast(tr('noVoice')); Speech.setPlaying(false); });
  },
  stop() { P.ttsStop().catch(() => {}); },
  say(word, lang) { P.ttsSayWord({ text: word, lang, rate: 0.6 }).catch(() => {}); },
  async sync() {          // after coming back from background
    try {
      const st = await P.ttsState();
      if (Speech.engine !== NativeTTS) return;
      if (st.playing !== Speech.playing) Speech.setPlaying(!!st.playing);
      if (st.s >= 0) Speech.onWord(this.key, st.s, st.start);
    } catch (e) {}
  }
};
const WebTTS = {
  gen: 0,
  voice(lang) {
    const vs = speechSynthesis.getVoices();
    return vs.find(v => v.lang.toLowerCase().startsWith(lang) && v.localService) || vs.find(v => v.lang.toLowerCase().startsWith(lang)) || null;
  },
  speak(doc, s, off, o) {
    const g = ++this.gen; speechSynthesis.cancel();
    const run = (s, off) => {
      if (g !== this.gen) return;
      if (s >= doc.sents.length) return Speech.onDone(o.key);
      const u = new SpeechSynthesisUtterance(doc.sents[s].text.slice(off));
      const v = this.voice(o.lang); if (v) u.voice = v; u.lang = o.lang === 'fr' ? 'fr-FR' : 'en-US'; u.rate = o.rate;
      u.onstart = () => Speech.onWord(o.key, s, off);
      u.onboundary = e => { if (g === this.gen && e.name === 'word') Speech.onWord(o.key, s, off + e.charIndex); };
      u.onend = () => { if (g === this.gen) setTimeout(() => run(s + 1, 0), o.pauseMs); };
      speechSynthesis.speak(u);
    };
    run(s, off);
  },
  stop() { this.gen++; speechSynthesis.cancel(); },
  say(word, lang) {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(word); const v = this.voice(lang); if (v) u.voice = v; u.rate = 0.6; speechSynthesis.speak(u);
  }
};
const SimTTS = {
  t: null,
  speak(doc, s, off, o) {
    this.stop();
    let se = s, k = doc.sents[s].offs.findIndex(x => x >= off); if (k < 0) k = 0;
    const per = 60000 / (165 * o.rate);
    const step = () => {
      if (se >= doc.sents.length) return Speech.onDone(o.key);
      const st = doc.sents[se];
      Speech.onWord(o.key, se, st.offs[k]);
      k++;
      let wait = per;
      if (k >= st.offs.length) { se++; k = 0; wait += o.pauseMs; }
      this.t = setTimeout(step, wait);
    };
    step();
  },
  stop() { clearTimeout(this.t); },
  say() {}
};

/* ══ 9. READER ═══════════════════════════════════════════════════════ */
const Reader = {
  text: null, doc: null, cur: 0, lines: [], lineOf: null, els: [], follow: true,
  el: () => $('#rd-text'),
  async open(text) {
    Speech.stop();
    this.text = text; this.doc = parseDoc(text.body);
    this.cur = clamp(text.pos || 0, 0, Math.max(0, this.doc.tokens.length - 1));
    LS.set('last', text.id);
    $('#rd-title').textContent = text.title;
    this.render();
    if (stack[stack.length - 1] !== 'reader') go('reader'); else show('reader');
    setTimeout(() => { this.relayout(); this.scrollToCur(false); }, 30);
    if (S.focus && isUnlocked('help:focus')) Focus.open();
  },
  render() {
    if (!this.doc) return;
    const lang = this.text.lang || 'en';
    const syll = S.syll && isUnlocked('help:syll'), bold = S.bold && isUnlocked('help:bold');
    const bms = new Set((this.text.bookmarks || []).map(b => b.w));
    const t = this.doc.tokens; let html = '';
    for (const p of this.doc.paras) {
      html += '<p>';
      for (let i = p.from; i <= p.to; i++) {
        html += `<span class="w${bms.has(i) ? ' bm' : ''}" data-i="${i}">${wordHTML(t[i].t, lang, syll, bold)}</span>${i < p.to ? ' ' : ''}`;
      }
      html += '</p>';
    }
    this.el().innerHTML = html;
    this.els = Array.from(this.el().querySelectorAll('.w'));
    this.applyStyle();
    this.mark(this.cur);
  },
  applyStyle() {
    applyTheme();
    const e = this.el(), col = $('#rd-col');
    styleText(e);
    col.style.fontSize = S.size + 'px';
    col.style.maxWidth = S.width >= 90 ? 'none' : `calc(${S.width}ch + 44px)`;
    col.style.fontFamily = fontOf(S.font).css;
    $('#rd-tintsw').style.background = tintOf(S.tint).bg;
    $('#rd-ruler').classList.toggle('on', S.ruler !== 'off');
    $('#rd-speedv').textContent = (+S.rate).toFixed(1).replace(/\.0$/, '') + '×';
    this.relayout();
  },
  relayout: debounce(function () { Reader.computeLines(); Reader.drawRuler(); }, 60),
  computeLines() {
    const els = this.els, n = els.length; this.lines = []; this.lineOf = new Int32Array(n);
    let last = -1e9, L = null;
    for (let i = 0; i < n; i++) {
      const el = els[i], top = el.offsetTop, h = el.offsetHeight;
      if (top > last + h * 0.5) { L = { top, bot: top + h, first: i, last: i }; this.lines.push(L); last = top; }
      else { L.bot = Math.max(L.bot, top + h); L.last = i; }
      this.lineOf[i] = this.lines.length - 1;
    }
  },
  lineRect(li) {
    const L = this.lines[li]; if (!L) return null;
    const off = this.el().offsetTop, pad = Math.max(4, S.size * 0.25);
    return { top: off + L.top - pad, h: (L.bot - L.top) + pad * 2 };
  },
  drawRuler() {
    const band = $('#rd-band'), dt = $('#rd-dimtop'), db = $('#rd-dimbot');
    const r = this.lineOf && this.lineOf.length ? this.lineRect(this.lineOf[this.cur]) : null;
    band.classList.toggle('hidden', S.ruler !== 'band' || !r);
    const dim = S.ruler === 'dim' && r;
    dt.classList.toggle('hidden', !dim); db.classList.toggle('hidden', !dim);
    if (!r) return;
    if (S.ruler === 'band') { band.style.top = r.top + 'px'; band.style.height = r.h + 'px'; }
    if (dim) {
      const H = $('#rd-col').scrollHeight;
      dt.style.top = '0px'; dt.style.height = Math.max(0, r.top) + 'px';
      db.style.top = (r.top + r.h) + 'px'; db.style.height = Math.max(0, H - r.top - r.h) + 'px';
    }
  },
  scrollToCur(smooth = true) {
    if (!this.lineOf || !this.lineOf.length) return;
    const r = this.lineRect(this.lineOf[this.cur]); if (!r) return;
    const sc = $('#rd-scroll'), H = sc.clientHeight, y = r.top, st = sc.scrollTop;
    if (y < st + H * 0.12 || y + r.h > st + H * 0.62) sc.scrollTo({ top: Math.max(0, y - H * 0.3), behavior: smooth ? 'smooth' : 'auto' });
  },
  mark(i) {
    if (this.hlEl) this.hlEl.classList.remove('hl');
    this.hlEl = null;
    if (Speech.playing && this.els[i]) { this.hlEl = this.els[i]; this.hlEl.classList.add('hl'); }
  },
  setCur(i, opts = {}) {
    if (!this.doc || !this.doc.tokens.length) return;
    this.cur = clamp(i, 0, this.doc.tokens.length - 1);
    this.mark(this.cur);
    this.drawRuler();
    if (opts.scroll !== false) this.scrollToCur();
    Focus.update();
    this.savePos();
  },
  savePos: debounce(function () { const t = Reader.text; if (!t) return; t.pos = Reader.cur; DB.put('texts', t); }, 900),
  onSpeechWord(i) { this.setCur(i); },
  onPlaying(v) {
    $('#rd-play').innerHTML = icon(v ? 'pause' : 'play');
    $('#rd-play').setAttribute('aria-label', tr(v ? 'pause' : 'play'));
    this.mark(this.cur);
  },
  togglePlay() {
    if (!this.doc || !this.doc.tokens.length) return;
    if (Speech.playing) { Speech.stop(); return; }
    let from = this.cur; if (from >= this.doc.tokens.length - 1) from = 0;
    Speech.play(this.doc, from, this.text.lang || 'en', this.text.title);
  },
  restartIfPlaying() { if (Speech.playing) Speech.play(this.doc, this.cur, this.text.lang || 'en', this.text.title); },
  moveLine(d) {
    if (!this.lines.length) return;
    const li = clamp(this.lineOf[this.cur] + d, 0, this.lines.length - 1);
    this.setCur(this.lines[li].first);
    this.restartIfPlaying();
  },
  tapWord(i) {
    this.setCur(i, { scroll: false });
    if (S.tap === 'read') Speech.play(this.doc, i, this.text.lang || 'en', this.text.title);
    else this.restartIfPlaying();
  },
  tapY(y) {            // tap on empty space: ruler jumps to that line
    if (!this.lines.length) return;
    const off = this.el().getBoundingClientRect().top;
    let best = 0, bd = 1e9;
    this.lines.forEach((L, k) => { const d = Math.abs(off + (L.top + L.bot) / 2 - y); if (d < bd) { bd = d; best = k; } });
    this.setCur(this.lines[best].first, { scroll: false });
    this.restartIfPlaying();
  },
  holdWord(i, el) {
    const word = cleanWord(this.doc.tokens[i].t); if (!word) return;
    const lang = this.text.lang || 'en';
    const parts = syllables(word, lang);
    const b = $('#bubble');
    b.innerHTML = `<span class="syl">${parts.map(esc).join('<i>·</i>')}</span><button aria-label="${esc(tr('play'))}">${icon('speaker')}</button>`;
    b.classList.remove('hidden');
    const r = el.getBoundingClientRect(), bw = b.offsetWidth, bh = b.offsetHeight;
    b.style.left = clamp(r.left + r.width / 2 - bw / 2, 10, innerWidth - bw - 10) + 'px';
    b.style.top = (r.top - bh - 12 > 60 ? r.top - bh - 12 : r.bottom + 12) + 'px';
    b.querySelector('button').onclick = e => { e.stopPropagation(); Speech.say(word, lang); };
    Speech.say(word, lang);
  },
  async addBookmark() {
    const t = this.text; t.bookmarks = t.bookmarks || [];
    if (!t.bookmarks.some(b => b.w === this.cur)) {
      const toks = this.doc.tokens.slice(this.cur, this.cur + 7).map(x => x.t).join(' ');
      t.bookmarks.push({ w: this.cur, label: toks, at: Date.now() });
      t.bookmarks.sort((a, b) => a.w - b.w);
      await DB.put('texts', t);
      this.els[this.cur] && this.els[this.cur].classList.add('bm');
    }
    toast(tr('addBm'));
  },
  bookmarksSheet() {
    const t = this.text, bms = t.bookmarks || [];
    const box = sheet(tr('bookmarks'), [{ icon: 'plus', label: tr('addBmHere'), fn: () => this.addBookmark() }],
      bms.length ? '' : `<p class="hint">${esc(tr('noBm'))}</p>`);
    bms.forEach((b, k) => {
      const row = document.createElement('div'); row.className = 'item'; row.style.boxShadow = 'none';
      row.innerHTML = `<button class="main"><div class="t">${icon('bookmark').replace('<svg', '<svg style="width:18px;height:18px;display:inline;vertical-align:-3px;margin-right:6px"')}${esc(b.label)}</div></button><button class="ibtn" aria-label="${esc(tr('removeBm'))}">${icon('trash')}</button>`;
      row.querySelector('.main').onclick = () => { closeSheet(); this.setCur(b.w); this.restartIfPlaying(); };
      row.querySelector('.ibtn').onclick = async () => {
        t.bookmarks.splice(k, 1); await DB.put('texts', t);
        this.els[b.w] && this.els[b.w].classList.remove('bm'); this.bookmarksSheet();
      };
      box.appendChild(row);
    });
  },
  moreSheet() {
    const t = this.text;
    sheet('', [
      { icon: 'edit', label: tr('edit'), fn: () => Edit.open(t) },
      { icon: 'bookmark', label: tr('bookmarks'), fn: () => this.bookmarksSheet() },
      { icon: 'focus', label: tr('focus'), lock: !isUnlocked('help:focus'), fn: () => isUnlocked('help:focus') ? Focus.open() : askUnlock('help:focus', () => Focus.open()) },
      { icon: 'voice', label: tr('voiceLang') + ': ' + tr(t.lang === 'fr' ? 'french' : 'english'), fn: () => this.langSheet() },
      { icon: 'copy', label: tr('copy'), fn: async () => { await Native.copy(t.body); toast(tr('copied')); } },
      { icon: 'share', label: tr('share'), fn: () => Native.share(t.body, t.title) },
      { icon: 'folder', label: tr('moveTo'), fn: () => Lib.moveSheet(t, () => {}) },
      { icon: 'trash', label: tr('delete'), fn: () => Lib.askDelete(t, () => goHome()) }
    ]);
  },
  langSheet() {
    const t = this.text;
    sheet(tr('voiceLang'), ['en', 'fr'].map(l => ({ icon: 'voice', label: tr(l === 'fr' ? 'french' : 'english'), on: (t.lang || 'en') === l,
      fn: async () => { t.lang = l; await DB.put('texts', t); this.render(); this.relayout(); this.restartIfPlaying(); } })));
  },
  tintSheet() {
    const box = sheet(tr('tint'), []);
    const g = document.createElement('div'); g.className = 'grid tints'; box.appendChild(g);
    Settings.fillTints(g, () => closeSheet());
  }
};
/* reader gestures: tap = read from word / move ruler, long-press = hear word */
function wireReaderGestures() {
  const el = $('#rd-text'), scol = $('#rd-col');
  let st = null;
  scol.addEventListener('pointerdown', e => {
    const w = e.target.closest('.w');
    st = { x: e.clientX, y: e.clientY, w, held: false, t: setTimeout(() => {
      if (st && st.w) { st.held = true; Reader.holdWord(+st.w.dataset.i, st.w); }
    }, 480) };
  });
  scol.addEventListener('pointermove', e => {
    if (st && Math.hypot(e.clientX - st.x, e.clientY - st.y) > 10) { clearTimeout(st.t); st = null; }
  });
  const end = e => {
    if (!st) return; clearTimeout(st.t);
    const s = st; st = null;
    if (e.type === 'pointercancel' || s.held) return;
    if (!$('#bubble').classList.contains('hidden')) { hideBubble(); return; }
    if (s.w) Reader.tapWord(+s.w.dataset.i); else Reader.tapY(e.clientY);
  };
  scol.addEventListener('pointerup', end);
  scol.addEventListener('pointercancel', end);
  el.addEventListener('contextmenu', e => e.preventDefault());
  $('#rd-scroll').addEventListener('scroll', () => { if (!$('#bubble').classList.contains('hidden')) hideBubble(); }, { passive: true });
}
function hideBubble() { $('#bubble').classList.add('hidden'); }

/* shared text look (reader, focus, preview) */
function styleText(e) {
  const f = fontOf(S.font);
  e.style.fontFamily = f.css;
  e.style.fontSize = S.size + 'px';
  e.style.letterSpacing = S.letter + 'em';
  e.style.wordSpacing = S.word + 'em';
  e.style.lineHeight = S.line;
  e.style.setProperty('--para', S.para + 'em');
  e.querySelectorAll('p').forEach(p => { p.style.marginBottom = S.para + 'em'; });
}
function applyTheme() {
  const t = tintOf(isUnlocked('tint:' + S.tint) ? S.tint : 'cream');
  const ink = S.color === 'auto' ? t.ink : S.color;
  const r = document.body.style;
  r.setProperty('--rd-bg', t.bg); r.setProperty('--rd-ink', ink);
  r.setProperty('--dim', hexA(t.bg, t.dark ? 0.82 : 0.78));
  document.body.classList.toggle('dark', !!t.dark);
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.content = t.bg;
}
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

/* ══ 10. FOCUS MODE (one sentence at a time) ═════════════════════════ */
const Focus = {
  on: false, s: -1,
  open() { if (!Reader.doc || !Reader.doc.sents.length) return; this.on = true; this.s = -1; $('#focus').classList.remove('hidden'); this.update(); this.onPlaying(Speech.playing); },
  close() { this.on = false; $('#focus').classList.add('hidden'); Reader.relayout(); setTimeout(() => Reader.scrollToCur(false), 80); },
  update() {
    if (!this.on) return;
    const d = Reader.doc, s = d.tokens[Reader.cur].s, se = d.sents[s];
    if (s !== this.s) {
      this.s = s;
      const lang = Reader.text.lang || 'en';
      const syll = S.syll && isUnlocked('help:syll'), bold = S.bold && isUnlocked('help:bold');
      let h = '';
      for (let i = se.from; i <= se.to; i++) h += `<span class="w" data-i="${i}">${wordHTML(d.tokens[i].t, lang, syll, bold)}</span> `;
      const box = $('#focus-text');
      box.innerHTML = `<div class="fs">${h}</div>`;
      const fs = box.firstChild; styleText(fs); fs.style.fontSize = Math.round(S.size * 1.35) + 'px';
      $('#focus-count').textContent = tr('sentence', { a: s + 1, b: d.sents.length });
    }
    $$('#focus-text .w.hl').forEach(x => x.classList.remove('hl'));
    if (Speech.playing) { const w = $(`#focus-text .w[data-i="${Reader.cur}"]`); w && w.classList.add('hl'); }
  },
  move(d) {
    const doc = Reader.doc, s = clamp(doc.tokens[Reader.cur].s + d, 0, doc.sents.length - 1);
    Reader.setCur(doc.sents[s].from); Reader.restartIfPlaying();
  },
  onPlaying(v) { $('#focus-play').innerHTML = icon(v ? 'pause' : 'play'); this.s = -1; this.update(); }
};

/* ══ 11a. HOME ═══════════════════════════════════════════════════════ */
const Home = {
  async refresh() {
    const id = LS.get('last', null);
    const t = id ? await DB.get('texts', id) : null;
    $('#home-continue').classList.toggle('hidden', !t);
    if (t) { $('#home-continue-title').textContent = t.title; $('#home-continue').onclick = () => Reader.open(t); }
  },
  photo() {
    if (!P) { toast(tr('appOnly')); return; }
    sheet(tr('photoText'), [
      { icon: 'camera', label: tr('camera'), fn: () => this.ocr('camera') },
      { icon: 'image', label: tr('gallery'), fn: () => this.ocr('gallery') }
    ]);
  },
  async ocr(source) {
    try {
      const r = await P.ocr({ source });
      if (!r || r.cancelled) return;
      if (!r.text || !r.text.trim()) { toast(tr('ocrNone')); return; }
      const d = new Date();
      Edit.open(null, r.text.trim(), tr('photoText') + ' ' + d.toLocaleDateString(LANG));
    } catch (e) { toast(tr('ocrNone')); }
  }
};

/* ══ 11b. EDIT / PASTE ═══════════════════════════════════════════════ */
const Edit = {
  text: null,
  async open(text, body, title) {
    this.text = text || null;
    $('#edit-h').textContent = tr(text ? 'editText' : 'newText');
    $('#edit-title').value = text ? text.title : (title || '');
    $('#edit-body').value = text ? text.body : (body || '');
    await fillFolderSelect($('#edit-folder'), text ? text.folder : Lib.folder);
    go('edit');
    if (!text && !body) {                      // "Paste text": fill from clipboard
      const c = await Native.readClip();
      if (c && c.trim() && !$('#edit-body').value) $('#edit-body').value = c;
    }
  },
  async save() {
    const body = $('#edit-body').value.replace(/\s+$/, '');
    if (!body.trim()) return null;
    const title = $('#edit-title').value.trim() || makeTitle(body);
    const folder = $('#edit-folder').value || null;
    let t = this.text;
    if (t) {
      const changed = t.body !== body;
      Object.assign(t, { title, body, folder, updated: Date.now() });
      if (changed) { t.lang = detectLang(body); t.pos = Math.min(t.pos || 0, body.split(/\s+/).length - 1); t.bookmarks = []; }
    } else t = newText(body, title, folder);
    await DB.put('texts', t);
    this.text = t;
    return t;
  },
  async autoSave() { const wasNew = !this.text; const t = await this.save(); if (t && wasNew) toast(tr('saved')); },
  async read() {
    const t = await this.save();
    if (!t) { toast(tr('emptyText')); return; }
    stack.pop();                               // replace edit screen with reader
    if (stack[stack.length - 1] === 'reader') stack.pop();
    Reader.open(t);
  }
};
function makeTitle(body) {
  const first = body.trim().split('\n')[0].trim();
  return first.length > 42 ? first.slice(0, 40).replace(/\s+\S*$/, '') + '…' : first;
}
function newText(body, title, folder) {
  return { id: uid(), title: title || makeTitle(body), body, folder: folder || null, lang: detectLang(body),
    pos: 0, bookmarks: [], created: Date.now(), updated: Date.now() };
}
async function quickSave(body, title) {           // share-in, files: save then read
  if (!body || !body.trim()) return;
  const t = newText(body.trim(), title, null);
  await DB.put('texts', t);
  stack.length = 1;
  await Reader.open(t);
  toast(tr('saved'));
}
async function fillFolderSelect(sel, value) {
  const fs = (await DB.all('folders')).sort((a, b) => a.name.localeCompare(b.name));
  sel.innerHTML = `<option value="">${esc(tr('noFolder'))}</option>` + fs.map(f => `<option value="${f.id}">${esc(f.name)}</option>`).join('');
  sel.value = value && fs.some(f => f.id === value) ? value : '';
}

/* ══ 11c. LIBRARY ════════════════════════════════════════════════════ */
const Lib = {
  folder: null,   // null = all
  async render() {
    const [texts, folders] = await Promise.all([DB.all('texts'), DB.all('folders')]);
    folders.sort((a, b) => a.name.localeCompare(b.name));
    if (this.folder && !folders.some(f => f.id === this.folder)) this.folder = null;
    const fc = $('#lib-folders');
    fc.innerHTML = `<button class="chip${!this.folder ? ' on' : ''}" data-f="">${esc(tr('all'))}</button>` +
      folders.map(f => `<button class="chip${this.folder === f.id ? ' on' : ''}" data-f="${f.id}">${icon('folder')}${esc(f.name)}</button>`).join('') +
      (this.folder ? `<button class="chip" data-fo>${icon('dots')}</button>` : '') +
      `<button class="chip" data-nf>${icon('plus')}${esc(tr('newFolder'))}</button>`;
    fc.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { this.folder = b.dataset.f || null; this.render(); });
    fc.querySelector('[data-nf]').onclick = () => askText(tr('newFolder'), '', async name => {
      const f = { id: uid(), name }; await DB.put('folders', f); this.folder = f.id; this.render();
    });
    const fo = fc.querySelector('[data-fo]');
    if (fo) fo.onclick = () => this.folderSheet(folders.find(f => f.id === this.folder));
    const q = $('#lib-search').value.trim().toLowerCase();
    const list = texts.filter(t => (!this.folder || t.folder === this.folder) &&
      (!q || t.title.toLowerCase().includes(q) || t.body.toLowerCase().includes(q))).sort((a, b) => b.updated - a.updated);
    const fname = id => (folders.find(f => f.id === id) || {}).name;
    const L = $('#lib-list');
    if (!list.length) {
      L.innerHTML = `<div class="empty">${icon('books')}<div>${esc(q ? tr('noMatch') : tr('noTexts')).replace('\n', '<br>')}</div></div>`;
      return;
    }
    L.innerHTML = list.map(t => {
      const n = t.body.split(/\s+/).filter(Boolean).length;
      const meta = [fname(t.folder), tr('words', { n }), new Date(t.updated).toLocaleDateString(LANG)].filter(Boolean).join(' · ');
      return `<div class="item" data-id="${t.id}"><button class="main"><div class="t">${esc(t.title)}</div><div class="m">${esc(meta)}</div></button>
        <button class="ibtn" data-menu aria-label="${esc(tr('more'))}">${icon('dots')}</button></div>`;
    }).join('');
    L.querySelectorAll('.item').forEach(row => {
      const t = list.find(x => x.id === row.dataset.id);
      row.querySelector('.main').onclick = () => Reader.open(t);
      row.querySelector('[data-menu]').onclick = () => this.textSheet(t);
    });
  },
  textSheet(t) {
    sheet(t.title, [
      { icon: 'book', label: tr('open'), fn: () => Reader.open(t) },
      { icon: 'edit', label: tr('rename'), fn: () => askText(tr('rename'), t.title, async v => { t.title = v; t.updated = Date.now(); await DB.put('texts', t); this.render(); }) },
      { icon: 'folder', label: tr('moveTo'), fn: () => this.moveSheet(t, () => this.render()) },
      { icon: 'share', label: tr('share'), fn: () => Native.share(t.body, t.title) },
      { icon: 'trash', label: tr('delete'), fn: () => this.askDelete(t, () => this.render()) }
    ]);
  },
  async moveSheet(t, done) {
    const fs = (await DB.all('folders')).sort((a, b) => a.name.localeCompare(b.name));
    sheet(tr('moveTo'), [{ id: null, name: tr('noFolder') }, ...fs].map(f => ({ icon: 'folder', label: f.name, on: (t.folder || null) === f.id,
      fn: async () => { t.folder = f.id; await DB.put('texts', t); done(); } })).concat([{ icon: 'plus', label: tr('newFolder'),
      fn: () => askText(tr('newFolder'), '', async name => { const f = { id: uid(), name }; await DB.put('folders', f); t.folder = f.id; await DB.put('texts', t); done(); }) }]));
  },
  askDelete(t, done) {
    confirmBox(tr('delTextQ'), tr('delTextP', { t: t.title }), tr('delete'), async () => {
      await DB.del('texts', t.id);
      if (LS.get('last') === t.id) LS.set('last', null);
      done();
    });
  },
  folderSheet(f) {
    if (!f) return;
    sheet(f.name, [
      { icon: 'edit', label: tr('rename'), fn: () => askText(tr('rename'), f.name, async v => { f.name = v; await DB.put('folders', f); this.render(); }) },
      { icon: 'trash', label: tr('delete'), fn: () => confirmBox(tr('delFolderQ'), tr('delFolderP'), tr('delete'), async () => {
        const ts = await DB.all('texts');
        for (const t of ts) if (t.folder === f.id) { t.folder = null; await DB.put('texts', t); }
        await DB.del('folders', f.id); this.folder = null; this.render();
      }) }
    ]);
  }
};

/* ══ 11d. SETTINGS ═══════════════════════════════════════════════════ */
const SLIDERS = [
  { k: 'size', l: 'size', min: 14, max: 48, step: 1, f: v => v + ' px' },
  { k: 'letter', l: 'letter', min: 0, max: 0.35, step: 0.01, f: v => Math.round(v * 100) },
  { k: 'word', l: 'word', min: 0, max: 1, step: 0.02, f: v => Math.round(v * 100) },
  { k: 'line', l: 'line', min: 1.2, max: 3, step: 0.1, f: v => (+v).toFixed(1) },
  { k: 'para', l: 'para', min: 0, max: 3, step: 0.25, f: v => (+v).toFixed(2).replace(/0$/, '') },
  { k: 'width', l: 'width', min: 30, max: 90, step: 5, f: v => v >= 90 ? tr('full') : v }
];
const Settings = {
  set(k, v) {
    S[k] = v; saveS();
    this.preview();
    if (['syll', 'bold', 'font'].includes(k)) Reader.render(); else Reader.applyStyle();
    if (k === 'rate' || k === 'pause') Reader.restartIfPlaying();
    Focus.s = -1; Focus.update();
  },
  render() {
    this.preview();
    this.renderPresets();
    // fonts
    const fg = $('#set-fonts');
    fg.innerHTML = FONTS.map(f => `<button class="fontcard${S.font === f.id ? ' on' : ''}" data-id="${f.id}" style="font-family:${esc(f.css)}">Aa Bb<small>${esc(f.name)}</small>${f.lock && !isUnlocked('font:' + f.id) ? `<span class="lock">${icon('lock')}</span>` : ''}</button>`).join('');
    fg.querySelectorAll('.fontcard').forEach(b => b.onclick = () => {
      const id = b.dataset.id, lk = 'font:' + id;
      const pickIt = () => { this.set('font', id); this.render(); };
      isUnlocked(lk) ? pickIt() : askUnlock(lk, pickIt);
    });
    // sliders
    $('#set-sliders').innerHTML = SLIDERS.map(sl => this.sliderHTML(sl)).join('');
    this.wireSliders($('#set-sliders'), SLIDERS);
    // tints
    this.fillTints($('#set-tints'), () => this.render());
    // text colors
    const cc = $('#set-colors');
    cc.innerHTML = COLORS.map(c => c === 'auto'
      ? `<button class="chip${S.color === 'auto' ? ' on' : ''}" data-c="auto">${esc(tr('auto'))}</button>`
      : `<button class="chip${S.color === c ? ' on' : ''}" data-c="${c}" aria-label="${c}"><span class="colordot" style="background:${c}"></span></button>`).join('') +
      `<label class="chip">${esc(tr('custom'))}<input type="color" id="set-colorpick" value="${S.color !== 'auto' ? S.color : tintOf(S.tint).ink}"></label>`;
    cc.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { this.set('color', b.dataset.c); this.render(); });
    $('#set-colorpick').oninput = e => this.set('color', e.target.value);
    $('#set-colorpick').onchange = () => this.render();
    // ruler
    this.seg($('#set-ruler'), [['band', 'rulerBand'], ['dim', 'rulerDim'], ['off', 'rulerOff']], S.ruler, v => {
      if (v !== 'off') S.rulerLast = v; this.set('ruler', v);
    });
    // helps
    $('#set-helps').innerHTML = HELPS.map(h => {
      const lk = 'help:' + h.id, free = isUnlocked(lk);
      return `<button class="toggle${free && S[h.id] ? ' on' : ''}" data-h="${h.id}"><span class="tx"><b>${esc(tr(h.k))}</b><small>${esc(tr(h.d))}</small></span>
        ${free ? '<span class="sw"></span>' : `<span class="lockpill">${icon('lock')}${esc(tr('locked'))}</span>`}</button>`;
    }).join('');
    $('#set-helps').querySelectorAll('[data-h]').forEach(b => b.onclick = () => {
      const id = b.dataset.h, lk = 'help:' + id;
      if (!isUnlocked(lk)) return askUnlock(lk, () => { this.set(id, true); this.render(); });
      this.set(id, !S[id]); this.render();
    });
    // voice
    const VS = [{ k: 'rate', l: 'rate', min: 0.5, max: 1.6, step: 0.1, f: v => (+v).toFixed(1) + '×' }];
    $('#set-voice').innerHTML = this.sliderHTML(VS[0]) +
      `<button class="toggle${S.pause ? ' on' : ''}" id="set-pause"><span class="tx"><b>${esc(tr('pauseS'))}</b><small>${esc(tr('pauseSD'))}</small></span><span class="sw"></span></button>`;
    this.wireSliders($('#set-voice'), VS);
    $('#set-pause').onclick = () => { this.set('pause', !S.pause); this.render(); };
    // tap
    this.seg($('#set-tap'), [['read', 'tapRead'], ['move', 'tapMove']], S.tap, v => this.set('tap', v));
    if (!$('#set-tap').nextElementSibling || !$('#set-tap').nextElementSibling.classList.contains('taphint'))
      $('#set-tap').insertAdjacentHTML('afterend', `<p class="hint taphint">${esc(tr('tapHint'))}</p>`);
  },
  fillTints(g, after) {
    g.innerHTML = TINTS.map(t => `<button class="tintcard${S.tint === t.id ? ' on' : ''}" data-id="${t.id}" style="background:${t.bg};color:${t.ink}">${esc(T.tints[t.id])}${t.lock && !isUnlocked('tint:' + t.id) ? `<span class="lock">${icon('lock')}</span>` : ''}</button>`).join('');
    g.querySelectorAll('.tintcard').forEach(b => b.onclick = () => {
      const id = b.dataset.id, lk = 'tint:' + id;
      const pickIt = () => { this.set('tint', id); after && after(); };
      isUnlocked(lk) ? pickIt() : askUnlock(lk, pickIt);
    });
  },
  seg(el, opts, val, fn) {
    el.innerHTML = opts.map(([v, l]) => `<button class="${val === v ? 'on' : ''}" data-v="${v}">${esc(tr(l))}</button>`).join('');
    el.querySelectorAll('button').forEach(b => b.onclick = () => { fn(b.dataset.v); el.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); });
  },
  sliderHTML(sl) {
    return `<div class="slider" data-k="${sl.k}"><div class="h"><span>${esc(tr(sl.l))}</span><span class="val">${esc(sl.f(S[sl.k]))}</span></div>
      <div class="r"><button data-d="-1" aria-label="−">−</button><input type="range" min="${sl.min}" max="${sl.max}" step="${sl.step}" value="${S[sl.k]}" aria-label="${esc(tr(sl.l))}"><button data-d="1" aria-label="+">+</button></div></div>`;
  },
  wireSliders(root, list) {
    root.querySelectorAll('.slider').forEach(box => {
      const sl = list.find(x => x.k === box.dataset.k), inp = box.querySelector('input'), val = box.querySelector('.val');
      const setV = v => { v = +(+v).toFixed(3); v = clamp(v, sl.min, sl.max); inp.value = v; val.textContent = sl.f(v); this.set(sl.k, v); };
      inp.oninput = () => setV(inp.value);
      box.querySelectorAll('[data-d]').forEach(b => b.onclick = () => setV(+inp.value + sl.step * +b.dataset.d));
    });
  },
  preview() {
    const pv = $('#set-preview'); if (!pv) return;
    const t = tintOf(isUnlocked('tint:' + S.tint) ? S.tint : 'cream');
    pv.style.background = t.bg; pv.style.color = S.color === 'auto' ? t.ink : S.color;
    const syll = S.syll && isUnlocked('help:syll'), bold = S.bold && isUnlocked('help:bold');
    pv.innerHTML = '<p>' + tr('preview').split(' ').map(w => wordHTML(w, LANG, syll, bold)).join(' ') + '</p>';
    styleText(pv);
  },
  renderPresets() {
    const pc = $('#set-presets');
    pc.innerHTML = PRESETS.map((p, i) => `<button class="chip" data-p="${i}">${esc(p.name)}</button>`).join('') +
      (PRESETS.length ? `<button class="chip" data-pe>${icon('edit')}</button>` : '');
    pc.querySelectorAll('[data-p]').forEach(b => b.onclick = () => this.applyPreset(PRESETS[+b.dataset.p]));
    const pe = pc.querySelector('[data-pe]'); if (pe) pe.onclick = () => this.presetList();
    $('#set-preset-save').onclick = () => {
      if (PRESETS.length >= 5) { toast(tr('maxPresets')); return; }
      askText(tr('presetName'), '', name => { PRESETS.push({ id: uid(), name, s: pickSettings() }); savePresets(); this.renderPresets(); toast(tr('presetSaved')); });
    };
  },
  applyPreset(p) {
    const s = Object.assign({}, DEFAULTS, p.s);
    // keep locked items locked: fall back to a free choice
    if (!isUnlocked('font:' + s.font)) s.font = DEFAULTS.font;
    if (!isUnlocked('tint:' + s.tint)) s.tint = DEFAULTS.tint;
    SETTING_KEYS.forEach(k => { S[k] = s[k]; }); saveS();
    Reader.render(); Reader.applyStyle(); this.render(); toast(tr('applied', { n: p.name }));
  },
  presetList() {
    const box = sheet(tr('presets'), []);
    PRESETS.forEach((p, i) => {
      const row = document.createElement('div'); row.className = 'item'; row.style.boxShadow = 'none';
      row.innerHTML = `<div class="main"><div class="t">${esc(p.name)}</div></div>
        <button class="ibtn" data-u aria-label="${esc(tr('update'))}">${icon('save')}</button>
        <button class="ibtn" data-r aria-label="${esc(tr('rename'))}">${icon('edit')}</button>
        <button class="ibtn" data-d aria-label="${esc(tr('delete'))}">${icon('trash')}</button>`;
      row.querySelector('[data-u]').onclick = () => { p.s = pickSettings(); savePresets(); toast(tr('presetSaved')); };
      row.querySelector('[data-r]').onclick = () => { closeSheet(); askText(tr('rename'), p.name, v => { p.name = v; savePresets(); this.renderPresets(); }); };
      row.querySelector('[data-d]').onclick = () => { PRESETS.splice(i, 1); savePresets(); this.renderPresets(); this.presetList(); };
      box.appendChild(row);
    });
    box.insertAdjacentHTML('beforeend', `<p class="hint small">${icon('save').replace('<svg', '<svg style="width:18px;height:18px;display:inline;vertical-align:-3px"')} = ${esc(tr('update'))}</p>`);
  }
};
const pickSettings = () => { const o = {}; SETTING_KEYS.forEach(k => o[k] = S[k]); return o; };

/* ══ 11e. WELCOME ════════════════════════════════════════════════════ */
const WEL_ART = [
  `<svg viewBox="0 0 150 150"><rect x="30" y="18" width="90" height="114" rx="14" fill="#FFF9EE" stroke="#9A5B34" stroke-width="5"/><path d="M50 50h50M50 68h50M50 86h32" stroke="#C98A5A" stroke-width="7" stroke-linecap="round"/><circle cx="112" cy="112" r="24" fill="#9A5B34"/><path d="M112 100v24M100 112h24" stroke="#FFF8EE" stroke-width="6" stroke-linecap="round"/></svg>`,
  `<svg viewBox="0 0 150 150"><rect x="14" y="30" width="56" height="56" rx="14" fill="#FBF3E0" stroke="#9A5B34" stroke-width="4"/><rect x="80" y="30" width="56" height="56" rx="14" fill="#DDEBF6" stroke="#9A5B34" stroke-width="4"/><rect x="14" y="96" width="56" height="40" rx="12" fill="#E2F0DD" stroke="#9A5B34" stroke-width="4"/><rect x="80" y="96" width="56" height="40" rx="12" fill="#FCE6D6" stroke="#9A5B34" stroke-width="4"/><text x="42" y="68" font-family="OpenDyslexic" font-size="22" text-anchor="middle" fill="#3B2F25">Aa</text><text x="108" y="68" font-family="Lexend" font-size="24" text-anchor="middle" fill="#3B2F25">Aa</text></svg>`,
  `<svg viewBox="0 0 150 150"><rect x="16" y="30" width="118" height="80" rx="14" fill="#FFF9EE" stroke="#9A5B34" stroke-width="4"/><rect x="24" y="58" width="102" height="22" rx="8" fill="rgba(154,91,52,.18)" stroke="#C98A5A" stroke-width="2"/><path d="M34 46h70M34 69h22M64 69h22M34 94h56" stroke="#7A6A58" stroke-width="6" stroke-linecap="round"/><rect x="60" y="62" width="30" height="14" rx="5" fill="#FFE36E"/><path d="M64 69h22" stroke="#3B2F25" stroke-width="6" stroke-linecap="round"/><circle cx="75" cy="128" r="16" fill="#9A5B34"/><path d="M70 120v16l13-8z" fill="#FFF8EE"/></svg>`
];
const Welcome = {
  i: 0,
  open() { this.i = 0; $('#welcome').classList.remove('hidden'); this.draw(); },
  close() { $('#welcome').classList.add('hidden'); LS.set('welcomed', true); },
  draw() {
    const i = this.i;
    $('#wel-art').innerHTML = WEL_ART[i];
    $('#wel-h').textContent = tr('w' + (i + 1) + 'h');
    $('#wel-p').textContent = tr('w' + (i + 1) + 'p');
    $('#wel-dots').innerHTML = [0, 1, 2].map(k => `<i class="${k === i ? 'on' : ''}"></i>`).join('');
    $('#wel-next').textContent = tr(i === 2 ? 'start' : 'next');
  },
  next() { if (this.i >= 2) return this.close(); this.i++; this.draw(); }
};

/* ══ 11f. BACKUP + FILES ═════════════════════════════════════════════ */
async function exportBackup() {
  const data = { app: 'easyread', v: 1, at: new Date().toISOString(), texts: await DB.all('texts'), folders: await DB.all('folders'), presets: PRESETS };
  const name = 'easyread-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  try { if (await Native.saveFile(name, JSON.stringify(data))) toast(tr('exported')); } catch (e) {}
}
async function importBackup(file) {
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== 'easyread') throw 0;
    for (const f of data.folders || []) await DB.put('folders', f);
    let n = 0;
    for (const t of data.texts || []) {
      if (!t.id || typeof t.body !== 'string') continue;
      const old = await DB.get('texts', t.id);
      if (!old || (t.updated || 0) >= (old.updated || 0)) { await DB.put('texts', t); n++; }
    }
    for (const p of data.presets || []) if (PRESETS.length < 5 && !PRESETS.some(x => x.id === p.id)) PRESETS.push(p);
    savePresets(); Settings.render();
    toast(tr('imported', { n }));
  } catch (e) { toast(tr('badFile')); }
}
async function readTxt(file) {
  const buf = await file.arrayBuffer();
  let s = new TextDecoder('utf-8').decode(buf);
  if (s.includes('�')) s = new TextDecoder('windows-1252').decode(buf);   // older French files
  return s.replace(/^﻿/, '');
}

/* ══ 11g. SHARE INTO EASY READ ═══════════════════════════════════════ */
async function handleShared(d) {
  if (!d || !d.text || !d.text.trim()) return;
  closeSheet(); closeDialog(); $('#welcome').classList.add('hidden'); LS.set('welcomed', true);
  await quickSave(d.text, d.title || null);
}

/* ══ 12. START ═══════════════════════════════════════════════════════ */
async function start() {
  fillStatic();
  await DB.open();
  // first time: one sample text so the reader is never empty
  if (!LS.get('seeded', false)) {
    const t = newText(tr('sample'), tr('sampleTitle'), null); t.lang = LANG;
    await DB.put('texts', t); LS.set('seeded', true); LS.set('last', t.id);
  }
  // buttons
  $$('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
  $$('[data-back]').forEach(b => b.onclick = back);
  $('#home-paste').onclick = () => Edit.open(null);
  $('#home-photo').onclick = () => Home.photo();
  $('#home-file').onclick = () => $('#file-txt').click();
  $('#file-txt').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (f) quickSave(await readTxt(f), f.name.replace(/\.[^.]+$/, '')); };
  $('#file-json').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) importBackup(f); };
  $('#edit-read').onclick = () => Edit.read();
  $('#edit-pastebtn').onclick = async () => {
    const c = await Native.readClip();
    if (!c) { toast(tr('nothingClip')); return; }
    const a = $('#edit-body'), p = a.selectionStart || a.value.length;
    a.value = a.value.slice(0, p) + c + a.value.slice(a.selectionEnd || p);
  };
  $('#edit-clear').onclick = () => { $('#edit-body').value = ''; $('#edit-body').focus(); };
  $('#lib-new').onclick = () => Edit.open(null, '', '');
  $('#lib-search').oninput = debounce(() => Lib.render(), 150);
  $('#rd-play').onclick = () => Reader.togglePlay();
  $('#rd-prev').onclick = () => Reader.moveLine(-1);
  $('#rd-next').onclick = () => Reader.moveLine(1);
  $('#rd-aminus').onclick = () => Settings.set('size', clamp(S.size - 2, 14, 48));
  $('#rd-aplus').onclick = () => Settings.set('size', clamp(S.size + 2, 14, 48));
  $('#rd-tint').onclick = () => Reader.tintSheet();
  $('#rd-ruler').onclick = () => Settings.set('ruler', S.ruler === 'off' ? (S.rulerLast || 'band') : 'off');
  $('#rd-speed').onclick = () => {
    const steps = [0.6, 0.8, 1, 1.2, 1.4]; const i = steps.findIndex(x => x >= S.rate - 0.01);
    Settings.set('rate', steps[(i + 1) % steps.length]); toast(tr('speed') + ' ' + S.rate + '×');
  };
  $('#rd-mark').onclick = () => Reader.bookmarksSheet();
  $('#rd-more').onclick = () => Reader.moreSheet();
  $('#focus-close').onclick = () => Focus.close();
  $('#focus-prev').onclick = () => Focus.move(-1);
  $('#focus-next').onclick = () => Focus.move(1);
  $('#focus-play').onclick = () => Reader.togglePlay();
  $('#focus-text').addEventListener('click', e => { const w = e.target.closest('.w'); if (w) Reader.tapWord(+w.dataset.i); });
  $('#set-export').onclick = exportBackup;
  $('#set-import').onclick = () => $('#file-json').click();
  $('#set-welcome').onclick = () => Welcome.open();
  $('#wel-skip').onclick = () => Welcome.close();
  $('#wel-next').onclick = () => Welcome.next();
  document.addEventListener('pointerdown', e => { if (!$('#bubble').classList.contains('hidden') && !e.target.closest('#bubble') && !e.target.closest('#rd-col')) hideBubble(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') back(); });
  wireReaderGestures();
  const onResize = debounce(() => { document.body.classList.toggle('landscape', innerWidth > innerHeight && innerHeight < 560); Reader.relayout(); }, 100);
  addEventListener('resize', onResize); onResize();
  if (document.fonts) document.fonts.ready.then(() => Reader.relayout());
  applyTheme();
  show('home');

  if (APP) APP.addListener('backButton', back);
  if (P) {
    P.addListener('sharedText', handleShared);
    try { handleShared(await P.getSharedText()); } catch (e) {}
    document.addEventListener('visibilitychange', () => { if (!document.hidden && Speech.engine === NativeTTS) NativeTTS.sync(); });
  }
  if (!LS.get('welcomed', false)) Welcome.open();
  if (window.speechSynthesis) speechSynthesis.getVoices();
}

window.EasyRead = { Reader, Speech, Settings, Lib, DB, S: () => S, unlock, parseDoc, quickSave, Welcome, go, back };   // for tests
start();
})();
