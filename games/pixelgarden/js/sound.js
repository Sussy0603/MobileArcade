'use strict';
/* Small synth sound effects — no audio files needed. */
const Snd = (() => {
  let ac = null, on = true, paused = false;
  function ctx(){
    if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch(e){ ac = null; } }
    if (ac && ac.state === 'suspended' && !paused) ac.resume().catch(()=>{});
    return ac;
  }
  function tone(f, d, type, vol, f2, delay){
    const a = ctx(); if (!a || !on || paused) return;
    const t0 = a.currentTime + (delay||0);
    const o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f, t0);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + d);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.12, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    o.connect(g); g.connect(a.destination);
    o.start(t0); o.stop(t0 + d + 0.02);
  }
  function noise(d, vol, freq, delay){
    const a = ctx(); if (!a || !on || paused) return;
    const t0 = a.currentTime + (delay||0);
    const len = Math.floor(a.sampleRate * d);
    const b = a.createBuffer(1, len, a.sampleRate), ch = b.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = (Math.random()*2-1) * (1 - i/len);
    const s = a.createBufferSource(); s.buffer = b;
    const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq || 1800; f.Q.value = 0.8;
    const g = a.createGain(); g.gain.value = vol || 0.15;
    s.connect(f); f.connect(g); g.connect(a.destination); s.start(t0);
  }
  const fx = {
    click:  () => tone(900, 0.04, 'triangle', 0.05),
    plant:  () => { tone(220, 0.12, 'sine', 0.16, 140); noise(0.08, 0.06, 600); },
    water:  () => { noise(0.28, 0.12, 2400); tone(700, 0.1, 'sine', 0.04, 1200, 0.05); },
    harvest:() => { tone(520, 0.08, 'triangle', 0.12); tone(780, 0.12, 'triangle', 0.12, null, 0.07); },
    coin:   () => { tone(1320, 0.07, 'square', 0.05); tone(1760, 0.16, 'square', 0.05, null, 0.06); },
    buy:    () => { tone(660, 0.08, 'triangle', 0.1); tone(880, 0.08, 'triangle', 0.1, null, 0.07); tone(1100, 0.14, 'triangle', 0.1, null, 0.14); },
    level:  () => [523,659,784,1047].forEach((f,i) => tone(f, 0.22, 'triangle', 0.12, null, i*0.1)),
    golden: () => [1047,1319,1568,2093,1568,2093].forEach((f,i) => tone(f, 0.14, 'sine', 0.09, null, i*0.06)),
    crow:   () => { tone(520, 0.18, 'sawtooth', 0.06, 380); tone(500, 0.2, 'sawtooth', 0.06, 340, 0.22); },
    bark:   () => { tone(330, 0.07, 'square', 0.08, 220); tone(360, 0.08, 'square', 0.08, 240, 0.13); },
    err:    () => tone(160, 0.14, 'square', 0.05, 120),
    cook:   () => { noise(0.35, 0.05, 900); tone(440, 0.1, 'triangle', 0.06, 520); },
    ding:   () => { tone(1568, 0.3, 'sine', 0.1); tone(2093, 0.4, 'sine', 0.06, null, 0.05); },
    achieve:() => [784,988,1175,1568].forEach((f,i) => tone(f, 0.18, 'square', 0.05, null, i*0.08)),
    open:   () => tone(600, 0.06, 'sine', 0.06, 800)
  };
  return {
    play(k){ try { fx[k] && fx[k](); } catch(e){} },
    set(v){ on = !!v; },
    pause(p){ paused = p; if (ac) { try { p ? ac.suspend() : ac.resume(); } catch(e){} } },
    unlock(){ ctx(); }
  };
})();
