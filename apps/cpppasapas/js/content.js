// ==========================================================
// content.js — loads the course files (content/*.json)
// and gives easy ways to find notions, puzzles, dates...
// ==========================================================

const TEACH_WEEKS = [1, 2, 3, 5, 8, 9, 11, 12, 13];

export const C = {
  course: null,
  weeks: {},        // week number → JSON of that week
  notions: {},      // notion id → { ...notion, week }
  order: [],        // notion ids in course order
  normes: null,
  lexique: [],
  outils: null,
  extraId: 'extra5', // the 10 extra loop puzzles act like a notion called "Défis boucles"
};

async function getJSON(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`Impossible de charger ${path}`);
  return r.json();
}

export async function loadContent() {
  const pad = n => String(n).padStart(2, '0');
  const [course, normes, lexique, outils, ...weeks] = await Promise.all([
    getJSON('content/course.json'),
    getJSON('content/normes.json'),
    getJSON('content/lexique.json'),
    getJSON('content/outils-boucles.json'),
    ...TEACH_WEEKS.map(w => getJSON(`content/semaine-${pad(w)}.json`)),
  ]);
  C.course = course;
  C.normes = { ...normes, week: 0 };
  C.lexique = lexique;
  C.outils = outils;
  C.notions[normes.id] = C.normes;
  weeks.forEach(wk => {
    C.weeks[wk.week] = wk;
    wk.notions.forEach(n => { C.notions[n.id] = { ...n, week: wk.week }; C.order.push(n.id); });
    if (wk.extraPuzzles?.length) {
      C.notions[C.extraId] = { id: C.extraId, title: 'Défis boucles (bonus)', week: wk.week, lesson: [], cards: [], explain: [], puzzles: wk.extraPuzzles, extra: true };
    }
  });
}

// ---------- items (puzzle / card / explain) ----------
// Every item has a key like "s5-for|p|2" = notion s5-for, puzzle #2.
export function itemKey(notionId, kind, i) { return `${notionId}|${kind}|${i}`; }
export function getItem(key) {
  const [nid, kind, i] = key.split('|');
  const n = C.notions[nid];
  if (!n) return null;
  const list = kind === 'p' ? n.puzzles : kind === 'c' ? n.cards : n.explain;
  const data = list?.[Number(i)];
  return data ? { key, kind, index: Number(i), notion: n, data } : null;
}

// All puzzles from the given weeks (for Examen blanc and Défi du jour).
export function puzzlesOfWeeks(weeks, types) {
  const out = [];
  const ids = [...C.order, C.extraId];
  ids.forEach(id => {
    const n = C.notions[id];
    if (!n || !weeks.includes(n.week)) return;
    n.puzzles.forEach((p, i) => { if (!types || types.includes(p.type)) out.push(itemKey(id, 'p', i)); });
  });
  return out;
}

// ---------- dates ----------
function parseDate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
export function weekStart(w) {
  const start = parseDate(C.course.week1Start);
  const extra = w > C.course.breakAfterWeek ? 7 : 0; // semaine de relâche
  return new Date(start.getTime() + ((w - 1) * 7 + extra) * 864e5);
}
export function currentWeek(today = new Date()) {
  for (let w = 16; w >= 1; w--) if (today >= weekStart(w)) return Math.min(w, 15);
  return 1;
}
// Guessed exam date = Monday of that week, unless the person set the real date in Profil.
export function examDate(exam, overrides = {}) {
  return overrides[exam.id] ? parseDate(overrides[exam.id]) : weekStart(exam.week);
}
export function daysUntil(date) {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((date - t) / 864e5);
}
export function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------- défi du jour: same puzzle for everyone on the same day ----------
export function defiDuJour(today = new Date()) {
  const w = currentWeek(today);
  const weeks = TEACH_WEEKS.filter(x => x <= Math.max(w, 1));
  const pool = puzzlesOfWeeks(weeks, ['predict', 'predict-typed', 'fill', 'bug']);
  const day = isoDate(today);
  let hash = 0;
  for (const ch of day) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return { key: pool[hash % pool.length], day };
}

export { TEACH_WEEKS };
