'use strict';
// ───────── Существа: физика, ИИ животных и смотрителя, снаряды, подбираемое ─────────
// Сетевая модель: хост считает ИИ и всё «общее» (животные, смотритель, зрители, предметы на земле).
// Игроки считают сами себя. Награды за действия приходят тому, кто их заслужил (reward / hurtPlayer).
const GRAV = 16, GP = 12;           // гравитация для прыжков и для брошенных предметов (ярусов/с²)
const STEP = 1.02;                  // на сколько ярусов можно «шагнуть» вверх без прыжка

const trunkAt = (W, i) => (W.trunkR ? W.trunkR[i] || .3 : .3);
function walkableAt(W, x, y, z, r = .28, step = STEP, noWater = false, gateOk = false, trunks = true, maxDrop = 99) {
  for (const [px, py] of [[x - r, y - r], [x + r, y - r], [x - r, y + r], [x + r, y + r]]) {
    const tx = Math.floor(px), ty = Math.floor(py);
    if (tx < 0 || ty < 0 || tx >= N || ty >= N) {
      if (gateOk && G.gateOpen && tx >= N && tx < N + 5 && ty >= W.gate.y - 1 && ty <= W.gate.y + 1) continue;
      return false;
    }
    const i = ty * N + tx;
    if (W.blocked[i] === 1) return false;
    if (W.blocked[i] === 2 && trunks && Math.hypot(x - tx - .5, y - ty - .5) < trunkAt(W, i) + r) return false;
    if (noWater && W.kind[i] === K.WATER) return false;
    if (W.h[i] > z + step) return false;
  }
  if (maxDrop < 99 && groundAt(W, x, y) < z - maxDrop) return false;   // спрыгнуть: решает клетка под центром
  return true;
}
// стволы круглые: не упираемся в них, а выталкиваемся по нормали — так существо скользит вокруг дерева
function trunkPush(W, e, r) {
  const cx = Math.floor(e.x), cy = Math.floor(e.y);
  for (let ty = cy - 1; ty <= cy + 1; ty++) for (let tx = cx - 1; tx <= cx + 1; tx++) {
    if (tx < 0 || ty < 0 || tx >= N || ty >= N || W.blocked[ty * N + tx] !== 2) continue;
    const R = trunkAt(W, ty * N + tx) + r + 1e-3, dx = e.x - tx - .5, dy = e.y - ty - .5, d = Math.hypot(dx, dy);
    if (d < R) { if (d < 1e-4) { e.x = tx + .5 + R; } else { e.x = tx + .5 + dx / d * R; e.y = ty + .5 + dy / d * R; } }
  }
}
// если существо оказалось внутри препятствия (телепорт, приземление, сдвинутый ящик) — выталкиваем к ближайшему свободному месту
function unstick(e, rad = .28) {
  if (walkableAt(G.W, e.x, e.y, e.z + .05, rad, STEP, false, true)) return false;
  for (let r = .2; r < 4; r += .2) for (let a = 0; a < 6.28; a += .4) { const x = e.x + Math.cos(a) * r, y = e.y + Math.sin(a) * r; if (walkableAt(G.W, x, y, groundAt(G.W, x, y), rad)) { e.x = x; e.y = y; if (e.z < groundAt(G.W, x, y)) e.z = groundAt(G.W, x, y); e.nav = null; return true; } }
  return false;
}
function setFacing(e, dx, dy) {
  const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l; e.dx = dx; e.dy = dy;
  const sxn = dx - dy, syn = dx + dy;
  if (Math.abs(sxn) > .05) e.fx = sxn > 0 ? 1 : -1; if (Math.abs(syn) > .05) e.fb = syn > 0;
}
function stepEntity(e, dx, dy, dt, speed, o = {}) {
  const W = G.W, sp = speed * dt, r = o.r ?? e.rad ?? .28, ox = e.x, oy = e.y;
  if (o.noWater && !walkableAt(W, ox, oy, e.z + .05, r, STEP, true, o.gateOk)) o = { ...o, noWater: false };   // уже в воде (закинули) — пусть выбирается
  // стены и обрывы — по осям (скольжение вдоль стены), стволы — выталкиванием (скольжение вокруг дерева)
  const nx = e.x + dx * sp, ny = e.y + dy * sp, drop = e.me || !e.grounded || G.t < (e.dropOk || 0) ? 99 : 1.05;
  if (walkableAt(W, nx, e.y, e.z, r, STEP, o.noWater, o.gateOk, false, drop)) e.x = nx;
  if (walkableAt(W, e.x, ny, e.z, r, STEP, o.noWater, o.gateOk, false, drop)) e.y = ny;
  if (e.x !== ox || e.y !== oy) {
    trunkPush(W, e, r); trunkPush(W, e, r);
    if (!walkableAt(W, e.x, e.y, e.z, r, STEP, o.noWater, o.gateOk)) { e.x = ox; e.y = oy; }
  }
  const moved = Math.abs(e.x - ox) + Math.abs(e.y - oy) > 1e-5;
  e.moving = moved; if (moved) setFacing(e, dx, dy);
  return moved;
}
// шаг «куда-нибудь в эту сторону»: если прямо нельзя — пробуем отклониться (бегство, толчки)
function stepAround(e, dx, dy, dt, speed, o = {}) {
  const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
  for (const a of [0, .6, -.6, 1.2, -1.2, 1.9, -1.9]) {
    const c = Math.cos(a), s = Math.sin(a), px = e.x, py = e.y;
    stepEntity(e, dx * c - dy * s, dx * s + dy * c, dt, speed, o);
    if (Math.hypot(e.x - px, e.y - py) > speed * dt * .3) return true;
  }
  return false;
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
// идти к точке: напрямую, а если упёрлись (угол стены, обрыв, роща) — в обход по клеткам.
// Цель недостижима — идём к ближайшему достижимому месту и считаем, что пришли.
function goTo(e, tx, ty, dt, speed, o = {}) {
  if (Math.hypot(tx - e.x, ty - e.y) < .15) { e.moving = false; e.nav = null; return true; }
  const nf = e.navFail; if (nf && G.t - nf.t < 2 && Math.hypot(nf.x - tx, nf.y - ty) < .8) { e.moving = false; return true; }   // недавно выяснили: ближе не подойти
  let nv = e.nav, gx = tx, gy = ty;
  if (nv && (nv.t += dt) > 10) nv = e.nav = null;
  if (nv && Math.hypot(nv.tx - tx, nv.ty - ty) > 1.5 && G.t > (e.navCool || 0)) nv = e.nav = null;   // цель ушла — проложим заново
  const near = Math.max(.07, .48 - (o.r ?? e.rad ?? .28));   // крупным — точнее по центру клетки, иначе цепляют углы
  if (nv) { while (nv.path.length && Math.hypot(nv.path[0].x - e.x, nv.path[0].y - e.y) < near) nv.path.shift(); if (nv.path.length) { gx = nv.path[0].x; gy = nv.path[0].y; } else nv = e.nav = null; }
  const l = Math.hypot(gx - e.x, gy - e.y) || 1;
  stepAround(e, (gx - e.x) / l, (gy - e.y) / l, dt, speed, o);
  // окно прогресса: за 0,4 с не приблизились к точке хотя бы на треть возможного — уткнулись (или дёргаемся на месте)
  const pw = e.pw || (e.pw = { s: 0, t: 0 }); pw.s += l - Math.hypot(gx - e.x, gy - e.y); pw.t += dt;
  let blocked = false; if (pw.t > .4) { blocked = pw.s < speed * pw.t * .3; pw.s = pw.t = 0; }
  if (blocked && G.t > (e.navCool || 0)) {
    e.navCool = G.t + .5;
    const r = navPath(G.W, e, tx, ty, !!o.noWater);
    if (!r.exact && !r.path.length) { e.nav = null; e.moving = false; e.navFail = { x: tx, y: ty, t: G.t }; e.dropOk = G.t + 4; return true; }   // по уступам не пройти — разрешаем спрыгнуть
    e.nav = { path: r.path, tx, ty, t: 0 };
  }
  return false;
}
// путь по клеткам к цели или (если она за обрывом/в воде) к ближайшей достижимой клетке
function navPath(W, from, tx, ty, noWater = true) {
  const sx = clamp(Math.floor(from.x), 0, N - 1), sy = clamp(Math.floor(from.y), 0, N - 1), gx = Math.floor(tx), gy = Math.floor(ty), s = sy * N + sx;
  const ok = i => { const x = i % N, y = (i / N) | 0; return x > 0 && y > 0 && x < N - 1 && y < N - 1 && !W.blocked[i] && (!noWater || W.kind[i] !== K.WATER); };
  const prev = new Int32Array(N * N).fill(-1), q = [s]; prev[s] = s;
  let best = s, bd = Math.hypot(sx - gx, sy - gy);
  for (let qi = 0; qi < q.length; qi++) {
    const c = q[qi], cx = c % N, cy = (c / N) | 0, d = Math.hypot(cx - gx, cy - gy);
    if (d < bd) { bd = d; best = c; } if (d === 0) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = cx + dx, y = cy + dy, i = y * N + x; if (x < 0 || y < 0 || x >= N || y >= N || prev[i] >= 0 || !ok(i) || Math.abs(W.h[i] - W.h[c]) > 1) continue;
      prev[i] = c; q.push(i);
    }
  }
  const path = []; for (let c = best; c !== s; c = prev[c]) path.unshift({ x: c % N + .5, y: ((c / N) | 0) + .5 });
  if (path.length && !W.blocked[s]) path.unshift({ x: sx + .5, y: sy + .5 });   // сначала в центр своей клетки — оттуда проход по клеткам гарантирован
  return { path, exact: best === gy * N + gx };
}
function wander(e, dt, speed, radius) {
  if (e.wait > 0) { e.wait -= dt; e.moving = false; return; }
  if (!e.target) { e.target = randomNear(e, radius); if (!e.target) { e.wait = 1; return; } e.stuck = 0; }
  const px = e.x, py = e.y, arrived = goTo(e, e.target.x, e.target.y, dt, speed, { noWater: true });
  e.stuck = Math.hypot(e.x - px, e.y - py) < speed * dt * .25 ? (e.stuck || 0) + dt : 0;
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
  if (p.grounded) unstick(p);
  if (p.vine) { updateVineSwing(p, dt); return; }
  if (p.roll) {   // перекат: короткий рывок, на мгновение неуязвим
    const r = p.roll; r.t += dt; const sp = 6.2 * (1 - r.t / r.dur * .4);
    stepEntity(p, r.dx, r.dy, dt, sp, { gateOk: true }); setFacing(p, r.dx, r.dy); physics(p, dt);
    if (r.t >= r.dur) { p.roll = null; if (p.act && p.act.type === 'roll') p.act = null; }
    return;
  }
  p.airT = p.grounded ? 0 : (p.airT || 0) + dt;
  if (!p.grounded) tryAutoGrab(p);
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
    sp *= 1 - dirtSlow();
    if (G.boostT > 0) sp *= 1.2;
    const gh = groundAt(W, p.x, p.y); if (W.kind[Math.floor(p.y) * N + Math.floor(p.x)] === K.WATER && p.grounded) { sp *= .6; if (Math.random() < .08) { emit(p.x, p.y, gh, 3, { col: P_.w3, spread: 1.2, v0: 1, v1: 3 }); } }
    stepEntity(p, dx, dy, dt, sp, { gateOk: true });
    G.tutDist += sp * dt * (p.moving ? 1 : 0); if (p.sprint) G.cnt.sprintT += dt;
    G.dustT -= dt; if (p.moving && p.grounded && G.dustT <= 0) { G.dustT = p.sprint ? .08 : .17; emit(p.x, p.y, p.z, 1, { kind: 'dust', spread: .4, v0: .3, v1: 1, g: 0, life: .5 }); }
  } else p.moving = false;
  if (!p.grounded && (p.mvx || p.mvy)) { const sp = Math.hypot(p.mvx, p.mvy); stepEntity(p, p.mvx / sp, p.mvy / sp, dt, sp, { gateOk: true }); p.mvx *= 1 - .25 * dt; p.mvy *= 1 - .25 * dt; }
  if (p.grounded) { p.mvx = 0; p.mvy = 0; }
  physics(p, dt);
  if (G.mouse && G.mouse.in && G.aim && !p.tween && !(p.act && p.act.type === 'spin')) { const ax = G.aim.x - p.x, ay = G.aim.y - p.y; if (ax * ax + ay * ay > .04) setFacing(p, ax, ay); }
  if (K_.has('Space') && p.grounded && !p.act && !G.mini && p.stun <= 0 && !p.jumpHeld) { p.vz = 7.4 + .5 * (G.st.agi.lv - 1) + (G.boostT > 0 ? 1.3 : 0); p.grounded = false; p.jumpHeld = true; G.cnt.jumps++; sfx.jump(); emit(p.x, p.y, p.z, 4, { kind: 'dust', spread: .8, v0: .2, v1: 1, g: 0, life: .5 }); }
  if (!K_.has('Space')) p.jumpHeld = false;
  p.onLand = hard => { p.landT = .2; if (hard > 4) { emit(p.x, p.y, p.z, 5, { kind: 'dust', spread: 1, v0: .3, v1: 1, g: 0, life: .5 }); if (W.kind[Math.floor(p.y) * N + Math.floor(p.x)] === K.WATER) sfx.splash(); } };
  G.energy = clamp(G.energy - (p.sprint ? 1.3 : p.moving ? .35 : .12) * dt, 0, 100);
}
// ───────── Лианы на гигантских деревьях ─────────
const VINE_G = 9.5;                 // м/с² для маятника (единицы сцены)
const GRIP = .95;                   // от ступней до кисти поднятой руки (единицы сцены)
function grabVine(p, v, gh) {       // gh — высота хвата (единицы сцены)
  const dx = p.x - v.ax, dy = p.y - v.ay, dh = clamp(gh, v.ah - v.len, v.ah - 1) - v.ah, L = Math.max(1.2, Math.hypot(dx, dy, dh));
  const k = 1 / L, vel = { x: p.mvx || 0, y: p.mvy || 0, h: (p.vz || 0) * LV };
  p.vine = { v, L, p: { x: dx, y: dy, h: dh }, vel };
  p.act = { type: 'vineSwing', t: 0, dur: 0, done: null }; p.grounded = false; p.tween = null; p.lastVine = v; p.lastVineT = G.t;
  G.cnt.vineGrabs = (G.cnt.vineGrabs || 0) + 1; SND.whoosh(p);
  if (G.cnt.vineGrabs === 1) toast('🌿 Ты на лиане! WASD — раскачка, Пробел — прыжок в сторону, V — писать сверху, ЛКМ — бросать', 'good');
}
function updateVineSwing(p, dt) {
  const s = p.vine, v = s.v, K_ = G.keys;
  if (!p.act || p.act.type === 'pee') { if (!p.act) p.act = { type: 'vineSwing', t: 0, dur: 0, done: null }; }
  let fx = 0, fy = 0;
  if (K_.has('KeyW') || K_.has('ArrowUp')) { fx--; fy--; } if (K_.has('KeyS') || K_.has('ArrowDown')) { fx++; fy++; }
  if (K_.has('KeyA') || K_.has('ArrowLeft')) { fx--; fy++; } if (K_.has('KeyD') || K_.has('ArrowRight')) { fx++; fy--; }
  const fl = Math.hypot(fx, fy) || 1, push = 5.5 + .5 * (G.st.agi.lv - 1);
  s.vel.x += fx / fl * push * dt; s.vel.y += fy / fl * push * dt; s.vel.h -= VINE_G * dt;
  for (const k of ['x', 'y', 'h']) { s.vel[k] *= 1 - .05 * dt; s.p[k] += s.vel[k] * dt; }
  const L = Math.hypot(s.p.x, s.p.y, s.p.h) || 1, kk = s.L / L; s.p.x *= kk; s.p.y *= kk; s.p.h *= kk;
  const nx = s.p.x / s.L, ny = s.p.y / s.L, nh = s.p.h / s.L, vr = s.vel.x * nx + s.vel.y * ny + s.vel.h * nh;
  s.vel.x -= vr * nx; s.vel.y -= vr * ny; s.vel.h -= vr * nh;
  p.x = v.ax + s.p.x; p.y = v.ay + s.p.y; p.z = (v.ah + s.p.h - GRIP) / LV; p.rz = p.z; p.vz = s.vel.h / LV; p.moving = false;
  if (Math.hypot(s.vel.x, s.vel.y) > .3) setFacing(p, s.vel.x, s.vel.y);
  const gh = groundAt(G.W, p.x, p.y), out = p.x < .6 || p.y < .6 || p.x > N - .6 || p.y > N - .6;
  if (p.z < gh + .05 || out || (G.W.blocked[Math.floor(p.y) * N + Math.floor(p.x)] === 1 && p.z < gh + 2)) { if (out) { p.x = clamp(p.x, .7, N - .7); p.y = clamp(p.y, .7, N - .7); } releaseVine(p, false); if (p.z < gh) p.z = gh; }
}
function releaseVine(p, jump) {
  const s = p.vine; if (!s) return; p.vine = null; if (p.act && p.act.type === 'vineSwing') p.act = null;
  p.mvx = s.vel.x; p.mvy = s.vel.y; p.vz = s.vel.h / LV + (jump ? 4.5 : 0); p.grounded = false; p.airT = 0; p.lastVineT = G.t;
  if (jump) { SND.whoosh(p); G.cnt.vineJumps = (G.cnt.vineJumps || 0) + 1; floater(p.x, p.y, p.z + 3, 'ЙА-ХУ!', P_.lime); }
}
// в полёте лиана рядом — хватаемся сами
function tryAutoGrab(p) {
  if (p.airT < .12 || !G.W.vines) return;
  const hand = p.z * LV + GRIP;
  for (const v of G.W.vines) {
    if (v === p.lastVine && G.t - (p.lastVineT || 0) < .7) continue;
    if (Math.hypot(p.x - v.ax, p.y - v.ay) < .75 && hand > v.ah - v.len - .25 && hand < v.ah - .6) { grabVine(p, v, hand); return true; }
  }
  return false;
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
const chaOf = p => p ? (p.me ? G.st.cha.lv : (p.ch || 1)) : 1;
function keeperSees(k, p) {
  if (p.invuln > 0 || k.state === 'away' || k.state === 'panic') return false;
  const d = Math.hypot(p.x - k.x, p.y - k.y);
  if (inShelter(p) && d > 1.2) return false;
  if (k.state === 'sleep' || k.state === 'tohut') return d < 1.4 && !p.crouch;
  let range = 8.5; if (p.crouch) range *= .5; else if (p.sprint) range *= 1.3; if (p.me ? G.mudT > 0 : p.mud) range *= .6; if ((p.me ? G.wearCap : p.cap) && d > 3) range *= .7;
  if (Math.abs(p.z - k.z) > 2.6) range *= .45;
  if (d > range) return false;
  if (d < 1.8) return true;
  const ang = Math.atan2(p.y - k.y, p.x - k.x), kf = Math.atan2(k.dy, k.dx); let da = Math.abs(ang - kf); da = Math.min(da, Math.PI * 2 - da);
  return da < .85;
}
function alertKeeper(k, x, y, why) { if (k.state === 'stunned' || k.state === 'chase') return; if (k.state === 'sleep') floater(k.x, k.y, k.z + 3, 'проснулся!', P_.yel); k.state = 'suspicious'; k.target = { x, y }; k.lookT = 0; k.suspWhy = why; }
function updateKeeper(k, dt) {
  const W = G.W, players = livePlayers().filter(p => !p.tween); if (!players.length) return;
  if (k.cool > 0) k.cool -= dt; if (k.calm > 0) k.calm -= dt;
  k.rad = .3; if (k.grounded && k.state !== 'away' && k.state !== 'sleep') unstick(k, .3);
  if (keeperDay(k, dt)) return;
  if (G.riot && k.state !== 'sleep' && k.state !== 'tohut' && k.state !== 'stunned') { k.state = 'panic'; keeperPanic(k, dt); physics(k, dt); return; }
  if (k.state === 'panic') { k.state = 'patrol'; k.panC = null; }
  // распорядок: ночью уходит спать в сторожку
  const night = isNight();
  if (night && k.state === 'patrol') { k.state = 'tohut'; k.path = null; }
  if (!night && (k.state === 'sleep' || k.state === 'tohut')) { k.state = 'patrol'; k.wait = 1; k.path = null; }
  if (k.state === 'tohut') {
    if (!k.path) { k.path = findPath(W, k, hutDoor(W)) || []; k.hutT = 0; }
    k.hutT += dt; const nx = k.path[0];
    if (nx) { if (goTo(k, nx.x, nx.y, dt, k.speedP)) k.path.shift(); }
    if (!k.path.length || k.hutT > 40) { k.state = 'sleep'; k.moving = false; k.path = null; }
  }
  if (k.state === 'sleep') { k.moving = false; setFacing(k, 1, 0); }
  const first = players[0]; k.visRange = first.crouch ? 4.2 : first.sprint ? 11 : 8.5;
  if (k.state === 'stunned') { k.stunT -= dt; k.moving = false; physics(k, dt); if (k.stunT <= 0) { k.state = 'suspicious'; k.target = { x: first.x, y: first.y }; k.lookT = 0; } return; }
  // кого видит: приоритет у шумящих (heat), у владельца ключа, потом у ближайшего
  let seen = null, best = -1;
  for (const p of players) if (keeperSees(k, p) && !(k.calm > 0 && G.keyHolder !== p.netId)) { const sc = (p.heat > 0 ? 3 : 0) + (G.keyHolder === p.netId ? 4 : 0) + 1 / (dist(k, p) + .5); if (sc > best) { best = sc; seen = p; } }
  const sees = !!seen;
  if (sees) {
    if (k.state === 'sleep' || k.state === 'tohut') { k.state = 'suspicious'; k.target = { x: seen.x, y: seen.y }; k.lookT = 0; }
    k.seeT += dt * clamp(1 - .12 * (chaOf(seen) - 1), .5, 1); k.lastSeen = { x: seen.x, y: seen.y }; const dd = dist(k, seen), carrying = G.keyHolder === seen.netId;
    if ((seen.heat > 0 || carrying || dd < 2.2 * clamp(1 - .1 * (chaOf(seen) - 1), .6, 1) || (k.seeT > 3 && dd < 6)) && k.state !== 'chase') {
      k.state = 'chase'; k.lost = 0; k.chasing = seen.netId;
      if (seen.me) { sfx.bad(); toast('Смотритель заметил тебя!', 'bad'); } else NET.sendTo(seen.netId, { t: 'ev', ev: 'alarm' });
    } else if (k.state === 'patrol') { k.state = 'suspicious'; k.target = { x: seen.x, y: seen.y }; k.lookT = 0; }
  } else { k.seeT = Math.max(0, k.seeT - dt * 2); }
  if (k.state === 'chase') {
    const tgt = seen || players.find(p => p.netId === k.chasing) || players[0];
    if (!sees) { k.lost += dt; if (k.lost > 4 || dist(k, tgt) > 16) { k.state = 'suspicious'; k.target = k.lastSeen || { x: k.x, y: k.y }; k.lookT = 0; } } else k.lost = 0;
    const tp = sees ? tgt : (k.lastSeen || tgt); goTo(k, tp.x, tp.y, dt, 3.8 + (G.keyHolder ? .3 : 0) + (k.mustache || k.noCap ? .35 : 0), { r: .3 });
    if (sees && dist(k, tgt) < .9 && Math.abs(k.z - tgt.z) < 1.5) caught(k, tgt);
  } else if (k.state === 'suspicious') {
    if (k.target && goTo(k, k.target.x, k.target.y, dt, 2.5)) { k.moving = false; k.lookT += dt; const a = Math.atan2(k.dy, k.dx) + dt * 2.2; setFacing(k, Math.cos(a), Math.sin(a)); if (k.lookT > 2.6) { k.state = 'patrol'; k.target = null; let b = 0, bd = 1e9; W.wps.forEach((w, i) => { const d = Math.hypot(w.x - k.x, w.y - k.y); if (d < bd) { bd = d; b = i; } }); k.wp = b; k.wait = .5; } }
    else if (!k.target) k.state = 'patrol';
  } else if (k.state === 'feed' || k.state === 'escort') { keeperRoutine(k, dt);
  } else if (k.state === 'patrol' && keeperRoutine(k, dt)) {
  } else if (k.state === 'patrol') {
    if (k.wait > 0) { k.wait -= dt; k.moving = false; const a = Math.atan2(k.dy, k.dx) + Math.sin(G.t * .9) * dt * .8; setFacing(k, Math.cos(a), Math.sin(a)); }
    else { const w = W.wps[k.wp]; if (!w) return; const px = k.x, py = k.y; if (goTo(k, w.x, w.y, dt, k.speedP)) { k.wp = (k.wp + 1) % W.wps.length; k.wait = rnd(1, 2.5); } k.stuck = Math.hypot(k.x - px, k.y - py) < k.speedP * dt * .25 ? (k.stuck || 0) + dt : 0; if (k.stuck > 1) { k.wp = (k.wp + 1) % W.wps.length; k.stuck = 0; } }
  }
  physics(k, dt);
}
// поиск пути по клеткам (обход препятствий и обрывов)
function findPath(W, from, to) {
  const sx = Math.floor(from.x), sy = Math.floor(from.y), tx = Math.floor(to.x), ty = Math.floor(to.y), I = (x, y) => y * N + x;
  const ok = (x, y) => x > 0 && y > 0 && x < N - 1 && y < N - 1 && !W.blocked[I(x, y)] && W.kind[I(x, y)] !== K.WATER;
  if (!ok(tx, ty)) return null;
  const prev = new Int32Array(N * N).fill(-1), q = [I(sx, sy)]; prev[I(sx, sy)] = I(sx, sy);
  for (let qi = 0; qi < q.length; qi++) {
    const c = q[qi], cx = c % N, cy = (c / N) | 0; if (cx === tx && cy === ty) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = cx + dx, y = cy + dy; if (!ok(x, y) || prev[I(x, y)] >= 0 || Math.abs(W.h[I(x, y)] - W.h[c]) > 1) continue; prev[I(x, y)] = c; q.push(I(x, y)); }
  }
  if (prev[I(tx, ty)] < 0) return null;
  const path = []; for (let c = I(tx, ty); c !== I(sx, sy); c = prev[c]) path.unshift({ x: c % N + .5, y: ((c / N) | 0) + .5 });
  return path;
}
function hutDoor(W) {   // ближайшая свободная клетка у западной стены сторожки
  if (W._door) return W._door; let best = null, bd = 1e9; const hx = W.hut.x - .5, hy = W.hut.y + 1.5;
  for (let y = W.hut.y - 2; y <= W.hut.y + 4; y++) for (let x = W.hut.x - 3; x <= W.hut.x + 4; x++) { if (x < 1 || y < 1 || x >= N - 1 || y >= N - 1) continue; const i = y * N + x; if (W.blocked[i] || W.kind[i] === K.WATER) continue; const d = Math.hypot(x + .5 - hx, y + .5 - hy); if (d < bd) { bd = d; best = { x: x + .5, y: y + .5 }; } }
  return W._door = best || W.spawn;
}
function caught(k, p) {
  const hadKey = G.keyHolder === p.netId;
  if (hadKey) { G.keyHolder = null; k.hasKey = true; }
  k.state = 'patrol'; k.wait = 3; k.seeT = 0; k.lost = 0; k.cool = 6; k.calm = 12;
  const spots = G.W.respawns && G.W.respawns.length ? G.W.respawns : [G.W.spawn]; let spawn = spots[0], bd = -1;
  for (const s of spots) { const d = Math.hypot(s.x - k.x, s.y - k.y) + Math.random() * 3; if (d > bd) { bd = d; spawn = s; } }
  p.invuln = 6;
  hurtPlayer(p, { caught: true, hadKey, spawn });
}

