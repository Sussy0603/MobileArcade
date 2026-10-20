'use strict';
/* ========================================================================
   Pixel Garden: Cozy Farm — plant, water, harvest on real crop cycles.
   Growth is stored as accumulated milliseconds and replayed from
   timestamps, so the garden keeps going while the app is shut.
   ===================================================================== */

const SAVE_KEY = 'pixelgarden.app.v1';
const PRIVACY_URL = 'https://sussy0603.github.io/Arcade/Privacy%20PixelGarden/privacy.html';
const $ = id => document.getElementById(id);
const cv = $('scene'), ctx = cv.getContext('2d');
const app = $('app');
let W = 0, H = 0;

const clamp = (v,a,b) => v<a?a:v>b?b:v;
const lerp = (a,b,t) => a+(b-a)*t;
const rnd = (a,b) => a+Math.random()*(b-a);
const pick = a => a[Math.floor(Math.random()*a.length)];

const DRY_MS = 6*MIN;      // full soil to bone dry
const WBLOCK = 10*MIN;     // one weather block
const GOLD_CHANCE = 1/30;

/* ---------- Seasons, weather, festivals ------------------------------- */
// Seasons change every real day. Offset picked so Oct 11 2026 is Fall.
const SEASON_OFS = (((2 - Date.UTC(2026,9,11)/864e5) % 4) + 4) % 4;
function dayNum(ts){ const d=new Date(ts); return Math.floor(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())/864e5); }
function seasonAt(ts){ return (((dayNum(ts)+SEASON_OFS)%4)+4)%4; }
function dayKey(ts){ return String(dayNum(ts)); }
function hash(n){n=(n^61)^(n>>>16);n=n+(n<<3)|0;n=n^(n>>>4);n=Math.imul(n,0x27d4eb2d);n=n^(n>>>15);return (n>>>0)/4294967296;}
// Weather is a pure function of the clock (plus an ad-bought shower), which
// lets offline growth replay exactly what would have happened.
const RAIN_P = [0.26,0.14,0.22,0.20], CLOUD_P = [0.26,0.20,0.30,0.30];
function weatherAt(ts){
  if (ts < S.rainUntil) return 'rain';
  const v = hash(Math.floor(ts/WBLOCK)*2654435761%2147483647);
  const s = seasonAt(ts);
  return v < RAIN_P[s] ? 'rain' : v < RAIN_P[s]+CLOUD_P[s] ? 'cloud' : 'sun';
}
function nightAt(ts){ const h=new Date(ts).getHours(); return h>=20||h<6; }
function festAt(ts){ const h=new Date(ts).getHours(); return (h>=12&&h<18) ? FESTIVALS[seasonAt(ts)] : null; }
const WXI = {rain:'🌧️',cloud:'☁️',sun:'☀️',snow:'🌨️'};

/* ---------- State ------------------------------------------------------- */
function blankPlots(f){
  const F = FIELDS[f], n = F.cols*F.rows, a = [];
  for (let i=0;i<n;i++) a.push({c:null,prog:0,water:0,dry:0,harv:0,spr:0,gold:0,un:i<F.free,lastT:Date.now()});
  return a;
}
function blankState(){
  const now = Date.now();
  return {
    v:1, coins:30, xp:0, lvl:1,
    fields: FIELDS.map((F,i) => ({open:i===0, plots:blankPlots(i)})),
    fi:0, seeds:{radish:1,carrot:1,lettuce:1}, sel:'radish', free:{},
    up:{}, spr:[0,0,0,0], tank:20, tool:'hand',
    bag:{}, book:{},
    stats:{harvests:0,earned:0,orders:0,cooked:0,golden:0,pets:0,planted:0,seasons:[]},
    ach:{}, orders:[null,null,null], ordNext:[0,0,0], ovens:[null,null],
    skin:{fence:'wood',path:'grass',cottage:'red'}, owned:{wood:1,grass:1,red:1},
    dog:{has:false,name:''}, dblUntil:0, rainUntil:0,
    lastGift:'', streak:0, tut:0,
    fx:true, mark:true, snd:true, lang:null, started:now
  };
}
let S = blankState();
function load(){
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw){
      const o = JSON.parse(raw), d = blankState();
      if (o && typeof o==='object'){
        S = Object.assign(d, o);
        S.stats = Object.assign(d.stats, o.stats||{});
        S.skin = Object.assign(d.skin, o.skin||{});
        S.dog = Object.assign(d.dog, o.dog||{});
      }
    }
  } catch(e){}
  // repair anything odd
  if (!Array.isArray(S.fields) || S.fields.length !== FIELDS.length) S.fields = blankState().fields;
  S.fields.forEach((f,fi) => {
    const n = FIELDS[fi].cols*FIELDS[fi].rows;
    if (!Array.isArray(f.plots) || f.plots.length !== n) f.plots = blankPlots(fi);
    f.plots.forEach((p,i) => {
      if (typeof p.lastT!=='number') p.lastT = Date.now();
      if (p.c && !cropById[p.c]) p.c = null;
    });
  });
  if (!Array.isArray(S.orders) || S.orders.length!==3) { S.orders=[null,null,null]; S.ordNext=[0,0,0]; }
  if (!Array.isArray(S.ovens)) S.ovens=[null,null];
  if (!cropById[S.sel] || !S.seeds[S.sel]) S.sel = 'radish';
  if (!S.fields[S.fi]) S.fi = 0;
  if (!S.lang) S.lang = (navigator.language||'en').toLowerCase().startsWith('fr') ? 'fr' : 'en';
  LANG = S.lang;
  Snd.set(S.snd);
}
let saveT = 0;
function saveNow(){ try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch(e){} }
function save(){ clearTimeout(saveT); saveT = setTimeout(saveNow, 300); }

/* ---------- Multipliers ------------------------------------------------- */
const growMult = () => S.up.compost ? 1.15 : 1;
const tankMax = () => S.up.can2 ? 40 : 20;
const dblOn = () => Date.now() < S.dblUntil;
function seasonMult(crop, season, gh){ return (gh || crop.ss.includes(season)) ? 1.25 : 1; }
function basePrice(id){ return recById[id] ? recById[id].sell : cropById[id].sell; }
function priceOf(id){
  let v = basePrice(id);
  if (cropById[id] && S.up.bees) v *= 1.12;
  const f = festAt(Date.now());
  if (f && f.crops.includes(id)) v *= 2;
  if (dblOn()) v *= 2;
  return Math.round(v);
}
function xpNeed(l){ return Math.round(12*Math.pow(l,1.55)+8); }
function canSowHere(crop, fi, ts){
  if (FIELDS[fi].gh) return true;
  return crop.only===undefined || crop.only===seasonAt(ts||Date.now());
}

/* ---------- Plot simulation -------------------------------------------- */
const field = (fi) => S.fields[fi===undefined?S.fi:fi];
function sprinklerAdjacent(fi, i){
  const F = FIELDS[fi], r = (i/F.cols)|0, c = i%F.cols;
  for (const [rr,cc] of [[r-1,c],[r+1,c],[r,c-1],[r,c+1]]){
    if (rr<0||cc<0||rr>=F.rows||cc>=F.cols) continue;
    const p = S.fields[fi].plots[rr*F.cols+cc];
    if (p && p.spr) return true;
  }
  return false;
}
function stepPlot(p, dt, wet, night, mult){
  const crop = cropById[p.c];
  if (!crop){ p.water = wet ? 1 : Math.max(0, p.water - dt/DRY_MS); return; }
  const stalled = crop.night && !night;
  if (wet){
    p.water = 1;
    if (!stalled) p.prog += dt*mult;
  } else {
    const avail = p.water*DRY_MS, g = Math.min(dt, avail);
    if (!stalled) p.prog += g*mult;
    if (g < dt) p.dry += dt-g;
    p.water = Math.max(0, p.water - dt/DRY_MS);
  }
  const cap = crop.grow*(1+(crop.crops||1));
  if (p.prog > cap) p.prog = cap;
}
// Replays elapsed time one weather block at a time.
function advance(fi, i, now){
  const p = S.fields[fi].plots[i], gh = !!FIELDS[fi].gh;
  if (!p.un){ p.lastT = now; return; }
  let t = p.lastT || now;
  if (now - t > 60*864e5) t = now - 60*864e5;
  const spr = sprinklerAdjacent(fi, i);
  const crop = cropById[p.c];
  let guard = 0;
  while (t < now && guard++ < 10000){
    const blockEnd = Math.min(now, (Math.floor(t/WBLOCK)+1)*WBLOCK, S.rainUntil > t ? S.rainUntil : Infinity);
    const dt = blockEnd - t;
    const mult = crop ? growMult()*seasonMult(crop, seasonAt(t), gh) : 1;
    stepPlot(p, dt, gh || spr || weatherAt(t)==='rain', nightAt(t), mult);
    t = blockEnd;
  }
  p.lastT = now;
}
function advanceAll(now){
  S.fields.forEach((f,fi) => { if (f.open) for (let i=0;i<f.plots.length;i++) advance(fi,i,now); });
}
const isRipe = p => { const c = cropById[p.c]; return !!c && p.prog >= c.grow; };
function stageOf(p){
  const c = cropById[p.c]; if (!c) return -1;
  if (p.prog >= c.grow) return 3;
  return clamp(Math.floor(p.prog/c.grow*3), 0, 2);
}
const msLeft = p => { const c = cropById[p.c]; return c ? Math.max(0, c.grow-p.prog) : 0; };
function fmtMs(ms){
  const s = Math.ceil(ms/1000);
  if (s < 60) return t('sec',{n:s});
  const m = Math.floor(s/60);
  if (m < 60) return s%60 ? t('minsec',{m, s:s%60}) : t('min',{m});
  return t('hm',{h:Math.floor(m/60), m:m%60});
}
function fmtClock(ms){ const s=Math.max(0,Math.ceil(ms/1000)); return Math.floor(s/60)+':'+String(s%60).padStart(2,'0'); }
function openBeds(fi){ return S.fields[fi].plots.filter(p=>p.un).length; }
function plotPrice(fi){
  const F = FIELDS[fi], n = openBeds(fi);
  return Math.round(F.base*Math.pow(1.17, n-F.free)/5)*5;
}

/* ---------- Economy helpers -------------------------------------------- */
function addCoins(v, earned){
  S.coins += v;
  if (earned) S.stats.earned += v;
  refreshHud();
}
function addXp(n){
  S.xp += n;
  let ups = 0;
  while (S.xp >= xpNeed(S.lvl)){ S.xp -= xpNeed(S.lvl); S.lvl++; ups++; levelUp(S.lvl); }
  refreshHud();
  if (ups) checkAch();
}
function levelUp(l){
  const coins = 25*l;
  S.coins += coins;
  const news = [];
  CROPS.filter(c=>c.lvl===l).forEach(c=>news.push(cropName(c.id)));
  RECIPES.filter(r=>r.lvl===l && S.up.kitchen).forEach(r=>news.push(t('rec.'+r.id)));
  UPGRADES.filter(u=>u.lvl===l).forEach(u=>news.push(t('up.'+u.id)));
  FIELDS.filter(f=>f.lvl===l && f.cost).forEach(f=>news.push(t('field.'+f.id)));
  Snd.play('level');
  showPop({icon:'⭐', title:t('lvl.title',{l}), body:t('lvl.body',{c:coins})+(news.length?'\n'+t('lvl.new',{list:news.join(', ')}):''),
    yes:t('lvl.ok')});
  if (l >= 3 && !S.dog.has) dogArrives();
  save();
}
function bagCount(){ let n=0; for (const k in S.bag) n += S.bag[k]; return n; }
function bagAdd(id, n){ S.bag[id] = (S.bag[id]||0) + n; }
function bagTake(id, n){ S.bag[id] = (S.bag[id]||0) - n; if (S.bag[id] <= 0) delete S.bag[id]; }

