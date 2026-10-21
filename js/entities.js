'use strict';
// ───────── Существа: физика, ИИ животных и смотрителя, снаряды, подбираемое ─────────
// Сетевая модель: хост считает ИИ и всё «общее» (животные, смотритель, зрители, предметы на земле).
// Игроки считают сами себя. Награды за действия приходят тому, кто их заслужил (reward / hurtPlayer).
const GRAV = 16, GP = 12;           // гравитация для прыжков и для брошенных предметов (ярусов/с²)
const STEP = 1.02;                  // на сколько ярусов можно «шагнуть» вверх без прыжка

function walkableAt(W, x, y, z, r = .28, step = STEP, noWater = false, gateOk = false) {
  for (const [px, py] of [[x - r, y - r], [x + r, y - r], [x - r, y + r], [x + r, y + r]]) {
    const tx = Math.floor(px), ty = Math.floor(py);
    if (tx < 0 || ty < 0 || tx >= N || ty >= N) {
      if (gateOk && G.gateOpen && tx >= N && tx < N + 5 && ty >= W.gate.y - 1 && ty <= W.gate.y + 1) continue;
      return false;
    }
    const i = ty * N + tx;
    if (W.blocked[i]) return false;
    if (noWater && W.kind[i] === K.WATER) return false;
    if (W.h[i] > z + step) return false;
  }
  return true;
}
function setFacing(e, dx, dy) {
  const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l; e.dx = dx; e.dy = dy;
  const sxn = dx - dy, syn = dx + dy;
  if (Math.abs(sxn) > .05) e.fx = sxn > 0 ? 1 : -1; if (Math.abs(syn) > .05) e.fb = syn > 0;
}
function stepEntity(e, dx, dy, dt, speed, o = {}) {
  const W = G.W, sp = speed * dt, r = o.r ?? .28;
  let moved = false;
  const nx = e.x + dx * sp, ny = e.y + dy * sp;
  if (walkableAt(W, nx, e.y, e.z, r, STEP, o.noWater, o.gateOk)) { e.x = nx; moved = true; }
  if (walkableAt(W, e.x, ny, e.z, r, STEP, o.noWater, o.gateOk)) { e.y = ny; moved = true; }
  e.moving = moved; if (moved) setFacing(e, dx, dy);
  return moved;
}
function physics(e, dt) {
  if (e.tween) return;
  const W = G.W, gh = groundAt(W, e.x, e.y);
  if (e.vz > 0 || e.z > gh + 1e-3) {
    e.vz -= GRAV * dt; e.z += e.vz * dt; e.grounded = false;
    if (e.z <= gh && e.vz <= 0) { const hard = -e.vz; e.z = gh; e.vz = 0; e.grounded = true; if (e.onLand) e.onLand(hard); }
  } else { e.z = gh; e.grounded = true; e.vz = 0; }
  e.rz += (e.z - e.rz) * Math.min(1, dt * (e.z < e.rz ? 22 : 16));
  if (Math.abs(e.rz - e.z) < .02) e.rz = e.z;
}
const mk = o => Object.assign({ x: 0, y: 0, z: 0, rz: 0, vz: 0, grounded: true, fx: 1, fb: true, moving: false, dx: 1, dy: 0, t: 0 }, o);
function tileFree(x, y, noWater = true) { const W = G.W, tx = Math.floor(x), ty = Math.floor(y); return tx > 0 && ty > 0 && tx < N - 1 && ty < N - 1 && !W.blocked[ty * N + tx] && (!noWater || W.kind[ty * N + tx] !== K.WATER); }
function randomNear(e, r, tries = 12) { for (let i = 0; i < tries; i++) { const a = rnd(0, 6.28), d = rnd(2, r), x = e.hx + Math.cos(a) * d, y = e.hy + Math.sin(a) * d; if (tileFree(x, y) && Math.abs(groundAt(G.W, x, y) - e.z) <= 1.01) return { x, y }; } return null; }
function goTo(e, tx, ty, dt, speed, o = {}) { const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy); if (d < .15) { e.moving = false; return true; } stepEntity(e, dx / d, dy / d, dt, speed, o); return false; }
function wander(e, dt, speed, radius) {
  if (e.wait > 0) { e.wait -= dt; e.moving = false; return; }
  if (!e.target) { e.target = randomNear(e, radius); if (!e.target) { e.wait = 1; return; } e.stuck = 0; }
  const px = e.x, py = e.y, arrived = goTo(e, e.target.x, e.target.y, dt, speed, { noWater: true });
  e.stuck = (Math.abs(e.x - px) + Math.abs(e.y - py) < .001) ? (e.stuck || 0) + dt : 0;
  if (arrived || e.stuck > 1) { e.target = null; e.wait = rnd(1, 4); }
}
function nearestPickup(e, type, r) { let b = null, bd = r; for (const p of G.pickups) if (p.type === type && !p.fly) { const d = dist(e, p); if (d < bd) { b = p; bd = d; } } return b; }

// ───────── Игроки (свой и чужие) ─────────
const livePlayers = () => G.players.filter(p => !p.gone);
function nearestPlayer(e, pred) { let b = null, bd = 1e9; for (const p of livePlayers()) { if (pred && !pred(p)) continue; const d = Math.hypot(p.x - e.x, p.y - e.y); if (d < bd) { bd = d; b = p; } } return b; }
const bananasOf = p => p.me ? G.inv.banana : (p.bn || 0);
// награда игроку: свой — применяем сразу, чужой — шлём ему по сети
function reward(by, r) { if (!by || by.me) applyReward(r); else NET.sendTo(by.netId, { t: 'ev', ev: 'reward', r }); }
function hurtPlayer(p, h) { if (p.me) applyHurt(h); else NET.sendTo(p.netId, { t: 'ev', ev: 'hurt', h }); }

