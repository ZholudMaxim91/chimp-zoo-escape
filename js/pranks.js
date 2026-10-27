'use strict';
// ───────── Шалости: питон, газовая атака, обезьяний бунт, набег на сторожку, шланг ─────────
// Общее (питон, облака, лужи, бунт, смотритель) считает хост; игроки шлют ему свои действия.
const fin = (v, d = 0) => Number.isFinite(+v) ? +v : d;   // сообщения от гостей — не доверяем числам

// ════════ ПИТОН ════════
function newPython(sp, W) {
  const z = groundAt(W, sp.x, sp.y);
  return mk({ sp: 'python', x: sp.x, y: sp.y, z, rz: z, hx: sp.x, hy: sp.y, nx: sp.x, ny: sp.y, nz: z, name: 'Питон', state: 'roam', wait: 0, digestT: 0, stunT: 0, held: null, heldT: 0, hunger: rnd(40, 70), coilT: 0, coilCool: 0, huntT: 0, fly: null, awayT: 0 });
}
const troopOf = () => G.npcs.find(n => n.sp === 'troop');
const pythonOf = () => G.npcs.find(n => n.sp === 'python');
function aiPython(n, dt) {   // хост; true — нужна обычная физика
  if (n.coilCool > 0) n.coilCool -= dt;
  if (n.state === 'away') {
    n.awayT -= dt; if (n.awayT > 0) return false;
    const s = G.W.spawnPython || G.W.spawn; n.x = s.x; n.y = s.y; n.z = n.rz = groundAt(G.W, s.x, s.y); n.state = 'roam'; logEv('🐍', 'Смотритель вернул питона в вольер'); return true;
  }
  if (n.held) {
    const p = livePlayers().find(q => q.netId === n.held);
    n.heldT += dt;
    if (!p || n.heldT > 20) {   // вырвался
      n.held = null; n.state = 'stunned'; n.stunT = 1; if (p) { n.x = p.x + p.dx; n.y = p.y + p.dy; reward(p, { pyDrop: 1, toast: ['🐍 Питон вывернулся из рук и уполз', 'bad'] }); }
      return true;
    }
    n.x = p.x; n.y = p.y; n.z = n.rz = p.z; n.state = 'held'; n.moving = false; return false;
  }
  if (n.fly) {
    const f = n.fly; f.t += dt; const k = clamp(f.t / f.T, 0, 1);
    n.x = lerp(f.sx, f.tx, k); n.y = lerp(f.sy, f.ty, k); n.z = n.rz = lerp(f.sz, groundAt(G.W, f.tx, f.ty), k) + Math.sin(k * Math.PI) * f.T * 3; n.state = 'fly';
    if (k < 1) return false;
    n.fly = null;
    if (n.x < 0 || n.y < 0) {   // улетел через ограду прямо в толпу
      n.state = 'away'; n.awayT = 60;
      for (const v of G.vis) if (v.on && Math.hypot(v.x - n.x, v.y - n.y) < 9) { v.on = false; v.next = rnd(25, 45); v.emo = { t: 2.5, s: 'ЗМЕЯ!!!' }; }
      SND.crowd(n); logEv('🐍', `${f.by ? f.by.name : 'Кто-то'} зашвырнул питона к посетителям!`);
      reward(f.by, { score: 60, cnt: { pyEscapes: 1 }, toast: ['🐍 Питон улетел прямо в толпу! Паника на весь зоопарк! +60', 'good'], sfx: 'up' });
      return false;
    }
    n.x = clamp(n.x, 1, N - 1); n.y = clamp(n.y, 1, N - 1); n.z = n.rz = groundAt(G.W, n.x, n.y);
    n.state = 'stunned'; n.stunT = 3.5; SND.thud(n); emit(n.x, n.y, n.z, 10, { kind: 'dust', spread: 1.4, v0: .5, v1: 2, g: 0, life: .6 });
    pyLand(n, f.by); return false;
  }
  if (n.state === 'stunned') { n.stunT -= dt; n.moving = false; if (n.stunT <= 0) { n.state = 'roam'; n.wait = 0; } return true; }
  if (n.state === 'coil') {
    n.coilT -= dt; const p = livePlayers().find(q => q.netId === n.coilOn);
    if (p) { n.x = p.x; n.y = p.y; n.z = n.rz = p.z; } n.moving = false;
    if (n.coilT <= 0 || !p) { n.state = 'roam'; n.coilCool = 10; n.wait = 2; if (p) { n.x = p.x - n.dx * 1.2; n.y = p.y - n.dy * 1.2; } }
    return false;
  }
  if (n.state === 'digest') { n.digestT -= dt; wander(n, dt, .35, 4); if (n.digestT <= 0) { n.state = 'roam'; n.hunger = rnd(60, 100); } return true; }
  // кто сунулся прямо к морде — того обвивает
  for (const p of livePlayers()) {
    if (p.invuln > 0 || p.tween || p.vine || n.coilCool > 0) continue;
    const dx = p.x - n.x, dy = p.y - n.y, d = Math.hypot(dx, dy);
    if (d < .8 && Math.abs(p.z - n.z) < 1 && (dx * n.dx + dy * n.dy) / (d || 1) > .3) { pyCoil(n, p); return false; }
  }
  const tr = troopOf();
  if (n.state === 'hunt') {
    n.huntT += dt;
    if (!tr || tr.members.length <= 2 || n.huntT > 25) { n.state = 'roam'; n.hunger = rnd(30, 50); return true; }
    if (goTo(n, tr.x, tr.y, dt, tr.fleeT > 0 ? 2.3 : 2.8, { r: .3, noWater: true }) || dist(n, tr) < .9) {
      tr.members.pop(); tr.lostDay = G.day; tr.fleeT = 6; n.state = 'digest'; n.digestT = 50; SND.monkey(tr);
      emit(tr.x, tr.y, tr.z + 1, 12, { kind: 'star', col: [P_.red, P_.white], spread: 1.4, v0: 1, v1: 3, g: 6, life: .8 });
      logEv('🐍', 'Питон поймал и проглотил мартышку! Он отяжелел — самое время хватать за хвост');
      for (const p of livePlayers()) if (dist(p, n) < 16) reward(p, { toast: ['🐍 Питон проглотил мартышку! Он сонный — хватай за хвост (E)', ''] });
    }
    return true;
  }
  n.hunger -= dt;
  if (n.hunger <= 0 && tr && tr.members.length > 2 && dist(n, tr) < 18) { n.state = 'hunt'; n.huntT = 0; logEv('🐍', 'Питон выполз на охоту за мартышками'); return true; }
  n.state = 'roam'; wander(n, dt, 1.1, 10);
  return true;
}
function pyCoil(n, p) {
  n.state = 'coil'; n.coilOn = p.netId; n.coilT = 4; n.held = null;
  hurtPlayer(p, { coil: 4, toast: ['🐍 Питон обвил тебя! Жми ПРОБЕЛ быстро, чтобы вырваться', 'bad'], sfx: 'bad' });
}
function hostPyFree(p) { const n = pythonOf(); if (n && n.state === 'coil' && n.coilOn === p.netId) { n.coilT = 0; reward(p, { score: 15, toast: ['💪 Вырвался из колец питона! +15', 'good'] }); } }
const pyBehind = (n, p) => { const dx = p.x - n.x, dy = p.y - n.y, d = Math.hypot(dx, dy) || 1; return (dx * n.dx + dy * n.dy) / d < -.2; };
const pySleepy = n => n.state === 'digest' || n.state === 'stunned';
function hostPyGrab(p, agi) {
  const n = pythonOf(); if (!n || !p || n.held || n.fly || n.state === 'coil' || n.state === 'away' || dist(n, p) > 2.2) return;
  const ch = pySleepy(n) ? 1 : pyBehind(n, p) ? clamp(.55 + .08 * (fin(agi, 1) - 1), .55, .9) : 0;
  if (Math.random() >= ch) { pyCoil(n, p); return; }
  n.held = p.netId; n.heldT = 0; n.state = 'held'; n.moving = false;
  reward(p, { pyHeld: 1, cnt: { pyGrabs: 1 }, score: 10, toast: ['🐍 Поймал питона за хвост! Держи ЛКМ — раскрутить, отпусти — бросок. E — отпустить', 'good'], sfx: 'up' });
}
function hostPyDrop(p) { const n = pythonOf(); if (n && n.held === p.netId) { n.held = null; n.state = 'stunned'; n.stunT = 1.2; n.x = p.x + p.dx; n.y = p.y + p.dy; n.z = n.rz = groundAt(G.W, n.x, n.y); reward(p, { pyDrop: 1 }); } }
function hostPyThrow(p, tx, ty, T) {
  const n = pythonOf(); if (!n || n.held !== p.netId) return; n.held = null;
  tx = clamp(fin(tx, p.x), -6, N - 1); ty = clamp(fin(ty, p.y), -6, N - 1); T = clamp(fin(T, .8), .4, 2.5);
  if (tx < 0 && ty < 0) ty = 2;   // через угол — не надо
  n.fly = { sx: p.x, sy: p.y, sz: p.z + 1.6, tx, ty, T, t: 0, by: p }; n.state = 'fly';
}
// бросок (держишь ЛКМ — раскручиваешь над головой, отпускаешь — летит)
function throwPython() {
  const me = G.me, sp = G.spin; G.spin = null;
  if (me.act && me.act.type === 'spin') me.act = null;
  if (!G.carryPy) return;
  const ch = sp ? clamp(sp.t / 1.2, .15, 1) : .3, range = 4 + ch * 8 + G.st.str.lv * .8;
  const from = { x: me.x, y: me.y, z: me.z + 1.6 }, sol = solveFrom(from, G.aim, range);
  const tx = from.x + sol.vx * sol.T, ty = from.y + sol.vy * sol.T;
  setFacing(me, tx - me.x, ty - me.y);
  if (isHost()) hostPyThrow(me, tx, ty, sol.T); else NET.send({ t: 'pyThrow', x: tx, y: ty, T: sol.T });
  G.carryPy = false; G.cnt.pyThrows = (G.cnt.pyThrows || 0) + 1; addXp('str'); addXp('agi');
  SND.whoosh(me); SND.scream(me); floater(me.x, me.y, me.z + 3, ch > .8 ? 'ЗМЕЁЙ ПО ЩАМ!' : 'лови питона!', P_.org); addScore(Math.round(5 + ch * 15));
}
// питон упал: всем вокруг — паника (хост)
function pyLand(n, by) {
  const R = 1.6; let hit = 0; const near = e => e && Math.hypot(e.x - n.x, e.y - n.y) < R;
  const k = G.keeper; if (near(k) && k.state !== 'away') { hitByPython(by, 'k', k); hit++; }
  for (const t of G.npcs) if (t !== n && t.sp !== 'parrot' && near(t)) { hitByPython(by, 'n', t); hit++; }
  for (const it of G.intruders) if (it.state === 'wander' && near(it)) { hitByPython(by, 'i', it); hit++; }
  for (const p of livePlayers()) if (p !== by && !(p.invuln > 0) && near(p)) { hitByPython(by, 'p', p); hit++; }
  if (!hit && by) reward(by, { fl: [n.x, n.y, n.z + 2, 'мимо — питон в шоке', P_.d3] });
}
function hitByPython(by, tk, t) {
  const fl = (s, c) => [t.x, t.y, (t.z || 0) + 3, s, c];
  if (tk === 'k') { t.state = 'stunned'; t.stunT = 5; t.target = null; emit(t.x, t.y, t.z + 2, 10, { kind: 'star', col: P_.yel, spread: 1.4, v0: 1, v1: 3, g: 8, life: .9 }); reward(by, { score: 45, cnt: { pyHits: 1 }, toast: ['🐍 Питон обвил смотрителя! 5 секунд он в ужасе', 'good'], fl: fl('А-А-А, ЗМЕЯ!', P_.red), sfx: 'up' }); }
  else if (tk === 'n') {
    if (t.sp === 'chimp') { t.fleeT = 6; t.bond = Math.max(0, (t.bond || 0) - 10); if (t.gang) t.loyal -= 15; }
    else if (t.sp === 'gorilla') { t.rage = 0; t.state = 'idle'; t.fleeT = 4; t.pacified = Math.max(t.pacified || 0, 20); SND.gorilla(t); }
    else t.fleeT = 8;
    reward(by, { score: 15, cnt: { pyHits: 1 }, fl: fl(t.sp === 'gorilla' ? 'горилла визжит!' : 'паника!', P_.org) });
  }
  else if (tk === 'i') { hitIntruder(by, 'tire', t); t.emo = { t: 2, s: 'ЗМЕЯ!!!' }; reward(by, { score: 20, cnt: { pyHits: 1 } }); }
  else if (tk === 'p') { hurtPlayer(t, { stun: 2, fl: fl('ЗМЕЯ НА ГОЛОВЕ!', P_.red), toast: [`🐍 ${by ? by.name : 'Кто-то'} кинул в тебя питоном!`, 'bad'], sfx: 'bad' }); reward(by, { score: 20, cnt: { pyHits: 1 } }); }
}

