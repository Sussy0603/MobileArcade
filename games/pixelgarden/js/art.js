'use strict';
/* Pixel sprites. Each is painted once into a small offscreen canvas and
   blitted with smoothing off, so everything stays crisp at any size. */
const TAU = Math.PI * 2;
const PX = 24;
const spriteCache = {};
function sprite(key, fn, w, h){
  if (spriteCache[key]) return spriteCache[key];
  const c = document.createElement('canvas'); c.width = w || PX; c.height = h || PX;
  const g = c.getContext('2d');
  const P = {
    r:(x,y,w,h,col)=>{g.fillStyle=col;g.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));},
    p:(x,y,col)=>{g.fillStyle=col;g.fillRect(Math.round(x),Math.round(y),1,1);},
    d:(cx,cy,rad,col)=>{g.fillStyle=col;
      for(let y=-rad;y<=rad;y++) for(let x=-rad;x<=rad;x++)
        if(x*x+y*y<=rad*rad+rad*0.4) g.fillRect(Math.round(cx+x),Math.round(cy+y),1,1);},
    leafBlob:(cx,cy,w,h,col)=>{g.fillStyle=col;
      for(let y=0;y<h;y++){const ww=Math.round(w*Math.sin((y+0.5)/h*Math.PI)+0.4);
        g.fillRect(Math.round(cx-ww/2),Math.round(cy-h/2+y),Math.max(1,ww),1);}}
  };
  fn(P, g);
  spriteCache[key] = c;
  return c;
}