function newPlayer(W, name, fur) {
  return mk({ me: true, netId: NET.id, name, fur, x: W.spawn.x, y: W.spawn.y, z: 0, stun: 0, crouch: false, sprint: false, act: null, tween: null, heat: 0, invuln: 0, hootCool: 0, jumpHeld: false });
}
function mkRemote(id, name, furId) {
  const W = G.W;
  return mk({ me: false, netId: id, name, fur: FUR[furId] || FUR.brown, x: W.spawn.x, y: W.spawn.y, tx: W.spawn.x, ty: W.spawn.y, tz: 0, z: 0, rz: 0, crouch: false, sprint: false, act: null, heat: 0, bn: 0, lv: 4, score: 0, tween: null, stun: 0 });
}
function updateRemotes(dt) {
  const k = 1 - Math.exp(-dt * 12);
  for (const p of G.players) {
    if (p.me) continue;
    if (Math.hypot(p.tx - p.x, p.ty - p.y) > 6) { p.x = p.tx; p.y = p.ty; } else { p.x += (p.tx - p.x) * k; p.y += (p.ty - p.y) * k; }
    p.z = p.tz; p.rz += (p.tz - p.rz) * Math.min(1, dt * 14); if (p.heat > 0) p.heat -= dt;
  }
}
function updatePlayer(p, dt) {
  const W = G.W, K_ = G.keys;
  if (p.stun > 0) p.stun -= dt; if (p.heat > 0) p.heat -= dt; if (p.hootCool > 0) p.hootCool -= dt; if (p.invuln > 0) p.invuln -= dt;
  if (p.tween) { updateTween(p, dt); return; }
  let dx = 0, dy = 0;
  if (!p.act && !G.mini && p.stun <= 0) {
    if (K_.has('KeyW') || K_.has('ArrowUp')) { dx--; dy--; }
    if (K_.has('KeyS') || K_.has('ArrowDown')) { dx++; dy++; }
    if (K_.has('KeyA') || K_.has('ArrowLeft')) { dx--; dy++; }
    if (K_.has('KeyD') || K_.has('ArrowRight')) { dx++; dy--; }
  }
  const want = dx || dy;
  p.crouch = K_.has('KeyC') || K_.has('ControlLeft');
  p.sprint = (K_.has('ShiftLeft') || K_.has('ShiftRight')) && G.energy > 3 && !p.crouch && want;
  if (want) {
    const l = Math.hypot(dx, dy); dx /= l; dy /= l;
    let sp = (p.crouch ? 1.7 : p.sprint ? 5.0 : 3.1) + .22 * (G.st.agi.lv - 1) * (p.crouch ? .5 : 1);
    if (G.energy <= 0) sp *= .55;
    const gh = groundAt(W, p.x, p.y); if (W.kind[Math.floor(p.y) * N + Math.floor(p.x)] === K.WATER && p.grounded) { sp *= .6; if (Math.random() < .08) { emit(p.x, p.y, gh, 3, { col: P_.w3, spread: 1.2, v0: 1, v1: 3 }); } }
    stepEntity(p, dx, dy, dt, sp, { gateOk: true });
    G.tutDist += sp * dt * (p.moving ? 1 : 0); if (p.sprint) G.cnt.sprintT += dt;
    G.dustT -= dt; if (p.moving && p.grounded && G.dustT <= 0) { G.dustT = p.sprint ? .08 : .17; emit(p.x, p.y, p.z, 1, { kind: 'dust', spread: .4, v0: .3, v1: 1, g: 0, life: .5 }); }
  } else p.moving = false;
  physics(p, dt);
  if (K_.has('Space') && p.grounded && !p.act && !G.mini && p.stun <= 0 && !p.jumpHeld) { p.vz = 7.4 + .5 * (G.st.agi.lv - 1); p.grounded = false; p.jumpHeld = true; G.cnt.jumps++; sfx.jump(); emit(p.x, p.y, p.z, 4, { kind: 'dust', spread: .8, v0: .2, v1: 1, g: 0, life: .5 }); }
  if (!K_.has('Space')) p.jumpHeld = false;
  p.onLand = hard => { if (hard > 4) { emit(p.x, p.y, p.z, 5, { kind: 'dust', spread: 1, v0: .3, v1: 1, g: 0, life: .5 }); if (W.kind[Math.floor(p.y) * N + Math.floor(p.x)] === K.WATER) sfx.splash(); } };
  G.energy = clamp(G.energy - (p.sprint ? 1.3 : p.moving ? .35 : .12) * dt, 0, 100);
}
function updateTween(p, dt) {
  const t = p.tween; t.t += dt; const k = clamp(t.t / t.dur, 0, 1), e = k * k * (3 - 2 * k);
  p.x = lerp(t.from.x, t.to.x, e); p.y = lerp(t.from.y, t.to.y, e);
  p.z = lerp(t.from.z, t.to.z, e) + (t.arc ? Math.sin(k * Math.PI) * t.arc : 0); p.rz = p.z; p.grounded = false; p.moving = false;
  if (k >= 1) { p.tween = null; p.z = t.to.z; p.vz = 0; p.grounded = true; p.rz = p.z; if (t.done) t.done(); }
}
function startTween(p, to, dur, arc, done) { p.tween = { t: 0, dur, from: { x: p.x, y: p.y, z: p.z }, to, arc, done }; setFacing(p, to.x - p.x, to.y - p.y); }