/* ---------- Actions ----------------------------------------------------- */
function plant(i){
  const fi = S.fi, p = field().plots[i], crop = cropById[S.sel];
  if (!crop || !S.seeds[crop.id]){ toast(t('t.noSeed')); Snd.play('err'); return; }
  if (!canSowHere(crop, fi)){ toast(t('t.onlySeason',{c:cropName(crop.id), s:t('season'+crop.only)})); Snd.play('err'); return; }
  if (S.free[crop.id] > 0){
    S.free[crop.id]--; if (!S.free[crop.id]) delete S.free[crop.id];
  } else {
    if (S.coins < crop.cost){ toast(t('t.seedCost',{c:crop.cost, h:S.coins})); Snd.play('err'); return; }
    S.coins -= crop.cost;
  }
  S.stats.planted++;
  Object.assign(p, {c:crop.id, prog:0, dry:0, harv:0, gold: Math.random()<GOLD_CHANCE ? 1 : 0, lastT:Date.now()});
  puff(i, crop.c.leaf, 6);
  Snd.play('plant');
  if (S.tut===0) setTut(1);
  save(); refreshHud(); refreshDock();
}
function harvest(i, quiet){
  const fi = S.fi, p = field().plots[i], crop = cropById[p.c];
  if (!crop || !isRipe(p)) return false;
  const prime = p.dry < 15000, wasGold = !!p.gold;
  const xp = Math.max(1, Math.round(crop.sell/8)) + (prime?1:0);
  bagAdd(crop.id, 1);
  S.stats.harvests++;
  const se = seasonAt(Date.now());
  if (!S.stats.seasons.includes(se)) S.stats.seasons.push(se);
  const b = S.book[crop.id] || (S.book[crop.id] = {n:0, first:Date.now(), best:0});
  b.n++;
  const val = priceOf(crop.id); if (val > b.best) b.best = val;
  let tip = 0;
  if (wasGold){
    tip = priceOf(crop.id)*5;
    S.stats.golden++;
    addCoins(tip, true);
    floaty(i, '★ +'+tip, '#ffe060');
    toast(t('t.golden',{c:cropName(crop.id).toUpperCase(), v:tip}));
    Snd.play('golden');
    for (let k=0;k<16;k++){ const R=plotRect(i); parts.push({x:R.x+R.s/2,y:R.y+R.s/2,vx:rnd(-90,90),vy:rnd(-140,-30),t:0,c:pick(['#ffe060','#fff4a0','#f8c040']),g:200}); }
  } else if (prime){
    tip = Math.round(priceOf(crop.id)*0.25);
    addCoins(tip, true);
    floaty(i, '+1 🧺 +'+tip+'🪙', '#ffe9a8');
  } else floaty(i, '+1 🧺', '#eaf7d4');
  p.harv++;
  if (crop.regrow && p.harv < (crop.crops||3)){
    p.prog = Math.max(0, crop.grow - crop.regrow); p.dry = 0;
    p.gold = Math.random()<GOLD_CHANCE ? 1 : 0;
  } else Object.assign(p, {c:null, prog:0, dry:0, harv:0, gold:0});
  puff(i, crop.c.fruit, 8);
  if (!quiet && !wasGold) Snd.play('harvest');
  addXp(xp);
  if (S.tut===2) setTut(3);
  checkAch(); save(); refreshHud();
  return true;
}
function harvestAll(){
  let n = 0;
  field().plots.forEach((p,i) => { if (p.un && isRipe(p) && harvest(i,true)) n++; });
  if (n){ toast(t('t.picked',{n})); Snd.play('harvest'); }
}
function waterPlot(i){
  const p = field().plots[i];
  if (FIELDS[S.fi].gh){ toast(t('t.ghDamp')); return; }
  if (p.spr){ toast(t('t.sprHas')); return; }
  if (!p.c){ toast(t('t.nothing')); return; }
  if (S.tut===1){ setTut(2); setTool('hand'); }
  if (p.water > 0.92){ toast(t('t.damp')); return; }
  if (S.tank <= 0){ toast(t('t.empty')); Snd.play('err'); return; }
  S.tank--; p.water = 1;
  splash(i); Snd.play('water');
  save(); refreshDock();
}
function clearPlot(i){
  const p = field().plots[i];
  if (p.spr){
    p.spr = 0; S.spr[S.fi] = Math.max(0, S.spr[S.fi]-1);
    addCoins(Math.round(280*0.4));
    toast(t('t.lifted')); save(); return;
  }
  if (!p.c){ toast(t('t.bare')); return; }
  const crop = cropById[p.c];
  if (isRipe(p)){ harvest(i); return; }
  ask(t('t.pullTitle'), t('t.pullBody',{c:cropName(crop.id).toLowerCase(), p:Math.round(p.prog/crop.grow*100)}), () => {
    Object.assign(p, {c:null, prog:0, dry:0, harv:0, gold:0}); puff(i,'#8a7050',6); Snd.play('plant'); save();
  }, '🌿');
}
function buyPlot(i){
  const fi = S.fi, price = plotPrice(fi);
  if (S.coins < price){ toast(t('t.bedCost',{c:price})); Snd.play('err'); return; }
  ask(t('t.bedTitle'), t('t.bedBody',{c:price}), () => {
    if (S.coins < price) return;
    S.coins -= price;
    const p = field(fi).plots[i]; p.un = true; p.lastT = Date.now();
    puff(i,'#7a5f3a',10); Snd.play('buy'); toast(t('t.bedReady'));
    checkAch(); save(); refreshHud();
  }, '🪓');
}
function refillCan(){
  if (S.tank >= tankMax()){ toast(t('t.full')); return; }
  S.tank = tankMax(); save(); refreshDock(); toast(t('t.filled')); Snd.play('water');
  const wp = wellPos();
  for (let k=0;k<10;k++) parts.push({x:wp.x+13,y:wp.y,vx:rnd(-30,30),vy:rnd(-70,-10),t:0,c:'#8fd0f0',g:180});
}
function buyField(fi){
  const F = FIELDS[fi];
  if (!fieldReqOk(fi)) return;
  ask(t('field.buyAsk',{n:t('field.'+F.id), c:F.cost}), '', () => {
    if (S.coins < F.cost) return;
    S.coins -= F.cost; S.fields[fi].open = true;
    S.fields[fi].plots.forEach(p => p.lastT = Date.now());
    Snd.play('level'); toast(t('field.bought',{n:t('field.'+F.id)}));
    checkAch(); save(); refreshHud(); refreshField();
  }, F.gh ? '🏡' : '🌾');
}
function fieldReqOk(fi){
  const F = FIELDS[fi];
  if (S.lvl < F.lvl) return false;
  if (F.prev !== undefined && openBeds(F.prev) < FIELDS[F.prev].cols*FIELDS[F.prev].rows) return false;
  if (F.prev !== undefined && !S.fields[F.prev].open) return false;
  return S.coins >= F.cost;
}

/* ---------- Orders ------------------------------------------------------ */
function orderPool(){
  const now = Date.now(), gh = S.fields[3].open;
  return CROPS.filter(c => S.seeds[c.id] && (c.only===undefined || c.only===seasonAt(now) || gh));
}
function genOrder(){
  const pool = orderPool().slice();
  const items = {};
  let kinds = 1 + (S.lvl>=3 && Math.random()<0.6 ? 1 : 0) + (S.lvl>=7 && Math.random()<0.4 ? 1 : 0);
  kinds = Math.min(kinds, pool.length);
  for (let k=0;k<kinds;k++){
    const i = Math.floor(Math.random()*pool.length), c = pool.splice(i,1)[0];
    items[c.id] = clamp(Math.round(rnd(2,5)*(1-Math.min(c.sell,200)/300)), 1, 6);
  }
  if (S.up.kitchen && Math.random() < 0.35){
    const recs = RECIPES.filter(r => r.lvl <= S.lvl && Object.keys(r.need).every(k => S.seeds[k]));
    if (recs.length) items[pick(recs).id] = 1;
  }
  let v = 0; for (const k in items) v += basePrice(k)*items[k];
  return {who:pick(VILLAGERS).id, items, coins:Math.round(v*1.6)+5, xp:Math.round(v/12)+3};
}
function orderReady(o){ return o && Object.keys(o.items).every(k => (S.bag[k]||0) >= o.items[k]); }
function tickOrders(now){
  for (let k=0;k<3;k++) if (!S.orders[k] && now >= (S.ordNext[k]||0)){ S.orders[k] = genOrder(); save(); if ($('shOrders').classList.contains('on')) buildOrders(); }
}
function deliver(k){
  const o = S.orders[k]; if (!orderReady(o)) return;
  for (const id in o.items) bagTake(id, o.items[id]);
  const c = dblOn() ? o.coins*2 : o.coins;
  addCoins(c, true); S.stats.orders++;
  S.orders[k] = null; S.ordNext[k] = Date.now() + 45000;
  Snd.play('coin'); toast(t('ord.done',{c}));
  addXp(o.xp); checkAch(); save(); buildOrders();
}
function skipOrder(k){ S.orders[k] = null; S.ordNext[k] = Date.now() + 60000; Snd.play('click'); save(); buildOrders(); }

/* ---------- Kitchen ----------------------------------------------------- */
const ovenCount = () => S.up.oven2 ? 2 : 1;
function canCook(r){ return Object.keys(r.need).every(k => (S.bag[k]||0) >= r.need[k]); }
function cook(rid){
  const r = recById[rid];
  if (!canCook(r)){ toast(t('t.missing')); Snd.play('err'); return; }
  let o = -1; for (let k=0;k<ovenCount();k++) if (!S.ovens[k]){ o = k; break; }
  if (o < 0){ toast(t('t.ovenBusy')); Snd.play('err'); return; }
  for (const k in r.need) bagTake(k, r.need[k]);
  S.ovens[o] = {r:rid, end:Date.now()+r.t, told:false};
  Snd.play('cook'); toast(t('t.cookStart',{r:t('rec.'+rid)}));
  save(); buildKitchen(); refreshHud();
}
function collect(o){
  const ov = S.ovens[o]; if (!ov || Date.now() < ov.end) return;
  bagAdd(ov.r, 1); S.stats.cooked++; S.ovens[o] = null;
  Snd.play('harvest'); toast(t('t.collected',{r:t('rec.'+ov.r)}));
  addXp(recById[ov.r].xp); checkAch(); save(); buildKitchen(); refreshHud();
}
function tickOvens(now){
  S.ovens.forEach(ov => { if (ov && !ov.told && now >= ov.end){ ov.told = true; toast(t('t.cookDone',{r:t('rec.'+ov.r)})); Snd.play('ding'); save(); } });
}

/* ---------- Achievements ------------------------------------------------ */
function statVal(s){
  switch (s){
    case 'kinds': return Object.keys(S.book).length;
    case 'seasons': return S.stats.seasons.length;
    case 'level': return S.lvl;
    case 'beds': return openBeds(0);
    case 'fields': return S.fields.slice(0,3).filter(f=>f.open).length;
    case 'gh': return S.fields[3].open ? 1 : 0;
    default: return S.stats[s] || 0;
  }
}
function checkAch(){
  for (const a of ACHIEVEMENTS){
    if (S.ach[a.id] || statVal(a.stat) < a.n) continue;
    S.ach[a.id] = 1; S.coins += a.r;
    setTimeout(() => { toast(t('ach.toast',{a:t('ach.'+a.id), r:a.r})); Snd.play('achieve'); }, 700);
  }
  refreshHud();
}