// ════════ ГАЗОВАЯ АТАКА ════════
function addGas(v) { const was = G.gas || 0; G.gas = clamp(was + v, 0, 100); if (G.gas >= 30 && was < 30) toast('💨 В животе бурлит… Клавиша T — газовая атака', ''); }
function fart() {
  const me = G.me; if (G.state !== 'play' || me.act || me.stun > 0 || me.tween || me.vine) return;
  if ((G.gas || 0) < 30) { toast('Газа маловато — поешь ягод или орехов (' + Math.round(G.gas || 0) + '/30)', 'bad'); return; }
  const power = G.gas; G.gas = 0;
  startAct('fart', .8, () => {
    const r = 1.8 + power / 40, x = me.x - me.dx * .6, y = me.y - me.dy * .6; SND.fart(me);
    floater(me.x, me.y, me.z + 2.5, power > 80 ? 'ГАЗОВАЯ АТАКА!!!' : 'пф-ф-ф-рррр', '#9adf5a');
    if (isHost()) hostFart(me, x, y, r); else NET.send({ t: 'fart', x, y, r });
    G.cnt.farts = (G.cnt.farts || 0) + 1; me.heat = Math.max(me.heat, 2);
  });
}
function hostFart(by, x, y, r) {
  x = clamp(fin(x), 0, N); y = clamp(fin(y), 0, N); r = clamp(fin(r, 2), 1, 4.5);
  if (G.clouds.length > 6) G.clouds.shift();
  G.clouds.push({ id: ++G.pid, x, y, r, t: 9, by: by.netId });
  let fled = 0;
  for (const v of G.vis) if (v.on && Math.hypot(v.x - x, v.y - y) < r + 4) { v.emo = { t: 2.2, s: pick(['ФУУУ!', 'ЧЕМ ВОНЯЕТ?!', 'БЕЖИМ!']) }; if (v.kind !== 'brave' || Math.random() < .5) { v.on = false; v.next = rnd(15, 30); } fled++; }
  for (const n of G.npcs) if (n.sp !== 'python' && n.sp !== 'parrot' && Math.hypot(n.x - x, n.y - y) < r + 1.5) { n.fleeT = 3.5; if (n.sp === 'gorilla') { n.rage = 0; n.state = 'idle'; } }
  for (const p of livePlayers()) if (p !== by && Math.hypot(p.x - x, p.y - y) < r) hurtPlayer(p, { toast: ['💨 Фу! Кто-то пустил газ прямо на тебя', 'bad'] });
  reward(by, { score: 5 + fled * 5, cnt: { scared: fled }, toast: fled ? ['💨 Газовая атака разогнала ' + fled + ' зрителей!', 'good'] : null });
}
function updateClouds(dt) {   // хост: облако дрейфует, смотритель в нём чихает и теряет след
  const k = G.keeper;
  for (let i = G.clouds.length - 1; i >= 0; i--) {
    const c = G.clouds[i]; c.t -= dt; c.x += Math.sin(G.t * .3 + c.id) * dt * .3; c.y += Math.cos(G.t * .2 + c.id) * dt * .3;
    if (c.t <= 0) { G.clouds.splice(i, 1); continue; }
    if (k && Math.hypot(k.x - c.x, k.y - c.y) < c.r && k.state !== 'stunned' && k.state !== 'away' && k.state !== 'sleep' && !(k.sneezeCool > G.t)) {
      k.sneezeCool = G.t + 3.5; const was = k.state; k.state = 'stunned'; k.stunT = 1.8; k.seeT = 0; k.lastSeen = null; k.lost = 99;
      floater(k.x, k.y, k.z + 3.5, 'АПЧХИ!', '#9adf5a'); emit(k.x, k.y, k.z + 2.2, 8, { col: '#bfe89a', spread: 1, v0: 1, v1: 2.5, life: .6 });
      if (was === 'chase') { const by = livePlayers().find(p => p.netId === c.by); reward(by, { score: 15, toast: ['💨 Смотритель расчихался в облаке и потерял тебя!', 'good'] }); }
    }
  }
}