// ───────── Смотритель (считает хост) ─────────
function newKeeper(W) {
  const w = W.wps[0] || { x: 10, y: 10 };
  return mk({ x: w.x, y: w.y, z: groundAt(W, w.x, w.y), rz: groundAt(W, w.x, w.y), state: 'patrol', wp: 0, wait: 1, hasKey: true, stunT: 0, seeT: 0, lost: 0, target: null, lookT: 0, cool: 0, visRange: 8, speedP: 2.0, lastSeen: null });
}
function keeperSees(k, p) {
  const d = Math.hypot(p.x - k.x, p.y - k.y);
  let range = 8.5; if (p.crouch) range *= .5; else if (p.sprint) range *= 1.3;
  if (Math.abs(p.z - k.z) > 2.6) range *= .45;
  if (d > range) return false;
  if (d < 1.8) return true;
  const ang = Math.atan2(p.y - k.y, p.x - k.x), kf = Math.atan2(k.dy, k.dx); let da = Math.abs(ang - kf); da = Math.min(da, Math.PI * 2 - da);
  return da < .85;
}
function alertKeeper(k, x, y, why) { if (k.state === 'stunned' || k.state === 'chase') return; k.state = 'suspicious'; k.target = { x, y }; k.lookT = 0; k.suspWhy = why; }
function updateKeeper(k, dt) {
  const W = G.W, players = livePlayers().filter(p => !p.tween); if (!players.length) return;
  if (k.cool > 0) k.cool -= dt;
  const first = players[0]; k.visRange = first.crouch ? 4.2 : first.sprint ? 11 : 8.5;
  if (k.state === 'stunned') { k.stunT -= dt; k.moving = false; physics(k, dt); if (k.stunT <= 0) { k.state = 'suspicious'; k.target = { x: first.x, y: first.y }; k.lookT = 0; } return; }
  // кого видит: приоритет у шумящих (heat), у владельца ключа, потом у ближайшего
  let seen = null, best = -1;
  for (const p of players) if (keeperSees(k, p)) { const sc = (p.heat > 0 ? 3 : 0) + (G.keyHolder === p.netId ? 4 : 0) + 1 / (dist(k, p) + .5); if (sc > best) { best = sc; seen = p; } }
  const sees = !!seen;
  if (sees) {
    k.seeT += dt; k.lastSeen = { x: seen.x, y: seen.y }; const dd = dist(k, seen), carrying = G.keyHolder === seen.netId;
    if ((seen.heat > 0 || carrying || dd < 2.2 || (k.seeT > 3 && dd < 6)) && k.state !== 'chase') {
      k.state = 'chase'; k.lost = 0; k.chasing = seen.netId;
      if (seen.me) { sfx.bad(); toast('Смотритель заметил тебя!', 'bad'); } else NET.sendTo(seen.netId, { t: 'ev', ev: 'alarm' });
    } else if (k.state === 'patrol') { k.state = 'suspicious'; k.target = { x: seen.x, y: seen.y }; k.lookT = 0; }
  } else { k.seeT = Math.max(0, k.seeT - dt * 2); }
  if (k.state === 'chase') {
    const tgt = seen || players.find(p => p.netId === k.chasing) || players[0];
    if (!sees) { k.lost += dt; if (k.lost > 4 || dist(k, tgt) > 16) { k.state = 'suspicious'; k.target = k.lastSeen || { x: k.x, y: k.y }; k.lookT = 0; } } else k.lost = 0;
    const tp = sees ? tgt : (k.lastSeen || tgt); goTo(k, tp.x, tp.y, dt, 3.8 + (G.keyHolder ? .3 : 0), { r: .3 });
    if (sees && dist(k, tgt) < .9 && Math.abs(k.z - tgt.z) < 1.5) caught(k, tgt);
  } else if (k.state === 'suspicious') {
    if (k.target && goTo(k, k.target.x, k.target.y, dt, 2.5)) { k.moving = false; k.lookT += dt; const a = Math.atan2(k.dy, k.dx) + dt * 2.2; setFacing(k, Math.cos(a), Math.sin(a)); if (k.lookT > 2.6) { k.state = 'patrol'; k.target = null; let b = 0, bd = 1e9; W.wps.forEach((w, i) => { const d = Math.hypot(w.x - k.x, w.y - k.y); if (d < bd) { bd = d; b = i; } }); k.wp = b; k.wait = .5; } }
    else if (!k.target) k.state = 'patrol';
  } else { // patrol
    if (k.wait > 0) { k.wait -= dt; k.moving = false; const a = Math.atan2(k.dy, k.dx) + Math.sin(G.t * .9) * dt * .8; setFacing(k, Math.cos(a), Math.sin(a)); }
    else { const w = W.wps[k.wp]; if (!w) return; const px = k.x, py = k.y; if (goTo(k, w.x, w.y, dt, k.speedP)) { k.wp = (k.wp + 1) % W.wps.length; k.wait = rnd(1, 2.5); } k.stuck = Math.abs(k.x - px) + Math.abs(k.y - py) < .001 ? (k.stuck || 0) + dt : 0; if (k.stuck > 1) { k.wp = (k.wp + 1) % W.wps.length; k.stuck = 0; } }
  }
  physics(k, dt);
}
function caught(k, p) {
  const hadKey = G.keyHolder === p.netId;
  if (hadKey) { G.keyHolder = null; k.hasKey = true; }
  k.state = 'patrol'; k.wait = 3; k.seeT = 0; k.lost = 0; k.cool = 6;
  hurtPlayer(p, { caught: true, hadKey });
}

