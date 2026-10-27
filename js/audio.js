'use strict';
// ───────── Звук: настоящие записи (Wikimedia Commons) + естественные шумовые эффекты ─────────
// Титры записей — в README и в меню игры.
const SND_FILES = {
  panthoot: 'sounds/chimp_panthoot.ogg', alarm1: 'sounds/chimp_alarm1.oga', alarm2: 'sounds/chimp_alarm2.oga', alarm3: 'sounds/chimp_alarm3.oga',
  bonobo1: 'sounds/bonobo1.ogg', bonobo2: 'sounds/bonobo2.ogg', macaw: 'sounds/macaw.mp3', gong: 'sounds/gong.ogg',
};
const AUD = { buf: {}, loading: false, master: null, noise: null };
function audioCtx() {
  try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); } catch (e) { return null; }
  if (!AUD.master) { AUD.master = AC.createGain(); AUD.master.gain.value = .9; AUD.master.connect(AC.destination); }
  return AC;
}
async function loadSounds() {
  if (AUD.loading || !audioCtx()) return; AUD.loading = true;
  for (const [k, url] of Object.entries(SND_FILES)) {
    try { const r = await fetch(url); const ab = await r.arrayBuffer(); AUD.buf[k] = await AC.decodeAudioData(ab); } catch (e) { /* без файла — останется синтез */ }
  }
}
// громкость и панорама в зависимости от положения источника относительно игрока
function spatial(at, vol) {
  if (!at || !G.me) return { vol, pan: 0 };
  const d = Math.hypot(at.x - G.me.x, at.y - G.me.y), k = clamp(1 - d / 24, 0, 1);
  let pan = 0; try { pan = clamp((SX(at.x, at.y) - VW / 2) / (VW / 2), -1, 1) * .8; } catch (e) { }
  return { vol: vol * k * k, pan };
}
function out(vol, pan) {
  const g = AC.createGain(); g.gain.value = vol;
  if (AC.createStereoPanner) { const p = AC.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(AUD.master); } else g.connect(AUD.master);
  return g;
}
function playBuf(name, o = {}) {
  const ctx = audioCtx(), b = AUD.buf[name]; if (!ctx || !b) return false;
  const { vol, pan } = spatial(o.at, o.vol ?? .7); if (vol < .01) return true;
  const src = ctx.createBufferSource(); src.buffer = b; src.playbackRate.value = (o.rate ?? 1) * (1 + (Math.random() - .5) * (o.vary ?? .08));
  const g = out(vol, pan), dur = o.dur ?? (b.duration - (o.offset || 0)), t = ctx.currentTime;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .03); g.gain.setValueAtTime(vol, t + Math.max(.04, dur / src.playbackRate.value - .25)); g.gain.linearRampToValueAtTime(0, t + dur / src.playbackRate.value);
  src.connect(g); src.start(t, o.offset || 0, dur); return true;
}
// белый шум (общий буфер) — основа для шлепков, брызг, шагов
function noiseBuf() { if (AUD.noise) return AUD.noise; const n = AC.sampleRate, b = AC.createBuffer(1, n, n), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; return AUD.noise = b; }
function noiseHit(o) {
  const ctx = audioCtx(); if (!ctx) return; const { vol, pan } = spatial(o.at, o.vol ?? .4); if (vol < .01) return;
  const t = ctx.currentTime, s = ctx.createBufferSource(); s.buffer = noiseBuf(); s.loop = true;
  const f = ctx.createBiquadFilter(); f.type = o.type || 'lowpass'; f.frequency.setValueAtTime(o.f0 ?? 1200, t); f.frequency.exponentialRampToValueAtTime(Math.max(40, o.f1 ?? 300), t + (o.dur ?? .15)); f.Q.value = o.q ?? .8;
  const g = out(0, pan); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + (o.att ?? .005)); g.gain.exponentialRampToValueAtTime(.0005, t + (o.dur ?? .15));
  s.connect(f); f.connect(g); s.start(t, Math.random()); s.stop(t + (o.dur ?? .15) + .05);
}
function toneHit(o) {
  const ctx = audioCtx(); if (!ctx) return; const { vol, pan } = spatial(o.at, o.vol ?? .3); if (vol < .01) return;
  const t = ctx.currentTime, os = ctx.createOscillator(); os.type = o.wave || 'sine';
  os.frequency.setValueAtTime(o.f0, t); os.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1 ?? o.f0), t + (o.dur ?? .2));
  if (o.vib) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = o.vib; lg.gain.value = o.vibAmt ?? 60; l.connect(lg); lg.connect(os.frequency); l.start(t); l.stop(t + o.dur); }
  const g = out(0, pan); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .01); g.gain.exponentialRampToValueAtTime(.0005, t + (o.dur ?? .2));
  os.connect(g); os.start(t); os.stop(t + (o.dur ?? .2) + .05);
}
// ── «реалистичные» эффекты ──
const SND = {
  scream: at => playBuf('panthoot', { at, offset: rnd(0, 6), dur: 3.2, vol: .85, vary: .1 }) || sfx._hoot(),      // истошный крик шимпанзе
  alarm: at => playBuf(pick(['alarm1', 'alarm2', 'alarm3']), { at, vol: .6 }) || beep(700, .15, 'sawtooth', .03, 300),
  monkey: at => playBuf(pick(['bonobo1', 'bonobo2']), { at, vol: .5, rate: 1.25 }),
  gorilla: at => playBuf(pick(['bonobo1', 'bonobo2']), { at, vol: .9, rate: .5, vary: .05 }) || toneHit({ at, f0: 90, f1: 60, dur: .6, wave: 'sawtooth', vol: .25 }),
  parrot: at => playBuf('macaw', { at, offset: rnd(0, 17), dur: .9, vol: .45 }),
  gong: at => playBuf('gong', { at, vol: .8 }) || toneHit({ at, f0: 180, f1: 170, dur: 2.5, vol: .3 }),
  splat: at => { noiseHit({ at, f0: 900, f1: 120, dur: .18, vol: .55, q: 2 }); toneHit({ at, f0: 140, f1: 55, dur: .12, vol: .25 }); },
  splash: at => { noiseHit({ at, type: 'bandpass', f0: 2600, f1: 500, dur: .45, vol: .45, q: .6, att: .01 }); },
  step: (at, wet) => wet ? noiseHit({ at, type: 'bandpass', f0: 1800, f1: 700, dur: .14, vol: .12 }) : noiseHit({ at, f0: 700, f1: 200, dur: .06, vol: .07 }),
  whoosh: at => noiseHit({ at, type: 'bandpass', f0: 600, f1: 2400, dur: .22, vol: .18, q: 1.2, att: .08 }),
  crunch: at => { for (let i = 0; i < 3; i++) setTimeout(() => noiseHit({ at, type: 'highpass', f0: 2500, f1: 1500, dur: .05, vol: .12 }), i * 70); },
  thud: at => { toneHit({ at, f0: 110, f1: 45, dur: .2, vol: .35 }); noiseHit({ at, f0: 500, f1: 100, dur: .12, vol: .2 }); },
  drum: at => { toneHit({ at, f0: rnd(150, 190), f1: 60, dur: .25, vol: .5 }); noiseHit({ at, f0: 3000, f1: 400, dur: .06, vol: .15 }); },
  whistle: at => toneHit({ at, f0: 2300, f1: 2250, dur: .9, vol: .18, vib: 28, vibAmt: 140 }),
  coin: at => { toneHit({ at, f0: 1568, dur: .25, vol: .15 }); setTimeout(() => toneHit({ at, f0: 2093, dur: .35, vol: .12 }), 70); },
  fart: at => { toneHit({ at, f0: 95, f1: 52, dur: .75, wave: 'sawtooth', vol: .28, vib: 24, vibAmt: 30 }); noiseHit({ at, f0: 420, f1: 90, dur: .7, vol: .22, q: 3, att: .02 }); },
  crowd: at => { noiseHit({ at, type: 'bandpass', f0: 700, f1: 1100, dur: .9, vol: .2, q: 1.5, att: .15 }); },
};
// фоновая жизнь: шаги игрока, переклички обезьян, попугаи
const AMB = { step: 0, chimp: 8, parrotSay: new Map() };
function ambientTick(dt) {
  const me = G.me; if (!me || !AC) return;
  if (me.moving && me.grounded) { AMB.step -= dt; if (AMB.step <= 0) { AMB.step = me.sprint ? .22 : me.crouch ? .5 : .33; SND.step(null, tileKind(me.x, me.y) === K.WATER); } }
  AMB.chimp -= dt;
  if (AMB.chimp <= 0) { AMB.chimp = rnd(12, 28); const c = pick(G.npcs.filter(n => n.sp === 'chimp')); if (c) (Math.random() < .5 ? SND.alarm : SND.scream)({ x: c.x, y: c.y }); }
  for (const n of G.npcs) if (n.sp === 'parrot') { const prev = AMB.parrotSay.get(n); if (n.say && n.sayT > 0 && prev !== n.say) SND.parrot(n); AMB.parrotSay.set(n, n.sayT > 0 ? n.say : ''); }
  const k = G.keeper; if (k) { if (k.state === 'chase' && AMB.kState !== 'chase') SND.whistle(k); AMB.kState = k.state; }
}
// заменяем «пищалки» на естественные звуки там, где это уместно
sfx._hoot = sfx.hoot;
sfx.hoot = () => SND.scream(G.me);
sfx.throw = () => SND.whoosh(null);
sfx.eat = () => SND.crunch(null);
sfx.splash = () => SND.splash(null);
sfx.hit = () => SND.thud(null);
sfx.splat = () => SND.splat(null);