// ════════ ОБЕЗЬЯНИЙ БУНТ ════════
function riot() {
  const me = G.me; if (G.state !== 'play' || me.act || me.stun > 0 || me.tween) return;
  const gang = gangOf(NET.id).length, rk = hoolRank();
  if (gang < 3 || rk < 3) { toast(`Бунт: нужна банда из 3+ обезьян и звание «Задира» (сейчас банда ${gang}, «${HOOL_RANKS[rk].n}»)`, 'bad'); return; }
  if (G.riotDay === G.day) { toast('Бунт можно поднимать раз в день', 'bad'); return; }
  if (!zooOpen()) { toast('Ночью некого пугать — бунт поднимают днём', 'bad'); return; }
  G.riotDay = G.day;
  startAct('hoot', 1, () => { SND.scream(me); setTimeout(() => SND.alarm(me), 250); setTimeout(() => SND.scream(me), 600); if (isHost()) hostRiot(me); else NET.send({ t: 'riot' }); });
}
function hostRiot(p) {
  if (G.riot || !p) return; G.riot = { t: 20, owner: p.netId };
  logEv('🔥', `${p.name} поднял обезьяний бунт!`);
  for (const q of livePlayers()) reward(q, { toast: ['🔥 ОБЕЗЬЯНИЙ БУНТ! 20 секунд хаоса — смотритель в панике', q === p ? 'good' : ''], sfx: 'hoot' });
  reward(p, { score: 50, cnt: { riots: 1 } });
}
function updateRiot(dt) {   // хост
  const R = G.riot; if (!R) return;
  R.t -= dt;
  const owner = livePlayers().find(q => q.netId === R.owner) || G.me;
  const crowd = G.vis.filter(o => o.on && o.a > .5);
  for (const c of G.npcs) {
    if (c.sp !== 'chimp') continue;
    c.goal = null; c.fleeT = 0;
    const v = crowd.length ? crowd.reduce((b, o) => dist(o, c) < dist(b, c) ? o : b) : null;
    if (!v) { c.act = 'hoot'; continue; }
    const tx = v.side === 'n' ? clamp(v.x, 2, N - 2) : 2.5, ty = v.side === 'n' ? 2.5 : clamp(v.y, 2, N - 2);
    if (Math.hypot(tx - c.x, ty - c.y) > 5) { goTo(c, tx, ty, dt, 3.6, { noWater: true }); c.act = null; }
    else {
      c.moving = false; c.riotT = (c.riotT ?? rnd(0, 1)) - dt; c.act = c.riotT > .5 ? 'hoot' : 'throw';
      if (c.riotT <= 0) {
        c.riotT = rnd(1.4, 2.2); const from = { x: c.x, y: c.y, z: c.z + 1.3 }, sol = solveFrom(from, { x: v.x, y: v.y, z: 1 }, 16);
        setFacing(c, v.x - c.x, v.y - c.y); spawnProj('poop', owner, sol, false, from); const q = G.proj[G.proj.length - 1]; q.gang = true; q.src = c; q.riot = true;
        if (isNet()) NET.bcast({ t: 'proj', k: 'poop', x: from.x, y: from.y, z: from.z, vx: sol.vx, vy: sol.vy, vz: sol.vz });
      }
    }
    if (Math.random() < dt * .25) SND.alarm(c);
  }
  if (R.t <= 0) {
    G.riot = null; const k = G.keeper; if (k.state === 'panic') { k.state = 'patrol'; k.wait = 1; k.panC = null; } k.speedP = Math.min(3.2, k.speedP * 1.12);
    G.npcs.forEach(c => { if (c.sp === 'chimp') { c.act = null; c.goal = null; c.riotT = undefined; } });
    logEv('🔥', 'Бунт утих. Смотритель зол и ходит быстрее');
  }
}
function riotHit(q, tk, idx) {   // хост: попадание бунтаря — зрелище, но очков немного
  const by = q.owner, v = tk === 'v' ? G.vis[idx] : null;
  if (v) { v.splat = 30; v.emo = { t: 1.8, s: pick(['ФУ!', 'АААА!', 'ОНИ ВЗБЕСИЛИСЬ!']) }; if (v.kind !== 'brave' && Math.random() < .35) { v.on = false; v.next = rnd(20, 40); } reward(by, { score: 3, cnt: { gangHits: 1 } }); }
  projLand(q, true);
}
function keeperPanic(k, dt) {   // хост: смотритель бегает кругами и машет руками
  k.panA = (k.panA || 0) + dt * 1.8; if (!k.panC) k.panC = { x: k.x, y: k.y };
  goTo(k, k.panC.x + Math.cos(k.panA) * 2.2, k.panC.y + Math.sin(k.panA) * 2.2, dt, 3.4, { r: .3 });
  if (Math.random() < dt * .6) floater(k.x, k.y, k.z + 3.5, pick(['ПОМОГИТЕ!', 'А-А-А!', 'ПРЕКРАТИТЕ!']), P_.red);
}