// ───────── Животные (считает хост) ─────────
function newNpc(sp, W) {
  const z = groundAt(W, sp.x, sp.y);
  const n = mk({ sp: sp.sp, x: sp.x, y: sp.y, z, rz: z, hx: sp.x, hy: sp.y, nx: sp.x, ny: sp.y, nz: z, name: sp.name, wait: rnd(0, 2) });
  if (sp.sp === 'chimp') Object.assign(n, { fur: { brown: FUR.brown, dark: FUR.dark, ginger: FUR.ginger }[sp.fur] || FUR.brown, bond: 0, fleeT: 0, want: false, boostCool: 0, friend: false });
  if (sp.sp === 'gorilla') Object.assign(n, { state: 'idle', full: 0, rage: 0, eatT: 0, pushCool: 0, pacified: 0 });
  if (sp.sp === 'parrot') Object.assign(n, { col: sp.col, flying: true, z: 5, rz: 5, tx: sp.x, ty: sp.y, perch: 0, fleeT: 0, say: '', sayT: 0, tz: 5 });
  if (sp.sp === 'tortoise') Object.assign(n, { bounceCool: 0 });
  return n;
}
function updateNpcs(dt) {
  for (const n of G.npcs) {
    n.t += dt;
    if (n.boostCool > 0) n.boostCool -= dt;
    if (n.sp === 'chimp') aiChimp(n, dt);
    else if (n.sp === 'gorilla') aiGorilla(n, dt);
    else if (n.sp === 'parrot') aiParrot(n, dt);
    else if (n.sp === 'tortoise') aiTortoise(n, dt);
    if (n.sp !== 'parrot') physics(n, dt);
  }
}
function eatPickup(n, p) { const i = G.pickups.indexOf(p); if (i >= 0) G.pickups.splice(i, 1); emit(p.x, p.y, p.z + 1, 4, { col: P_.yel, spread: 1, v0: 1, v1: 3 }); }
function aiChimp(n, dt) {
  if (n.mood && (n.moodT -= dt) <= 0) n.mood = null;
  const me = nearestPlayer(n); if (!me) return; const dme = dist(n, me);
  if (n.fleeT > 0) { n.fleeT -= dt; stepEntity(n, (n.x - me.x) / (dme || 1), (n.y - me.y) / (dme || 1), dt, 3.2, { noWater: true }); return; }
  const b = nearestPickup(n, 'banana', 9);
  if (b) { if (goTo(n, b.x, b.y, dt, 2.4, { noWater: true }) || dist(n, b) < .6) { eatPickup(n, b); n.bond = Math.min(100, n.bond + 18); n.mood = 'happy'; n.moodT = 2; checkBond(n, nearestPlayer(b)); } return; }
  n.want = n.bond < 50 && dme < 7 && bananasOf(me) > 0;
  if (n.bond >= 50) {
    if (dme > 3.4 && Math.abs(me.z - n.z) < 1.6) goTo(n, me.x + rnd(-1, 1), me.y + rnd(-1, 1), dt, 3.0, { noWater: true }); else n.moving = false;
    if (dme > 18) { n.x = me.x - 1; n.y = me.y; n.z = groundAt(G.W, n.x, n.y); }
  } else wander(n, dt, 1.2, 7);
}
function checkBond(n, by) {
  if (n.bond >= 50 && !n.friend) {
    n.friend = true;
    reward(by, { cnt: { friends: 1 }, toast: [`${n.name} теперь твой друг! (E — подсадка)`, 'good'], sfx: 'up', fl: [n.x, n.y, n.z + 3, 'друзья!', P_.pink] });
    emit(n.x, n.y, n.z + 3, 10, { kind: 'star', col: [P_.pink, P_.yel], spread: 1.5, v0: 1, v1: 4, g: 6, life: 1.2 });
  }
}
function aiGorilla(n, dt) {
  if (n.pushCool > 0) n.pushCool -= dt; if (n.full > 0) n.full -= dt; if (n.rage > 0) n.rage -= dt; if (n.pacified > 0) n.pacified -= dt;
  n.act = '';
  const b = nearestPickup(n, 'banana', 13);
  if (n.state === 'eat') { n.eatT -= dt; n.moving = false; n.act = 'angry'; if (n.eatT <= 0) { n.state = 'idle'; n.full = 25; } return; }
  if (b && n.full <= 0 && n.rage <= 0) { if (goTo(n, b.x, b.y, dt, 3.0, { noWater: true, r: .4 }) || dist(n, b) < .8) { eatPickup(n, b); n.state = 'eat'; n.eatT = 4; reward(nearestPlayer(b), { cnt: { decoy: 1 }, fl: [n.x, n.y, n.z + 2, 'ням! (отвлёк)', P_.yel] }); } return; }
  const target = nearestPlayer(n, p => Math.abs(p.z - n.z) < 2.2 && (n.rage > 0 || (bananasOf(p) > 0 && n.full <= 0 && n.pacified <= 0 && dist(n, p) < 7.5)));
  if (target) {
    const dme = dist(n, target);
    if (n.state !== 'chase') { n.state = 'chase'; SND.gorilla(n); }
    stepEntity(n, (target.x - n.x) / (dme || 1), (target.y - n.y) / (dme || 1), dt, 3.35, { noWater: true, r: .4 });
    if (dme < 1.1 && n.pushCool <= 0 && !target.tween) {
      n.pushCool = 2.5; n.rage = 0; const lost = bananasOf(target); n.full = lost > 0 ? 18 : 6;
      const nx = target.x + (target.x - n.x) / (dme || 1) * 1.8, ny = target.y + (target.y - n.y) / (dme || 1) * 1.8;
      hurtPlayer(target, { stun: .9, push: { x: nx, y: ny }, lose: 'banana', score: -10, toast: [lost ? `Горилла отобрала бананы (${lost}) и толкнула тебя!` : 'Горилла толкнула тебя!', 'bad'], sfx: 'bad' });
      n.state = 'idle';
    }
  } else { n.state = 'idle'; wander(n, dt, .9, 7); if (n.moving === false && Math.random() < .004) n.act = 'beat'; }
}
function aiTortoise(n, dt) {
  if (n.bounceCool > 0) n.bounceCool -= dt;
  wander(n, dt, .55, 6);
  for (const me of livePlayers()) {
    const d = dist(n, me);
    if (d < .8 && (me.me ? me.vz < 0 : true) && me.z - n.z > .2 && me.z - n.z < 1.4 && n.bounceCool <= 0 && !me.tween) {
      if (!me.me && me.z - me.rz > .5) continue;
      n.bounceCool = .5; emit(n.x, n.y, n.z, 6, { kind: 'dust', spread: 1, v0: .5, v1: 1.5, g: 0, life: .5 });
      if (me.me) { me.vz = 9.5 + .3 * (G.st.agi.lv - 1); me.grounded = false; G.cnt.bounces++; sfx.jump(); floater(n.x, n.y, n.z + 1, 'БОИНГ!', P_.lime); }
      else NET.sendTo(me.netId, { t: 'ev', ev: 'bounce' });
    }
  }
}
const PARROT_SAY = ['Попка!', 'Банан!', 'Ку-ку!', 'Кто там?', 'Ай-ай!', 'Привет!'];
function aiParrot(n, dt) {
  const me = nearestPlayer(n) || G.me;
  if (n.sayT > 0) n.sayT -= dt;
  if (n.fleeT > 0) n.fleeT -= dt;
  const k = G.keeper; if (k && k.state === 'chase' && dist(n, k) < 12 && n.sayT <= 0) { n.say = 'Тревога!'; n.sayT = 2.5; }
  else if (n.sayT <= 0 && dist(n, me) < 6 && Math.random() < .004) { n.say = pick(PARROT_SAY); n.sayT = 2.2; }
  if (n.perch > 0) { n.perch -= dt; n.flying = false; n.rz = n.z; if (n.perch <= 0) n.flying = true; return; }
  n.flying = true;
  const dx = n.tx - n.x, dy = n.ty - n.y, d = Math.hypot(dx, dy), sp = n.fleeT > 0 ? 5.5 : 2.6;
  if (d < .6) {
    if (Math.random() < .28) { const trees = G.W.objs.filter(o => o.type === 'tree' || o.type === 'banana_tree'); const t = pick(trees); n.tx = t.x; n.ty = t.y; n.landing = t; n.tz = groundAt(G.W, t.x, t.y) + 3; }
    else { n.tx = rnd(3, N - 3); n.ty = rnd(3, N - 3); n.landing = null; n.tz = groundAt(G.W, n.tx, n.ty) + rnd(3.5, 6); }
  } else { n.x += dx / d * sp * dt; n.y += dy / d * sp * dt; setFacing(n, dx, dy); n.moving = true; }
  n.z += (n.tz - n.z) * Math.min(1, dt * 1.5); n.rz = n.z + Math.sin(G.t * 3 + n.hx) * .25;
  if (n.landing && Math.hypot(n.landing.x - n.x, n.landing.y - n.y) < .8) { n.perch = rnd(5, 10); n.z = n.tz; }
}

