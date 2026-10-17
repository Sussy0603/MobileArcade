// ==========================================================
// quiz.js — draws ONE puzzle and checks the answer.
// Used by: notion puzzles, Points faibles, Défi du jour, Examen blanc.
//
// Puzzle types: predict, predict-typed, bug, fill, order, normes
// Modes:
//   'practice' → Vérifier shows right/wrong + explanation right away
//   'exam'     → Vérifier just records the answer (no feedback)
//   'review'   → shows a past answer with its feedback (read-only)
// ==========================================================
import { esc, md, codeBlock, catHTML, shuffle, sameAnswer, sound, drawCats } from './ui.js';

const YAY = ['OUIII ⚡', 'Compilé du premier coup ! 😼', 'T\'es une machine !!', 'Zéro bug. Respect. 🫡', 'EXACT. Je ronronne. 💖'];
const OOPS = 'Erreur de compilation... mais pas de toi 😸';

// Returns { el, check() } — el is the DOM element to insert.
export function renderPuzzle(p, { mode = 'practice', onAnswer, given } = {}) {
  const el = document.createElement('div');
  el.className = 'chunk';
  const state = { choice: null, text: '', line: null, order: [] };
  let answered = false;

  // ----- question + code -----
  const head = document.createElement('div');
  head.style.cssText = 'display:flex;gap:8px;align-items:flex-start';
  head.innerHTML = `<div style="font-weight:600;flex:1">${md(p.q || defaultQuestion(p.type))}</div>`;
  if (mode === 'practice' && p.hint) {
    const hb = document.createElement('button');
    hb.className = 'hint-btn';
    hb.textContent = '💡 Indice';
    hb.onclick = () => { hintBox.hidden = false; hb.disabled = true; };
    head.appendChild(hb);
  }
  el.appendChild(head);

  const hintBox = document.createElement('div');
  hintBox.className = 'explain';
  hintBox.hidden = true;
  hintBox.innerHTML = '💡 ' + md(p.hint || '');

  let codeEl = null;
  if (p.code && p.type !== 'order') {
    codeEl = codeBlock(p.code, {
      tap: p.type === 'bug' && mode !== 'review',
      onTap: (i, lineEl) => {
        if (answered) return;
        state.line = i;
        codeEl.querySelectorAll('.ln').forEach(x => x.classList.remove('hl'));
        lineEl.classList.add('hl');
        sound('tap');
      },
    });
    el.appendChild(codeEl);
  }
  el.appendChild(hintBox);
  if (p.type === 'bug') el.appendChild(Object.assign(document.createElement('div'), { className: 'muted', textContent: '👆 Tape la ligne qui contient l\'erreur.' }));

  // ----- answer area -----
  const area = document.createElement('div');
  area.className = 'choices';
  el.appendChild(area);

  const hasChoices = Array.isArray(p.choices) && p.choices.length;
  if (hasChoices) {
    p.choices.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'choice' + (p.type === 'normes' && !/[(){};=<>]/.test(c) && c.includes(' ') ? ' plain' : '');
      b.innerHTML = `<span class="l">${'ABCDEF'[i]}.</span><span>${esc(c)}</span>`;
      b.onclick = () => {
        if (answered) return;
        state.choice = i;
        area.querySelectorAll('.choice').forEach((x, k) => x.classList.toggle('sel', k === i));
        sound('tap');
      };
      area.appendChild(b);
    });
  } else if (p.type === 'predict-typed' || p.type === 'fill') {
    const lab = document.createElement('label');
    lab.className = 'muted';
    lab.textContent = p.type === 'fill' ? 'Ce qui remplace ___ :' : 'Ce qui s\'affiche :';
    const inp = document.createElement('input');
    inp.className = 'field';
    inp.style.fontFamily = 'var(--mono)';
    inp.autocomplete = 'off';
    inp.autocapitalize = 'off';
    inp.spellcheck = false;
    inp.oninput = () => { state.text = inp.value; };
    inp.onkeydown = e => { if (e.key === 'Enter') verifyBtn.click(); };
    const id = 'in' + Math.random().toString(36).slice(2);
    inp.id = id; lab.htmlFor = id;
    area.append(lab, inp);
  } else if (p.type === 'order') {
    const answerBox = document.createElement('div');
    answerBox.className = 'order-answer';
    answerBox.setAttribute('aria-label', 'Ta réponse, dans l\'ordre');
    const pool = document.createElement('div');
    pool.className = 'order-pool';
    const shuffled = shuffle(p.lines.map((l, i) => ({ l, i })));
    // Make sure it's not already in the right order.
    if (shuffled.every((x, k) => x.i === k) && shuffled.length > 1) shuffled.push(shuffled.shift());
    const redraw = () => {
      answerBox.innerHTML = state.order.length ? '' : '<span class="muted">Tape les lignes dans le bon ordre 👇</span>';
      state.order.forEach((x, k) => {
        const b = document.createElement('button');
        b.className = 'order-line';
        b.textContent = x.l || ' ';
        b.setAttribute('aria-label', `Retirer : ${x.l}`);
        b.onclick = () => { if (answered) return; state.order.splice(k, 1); redraw(); };
        answerBox.appendChild(b);
      });
      pool.innerHTML = '';
      shuffled.filter(x => !state.order.includes(x)).forEach(x => {
        const b = document.createElement('button');
        b.className = 'order-line';
        b.textContent = x.l || ' ';
        b.onclick = () => { if (answered) return; state.order.push(x); redraw(); sound('tap'); };
        pool.appendChild(b);
      });
    };
    area.append(answerBox, pool);
    area._redraw = redraw;
    redraw();
  }

  // ----- verify -----
  const fb = document.createElement('div');
  fb.className = 'feedback';
  fb.hidden = true;
  fb.setAttribute('role', 'status');
  el.appendChild(fb);

  const verifyBtn = document.createElement('button');
  verifyBtn.className = 'btn';
  verifyBtn.textContent = mode === 'exam' ? 'VALIDER →' : 'VÉRIFIER';
  el.appendChild(verifyBtn);

  function currentGiven() {
    if (hasChoices) return state.choice;
    if (p.type === 'bug') return state.line;
    if (p.type === 'order') return state.order.map(x => x.i);
    return state.text;
  }
  function isCorrect(g) {
    if (hasChoices) return g === p.answer;
    if (p.type === 'bug') return g === p.answer;
    if (p.type === 'order') return Array.isArray(g) && g.length === p.lines.length && g.every((v, k) => p.lines[v] === p.lines[k]);
    return sameAnswer(g ?? '', p.answer);
  }
  function hasAnswer(g) {
    if (p.type === 'order') return g.length === p.lines.length;
    if (hasChoices || p.type === 'bug') return g !== null && g !== undefined;
    return String(g ?? '').trim() !== '';
  }

  function showFeedback(g, ok) {
    answered = true;
    verifyBtn.hidden = true;
    area.querySelectorAll('input').forEach(i => { i.disabled = true; });
    if (hasChoices) {
      const btns = area.querySelectorAll('.choice');
      btns[p.answer]?.classList.add('right');
      if (!ok && g !== null && g !== undefined) btns[g]?.classList.add('wrong');
    }
    if (p.type === 'bug' && codeEl) {
      codeEl.querySelectorAll('.ln').forEach(x => x.classList.remove('hl'));
      codeEl.querySelectorAll('.ln')[p.answer]?.classList.add('good');
      if (!ok && g !== null && g !== undefined) codeEl.querySelectorAll('.ln')[g]?.classList.add('badl');
    }
    let extra = '';
    if (!ok && p.type === 'predict-typed') extra = `<div style="margin-top:6px">Réponse : <code>${esc(p.answer)}</code></div>`;
    if (!ok && p.type === 'fill' && !hasChoices) extra = `<div style="margin-top:6px">Réponse : <code>${esc(p.answer)}</code></div>`;
    if (!ok && p.type === 'order') extra = `<pre class="code" style="margin-top:8px">${p.lines.map(l => `<span class="ln">${esc(l)}</span>`).join('')}</pre>`;
    fb.hidden = false;
    fb.className = 'feedback ' + (ok ? 'ok' : 'no');
    fb.innerHTML = `${catHTML(52, ok ? '' : 'sad')}<div style="flex:1;min-width:0"><b>${ok ? YAY[Math.floor(Math.random() * YAY.length)] : OOPS}</b><div>${md(p.explain || '')}</div>${extra}${!ok && mode === 'practice' ? '<div class="muted" style="margin-top:4px">→ ajouté à tes points faibles</div>' : ''}</div>`;
    drawCats(fb);
  }

  verifyBtn.onclick = () => {
    const g = currentGiven();
    if (!hasAnswer(g)) {
      verifyBtn.animate?.([{ transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }], 200);
      return;
    }
    const ok = isCorrect(g);
    if (mode === 'exam') {
      answered = true;
      onAnswer?.({ correct: ok, given: g });
      return;
    }
    sound(ok ? 'ok' : 'no');
    showFeedback(g, ok);
    onAnswer?.({ correct: ok, given: g });
  };

  // Review mode: replay a past answer.
  if (mode === 'review') {
    if (hasChoices && given !== null && given !== undefined) area.querySelectorAll('.choice')[given]?.classList.add('sel');
    if ((p.type === 'predict-typed' || (p.type === 'fill' && !hasChoices)) && area.querySelector('input')) area.querySelector('input').value = given ?? '';
    if (p.type === 'order' && Array.isArray(given)) { state.order = given.map(i => ({ l: p.lines[i], i })); area._redraw(); }
    showFeedback(given, isCorrect(given));
  }

  return { el };
}

function defaultQuestion(type) {
  return {
    predict: 'Qu\'est-ce qui s\'affiche ?',
    'predict-typed': 'Écris exactement ce qui s\'affiche.',
    bug: 'Quelle ligne contient l\'erreur ?',
    fill: 'Complète le code.',
    order: 'Remets les lignes dans le bon ordre.',
    normes: 'Quel choix respecte les normes ?',
  }[type] || '';
}