/* ---------- Particles --------------------------------------------------- */
const parts = [], floats = [];
function plotRect(i, fi){
  const F = FIELDS[fi===undefined?S.fi:fi], r = (i/F.cols)|0, c = i%F.cols;
  const gx = G.x + Math.round((5-F.cols)*G.t/2), gy = G.y + Math.round((6-F.rows)*G.t/2);
  return {x:gx+c*G.t, y:gy+r*G.t, s:G.t};
}
function gridRect(fi){
  const F = FIELDS[fi===undefined?S.fi:fi], a = plotRect(0, fi);
  return {x:a.x, y:a.y, w:F.cols*G.t, h:F.rows*G.t};
}
function puff(i,col,n){ const R=plotRect(i); for(let k=0;k<n;k++) parts.push({x:R.x+R.s/2+rnd(-R.s*0.3,R.s*0.3),y:R.y+R.s*0.6,vx:rnd(-40,40),vy:rnd(-90,-30),t:0,c:col,g:220}); }
function splash(i){ const R=plotRect(i); for(let k=0;k<9;k++) parts.push({x:R.x+R.s/2+rnd(-R.s*0.35,R.s*0.35),y:R.y+R.s*0.25,vx:rnd(-25,25),vy:rnd(20,70),t:0,c:'#8fd0f0',g:260}); }
function floaty(i,txt,col){ const R=plotRect(i); floats.push({x:R.x+R.s/2,y:R.y+R.s*0.4,t:0,txt,col}); }

/* ---------- Layout ------------------------------------------------------ */
let G = {x:0,y:0,t:0}, layoutTop = 0, layoutBottom = 0;
function layout(){
  const ar = app.getBoundingClientRect();
  const hudB = $('hud').getBoundingClientRect().bottom - ar.top;
  const dockH = $('dock').getBoundingClientRect().height;
  const menu = $('menu'); menu.style.bottom = (dockH + 6) + 'px';
  const menuTop = H - dockH - 6 - menu.getBoundingClientRect().height;
  const fb = $('fieldbar'); fb.style.top = (hudB + 6) + 'px';
  const fbB = hudB + 6 + fb.getBoundingClientRect().height;
  const top = fbB + 46, bottom = menuTop - 10;
  layoutTop = fbB; layoutBottom = menuTop;
  const t = Math.floor(Math.min((W-28)/5, (bottom-top)/6));
  G.t = Math.max(20, t);
  G.x = Math.round((W - G.t*5)/2);
  G.y = Math.round(top + Math.max(0, (bottom-top) - G.t*6)/2);
  $('toast').style.top = (fbB + 2) + 'px';
  const lc = $('lockCard'); lc.style.top = (G.y + G.t*3) + 'px';
}
function wellPos(){ const R = gridRect(); return {x:R.x-2, y:R.y-30}; }
function cottagePos(){ const R = gridRect(); return {x:R.x+R.w-38, y:R.y-46}; }
function fit(){
  const r = app.getBoundingClientRect();
  W = r.width; H = r.height;
  const d = Math.min(window.devicePixelRatio||1, 2.5);
  cv.width = Math.round(W*d); cv.height = Math.round(H*d);
  cv.style.width = W+'px'; cv.style.height = H+'px';
  ctx.setTransform(d,0,0,d,0,0);
  ctx.imageSmoothingEnabled = false;
  layout();
  if (dog) { dog.x = clamp(dog.x, 10, W-10); dog.y = clamp(dog.y, G.y, G.y+G.t*6); }
}

/* ---------- Crows & dog ------------------------------------------------- */
let crow = null, crowTimer = 80;
function maybeCrow(dt){
  if (FIELDS[S.fi].gh || !field().open){ crow = null; return; }
  if (crow){
    crow.t += dt;
    if (crow.state==='in'){
      crow.x = lerp(crow.x, crow.tx, 1-Math.pow(0.02,dt)); crow.y = lerp(crow.y, crow.ty, 1-Math.pow(0.02,dt));
      if (crow.t > 1.4){ crow.state='eat'; crow.t=0; Snd.play('crow'); }
    } else if (crow.state==='eat'){
      if (crow.t > 7){
        const p = field().plots[crow.i];
        if (p && isRipe(p) && crow.fi===S.fi){
          const name = cropName(p.c).toLowerCase();
          Object.assign(p, {c:null, prog:0, harv:0, gold:0});
          toast(t('t.crowTook',{c:name})); puff(crow.i,'#2b2b30',10); save();
        }
        crowLeave();
      }
    } else {
      crow.x = lerp(crow.x, crow.tx, 1-Math.pow(0.05,dt)); crow.y = lerp(crow.y, crow.ty, 1-Math.pow(0.05,dt));
      if (crow.t > 1.4) crow = null;
    }
    return;
  }
  crowTimer -= dt;
  if (crowTimer > 0) return;
  crowTimer = rnd(70,150);
  const ripe = [];
  field().plots.forEach((p,i) => { if (p.un && isRipe(p)) ripe.push(i); });
  if (ripe.length < 2 || S.tut < 4) return;
  const i = pick(ripe), R = plotRect(i);
  crow = {i, fi:S.fi, state:'in', t:0, x:W+30, y:layoutTop+20, tx:R.x+R.s/2, ty:R.y+R.s*0.42};
}
function crowLeave(){ crow.state='out'; crow.t=0; crow.tx=W+40; crow.ty=layoutTop; }
function shooCrow(){
  if (!crow || crow.state==='out') return false;
  crowLeave(); toast(t('t.shoo')); Snd.play('crow'); return true;
}
let dog = null;
function spawnDog(){ dog = {x:G.x+G.t*2.5, y:G.y+G.t*6+4, tx:0, ty:0, state:'sit', t:0, face:1, wait:2}; }
function dogArrives(){
  showPop({icon:'🐶', title:t('dog.title'), body:t('dog.body'), input:t('dog.default'), yes:t('dog.ok'),
    onYes:(v) => { S.dog = {has:true, name:(v||'').trim().slice(0,14) || t('dog.default')}; spawnDog(); Snd.play('bark'); save(); }});
}
function dogZone(){
  const R = gridRect();
  return {x0:R.x-6, x1:R.x+R.w+6, y0:R.y-4, y1:R.y+R.h+8};
}
function updateDog(dt){
  if (!S.dog.has) return;
  if (!dog) spawnDog();
  dog.t += dt;
  const Z = dogZone();
  if (crow && crow.state!=='out' && crow.t > 0.8){
    dog.state = 'chase'; dog.tx = crow.x; dog.ty = crow.y + 10;
  }
  if (dog.state==='sit'){
    dog.wait -= dt;
    if (dog.wait <= 0){ dog.state='walk'; dog.tx = rnd(Z.x0,Z.x1); dog.ty = rnd(Z.y0,Z.y1); }
    return;
  }
  const sp = dog.state==='chase' ? 190 : 38;
  const dx = dog.tx-dog.x, dy = dog.ty-dog.y, d = Math.hypot(dx,dy);
  if (Math.abs(dx) > 1) dog.face = dx>0 ? 1 : -1;
  if (d < 6){
    if (dog.state==='chase'){
      if (crow && crow.state!=='out'){ crowLeave(); toast(t('t.dogChased',{d:S.dog.name})); Snd.play('bark'); }
    }
    dog.state = 'sit'; dog.wait = rnd(2,6);
    return;
  }
  dog.x += dx/d*Math.min(d, sp*dt); dog.y += dy/d*Math.min(d, sp*dt);
}
function petDog(){
  S.stats.pets++; Snd.play('bark');
  floats.push({x:dog.x, y:dog.y-14, t:0, txt:'♥', col:'#ff8aa0'});
  toast(t('dog.pet',{d:S.dog.name}));
  dog.state='sit'; dog.wait=2.5;
  checkAch(); save();
}

/* ---------- Drawing ----------------------------------------------------- */
let ambient = [], bees = [];
const GRASS = [['#5a9a3a','#4c8a30'],['#4f8a34','#43772c'],['#7a8638','#6a7430'],['#c8d4d8','#b0bec4']];
const GRASS_N = [['#264a20','#1e3c1a'],['#264a20','#1e3c1a'],['#3a4220','#30381a'],['#5a6878','#4a5868']];
function initAmbient(){ bees = []; for (let i=0;i<7;i++) bees.push({x:Math.random(),y:Math.random(),p:Math.random()*7,s:rnd(.5,1.1)}); }