// ───────── Животные (считает хост) ─────────
function newNpc(sp, W) {
  if (sp.sp === 'python') return newPython(sp, W);
  if (sp.sp === 'troop') { const t = newTroop({ spawnTroop: sp }); t.z = t.rz = t.nz = groundAt(W, sp.x, sp.y); return t; }
  const z = groundAt(W, sp.x, sp.y);
  const n = mk({ sp: sp.sp, x: sp.x, y: sp.y, z, rz: z, hx: sp.x, hy: sp.y, nx: sp.x, ny: sp.y, nz: z, name: sp.name, wait: rnd(0, 2) });
  if (sp.sp === 'chimp') Object.assign(n, { fur: { brown: FUR.brown, dark: FUR.dark, ginger: FUR.ginger }[sp.fur] || FUR.brown, bond: 0, fleeT: 0, want: false, boostCool: 0, friend: false, gang: null, loyal: 0, act: null, actT: 0, queue: [] });
  if (sp.sp === 'gorilla') Object.assign(n, { state: 'idle', full: 0, rage: 0, eatT: 0, pushCool: 0, pacified: 0 });
  if (sp.sp === 'parrot') Object.assign(n, { col: sp.col, flying: true, z: 5, rz: 5, tx: sp.x, ty: sp.y, perch: 0, fleeT: 0, say: '', sayT: 0, tz: 5 });
  if (sp.sp === 'tortoise') Object.assign(n, { bounceCool: 0 });
  return n;
}
function updateNpcs(dt) {
  for (const n of G.npcs) {
    n.t += dt;
    if (n.boostCool > 0) n.boostCool -= dt;
    if (n.rad === undefined) n.rad = n.sp === 'gorilla' || n.sp === 'troop' ? .4 : .28;
    if (n.sp !== 'parrot' && n.grounded && !n.held && !n.fly && !['away', 'held', 'fly', 'coil'].includes(n.state)) unstick(n, n.rad);
    if (n.sp === 'python') { if (!aiPython(n, dt)) continue; }
    else if (n.sp === 'chimp') { if (!G.riot) aiChimp2(n, dt); }
    else if (n.sp === 'troop') aiTroop(n, dt);
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
  if (n.fleeT > 0) { n.fleeT -= dt; stepAround(n, n.x - me.x, n.y - me.y, dt, 3.2, { noWater: true }); return; }
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
  const target = nearestPlayer(n, p => Math.abs(p.z - n.z) < 2.2 && (n.rage > 0 || (bananasOf(p) > 0 && n.full <= 0 && n.pacified <= 0 && dist(n, p) < 7.5 * clamp(1 - .1 * (chaOf(p) - 1), .6, 1))));
  if (target) {
    const dme = dist(n, target);
    if (n.state !== 'chase') { n.state = 'chase'; SND.gorilla(n); }
    goTo(n, target.x, target.y, dt, 3.35, { noWater: true, r: .4 });
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
  if (n.poopCool > 0) n.poopCool -= dt;
  else for (const p of livePlayers()) if (!p.invuln && Math.hypot(p.x - n.x, p.y - n.y) < 1.1 && Math.random() < dt * 1.2) { birdPoop(n, p); n.poopCool = rnd(7, 16); break; }
  const dx = n.tx - n.x, dy = n.ty - n.y, d = Math.hypot(dx, dy), sp = n.fleeT > 0 ? 5.5 : 2.6;
  if (d < .6) {
    if (Math.random() < .28) { const trees = G.W.objs.filter(o => o.type === 'tree' || o.type === 'banana_tree'); const t = pick(trees); n.tx = t.x; n.ty = t.y; n.landing = t; n.tz = groundAt(G.W, t.x, t.y) + 3; }
    else { n.tx = rnd(3, N - 3); n.ty = rnd(3, N - 3); n.landing = null; n.tz = groundAt(G.W, n.tx, n.ty) + rnd(3.5, 6); }
  } else { n.x += dx / d * sp * dt; n.y += dy / d * sp * dt; setFacing(n, dx, dy); n.moving = true; }
  n.z += (n.tz - n.z) * Math.min(1, dt * 1.5); n.rz = n.z + Math.sin(G.t * 3 + n.hx) * .25;
  if (n.landing && Math.hypot(n.landing.x - n.x, n.landing.y - n.y) < .8) { n.perch = rnd(5, 10); n.z = n.tz; }
}

function birdPoop(n, p) {
  emit(p.x, p.y, n.z, 6, { col: ['#f4f4ec', '#e0e0d0'], spread: .15, v0: -2, v1: 0, g: 10, life: .8, size: 2 });
  hurtPlayer(p, { bird: 1, sfx: 'splat', fl: [p.x, p.y, p.z + 3, 'ПОПУГАЙ НАГАДИЛ!', '#f4f4ec'] });
  n.say = 'Ха-ха!'; n.sayT = 2;
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
      kind: (r => r < .08 ? 'brave' : r < .28 ? 'bully' : r < .63 ? 'coward' : 'normal')(R()),
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
  const open = zooOpen();
  for (const v of G.vis) { if (!open) { v.on = false; v.next = rnd(1, 6); continue; } v.next -= dt; if (v.next <= 0) { v.on = !v.on; v.next = rnd(8, 22); } }
  if (!open) return;
  G.peanutT -= dt; if (G.peanutT <= 0) { G.peanutT = rnd(7, 12); visitorToss('peanut'); }
  visitorMood(dt);
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
    case 'peanut': G.cnt.peanut++; addEnergy(8); addGas(6); addScore(3 + G.st.cha.lv); floater(x, y, z, '+' + (3 + G.st.cha.lv), P_.d4); sfx.eat(); break;
    case 'coin': G.inv.coin++; addScore(10); floater(x, y, z, '+10', P_.yel); SND.coin(null); break;
    case 'banana': G.inv.banana = Math.min(9, G.inv.banana + 1); floater(x, y, z, '+банан', P_.yel); sfx.eat(); break;
    case 'nut': G.inv.nut = Math.min(9, G.inv.nut + 1); floater(x, y, z, '+орех', P_.d3); sfx.eat(); break;
    case 'stone': G.inv.stone = Math.min(9, G.inv.stone + 1); floater(x, y, z, '+камень', P_.r3); sfx.tick(); break;
    case 'stick': G.inv.stick = Math.min(5, G.inv.stick + 1); floater(x, y, z, '+палка', P_.d3); sfx.tick(); break;
    case 'vine': G.inv.vine = Math.min(2, (G.inv.vine || 0) + 1); floater(x, y, z, '+лиана', P_.lime); sfx.tick(); break;
  }
}

// ───────── Снаряды и прицеливание ─────────
function launchPoint(p) { return { x: p.x, y: p.y, z: p.z + 1.7 }; }
function solveThrow(p, tgt, maxRIn) {
  const o = launchPoint(p), dx = tgt.x - o.x, dy = tgt.y - o.y;
  let d = Math.hypot(dx, dy); const maxR = maxRIn ?? (11 + .5 * G.st.str.lv);
  let k = 1; if (d > maxR) k = maxR / d; d *= k;
  const T = clamp(d * .075 + .35, .4, 1.4) * clamp(1 - .07 * (G.st.str.lv - 1), .7, 1) / (G.boostT > 0 ? 1.25 : 1), zt = (k < 1 ? groundAt(G.W, o.x + dx * k, o.y + dy * k) : tgt.z) + .6;
  return { vx: dx * k / T, vy: dy * k / T, vz: (zt - o.z + .5 * GP * T * T) / T, T };
}
// перемещение предмета с обновлением занятых клеток (баррикады работают и для смотрителя)
function moveObj(o, nx, ny) {
  const W = G.W; if (o.blk && o.tx >= 0 && o.ty >= 0 && o.tx < N && o.ty < N) W.blocked[o.ty * N + o.tx] = 0;
  o.x = nx; o.y = ny; o.tx = Math.floor(nx); o.ty = Math.floor(ny);
  if (o.blk && o.tx >= 0 && o.ty >= 0 && o.tx < N && o.ty < N) W.blocked[o.ty * N + o.tx] = 1;
}
const inShelter = p => (G.shelters || []).some(s => Math.hypot(s.x - p.x, s.y - p.y) < .7);
function solveFrom(o, tgt, maxR = 12) {
  const dx = tgt.x - o.x, dy = tgt.y - o.y; let d = Math.hypot(dx, dy), k = 1; if (d > maxR) k = maxR / d; d *= k;
  const T = clamp(d * .075 + .35, .4, 1.4), zt = (tgt.z || 0) + .6;
  return { vx: dx * k / T, vy: dy * k / T, vz: (zt - o.z + .5 * GP * T * T) / T, T };
}
function throwPos(p, s, t) { const o = launchPoint(p); return { x: o.x + s.vx * t, y: o.y + s.vy * t, z: o.z + s.vz * t - .5 * GP * t * t }; }
function spawnProj(kind, p, sol, visual = false, from) { const o = from || launchPoint(p); G.proj.push({ kind, x: o.x, y: o.y, z: o.z, vx: sol.vx, vy: sol.vy, vz: sol.vz, t: 0, owner: p, px: o.x, py: o.y, visual, air: !!(p && p.me && (p.vine || !p.grounded) && p.z - groundAt(G.W, p.x, p.y) > 1.5) }); }
function updateProj(dt) {
  const W = G.W;
  for (let i = G.proj.length - 1; i >= 0; i--) {
    const q = G.proj[i]; q.t += dt; q.px = q.x; q.py = q.y;
    q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt; q.vz -= GP * dt;
    let done = false;
    const inside = q.x >= 0 && q.y >= 0 && q.x < N && q.y < N, wasIn = q.px >= 0 && q.py >= 0 && q.px < N && q.py < N;
    const gh = groundAt(W, q.x, q.y);
    if (q.visual) { if ((q.z <= gh && q.vz < 0) || q.t > 4) { if (q.kind === 'puke' && q.t <= 4 && Math.random() < .3) G.splats.push({ x: q.x, y: q.y, z: gh, t: 0, c: 'puke' }); G.proj.splice(i, 1); } continue; }   // чужой снаряд — только картинка
    if (!done) done = projHit(q);
    if (!done && wasIn && !inside && q.z < 2.3 && q.kind !== 'pee' && q.kind !== 'puke' && q.kind !== 'water' && !(G.gateOpen && q.x >= N && Math.abs(q.y - W.gate.y - .5) < 2)) { q.x = q.px; q.y = q.py; q.vx = -q.vx * .2; q.vy = -q.vy * .2; q.vz = Math.abs(q.vz) * .1; }
    if (!done && inside && W.blocked[Math.floor(q.y) * N + Math.floor(q.x)] && q.z < gh + 3) { q.x = q.px; q.y = q.py; done = projLand(q, true); }
    else if (!done && q.z <= gh && q.vz < 0) done = projLand(q, false);
    if (!done && q.t > 4) done = true;
    if (done) G.proj.splice(i, 1);
  }
}
function projLand(q, wall) {
  const gz = groundAt(G.W, q.x, q.y), x = q.x, y = q.y;
  if (q.kind === 'poop') { SND.splat({ x, y }); G.splats.push({ x, y, z: gz, t: 0 }); emit(x, y, gz, 6, { col: [P_.d0, P_.d1], spread: 1.4, v0: 1, v1: 3, life: .5 }); if (!wall && !q.gang && (!q.owner || q.owner.me)) { G.combo = 0; floater(x, y, gz + 1, 'мимо', P_.d3); } }
  else if (q.kind === 'banana') { addPickup({ type: 'banana', x, y, z: gz, age: 0 }); emit(x, y, gz, 3, { col: P_.yel, spread: .8, v0: .5, v1: 2 }); }
  else if (q.kind === 'stone') { addPickup({ type: 'stone', x, y, z: gz, age: 0 }); emit(x, y, gz, 5, { kind: 'dust', spread: 1, v0: .5, v1: 1.5, g: 0, life: .4 }); sfx.hit(); netNoise(x, y, 6, 'камень'); }
  else if (q.kind === 'water') { emit(x, y, gz, 4, { col: P_.w3, spread: 1.2, v0: 1, v1: 3, life: .4 }); }
  else if (q.kind === 'hose') { if (Math.random() < .4) emit(x, y, gz, 2, { col: P_.w3, spread: .8, v0: 1, v1: 2, life: .3 }); if (!q.owner || q.owner.me) netWet(x, y); }
  else if (q.kind === 'tire') { SND.thud({ x, y }); emit(x, y, gz, 6, { kind: 'dust', spread: 1, v0: .5, v1: 1.5, g: 0, life: .5 }); const o = q.obj; if (o) { let tx = x, ty = y; if (!tileFree(tx, ty, true)) { for (let r = .5; r < 3; r += .5) { const a = rnd(0, 6.28); if (tileFree(x + Math.cos(a) * r, y + Math.sin(a) * r)) { tx = x + Math.cos(a) * r; ty = y + Math.sin(a) * r; break; } } } moveObj(o, clamp(tx, 1, N - 1), clamp(ty, 1, N - 1)); o.held = null; } }
  else if (q.kind === 'pee') { if (Math.random() < .35) G.splats.push({ x, y, z: gz, t: 0, c: 'pee' }); }
  else if (q.kind === 'puke') { if (Math.random() < .4) G.splats.push({ x, y, z: gz, t: 0, c: 'puke' }); if (Math.random() < .3) emit(x, y, gz, 2, { col: ['#9ac040', '#c8b048'], spread: .7, v0: .5, v1: 1.5, life: .3 }); }
  else if (q.kind === 'mega') { SND.splat({ x, y }); SND.thud({ x, y }); emit(x, y, gz + .5, 40, { col: [P_.d0, P_.d1, P_.d2], spread: 3, v0: 2, v1: 7, life: 1.1, size: 2 }); for (let i = 0; i < 7; i++) G.splats.push({ x: x + rnd(-2, 2), y: y + rnd(-2, 2), z: gz, t: 0 }); if (isHost()) megaSplash(q.owner, x, y); else NET.send({ t: 'mega', x, y }); }
  return true;
}
function noiseAt(x, y, r, why) { const k = G.keeper; if (k && dist(k, { x, y }) < r + 6 && k.state !== 'chase' && k.state !== 'stunned') alertKeeper(k, x, y, why); }
// поиск цели попадания (на любой стороне), затем — хост применяет, гость просит хоста
function projHit(q) {
  if (q.kind === 'mega') return false;
  if (q.kind === 'tire' && q.t < .12) return false;      // мега-снаряд взрывается только при падении
  const z = q.z, hitR = q.kind === 'water' || q.kind === 'pee' || q.kind === 'puke' || q.kind === 'hose' ? .9 : .7;
  for (let i = 0; i < G.vis.length; i++) { const v = G.vis[i]; if (v.a < .5 || !v.on || q.kind === 'tire') continue; if (Math.hypot(v.x - q.x, v.y - q.y) < hitR && z > -.2 && z < 3.6) return dispatchHit(q, 'v', i); }
  for (let i = 0; i < G.npcs.length; i++) { const n = G.npcs[i]; if (n === q.src) continue; if (Math.hypot(n.x - q.x, n.y - q.y) < (n.sp === 'gorilla' ? 1 : .75) && z > n.z - .3 && z < n.z + (n.sp === 'gorilla' ? 4 : n.sp === 'tortoise' ? 1.5 : 3.2)) return dispatchHit(q, 'n', i); }
  if (q.kind === 'poop' || q.kind === 'pee' || q.kind === 'puke' || q.kind === 'tire' || q.kind === 'hose') for (const p of livePlayers()) { if (p === q.owner || p.invuln > 0) continue; if (Math.hypot(p.x - q.x, p.y - q.y) < .7 && z > p.z - .3 && z < p.z + 3.6) return dispatchHit(q, 'p', p.netId); }
  for (const it of G.intruders) if (it.state === 'wander' && Math.hypot(it.x - q.x, it.y - q.y) < .8 && z > it.z - .3 && z < it.z + 4.4) return dispatchHit(q, 'i', it.id);
  const k = G.keeper; if (k && Math.hypot(k.x - q.x, k.y - q.y) < .8 && z > k.z - .3 && z < k.z + 4.4) return dispatchHit(q, 'k', 0);
  for (const o of G.W.objs) if (o.type === 'gong' && Math.hypot(o.x - q.x, o.y - q.y) < 1 && z > 0 && z < 4) { ringGong(o); G.cnt.gongs++; return projLand(q, true); }
  return false;
}
function dispatchHit(q, tk, idx) {
  const by = q.owner; if (q.kind === 'poop') SND.splat(q); else if (q.kind === 'water' || q.kind === 'puke') { if (q.kind === 'water' || Math.random() < .25) SND.splash(q); } else if (q.kind === 'hose') { if (Math.random() < .2) SND.splash(q); } else SND.thud(q);
  if (q.air && (q.kind === 'poop' || q.kind === 'pee' || q.kind === 'puke')) { G.cnt.airHits = (G.cnt.airHits || 0) + 1; floater(q.x, q.y, q.z + 1, 'С ВЫСОТЫ! ×2', P_.lime); addScore(15); }
  if (q.riot) { riotHit(q, tk, idx); return true; }
  if (isHost()) hostHit(by, q.kind, tk, idx, { x: q.x, y: q.y, z: q.z });
  else NET.send({ t: 'hit', k: q.kind, tk, i: idx, x: q.x, y: q.y, z: q.z });
  return true;
}
function hostHit(by, kind, tk, idx, q) {
  if (kind === 'hose') {
    if (tk === 'v' && G.vis[idx]) hoseHitVisitor(by, G.vis[idx]); else if (tk === 'n' && G.npcs[idx]) hoseHitNpc(by, G.npcs[idx]); else if (tk === 'k') hoseHitKeeper(by, G.keeper);
    else if (tk === 'p') { const p = livePlayers().find(p => p.netId === idx); if (p) hoseHitPlayer(by, p); }
    return;
  }
  if (tk === 'v' && G.vis[idx]) hitVisitor(by, kind, G.vis[idx], q);
  else if (tk === 'n' && G.npcs[idx]) hitNpc(by, kind, G.npcs[idx], q);
  else if (tk === 'k') hitKeeper(by, kind, q);
  else if (tk === 'i') hitIntruder(by, kind, G.intruders.find(i => i.id === idx));
  else if (tk === 'p') hitPlayer(by, kind, livePlayers().find(p => p.netId === idx), q);
}
function hitVisitor(by, kind, v, q) {
  if (kind === 'poop') {
    let r = rnd(0, 100), fi = 0; for (let i = 0; i < HIT_FX.length; i++) { r -= HIT_FX[i][0]; if (r <= 0) { fi = i; break; } }
    v.splat = 30; v.emo = { t: 2, s: HIT_FX[fi][1] }; if (v.kind !== 'brave' && (fi === 3 || (v.kind === 'coward' && Math.random() < .8))) { v.on = false; v.next = 40; }
    emit(v.x, v.y, 2, 12, { col: [P_.d0, P_.d1, P_.d2], spread: 1.6, v0: 1, v1: 4, life: .8 });
    for (const o of G.vis) if (o !== v && o.on && Math.hypot(o.x - v.x, o.y - v.y) < 3 && Math.random() < .45) { o.on = false; o.next = rnd(15, 30); o.emo = { t: 1.8, s: ';(' }; }
    noiseAt(by.x, by.y, 3, 'бросок');
    reward(by, { vis: { fx: fi, x: v.x, y: v.y }, sfx: 'ok', heat: 3 });
  } else if (kind === 'banana') {
    v.emo = { t: 2, s: 'Ой!' }; v.cheer = 2; addPickup({ type: 'banana', x: clamp(q.x, 1, N - 1), y: clamp(q.y, 1, N - 1), z: 0, age: 0 });
    reward(by, { score: 5, fl: [v.x, v.y, 3, '+5', P_.yel] });
  } else if (kind === 'stone') {
    v.emo = { t: 2, s: 'АЙ!' }; v.on = v.kind === 'brave' || (v.kind !== 'coward' && Math.random() < .5); noiseAt(v.x, v.y, 5, 'крик');
    reward(by, { score: 12, cnt: { hits: 1 }, heat: 5, fl: [v.x, v.y, 3, '+12 камнем', P_.r3] });
  } else if (kind === 'pee') {
    if ((v.peeT || 0) > G.t) return; v.peeT = G.t + 1.2;
    v.emo = { t: 2, s: 'ФУУ!' }; if (Math.random() < .45) { v.on = false; v.next = rnd(15, 30); }
    reward(by, { score: 10, cnt: { pees: 1 }, heat: 3, fl: [v.x, v.y, 3, '+10 описал!', '#f0e060'] });
  } else if (kind === 'puke') {   // облевали: публика в ужасе, соседи разбегаются
    if ((v.peeT || 0) > G.t) return; v.peeT = G.t + 1.2;
    v.emo = { t: 2.2, s: pick(['БЛЕЕ!', 'ФУУУ!', 'МАМА!', 'ГАДОСТЬ!']) }; if (v.kind !== 'brave' || Math.random() < .5) { v.on = false; v.next = rnd(20, 40); }
    for (const o of G.vis) if (o !== v && o.on && Math.hypot(o.x - v.x, o.y - v.y) < 2.5 && Math.random() < .35) { o.on = false; o.next = rnd(15, 30); o.emo = { t: 1.8, s: 'ФУ!' }; }
    reward(by, { score: 12, cnt: { pukeHits: 1 }, heat: 3, fl: [v.x, v.y, 3, '+12 облевал!', '#9ac040'] });
  } else if (kind === 'water') {
    v.emo = { t: 2, s: 'БРР!' }; v.cheer = 1.5; v.splat = 0;
    reward(by, { score: 8, cnt: { squirts: 1 }, fl: [v.x, v.y, 3, '+8 мокрый', P_.w3] });
  }
}
function hitNpc(by, kind, n, q) {
  if (kind === 'tire' || kind === 'whip') {
    if (n.sp === 'chimp') { n.fleeT = 4; n.bond = Math.max(0, n.bond - 15); if (n.gang) n.loyal -= 25; }
    else if (n.sp === 'gorilla') { n.rage = 6; n.state = 'chase'; SND.gorilla(n); }
    else if (n.sp === 'troop' || n.sp === 'parrot') { n.fleeT = 5; if (n.sp === 'parrot') n.perch = 0; }
    reward(by, { score: 5, cnt: kind === 'whip' ? { whips: 1 } : {}, fl: [n.x, n.y, n.z + 2, kind === 'whip' ? 'хлесть!' : 'бам!', P_.org] });
    if (kind === 'tire') projLand({ ...q, kind }, true); return;
  }
  if (n.sp === 'chimp') {
    if (kind === 'banana') { n.bond = Math.min(100, n.bond + 30); n.mood = 'happy'; n.moodT = 2.5; reward(by, { fl: [n.x, n.y, n.z + 1, '+дружба', P_.pink] }); checkBond(n, by); }
    else if (kind === 'poop' || kind === 'stone') { if (n.gang) n.loyal -= 35; n.fleeT = n.gang ? 1.5 : 5; n.bond = Math.max(0, n.bond - 25); if (n.bond < 50) n.friend = false; reward(by, { fl: [n.x, n.y, n.z + 1, 'обиделся', P_.red], sfx: 'bad' }); }
    else if (kind === 'water' || kind === 'pee' || kind === 'puke') n.fleeT = kind === 'water' ? 2 : kind === 'puke' ? 5 : 4;
  } else if (n.sp === 'gorilla') {
    if (kind === 'banana') { n.state = 'eat'; n.eatT = 4; n.full = 22; reward(by, { cnt: { decoy: 1 }, fl: [n.x, n.y, n.z + 2, 'ням! (накормлен)', P_.yel] }); }
    else { n.rage = 8; n.state = 'chase'; SND.gorilla(n); if (kind === 'poop') reward(by, { score: 10, toast: ['Ты попал в гориллу — она в ярости!', 'bad'], fl: [n.x, n.y, n.z + 3, 'РРР!', P_.red] }); }
  } else if (n.sp === 'parrot') {
    if (kind === 'stone' || kind === 'poop') { n.fleeT = 8; n.perch = 0; addPickup({ type: 'coin', x: n.x, y: n.y, z: groundAt(G.W, n.x, n.y), fly: { sx: n.x, sy: n.y, t: 0, fl: .6 }, age: 0 }); n.say = 'Ай!'; n.sayT = 2; reward(by, { score: 15, cnt: { parrots: 1 }, sfx: 'ok', fl: [n.x, n.y, n.z, 'уронил монету!', P_.yel] }); }
  } else if (n.sp === 'troop') {
    if (kind !== 'banana') { n.fleeT = 5; SND.monkey(n); reward(by, { score: 8, cnt: { troopHits: 1 }, fl: [n.x, n.y, n.z + 2, 'мартышки врассыпную!', P_.org] }); }
  } else if (n.sp === 'tortoise') {
    if (kind !== 'banana') addPickup({ type: kind === 'stone' ? 'stone' : 'peanut', x: n.x, y: n.y, z: n.z, age: 0 });
  }
  projLand({ ...q, kind }, true);
}
function hitKeeper(by, kind, q) {
  const k = G.keeper;
  if (kind === 'tire' || kind === 'whip') {
    const st = kind === 'tire' ? 2.6 : 1.4;
    if (k.state !== 'stunned') { k.state = 'stunned'; k.stunT = st; k.target = null; emit(k.x, k.y, k.z + 2, 8, { kind: 'star', col: P_.yel, spread: 1.4, v0: 1, v1: 3, g: 8, life: .8 }); }
    reward(by, { score: kind === 'tire' ? 30 : 15, cnt: kind === 'whip' ? { whips: 1 } : {}, heat: 6, sfx: 'hit', fl: [k.x, k.y, k.z + 3, kind === 'tire' ? 'СБИЛ ШИНОЙ! +30' : 'ХЛЕСТЬ! +15', P_.yel] });
    if (kind === 'tire') projLand({ ...q, kind }, true); return;
  }
  if (kind === 'banana') {
    if (k.state !== 'stunned') { k.state = 'stunned'; k.stunT = 3.5; k.target = null; emit(k.x, k.y, k.z + 2, 8, { kind: 'star', col: P_.yel, spread: 1.4, v0: 1, v1: 3, g: 8, life: .8 }); reward(by, { score: 25, cnt: { slips: 1 }, sfx: 'ok', toast: ['Смотритель поскользнулся на банане! Ключ — рядом (E)', 'good'], fl: [k.x, k.y, k.z + 3, 'ПОСКОЛЬЗНУЛСЯ! +25', P_.yel] }); }
  } else if (kind === 'poop' || kind === 'stone' || kind === 'pee' || kind === 'puke') {
    if (kind === 'pee' || kind === 'puke') { if ((k.peeT || 0) > G.t) return; k.peeT = G.t + 1.2; }   // струя — много капель, считаем раз в 1,2 с
    if (k.state !== 'stunned') { k.state = 'chase'; k.lost = 0; k.chasing = by.netId; }
    reward(by, { score: 10, heat: 6, sfx: 'hit', fl: [k.x, k.y, k.z + 3, '+10 в смотрителя!', P_.org] });
  }
  projLand({ ...q, kind }, true);
}
// мега-снаряд: обрызгивает всех в радиусе 3 клеток (считает хост)
function megaSplash(by, x, y) {
  const R = 3, at = { x, y, z: 1 }; let hit = 0;
  G.vis.forEach(v => { if (v.on && v.a > .5 && Math.hypot(v.x - x, v.y - y) < R + .8) { hitVisitor(by, 'poop', v, at); hit++; } });
  G.npcs.forEach(n => { if (Math.hypot(n.x - x, n.y - y) < R) { hitNpc(by, 'poop', n, at); hit++; } });
  for (const p of livePlayers()) if (p !== by && !p.invuln && Math.hypot(p.x - x, p.y - y) < R) { hurtPlayer(p, { dirt: 2, stun: .5, sfx: 'splat', fl: [p.x, p.y, p.z + 3, 'МЕГА-БРЫЗГИ!', P_.org] }); hit++; }
  const k = G.keeper; if (k && Math.hypot(k.x - x, k.y - y) < R) { hitKeeper(by, 'poop', at); hit++; }
  reward(by, { cnt: { megas: 1 }, toast: hit ? ['💥 Мега-снаряд накрыл ' + hit + ' целей!', 'good'] : null, score: hit * 5 });
}
// истошный крик: пугает всех вокруг и зовёт смотрителя (считает хост)
function netScream(x, y) { if (isHost()) hostScream(G.me, x, y); else NET.send({ t: 'scream', x, y }); }
function hostScream(by, x, y) {
  const k = G.keeper; if (k && k.state !== 'chase' && k.state !== 'stunned') { alertKeeper(k, x, y, 'крик'); k.state = 'suspicious'; k.target = { x, y }; }
  let scared = 0;
  for (const v of G.vis) if (v.on && Math.hypot(v.x - x, v.y - y) < 15) { v.emo = { t: 2.2, s: v.kid ? 'УААА!' : v.kind === 'brave' ? 'ХА!' : 'ААА!' }; if (v.kind !== 'brave' && (v.kind === 'coward' || Math.random() < .55)) { v.on = false; v.next = rnd(20, 40); } scared++; }
  for (const n of G.npcs) { const d = Math.hypot(n.x - x, n.y - y); if (n.sp === 'chimp' && d < 10) n.fleeT = 4; if (n.sp === 'parrot' && d < 12) { n.fleeT = 5; n.perch = 0; } if (n.sp === 'gorilla' && d < 9 && n.pacified <= 0) n.rage = 5; }
  reward(by, { score: scared * 2, cnt: { scared, screams: 1 } });
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
  if (!pl || !by) return;
  if (kind === 'puke') { if ((pl.peeHitT || 0) > G.t) return; pl.peeHitT = G.t + .6; hurtPlayer(pl, { dirt: .35, sfx: 'splash', fl: [pl.x, pl.y, pl.z + 3, 'ФУ, ОБЛЕВАЛИ!', '#9ac040'] }); reward(by, { score: 5, cnt: { pukeHits: 1 } }); return; }
  if (kind === 'pee') { if ((pl.peeHitT || 0) > G.t) return; pl.peeHitT = G.t + .6; hurtPlayer(pl, { dirt: .25, sfx: 'splash', fl: [pl.x, pl.y, pl.z + 3, 'ФУ, ОПИСАЛИ!', '#f0e060'] }); reward(by, { score: 4, cnt: { pees: 1 } }); return; }
  if (kind === 'tire') { hurtPlayer(pl, { stun: 1, sfx: 'hit', fl: [pl.x, pl.y, pl.z + 3, 'ШИНОЙ!', P_.org] }); reward(by, { score: 10 }); return; }
  if (kind !== 'poop') return;
  const duelNow = duelActive(by, pl);
  hurtPlayer(pl, { stun: duelNow ? .45 : .25, splat: 3, dirt: 1, sfx: 'splat', fl: [pl.x, pl.y, pl.z + 3, 'ПОПАЛИ!', P_.org] });
  reward(by, { fl: [pl.x, pl.y, pl.z + 3, 'В ЦЕЛЬ!', P_.yel], sfx: 'ok', cnt: { pHits: 1 }, score: duelNow ? 0 : 5 });
  emit(pl.x, pl.y, pl.z + 2, 12, { col: [P_.d0, P_.d1, P_.d2], spread: 1.6, v0: 1, v1: 4, life: .8 });
  if (!duelNow) return;
  const d = G.duel; if (d.a === by.netId) d.sa++; else d.sb++;
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