// ════════ НАБЕГ НА СТОРОЖКУ (смотритель спит) ════════
const RAID = [
  { id: 'cap', ok: k => !k.noCap, text: '🧢 Стащить фуражку (в ней смотритель издали принимает тебя за своего)' },
  { id: 'whistle', ok: k => !k.noWhistle, text: '📯 Стащить свисток (Z — свистнуть, смотритель бежит на звук)' },
  { id: 'mustache', ok: k => !k.mustache, need: 'poop', text: '🥸 Нарисовать смотрителю усы (1 заряд 💩)' },
  { id: 'lunch', ok: k => !k.sickNext && !(k.sick > 0), need: 'poop', text: '🍱 Подменить ему обед на «сюрприз» (1 заряд 💩)' },
];
const raidOption = k => RAID.find(r => r.ok(k));
function raidWake() { return clamp(.3 - .04 * (G.st.agi.lv - 1) - (G.me.crouch ? .12 : 0), .05, .3); }
function doRaid(r) {
  const me = G.me; if (r.need === 'poop' && G.inv.poop < 1) { toast('Нужен заряд 💩', 'bad'); return; }
  startAct('dig', 1.4, () => {
    if (r.need === 'poop') G.inv.poop--;
    const msg = { t: 'raid', what: r.id, agi: G.st.agi.lv, cr: me.crouch ? 1 : 0 };
    if (isHost()) hostRaid(me, msg); else NET.send(msg);
  });
}
function hostRaid(p, m) {
  const k = G.keeper; if (!p || k.state !== 'sleep' || dist(k, p) > 2.5) return;
  const wake = clamp(.3 - .04 * (fin(m.agi, 1) - 1) - (m.cr ? .12 : 0), .05, .3);
  if (Math.random() < wake) { k.state = 'chase'; k.chasing = p.netId; k.lost = 0; floater(k.x, k.y, k.z + 3, 'ЧТО?! КТО ТУТ?!', P_.red); reward(p, { toast: ['😱 Смотритель проснулся! БЕГИ!', 'bad'], sfx: 'bad' }); return; }
  const R = {
    cap: () => { k.noCap = true; k.speedP = Math.min(3.2, k.speedP * 1.08); reward(p, { score: 25, cnt: { raids: 1 }, wearCap: 1, toast: ['🧢 Фуражка смотрителя теперь твоя! Издали он примет тебя за своего', 'good'], sfx: 'up' }); },
    whistle: () => { k.noWhistle = true; reward(p, { score: 20, cnt: { raids: 1 }, item: 'whistle', toast: ['📯 Свисток у тебя! Z — свистнуть (смотритель побежит на звук)', 'good'], sfx: 'up' }); },
    mustache: () => { k.mustache = G.day + 1; reward(p, { score: 30, cnt: { raids: 1 }, toast: ['🥸 Смотритель с усами! Завтра публика будет хохотать, а он — злиться', 'good'], sfx: 'up' }); },
    lunch: () => { k.sickNext = true; reward(p, { score: 30, cnt: { raids: 1 }, toast: ['🍱 Обед «заряжен». Днём смотрителю станет очень плохо…', 'good'], sfx: 'up' }); },
  };
  const r = RAID.find(r => r.id === m.what); if (r && r.ok(k)) { R[r.id](); logEv('🌙', `${p.name} похозяйничал в сторожке`); }
}
function blowWhistle() {
  const me = G.me; if (!G.inv.whistle || G.state !== 'play') return;
  if ((G.whistleCool || 0) > G.t) { toast('Дыхание сбилось — свистнуть можно через ' + Math.ceil(G.whistleCool - G.t) + ' с', 'bad'); return; }
  G.whistleCool = G.t + 8;
  SND.whistle(me); floater(me.x, me.y, me.z + 3, 'ФЬЮ-Ю-ИТЬ!', P_.white);
  const tx = clamp(G.aim.x, 1, N - 1), ty = clamp(G.aim.y, 1, N - 1);   // свист «бросаем» туда, куда целишься
  if (isHost()) hostWhistle(me, tx, ty); else NET.send({ t: 'whistle', x: tx, y: ty });
}
function hostWhistle(p, x, y) {
  const k = G.keeper; if (k.state !== 'chase' && k.state !== 'patrol' && k.state !== 'suspicious') return;
  k.state = 'suspicious'; k.target = { x: clamp(fin(x), 1, N - 1), y: clamp(fin(y), 1, N - 1) }; k.lookT = 0; k.lost = 0; k.seeT = 0;
  floater(k.x, k.y, k.z + 3.5, 'Кто свистел?!', P_.yel); reward(p, { score: 5, cnt: { whistles: 1 } });
}
function keeperDay(k, dt) {   // хост: последствия ночного набега; true — смотритель «занят»
  if (k.mustache && G.day > k.mustache) { k.mustache = 0; logEv('🧼', 'Смотритель наконец отмыл усы'); }
  if (k.sickNext && !isNight() && dayPhase() > .4) {
    k.sickNext = false; k.sick = 60; k.state = 'away'; k.moving = false;
    logEv('🚽', 'Смотритель пообедал — и умчался в туалет!');
    for (const p of livePlayers()) reward(p, { toast: ['🚽 Смотритель умчался в туалет! Минута свободы!', 'good'] });
  }
  if (k.state === 'away') {
    k.sick -= dt; k.moving = false;
    if (k.sick <= 0) { const d = hutDoor(G.W); k.x = d.x; k.y = d.y; k.z = k.rz = groundAt(G.W, d.x, d.y); k.state = 'patrol'; k.wait = 2; k.speedP = Math.min(3.2, k.speedP * 1.1); logEv('🚽', 'Смотритель вернулся — бледный и очень злой'); }
    return true;
  }
  if (k.mustache && zooOpen() && Math.random() < dt * .7) {   // публика хохочет над усами
    const v = G.vis.filter(o => o.on && Math.hypot(o.x - k.x, o.y - k.y) < 12); if (v.length) { const o = pick(v); o.cheer = 1.5; o.emo = { t: 1.6, s: pick(['ХА-ХА, УСЫ!', 'Красавчик!', 'ЛОЛ']) }; }
  }
  return false;
}

