// ==========================================================
// tools.js — the 4 loop tools (week 5):
//   tracer (pas à pas), trace tables, star patterns, menu builder
// Each function fills a container element.
// ==========================================================
import { esc, md, codeBlock, toast, sound, shuffle } from './ui.js';

// ---------- 1. TRACER: run code one step at a time ----------
export function renderTracer(root, tr) {
  root.innerHTML = '';
  const code = codeBlock(tr.code);
  const vars = document.createElement('div');
  vars.className = 'vars';
  vars.innerHTML = tr.vars.map(v => `<div class="mbox"><div class="name">${esc(v)}</div><div class="val out" data-v="${esc(v)}">—</div><div class="type">int</div></div>`).join('');
  const note = document.createElement('div');
  note.className = 'note';
  note.setAttribute('aria-live', 'polite');
  note.textContent = 'Appuie sur Suivant ▶';
  const guess = document.createElement('div');
  guess.className = 'guess';
  guess.hidden = true;
  const out = document.createElement('div');
  out.className = 'console';
  const ctrl = document.createElement('div');
  ctrl.className = 'ctrl';
  ctrl.innerHTML = '<button data-a="back" aria-label="Pas précédent">◀</button><button class="main" data-a="play">▶ Play</button><button data-a="next">Suivant ▶</button>';
  const speed = document.createElement('label');
  speed.className = 'speed';
  speed.innerHTML = '<span aria-hidden="true">🐢</span><input type="range" min="200" max="1600" value="850" aria-label="Vitesse (plus à droite = plus rapide)" style="direction:rtl"><span aria-hidden="true">🐇</span>';
  const toggle = document.createElement('div');
  toggle.className = 'toggle';
  toggle.innerHTML = '<span id="gl">🎯 Mode devine : prédis la prochaine valeur</span><button class="switch" role="switch" aria-checked="false" aria-labelledby="gl"></button>';
  const sw = toggle.querySelector('.switch');
  sw.onclick = () => sw.setAttribute('aria-checked', sw.getAttribute('aria-checked') === 'true' ? 'false' : 'true');

  root.append(code, vars, note, guess, out, ctrl, speed, toggle);

  let st = -1;
  let timer = null;
  const show = () => {
    const s = tr.steps[st];
    code.querySelectorAll('.ln').forEach((ln, k) => ln.classList.toggle('hl', !!s && k === s.line));
    tr.vars.forEach(v => {
      const box = vars.querySelector(`[data-v="${v}"]`);
      const val = s && s.vars[v] !== null && s.vars[v] !== undefined ? String(s.vars[v]) : '—';
      if (box.textContent !== val) { box.classList.add('bump'); setTimeout(() => box.classList.remove('bump'), 200); }
      box.textContent = val;
      box.classList.toggle('out', val === '—');
    });
    note.textContent = s ? s.note : 'Appuie sur Suivant ▶';
    out.textContent = s ? s.out : '';
  };
  const stop = () => { clearTimeout(timer); timer = null; ctrl.querySelector('[data-a="play"]').textContent = '▶ Play'; };
  const next = () => {
    if (st >= tr.steps.length - 1) { stop(); return; }
    const n = tr.steps[st + 1];
    if (sw.getAttribute('aria-checked') === 'true' && n.change && st >= 0) {
      stop();
      ask(n.change);
      return;
    }
    st++;
    show();
  };
  const ask = ch => {
    guess.hidden = false;
    const opts = shuffle([ch.value - 1, ch.value, ch.value + 1]);
    guess.innerHTML = `<div class="note">🎯 Que vaut <b>${esc(ch.var)}</b> après ce pas ?</div><div class="opts">${opts.map(o => `<button data-o="${o}">${o}</button>`).join('')}</div>`;
    guess.querySelectorAll('button').forEach(b => b.onclick = () => {
      const ok = Number(b.dataset.o) === ch.value;
      toast(ok ? 'Bien vu ⚡' : `Presque ! C'était ${ch.value}`);
      sound(ok ? 'ok' : 'no');
      guess.hidden = true;
      st++;
      show();
    });
    guess.querySelector('button').focus();
  };
  ctrl.querySelector('[data-a="next"]').onclick = next;
  ctrl.querySelector('[data-a="back"]').onclick = () => { stop(); if (st > -1) { st--; show(); } };
  ctrl.querySelector('[data-a="play"]').onclick = () => {
    if (timer) { stop(); return; }
    if (st >= tr.steps.length - 1) st = -1;
    ctrl.querySelector('[data-a="play"]').textContent = '⏸ Pause';
    const tick = () => { next(); if (timer) timer = setTimeout(tick, Number(speed.querySelector('input').value)); };
    timer = setTimeout(tick, 60);
  };
  return () => stop();
}