function draw(time, wx, night, season){
  const F = FIELDS[S.fi], fo = field(), R = gridRect();
  const skyH = R.y - 40;
  // sky
  const sky = night ? ['#12203a','#1d3050'] : wx==='rain' ? ['#5f7080','#8a99a4'] : wx==='cloud' ? ['#7aa0c0','#a8c4d8']
    : season===3 ? ['#9ab8d8','#d0e0f0'] : season===2 ? ['#e0a070','#f0d0a0'] : ['#5fa8e0','#a8d8f0'];
  const g = ctx.createLinearGradient(0,0,0,skyH);
  g.addColorStop(0,sky[0]); g.addColorStop(1,sky[1]);
  ctx.fillStyle = g; ctx.fillRect(0,0,W,skyH);
  // sun or moon
  const now = new Date(), hrs = now.getHours()+now.getMinutes()/60;
  const dayT = clamp((hrs-6)/14,0,1), nt = ((hrs+4)%24)/10;
  const bx = lerp(W*0.12, W*0.88, night ? clamp(nt,0,1) : dayT);
  const by = skyH*0.85 - Math.sin((night?clamp(nt,0,1):dayT)*Math.PI)*skyH*0.35;
  ctx.save(); ctx.globalAlpha = wx==='sun'||night ? 1 : 0.5;
  ctx.fillStyle = night ? '#e8eeff' : '#ffe89a'; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 26;
  ctx.beginPath(); ctx.arc(bx, by, night?9:13, 0, TAU); ctx.fill(); ctx.restore();
  if (night) for (let i=0;i<26;i++){
    const x=((i*151)%100)/100*W, y=((i*67)%100)/100*skyH*0.9;
    ctx.fillStyle='rgba(255,255,255,'+(0.3+0.3*Math.sin(time*1.6+i)).toFixed(2)+')'; ctx.fillRect(x,y,1.6,1.6);
  }
  if (wx!=='sun'){
    ctx.fillStyle = night ? 'rgba(50,60,86,.6)' : 'rgba(255,255,255,.55)';
    for (let i=0;i<4;i++){
      const x=((i*0.29+time*0.008)%1.3-0.15)*W, y=skyH*(0.35+i*0.15);
      ctx.beginPath(); ctx.arc(x,y,13,0,TAU); ctx.arc(x+13,y-5,10,0,TAU); ctx.arc(x+24,y+1,12,0,TAU); ctx.fill();
    }
  }
  // ground
  const gc = night ? GRASS_N[season] : GRASS[season];
  ctx.fillStyle = gc[0]; ctx.fillRect(0, skyH, W, H-skyH);
  ctx.fillStyle = gc[1];
  for (let i=0;i<90;i++){ const x=((i*137)%100)/100*W, y=skyH+((i*89)%100)/100*(H-skyH); ctx.fillRect(x,y,2,2); }
  if (season===0 && !night) for (let i=0;i<24;i++){ const x=((i*173)%100)/100*W, y=skyH+((i*61)%100)/100*(H-skyH);
    ctx.fillStyle = ['#f8b8d0','#fff','#f8e070'][i%3]; ctx.fillRect(x,y,2,2); }

  if (F.gh) drawGreenhouse(R, night);
  else {
    drawPath(R, night);
    drawFence(R, night);
    if (fo.open) drawWell(wellPos().x, wellPos().y, night);
    if (S.fi===0) drawCottage(cottagePos().x, cottagePos().y, night);
  }

  // plots
  ctx.imageSmoothingEnabled = false;
  for (let i=0;i<fo.plots.length;i++){
    const p = fo.plots[i], Rp = plotRect(i);
    if (!fo.open || !p.un){
      ctx.drawImage(weedSprite(season),0,0,PX,PX,Rp.x,Rp.y,Rp.s,Rp.s);
      ctx.fillStyle = 'rgba(0,0,0,.34)'; ctx.fillRect(Rp.x,Rp.y,Rp.s,Rp.s);
      if (fo.open){
        ctx.fillStyle = '#e8c88a'; ctx.font = '800 '+Math.round(Rp.s*0.19)+'px Nunito,sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('🪙'+plotPrice(S.fi), Rp.x+Rp.s/2, Rp.y+Rp.s/2);
      }
      continue;
    }
    ctx.drawImage(soilSprite(p.water>0.12 || F.gh, F.gh),0,0,PX,PX,Rp.x,Rp.y,Rp.s,Rp.s);
    if (p.spr){ ctx.drawImage(sprinklerSprite(Math.floor(time*4)%3),0,0,PX,PX,Rp.x,Rp.y,Rp.s,Rp.s); continue; }
    if (p.c){
      const st = stageOf(p), crop = cropById[p.c];
      const gold = p.gold && st===3;
      if (gold){ ctx.save(); ctx.globalAlpha = 0.35+0.2*Math.sin(time*5+i); ctx.fillStyle='#ffe060'; ctx.fillRect(Rp.x,Rp.y,Rp.s,Rp.s); ctx.restore(); }
      ctx.drawImage(plantSprite(crop, st, gold),0,0,PX,PX,Rp.x,Rp.y,Rp.s,Rp.s);
      if (crop.night && !night && st<3){ ctx.fillStyle='rgba(255,220,120,.16)'; ctx.fillRect(Rp.x,Rp.y,Rp.s,Rp.s); }
      if (p.water<=0.02 && st<3 && !F.gh){ ctx.fillStyle='rgba(210,150,70,.22)'; ctx.fillRect(Rp.x,Rp.y,Rp.s,Rp.s); }
      if (st < 3){
        const f = clamp(p.prog/crop.grow,0,1);
        ctx.fillStyle='rgba(0,0,0,.4)'; ctx.fillRect(Rp.x+3,Rp.y+Rp.s-6,Rp.s-6,3);
        ctx.fillStyle = (p.water>0.02||F.gh) ? '#a8e070' : '#d89a4a';
        ctx.fillRect(Rp.x+3,Rp.y+Rp.s-6,(Rp.s-6)*f,3);
      } else if (S.mark){
        const bob = Math.sin(time*4+i)*2.5;
        ctx.fillStyle = gold ? '#fff4a0' : '#ffe07a';
        ctx.beginPath(); ctx.moveTo(Rp.x+Rp.s/2,Rp.y-2+bob); ctx.lineTo(Rp.x+Rp.s/2-6,Rp.y-11+bob); ctx.lineTo(Rp.x+Rp.s/2+6,Rp.y-11+bob); ctx.closePath(); ctx.fill();
      }
      if (!F.gh){
        const wf = clamp(p.water,0,1);
        ctx.fillStyle='rgba(0,0,0,.32)'; ctx.fillRect(Rp.x+Rp.s-6,Rp.y+3,3,Rp.s*0.3);
        ctx.fillStyle='#6fb4e0'; ctx.fillRect(Rp.x+Rp.s-6,Rp.y+3+Rp.s*0.3*(1-wf),3,Rp.s*0.3*wf);
      }
    }
  }
  // grid lines
  ctx.strokeStyle = F.gh ? 'rgba(220,240,235,.35)' : 'rgba(0,0,0,.22)'; ctx.lineWidth = 1;
  for (let c=0;c<=F.cols;c++){ ctx.beginPath(); ctx.moveTo(R.x+c*G.t,R.y); ctx.lineTo(R.x+c*G.t,R.y+R.h); ctx.stroke(); }
  for (let r=0;r<=F.rows;r++){ ctx.beginPath(); ctx.moveTo(R.x,R.y+r*G.t); ctx.lineTo(R.x+R.w,R.y+r*G.t); ctx.stroke(); }

  if (dog && S.dog.has) drawDog(time);
  if (crow) drawCrow(crow, time);

  for (const p of parts){ ctx.globalAlpha = clamp(1-p.t/1.1,0,1); ctx.fillStyle = p.c; ctx.fillRect(p.x,p.y,3,3); }
  ctx.globalAlpha = 1; ctx.textAlign='center'; ctx.textBaseline='middle';
  for (const f of floats){
    ctx.globalAlpha = clamp(1-f.t/1.4,0,1); ctx.font = '900 15px Nunito,sans-serif';
    ctx.fillStyle='rgba(0,0,0,.45)'; ctx.fillText(f.txt,f.x+1,f.y+1);
    ctx.fillStyle=f.col; ctx.fillText(f.txt,f.x,f.y);
  }
  ctx.globalAlpha = 1;

  if (S.fx){
    if (wx==='rain' && !F.gh) (season===3 ? drawSnow : drawRain)(time, 1);
    else if (season===3) drawSnow(time, 0.3);
    else if (season===2) drawLeaves(time);
    else if (!night) drawBees(time);
  }
  if (night){ ctx.fillStyle='rgba(20,30,60,.30)'; ctx.fillRect(0,skyH,W,H-skyH); }
}
function drawPath(R, night){
  const s = S.skin.path; if (s==='grass') return;
  const x=R.x-7, y=R.y-5, w=R.w+14, h=R.h+12;
  if (s==='gravel'){
    ctx.fillStyle = night ? '#6a6a6a' : '#b8b0a0'; ctx.fillRect(x,y,w,h);
    ctx.fillStyle = night ? '#555' : '#988f80';
    for (let i=0;i<160;i++){ const px=x+((i*37)%w), py=y+((i*53)%h); ctx.fillRect(px,py,2,2); }
  } else if (s==='brick'){
    ctx.fillStyle = night ? '#6a3a30' : '#b8604a'; ctx.fillRect(x,y,w,h);
    ctx.fillStyle = night ? '#4a2a22' : '#8a4434';
    for (let yy=y; yy<y+h; yy+=5) ctx.fillRect(x,yy,w,1);
    for (let yy=y, r=0; yy<y+h; yy+=5, r++) for (let xx=x+(r%2?5:0); xx<x+w; xx+=10) ctx.fillRect(xx,yy,1,5);
  } else if (s==='flowers'){
    ctx.fillStyle = night ? '#2e4a24' : '#3f7a2a'; ctx.fillRect(x,y,w,h);
    const cols = ['#f870a0','#fff0a0','#a080f0','#ffffff','#f8a040'];
    for (let i=0;i<70;i++){
      const side=i%4, k=(i*0.137)%1;
      const px = side<2 ? x+k*w : (side===2 ? x+2 : x+w-4), py = side<2 ? (side===0 ? y+1 : y+h-4) : y+k*h;
      ctx.fillStyle = cols[i%5]; ctx.fillRect(px,py,3,3);
    }
  }
}
function drawFence(R, night){
  const fy = R.y - 14, x0 = R.x-8, w = R.w+16, s = S.skin.fence;
  if (s==='wood'){
    ctx.fillStyle = night?'#5a4632':'#8a6f4a';
    ctx.fillRect(x0,fy,w,3); ctx.fillRect(x0,fy+7,w,3);
    for (let i=0;i<=5;i++) ctx.fillRect(x0+i*w/5-2,fy-5,4,17);
  } else if (s==='picket'){
    ctx.fillStyle = night?'#9aa0a8':'#f4f4ee';
    ctx.fillRect(x0,fy+2,w,3); ctx.fillRect(x0,fy+8,w,2);
    for (let x=x0; x<x0+w; x+=7){ ctx.fillRect(x,fy-4,4,16); ctx.beginPath(); ctx.moveTo(x,fy-4); ctx.lineTo(x+2,fy-7); ctx.lineTo(x+4,fy-4); ctx.fill(); }
  } else if (s==='stone'){
    for (let r=0;r<2;r++) for (let x=x0+(r?5:0), k=0; x<x0+w; x+=10, k++){
      ctx.fillStyle = night ? (k%2?'#5a5a60':'#4a4a50') : (k%2?'#a8a8a0':'#909088');
      ctx.fillRect(x, fy-3+r*7, 9, 6);
    }
  } else if (s==='hedge'){
    ctx.fillStyle = night?'#1e3a1a':'#2f6a26'; ctx.fillRect(x0,fy-2,w,12);
    ctx.fillStyle = night?'#284a22':'#3f8030';
    for (let x=x0; x<x0+w; x+=9){ ctx.beginPath(); ctx.arc(x+4,fy-2,5,0,TAU); ctx.fill(); }
  }
}
function drawGreenhouse(R, night){
  ctx.fillStyle = night ? 'rgba(160,200,200,.10)' : 'rgba(200,240,235,.22)';
  ctx.fillRect(R.x-12, R.y-34, R.w+24, R.h+42);
  ctx.strokeStyle = night ? '#8a9a98' : '#e8f4f0'; ctx.lineWidth = 3;
  ctx.strokeRect(R.x-12, R.y-34, R.w+24, R.h+42);
  ctx.lineWidth = 1.5; ctx.strokeStyle = night ? 'rgba(140,160,160,.6)' : 'rgba(255,255,255,.7)';
  for (let k=1;k<4;k++){ const x = R.x-12 + k*(R.w+24)/4; ctx.beginPath(); ctx.moveTo(x,R.y-34); ctx.lineTo(x,R.y+R.h+8); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(R.x-16,R.y-34); ctx.lineTo(R.x+R.w/2,R.y-64); ctx.lineTo(R.x+R.w+16,R.y-34); ctx.closePath();
  ctx.fillStyle = night ? 'rgba(160,200,200,.15)' : 'rgba(220,245,240,.4)'; ctx.fill(); ctx.lineWidth=3; ctx.strokeStyle = night ? '#8a9a98' : '#e8f4f0'; ctx.stroke();
  // shine
  ctx.fillStyle='rgba(255,255,255,.18)'; ctx.fillRect(R.x-6, R.y-28, 6, R.h+20);
}
function drawWell(x,y,night){
  ctx.fillStyle = night?'#5a5a5a':'#8a8a8a'; ctx.fillRect(x,y+6,26,16);
  ctx.fillStyle = night?'#3f3f3f':'#6a6a6a';
  for (let r=0;r<2;r++) for (let c=0;c<4;c++) ctx.fillRect(x+2+c*6,y+8+r*6,5,5);
  ctx.fillStyle='#3f6a8a'; ctx.fillRect(x+3,y+4,20,4);
  ctx.fillStyle = night?'#4a3a28':'#7a5c3c'; ctx.fillRect(x+1,y-3,3,10); ctx.fillRect(x+22,y-3,3,10);
  ctx.fillStyle = night?'#5f4632':'#96703f';
  ctx.beginPath(); ctx.moveTo(x-3,y-3); ctx.lineTo(x+13,y-13); ctx.lineTo(x+29,y-3); ctx.closePath(); ctx.fill();
}
function drawCottage(x,y,night){
  const wall = COTTAGE_COL[S.skin.cottage] || COTTAGE_COL.red;
  ctx.fillStyle = night ? shade(wall,-0.45) : wall; ctx.fillRect(x+3,y+14,32,20);
  ctx.fillStyle = night ? '#3a2a20' : '#6a4632';
  ctx.beginPath(); ctx.moveTo(x-1,y+15); ctx.lineTo(x+19,y); ctx.lineTo(x+39,y+15); ctx.closePath(); ctx.fill();
  ctx.fillStyle = night ? '#3a2a20' : '#5a3a28'; ctx.fillRect(x+27,y+2,4,8);
  ctx.fillStyle = '#5a3a28'; ctx.fillRect(x+15,y+22,8,12);
  ctx.fillStyle = night ? '#ffd870' : '#bfe0f0'; ctx.fillRect(x+6,y+19,6,6); ctx.fillRect(x+26,y+19,6,6);
}
function shade(hex, k){
  const n = parseInt(hex.slice(1),16); let r=n>>16, g=(n>>8)&255, b=n&255;
  r=Math.round(r*(1+k)); g=Math.round(g*(1+k)); b=Math.round(b*(1+k));
  return 'rgb('+clamp(r,0,255)+','+clamp(g,0,255)+','+clamp(b,0,255)+')';
}
function drawCrow(c,time){
  const s = Math.min(28, G.t*0.55);
  ctx.save(); ctx.translate(c.x,c.y);
  const flap = c.state==='eat' ? 0 : Math.sin(time*16)*0.5;
  ctx.fillStyle='#22222a';
  ctx.beginPath(); ctx.ellipse(0,0,s*0.42,s*0.3,0,0,TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(-s*0.34,-s*0.22,s*0.2,s*0.2,0,0,TAU); ctx.fill();
  ctx.fillStyle='#3a3a44'; ctx.beginPath(); ctx.ellipse(s*0.05,-s*0.1-flap*s*0.3,s*0.3,s*0.14,flap*0.6,0,TAU); ctx.fill();
  ctx.fillStyle='#c8a038'; ctx.beginPath(); ctx.moveTo(-s*0.5,-s*0.22); ctx.lineTo(-s*0.86,-s*0.14); ctx.lineTo(-s*0.5,-s*0.06); ctx.closePath(); ctx.fill();
  ctx.fillStyle='#f0e070'; ctx.beginPath(); ctx.arc(-s*0.38,-s*0.27,s*0.06,0,TAU); ctx.fill();
  if (c.state==='eat'){ const w = clamp(c.t/7,0,1);
    ctx.fillStyle='rgba(0,0,0,.45)'; ctx.fillRect(-s*0.5,s*0.42,s,4); ctx.fillStyle='#e86a5a'; ctx.fillRect(-s*0.5,s*0.42,s*w,4); }
  ctx.restore();
}
function drawDog(time){
  const sc = Math.max(2, Math.round(G.t/26));
  const frame = dog.state==='sit' ? 2 : (Math.floor(time*(dog.state==='chase'?12:6))%2);
  const spr = dogSprite(frame);
  ctx.save(); ctx.translate(Math.round(dog.x), Math.round(dog.y));
  if (dog.face < 0) ctx.scale(-1,1);
  ctx.fillStyle='rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(0,1,7*sc/1.4,2*sc/1.4,0,0,TAU); ctx.fill();
  ctx.drawImage(spr, -8*sc, -14*sc, 16*sc, 14*sc);
  ctx.restore();
  if (S.dog.name && G.t > 40){
    ctx.font='800 10px Nunito,sans-serif'; ctx.textAlign='center'; ctx.fillStyle='rgba(0,0,0,.45)';
    ctx.fillText(S.dog.name, dog.x+1, dog.y-14*sc-4+1); ctx.fillStyle='#fff'; ctx.fillText(S.dog.name, dog.x, dog.y-14*sc-4);
  }
}
let drops = [];
function drawRain(){
  while (drops.length<90) drops.push({x:Math.random()*W,y:Math.random()*H,v:rnd(420,700),l:rnd(7,13)});
  ctx.strokeStyle='rgba(190,215,235,.55)'; ctx.lineWidth=1.2;
  for (const d of drops){ d.y+=d.v*0.016; if (d.y>H){d.y=-12;d.x=Math.random()*W;}
    ctx.beginPath(); ctx.moveTo(d.x,d.y); ctx.lineTo(d.x-2,d.y+d.l); ctx.stroke(); }
}
function drawSnow(time, k){
  const n = Math.round(80*k);
  ctx.fillStyle='rgba(255,255,255,.85)';
  for (let i=0;i<n;i++){
    const x = ((i*97.3 + Math.sin(time*0.8+i)*20 + time*8) % (W+20)) - 10;
    const y = ((i*53.1 + time*(28+(i%5)*6)) % (H+10)) - 5;
    const s = 1.5 + (i%3)*0.7; ctx.fillRect(x,y,s,s);
  }
}
function drawLeaves(time){
  const cols=['#e8842c','#d8502c','#f0b040','#b8602a'];
  for (let i=0;i<14;i++){
    const x = ((i*131 + time*(14+i%4*5) + Math.sin(time+i)*30) % (W+30)) - 15;
    const y = ((i*71 + time*(22+i%3*8)) % (H+20)) - 10;
    ctx.fillStyle = cols[i%4]; ctx.fillRect(x,y,4,3); ctx.fillRect(x+1,y+3,2,1);
  }
}
function drawBees(time){
  const R = gridRect();
  for (const b of bees){
    const x = (b.x+Math.sin(time*0.35+b.p)*0.16)*W;
    const y = R.y + b.y*0.9*R.h + Math.sin(time*2.4+b.p*3)*7;
    ctx.fillStyle='#f0c83c'; ctx.fillRect(x,y,3*b.s,2.4*b.s);
    ctx.fillStyle='#2b2b30'; ctx.fillRect(x+1.4*b.s,y,1*b.s,2.4*b.s);
    ctx.fillStyle='rgba(255,255,255,.6)'; ctx.fillRect(x+0.5*b.s,y-1.6*b.s+Math.sin(time*40+b.p)*0.8,2.4*b.s,1);
  }
}

/* ---------- Loop -------------------------------------------------------- */
let last = performance.now(), time = 0, tickAcc = 1;
function frame(now){
  const dt = clamp((now-last)/1000, 0, 0.05); last = now; time += dt;
  const nowMs = Date.now();
  const season = seasonAt(nowMs);
  let wx = weatherAt(nowMs); const night = nightAt(nowMs);
  tickAcc += dt;
  if (tickAcc > 0.25){ tickAcc = 0; advanceAll(nowMs); tickOrders(nowMs); tickOvens(nowMs); refreshTick(nowMs, season, wx); }
  maybeCrow(dt); updateDog(dt);
  for (let i=parts.length-1;i>=0;i--){ const p=parts[i]; p.t+=dt; p.x+=p.vx*dt; p.y+=p.vy*dt; p.vy+=p.g*dt; if (p.t>1.1) parts.splice(i,1); }
  for (let i=floats.length-1;i>=0;i--){ const f=floats[i]; f.t+=dt; f.y-=26*dt; if (f.t>1.4) floats.splice(i,1); }
  ctx.clearRect(0,0,W,H);
  draw(time, wx, night, season);
  requestAnimationFrame(frame);
}

/* ---------- Input ------------------------------------------------------- */
function plotAt(x,y){
  const F = FIELDS[S.fi], R = gridRect();
  if (x<R.x||y<R.y||x>=R.x+R.w||y>=R.y+R.h) return -1;
  const c = Math.floor((x-R.x)/G.t), r = Math.floor((y-R.y)/G.t);
  if (c<0||r<0||c>=F.cols||r>=F.rows) return -1;
  return r*F.cols+c;
}
let down = null;
cv.addEventListener('pointerdown', e => { Snd.unlock(); down = {x:e.clientX, y:e.clientY, t:performance.now()}; });
cv.addEventListener('pointerup', e => {
  if (!down) return;
  const dx = e.clientX-down.x, dy = e.clientY-down.y; down = null;
  if (Math.abs(dx) > 60 && Math.abs(dy) < 60){ switchField(dx < 0 ? 1 : -1); return; }
  if (Math.hypot(dx,dy) > 14) return;
  const rct = cv.getBoundingClientRect();
  tapAt(e.clientX-rct.left, e.clientY-rct.top);
});
function tapAt(x,y){
  if (crow && Math.hypot(x-crow.x,y-crow.y) < 34 && shooCrow()) return;
  if (dog && S.dog.has && Math.abs(x-dog.x) < 22 && y < dog.y+6 && y > dog.y-34){ petDog(); return; }
  const fo = field(), F = FIELDS[S.fi];
  if (!fo.open) return;
  if (!F.gh){
    const wp = wellPos();
    if (x>wp.x-8 && x<wp.x+34 && y>wp.y-16 && y<wp.y+24){ refillCan(); return; }
  }
  const i = plotAt(x,y); if (i<0) return;
  const p = fo.plots[i];
  if (!p.un){ buyPlot(i); return; }
  if (S.tool==='water'){ waterPlot(i); return; }
  if (S.tool==='clear'){ clearPlot(i); return; }
  if (p.spr){ toast(t('t.sprUse')); return; }
  if (!p.c){
    if (placingSprinkler){ p.spr = 1; S.spr[S.fi]++; placingSprinkler = false; toast(t('t.sprSet')); Snd.play('buy'); save(); return; }
    plant(i); return;
  }
  if (isRipe(p)){ harvest(i); return; }
  const crop = cropById[p.c];
  const dryNote = (p.water<=0.02 && !F.gh) ? t('t.dry') : '';
  const darkNote = crop.night && !nightAt(Date.now()) ? t('t.dark') : '';
  toast(t('t.toGo',{c:cropName(crop.id), t:fmtMs(msLeft(p)/(growMult()*seasonMult(crop, seasonAt(Date.now()), F.gh)))})+dryNote+darkNote);
}
let placingSprinkler = false;
function setTool(tl){
  S.tool = tl; save();
  $('tHand').classList.toggle('armed', tl==='hand');
  $('tWater').classList.toggle('armed', tl==='water');
  $('tClear').classList.toggle('armed', tl==='clear');
}
$('tHand').addEventListener('click', () => { Snd.play('click'); if (S.tool==='hand') openSeeds(); else setTool('hand'); });
$('tWater').addEventListener('click', () => {
  Snd.play('click');
  if (S.tool==='water'){ refillCan(); return; }
  setTool('water'); if (S.tut!==1) toast(t('t.waterHint'));
});
$('tClear').addEventListener('click', () => { Snd.play('click'); setTool('clear'); });
$('bHarvestAll').addEventListener('click', harvestAll);

function switchField(d){
  let n = S.fi + d;
  if (n < 0 || n >= FIELDS.length) return;
  S.fi = n; crow = null; placingSprinkler = false; Snd.play('open'); save(); refreshField();
  if (dog){ const R = gridRect(); dog.x = R.x + R.w*rnd(0.2,0.8); dog.y = R.y + R.h + 6; dog.state='sit'; dog.wait=1.5; }
}
$('fPrev').addEventListener('click', () => switchField(-1));
$('fNext').addEventListener('click', () => switchField(1));

/* ---------- UI ---------------------------------------------------------- */
let toastT = 0;
function toast(m){ const el=$('toast'); el.textContent=m; el.classList.add('on'); clearTimeout(toastT); toastT=setTimeout(()=>el.classList.remove('on'),2300); }
function refreshHud(){
  $('tCoins').textContent = S.coins;
  document.querySelectorAll('.coinMirror').forEach(e => e.textContent = S.coins);
  $('tLv').textContent = t('lvl',{l:S.lvl});
  $('xpBar').style.width = Math.round(100*S.xp/xpNeed(S.lvl))+'%';
  const n = bagCount(); $('bdBag').textContent = n>99?'99+':n; $('bdBag').classList.toggle('on', n>0);
  refreshDock();
}
function refreshDock(){
  $('waterTx').textContent = t('tool.water',{a:S.tank, b:tankMax()});
  $('tWater').querySelector('.fill').style.width = (100*S.tank/tankMax())+'%';
  $('clearTx').textContent = t('tool.clear');
  const crop = cropById[S.sel];
  $('handTx').textContent = crop ? cropName(crop.id) : t('tool.plant');
  const ic = $('seedIc'); if (crop) cropIcon(ic, crop, 3, true);
  const fr = S.free[S.sel] || 0;
  $('freeTag').style.display = fr ? 'block' : 'none'; $('freeTag').textContent = '×'+fr;
}
let lastHudH = 0;
function refreshTick(now, season, wx){
  // weather chip
  const wn = (season===3 && wx==='rain') ? 'snow' : wx;
  const wi = (wn==='sun' && nightAt(now)) ? '🌙' : WXI[wn];
  $('cWx').textContent = SEASON_IC[season]+' '+t('season'+season)+' · '+wi+' '+t('wx.'+wn);
  const f = festAt(now);
  $('cFest').classList.toggle('hide', !f);
  if (f) $('cFest').textContent = f.ic+' '+t('fest.chip',{n:t('fest.'+f.id)});
  $('cX2').classList.toggle('hide', !dblOn());
  if (dblOn()) $('cX2').textContent = '💰 '+t('x2chip',{t:fmtClock(S.dblUntil-now)});
  $('cRain').classList.toggle('hide', now >= S.rainUntil);
  if (now < S.rainUntil) $('cRain').textContent = '🌧️ '+t('rainchip',{t:fmtClock(S.rainUntil-now)});
  // harvest-all
  let n = 0; field().plots.forEach(p => { if (p.un && isRipe(p)) n++; });
  $('bHarvestAll').classList.toggle('on', n>=3 && field().open);
  $('bHarvestAll').textContent = '🧺 '+t('harvestAll',{n});
  // badges
  $('bdOrders').classList.toggle('on', S.orders.some(orderReady));
  $('bdKitchen').classList.toggle('on', S.ovens.some(o => o && now >= o.end));
  $('bdGoals').classList.remove('on');
  // keep the garden below the HUD when chips appear or wrap
  const hb = Math.round($('hud').getBoundingClientRect().height);
  if (hb !== lastHudH){ lastHudH = hb; layout(); }
  // live sheets
  if ($('shKitchen').classList.contains('on')) updateKitchenTimers();
  if ($('shOrders').classList.contains('on') && S.orders.some(o=>!o)) { /* refills handled in tickOrders */ }
  positionTut();
}
function refreshField(){
  const F = FIELDS[S.fi], fo = field();
  $('fName').textContent = (F.gh?'🏡 ':'')+t('field.'+F.id);
  $('fPrev').classList.toggle('off', S.fi===0);
  $('fNext').classList.toggle('off', S.fi===FIELDS.length-1);
  $('fDots').innerHTML = FIELDS.map((_,i)=>'<i class="'+(i===S.fi?'on':'')+'"></i>').join('');
  const lc = $('lockCard');
  lc.classList.toggle('on', !fo.open);
  if (!fo.open){
    $('lkTitle').textContent = t('field.lockedTitle',{n:t('field.'+F.id)});
    $('lkNote').textContent = F.gh ? t('field.ghNote') : '';
    const reqs = [];
    reqs.push([S.lvl >= F.lvl, t('field.needLvl',{l:F.lvl})]);
    if (F.prev !== undefined) reqs.push([S.fields[F.prev].open && openBeds(F.prev) >= FIELDS[F.prev].cols*FIELDS[F.prev].rows, t('field.needPrev',{p:t('field.'+FIELDS[F.prev].id)})]);
    $('lkReqs').innerHTML = reqs.map(r => '<div class="req '+(r[0]?'ok':'no')+'">'+(r[0]?'✓ ':'✗ ')+r[1]+'</div>').join('');
    $('lkBuy').textContent = t('field.buy',{c:F.cost});
    $('lkBuy').classList.toggle('off', !fieldReqOk(S.fi));
  }
  $('tWater').style.opacity = F.gh ? 0.45 : 1;
}
$('lkBuy').addEventListener('click', () => {
  if (!fieldReqOk(S.fi)){ Snd.play('err'); toast(S.lvl < FIELDS[S.fi].lvl ? t('t.needLvl',{l:FIELDS[S.fi].lvl}) : t('t.notEnough',{c:FIELDS[S.fi].cost})); return; }
  buyField(S.fi);
});

/* sheets */
function openSheet(id){ closeSheets(); $(id).classList.add('on'); Snd.play('open'); }
function closeSheets(){ document.querySelectorAll('.sheet').forEach(s => s.classList.remove('on')); }
function anySheet(){ return !!document.querySelector('.sheet.on'); }
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeSheets));
document.querySelectorAll('.sheet').forEach(s => s.addEventListener('click', e => { if (e.target===s) closeSheets(); }));