// ───────── Зрители ─────────
const HIT_FX = [   // [вес, значок, подпись, очки]
  [30, 'ААА!', 'Визг!', 20], [20, 'ЛЁД!', 'Уронил мороженое', 25], [20, 'ШЛЯПА', 'Слетела шляпа', 25],
  [15, 'ТТ..', 'Убежал в слезах', 35], [10, 'ХА-ХА', 'Малыш хохочет', 20], [5, 'REC', 'ВИРУСНОЕ ВИДЕО!', 80],
];
function newVisitors(W) {   // внешний вид — из сида, чтобы у всех игроков зрители выглядели одинаково
  const R = mulberry32(W.seedNum + 99), pk = a => a[Math.floor(R() * a.length)];
  return W.visitors.map((v, i) => {
    const on = R() < .65;
    return {
      x: v.x, y: v.y, side: v.side, on, a: on ? 1 : 0, next: 5 + R() * 13, ph: R() * 6, fl: i % 2 === 0, splat: 0, cheer: 0, emo: null,
      col: pk([P_.red, P_.blue, P_.yel2, P_.pur, P_.teal, P_.org, P_.pink]), pants: pk(['#35465e', '#4a3a2a', '#2a2a30', '#5a4a6a']), hair: pk(['#3a2a1a', '#c9a24a', '#222', '#8a3a1a']),
      hat: pk([0, 1, 2, 2]), kid: R() < .25, skin: pk([P_.sk0, P_.sk1, '#8a5a3a', '#f2c9a0']),
    };
  });
}
function fadeVisitors(dt) {
  for (const v of G.vis) {
    v.a = clamp(v.a + (v.on ? dt : -dt) * 1.5, 0, 1);
    if (v.cheer > 0) v.cheer -= dt; if (v.splat > 0) v.splat -= dt; if (v.emo) { v.emo.t -= dt; if (v.emo.t <= 0) v.emo = null; }
  }
}
function updateVisitors(dt) {   // хост
  for (const v of G.vis) { v.next -= dt; if (v.next <= 0) { v.on = !v.on; v.next = rnd(8, 22); } }
  G.peanutT -= dt; if (G.peanutT <= 0) { G.peanutT = rnd(7, 12); visitorToss('peanut'); }
}
function visitorToss(type, from) {   // хост
  const act = G.vis.filter(v => v.on && v.a > .8); if (!act.length || G.pickups.length > 14) return;
  const v = from || pick(act), W = G.W;
  for (let i = 0; i < 20; i++) {
    const tx = clamp(v.x + rnd(-4, 4), 2, N - 2), ty = clamp(v.y + rnd(-4, 4), 2, N - 2);
    const x = v.side === 'n' ? tx : rnd(2, 6), y = v.side === 'n' ? rnd(2, 6) : ty;
    if (tileFree(x, y) && Math.abs(groundAt(W, x, y)) <= 0) { addPickup({ type, x, y, z: groundAt(W, x, y), fly: { sx: v.x, sy: v.y, t: 0, fl: .9 }, age: 0 }); return; }
  }
}
// «общие» действия игрока над хостовыми существами: хост выполняет сам, гость просит хоста
function netCheer(side, secs, tossP) {
  if (isHost()) hostCheer(side, secs, tossP); else NET.send({ t: 'cheer', side, secs, tp: tossP });
}
function hostCheer(side, secs, tossP) { for (const v of G.vis) if (v.on && (!side || v.side === side)) { v.cheer = secs; if (Math.random() < tossP) visitorToss(Math.random() < .5 ? 'coin' : 'peanut', v); } }
function netHoot(x, y) { if (isHost()) hostHoot(x, y); else NET.send({ t: 'hoot', x, y }); }
function hostHoot(x, y) {
  noiseAt(x, y, 14, 'крик');
  for (const v of G.vis) if (v.on && Math.hypot(v.x - x, v.y - y) < 16) { v.cheer = 3; if (Math.random() < .15) visitorToss('peanut', v); }
  for (const n of G.npcs) { if (n.sp === 'gorilla' && Math.hypot(n.x - x, n.y - y) < 9 && n.full <= 0 && n.pacified <= 0) n.rage = 5; if (n.sp === 'parrot' && Math.hypot(n.x - x, n.y - y) < 10) n.fleeT = 3; }
}
function netNoise(x, y, r, why) { if (isHost()) noiseAt(x, y, r, why); else NET.send({ t: 'noise', x, y, r, why }); }
function claimKey() {
  const me = G.me;
  if (isHost()) { if (G.keyHolder) return false; G.keyHolder = me.netId; G.keeper.hasKey = false; G.keeper.speedP = 2.6; return true; }
  NET.send({ t: 'claimKey' }); G.keyHolder = me.netId; return true;
}