// ---------- 2. TRACE TABLE: fill the values after each turn ----------
export function renderTraceTable(root, tt, onDone) {
  root.innerHTML = '';
  root.appendChild(codeBlock(tt.code));
  const help = document.createElement('p');
  help.className = 'muted';
  help.textContent = 'Remplis les valeurs APRÈS chaque tour. Chaque case se vérifie toute seule.';
  root.appendChild(help);
  const table = document.createElement('table');
  table.className = 'tt';
  table.innerHTML = `<thead><tr><th>tour</th>${tt.columns.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${
    tt.rows.map((row, r) => `<tr><th>${r + 1}</th>${row.map((_, c) => `<td><input inputmode="numeric" autocomplete="off" aria-label="Tour ${r + 1}, ${esc(tt.columns[c])}" data-r="${r}" data-c="${c}"></td>`).join('')}</tr>`).join('')
  }</tbody>`;
  root.appendChild(table);
  const tip = document.createElement('div');
  tip.className = 'explain';
  tip.hidden = true;
  tip.innerHTML = '💡 ' + md(tt.hint);
  root.appendChild(tip);
  let finished = false;
  table.querySelectorAll('input').forEach(inp => {
    inp.oninput = () => {
      const want = tt.rows[inp.dataset.r][inp.dataset.c];
      const v = inp.value.trim();
      inp.classList.remove('ok', 'no');
      if (v === '' || v === '-') return;
      const ok = Number(v) === want;
      inp.classList.add(ok ? 'ok' : 'no');
      if (!ok) tip.hidden = false;
      const all = [...table.querySelectorAll('input')];
      if (!finished && all.every(i => i.classList.contains('ok'))) {
        finished = true;
        sound('win');
        toast('Table parfaite ! ⚡');
        onDone?.();
      }
    };
  });
}

// ---------- 3. STAR PATTERNS ----------
export function renderStar(root, s, onDone) {
  root.innerHTML = '';
  if (s.type === 'fill') {
    root.insertAdjacentHTML('beforeend', `<div style="font-weight:600">Complète le code pour obtenir ce dessin :</div><div class="star-pattern">${esc(s.pattern)}</div>`);
    root.appendChild(codeBlock(s.code));
    const choices = document.createElement('div');
    choices.className = 'choices';
    const fb = document.createElement('div');
    fb.className = 'explain';
    fb.hidden = true;
    s.choices.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'choice';
      b.innerHTML = `<span class="l">${'ABCD'[i]}.</span>${esc(c)}`;
      b.onclick = () => {
        const ok = i === s.answer;
        choices.querySelectorAll('.choice').forEach(x => x.classList.remove('right', 'wrong'));
        b.classList.add(ok ? 'right' : 'wrong');
        fb.hidden = false;
        fb.innerHTML = ok ? '⚡ ' + md(s.explain) : '💡 ' + md(s.hint) + ' Essaie encore !';
        sound(ok ? 'ok' : 'no');
        if (ok) onDone?.();
      };
      choices.appendChild(b);
    });
    root.append(choices, fb);
    return;
  }
  // "draw" type: tap the grid to draw what the code prints
  root.insertAdjacentHTML('beforeend', '<div style="font-weight:600">Qu\'est-ce que ce code dessine ? Tape les cases pour dessiner.</div>');
  root.appendChild(codeBlock(s.code));
  const chars = [...new Set(s.grid.join('').replace(/ /g, ''))];   // e.g. ['*'] or ['X', '.']
  const cycle = [' ', ...chars];
  const grid = document.createElement('div');
  grid.className = 'grid';
  grid.style.gridTemplateColumns = `repeat(${s.cols}, 32px)`;
  const cells = [];
  for (let r = 0; r < s.rows; r++) {
    for (let c = 0; c < s.cols; c++) {
      const b = document.createElement('button');
      b.dataset.v = ' ';
      b.setAttribute('aria-label', `Ligne ${r + 1}, colonne ${c + 1} : vide`);
      b.onclick = () => {
        const next = cycle[(cycle.indexOf(b.dataset.v) + 1) % cycle.length];
        b.dataset.v = next;
        b.textContent = next.trim();
        b.classList.toggle('on', next !== ' ');
        b.classList.remove('ok', 'no');
        b.setAttribute('aria-label', `Ligne ${r + 1}, colonne ${c + 1} : ${next === ' ' ? 'vide' : next}`);
      };
      cells.push({ b, want: s.grid[r][c] ?? ' ' });
      grid.appendChild(b);
    }
  }
  const legend = document.createElement('p');
  legend.className = 'muted';
  legend.textContent = `Chaque tape change la case : vide → ${chars.join(' → ')} → vide`;
  const check = document.createElement('button');
  check.className = 'btn';
  check.textContent = 'VÉRIFIER';
  const fb = document.createElement('div');
  fb.className = 'explain';
  fb.hidden = true;
  check.onclick = () => {
    let ok = true;
    cells.forEach(({ b, want }) => {
      const good = b.dataset.v === want;
      b.classList.toggle('ok', good && want !== ' ');
      b.classList.toggle('no', !good);
      if (!good) ok = false;
    });
    fb.hidden = false;
    fb.innerHTML = ok ? '⚡ Parfait ! ' + md(s.explain) : '💡 Pas tout à fait (cases roses). ' + md(s.hint);
    sound(ok ? 'win' : 'no');
    if (ok) onDone?.();
  };
  root.append(legend, grid, check, fb);
}