/* popups (queued) */
const popQ = []; let popCur = null;
function showPop(o){ popQ.push(o); if (!popCur) nextPop(); }
function nextPop(){
  popCur = popQ.shift() || null;
  const el = $('popup');
  if (!popCur){ el.classList.remove('on'); return; }
  const o = popCur;
  $('puIcon').textContent = o.icon || '';
  $('puTitle').textContent = o.title || '';
  $('puBody').textContent = o.body || ''; $('puBody').style.display = o.body ? '' : 'none';
  $('puGift').style.display = o.gift ? '' : 'none';
  if (o.gift){ $('puGiftT').textContent = o.gift.t; $('puGiftB').textContent = o.gift.b; }
  const inp = $('puInput'); inp.style.display = o.input!==undefined ? '' : 'none'; if (o.input!==undefined) inp.value = o.input;
  $('puNo').style.display = o.no ? '' : 'none'; $('puNo').textContent = o.no || '';
  $('puYes').textContent = o.yes || t('ok');
  el.classList.add('on');
}
$('puYes').addEventListener('click', () => { const o = popCur; const v = $('puInput').value; Snd.play('click'); nextPop(); if (o && o.onYes) o.onYes(v); });
$('puNo').addEventListener('click', () => { const o = popCur; Snd.play('click'); nextPop(); if (o && o.onNo) o.onNo(); });
function ask(title, body, onYes, icon){ showPop({icon:icon||'', title, body, yes:t('yes'), no:t('no'), onYes}); }