// ───────── Предметы на земле ─────────
function addPickup(p) {
  if (isHost()) { p.id = ++G.pid; G.pickups.push(p); }
  else NET.send({ t: 'sp', p: { type: p.type, x: p.x, y: p.y, z: p.z, fly: p.fly ? { sx: p.fly.sx, sy: p.fly.sy, t: 0, fl: p.fly.fl } : null } });
}
function updatePickups(dt) {
  if (!isHost()) { for (const p of G.pickups) if (p.fly) { p.fly.t += dt; if (p.fly.t >= p.fly.fl) p.fly = null; } return; }
  for (let i = G.pickups.length - 1; i >= 0; i--) {
    const p = G.pickups[i]; p.age += dt;
    if (p.fly) { p.fly.t += dt; if (p.fly.t / p.fly.fl >= 1) { p.fly = null; p.z = groundAt(G.W, p.x, p.y); } continue; }
    if (p.life && p.age > p.life) { G.pickups.splice(i, 1); continue; }
    if (p.age > 70 && p.type !== 'coin') { G.pickups.splice(i, 1); continue; }
    let taken = false;
    for (const pl of livePlayers()) if (dist(p, pl) < .75 && Math.abs(pl.z - p.z) < 1.6 && !pl.tween) { collectFor(pl, p); taken = true; break; }
    if (taken) { G.pickups.splice(i, 1); continue; }
    if (p.type === 'banana') for (const n of G.npcs) if (n.sp === 'tortoise' && dist(n, p) < .7) { eatPickup(n, p); break; }
  }
}
function collectFor(pl, p) { if (pl.me) collectPickup(p.type, p); else NET.sendTo(pl.netId, { t: 'ev', ev: 'pk', type: p.type }); }
function collectPickup(type, at) {
  const x = at.x, y = at.y, z = (at.z || 0) + 1;
  switch (type) {
    case 'peanut': G.cnt.peanut++; addEnergy(8); addScore(3 + G.st.cha.lv); floater(x, y, z, '+' + (3 + G.st.cha.lv), P_.d4); sfx.eat(); break;
    case 'coin': G.inv.coin++; addScore(10); floater(x, y, z, '+10', P_.yel); SND.coin(null); break;
    case 'banana': G.inv.banana = Math.min(9, G.inv.banana + 1); floater(x, y, z, '+банан', P_.yel); sfx.eat(); break;
    case 'nut': G.inv.nut = Math.min(9, G.inv.nut + 1); floater(x, y, z, '+орех', P_.d3); sfx.eat(); break;
    case 'stone': G.inv.stone = Math.min(9, G.inv.stone + 1); floater(x, y, z, '+камень', P_.r3); sfx.tick(); break;
    case 'stick': G.inv.stick = Math.min(5, G.inv.stick + 1); floater(x, y, z, '+палка', P_.d3); sfx.tick(); break;
  }
}

