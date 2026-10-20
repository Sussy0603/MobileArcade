'use strict';
/* Pixel Garden — game data. Times are milliseconds. Everything grows 2x
   faster than the Arcade version. Seasons: 0 spring, 1 summer, 2 fall, 3 winter. */
const MIN = 60000;

/* ss: seasons where the crop gets the in-season bonus.
   only: a seasonal crop — can only be sown outdoors in that season. */
const CROPS = [
 {id:'radish',arch:'root',grow:1.5*MIN,cost:4,sell:9,lvl:1,unlock:0,ss:[0,3],
  c:{leaf:'#6fb03a',leaf2:'#4a8028',fruit:'#e0506a',fruit2:'#f0808f'}},
 {id:'carrot',arch:'root',grow:3.5*MIN,cost:7,sell:17,lvl:1,unlock:0,ss:[0,2],
  c:{leaf:'#5fa838',leaf2:'#3f7a26',fruit:'#e8842c',fruit2:'#f4a850'}},
 {id:'lettuce',arch:'leaf',grow:5*MIN,cost:10,sell:24,lvl:1,unlock:0,ss:[0],
  c:{leaf:'#8fd04a',leaf2:'#5f9a30',fruit:'#b8e07a',fruit2:'#d8f0a0'}},
 {id:'tomato',arch:'bush',grow:7.5*MIN,regrow:3*MIN,crops:4,cost:20,sell:34,lvl:2,unlock:60,ss:[1],
  c:{leaf:'#4f9030',leaf2:'#376820',fruit:'#d8402c',fruit2:'#f07050'}},
 {id:'strawberry',arch:'bush',grow:10*MIN,regrow:4*MIN,crops:5,cost:28,sell:44,lvl:3,unlock:120,ss:[0,1],
  c:{leaf:'#5fa838',leaf2:'#3f7a26',fruit:'#e04050',fruit2:'#f47080'}},
 {id:'peas',arch:'bush',grow:5*MIN,regrow:2*MIN,crops:3,cost:9,sell:20,lvl:3,unlock:80,ss:[0],only:0,
  c:{leaf:'#6fb03a',leaf2:'#4a8028',fruit:'#7ac850',fruit2:'#b0e488'}},
 {id:'lavender',arch:'tall',grow:9*MIN,cost:24,sell:46,lvl:4,unlock:150,ss:[1],
  c:{leaf:'#7a9a5a',leaf2:'#5a7840',fruit:'#9a7ad8',fruit2:'#c0a8f0'}},
 {id:'chili',arch:'bush',grow:12*MIN,regrow:4.5*MIN,crops:4,cost:34,sell:56,lvl:5,unlock:180,ss:[1],
  c:{leaf:'#4f9030',leaf2:'#376820',fruit:'#d03020',fruit2:'#f06040'}},
 {id:'sunflower',arch:'tall',grow:13*MIN,cost:32,sell:64,lvl:5,unlock:220,ss:[1],
  c:{leaf:'#5fa838',leaf2:'#3f7a26',fruit:'#f0c83c',fruit2:'#6a4a28'}},
 {id:'eggplant',arch:'bush',grow:9*MIN,regrow:4*MIN,crops:3,cost:26,sell:52,lvl:6,unlock:200,ss:[1],only:1,
  c:{leaf:'#4f9030',leaf2:'#376820',fruit:'#5a2a6a',fruit2:'#9a6ab0'}},
 {id:'mushroom',arch:'fungus',grow:6*MIN,night:1,cost:22,sell:52,lvl:6,unlock:260,ss:[2,3],
  c:{leaf:'#c04a3a',leaf2:'#8f3428',fruit:'#f0e8d8',fruit2:'#d8ccb4'}},
 {id:'corn',arch:'tall',grow:16*MIN,cost:40,sell:82,lvl:7,unlock:300,ss:[1,2],
  c:{leaf:'#6fa83a',leaf2:'#4a7a26',fruit:'#f0c83c',fruit2:'#d8a828'}},
 {id:'squash',arch:'vine',grow:14*MIN,cost:38,sell:84,lvl:8,unlock:340,ss:[2],only:2,
  c:{leaf:'#5f8a2c',leaf2:'#3f6820',fruit:'#e8b060',fruit2:'#c8883a'}},
 {id:'blueberry',arch:'bush',grow:18*MIN,regrow:6*MIN,crops:5,cost:52,sell:88,lvl:9,unlock:420,ss:[1],
  c:{leaf:'#4f9030',leaf2:'#376820',fruit:'#4a5aa8',fruit2:'#7a8ad8'}},
 {id:'pumpkin',arch:'vine',grow:22.5*MIN,cost:64,sell:132,lvl:10,unlock:560,ss:[2],
  c:{leaf:'#4f8a2c',leaf2:'#376820',fruit:'#e8842c',fruit2:'#f4a850'}},
 {id:'cabbage',arch:'leaf',grow:12*MIN,cost:44,sell:96,lvl:11,unlock:480,ss:[3],only:3,
  c:{leaf:'#6a9a5a',leaf2:'#4a7840',fruit:'#c0dca8',fruit2:'#e0f0d0'}},
 {id:'moonflower',arch:'flower',grow:20*MIN,night:1,cost:70,sell:180,lvl:12,unlock:640,ss:[1],
  c:{leaf:'#5a8a4a',leaf2:'#3a6030',fruit:'#e8e8ff',fruit2:'#fff0a0'}},
 {id:'grapes',arch:'vine',grow:26*MIN,regrow:8*MIN,crops:4,cost:80,sell:150,lvl:13,unlock:720,ss:[2],
  c:{leaf:'#5f9a3a',leaf2:'#3f7028',fruit:'#7a4a9a',fruit2:'#a878c8'}},
 {id:'melon',arch:'vine',grow:31*MIN,cost:100,sell:210,lvl:15,unlock:900,ss:[1],
  c:{leaf:'#4f8a2c',leaf2:'#376820',fruit:'#6faa3a',fruit2:'#3f7028'}}
];
const cropById = {}; CROPS.forEach(c => cropById[c.id] = c);