function cropIcon(canvas, crop, stage, noSoil){
  const g = canvas.getContext('2d'); g.imageSmoothingEnabled = false;
  g.clearRect(0,0,canvas.width,canvas.height);
  if (!noSoil) g.drawImage(soilSprite(true),0,0,PX,PX,0,0,canvas.width,canvas.height);
  g.drawImage(plantSprite(crop, stage===undefined?3:stage),0,0,PX,PX,0,0,canvas.width,canvas.height);
}
function itemIconHtml(id){ return recById[id] ? '<div class="em">'+recById[id].ic+'</div>' : '<canvas width="48" height="48" data-crop="'+id+'"></canvas>'; }
function paintIcons(root){ root.querySelectorAll('canvas[data-crop]').forEach(c => cropIcon(c, cropById[c.dataset.crop], 3)); }
function el(html){ const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }

/* --- Basket --- */
function buildBag(){
  const body = $('bagBody'); body.innerHTML = '';
  const ids = Object.keys(S.bag);
  if (!ids.length) body.appendChild(el('<div class="empty">'+t('bag.empty')+'</div>'));
  let total = 0;
  for (const id of ids){
    const n = S.bag[id], v = priceOf(id); total += v*n;
    const it = el('<div class="item">'+itemIconHtml(id)+'<div class="body"><div class="t">'+itemName(id)+' ×'+n+'</div>'+
      '<div class="s">'+t('bag.each',{v})+'</div></div><div class="btns2"><button class="buy ghost">'+t('bag.sell1')+'</button>'+
      '<button class="buy">'+t('bag.sellAll')+'</button></div></div>');
    body.appendChild(it);
    const [b1, b2] = it.querySelectorAll('button');
    b1.addEventListener('click', () => sell(id, 1));
    b2.addEventListener('click', () => sell(id, S.bag[id]));
  }
  paintIcons(body);
  $('bSellAll').textContent = t('bag.sellEverything',{v:total});
  $('bSellAll').style.display = ids.length ? '' : 'none';
}
function sell(id, n){
  n = Math.min(n, S.bag[id]||0); if (!n) return;
  const v = priceOf(id)*n;
  bagTake(id, n); addCoins(v, true);
  Snd.play('coin'); toast(t('t.sold',{v}));
  if (S.tut===3) setTut(4);
  checkAch(); save(); buildBag(); refreshHud();
}
$('bSellAll').addEventListener('click', () => {
  let v = 0; for (const id in S.bag) v += priceOf(id)*S.bag[id];
  if (!v) return;
  S.bag = {}; addCoins(v, true); Snd.play('coin'); toast(t('t.sold',{v}));
  if (S.tut===3) setTut(4);
  checkAch(); save(); buildBag(); refreshHud();
});
$('bBag').addEventListener('click', () => { buildBag(); openSheet('shBag'); });

/* --- Orders --- */
function buildOrders(){
  const body = $('ordBody'); body.innerHTML = '';
  S.orders.forEach((o,k) => {
    if (!o){ body.appendChild(el('<div class="item locked"><div class="em">⏳</div><div class="body"><div class="s">'+t('ord.soon')+'</div></div></div>')); return; }
    const v = VILLAGERS.find(x=>x.id===o.who) || VILLAGERS[0];
    const ready = orderReady(o);
    const needs = Object.keys(o.items).map(id => {
      const h = S.bag[id]||0, n = o.items[id];
      return '<span class="'+(h>=n?'ok':'no')+'">'+(recById[id]?recById[id].ic+' ':'')+itemName(id)+' '+t('ord.have',{h:Math.min(h,n),n})+'</span>';
    }).join('');
    const c = dblOn() ? o.coins*2 : o.coins;
    const it = el('<div class="item'+(ready?' done':'')+'"><div class="em">'+v.f+'</div><div class="body">'+
      '<div class="t">'+t('ord.wants',{w:t('ord.who.'+v.id)})+'</div><div class="need">'+needs+'</div>'+
      '<div class="s" style="margin-top:5px">'+t('ord.reward',{c, x:o.xp})+'</div></div>'+
      '<div class="btns2"><button class="buy'+(ready?'':' off')+'">'+t('ord.deliver')+'</button><button class="buy ghost">'+t('ord.skip')+'</button></div></div>');
    body.appendChild(it);
    const [b1,b2] = it.querySelectorAll('button');
    b1.addEventListener('click', () => { if (ready) deliver(k); else { Snd.play('err'); toast(t('t.missing')); } });
    b2.addEventListener('click', () => skipOrder(k));
  });
}
$('bOrders').addEventListener('click', () => { buildOrders(); openSheet('shOrders'); });

