/* engine.js — Pipe Flow puzzle engine (STeamWorkS / MOS Arcade)
 * Pure logic: level generation, rotation, water flow, win check, hints.
 * Works in the browser (window.PF) and in Node (module.exports) so every
 * level can be checked for a solution before release.
 *
 * Directions: N=1 E=2 S=4 W=8 (bit masks). Index order 0..3 = N,E,S,W.
 */
(function (root) {
'use strict';

const DIRB = [1, 2, 4, 8];
const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
const opp = d => (d + 2) & 3;
const rotCW = m => ((m << 1) | (m >> 3)) & 15;
function rot(m, k) { k = ((k % 4) + 4) % 4; while (k--) m = rotCW(m); return m; }
function bits(m) { let n = 0; for (let i = 0; i < 4; i++) if (m & DIRB[i]) n++; return n; }
// Fewest clockwise taps that turn mask a into mask b (-1 if impossible).
function tapsTo(a, b) { for (let k = 0; k < 4; k++) if (rot(a, k) === b) return k; return -1; }
function kind(m) {
  const n = bits(m);
  if (n === 1) return 'end';
  if (n === 2) return (m === 5 || m === 10) ? 'straight' : 'corner';
  if (n === 3) return 'tee';
  if (n === 4) return 'cross';
  return 'none';
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function strHash(s) {
  let h = 1779033703;
  for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return h >>> 0;
}

/* ── Level plan: 5 worlds × 45 levels ─────────────────────────── */
const WORLDS = [
  { id: 'garden', emoji: '🌷' },
  { id: 'desert', emoji: '🏜️' },
  { id: 'snow',   emoji: '❄️' },
  { id: 'city',   emoji: '🌃' },
  { id: 'castle', emoji: '🏰' }
];
const PER_WORLD = 45;
const LEVEL_COUNT = WORLDS.length * PER_WORLD;
const GATES = [0, 70, 160, 260, 360]; // stars needed to open each world

function levelParams(L) {
  const w = Math.floor(L / PER_WORLD), k = L % PER_WORLD;
  const p = { world: w, size: 4, colors: 1, locked: 0, leaks: 0, bridges: 0, scramble: 1,
              minGoals: 1, maxGoals: 3, cover: 0.85, pLast: 0.55, rocks: 0, minPar: 3 };
  if (w === 0) {
    p.size = k < 8 ? 4 : k < 22 ? 5 : 6;
    p.scramble = k < 2 ? 0.3 : k < 5 ? 0.55 : k < 10 ? 0.8 : 1;
    p.minPar = k < 2 ? 2 : k < 5 ? 3 : 4;
    p.maxGoals = p.size === 4 ? 2 : p.size === 5 ? 3 : 4;
    p.minGoals = k < 3 ? 1 : 2;
    p.cover = p.size === 4 ? 0.9 : 0.85;
  } else if (w === 1) {
    p.size = k < 12 ? 5 : k < 30 ? 6 : 7;
    p.locked = 0.18 + 0.12 * (k / 44);
    p.maxGoals = p.size - 1; p.minGoals = 2;
    p.rocks = p.size >= 7 ? 2 : 1;
    p.minPar = 6;
  } else if (w === 2) {
    p.size = k < 12 ? 6 : k < 30 ? 7 : 8;
    p.locked = 0.15;
    p.leaks = k < 4 ? 1 : k < 20 ? 2 : 3;
    p.maxGoals = p.size - 1; p.minGoals = 2;
    p.rocks = 1;
    p.minPar = 8;
  } else if (w === 3) {
    p.size = k < 12 ? 6 : k < 30 ? 7 : 8;
    p.colors = 2;
    p.locked = 0.12;
    p.leaks = k < 15 ? 0 : k < 30 ? 1 : 2;
    p.maxGoals = p.size; p.minGoals = 2;
    p.cover = 0.82;
    p.minPar = 8;
  } else {
    p.size = k < 12 ? 7 : k < 30 ? 8 : 9;
    p.bridges = k < 10 ? 1 : k < 28 ? 2 : 3;
    p.colors = (k % 3 === 2 || k > 36) ? 2 : 1;
    p.locked = 0.12;
    p.leaks = k < 8 ? 0 : 1 + (k % 2);
    p.maxGoals = p.size; p.minGoals = 2;
    p.cover = 0.8;
    p.minPar = 10;
  }
  return p;
}

/* ── Generator ─────────────────────────────────────────────────
 * Grows one tree of pipes per water colour from its source (disjoint
 * cells, so colours can never touch in the intended solution). Tree
 * leaves become goals. Other cells get decoy pipes. Then pipes are
 * turned at random. Because the trees only point at their own cells,
 * the original turn of every tree pipe is always a full solution.   */
function generate(params, seed) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const lv = tryGenerate(params, mulberry32((seed >>> 0) + attempt * 104729));
    if (lv) { lv.seed = seed; lv.attempt = attempt; return lv; }
  }
  throw new Error('Could not generate level for seed ' + seed);
}

function tryGenerate(P, rnd) {
  const w = P.size, h = P.size, n = w * h;
  const RI = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const idx = (x, y) => y * w + x;
  const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h;
  const cells = [];
  for (let i = 0; i < n; i++) cells.push({ t: 'pipe', sol: 0, m: 0, lock: false, crack: false, c: 0, tree: -1, used: 0 });

  // bridges (interior, not touching each other)
  const bridges = [];
  for (let b = 0, tries = 0; b < P.bridges && tries < 200; tries++) {
    const x = RI(1, w - 2), y = RI(1, h - 2), i = idx(x, y);
    if (bridges.some(j => Math.abs(j % w - x) + Math.abs(Math.floor(j / w) - y) <= 2)) continue;
    cells[i].t = 'bridge'; cells[i].used = 0; bridges.push(i); b++;
  }

  // sources
  const srcs = [];
  for (let c = 0; c < P.colors; c++) {
    for (let tries = 0; tries < 200; tries++) {
      let x, y;
      if (P.colors === 1) { x = RI(0, w - 1); y = RI(0, h - 1); }
      else { x = c === 0 ? RI(0, Math.floor(w / 2) - 1) : RI(Math.ceil(w / 2), w - 1); y = RI(0, h - 1); }
      const i = idx(x, y);
      if (cells[i].t !== 'pipe' || cells[i].tree >= 0) continue;
      cells[i].t = 'src'; cells[i].c = c; cells[i].tree = c; srcs.push(i); break;
    }
  }
  if (srcs.length !== P.colors) return null;

  // tree growth
  const adj = new Map(); // cell -> [{d, to, via}]
  const link = (a, d, b, via) => {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push({ d, to: b, via });
    adj.get(b).push({ d: opp(d), to: a, via });
    cells[a].sol |= DIRB[d]; cells[b].sol |= DIRB[opp(d)];
  };
  const active = srcs.map(s => [s]);
  const target = Math.round(n * P.cover) - bridges.length;
  let placed = srcs.length, guard = 0;
  while (placed < target && active.some(a => a.length) && guard++ < 20000) {
    // grow the smaller tree first so colours stay balanced
    let c = 0;
    if (P.colors === 2) {
      const sz = [0, 0]; cells.forEach(cl => { if (cl.tree >= 0) sz[cl.tree]++; });
      c = (!active[1].length) ? 0 : (!active[0].length) ? 1 : (sz[0] <= sz[1] ? 0 : 1);
    }
    const list = active[c];
    if (!list.length) continue;
    const li = rnd() < P.pLast ? list.length - 1 : RI(0, list.length - 1);
    const a = list[li], ax = a % w, ay = Math.floor(a / w);
    const deg = bits(cells[a].sol);
    const maxDeg = cells[a].t === 'src' ? 3 : (rnd() < 0.08 ? 4 : 3);
    const opts = [];
    if (deg < maxDeg) {
      for (let d = 0; d < 4; d++) {
        if (cells[a].sol & DIRB[d]) continue;
        const bx = ax + DX[d], by = ay + DY[d];
        if (!inside(bx, by)) continue;
        const b = idx(bx, by), cb = cells[b];
        if (cb.t === 'pipe' && cb.tree < 0) opts.push({ d, to: b, via: -1 });
        else if (cb.t === 'bridge') {
          const axis = (d === 1 || d === 3) ? 1 : 2;
          if (cb.used & axis) continue;
          const cx = bx + DX[d], cy = by + DY[d];
          if (!inside(cx, cy)) continue;
          const cc = idx(cx, cy);
          if (cells[cc].t === 'pipe' && cells[cc].tree < 0) opts.push({ d, to: cc, via: b, axis });
        }
      }
    }
    if (!opts.length) { list.splice(li, 1); continue; }
    const viaB = opts.filter(x => x.via >= 0);
    const o = (viaB.length && rnd() < 0.75) ? viaB[RI(0, viaB.length - 1)] : opts[RI(0, opts.length - 1)];
    link(a, o.d, o.to, o.via);
    cells[o.to].tree = c;
    if (o.via >= 0) cells[o.via].used |= o.axis;
    list.push(o.to);
    placed++;
  }

  // leaves → goals; prune extra leaves until goal count fits
  const leaves = () => {
    const out = [];
    for (const [i, l] of adj) if (cells[i].t !== 'src' && l.length === 1) out.push(i);
    return out;
  };
  const unlink = i => {
    const l = adj.get(i) || [];
    for (const e of l) {
      const back = adj.get(e.to);
      const k = back.findIndex(x => x.to === i);
      if (k >= 0) back.splice(k, 1);
      cells[e.to].sol &= ~DIRB[opp(e.d)];
      if (e.via >= 0) cells[e.via].used &= ~((e.d === 1 || e.d === 3) ? 1 : 2);
    }
    adj.delete(i);
    cells[i].sol = 0; cells[i].tree = -1;
  };
  let lf = leaves();
  let pruneGuard = 0;
  while (lf.length > P.maxGoals && pruneGuard++ < 500) {
    unlink(lf[RI(0, lf.length - 1)]);
    lf = leaves();
  }
  if (lf.length < P.minGoals || lf.length > P.maxGoals) return null;
  for (let c = 0; c < P.colors; c++) if (!lf.some(i => cells[i].tree === c)) return null;
  for (const s of srcs) if (!cells[s].sol) return null;
  for (const i of lf) { cells[i].t = 'goal'; cells[i].c = cells[i].tree; }
  // bridges nobody uses become rocks
  for (const b of bridges) if (!cells[b].used) cells[b].t = 'rock';
  if (P.bridges && !bridges.some(b => cells[b].t === 'bridge')) return null;

  // non-tree cells: rocks and decoys
  const free = [];
  for (let i = 0; i < n; i++) if (cells[i].t === 'pipe' && cells[i].tree < 0) free.push(i);
  let rocks = Math.min(P.rocks, Math.max(0, free.length - 2));
  for (let r = 0; r < rocks; r++) {
    const k = RI(0, free.length - 1);
    cells[free[k]].t = 'rock'; free.splice(k, 1);
  }
  const DECOY = [1, 1, 5, 5, 5, 3, 3, 3, 3, 7, 7];
  for (const i of free) cells[i].sol = rot(DECOY[RI(0, DECOY.length - 1)], RI(0, 3));
  // leaks: cracked decoys, prefer ones touching the trees
  if (P.leaks) {
    const touching = free.filter(i => {
      const x = i % w, y = Math.floor(i / w);
      for (let d = 0; d < 4; d++) {
        const bx = x + DX[d], by = y + DY[d];
        if (inside(bx, by) && cells[idx(bx, by)].tree >= 0) return true;
      }
      return false;
    });
    const pool = touching.length >= P.leaks ? touching : free;
    if (pool.length < P.leaks) return null;
    for (let k = 0; k < P.leaks; k++) {
      const j = RI(0, pool.length - 1);
      cells[pool[j]].crack = true; pool.splice(j, 1);
    }
  }

  // locks: some tree pipes stay in place
  const treePipes = [];
  for (let i = 0; i < n; i++) if (cells[i].t === 'pipe' && cells[i].tree >= 0) treePipes.push(i);
  if (P.locked) {
    const want = Math.round(treePipes.length * P.locked);
    const pool = treePipes.filter(i => kind(cells[i].sol) !== 'cross');
    for (let k = 0; k < want && pool.length; k++) {
      const j = RI(0, pool.length - 1);
      cells[pool[j]].lock = true; pool.splice(j, 1);
    }
  }

  // scramble
  for (let i = 0; i < n; i++) {
    const cl = cells[i];
    cl.m = cl.sol;
    if (cl.t !== 'pipe' || cl.lock) continue;
    if (cl.tree < 0 || rnd() < P.scramble) cl.m = rot(cl.sol, RI(0, 3));
  }
  // make sure enough tree pipes start wrong
  let par = 0;
  for (const i of treePipes) if (!cells[i].lock) par += tapsTo(cells[i].m, cells[i].sol);
  let fix = 0;
  while (par < P.minPar && fix++ < 50) {
    const cand = treePipes.filter(i => !cells[i].lock && cells[i].m === cells[i].sol && kind(cells[i].sol) !== 'cross');
    if (!cand.length) break;
    const i = cand[RI(0, cand.length - 1)];
    cells[i].m = rot(cells[i].sol, RI(1, 3));
    par += tapsTo(cells[i].m, cells[i].sol);
  }
  if (par < Math.min(P.minPar, 2)) return null;

  const lv = { w, h, cells, srcs, colors: P.colors, par, world: P.world, params: P };
  // depth in the solution tree (for hints: fix pipes near the source first)
  const depth = new Array(n).fill(99);
  for (const s of srcs) {
    depth[s] = 0;
    const q = [s];
    while (q.length) {
      const a = q.shift();
      for (const e of adj.get(a) || []) if (depth[e.to] > depth[a] + 1) { depth[e.to] = depth[a] + 1; q.push(e.to); }
    }
  }
  lv.depth = depth;
  // checks: solution must win, start must not
  if (!flow(lv, true).solved) return null;
  if (flow(lv).solved) return null;
  return lv;
}

/* ── Water flow ────────────────────────────────────────────────
 * Node = cell*3 + slot (slot 0 normal, 1 bridge east-west, 2 bridge north-south).
 * Returns per node: colour bits (wet), entry dir per colour, BFS parent per colour. */
function flow(lv, useSol) {
  const { w, h, cells } = lv, n = w * h;
  const M = i => useSol ? cells[i].sol : cells[i].m;
  const wet = new Uint8Array(n * 3);
  const entry = [new Int8Array(n * 3).fill(-2), new Int8Array(n * 3).fill(-2)];
  const parent = [new Int32Array(n * 3).fill(-1), new Int32Array(n * 3).fill(-1)];
  const order = [[], []];
  for (const s of lv.srcs) {
    const c = cells[s].c, start = s * 3;
    wet[start] |= 1 << c; entry[c][start] = -1;
    const q = [start]; order[c].push(start);
    while (q.length) {
      const node = q.shift(), i = Math.floor(node / 3), slot = node % 3;
      const x = i % w, y = Math.floor(i / w);
      const cl = cells[i];
      let out;
      if (cl.t === 'bridge') out = slot === 1 ? 10 : 5;
      else out = M(i);
      for (let d = 0; d < 4; d++) {
        if (!(out & DIRB[d])) continue;
        const bx = x + DX[d], by = y + DY[d];
        if (bx < 0 || by < 0 || bx >= w || by >= h) continue;
        const j = by * w + bx, cj = cells[j];
        let nn;
        if (cj.t === 'bridge') nn = j * 3 + ((d === 1 || d === 3) ? 1 : 2);
        else if (cj.t === 'rock') continue;
        else if (M(j) & DIRB[opp(d)]) nn = j * 3;
        else continue;
        if (wet[nn] & (1 << c)) continue;
        wet[nn] |= 1 << c; entry[c][nn] = opp(d); parent[c][nn] = node;
        order[c].push(nn); q.push(nn);
      }
    }
  }
  let mixed = false, leak = false, goalsOk = true, goalsWet = 0, goalsTotal = 0;
  for (let i = 0; i < n; i++) {
    const cl = cells[i];
    for (let s = 0; s < 3; s++) if (wet[i * 3 + s] === 3) mixed = true;
    if (cl.crack && wet[i * 3]) leak = true;
    if (cl.t === 'goal') {
      goalsTotal++;
      if (wet[i * 3] === (1 << cl.c)) goalsWet++; else goalsOk = false;
    }
  }
  return { wet, entry, parent, order, mixed, leak, goalsWet, goalsTotal, solved: goalsOk && !mixed && !leak };
}

/* Hint: the wrong tree pipe closest to a source. */
function hintCell(lv) {
  let best = -1;
  lv.cells.forEach((cl, i) => {
    if (cl.t !== 'pipe' || cl.tree < 0 || cl.lock || cl.m === cl.sol) return;
    if (best < 0 || lv.depth[i] < lv.depth[best]) best = i;
  });
  return best;
}

function levelFor(L) { return generate(levelParams(L), 0x9E3779B1 ^ Math.imul(L + 1, 2654435761)); }

function dailyParams(dateKey) {
  const r = mulberry32(strHash('daily' + dateKey));
  const style = Math.floor(r() * 5);
  const p = levelParams(style * PER_WORLD + 20);
  p.size = 7;
  return p;
}
function dailyLevel(dateKey) { return generate(dailyParams(dateKey), strHash('pf-daily-' + dateKey)); }

function endlessParams(n, seed) {
  const r = mulberry32(seed);
  const style = Math.floor(r() * 5);
  const p = levelParams(style * PER_WORLD + 25 + Math.floor(r() * 20));
  p.size = 6 + Math.floor(r() * 4);
  if (p.bridges) p.size = Math.max(7, p.size);
  return p;
}
function endlessLevel(n, seed) { return generate(endlessParams(n, seed), seed); }

const PF = { DIRB, DX, DY, opp, rot, rotCW, bits, kind, tapsTo, mulberry32, strHash,
  WORLDS, PER_WORLD, LEVEL_COUNT, GATES, levelParams, generate, flow, hintCell,
  levelFor, dailyLevel, endlessLevel };
if (typeof module !== 'undefined' && module.exports) module.exports = PF;
else root.PF = PF;
})(typeof window !== 'undefined' ? window : globalThis);