// ───────── Снаряды и прицеливание ─────────
function launchPoint(p) { return { x: p.x, y: p.y, z: p.z + 1.7 }; }
function solveThrow(p, tgt, maxRIn) {
  const o = launchPoint(p), dx = tgt.x - o.x, dy = tgt.y - o.y;
  let d = Math.hypot(dx, dy); const maxR = maxRIn ?? (11 + .5 * G.st.str.lv);
  let k = 1; if (d > maxR) k = maxR / d; d *= k;
  const T = clamp(d * .075 + .35, .4, 1.4), zt = (k < 1 ? groundAt(G.W, o.x + dx * k, o.y + dy * k) : tgt.z) + .6;
  return { vx: dx * k / T, vy: dy * k / T, vz: (zt - o.z + .5 * GP * T * T) / T, T };
}
function throwPos(p, s, t) { const o = launchPoint(p); return { x: o.x + s.vx * t, y: o.y + s.vy * t, z: o.z + s.vz * t - .5 * GP * t * t }; }
function spawnProj(kind, p, sol, visual = false, from) { const o = from || launchPoint(p); G.proj.push({ kind, x: o.x, y: o.y, z: o.z, vx: sol.vx, vy: sol.vy, vz: sol.vz, t: 0, owner: p, px: o.x, py: o.y, visual }); }
function updateProj(dt) {
  const W = G.W;
  for (let i = G.proj.length - 1; i >= 0; i--) {
    const q = G.proj[i]; q.t += dt; q.px = q.x; q.py = q.y;
    q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt; q.vz -= GP * dt;
    let done = false;
    const inside = q.x >= 0 && q.y >= 0 && q.x < N && q.y < N, wasIn = q.px >= 0 && q.py >= 0 && q.px < N && q.py < N;
    const gh = groundAt(W, q.x, q.y);
    if (q.visual) { if ((q.z <= gh && q.vz < 0) || q.t > 4) G.proj.splice(i, 1); continue; }   // чужой снаряд — только картинка
    if (!done) done = projHit(q);
    if (!done && wasIn && !inside && q.z < 2.3 && !(G.gateOpen && q.x >= N && Math.abs(q.y - W.gate.y - .5) < 2)) { q.x = q.px; q.y = q.py; q.vx = -q.vx * .2; q.vy = -q.vy * .2; q.vz = Math.abs(q.vz) * .1; }
    if (!done && inside && W.blocked[Math.floor(q.y) * N + Math.floor(q.x)] && q.z < gh + 3) { q.x = q.px; q.y = q.py; done = projLand(q, true); }
    else if (!done && q.z <= gh && q.vz < 0) done = projLand(q, false);
    if (!done && q.t > 4) done = true;
    if (done) G.proj.splice(i, 1);
  }
}
function projLand(q, wall) {
  const gz = groundAt(G.W, q.x, q.y), x = q.x, y = q.y;
  if (q.kind === 'poop') { SND.splat({ x, y }); G.splats.push({ x, y, z: gz, t: 0 }); emit(x, y, gz, 6, { col: [P_.d0, P_.d1], spread: 1.4, v0: 1, v1: 3, life: .5 }); if (!wall) { G.combo = 0; floater(x, y, gz + 1, 'мимо', P_.d3); } }
  else if (q.kind === 'banana') { addPickup({ type: 'banana', x, y, z: gz, age: 0 }); emit(x, y, gz, 3, { col: P_.yel, spread: .8, v0: .5, v1: 2 }); }
  else if (q.kind === 'stone') { addPickup({ type: 'stone', x, y, z: gz, age: 0 }); emit(x, y, gz, 5, { kind: 'dust', spread: 1, v0: .5, v1: 1.5, g: 0, life: .4 }); sfx.hit(); netNoise(x, y, 6, 'камень'); }
  else if (q.kind === 'water') { emit(x, y, gz, 4, { col: P_.w3, spread: 1.2, v0: 1, v1: 3, life: .4 }); }
  return true;
}
function noiseAt(x, y, r, why) { const k = G.keeper; if (k && dist(k, { x, y }) < r + 6 && k.state !== 'chase' && k.state !== 'stunned') alertKeeper(k, x, y, why); }
// поиск цели попадания (на любой стороне), затем — хост применяет, гость просит хоста
function projHit(q) {
  const z = q.z, hitR = q.kind === 'water' ? .9 : .7;
  for (let i = 0; i < G.vis.length; i++) { const v = G.vis[i]; if (v.a < .5 || !v.on) continue; if (Math.hypot(v.x - q.x, v.y - q.y) < hitR && z > -.2 && z < 3.6) return dispatchHit(q, 'v', i); }
  for (let i = 0; i < G.npcs.length; i++) { const n = G.npcs[i]; if (Math.hypot(n.x - q.x, n.y - q.y) < (n.sp === 'gorilla' ? 1 : .75) && z > n.z - .3 && z < n.z + (n.sp === 'gorilla' ? 4 : n.sp === 'tortoise' ? 1.5 : 3.2)) return dispatchHit(q, 'n', i); }
  if (q.kind === 'poop' && G.duel) for (const p of livePlayers()) { if (p === q.owner || !duelActive(q.owner, p)) continue; if (Math.hypot(p.x - q.x, p.y - q.y) < .7 && z > p.z - .3 && z < p.z + 3.6) return dispatchHit(q, 'p', p.netId); }
  const k = G.keeper; if (k && Math.hypot(k.x - q.x, k.y - q.y) < .8 && z > k.z - .3 && z < k.z + 4.4) return dispatchHit(q, 'k', 0);
  for (const o of G.W.objs) if (o.type === 'gong' && Math.hypot(o.x - q.x, o.y - q.y) < 1 && z > 0 && z < 4) { ringGong(o); G.cnt.gongs++; return projLand(q, true); }
  return false;
}
function dispatchHit(q, tk, idx) {
  const by = q.owner; if (q.kind === 'poop') SND.splat(q); else if (q.kind === 'water') SND.splash(q); else SND.thud(q);
  if (isHost()) hostHit(by, q.kind, tk, idx, { x: q.x, y: q.y, z: q.z });
  else NET.send({ t: 'hit', k: q.kind, tk, i: idx, x: q.x, y: q.y, z: q.z });
  return true;
}
function hostHit(by, kind, tk, idx, q) {
  if (tk === 'v' && G.vis[idx]) hitVisitor(by, kind, G.vis[idx], q);
  else if (tk === 'n' && G.npcs[idx]) hitNpc(by, kind, G.npcs[idx], q);
  else if (tk === 'k') hitKeeper(by, kind, q);
  else if (tk === 'p') hitPlayer(by, kind, livePlayers().find(p => p.netId === idx), q);
}
function hitVisitor(by, kind, v, q) {
  if (kind === 'poop') {
    let r = rnd(0, 100), fi = 0; for (let i = 0; i < HIT_FX.length; i++) { r -= HIT_FX[i][0]; if (r <= 0) { fi = i; break; } }
    v.splat = 30; v.emo = { t: 2, s: HIT_FX[fi][1] }; if (fi === 3) { v.on = false; v.next = 40; }
    emit(v.x, v.y, 2, 12, { col: [P_.d0, P_.d1, P_.d2], spread: 1.6, v0: 1, v1: 4, life: .8 });
    for (const o of G.vis) if (o !== v && o.on && Math.hypot(o.x - v.x, o.y - v.y) < 3 && Math.random() < .45) { o.on = false; o.next = rnd(15, 30); o.emo = { t: 1.8, s: ';(' }; }
    noiseAt(by.x, by.y, 3, 'бросок');
    reward(by, { vis: { fx: fi, x: v.x, y: v.y }, sfx: 'ok', heat: 3 });
  } else if (kind === 'banana') {
    v.emo = { t: 2, s: 'Ой!' }; v.cheer = 2; addPickup({ type: 'banana', x: clamp(q.x, 1, N - 1), y: clamp(q.y, 1, N - 1), z: 0, age: 0 });
    reward(by, { score: 5, fl: [v.x, v.y, 3, '+5', P_.yel] });
  } else if (kind === 'stone') {
    v.emo = { t: 2, s: 'АЙ!' }; v.on = Math.random() < .5; noiseAt(v.x, v.y, 5, 'крик');
    reward(by, { score: 12, cnt: { hits: 1 }, heat: 5, fl: [v.x, v.y, 3, '+12 камнем', P_.r3] });
  } else if (kind === 'water') {
    v.emo = { t: 2, s: 'БРР!' }; v.cheer = 1.5; v.splat = 0;
    reward(by, { score: 8, cnt: { squirts: 1 }, fl: [v.x, v.y, 3, '+8 мокрый', P_.w3] });
  }
}
function hitNpc(by, kind, n, q) {
  if (n.sp === 'chimp') {
    if (kind === 'banana') { n.bond = Math.min(100, n.bond + 30); n.mood = 'happy'; n.moodT = 2.5; reward(by, { fl: [n.x, n.y, n.z + 1, '+дружба', P_.pink] }); checkBond(n, by); }
    else if (kind === 'poop' || kind === 'stone') { n.fleeT = 5; n.bond = Math.max(0, n.bond - 25); if (n.bond < 50) n.friend = false; reward(by, { fl: [n.x, n.y, n.z + 1, 'обиделся', P_.red], sfx: 'bad' }); }
    else if (kind === 'water') n.fleeT = 2;
  } else if (n.sp === 'gorilla') {
    if (kind === 'banana') { n.state = 'eat'; n.eatT = 4; n.full = 22; reward(by, { cnt: { decoy: 1 }, fl: [n.x, n.y, n.z + 2, 'ням! (накормлен)', P_.yel] }); }
    else { n.rage = 8; n.state = 'chase'; SND.gorilla(n); if (kind === 'poop') reward(by, { score: 10, toast: ['Ты попал в гориллу — она в ярости!', 'bad'], fl: [n.x, n.y, n.z + 3, 'РРР!', P_.red] }); }
  } else if (n.sp === 'parrot') {
    if (kind === 'stone' || kind === 'poop') { n.fleeT = 8; n.perch = 0; addPickup({ type: 'coin', x: n.x, y: n.y, z: groundAt(G.W, n.x, n.y), fly: { sx: n.x, sy: n.y, t: 0, fl: .6 }, age: 0 }); n.say = 'Ай!'; n.sayT = 2; reward(by, { score: 15, cnt: { parrots: 1 }, sfx: 'ok', fl: [n.x, n.y, n.z, 'уронил монету!', P_.yel] }); }
  } else if (n.sp === 'tortoise') {
    if (kind !== 'banana') addPickup({ type: kind === 'stone' ? 'stone' : 'peanut', x: n.x, y: n.y, z: n.z, age: 0 });
  }
  projLand({ ...q, kind }, true);
}
function hitKeeper(by, kind, q) {
  const k = G.keeper;
  if (kind === 'banana') {
    if (k.state !== 'stunned') { k.state = 'stunned'; k.stunT = 3.5; k.target = null; emit(k.x, k.y, k.z + 2, 8, { kind: 'star', col: P_.yel, spread: 1.4, v0: 1, v1: 3, g: 8, life: .8 }); reward(by, { score: 25, cnt: { slips: 1 }, sfx: 'ok', toast: ['Смотритель поскользнулся на банане! Ключ — рядом (E)', 'good'], fl: [k.x, k.y, k.z + 3, 'ПОСКОЛЬЗНУЛСЯ! +25', P_.yel] }); }
  } else if (kind === 'poop' || kind === 'stone') {
    if (k.state !== 'stunned') { k.state = 'chase'; k.lost = 0; k.chasing = by.netId; }
    reward(by, { score: 10, heat: 6, sfx: 'hit', fl: [k.x, k.y, k.z + 3, '+10 в смотрителя!', P_.org] });
  }
  projLand({ ...q, kind }, true);
}
function ringGong(o) { o.ring = 1.2; SND.gong(o); netNoise(o.x, o.y, 22, 'гонг'); floater(o.x, o.y, 4, 'БОММ!', P_.yel); }