// ---------- 4. MENU BUILDER: fill the slots, then run it ----------
export function renderMenuBuilder(root, m, onDone) {
  root.innerHTML = '';
  const filled = m.answers.map(() => null);
  let selSlot = 0;

  const intro = document.createElement('p');
  intro.innerHTML = md('Tape une **case vide**, puis un **bloc** pour la remplir. Quand c\'est complet, exécute le menu !');
  const codeEl = document.createElement('div');
  codeEl.className = 'menu-code';
  const blocks = document.createElement('div');
  blocks.className = 'blocks';
  const actions = document.createElement('div');
  actions.className = 'row2';
  actions.innerHTML = '<button class="btn ghost" data-a="reset">Recommencer</button><button class="btn" data-a="run">▶ Exécuter</button>';
  const fb = document.createElement('div');
  fb.className = 'explain';
  fb.hidden = true;
  const consoleEl = document.createElement('div');
  consoleEl.className = 'console';
  consoleEl.hidden = true;
  const input = document.createElement('div');
  input.className = 'run-input';
  input.hidden = true;
  input.innerHTML = '<input class="field" inputmode="numeric" aria-label="Ton choix dans le menu" placeholder="Tape 1, 2 ou 0" style="font-family:var(--mono)"><button class="btn" style="width:auto">Entrée ⏎</button>';

  const drawCode = () => {
    codeEl.innerHTML = m.template.map(line => esc(line).replace(/\[\[(\d)\]\]/g, (_, k) => {
      const i = Number(k);
      const v = filled[i];
      return `<button class="slot${v ? ' filled' : ''}${i === selSlot ? ' sel' : ''}" data-slot="${i}" aria-label="Case ${i + 1}${v ? ' : ' + esc(v) : ' vide'}">${v ? esc(v) : '______'}</button>`;
    })).join('\n');
    codeEl.querySelectorAll('.slot').forEach(b => b.onclick = () => { selSlot = Number(b.dataset.slot); drawCode(); });
  };
  const drawBlocks = () => {
    blocks.innerHTML = '';
    m.blocks.forEach(bl => {
      const b = document.createElement('button');
      b.textContent = bl;
      b.onclick = () => {
        filled[selSlot] = bl;
        const nextEmpty = filled.findIndex(v => !v);
        selSlot = nextEmpty === -1 ? selSlot : nextEmpty;
        drawCode();
        sound('tap');
      };
      blocks.appendChild(b);
    });
  };

  actions.querySelector('[data-a="reset"]').onclick = () => {
    filled.fill(null); selSlot = 0; fb.hidden = true; consoleEl.hidden = true; input.hidden = true; drawCode();
  };
  actions.querySelector('[data-a="run"]').onclick = () => {
    if (filled.some(v => !v)) { toast('Il reste des cases vides 👀'); return; }
    const wrong = filled.map((v, i) => (v === m.answers[i] ? null : i)).filter(i => i !== null);
    codeEl.querySelectorAll('.slot').forEach((b, i) => { b.classList.toggle('ok', !wrong.includes(i)); b.classList.toggle('no', wrong.includes(i)); });
    if (wrong.length) {
      const reasons = wrong.map(i => m.explain[filled[i]] || (m.answers[i] === 'break;' ? m.explain['missing-break'] : `La case ${i + 1} attend autre chose.`));
      fb.hidden = false;
      fb.innerHTML = '💥 Le programme ne fait pas ce qu\'on veut :<br>' + [...new Set(reasons)].map(md).join('<br>');
      sound('no');
      return;
    }
    fb.hidden = false;
    fb.innerHTML = '⚡ Code parfait ! Teste ton menu dans la console 👇';
    consoleEl.hidden = false;
    input.hidden = false;
    consoleEl.textContent = m.menuText + '\n> ';
    input.querySelector('input').focus();
    sound('win');
    onDone?.();
  };
  const send = () => {
    const inp = input.querySelector('input');
    const v = inp.value.trim();
    if (v === '') return;
    inp.value = '';
    const opt = m.options.find(o => o.key === v);
    consoleEl.textContent += v + '\n' + (opt ? opt.text : m.invalid) + '\n';
    if (opt?.quit) {
      consoleEl.textContent += '(fin du programme : la condition du while est fausse)';
      input.hidden = true;
    } else {
      consoleEl.textContent += m.menuText + '\n> ';
    }
  };
  input.querySelector('button').onclick = send;
  input.querySelector('input').onkeydown = e => { if (e.key === 'Enter') send(); };

  root.append(intro, codeEl, blocks, actions, fb, consoleEl, input);
  drawCode();
  drawBlocks();
}