/* --- Kitchen --- */
function buildKitchen(){
  const body = $('kitBody'); body.innerHTML = '';
  if (!S.up.kitchen){ body.appendChild(el('<div class="empty">🍳<br>'+t('kit.locked')+'</div>')); return; }
  for (let k=0;k<ovenCount();k++){
    const ov = S.ovens[k];
    const it = el('<div class="item" data-oven="'+k+'"><div class="em">'+(ov?recById[ov.r].ic:'🔥')+'</div><div class="body">'+
      '<div class="t">'+t('kit.oven',{n:k+1})+(ov?' — '+t('rec.'+ov.r):'')+'</div>'+
      '<div class="s ovs">'+(ov?'':t('kit.idle'))+'</div>'+(ov?'<div class="bar"><i class="ovb"></i></div>':'')+'</div>'+
      (ov?'<button class="buy ovc">'+t('kit.collect')+'</button>':'')+'</div>');
    body.appendChild(it);
    if (ov) it.querySelector('.ovc').addEventListener('click', () => collect(k));
  }
  for (const r of RECIPES){
    const locked = r.lvl > S.lvl;
    const needs = Object.keys(r.need).map(id => {
      const h = S.bag[id]||0, n = r.need[id];
      return '<span class="'+(h>=n?'ok':'no')+'">'+cropName(id)+' '+Math.min(h,n)+'/'+n+'</span>';
    }).join('');
    const it = el('<div class="item'+(locked?' locked':'')+'"><div class="em">'+r.ic+'</div><div class="body">'+
      '<div class="t">'+t('rec.'+r.id)+'</div><div class="s">'+fmtMs(r.t)+' · '+t('kit.sells',{v:priceOf(r.id)})+'</div>'+
      (locked?'':'<div class="need">'+needs+'</div>')+'</div>'+
      (locked?'<button class="buy ghost off">'+t('shop.lvl',{l:r.lvl})+'</button>':'<button class="buy'+(canCook(r)?'':' off')+'">'+t('kit.cook')+'</button>')+'</div>');
    body.appendChild(it);
    if (!locked) it.querySelector('button').addEventListener('click', () => cook(r.id));
  }
  updateKitchenTimers();
}
function updateKitchenTimers(){
  const now = Date.now();
  document.querySelectorAll('#kitBody [data-oven]').forEach(it => {
    const ov = S.ovens[+it.dataset.oven]; if (!ov) return;
    const r = recById[ov.r], left = ov.end-now;
    it.querySelector('.ovs').textContent = left > 0 ? t('kit.left',{t:fmtMs(left)}) : '✓';
    const b = it.querySelector('.ovb'); if (b) b.style.width = Math.round(100*clamp(1-left/r.t,0,1))+'%';
    const c = it.querySelector('.ovc'); if (c) c.classList.toggle('off', left > 0);
  });
}
$('bKitchen').addEventListener('click', () => { buildKitchen(); openSheet('shKitchen'); });

/* --- Shop --- */
let shopTab = 'seeds';
function seasonInfo(crop){
  if (crop.only !== undefined) return t('shop.onlyIn',{s:t('season'+crop.only)});
  return crop.ss.map(s => SEASON_IC[s]).join('')+' '+t('shop.inSeason');
}
function buildShop(){
  document.querySelectorAll('#shopTabs .tab').forEach(x => { x.classList.toggle('on', x.dataset.tab===shopTab); x.textContent = t('shop.'+x.dataset.tab); });
  const body = $('shopBody'); body.innerHTML = '';
  if (shopTab==='seeds'){
    for (const crop of CROPS){
      const owned = !!S.seeds[crop.id], lvlOk = S.lvl >= crop.lvl;
      const yieldTxt = crop.regrow ? t('shop.picks',{n:crop.crops||3, t:fmtMs(crop.regrow)}) : t('shop.single');
      const fr = S.free[crop.id] ? ' · <b>'+t('shop.free',{n:S.free[crop.id]})+'</b>' : '';
      let btn;
      if (owned) btn = '<button class="buy ghost">'+(S.sel===crop.id?t('shop.chosen'):t('shop.choose'))+'</button>';
      else if (!lvlOk) btn = '<button class="buy ghost off">'+t('shop.lvl',{l:crop.lvl})+'</button>';
      else btn = '<button class="buy'+(S.coins>=crop.unlock?'':' off')+'">'+crop.unlock+'🪙</button>';
      const it = el('<div class="item'+(owned?'':' locked')+(owned&&S.sel===crop.id?' sel':'')+'"><canvas width="48" height="48"></canvas><div class="body">'+
        '<div class="t">'+cropName(crop.id)+(crop.night?' 🌙':'')+'</div>'+
        '<div class="s">'+t('shop.seedLine',{t:fmtMs(crop.grow), c:crop.cost, s:crop.sell})+'<br>'+yieldTxt+' · '+seasonInfo(crop)+fr+'</div></div>'+btn+'</div>');
      body.appendChild(it);
      cropIcon(it.querySelector('canvas'), crop, owned||lvlOk ? 3 : 0);
      it.querySelector('button').addEventListener('click', () => {
        if (owned){ S.sel = crop.id; setTool('hand'); save(); refreshDock(); buildShop(); toast(t('t.chosen',{c:cropName(crop.id)})); Snd.play('click'); closeSheets(); return; }
        if (!lvlOk){ toast(t('t.needLvl',{l:crop.lvl})); Snd.play('err'); return; }
        if (S.coins < crop.unlock){ toast(t('t.notEnough',{c:crop.unlock})); Snd.play('err'); return; }
        S.coins -= crop.unlock; S.seeds[crop.id] = 1; S.sel = crop.id;
        Snd.play('buy'); save(); refreshHud(); buildShop(); toast(t('t.unlocked',{c:cropName(crop.id)}));
      });
    }
  } else if (shopTab==='up'){
    for (const u of UPGRADES){
      if (u.needs && !S.up[u.needs]) continue;
      const here = FIELDS[S.fi].gh;
      const owned = u.repeat ? (S.spr[S.fi] >= u.repeat || here) : !!S.up[u.id];
      const lvlOk = S.lvl >= u.lvl;
      const count = u.repeat ? ' ('+S.spr[S.fi]+'/'+u.repeat+' · '+t('field.'+FIELDS[S.fi].id)+')' : '';
      let btn;
      if (owned) btn = '<button class="buy ghost off">'+t('shop.done')+'</button>';
      else if (!lvlOk) btn = '<button class="buy ghost off">'+t('shop.lvl',{l:u.lvl})+'</button>';
      else btn = '<button class="buy'+(S.coins>=u.cost?'':' off')+'">'+u.cost+'🪙</button>';
      const it = el('<div class="item'+(owned||!lvlOk?' locked':'')+'"><div class="em">'+u.ic+'</div>'+
        '<div class="body"><div class="t">'+t('up.'+u.id)+count+'</div><div class="s">'+t('up.'+u.id+'.d')+'</div></div>'+btn+'</div>');
      body.appendChild(it);
      it.querySelector('button').addEventListener('click', () => {
        if (owned) return;
        if (!lvlOk){ toast(t('t.needLvl',{l:u.lvl})); Snd.play('err'); return; }
        if (!field().open){ toast(t('t.lockedField')); return; }
        if (S.coins < u.cost){ toast(t('t.notEnough',{c:u.cost})); Snd.play('err'); return; }
        S.coins -= u.cost; Snd.play('buy');
        if (u.repeat){ placingSprinkler = true; setTool('hand'); closeSheets(); toast(t('t.sprTap')); }
        else {
          S.up[u.id] = 1;
          if (u.id==='can2') S.tank = tankMax();
          toast(t('t.installed',{n:t('up.'+u.id)}));
        }
        save(); refreshHud(); buildShop();
      });
    }
  } else {
    for (const cat of ['fence','path','cottage']){
      body.appendChild(el('<div class="sect">'+t('decor.'+cat)+'</div>'));
      for (const s of SKINS[cat]){
        const owned = !!S.owned[s.id], using = S.skin[cat]===s.id;
        const sw = cat==='cottage' ? '<div class="em" style="color:'+COTTAGE_COL[s.id]+'">🏠</div>' : '<div class="em">'+({wood:'🪵',picket:'🤍',stone:'🪨',hedge:'🌳',grass:'🌱',gravel:'⚪',brick:'🧱',flowers:'🌼'}[s.id])+'</div>';
        let btn;
        if (using) btn = '<button class="buy ghost off">'+t('shop.using')+'</button>';
        else if (owned) btn = '<button class="buy ghost" data-a="use">'+t('shop.use')+'</button>';
        else btn = '<div class="btns2"><button class="buy'+(S.coins>=s.cost?'':' off')+'" data-a="buy">'+s.cost+'🪙</button><button class="buy ad" data-a="ad">'+t('shop.watch')+'</button></div>';
        const it = el('<div class="item'+(using?' sel':'')+'">'+sw+'<div class="body"><div class="t">'+t('skin.'+s.id)+'</div>'+(owned&&!using?'<div class="s">'+t('shop.owned')+'</div>':'')+'</div>'+btn+'</div>');
        if (cat==='cottage'){ const e = it.querySelector('.em'); e.textContent=''; e.innerHTML='<span style="display:inline-block;width:30px;height:24px;border-radius:4px;background:'+COTTAGE_COL[s.id]+';box-shadow:inset 0 -6px 0 rgba(0,0,0,.2)"></span>'; }
        body.appendChild(it);
        it.querySelectorAll('button').forEach(b => b.addEventListener('click', async () => {
          const a = b.dataset.a; if (!a) return;
          if (a==='use'){ S.skin[cat] = s.id; Snd.play('click'); save(); buildShop(); return; }
          if (a==='buy'){
            if (S.coins < s.cost){ toast(t('t.notEnough',{c:s.cost})); Snd.play('err'); return; }
            S.coins -= s.cost; S.owned[s.id] = 1; S.skin[cat] = s.id; Snd.play('buy'); save(); refreshHud(); buildShop(); return;
          }
          if (a==='ad'){
            const ok = await Ads.show();
            if (!ok){ toast(t('t.noAd')); return; }
            S.owned[s.id] = 1; S.skin[cat] = s.id; Snd.play('buy'); toast(t('boost.skin')); save(); buildShop();
          }
        }));
      }
    }
  }
}
document.querySelectorAll('#shopTabs .tab').forEach(x => x.addEventListener('click', () => { shopTab = x.dataset.tab; Snd.play('click'); buildShop(); }));
function openSeeds(){ shopTab='seeds'; buildShop(); openSheet('shShop'); }
$('bShop').addEventListener('click', () => { buildShop(); openSheet('shShop'); });

/* --- Almanac --- */
function buildBook(){
  const body = $('bookBody'); body.innerHTML = '';
  let got = 0;
  for (const crop of CROPS){
    const b = S.book[crop.id]; if (b) got++;
    const sub = b ? t('note.'+crop.id)+'<br><b>'+t('book.stats',{n:b.n, b:b.best})+'</b> · '+t('book.season',{s:crop.ss.map(s=>t('season'+s)).join(', ')})
      : t('book.notYet')+' '+(S.seeds[crop.id] ? t('book.inTray') : t('book.unlockAt',{l:crop.lvl}));
    const it = el('<div class="item'+(b?'':' locked')+'"><canvas width="48" height="48"></canvas><div class="body"><div class="t">'+(b?cropName(crop.id):t('book.unknown'))+'</div><div class="s">'+sub+'</div></div></div>');
    body.appendChild(it);
    cropIcon(it.querySelector('canvas'), crop, b?3:0);
  }
  $('bookCount').textContent = got+' / '+CROPS.length;
}
$('bBook').addEventListener('click', () => { buildBook(); openSheet('shBook'); });

/* --- Goals --- */
function buildGoals(){
  const body = $('goalBody'); body.innerHTML = '';
  let done = 0;
  for (const a of ACHIEVEMENTS){
    const d = !!S.ach[a.id]; if (d) done++;
    const v = Math.min(statVal(a.stat), a.n);
    body.appendChild(el('<div class="item'+(d?' done':'')+'"><div class="em">'+(d?'🏆':'🎯')+'</div><div class="body"><div class="t">'+t('ach.'+a.id)+'</div>'+
      '<div class="s">'+(d?t('goals.done'):v+' / '+a.n)+' · '+t('goals.reward',{r:a.r})+'</div>'+(d?'':'<div class="bar"><i style="width:'+Math.round(100*v/a.n)+'%"></i></div>')+'</div></div>'));
  }
  $('goalCount').textContent = done+' / '+ACHIEVEMENTS.length;
}
$('bGoals').addEventListener('click', () => { buildGoals(); openSheet('shGoals'); });