const SEASON_IC = ['🌸','☀️','🍂','❄️'];

/* A festival runs every afternoon (noon to 6pm) for the season of the day. */
const FESTIVALS = [
 {id:'blossom', ic:'🌷', crops:['lavender','sunflower','moonflower','peas','radish']},
 {id:'berry',   ic:'🍓', crops:['strawberry','blueberry','tomato','eggplant','chili']},
 {id:'harvest', ic:'🎃', crops:['pumpkin','corn','squash','grapes','carrot']},
 {id:'frost',   ic:'⛄', crops:['cabbage','mushroom','carrot','radish','lettuce']}
];

const UPGRADES = [
 {id:'can2',  cost:160, lvl:2, ic:'🪣'},
 {id:'kitchen',cost:200,lvl:4, ic:'🍳'},
 {id:'spr',   cost:280, lvl:4, ic:'⛲', repeat:4},
 {id:'compost',cost:320,lvl:5, ic:'🍂'},
 {id:'bees',  cost:460, lvl:7, ic:'🐝'},
 {id:'oven2', cost:600, lvl:8, ic:'🔥', needs:'kitchen'}
];

/* Kitchen recipes. Value = ingredients x1.5, worked out at load. */
const RECIPES = [
 {id:'salad',   ic:'🥗', lvl:4, t:1*MIN,   need:{lettuce:1,tomato:1,carrot:1}},
 {id:'soup',    ic:'🍲', lvl:4, t:1.5*MIN, need:{carrot:2,radish:2}},
 {id:'peasoup', ic:'🥣', lvl:4, t:1.5*MIN, need:{peas:2,carrot:1}},
 {id:'sauce',   ic:'🥫', lvl:5, t:2*MIN,   need:{tomato:3}},
 {id:'jam',     ic:'🍓', lvl:5, t:2*MIN,   need:{strawberry:3}},
 {id:'honey',   ic:'🍯', lvl:6, t:2*MIN,   need:{lavender:2}},
 {id:'chilijam',ic:'🌶️', lvl:6, t:2.5*MIN, need:{chili:2,tomato:1}},
 {id:'ratatouille',ic:'🍆',lvl:7,t:3*MIN,  need:{eggplant:2,tomato:1,chili:1}},
 {id:'mushpie', ic:'🥧', lvl:7, t:3*MIN,   need:{mushroom:2,carrot:1}},
 {id:'cornbread',ic:'🍞',lvl:8, t:3*MIN,   need:{corn:2}},
 {id:'squashsoup',ic:'🍜',lvl:9,t:3*MIN,   need:{squash:2,carrot:1}},
 {id:'muffins', ic:'🧁', lvl:10,t:3*MIN,   need:{blueberry:3}},
 {id:'pumpkinpie',ic:'🎃',lvl:11,t:4*MIN,  need:{pumpkin:1,corn:1}},
 {id:'rolls',   ic:'🥬', lvl:12,t:3.5*MIN, need:{cabbage:1,mushroom:1}},
 {id:'juice',   ic:'🍇', lvl:14,t:3*MIN,   need:{grapes:3}},
 {id:'sorbet',  ic:'🍈', lvl:15,t:4*MIN,   need:{melon:1,strawberry:1}}
];
const recById = {};
RECIPES.forEach(r => {
  let v = 0, n = 0;
  for (const k in r.need) { v += cropById[k].sell * r.need[k]; n += r.need[k]; }
  r.sell = Math.round(v * 1.5);
  r.xp = n * 2;
  recById[r.id] = r;
});