// ════════ ШЛАНГ ════════
function takeHose(o) { G.hose = o; toast('🚿 Шланг в руках: держи ЛКМ — струя. E — бросить. Дальше 11 клеток от катушки не уйти', 'good'); sfx.ok(); }
function dropHose() { G.hose = null; G.spraying = false; if (G.me.act && G.me.act.type === 'hose') G.me.act = null; }
function updateHose(dt) {
  const me = G.me, o = G.hose; if (!o) return;
  if (dist(me, o) > 11 || me.vine || me.stun > 0) { if (dist(me, o) > 11) toast('Шланг вырвался из рук — слишком далеко от катушки', 'bad'); dropHose(); return; }
  if (!G.spraying) { if (me.act && me.act.type === 'hose') me.act = null; return; }
  if (me.act && me.act.type !== 'hose') return;
  if (!me.act) me.act = { type: 'hose', t: 0, dur: 0, done: null };
  setFacing(me, G.aim.x - me.x, G.aim.y - me.y);
  G.hoseT = (G.hoseT || 0) - dt;
  if (G.hoseT > 0) return;
  G.hoseT = .06; const from = { x: me.x + me.dx * .5, y: me.y + me.dy * .5, z: me.z + .9 };
  const sol = solveFrom(from, { x: G.aim.x + rnd(-.25, .25), y: G.aim.y + rnd(-.25, .25), z: G.aim.z }, 10);
  spawnProj('hose', me, sol, false, from);
  if (isNet() && Math.random() < .3) { const m = { t: 'proj', k: 'hose', x: from.x, y: from.y, z: from.z, vx: sol.vx, vy: sol.vy, vz: sol.vz }; if (isHost()) NET.bcast(m); else NET.send(m); }
  if (Math.random() < .3) SND.step(me, true);
}
function addWet(x, y) {
  x = fin(x, -1); y = fin(y, -1); if (x < .5 || y < .5 || x > N - .5 || y > N - .5) return;
  const w = G.wet.find(w => Math.hypot(w.x - x, w.y - y) < 1); if (w) { w.t = 40; w.r = Math.min(1.6, w.r + .04); return; }
  if (G.wet.length < 40) G.wet.push({ x, y, r: .6, t: 40 });
}
function netWet(x, y) { if (isHost()) addWet(x, y); else if (G.wetQ.length < 60) G.wetQ.push([Math.round(x * 10) / 10, Math.round(y * 10) / 10]); }
function updateWet(dt) {   // хост: лужи сохнут; кто бежит по ним — скользит
  for (let i = G.wet.length - 1; i >= 0; i--) { G.wet[i].t -= dt; if (G.wet[i].t <= 0) G.wet.splice(i, 1); }
  const onWet = e => G.wet.some(w => Math.hypot(w.x - e.x, w.y - e.y) < w.r);
  const k = G.keeper;
  if (k && k.moving && (k.state === 'chase' || k.state === 'patrol' || k.state === 'suspicious') && !(k.slipCool > G.t) && onWet(k)) {
    k.slipCool = G.t + 5; k.state = 'stunned'; k.stunT = 2; floater(k.x, k.y, k.z + 3, 'ПОСКОЛЬЗНУЛСЯ!', P_.w3); SND.splash(k); logEv('💦', 'Смотритель поскользнулся на мокрой траве');
  }
  for (const n of G.npcs) if (n.sp === 'gorilla' && n.state === 'chase' && !(n.slipCool > G.t) && onWet(n)) { n.slipCool = G.t + 6; n.rage = 0; n.state = 'idle'; floater(n.x, n.y, n.z + 3, 'шлёп!', P_.w3); }
}
function hoseHitVisitor(by, v) {
  if ((v.hoseT || 0) > G.t) return; v.hoseT = G.t + 2;
  const hat = (v.hat === 0 || v.hat === 1) && !(v.hatOff > G.t);
  if (hat) v.hatOff = G.t + 90;
  v.emo = { t: 2, s: hat ? 'МОЯ ШЛЯПА!' : pick(['БРР!', 'МОКРО!', 'ЭЙ!']) }; v.splat = 0; if (v.kind === 'coward' || Math.random() < .3) { v.on = false; v.next = rnd(15, 30); }
  reward(by, { score: hat ? 12 : 4, cnt: { soaks: 1 }, fl: [v.x, v.y, 3, hat ? 'шляпа слетела! +12' : '+4 мокрый', P_.w3] });
}
function hoseHitKeeper(by, k) {
  if ((k.soakT || 0) > G.t) return; k.soakT = G.t + 4;
  const cap = !k.noCap && !(k.capOff > G.t); if (cap) k.capOff = G.t + 20;
  if (k.state !== 'stunned' && k.state !== 'away') { k.state = 'stunned'; k.stunT = 1.3; }
  reward(by, { score: cap ? 20 : 10, cnt: { soaks: 1 }, heat: 4, fl: [k.x, k.y, k.z + 3, cap ? 'ФУРАЖКА В ЛУЖЕ! +20' : 'ПРОМОК! +10', P_.w3] });
}
function hoseHitNpc(by, n) {
  if ((n.hoseT || 0) > G.t) return; n.hoseT = G.t + 3;
  if (n.sp === 'gorilla') { n.rage = 0; n.state = 'idle'; } if (n.sp === 'parrot') n.perch = 0;
  n.fleeT = 3; reward(by, { score: 3, cnt: { soaks: 1 }, fl: [n.x, n.y, n.z + 2, 'брызь!', P_.w3] });
}
function hoseHitPlayer(by, p) {
  if ((p.hoseT || 0) > G.t) return; p.hoseT = G.t + 1.5;
  hurtPlayer(p, { wash: 1, toast: [`🚿 ${by ? by.name : 'Кто-то'} окатил тебя из шланга (заодно отмыл)`, ''] }); reward(by, { score: 3, cnt: { soaks: 1 } });
}

// ════════ общий такт хоста ════════
function pranksTick(dt) {
  updateClouds(dt); updateWet(dt); updateRiot(dt);
  const tr = troopOf();   // стая восстанавливается через два дня
  if (tr && tr.members.length < 5 && G.day >= (tr.lostDay || 0) + 2) { tr.members.push({ ox: 0, oy: 0, ph: Math.random() * 6 }); tr.lostDay = G.day; logEv('🐒', 'В стае мартышек пополнение'); }
}