// ───────── Дуэли говном (считает хост) ─────────
const DUEL_GOAL = 5, DUEL_MAX = 90;
const duelActive = (a, b) => !!G.duel && ((G.duel.a === a.netId && G.duel.b === b.netId) || (G.duel.a === b.netId && G.duel.b === a.netId));
function duelStart(aId, bId) {
  if (G.duel) return;
  const pa = livePlayers().find(p => p.netId === aId), pb = livePlayers().find(p => p.netId === bId); if (!pa || !pb) return;
  G.duel = { a: aId, b: bId, sa: 0, sb: 0, goal: DUEL_GOAL, t: 0 };
  for (const p of [pa, pb]) reward(p, { toast: ['⚔ ДУЭЛЬ! Первый, кто попадёт 💩 пять раз, побеждает. Заряды бесконечны!', 'good'], sfx: 'hoot' });
}
function hitPlayer(by, kind, pl, q) {
  if (kind !== 'poop' || !pl || !by || !duelActive(by, pl)) return;
  const d = G.duel; if (d.a === by.netId) d.sa++; else d.sb++;
  hurtPlayer(pl, { stun: .45, splat: 3, sfx: 'hit', fl: [pl.x, pl.y, pl.z + 3, 'ПОПАЛИ!', P_.org] });
  reward(by, { fl: [pl.x, pl.y, pl.z + 3, 'В ЦЕЛЬ!', P_.yel], sfx: 'ok' });
  emit(pl.x, pl.y, pl.z + 2, 12, { col: [P_.d0, P_.d1, P_.d2], spread: 1.6, v0: 1, v1: 4, life: .8 });
  if (d.sa >= d.goal || d.sb >= d.goal) duelEnd(d.sa >= d.goal ? d.a : d.b);
}
function duelEnd(winnerId) {
  const d = G.duel; if (!d) return; G.duel = null;
  const pa = livePlayers().find(p => p.netId === d.a), pb = livePlayers().find(p => p.netId === d.b);
  for (const p of [pa, pb]) { if (!p) continue; const win = p.netId === winnerId; reward(p, winnerId ? (win ? { score: 60, cnt: { duels: 1 }, sfx: 'up', toast: ['🏆 Ты победил в дуэли! +60', 'good'] } : { score: 10, sfx: 'bad', toast: ['Дуэль проиграна (+10 за участие)', 'bad'] }) : { toast: ['Дуэль закончилась вничью', ''] }); }
}
function updateDuel(dt) {
  const d = G.duel; if (!d) return; d.t += dt;
  const ok = id => livePlayers().some(p => p.netId === id);
  if (!ok(d.a) || !ok(d.b)) { duelEnd(null); return; }
  if (d.t > DUEL_MAX) duelEnd(d.sa === d.sb ? null : d.sa > d.sb ? d.a : d.b);
}
