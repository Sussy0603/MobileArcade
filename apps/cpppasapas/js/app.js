// ==========================================================
// app.js — the main file: navigation + every screen.
//
// How navigation works: the address ends with #/something
// (ex: #/notion/s5-for/puzzles). When it changes, route()
// draws the matching screen inside <main>. The phone's
// back button works for free.
// ==========================================================
import { store } from './store.js';
import { C, loadContent, getItem, itemKey, puzzlesOfWeeks, currentWeek, examDate, daysUntil, defiDuJour, isoDate, TEACH_WEEKS } from './content.js';
import { esc, md, h, codeBlock, catHTML, drawCats, setCatLook, toast, openSheet, confirmSheet, celebrate, setSounds, sound, shuffle } from './ui.js';
import { renderPuzzle } from './quiz.js';
import { renderTracer, renderTraceTable, renderStar, renderMenuBuilder } from './tools.js';

const main = document.getElementById('main');
const tabs = document.getElementById('tabs');
let cleanup = null;           // stops timers when leaving a screen
let session = null;           // in-memory state for multi-step screens (exam, review)

// ==========================================================
// 1. START
// ==========================================================
async function start() {
  try {
    await Promise.all([loadContent(), store.init()]);
  } catch (e) {
    console.error(e);
    main.innerHTML = `<div class="center">${catHTML(120, 'sad')}<div class="error-box">Oups, l'app n'a pas pu démarrer.<br>Vérifie ta connexion et recharge la page.<br><small>${esc(e.message)}</small></div><button class="btn" onclick="location.reload()">Recharger</button></div>`;
    return;
  }
  document.getElementById('localBanner').hidden = store.mode !== 'local';
  store.onChange(() => { applySettings(); route(); });
  applySettings();
  window.addEventListener('hashchange', route);
  tabs.querySelectorAll('button').forEach(b => b.addEventListener('click', () => go(b.dataset.go)));
  route();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ==========================================================
// 2. NAVIGATION
// ==========================================================
export function go(path) {
  const target = '#/' + path;
  if (location.hash === target) route(); else location.hash = target;
}

function route() {
  cleanup?.(); cleanup = null;
  const path = location.hash.replace(/^#\/?/, '') || 'home';
  const [page, a, b] = path.split('/');

  if (!store.user) return page === 'about' ? screenAbout() : screenLogin();
  if (!store.data.onboarded && page !== 'onboarding') return go('onboarding/1');

  const tabOf = { home: 'home', week: 'home', notion: 'home', aide: 'home', tool: 'home', lexique: 'home', defi: 'home', weak: 'weak', review: 'weak', exam: 'exam', profil: 'profil', examens: 'profil', about: 'profil', admin: 'profil' };
  tabs.hidden = page === 'onboarding';
  tabs.querySelectorAll('button').forEach(btn => btn.classList.toggle('on', btn.dataset.go === tabOf[page]));

  const screens = {
    onboarding: () => screenOnboarding(Number(a) || 1),
    home: screenHome,
    week: () => screenWeek(Number(a)),
    notion: () => screenNotion(decodeURIComponent(a || ''), b || 'lecon'),
    aide: () => screenAide(Number(a)),
    tool: () => screenTool(a, Number(b) || 0),
    lexique: screenLexique,
    defi: screenDefi,
    weak: screenWeak,
    review: screenReview,
    exam: () => (a ? screenExamRun(a) : screenExamChoose()),
    profil: screenProfil,
    examens: screenExamDates,
    about: screenAbout,
    admin: screenAdmin,
  };
  (screens[page] || screenHome)();
  main.scrollTop = 0;
  drawCats(main);
}

// Replace the screen content.
function view(html) {
  main.innerHTML = html;
  drawCats(main);
  return main;
}
const $ = sel => main.querySelector(sel);
const $$ = sel => [...main.querySelectorAll(sel)];
function bindGo(root = main) {
  root.querySelectorAll('[data-go]').forEach(el => el.addEventListener('click', () => go(el.dataset.go)));
}

// ==========================================================
// 3. PROGRESS HELPERS
// ==========================================================
const D = () => store.data;

function prog(nid) {
  const p = D().progress;
  if (!p[nid]) p[nid] = { lesson: false, cards: {}, puzzles: {}, explain: {} };
  return p[nid];
}
function notionPct(nid) {
  const n = C.notions[nid];
  const p = D().progress[nid];
  if (!n || !p) return 0;
  const parts = [];
  if (n.lesson.length) parts.push([0.4, p.lesson ? 1 : 0]);
  if (n.puzzles.length) parts.push([0.4, Object.keys(p.puzzles).length / n.puzzles.length]);
  if (n.cards.length) parts.push([0.2, Object.keys(p.cards).length / n.cards.length]);
  const w = parts.reduce((s, x) => s + x[0], 0) || 1;
  return Math.round(parts.reduce((s, x) => s + x[0] * x[1], 0) / w * 100);
}
function notionDone(nid) {
  const n = C.notions[nid];
  const p = D().progress[nid];
  return !!p && (!n.lesson.length || p.lesson) && Object.keys(p.puzzles).length >= n.puzzles.length;
}
function weekPct(w) {
  const ids = C.weeks[w]?.notions.map(n => n.id) || [];
  if (!ids.length) return 0;
  return Math.round(ids.reduce((s, id) => s + notionPct(id), 0) / ids.length);
}
function addWeak(key, label) {
  const weak = D().weak;
  if (weak.some(x => x.key === key)) return;
  weak.unshift({ key, label, at: Date.now() });
  store.save();
}
function checkNight() {
  const hr = new Date().getHours();
  if (hr >= 0 && hr < 4 && !D().stats.night) { D().stats.night = true; toast('🌙 Badge débloqué : Noctambule'); }
}
function itemLabel(key) {
  const it = getItem(key);
  if (!it) return key;
  const kind = { p: 'Puzzle', c: 'Carte', e: 'Explique-moi' }[it.kind];
  const wk = it.notion.week ? `S${it.notion.week}` : 'Normes';
  return `${wk} · ${it.notion.title} · ${kind} ${it.index + 1}`;
}

// Records a practice answer. Returns true if the notion just became complete.
function recordPuzzle(nid, i, correct, type) {
  const p = prog(nid);
  const key = itemKey(nid, 'p', i);
  checkNight();
  if (correct) {
    D().stats.puzzlesSolved++;
    if (type === 'bug' && !p.puzzles[i]) {
      D().stats.bugsFound++;
      if (D().stats.bugsFound === 20) toast('🐛 Badge débloqué : Chasseur de bugs');
    }
    p.puzzles[i] = true;
  } else {
    addWeak(key, itemLabel(key));
    store.bumpWrong(nid);
  }
  store.save();
  return maybeComplete(nid);
}
function maybeComplete(nid) {
  const p = prog(nid);
  if (!p.celebrated && notionDone(nid)) {
    p.celebrated = true;
    store.save();
    celebrate(`Notion terminée : **${C.notions[nid].title}**`, () => {
      if (C.notions[nid].week === 5 && C.weeks[5].notions.every(n => notionDone(n.id))) toast('🌀 Badge débloqué : Maître des boucles');
    });
    return true;
  }
  return false;
}

// ==========================================================
// 4. SETTINGS (colors, text size, cat look...)
// ==========================================================
export const ACCENTS = [['Rose', '#ff3ea5'], ['Cyan', '#2de2e6'], ['Violet', '#b04dff'], ['Lime', '#b6ff3b'], ['Ambre', '#ffb13b'], ['Rose doux', '#f2a7c3'], ['Lavande', '#b9a3ff']];
const FURS = [['Nuit', '#22123a'], ['Charbon', '#2b2b33'], ['Crème', '#6b5a4a'], ['Roux', '#7a3b1e']];
const ACCESSORIES = [['headphones', '🎧 Casque'], ['bow', '🎀 Nœud'], ['glasses', '👓 Lunettes'], ['none', 'Rien']];
const AVATARS = ['🐱', '💀', '🤖', '⭐', '👾', '🍄', '🌙', '🔥'];

function applySettings() {
  const d = D();
  const root = document.documentElement.style;
  root.setProperty('--accent', d.accent);
  root.setProperty('--accent2', d.accent === '#2de2e6' ? '#ff3ea5' : '#2de2e6');
  root.setProperty('--fs', ['14px', '16px', '18px'][d.textSize ?? 1]);
  document.body.classList.toggle('reduce', !!d.reduceMotion);
  setSounds(!!d.sounds);
  setCatLook({ accessory: d.accessory, fur: d.fur });
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#140b22');
}
function nick() { return D().nickname || 'toi'; }

// ==========================================================
// 5. LOGIN + ONBOARDING
// ==========================================================
function screenLogin() {
  tabs.hidden = true;
  const local = store.mode === 'local';
  view(`<div class="center">
    <div class="title">C++ PAS À PAS</div>
    ${catHTML(170)}
    <div class="bubble">miaou ? ⚡ ${local ? 'Mode local : ta progression reste sur cet appareil.' : 'Connecte-toi pour sauver ta progression partout.'}</div>
    <button class="gbtn" id="loginBtn">${local ? '▶ Commencer' : '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg> Continuer avec Google'}</button>
    <div class="error-box" id="loginErr" hidden></div>
    <button class="hint-btn" data-go="about">À propos · confidentialité</button>
    <div class="foot">Un projet MOS Arcade</div>
  </div>`);
  bindGo();
  $('#loginBtn').onclick = async () => {
    $('#loginBtn').disabled = true;
    try {
      await store.signIn();
    } catch (e) {
      $('#loginErr').hidden = false;
      $('#loginErr').textContent = 'La connexion a échoué. Réessaie ! (' + (e.code || e.message) + ')';
    }
    const btn = $('#loginBtn');
    if (btn) btn.disabled = false;
  };
}

function screenOnboarding(step) {
  tabs.hidden = true;
  if (step === 1) {
    view(`<div class="center">
      <div class="muted">1 / 3</div>
      ${catHTML(160)}
      <div class="bubble" style="text-align:left">OH SALUT!! ⚡ Moi c'est <b>Segfault</b>.<br>Je crash jamais... presque. 😼<br>On apprend le C++ ensemble ?!</div>
      <button class="btn" data-go="onboarding/2">OUI ALLONS-Y</button>
      <button class="btn ghost" id="skip">Passer</button>
    </div>`);
    bindGo();
    $('#skip').onclick = finishOnboarding;
  } else if (step === 2) {
    const guess = D().nickname || (store.user.name || '').split(' ')[0] || '';
    view(`<div class="center">
      <div class="muted">2 / 3</div>
      ${catHTML(100)}
      <div class="bubble">Comment je t'appelle ?</div>
      <label for="nick" class="muted" style="align-self:flex-start">Surnom (c'est ce que je vais crier quand tu réussis)</label>
      <input id="nick" class="field" maxlength="20" value="${esc(guess)}" autocomplete="nickname">
      <button class="btn" id="next">Suivant</button>
    </div>`);
    const next = () => { D().nickname = $('#nick').value.trim().slice(0, 20); store.save(); go('onboarding/3'); };
    $('#next').onclick = next;
    $('#nick').onkeydown = e => { if (e.key === 'Enter') next(); };
  } else {
    view(`<div class="center">
      <div class="muted">3 / 3</div>
      <div class="bubble">Choisis ton avatar et ta couleur !</div>
      <div class="avatars" id="avatars"></div>
      <div class="swatches" id="swatches"></div>
      <button class="btn" id="done">C'est parti ⚡</button>
    </div>`);
    drawAvatarPicker($('#avatars'));
    drawAccentPicker($('#swatches'));
    $('#done').onclick = finishOnboarding;
  }
}
function finishOnboarding() {
  D().onboarded = true;
  store.save(true);
  go('home');
}

// ==========================================================
// 6. HOME
// ==========================================================
const GREETINGS = ['on casse du C++ ?? ⚡', 'prêt·e à compiler ton cerveau ? 🧠', 'aujourd\'hui : zéro segfault. promis. 😼', 'une petite boucle ou deux ?', 'je t\'ai gardé une croquette 🐟'];

function screenHome() {
  const cw = currentWeek();
  const defi = defiDuJour();
  const defiDone = !!D().defi[defi.day];
  const last = D().last && C.notions[D().last.notionId] ? D().last : null;
  const firstOfWeek = C.weeks[cw]?.notions[0]?.id || C.weeks[5].notions[0].id;
  const contId = last?.notionId || firstOfWeek;
  const contN = C.notions[contId];

  const exams = C.course.exams
    .map(e => ({ ...e, days: daysUntil(examDate(e, D().examDates)) }))
    .filter(e => e.days >= 0)
    .map(e => `<div class="count-row"><span>⏳ ${esc(e.label)}</span><b>${e.days === 0 ? 'aujourd\'hui !' : e.days === 1 ? 'demain !' : e.days + ' jours'}</b></div>`).join('');

  view(`
    <div class="prompt">segfault@cpp:~$ hello<span class="cursor">_</span></div>
    <div class="greet">${catHTML(84)}<div class="bubble">SALUT ${esc(nick().toUpperCase())}!!<br>${GREETINGS[new Date().getDate() % GREETINGS.length]}</div></div>
    <button class="card hot" id="cont">
      <div class="big">▶ ${last ? 'CONTINUER' : 'COMMENCER'}</div>
      <div class="muted">Sem ${contN.week} · ${esc(contN.title)}</div>
    </button>
    <button class="card" data-go="defi">
      <div class="big c2">⚡ Défi du jour ${defiDone ? '✅' : ''}</div>
      <div class="muted">${defiDone ? 'Réussi ! Reviens demain 😼' : 'Le même défi pour toute la classe'}</div>
    </button>
    ${exams ? `<div class="card plain">${exams}<button class="hint-btn" style="margin-top:6px" data-go="examens">📅 Corriger les dates</button></div>` : ''}
    <input class="search" id="search" type="search" placeholder="🔍 chercher une notion (ex : switch)" aria-label="Chercher une notion">
    <div id="results"></div>
    <div id="weeks"></div>
    <div class="grid2">
      <button class="card plain" data-go="lexique"><div class="big c2" style="font-size:.95rem">📖 Lexique</div></button>
      <button class="card plain" data-go="notion/normes/lecon"><div class="big c2" style="font-size:.95rem">📏 Normes</div></button>
    </div>
    <div class="foot">Un projet MOS Arcade</div>`);
  bindGo();
  $('#cont').onclick = () => go(`notion/${contId}/${last?.tab || 'lecon'}`);

  // weeks list
  $('#weeks').innerHTML = C.course.weeks.map(w => {
    const now = w.week === cw ? ' now' : '';
    if (w.type === 'teach') {
      const pct = weekPct(w.week);
      return `<button class="week-row${now}" data-go="week/${w.week}"><span class="n">Sem ${w.week}</span><div class="bar" aria-hidden="true"><i style="width:${pct}%"></i></div><span class="p">${pct}%</span></button>`;
    }
    return `<button class="week-row${now}" data-go="week/${w.week}"><span class="n">Sem ${w.week}</span><span class="t">${esc(w.title)} · checklist</span></button>`;
  }).join('');
  bindGo($('#weeks'));

  // search
  $('#search').oninput = () => {
    const q = $('#search').value.trim().toLowerCase();
    const res = $('#results');
    if (q.length < 2) { res.innerHTML = ''; $('#weeks').hidden = false; return; }
    $('#weeks').hidden = true;
    const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const nq = norm(q);
    const notions = [...C.order, 'normes'].map(id => C.notions[id]).filter(n => norm(n.title).includes(nq) || n.lesson.some(ch => norm(ch.text || '').includes(nq) || norm(ch.code || '').includes(nq)));
    const terms = C.lexique.filter(t => norm(t.term).includes(nq));
    res.innerHTML = (notions.length || terms.length)
      ? notions.slice(0, 12).map(n => `<button class="list-item" data-go="notion/${n.id}/lecon"><span class="t">${esc(n.title)}</span><span class="pill">${n.week ? 'Sem ' + n.week : 'Normes'}</span></button>`).join('')
        + terms.slice(0, 6).map(t => `<div class="list-item"><span class="t"><b>${esc(t.term)}</b><br><span class="muted">${md(t.def)}</span></span></div>`).join('')
      : `<div class="greet">${catHTML(60, 'sad')}<div class="bubble">Rien trouvé pour « ${esc(q)} »... essaie un autre mot ?</div></div>`;
    res.style.cssText = 'display:flex;flex-direction:column;gap:8px';
    bindGo(res);
    drawCats(res);
  };
}

// ==========================================================
// 7. WEEK PAGE (teaching week or review checklist)
// ==========================================================
function screenWeek(w) {
  const meta = C.course.weeks.find(x => x.week === w);
  if (!meta) return go('home');
  if (meta.type !== 'teach') {
    const exam = C.course.exams.find(e => e.week === w && e.mockWeeks);
    const items = meta.reviewWeeks.flatMap(rw => C.weeks[rw].notions.map(n => ({ ...n, week: rw })));
    const done = items.filter(n => notionDone(n.id)).length;
    view(`
      <div class="top"><button class="back" data-go="home" aria-label="Retour">←</button><h1>Sem ${w} · ${esc(meta.title)}</h1></div>
      <div class="greet">${catHTML(70)}<div class="bubble">Checklist de révision : <b>${done}/${items.length}</b> notions terminées.${done === items.length ? ' TU ES PRÊT·E ⚡' : ' Tape une notion pour la réviser.'}</div></div>
      ${exam ? `<button class="card hot" data-go="exam/${exam.id}"><div class="big">📝 Examen blanc · ${esc(exam.label)}</div><div class="muted">15 questions · 20 min</div></button>` : ''}
      ${w === 6 || w === 7 ? '<button class="card" data-go="week/5"><div class="big c2">🔥 Outils boucles</div><div class="muted">Traceur, tables de trace, étoiles, menus</div></button>' : ''}
      <div style="display:flex;flex-direction:column;gap:8px">
      ${items.map(n => `<button class="list-item${notionDone(n.id) ? ' done' : ''}" data-go="notion/${n.id}/lecon"><span aria-hidden="true">${notionDone(n.id) ? '✅' : '○'}</span><span class="t">${esc(n.title)}</span><span class="pill">S${n.week}</span></button>`).join('')}
      </div>`);
    bindGo();
    return;
  }
  const wk = C.weeks[w];
  const tools = w === 5 ? `
    <h3>Outils boucles 🔥</h3>
    <div class="grid2">
      <button class="card" data-go="tool/tracer/0"><div class="big c2" style="font-size:.95rem">🔍 Traceur</div><div class="muted">pas à pas</div></button>
      <button class="card" data-go="tool/table/0"><div class="big c2" style="font-size:.95rem">📋 Tables</div><div class="muted">de trace</div></button>
      <button class="card" data-go="tool/star/0"><div class="big c2" style="font-size:.95rem">★ Étoiles</div><div class="muted">motifs</div></button>
      <button class="card" data-go="tool/menu/0"><div class="big c2" style="font-size:.95rem">🧩 Menus</div><div class="muted">do + switch</div></button>
    </div>
    <button class="list-item" data-go="notion/${C.extraId}/puzzles"><span aria-hidden="true">🔥</span><span class="t">10 défis boucles bonus</span><span class="pill">${Object.keys(D().progress[C.extraId]?.puzzles || {}).length}/10</span></button>` : '';
  view(`
    <div class="top"><button class="back" data-go="home" aria-label="Retour">←</button><h1>Sem ${w} · ${esc(wk.title)}</h1><span class="pill">${weekPct(w)}%</span></div>
    <h3>Notions</h3>
    <div style="display:flex;flex-direction:column;gap:8px">
    ${wk.notions.map(n => {
      const pct = notionPct(n.id);
      return `<button class="list-item${notionDone(n.id) ? ' done' : ''}" data-go="notion/${n.id}/lecon"><span aria-hidden="true">${notionDone(n.id) ? '✅' : pct ? '⚡' : '○'}</span><span class="t">${esc(n.title)}</span><span class="pill${notionDone(n.id) ? ' done' : ''}">${pct}%</span></button>`;
    }).join('')}
    </div>
    ${tools}
    <button class="card plain" data-go="aide/${w}"><div class="big" style="font-size:.95rem">📄 Aide-mémoire · Semaine ${w}</div><div class="muted">Tout le résumé sur une page (pratique pour tes notes de l'examen final)</div></button>`);
  bindGo();
}

// ==========================================================
// 8. NOTION (Leçon / Cartes / Puzzles / Explique-moi)
// ==========================================================
function screenNotion(nid, tab) {
  const n = C.notions[nid];
  if (!n) return go('home');
  if (!n.extra) { D().last = { notionId: nid, tab }; store.save(); }
  const tabsDef = [['lecon', 'Leçon', n.lesson.length], ['cartes', 'Cartes', n.cards.length], ['puzzles', 'Puzzles', n.puzzles.length], ['explique', 'Explique-moi', n.explain.length]].filter(t => t[2]);
  if (!tabsDef.some(t => t[0] === tab)) tab = tabsDef[0][0];
  const back = n.week ? `week/${n.week}` : 'home';
  view(`
    <div class="top"><button class="back" data-go="${back}" aria-label="Retour">←</button><h1>${esc(n.title)}</h1>${n.week ? `<span class="pill">S${n.week}</span>` : ''}</div>
    ${tabsDef.length > 1 ? `<div class="subtabs" role="tablist">${tabsDef.map(([id, label]) => `<button role="tab" aria-selected="${id === tab}" class="${id === tab ? 'on' : ''}" data-go="notion/${nid}/${id}">${label}</button>`).join('')}</div>` : ''}
    <div id="body" style="display:flex;flex-direction:column;gap:12px"></div>`);
  bindGo();
  const body = $('#body');
  ({ lecon: lessonTab, cartes: cardsTab, puzzles: puzzlesTab, explique: explainTab })[tab](body, n);
}

// ----- Leçon: one chunk per screen -----
function lessonTab(body, n) {
  let i = 0;
  const draw = () => {
    const ch = n.lesson[i];
    body.innerHTML = `<div class="dots" aria-label="Étape ${i + 1} sur ${n.lesson.length}">${n.lesson.map((_, k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join('')}</div>`;
    const box = document.createElement('div');
    box.className = 'chunk';
    body.appendChild(box);
    if (ch.type === 'talk') {
      box.innerHTML = `<div class="greet">${catHTML(80)}<div class="bubble">${md(ch.text)}</div></div>`;
    } else if (ch.type === 'tip') {
      box.innerHTML = `<div class="greet">${catHTML(70)}<div class="bubble tip">${md(ch.text)}</div></div>`;
    } else if (ch.type === 'code') {
      box.insertAdjacentHTML('beforeend', `<div class="bubble">${md(ch.text || '')} <span class="muted">(tape une ligne 👇)</span></div>`);
      const note = h('<div class="explain" aria-live="polite">👆 Tape une ligne du code pour voir ce qu\'elle fait.</div>');
      const code = codeBlock(ch.code, {
        tap: true,
        onTap: (k, el) => {
          code.querySelectorAll('.ln').forEach(x => x.classList.remove('hl'));
          el.classList.add('hl');
          note.innerHTML = `<b>Ligne ${k + 1} :</b> ` + (ch.lines[k] ? md(ch.lines[k]) : '<span class="muted">(rien de spécial ici)</span>');
        },
      });
      box.append(code, note);
      if (ch.output) box.appendChild(h(`<div class="console">${esc(ch.output)}</div>`));
    } else if (ch.type === 'memory') {
      box.innerHTML = `<div class="bubble">${md(ch.text || '')}</div>
        <div class="mem" aria-label="Mémoire">${ch.boxes.map(b => `<div class="mbox"><div class="name">${esc(b.name)}</div><div class="val">${esc(b.value)}</div><div class="type">${esc(b.type)}${b.size ? ' · ' + esc(b.size) : ''}</div></div>`).join('')}</div>`;
    }
    drawCats(box);
    const nav = h(`<div class="row2">${i > 0 ? '<button class="btn ghost" data-a="prev">← Retour</button>' : ''}<button class="btn" data-a="next">${i === n.lesson.length - 1 ? 'TERMINER ⚡' : 'SUIVANT →'}</button></div>`);
    body.appendChild(nav);
    nav.querySelector('[data-a="next"]').onclick = () => {
      if (i < n.lesson.length - 1) { i++; draw(); main.scrollTop = 0; return; }
      prog(n.id).lesson = true;
      store.save();
      if (!maybeComplete(n.id)) {
        toast('Leçon compilée ✅ Place aux cartes !');
        go(`notion/${n.id}/${n.cards.length ? 'cartes' : 'puzzles'}`);
      }
    };
    nav.querySelector('[data-a="prev"]')?.addEventListener('click', () => { i--; draw(); });
  };
  draw();
}

// ----- Cartes: flip cards -----
function cardsTab(body, n) {
  let i = 0;
  const draw = () => {
    const c = n.cards[i];
    body.innerHTML = `<div class="muted" style="text-align:center">Carte ${i + 1} / ${n.cards.length}</div>
      <button class="flip" id="flip" aria-label="Retourner la carte">
        <div class="flip-inner">
          <div class="face"><div class="q">${md(c.q)}</div><div class="muted">(tape pour voir la réponse)</div></div>
          <div class="face back">${md(c.a)}</div>
        </div>
      </button>
      <div class="row2"><button class="btn ghost" data-a="no">Pas encore</button><button class="btn" data-a="yes">Je savais ✓</button></div>
      <button class="hint-btn" style="align-self:center" data-a="report">🚩 Signaler une erreur</button>`;
    const flip = body.querySelector('#flip');
    flip.onclick = () => flip.classList.toggle('flipped');
    const next = known => {
      const key = itemKey(n.id, 'c', i);
      if (known) prog(n.id).cards[i] = true;
      else { prog(n.id).cards[i] = true; addWeak(key, itemLabel(key)); toast('→ Points faibles'); }
      store.save();
      if (i < n.cards.length - 1) { i++; draw(); } else {
        maybeComplete(n.id) || (toast('Cartes finies ⚡ Aux puzzles !'), go(`notion/${n.id}/puzzles`));
      }
    };
    body.querySelector('[data-a="yes"]').onclick = () => next(true);
    body.querySelector('[data-a="no"]').onclick = () => next(false);
    body.querySelector('[data-a="report"]').onclick = () => reportSheet(itemKey(n.id, 'c', i));
  };
  draw();
}

// ----- Puzzles: one at a time, then a summary -----
function puzzlesTab(body, n) {
  let i = 0;
  const results = [];
  const draw = () => {
    body.innerHTML = `<div class="dots" aria-label="Puzzle ${i + 1} sur ${n.puzzles.length}">${n.puzzles.map((_, k) => `<i class="${results[k] === true ? 'ok' : results[k] === false ? 'ko' : k === i ? 'on' : ''}"></i>`).join('')}</div>
      <div class="muted">Puzzle ${i + 1} / ${n.puzzles.length}${prog(n.id).puzzles[i] ? ' · déjà réussi ✓' : ''}</div>`;
    const pz = renderPuzzle(n.puzzles[i], {
      onAnswer: ({ correct }) => {
        results[i] = correct;
        const completed = recordPuzzle(n.id, i, correct, n.puzzles[i].type);
        const nextBtn = h(`<button class="btn">${i < n.puzzles.length - 1 ? 'PUZZLE SUIVANT →' : 'VOIR LE RÉSULTAT'}</button>`);
        nextBtn.onclick = () => { if (i < n.puzzles.length - 1) { i++; draw(); main.scrollTop = 0; } else summary(); };
        body.appendChild(nextBtn);
        body.querySelectorAll('.dots i')[i].className = correct ? 'ok' : 'ko';
        if (!completed) nextBtn.focus();
      },
    });
    body.appendChild(pz.el);
    body.appendChild(h('<button class="hint-btn" style="align-self:center" data-a="report">🚩 Signaler une erreur</button>'));
    body.querySelector('[data-a="report"]').onclick = () => reportSheet(itemKey(n.id, 'p', i));
    drawCats(body);
  };
  const summary = () => {
    const good = results.filter(Boolean).length;
    if (good === n.puzzles.length && results.length === n.puzzles.length && !D().stats.perfect) {
      D().stats.perfect = true;
      store.save();
      toast('💯 Badge débloqué : Zéro segfault');
    }
    body.innerHTML = `<div class="center" style="flex:none;padding:20px 0">
      <div style="font-size:2.2rem;font-weight:800;color:var(--accent);text-shadow:0 0 12px var(--accent)">${good} / ${n.puzzles.length}</div>
      ${catHTML(100, good < n.puzzles.length / 2 ? 'sad' : '')}
      <div class="bubble">${good === n.puzzles.length ? 'PARFAIT. Je ronronne si fort que le PC vibre. 💖' : good >= n.puzzles.length / 2 ? 'Bien joué ! Les erreurs sont dans tes points faibles 👀' : 'Pas grave ! On relit la leçon et on recommence. Tu vas l\'avoir. 💪'}</div>
      <div class="row2" style="width:100%"><button class="btn ghost" data-a="again">Recommencer</button><button class="btn" data-go="${n.week ? 'week/' + n.week : 'home'}">Continuer</button></div>
    </div>`;
    drawCats(body);
    bindGo(body);
    body.querySelector('[data-a="again"]').onclick = () => { i = 0; results.length = 0; draw(); };
  };
  draw();
}

// ----- Explique-moi: oral interview practice with a 30s timer -----
function explainTab(body, n) {
  let i = 0;
  let timer = null;
  cleanup = () => clearInterval(timer);
  const draw = () => {
    clearInterval(timer);
    const e = n.explain[i];
    body.innerHTML = `<div class="muted" style="text-align:center">Question ${i + 1} / ${n.explain.length} · style entretien (Volet B)</div>
      <div class="card hot"><div class="muted">🎤 Le prof te demande :</div><div style="font-weight:600;font-size:1.08rem;margin-top:6px">« ${md(e.q)} »</div></div>
      <div class="timer" id="t" aria-live="off">0:30</div>
      <div class="muted" style="text-align:center">Réponds à voix haute, comme devant le prof.</div>
      <button class="btn ghost" data-a="start">▶ Démarrer le chrono</button>
      <button class="btn" data-a="show">Voir la réponse modèle</button>
      <div class="explain" id="model" hidden>${md(e.a)}</div>
      <div class="row2" id="rate" hidden><button class="btn ghost" data-a="no">Pas encore</button><button class="btn" data-a="yes">J'avais ça ✓</button></div>`;
    body.querySelector('[data-a="start"]').onclick = () => {
      clearInterval(timer);
      let s = 30;
      const t = body.querySelector('#t');
      t.textContent = '0:30';
      t.classList.remove('low');
      timer = setInterval(() => {
        s--;
        t.textContent = `0:${String(Math.max(s, 0)).padStart(2, '0')}`;
        if (s <= 10) t.classList.add('low');
        if (s <= 0) { clearInterval(timer); toast('Temps ! Regarde la réponse modèle'); }
      }, 1000);
    };
    body.querySelector('[data-a="show"]').onclick = () => {
      clearInterval(timer);
      body.querySelector('#model').hidden = false;
      body.querySelector('#rate').hidden = false;
      body.querySelector('[data-a="show"]').hidden = true;
    };
    const next = ok => {
      const key = itemKey(n.id, 'e', i);
      prog(n.id).explain[i] = true;
      if (!ok) { addWeak(key, itemLabel(key)); toast('→ Points faibles'); }
      store.save();
      if (i < n.explain.length - 1) { i++; draw(); } else { toast('Entretien terminé ⚡'); go(n.week ? `week/${n.week}` : 'home'); }
    };
    body.querySelector('[data-a="yes"]').onclick = () => next(true);
    body.querySelector('[data-a="no"]').onclick = () => next(false);
  };
  draw();
}

// ----- Report a mistake -----
function reportSheet(key) {
  openSheet(`<h2>🚩 Signaler une erreur</h2>
    <p class="muted">${esc(itemLabel(key))}</p>
    <label for="rep" class="muted">Qu'est-ce qui cloche ? (réponse fausse, texte pas clair...)</label>
    <textarea id="rep" class="field" maxlength="500"></textarea>
    <button class="btn" data-send>Envoyer</button>
    <button class="btn ghost" data-close>Annuler</button>`, (sheet, close) => {
    sheet.querySelector('[data-send]').onclick = async () => {
      const text = sheet.querySelector('#rep').value.trim();
      if (!text) return;
      try { await store.reportError(key, text); toast('Merci ! Segfault va enquêter 🔍'); } catch { toast('Envoi impossible, réessaie plus tard'); }
      close();
    };
  });
}

// ==========================================================
// 9. AIDE-MÉMOIRE, LEXIQUE
// ==========================================================
function screenAide(w) {
  const wk = C.weeks[w];
  if (!wk) return go('home');
  view(`<div class="top"><button class="back" data-go="week/${w}" aria-label="Retour">←</button><h1>📄 Aide-mémoire · Sem ${w}</h1></div>
    <p class="muted">${esc(wk.title)} — tout l'essentiel. Recopie-le dans tes notes perso pour le Volet C !</p>
    <div id="list" style="display:flex;flex-direction:column;gap:12px"></div>`);
  bindGo();
  const list = $('#list');
  wk.aideMemoire.forEach(a => {
    const card = h(`<div class="card plain" style="display:flex;flex-direction:column;gap:8px"><div class="big c2" style="font-size:.98rem">${md(a.title)}</div></div>`);
    if (a.code) card.appendChild(codeBlock(a.code));
    if (a.note) card.appendChild(h(`<div class="muted">${md(a.note)}</div>`));
    list.appendChild(card);
  });
}

function screenLexique() {
  view(`<div class="top"><button class="back" data-go="home" aria-label="Retour">←</button><h1>📖 Lexique</h1></div>
    <input class="search" id="q" type="search" placeholder="🔍 chercher un mot" aria-label="Chercher un mot du lexique">
    <div id="list" style="display:flex;flex-direction:column;gap:8px"></div>`);
  bindGo();
  const draw = () => {
    const q = $('#q').value.trim().toLowerCase();
    const items = C.lexique.filter(t => !q || t.term.toLowerCase().includes(q) || t.def.toLowerCase().includes(q));
    let lastWeek = null;
    $('#list').innerHTML = items.map(t => {
      const header = t.week !== lastWeek ? `<h3>Semaine ${t.week}</h3>` : '';
      lastWeek = t.week;
      return `${header}<div class="list-item"><span class="t"><b>${esc(t.term)}</b><br><span class="muted">${md(t.def)}</span></span></div>`;
    }).join('') || '<p class="muted">Aucun mot trouvé.</p>';
  };
  $('#q').oninput = draw;
  draw();
}

// ==========================================================
// 10. LOOP TOOLS
// ==========================================================
function screenTool(kind, idx) {
  const O = C.outils;
  const lists = { tracer: O.tracers, table: O.traceTables, star: O.stars, menu: O.menus };
  const titles = { tracer: '🔍 Traceur pas à pas', table: '📋 Tables de trace', star: '★ Motifs d\'étoiles', menu: '🧩 Construis un menu' };
  const list = lists[kind];
  if (!list) return go('week/5');
  idx = Math.min(idx, list.length - 1);
  const item = list[idx];
  view(`<div class="top"><button class="back" data-go="week/5" aria-label="Retour">←</button><h1>${titles[kind]}</h1></div>
    ${list.length > 1 ? `<div class="subtabs">${list.map((x, k) => `<button class="${k === idx ? 'on' : ''}" data-go="tool/${kind}/${k}">${esc(x.title.length > 22 ? (k + 1) + '. ' + x.title.slice(0, 20) + '…' : x.title)}</button>`).join('')}</div>` : ''}
    <div class="muted">${esc(item.title)}</div>
    <div id="tool" style="display:flex;flex-direction:column;gap:12px"></div>`);
  bindGo();
  const root = $('#tool');
  const done = () => { checkNight(); store.save(); };
  if (kind === 'tracer') cleanup = renderTracer(root, item);
  if (kind === 'table') renderTraceTable(root, item, done);
  if (kind === 'star') renderStar(root, item, done);
  if (kind === 'menu') renderMenuBuilder(root, item, done);
  if (idx < list.length - 1) {
    const nb = h(`<button class="btn ghost">Suivant : ${esc(list[idx + 1].title)} →</button>`);
    nb.onclick = () => go(`tool/${kind}/${idx + 1}`);
    root.appendChild(nb);
  }
}

// ==========================================================
// 11. DÉFI DU JOUR
// ==========================================================
function screenDefi() {
  const { key, day } = defiDuJour();
  const it = getItem(key);
  view(`<div class="top"><button class="back" data-go="home" aria-label="Retour">←</button><h1>⚡ Défi du jour</h1><span class="pill">S${it.notion.week}</span></div>
    <div class="muted">${esc(it.notion.title)} · le même pour toute la classe aujourd'hui${D().defi[day] ? ' · ✅ déjà réussi' : ''}</div>
    <div id="pz"></div>`);
  bindGo();
  const pz = renderPuzzle(it.data, {
    onAnswer: ({ correct }) => {
      recordPuzzle(it.notion.id, it.index, correct, it.data.type);
      if (correct) { D().defi[day] = true; store.save(); }
      const b = h('<button class="btn ghost">Retour à l\'accueil</button>');
      b.onclick = () => go('home');
      $('#pz').appendChild(b);
    },
  });
  $('#pz').appendChild(pz.el);
  drawCats(main);
}

// ==========================================================
// 12. POINTS FAIBLES + REVIEW SESSION
// ==========================================================
function screenWeak() {
  const weak = D().weak.filter(w => getItem(w.key));
  view(`<div class="top"><h1>🩹 Points faibles <span class="pill">${weak.length}</span></h1></div>
    ${weak.length ? `<button class="btn" id="all">▶ TOUT RÉVISER</button>
      <p class="muted">Les plus récents en haut. Ils restent ici jusqu'à ce que tu les retires (✕).</p>
      <div id="list" style="display:flex;flex-direction:column;gap:8px"></div>`
    : `<div class="center" style="padding:30px 0">${catHTML(120)}<div class="bubble">ZÉRO point faible ?!<br>T'es une machine ⚡<br><span class="muted">Tes erreurs viendront se ranger ici.</span></div></div>`}`);
  if (!weak.length) return;
  $('#all').onclick = () => { session = { review: weak.map(w => w.key), i: 0 }; go('review'); };
  const draw = () => {
    $('#list').innerHTML = D().weak.filter(w => getItem(w.key)).map(w => `<div class="list-item">
      <button class="t" style="background:none;border:none;text-align:left" data-open="${esc(w.key)}">${esc(w.label)}</button>
      <button class="x" data-rm="${esc(w.key)}" aria-label="Retirer ${esc(w.label)}">✕</button></div>`).join('');
    $$('[data-rm]').forEach(b => b.onclick = () => {
      D().weak = D().weak.filter(w => w.key !== b.dataset.rm);
      store.save();
      if (!D().weak.length) screenWeak(); else draw();
    });
    $$('[data-open]').forEach(b => b.onclick = () => { session = { review: [b.dataset.open], i: 0 }; go('review'); });
  };
  draw();
}

function screenReview() {
  if (!session?.review?.length) return go('weak');
  const key = session.review[session.i];
  const it = getItem(key);
  const total = session.review.length;
  view(`<div class="top"><button class="back" data-go="weak" aria-label="Retour">←</button><h1>Révision ${session.i + 1} / ${total}</h1></div>
    <div class="muted">${esc(itemLabel(key))}</div>
    <div id="box" style="display:flex;flex-direction:column;gap:12px"></div>`);
  bindGo();
  const box = $('#box');
  const nextBtn = () => {
    const b = h(`<button class="btn">${session.i < total - 1 ? 'SUIVANT →' : 'TERMINER'}</button>`);
    const rm = h('<button class="btn ghost">✓ Je l\'ai ! Retirer des points faibles</button>');
    rm.onclick = () => { D().weak = D().weak.filter(w => w.key !== key); store.save(); rm.disabled = true; rm.textContent = 'Retiré ✓'; };
    b.onclick = () => { if (session.i < total - 1) { session.i++; screenReview(); } else { session = null; toast('Révision finie ⚡'); go('weak'); } };
    box.append(rm, b);
  };
  if (it.kind === 'p') {
    box.appendChild(renderPuzzle(it.data, {
      onAnswer: ({ correct }) => {
        recordPuzzle(it.notion.id, it.index, correct, it.data.type);
        nextBtn();
      },
    }).el);
  } else {
    const q = it.data.q;
    const a = it.data.a;
    box.innerHTML = `<div class="card hot"><div style="font-weight:600">${md(q)}</div></div>
      <button class="btn ghost" id="show">Voir la réponse</button><div class="explain" id="ans" hidden>${md(a)}</div>`;
    box.querySelector('#show').onclick = () => { box.querySelector('#ans').hidden = false; box.querySelector('#show').hidden = true; nextBtn(); };
  }
  drawCats(main);
}

// ==========================================================
// 13. EXAMEN BLANC
// ==========================================================
function screenExamChoose() {
  const exams = C.course.exams.filter(e => e.mockWeeks);
  const best = D().stats.bestMock;
  view(`<div class="top"><h1>📝 Examen blanc</h1></div>
    <div class="greet">${catHTML(70)}<div class="bubble">15 questions · 20 minutes · pas d'indice. Comme le vrai ! 😼</div></div>
    ${exams.map((e, k) => {
      const days = daysUntil(examDate(e, D().examDates));
      return `<button class="card ${k === exams.findIndex(x => daysUntil(examDate(x, D().examDates)) >= 0) ? 'hot' : ''}" data-go="exam/${e.id}">
        <div class="big${k ? ' c2' : ''}">${esc(e.label)}</div>
        <div class="muted">Semaines ${e.mockWeeks.join(', ')} · ${esc(e.weight)}${days >= 0 ? ` · dans ${days} j` : ' · passé'}</div></button>`;
    }).join('')}
    ${best ? `<p class="muted">Meilleur score : <b>${best.score}/15</b> (${esc(best.label)})</p>` : ''}`);
  bindGo();
}

function screenExamRun(examId) {
  cleanup?.(); cleanup = null;
  const exam = C.course.exams.find(e => e.id === examId);
  if (!exam) return go('exam');
  // New exam (or coming back to one in progress)
  if (!session?.exam || session.exam.id !== examId || session.finished) {
    const pool = shuffle(puzzlesOfWeeks(exam.mockWeeks));
    session = { exam, keys: pool.slice(0, 15), i: 0, answers: [], end: Date.now() + 20 * 60 * 1000, finished: false };
  }
  if (session.i >= session.keys.length || Date.now() >= session.end) return examResults();
  const key = session.keys[session.i];
  const it = getItem(key);
  view(`<div class="exam-bar"><button class="back hint-btn" id="quit">✕ Quitter</button><span class="muted">${session.i + 1} / ${session.keys.length}</span><span class="timer" id="t"></span></div>
    <div class="bar" aria-hidden="true"><i style="width:${(session.i / session.keys.length) * 100}%"></i></div>
    <div id="pz"></div>`);
  const t = $('#t');
  const tick = () => {
    const left = Math.max(0, session.end - Date.now());
    const m = Math.floor(left / 60000);
    const s = Math.floor((left % 60000) / 1000);
    t.textContent = `${m}:${String(s).padStart(2, '0')}`;
    t.classList.toggle('low', left < 2 * 60 * 1000);
    if (left <= 0) { toast('⏰ Temps écoulé !'); examResults(); }
  };
  tick();
  const timer = setInterval(tick, 1000);
  cleanup = () => clearInterval(timer);
  $('#quit').onclick = async () => {
    if (await confirmSheet('Quitter l\'examen ?', 'Tes réponses ne seront pas comptées.', 'Quitter')) { session = null; go('exam'); }
  };
  $('#pz').appendChild(renderPuzzle(it.data, {
    mode: 'exam',
    onAnswer: ({ correct, given }) => {
      session.answers.push({ key, correct, given });
      session.i++;
      screenExamRun(examId);
    },
  }).el);
}

function examResults() {
  cleanup?.(); cleanup = null;
  if (!session?.exam) return go('exam');
  const s = session;
  if (!s.finished) {
    s.finished = true;
    checkNight();
    s.answers.forEach(a => {
      const it = getItem(a.key);
      if (!a.correct) { addWeak(a.key, itemLabel(a.key)); store.bumpWrong(it.notion.id); }
      else { prog(it.notion.id).puzzles[it.index] = true; D().stats.puzzlesSolved++; }
    });
    const score = s.answers.filter(a => a.correct).length;
    if (!D().stats.bestMock || score > D().stats.bestMock.score) D().stats.bestMock = { score, label: s.exam.label };
    store.save();
  }
  const score = s.answers.filter(a => a.correct).length;
  const total = s.keys.length;
  view(`<div class="top"><button class="back" data-go="exam" aria-label="Retour">←</button><h1>${esc(s.exam.label)} · résultat</h1></div>
    <div style="text-align:center;font-size:2.4rem;font-weight:800;color:var(--accent);text-shadow:0 0 12px var(--accent)">${score} / ${total} ⚡</div>
    <div class="greet">${catHTML(70, score < total / 2 ? 'sad' : '')}<div class="bubble">${score >= 13 ? 'T\'ES UNE BOMBE!! 💥' : score >= 9 ? 'Solide ! Revois les ✗ et c\'est dans la poche.' : 'On respire. Chaque ✗ est dans tes points faibles : on les travaille ensemble. 💪'}${s.answers.length < total ? `<br><span class="muted">${total - s.answers.length} question(s) sans réponse (temps écoulé).</span>` : ''}</div></div>
    <div id="list" style="display:flex;flex-direction:column;gap:6px"></div>
    <button class="btn" data-go="exam">Nouvel examen blanc</button>`);
  bindGo();
  $('#list').innerHTML = s.keys.map((key, k) => {
    const a = s.answers[k];
    const it = getItem(key);
    const mark = !a ? '<span class="muted">—</span>' : a.correct ? '<b style="color:var(--good)">✓</b>' : '<b style="color:var(--bad)">✗</b>';
    return `<button class="list-item" data-k="${k}">${mark}<span class="t">${k + 1}. ${esc(it.notion.title)}</span><span aria-hidden="true">›</span></button>`;
  }).join('');
  $$('[data-k]').forEach(b => b.onclick = () => {
    const k = Number(b.dataset.k);
    const it = getItem(s.keys[k]);
    const a = s.answers[k];
    openSheet('<div id="rv" style="display:flex;flex-direction:column;gap:12px;max-height:75vh;overflow-y:auto"></div><button class="btn ghost" data-close>Fermer</button>', sheet => {
      sheet.querySelector('#rv').appendChild(renderPuzzle(it.data, { mode: 'review', given: a ? a.given : null }).el);
      drawCats(sheet);
    });
  });
}

// ==========================================================
// 14. PROFIL
// ==========================================================
const BADGES = [
  { id: 'loops', e: '🌀', name: 'Maître des boucles', test: () => C.weeks[5].notions.every(n => notionDone(n.id)) },
  { id: 'zero', e: '💯', name: 'Zéro segfault', test: () => D().stats.perfect },
  { id: 'night', e: '🌙', name: 'Noctambule', test: () => D().stats.night },
  { id: 'bugs', e: '🐛', name: 'Chasseur de bugs', test: () => D().stats.bugsFound >= 20 },
];

function screenProfil() {
  const d = D();
  const done = C.order.filter(notionDone).length;
  view(`
    <div class="sheet-top">
      <div class="avatar" aria-hidden="true">${esc(d.avatar)}</div>
      <div style="flex:1;min-width:0"><div style="font-weight:800;font-size:1.25rem">${esc(nick())}</div><button class="hint-btn" id="editNick">✎ modifier</button></div>
      ${catHTML(80)}
    </div>
    <div class="stats">
      <div><b>${done}</b><span>notions sur ${C.order.length}</span></div>
      <div><b>${d.stats.puzzlesSolved}</b><span>puzzles réussis</span></div>
      <div><b>${d.stats.bestMock ? d.stats.bestMock.score + '/15' : '—'}</b><span>examen blanc</span></div>
    </div>
    <h3>Badges</h3>
    <div class="badges">${BADGES.map(b => { const on = b.test(); return `<div class="badge${on ? '' : ' locked'}" title="${esc(b.name)}"><span class="e" aria-hidden="true">${b.e}</span>${esc(b.name)}${on ? '' : '<br><span class="muted">🔒</span>'}</div>`; }).join('')}</div>
    <h3>Avatar</h3><div class="avatars" id="avatars"></div>
    <h3>Couleur</h3><div class="swatches" id="swatches"></div>
    <h3>Segfault porte...</h3><div class="opts-row" id="acc"></div>
    <h3>Pelage de Segfault</h3><div class="opts-row" id="fur"></div>
    <h3>Réglages</h3>
    <div>
      <div class="toggle"><span>🔠 Taille du texte</span><div class="opts-row" id="size" style="flex:0 0 auto"></div></div>
      <div class="toggle"><span id="lr">🌀 Mouvement réduit</span><button class="switch" role="switch" aria-labelledby="lr" aria-checked="${!!d.reduceMotion}" id="reduce"></button></div>
      <div class="toggle"><span id="ls">🔊 Sons</span><button class="switch" role="switch" aria-labelledby="ls" aria-checked="${!!d.sounds}" id="sounds"></button></div>
      <button class="menu-row" data-go="examens"><span>📅 Mes dates d'examens</span><span aria-hidden="true">›</span></button>
      <button class="menu-row" data-go="about"><span>ℹ️ À propos</span><span aria-hidden="true">›</span></button>
      ${store.isAdmin ? '<button class="menu-row" data-go="admin"><span>📊 Stats de la classe (admin)</span><span aria-hidden="true">›</span></button>' : ''}
      <button class="menu-row" id="logout"><span>🚪 Déconnexion</span><span></span></button>
      <button class="menu-row" id="delete" style="color:var(--bad)"><span>🗑️ Supprimer mon compte</span><span></span></button>
    </div>
    ${store.user.email ? `<p class="muted">Connecté·e : ${esc(store.user.email)}</p>` : ''}
    <div class="foot">Un projet MOS Arcade</div>`);
  bindGo();
  const refresh = () => { applySettings(); store.save(); screenProfil(); };
  drawAvatarPicker($('#avatars'), refresh);
  drawAccentPicker($('#swatches'), refresh);
  $('#acc').innerHTML = ACCESSORIES.map(([k, l]) => `<button class="${d.accessory === k ? 'on' : ''}" data-v="${k}">${l}</button>`).join('');
  $$('#acc button').forEach(b => b.onclick = () => { d.accessory = b.dataset.v; refresh(); });
  $('#fur').innerHTML = FURS.map(([l, c]) => `<button class="${d.fur === c ? 'on' : ''}" data-v="${c}"><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${c};border:1px solid #fff;vertical-align:middle"></span> ${l}</button>`).join('');
  $$('#fur button').forEach(b => b.onclick = () => { d.fur = b.dataset.v; refresh(); });
  $('#size').innerHTML = ['Petit', 'Moyen', 'Grand'].map((l, k) => `<button class="${d.textSize === k ? 'on' : ''}" data-v="${k}" style="min-width:auto;flex:none">${l}</button>`).join('');
  $$('#size button').forEach(b => b.onclick = () => { d.textSize = Number(b.dataset.v); refresh(); });
  $('#reduce').onclick = () => { d.reduceMotion = !d.reduceMotion; refresh(); };
  $('#sounds').onclick = () => { d.sounds = !d.sounds; refresh(); if (d.sounds) sound('ok'); };
  $('#editNick').onclick = () => openSheet(`<h2>Ton surnom</h2><label for="nk" class="muted">Surnom</label><input id="nk" class="field" maxlength="20" value="${esc(d.nickname)}"><button class="btn" data-ok>Enregistrer</button><button class="btn ghost" data-close>Annuler</button>`, (sheet, close) => {
    sheet.querySelector('[data-ok]').onclick = () => { d.nickname = sheet.querySelector('#nk').value.trim().slice(0, 20); close(); refresh(); };
  });
  $('#logout').onclick = async () => { await store.signOut(); location.hash = ''; };
  $('#delete').onclick = async () => {
    const ok = await confirmSheet('Supprimer ton compte ?', 'Toute ta progression, tes points faibles et ton profil seront **effacés pour toujours**. Impossible d\'annuler.', 'Oui, tout supprimer', true);
    if (!ok) return;
    try { await store.deleteAccount(); toast('Compte supprimé. Bye bye 👋'); location.hash = ''; } catch (e) { toast('Suppression impossible : ' + (e.code || e.message)); }
  };
}

function drawAvatarPicker(root, after) {
  root.innerHTML = AVATARS.map(a => `<button class="${D().avatar === a ? 'on' : ''}" data-v="${a}" aria-label="Avatar ${a}">${a}</button>`).join('');
  root.querySelectorAll('button').forEach(b => b.onclick = () => {
    D().avatar = b.dataset.v;
    store.save();
    if (after) after(); else drawAvatarPicker(root);
  });
}
function drawAccentPicker(root, after) {
  root.innerHTML = ACCENTS.map(([n, c]) => `<button class="sw${D().accent === c ? ' on' : ''}" style="background:${c}" data-v="${c}" aria-label="Couleur ${n}"></button>`).join('');
  root.querySelectorAll('button').forEach(b => b.onclick = () => {
    D().accent = b.dataset.v;
    applySettings();
    store.save();
    if (after) after(); else { drawAccentPicker(root); drawCats(main); }
  });
}

function screenExamDates() {
  const exams = C.course.exams;
  view(`<div class="top"><button class="back" data-go="profil" aria-label="Retour">←</button><h1>📅 Mes dates d'examens</h1></div>
    <p class="muted">Les dates sont devinées à partir du plan de cours (lundi de la semaine). Mets les vraies dates de ton groupe ici.</p>
    ${exams.map(e => `<label class="muted" for="d-${e.id}">${esc(e.label)} (semaine ${e.week})</label>
      <input class="field" type="date" id="d-${e.id}" data-id="${e.id}" value="${isoDate(examDate(e, D().examDates))}">`).join('')}
    <button class="btn" id="save">Enregistrer</button>
    <button class="btn ghost" id="reset">Revenir aux dates devinées</button>`);
  bindGo();
  $('#save').onclick = () => {
    $$('input[type="date"]').forEach(i => { if (i.value) D().examDates[i.dataset.id] = i.value; });
    store.save();
    toast('Dates enregistrées ✅');
    go('profil');
  };
  $('#reset').onclick = () => { D().examDates = {}; store.save(); screenExamDates(); };
}

function screenAbout() {
  view(`<div class="top"><button class="back" data-go="${store.user ? 'profil' : 'home'}" aria-label="Retour">←</button><h1>ℹ️ À propos</h1></div>
    <div class="greet">${catHTML(70)}<div class="bubble">Salut ! Moi c'est Segfault. Je t'aide à réviser le C++ du cours <b>420-1C6 Programmation structurée</b>.</div></div>
    <div class="card plain" style="display:flex;flex-direction:column;gap:8px;font-size:.92rem">
      <b>⚠️ App non officielle</b>
      <span>Faite par une étudiante pour étudier, pas par le cégep ni le prof. Le plan de cours et Léa restent la référence. Si tu vois une erreur, utilise « 🚩 Signaler une erreur ».</span>
    </div>
    <div class="card plain" style="display:flex;flex-direction:column;gap:8px;font-size:.92rem">
      <b>🔒 Confidentialité</b>
      <span>• Avec la connexion Google, l'app garde ton surnom, ta progression et tes réglages, liés à ton compte. Personne d'autre ne peut les lire.</span>
      <span>• Les statistiques de classe sont <b>anonymes</b> : juste « combien d'erreurs sur telle notion », sans nom.</span>
      <span>• Les signalements d'erreur sont envoyés sans ton nom.</span>
      <span>• « Supprimer mon compte » (dans Profil) efface tout, pour de vrai.</span>
    </div>
    <div class="foot">Un projet MOS Arcade · 2026</div>`);
  bindGo();
}

async function screenAdmin() {
  if (!store.isAdmin) return go('profil');
  view(`<div class="top"><button class="back" data-go="profil" aria-label="Retour">←</button><h1>📊 Stats de la classe</h1></div><div class="loading"><div class="spinner"></div></div>`);
  bindGo();
  try {
    const data = await store.loadAdmin();
    const loading = main.querySelector('.loading');
    if (!loading) return; // user left the screen
    loading.outerHTML = `<h3>Notions les plus difficiles (erreurs, anonymes)</h3>
      <div style="display:flex;flex-direction:column;gap:6px">${data.stats.slice(0, 20).map(s => `<div class="list-item"><span class="t">${esc(C.notions[s.id]?.title || s.id)}</span><span class="pill">${s.wrong}</span></div>`).join('') || '<p class="muted">Pas encore de données.</p>'}</div>
      <h3>Derniers signalements</h3>
      <div style="display:flex;flex-direction:column;gap:6px">${data.reports.map(r => `<div class="list-item"><span class="t"><b>${esc(itemLabel(r.item))}</b><br>${esc(r.text)}</span></div>`).join('') || '<p class="muted">Aucun signalement.</p>'}</div>`;
  } catch (e) {
    main.querySelector('.loading')?.replaceWith(h(`<div class="error-box">Chargement impossible : ${esc(e.message)}</div>`));
  }
}

start();