/* Decor. Free ones are the starting look. Others: coins OR watch an ad. */
const SKINS = {
  fence:   [{id:'wood',cost:0},{id:'picket',cost:300},{id:'stone',cost:600},{id:'hedge',cost:900}],
  path:    [{id:'grass',cost:0},{id:'gravel',cost:250},{id:'brick',cost:500},{id:'flowers',cost:800}],
  cottage: [{id:'red',cost:0},{id:'blue',cost:200},{id:'yellow',cost:200},{id:'lilac',cost:400}]
};
const COTTAGE_COL = {red:'#b8504a', blue:'#4a78b8', yellow:'#e0b040', lilac:'#a07ac8'};

/* Fields. Each new field needs every bed of the one before it open. */
const FIELDS = [
 {id:'home',    cols:5, rows:6, free:6, base:45,  lvl:1,  cost:0},
 {id:'meadow',  cols:5, rows:6, free:6, base:300, lvl:8,  cost:1500, prev:0},
 {id:'orchard', cols:5, rows:6, free:6, base:800, lvl:14, cost:5000, prev:1},
 {id:'green',   cols:3, rows:3, free:9, base:0,   lvl:10, cost:2500, gh:true}
];

const ACHIEVEMENTS = [
 {id:'h10',   stat:'harvests', n:10,    r:30},
 {id:'h100',  stat:'harvests', n:100,   r:150},
 {id:'h500',  stat:'harvests', n:500,   r:600},
 {id:'e1k',   stat:'earned',   n:1000,  r:100},
 {id:'e10k',  stat:'earned',   n:10000, r:500},
 {id:'o5',    stat:'orders',   n:5,     r:80},
 {id:'o25',   stat:'orders',   n:25,    r:300},
 {id:'c10',   stat:'cooked',   n:10,    r:150},
 {id:'gold',  stat:'golden',   n:1,     r:100},
 {id:'kinds', stat:'kinds',    n:CROPS.length, r:800},
 {id:'seasons',stat:'seasons', n:4,     r:200},
 {id:'l5',    stat:'level',    n:5,     r:100},
 {id:'l10',   stat:'level',    n:10,    r:300},
 {id:'l15',   stat:'level',    n:15,    r:700},
 {id:'beds',  stat:'beds',     n:30,    r:250},
 {id:'meadow',stat:'fields',   n:2,     r:300},
 {id:'gh',    stat:'gh',       n:1,     r:300},
 {id:'pets',  stat:'pets',     n:10,    r:50}
];

const VILLAGERS = [
 {id:'mabel',f:'👵'},{id:'theo',f:'👦'},{id:'rosa',f:'👩‍🌾'},{id:'gus',f:'👴'},
 {id:'lila',f:'👧'},{id:'marco',f:'👨‍🍳'},{id:'june',f:'👩'},{id:'otis',f:'🧔'}
];