/* --- Boosts (optional ads) --- */
const BOOSTS = [
  {id:'grow', ic:'🌱'}, {id:'double', ic:'💰'}, {id:'seeds', ic:'🎁'}, {id:'rain', ic:'🌧️'}
];
function buildBoost(){
  $('boostSub').textContent = t('boost.sub');
  const body = $('boostBody'); body.innerHTML = '';
  for (const b of BOOSTS){
    const it = el('<div class="item"><div class="em">'+b.ic+'</div><div class="body"><div class="t">'+t('boost.'+b.id)+'</div><div class="s">'+t('boost.'+b.id+'.d')+'</div></div><button class="buy ad">'+t('boost.watch')+'</button></div>');
    body.appendChild(it);
    it.querySelector('button').addEventListener('click', () => watchBoost(b.id));
  }
}
let watching = false;
async function watchBoost(id){
  if (watching) return; watching = true;
  try {
    const ok = await Ads.show();
    if (!ok){ toast(t('t.noAd')); return; }
    const now = Date.now();
    advanceAll(now);
    if (id==='grow'){
      S.fields.forEach(f => { if (f.open) f.plots.forEach(p => {
        const c = cropById[p.c]; if (!c) return;
        p.prog = Math.min(p.prog + 30*MIN*growMult(), c.grow*(1+(c.crops||1)));
        if (p.prog >= c.grow) p.water = Math.max(p.water, 0.5);
      }); });
      toast(t('boost.got.grow'));
    } else if (id==='double'){
      S.dblUntil = Math.max(now, S.dblUntil) + 10*MIN; toast(t('boost.got.double'));
    } else if (id==='seeds'){
      const owned = CROPS.filter(c => S.seeds[c.id]).sort((a,b) => b.cost-a.cost).slice(0,3);
      const c = pick(owned);
      S.free[c.id] = (S.free[c.id]||0) + 5; S.sel = c.id; setTool('hand');
      toast(t('boost.got.seeds',{c:cropName(c.id)}));
    } else if (id==='rain'){
      S.rainUntil = Math.max(now, S.rainUntil) + 5*MIN; toast(t('boost.got.rain'));
    }
    Snd.play('golden'); save(); refreshHud(); closeSheets();
  } finally { watching = false; }
}
$('bBoost').addEventListener('click', () => { buildBoost(); openSheet('shBoost'); });

/* --- Settings --- */
function buildSettings(){
  const body = $('setBody'); body.innerHTML = '';
  const sw = (key, lab, sub) => {
    const r = el('<div class="row"><div style="flex:1"><div class="lab">'+lab+'</div><div class="rsub">'+sub+'</div></div><div class="sw'+(S[key]?' on':'')+'"></div></div>');
    r.querySelector('.sw').addEventListener('click', e => { S[key] = !S[key]; e.target.classList.toggle('on', S[key]); if (key==='snd') Snd.set(S.snd); Snd.play('click'); save(); });
    body.appendChild(r);
  };
  sw('snd', t('set.snd'), t('set.snd.d'));
  sw('fx', t('set.fx'), t('set.fx.d'));
  sw('mark', t('set.mark'), t('set.mark.d'));
  const lang = el('<div class="row"><div class="lab">'+t('set.lang')+'</div><div class="seg"><div data-l="en">English</div><div data-l="fr">Français</div></div></div>');
  lang.querySelectorAll('[data-l]').forEach(d => { d.classList.toggle('on', d.dataset.l===S.lang); d.addEventListener('click', () => { S.lang = d.dataset.l; LANG = S.lang; save(); applyLang(); buildSettings(); }); });
  body.appendChild(lang);
  if (S.dog.has){
    const dr = el('<div class="row"><div style="flex:1"><div class="lab">🐶 '+t('set.dog')+'</div><div class="rsub">'+escapeHtml(S.dog.name)+'</div></div><button class="buy ghost">'+t('set.rename')+'</button></div>');
    dr.querySelector('button').addEventListener('click', () => { closeSheets(); showPop({icon:'🐶', title:t('set.dog'), input:S.dog.name, yes:t('ok'), no:t('cancel'),
      onYes:v => { const n=(v||'').trim().slice(0,14); if (n) S.dog.name = n; save(); }}); });
    body.appendChild(dr);
  }
  const days = Math.max(1, Math.round((Date.now()-S.started)/864e5));
  const beds = S.fields.reduce((a,f)=>a+(f.open?f.plots.filter(p=>p.un).length:0),0);
  body.appendChild(el('<div class="row" style="flex-direction:column;align-items:stretch;gap:6px"><div class="lab">'+t('set.stats')+'</div><div class="rsub">'+
    t('set.statLine',{b:beds, p:S.stats.planted, e:S.stats.earned, k:Object.keys(S.book).length, t:CROPS.length, d:days})+'</div></div>'));
  body.appendChild(el('<div style="opacity:.65;font-size:12.5px;text-align:center;padding:6px 8px;line-height:1.5">'+t('set.help')+'</div>'));
  body.appendChild(el('<a class="link" href="'+PRIVACY_URL+'" target="_blank" rel="noopener">'+t('set.privacy')+'</a>'));
  const rb = el('<button class="btn" style="color:#ff9a8f">'+t('set.reset')+'</button>');
  rb.addEventListener('click', () => { closeSheets(); ask(t('set.reset'), t('set.resetAsk'), () => {
    const keep = {lang:S.lang, snd:S.snd, fx:S.fx, mark:S.mark};
    S = Object.assign(blankState(), keep, {tut:4, lastGift:dayKey(Date.now())}); dog = null; crow = null;
    saveNow(); refreshHud(); refreshField(); toast(t('fresh'));
  }, '⚠️'); });
  body.appendChild(rb);
  body.appendChild(el('<div style="opacity:.4;font-size:11px;text-align:center">Pixel Garden · MOS Arcade</div>'));
}
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
$('bSet').addEventListener('click', () => { buildSettings(); openSheet('shSet'); });

$('cFest').addEventListener('click', () => {
  const f = festAt(Date.now()); if (!f) return;
  showPop({icon:f.ic, title:t('fest.title',{n:t('fest.'+f.id)}), body:t('fest.body',{list:f.crops.map(cropName).join(', ')}), yes:t('ok')});
});

/* ---------- Tutorial ---------------------------------------------------- */
function setTut(n){
  S.tut = n;
  if (n===4){ toast(t('tut.done')); Snd.play('level'); }
  save(); positionTut();
}
function positionTut(){
  const b = $('tut');
  document.querySelectorAll('.glow').forEach(x => x.classList.remove('glow'));
  if (S.tut >= 4 || anySheet() || popCur || S.fi !== 0){ b.classList.remove('on'); return; }
  b.textContent = t('tut.'+S.tut);
  b.classList.add('on');
  const fo = field(), first = fo.plots.findIndex(p => p.un && (S.tut===0 ? !p.c : !!p.c));
  const R = plotRect(Math.max(0, first));
  let top = R.y - 56;
  if (S.tut===1){
    if (S.tool==='water') top = R.y - 56; else { $('tWater').classList.add('glow'); top = layoutBottom - 64; }
  }
  if (S.tut===3){ $('bBag').classList.add('glow'); top = layoutBottom - 64; }
  b.style.top = Math.max(layoutTop, top) + 'px';
}

/* ---------- Welcome back + daily gift ----------------------------------- */
let hiddenAt = 0;
function welcomeBack(force){
  const now = Date.now();
  const lastSeen = Math.max(...S.fields.flatMap(f => f.plots.map(p => p.lastT||0)));
  const away = now - lastSeen;
  const before = S.fields.map(f => f.plots.map(p => p.c ? isRipe(p) : false));
  advanceAll(now);
  let ready = 0, dried = 0;
  S.fields.forEach((f,fi) => { if (!f.open) return; f.plots.forEach((p,i) => {
    if (p.c && isRipe(p) && !before[fi][i]) ready++;
    if (p.c && p.water<=0.02 && !isRipe(p) && !FIELDS[fi].gh) dried++;
  }); });
  const cooked = S.ovens.filter(o => o && now >= o.end).length;
  if (S.tut < 4){ if (!S.lastGift){ S.lastGift = dayKey(now); S.streak = 1; } save(); return; }
  const today = dayKey(now);
  let gift = null;
  if (S.lastGift !== today){
    S.streak = (S.lastGift === String(+today-1)) ? (S.streak||0)+1 : 1;
    const c = 20 + 10*Math.min(S.streak,7) + 2*S.lvl;
    gift = {c, d:S.streak};
  }
  const lines = [];
  if (ready) lines.push(ready===1 ? t('wb.ready1') : t('wb.ready',{n:ready}));
  if (dried) lines.push(t('wb.dry',{n:dried}));
  if (cooked) lines.push(t('wb.cooked',{n:cooked}));
  if (!gift && (!lines.length || away < 3*MIN) && !force){ save(); return; }
  if (!lines.length) lines.push(t('wb.nothing'));
  showPop({icon: gift ? '🎁' : '🌻', title:t('wb.title'), body:lines.join('\n'),
    gift: gift ? {t:t('wb.gift',{d:gift.d}), b:t('wb.giftBody',{c:gift.c})} : null,
    yes: gift ? t('wb.collect') : t('wb.ok'),
    onYes: () => { if (gift){ S.lastGift = today; addCoins(gift.c); Snd.play('coin'); save(); } }});
  save();
}

/* ---------- Language ---------------------------------------------------- */
function applyLang(){
  document.documentElement.lang = LANG;
  $('hBag').textContent = '🧺 '+t('bag.title');
  $('hOrders').textContent = '📋 '+t('ord.title');
  $('hKitchen').textContent = '🍳 '+t('kit.title');
  $('hShop').textContent = '🛒 '+t('shop.title');
  $('hBook').textContent = '📗 '+t('book.title');
  $('hGoals').textContent = '🏆 '+t('goals.title');
  $('hBoost').textContent = '🎬 '+t('boost.title');
  $('hSet').textContent = '⚙️ '+t('set.title');
  $('fakeAdTx').textContent = t('ad.test');
  refreshHud(); refreshField(); positionTut();
}

/* ---------- Android back button & app state ----------------------------- */
function handleBack(){
  if (popCur){ const o = popCur; nextPop(); if (o.onNo) o.onNo(); return true; }
  if (anySheet()){ closeSheets(); return true; }
  return false;
}
function setupNative(){
  const Cap = window.Capacitor;
  const AppP = Cap && Cap.Plugins && Cap.Plugins.App;
  if (AppP){
    AppP.addListener('backButton', () => { if (!handleBack()) { saveNow(); AppP.minimizeApp ? AppP.minimizeApp() : AppP.exitApp(); } });
  }
  Ads.init();
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden){ hiddenAt = Date.now(); saveNow(); return; }
  last = performance.now();
  if (hiddenAt && Date.now() - hiddenAt > 3*MIN) welcomeBack(false);
  else { advanceAll(Date.now()); }
  hiddenAt = 0;
});
window.addEventListener('pagehide', saveNow);

/* ---------- Boot -------------------------------------------------------- */
load();
applyLang();
fit();
initAmbient();
setTool(S.tool==='water'||S.tool==='clear' ? S.tool : 'hand');
refreshHud(); refreshField();
if (S.dog.has) spawnDog();
welcomeBack(false);
checkAch();
setupNative();
window.addEventListener('resize', () => { fit(); refreshField(); });
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { layout(); });
requestAnimationFrame(frame);