function soilSprite(wet, gh){
  return sprite('soil'+(wet?1:0)+(gh?'g':''), P => {
    const a = wet?'#5a4028':'#8a6a44', b = wet?'#4a3420':'#7a5a38', c = wet?'#6a4c30':'#9a7a52';
    P.r(0,0,PX,PX,a);
    for (let y=2;y<PX;y+=5) P.r(1,y,PX-2,2,b);
    for (let i=0;i<16;i++){const x=(i*7+3)%(PX-2)+1,y=(i*11+5)%(PX-2)+1;P.p(x,y,c);}
    if (gh){ P.r(0,0,PX,1,'#c8d8d0'); P.r(0,0,1,PX,'#c8d8d0'); P.r(PX-1,0,1,PX,'#7a8a84'); P.r(0,PX-1,PX,1,'#7a8a84'); }
    else { P.r(0,0,PX,1,'#00000022'); P.r(0,PX-1,PX,1,'#00000033'); }
  });
}
function weedSprite(season){
  return sprite('weeds'+season, P => {
    const base = ['#4f7f36','#4f7f36','#6f7a36','#8a9a8a'][season];
    P.r(0,0,PX,PX,base);
    for (let i=0;i<26;i++){const x=(i*9+2)%PX,y=(i*13+3)%PX;P.p(x,y,i%3?'#5f9040':'#3f6a2a');}
    const stalks=[[5,17],[11,19],[17,16],[8,21],[20,20]];
    for (const [x,y] of stalks){
      P.r(x,y-6,1,6,'#6f9a48');
      P.p(x-1,y-6,'#7faa54');P.p(x+1,y-5,'#7faa54');P.p(x,y-8,season===3?'#ffffff':'#c8d86a');
    }
    if (season===3) for (let i=0;i<14;i++) P.p((i*5+1)%PX,(i*7+2)%PX,'#f4f8ff');
  });
}
function sprinklerSprite(t){
  return sprite('spr'+t, P => {
    P.r(9,9,6,11,'#8a929a');P.r(9,9,2,11,'#a8b0b8');
    P.r(7,19,10,3,'#6a727a');P.r(11,5,2,5,'#8a929a');P.d(12,5,2,'#b8c0c8');
    const drops=[[6,7],[18,7],[4,11],[20,11],[8,4],[16,4]];
    for (let i=0;i<drops.length;i++){ if((i+t)%3===0) continue; P.p(drops[i][0],drops[i][1]+((t+i)%2),'#8fd0f0'); }
  });
}
function plantSprite(crop, stage, gold){
  return sprite('c'+crop.id+stage+(gold?'g':''), P => {
    const C = gold ? {leaf:crop.c.leaf,leaf2:crop.c.leaf2,fruit:'#f8d040',fruit2:'#fff4a0'} : crop.c;
    const ground = 21;
    if (stage===0){
      P.r(8,ground-2,8,3,'#6a4c2e');
      P.p(10,ground-3,'#cfae7a');P.p(13,ground-4,'#cfae7a');P.p(12,ground-2,'#cfae7a');
      return;
    }
    if (stage===1){
      P.r(11,ground-5,1,5,C.leaf2);
      P.leafBlob(8,ground-6,5,3,C.leaf);
      P.leafBlob(15,ground-7,5,3,C.leaf);
      return;
    }
    const full = stage===3;
    switch (crop.arch){
      case 'root':{
        const h=full?11:8;
        P.r(11,ground-h,2,h,C.leaf2);
        for (let i=0;i<(full?6:4);i++){
          const side=i%2?1:-1, y=ground-3-i*(h/(full?6:4));
          P.leafBlob(12+side*(3+i*0.7),y,4+i*0.5,3,i%2?C.leaf:C.leaf2);
        }
        if (full){ P.leafBlob(12,ground+1,8,4,C.fruit); P.r(9,ground-1,6,1,C.fruit2); }
        break;}
      case 'leaf':{
        const rad=full?8:6;
        P.d(12,ground-rad+3,rad,C.leaf2);
        P.d(12,ground-rad+3,rad-2,C.leaf);
        if (full) P.d(12,ground-rad+3,rad-5,C.fruit);
        for (let i=0;i<7;i++){const a=i/7*TAU;
          P.p(Math.round(12+Math.cos(a)*rad),Math.round(ground-rad+3+Math.sin(a)*rad*0.85),C.leaf2);}
        break;}
      case 'bush':{
        const h=full?13:10;
        P.r(11,ground-h,2,h,C.leaf2);
        const leaves=full?5:3;
        for (let i=0;i<leaves;i++){const side=i%2?1:-1;
          P.leafBlob(12+side*5,ground-3-i*(h/leaves),6,4,i%2?C.leaf:C.leaf2);}
        if (full){
          if (crop.id==='peas'){
            const pods=[[7,ground-8],[16,ground-6],[10,ground-12]];
            for (const [x,y] of pods){ P.r(x-1,y-2,3,6,C.fruit); P.p(x,y-1,C.fruit2); P.p(x,y+1,C.fruit2); }
          } else if (crop.id==='eggplant'){
            const e=[[8,ground-6],[16,ground-7]];
            for (const [x,y] of e){ P.leafBlob(x,y+1,5,7,C.fruit); P.p(x-1,y-1,C.fruit2); P.r(x-1,y-3,3,1,C.leaf2); }
          } else {
            const spots=[[7,ground-7],[16,ground-5],[12,ground-11],[9,ground-12]];
            for (let i=0;i<(crop.id==='blueberry'?4:3);i++){
              P.d(spots[i][0],spots[i][1],crop.id==='blueberry'?2:3,C.fruit);
              P.p(spots[i][0]-1,spots[i][1]-1,C.fruit2);
            }
          }
        } else if (stage===2){ P.p(9,ground-8,'#f0f0d8');P.p(15,ground-6,'#f0f0d8'); }
        break;}
      case 'tall':{
        const h=full?17:12;
        P.r(11,ground-h,2,h,C.leaf2); P.r(11,ground-h,1,h,C.leaf);
        for (let i=0;i<(full?4:3);i++){const side=i%2?1:-1;
          P.leafBlob(12+side*5,ground-4-i*(h/(full?4:3)),7,3,C.leaf);}
        if (full){
          if (crop.id==='sunflower'){
            P.d(12,ground-h-1,5,C.fruit); P.d(12,ground-h-1,3,C.fruit2);
            for (let i=0;i<8;i++){const a=i/8*TAU;
              P.p(Math.round(12+Math.cos(a)*6),Math.round(ground-h-1+Math.sin(a)*6),C.fruit);}
          } else if (crop.id==='corn'){
            P.r(14,ground-h+2,4,8,C.fruit); P.r(14,ground-h+2,1,8,C.fruit2);
            P.r(13,ground-h+1,5,1,C.leaf); P.r(15,ground-h-1,2,2,'#d8b070');
          } else {
            for (let i=0;i<5;i++){ P.d(12,ground-h+i*2-2,2,C.fruit); P.p(11,ground-h+i*2-3,C.fruit2); }
          }
        }
        break;}
      case 'vine':{
        for (let i=0;i<(full?5:3);i++){const x=4+i*4, y=ground-2-((i%2)*3);
          P.leafBlob(x,y,6,4,i%2?C.leaf:C.leaf2);}
        P.r(3,ground,18,1,C.leaf2);
        if (full){
          if (crop.id==='grapes'){
            for (let i=0;i<7;i++){const x=9+((i*3)%7), y=ground-11+Math.floor(i/3)*3;
              P.d(x,y,2,C.fruit);P.p(x-1,y-1,C.fruit2);}
            P.r(12,ground-14,1,4,C.leaf2);
          } else if (crop.id==='squash'){
            P.d(12,ground-2,4,C.fruit); P.d(12,ground-8,3,C.fruit); P.r(9,ground-8,6,6,C.fruit);
            P.p(11,ground-9,C.fruit2); P.p(10,ground-3,C.fruit2); P.r(11,ground-12,2,2,C.leaf2);
          } else {
            P.d(12,ground-3,6,C.fruit); P.d(10,ground-4,3,C.fruit2); P.r(11,ground-10,2,3,C.leaf2);
            if (crop.id==='melon') for (let i=0;i<3;i++) P.r(8+i*4,ground-8,1,10,C.fruit2);
          }
        }
        break;}
      case 'fungus':{
        const caps=full?3:1;
        for (let i=0;i<caps;i++){const x=8+i*5, y=ground-(i===1?6:3);
          P.r(x,y,2,4,C.fruit); P.d(x+1,y,3,C.leaf); P.p(x,y-1,C.fruit2); P.p(x+2,y+1,C.fruit2);}
        break;}
      case 'flower':{
        const h=full?13:9;
        P.r(11,ground-h,2,h,C.leaf2);
        P.leafBlob(7,ground-5,6,3,C.leaf); P.leafBlob(17,ground-8,6,3,C.leaf);
        if (full){
          for (let i=0;i<6;i++){const a=i/6*TAU; P.leafBlob(12+Math.cos(a)*4,ground-h-1+Math.sin(a)*4,5,4,C.fruit);}
          P.d(12,ground-h-1,2,C.fruit2);
        }
        break;}
    }
    if (gold && full){ P.p(4,4,'#fff8c0'); P.p(19,6,'#fff8c0'); P.p(5,14,'#fff8c0'); P.p(20,16,'#fff8c0'); }
  });
}

/* The dog: 16x14 pixel sprite, 2 walk frames, plus a sit pose. */
function dogSprite(frame){
  return sprite('dog'+frame, P => {
    const b='#c8884a', d='#9a6234', l='#f0d0a0', k='#2b2420';
    if (frame===2){ // sitting
      P.r(4,5,7,7,b); P.r(5,11,2,3,b); P.r(9,11,2,3,b);
      P.r(9,1,6,6,b); P.r(13,4,3,2,l); P.p(15,4,k); P.p(12,2,k);
      P.r(9,0,2,3,d); P.r(2,6,2,3,b); P.p(1,5,b);
      P.r(5,8,4,3,l);
      return;
    }
    P.r(2,5,10,5,b);            // body
    P.r(4,8,6,2,l);             // belly
    P.r(10,1,5,5,b);            // head
    P.r(13,4,3,2,l); P.p(15,4,k); // snout + nose
    P.p(12,2,k);                // eye
    P.r(10,0,2,3,d);            // ear
    P.r(0,3,2,2,b); P.p(0,2,b); // tail
    if (frame===0){ P.r(3,10,2,4,d); P.r(9,10,2,4,d); }
    else { P.r(4,10,2,4,d); P.r(8,10,2,4,d); }
  }, 16, 14);
}
