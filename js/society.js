'use strict';
// ───────── Общество вольера: звания хулигана, банда, мартышки, распорядок дня, смелые посетители ─────────
// Всё «общее» считает хост; гость присылает просьбы (позвать в банду, повторить бросок).

// ── звания хулигана (5 ступеней) ──
const HOOL_RANKS = [
  { n: 'Тихоня', p: 0, icon: '😇' }, { n: 'Шалун', p: 30, icon: '😜' }, { n: 'Хулиган', p: 100, icon: '😈' },
  { n: 'Задира', p: 220, icon: '👊' }, { n: 'Бандит', p: 420, icon: '🦹' }, { n: 'Гроза зоопарка', p: 700, icon: '👑' },
];
function hoolPts() {
  const c = G.cnt || {};
  return (c.hits || 0) * 3 + (c.pees || 0) * 2 + (c.scared || 0) + (c.megas || 0) * 8 + (c.slips || 0) * 10 + (c.stolen || 0) * 20 + (c.pHits || 0) * 2
    + (c.screams || 0) * 2 + (c.viral || 0) * 10 + (c.duels || 0) * 10 + (c.gangHits || 0) + (c.intruders || 0) * 15 + (c.parrots || 0) * 3 + (c.troopHits || 0) * 2 + (c.whips || 0) * 4 + (c.airHits || 0) * 6 + (c.vineJumps || 0)
    + (c.pyHits || 0) * 8 + (c.pyThrows || 0) * 3 + (c.pyEscapes || 0) * 15 + (c.farts || 0) * 2 + (c.riots || 0) * 25 + (c.raids || 0) * 12 + (c.soaks || 0) + (c.whistles || 0) * 2;
}
function hoolRank(pts = hoolPts()) { let r = 0; HOOL_RANKS.forEach((h, i) => { if (pts >= h.p) r = i; }); return r; }
const rankOf = p => p.me ? hoolRank() : (p.hr || 0);          // ранг = сколько обезьян можно держать в банде
const gangOf = id => G.npcs.filter(n => n.sp === 'chimp' && n.gang === id);
const CHIMP_NAMES = ['Чита', 'Бобо', 'Мими', 'Гоша', 'Луна', 'Кузя', 'Тоша', 'Буба'];

// ── журнал событий (справа внизу) ──
const LOG = [];
function logEv(icon, text) {
  if (/^\p{Extended_Pictographic}/u.test(text)) icon = '';
  LOG.unshift({ icon, text, t: performance.now() }); if (LOG.length > 7) LOG.pop();
  const el = $('log'); if (!el) return;
  el.innerHTML = LOG.map((e, i) => `<div style="opacity:${1 - i * .11}">${e.icon} ${e.text}</div>`).join('');
}

// ───────── Шимпанзе: банда, дружба, распорядок ─────────
function aiChimp2(n, dt) {
  if (n.mood && (n.moodT -= dt) <= 0) n.mood = null;
  if (n.actT > 0) { n.actT -= dt; if (n.actT <= 0) n.act = null; }
  const me = nearestPlayer(n); if (!me) return; const dme = dist(n, me);
  if (n.fleeT > 0) { n.fleeT -= dt; n.act = null; n.goal = null; stepAround(n, n.x - me.x, n.y - me.y, dt, 3.2, { noWater: true }); return; }
  if (n.gang) { gangAI(n, dt); return; }
  const b = nearestPickup(n, 'banana', 9);
  if (b && !isNight()) { n.act = null; if (goTo(n, b.x, b.y, dt, 2.4, { noWater: true }) || dist(n, b) < .6) { eatPickup(n, b); n.bond = Math.min(100, n.bond + 18); n.mood = 'happy'; n.moodT = 2; n.act = 'eat'; n.actT = 1; checkBond(n, nearestPlayer(b)); } return; }
  n.want = n.bond < 50 && dme < 7 && bananasOf(me) > 0;
  if (n.bond >= 50 && dme < 14 && !isNight()) {
    n.act = null;
    if (dme > 3.4 && Math.abs(me.z - n.z) < 1.6) goTo(n, me.x + rnd(-1, 1), me.y + rnd(-1, 1), dt, 3.0, { noWater: true }); else n.moving = false;
    return;
  }
  routineAI(n, dt);
}
// распорядок: утро — завтрак у бананов, день — игры, вечер — груминг, ночь — сон
function routineAI(n, dt) {
  const ph = dayPhase(), slot = isNight() ? 'sleep' : ph < .36 ? 'eat' : ph < .6 ? 'play' : 'groom';
  if (n.slot !== slot) { n.slot = slot; n.goal = null; n.loopT = 0; }
  if (!n.goal) n.goal = pickGoal(n, slot);
  if (!n.goal) { n.act = null; wander(n, dt, 1.2, 7); return; }
  const d = Math.hypot(n.goal.x - n.x, n.goal.y - n.y);
  if (d > .5) {
    const px = n.x, py = n.y; n.act = null; if (goTo(n, n.goal.x, n.goal.y, dt, slot === 'sleep' ? 1.6 : 1.3, { noWater: true })) { n.goal.x = n.x; n.goal.y = n.y; }   // ближе не подойти — делаем дело здесь
    n.stuckR = Math.hypot(n.x - px, n.y - py) < .3 * dt ? (n.stuckR || 0) + dt : 0; if (n.stuckR > 1.5) { n.goal = null; n.stuckR = 0; }
    return;
  }
  n.moving = false; n.loopT += dt; n.act = n.goal.act;
  if (n.goal.face) setFacing(n, n.goal.face.x - n.x, n.goal.face.y - n.y);
  if (n.loopT > n.goal.dur) { n.goal = null; n.loopT = 0; }
}
function spotNear(o, r = 1.2) { for (let i = 0; i < 10; i++) { const a = rnd(0, 6.28), x = o.x + Math.cos(a) * r, y = o.y + Math.sin(a) * r; if (tileFree(x, y)) return { x, y }; } return null; }
function pickGoal(n, slot) {
  const W = G.W, near = (types, rad) => { const c = W.objs.filter(o => types.includes(o.type) && Math.hypot(o.x - n.hx, o.y - n.hy) < rad); return c.length ? pick(c) : null; };
  if (slot === 'sleep') { if (!n.bed) { const t = near(['tree', 'banana_tree'], 12); n.bed = t ? spotNear(t, .9) : null; } return n.bed ? { ...n.bed, act: 'sleep', dur: 999 } : null; }
  if (slot === 'eat') { const t = near(['banana_tree', 'coco_palm', 'bush'], 14); const s = t && spotNear(t); return s ? { ...s, act: 'eat', dur: rnd(5, 9), face: t } : null; }
  if (slot === 'play') { const t = near(['swing', 'frame', 'drums', 'gong', 'box'], 22); const s = t && spotNear(t, 1.3); return s ? { ...s, act: Math.random() < .5 ? 'up' : 'show', dur: rnd(4, 7), face: t } : null; }
  const mate = G.npcs.find(m => m !== n && m.sp === 'chimp' && !m.gang && m.goal && m.goal.act === 'groom' && Math.hypot(m.x - n.x, m.y - n.y) < 12);
  if (mate) { const s = spotNear(mate, .8); return s ? { ...s, act: 'groom', dur: rnd(6, 10), face: mate } : null; }
  const s = spotNear({ x: n.hx, y: n.hy }, rnd(.5, 3)); return s ? { ...s, act: 'groom', dur: rnd(6, 10) } : null;
}
// ── банда ──
function gangAI(n, dt) {
  const owner = livePlayers().find(p => p.netId === n.gang);
  n.loyal -= dt * .5;                                   // ~3,5 минуты без подкормки — и уйдёт
  if (!owner || n.loyal <= 0) { leaveGang(n, owner); return; }
  const oa = owner.act && owner.act.type;
  if ((oa === 'eat' || oa === 'hoot' || oa === 'show') && !(n.actT > 0)) { n.act = oa === 'show' ? 'show' : oa; n.actT = .9; }
  if (n.queue && n.queue.length && n.queue[0].at <= G.t) gangThrowOne(n, owner, n.queue.shift());
  if (n.fetchCool > 0) n.fetchCool -= dt;
  if (!n.fetch && !(n.fetchCool > 0) && bananasOf(owner) < 4 && Math.random() < dt * .08) {
    const trees = G.W.objs.filter(o => o.type === 'banana_tree' && o.bananas > 0 && Math.hypot(o.x - owner.x, o.y - owner.y) < 14);
    if (trees.length) { n.fetch = { tree: pick(trees), got: false }; logEv('🍌', `${n.name} побежал за бананом для тебя`); }
  }
  if (n.fetch) {
    const f = n.fetch; f.t = (f.t || 0) + dt;
    const follow = (goal) => { if (!f.path) f.path = findPath(G.W, n, goal) || []; const nx = f.path[0]; if (nx) { if (goTo(n, nx.x, nx.y, dt, 3.0, { noWater: true })) f.path.shift(); return false; } return goTo(n, goal.x, goal.y, dt, 3.0, { noWater: true }) || Math.hypot(n.x - goal.x, n.y - goal.y) < 1.3; };
    if (f.t > 30) { n.fetch = null; n.carry = false; n.fetchCool = 15; return; }
    if (!f.got) {
      if (!f.spot) { f.spot = spotNear(f.tree, 1.1); if (!f.spot) { n.fetch = null; n.fetchCool = 10; return; } }
      if (follow(f.spot)) { if (f.tree.bananas > 0) { f.tree.bananas--; f.tree.regrow = 0; f.got = true; f.path = null; n.carry = true; n.act = 'eat'; n.actT = .5; } else { n.fetch = null; n.fetchCool = 10; } }
    } else if (dist(n, owner) < 1.4 || follow({ x: owner.x, y: owner.y })) {
      n.carry = false; n.fetch = null; n.fetchCool = 25; n.loyal = Math.min(100, n.loyal + 5);
      if (owner.me) giftToMe('banana', n.name); else NET.sendTo(owner.netId, { t: 'ev', ev: 'gift', item: 'banana', name: n.name });
    } else if (f.got && (f.rp = (f.rp || 0) + dt) > 2) { f.rp = 0; f.path = null; }
    return;
  }
  const idx = gangOf(n.gang).indexOf(n), a = idx * 1.3 + 2.4, tx = owner.x + Math.cos(a) * 1.6, ty = owner.y + Math.sin(a) * 1.6, d = Math.hypot(tx - n.x, ty - n.y);
  if (dist(n, owner) > 18) { n.x = owner.x - 1; n.y = owner.y; n.z = groundAt(G.W, n.x, n.y); }
  if (d > .6 && Math.abs(owner.z - n.z) < 1.6) { goTo(n, tx, ty, dt, dist(n, owner) > 4 ? 4.2 : 2.6, { noWater: true }); n.act = n.actT > 0 ? n.act : null; } else n.moving = false;
}
function giftToMe(item, name) { G.inv[item] = Math.min(9, (G.inv[item] || 0) + 1); floater(G.me.x, G.me.y, G.me.z + 3, '+' + (item === 'banana' ? 'банан' : item) + ' от ' + name, P_.yel); logEv('🎁', `${name} принёс тебе банан`); sfx.eat(); }
function leaveGang(n, owner) {
  n.gang = null; n.loyal = 0; n.bond = 30; n.friend = false; n.queue = []; n.fetch = null; n.carry = false;
  if (owner) reward(owner, { toast: [`${n.name} ушёл из банды — лояльность кончилась. Подкармливай бандитов бананами!`, 'bad'] });
}
function gangThrowOne(n, owner, q) {
  const from = { x: n.x, y: n.y, z: n.z + 1.3 }, tgt = { x: q.tgt.x + rnd(-.5, .5), y: q.tgt.y + rnd(-.5, .5), z: q.tgt.z };
  const sol = solveFrom(from, tgt, 12); setFacing(n, tgt.x - n.x, tgt.y - n.y); n.act = 'throw'; n.actT = .45;
  spawnProj('poop', owner, sol, false, from); spawnProjOwnerTag(n);
  NET.bcast({ t: 'proj', k: 'poop', x: from.x, y: from.y, z: from.z, vx: sol.vx, vy: sol.vy, vz: sol.vz });
}
function spawnProjOwnerTag(src) { const q = G.proj[G.proj.length - 1]; if (q) { q.gang = true; q.src = src; } }
function hostGangThrow(owner, tgt) { gangOf(owner.netId).forEach((n, i) => { n.queue = n.queue || []; n.queue.push({ at: G.t + .3 + i * .18, tgt }); }); }
function gangMimicThrow(tgt) { if (!gangOf(NET.id).length) return; if (isHost()) hostGangThrow(G.me, tgt); else NET.send({ t: 'gangThrow', x: tgt.x, y: tgt.y, z: tgt.z }); }
function hostRecruit(p, n) {
  const cap = rankOf(p), have = gangOf(p.netId).length;
  if (n.gang || n.bond < 50 || have >= cap) return false;
  n.gang = p.netId; n.loyal = 100; n.queue = []; n.goal = null;
  reward(p, { toast: [`${n.name} вступил в твою банду! (${have + 1}/${cap})`, 'good'], sfx: 'up', fl: [n.x, n.y, n.z + 3, 'В БАНДЕ!', P_.org] });
  return true;
}

// ───────── Мартышки: одна стая — одна сущность ─────────
function newTroop(W) {
  const p = W.spawnTroop || { x: N * .6, y: N * .4 };
  return Object.assign(mk({ sp: 'troop', x: p.x, y: p.y, z: 0, rz: 0, hx: p.x, hy: p.y, nx: p.x, ny: p.y, nz: 0, name: 'Мартышки', wait: 0, fleeT: 0, stealCool: 5 }),
    { members: Array.from({ length: 5 }, (_, i) => ({ ox: Math.cos(i * 1.26) * .6, oy: Math.sin(i * 1.26) * .6, ph: i * 1.7 })) });
}
function aiTroop(n, dt) {
  if (n.stealCool > 0) n.stealCool -= dt;
  const me = nearestPlayer(n); if (!me) return; const dme = dist(n, me);
  if (n.fleeT > 0) { n.fleeT -= dt; stepAround(n, n.x - me.x, n.y - me.y, dt, 4.5, { noWater: true, r: .4 }); return; }
  let food = null, fd = 9; for (const p of G.pickups) if (!p.fly && ['banana', 'peanut', 'nut'].includes(p.type)) { const d = dist(n, p); if (d < fd) { fd = d; food = p; } }
  if (food) { if (goTo(n, food.x, food.y, dt, 3.6, { noWater: true, r: .4 }) || fd < .7) { eatPickup(n, food); logEv('🐒', 'Мартышки утащили еду с земли'); SND.monkey(n); } return; }
  if (dme < 1.4 && bananasOf(me) > 0 && n.stealCool <= 0 && !me.tween) {
    n.stealCool = 30; n.fleeT = 3; SND.monkey(n);
    hurtPlayer(me, { loseOne: 'banana', toast: ['🐒 Мартышки стащили у тебя банан!', 'bad'], fl: [me.x, me.y, me.z + 3, '−банан', P_.red] });
    return;
  }
  wander(n, dt, 2.4, 11);
  if (Math.random() < dt * .03) SND.monkey(n);
}

// ───────── Смелые посетители перелезают в вольер ─────────
function spawnIntruder() {
  const brave = G.vis.filter(v => v.on && v.kind === 'brave'); if (!brave.length || G.intruders.length) return;
  const v = pick(brave), x = v.side === 'n' ? clamp(v.x, 2, N - 2) : 1.2, y = v.side === 'n' ? 1.2 : clamp(v.y, 2, N - 2);
  if (!tileFree(x, y, false)) return;
  v.on = false; v.next = 999;
  const it = mk({ id: ++G.pid, x, y, z: groundAt(G.W, x, y), rz: 0, hp: 3, state: 'wander', from: G.vis.indexOf(v), hx: N / 2, hy: N / 2, wait: 0, lastBy: null });
  G.intruders.push(it);
  const msg = '🧗 Смелый посетитель перелез в вольер! Выгони его говном (3 попадания), пока его не вывел смотритель';
  for (const p of livePlayers()) reward(p, { toast: [msg, 'bad'] });
}
function updateIntruders(dt) {
  if (zooOpen()) { G.braveT = (G.braveT || 0) + dt; if (G.braveT > DAY_LEN / 24) { G.braveT = 0; if (Math.random() < .05) spawnIntruder(); } }
  for (let i = G.intruders.length - 1; i >= 0; i--) {
    const it = G.intruders[i];
    if (it.state === 'flee' || it.state === 'escorted') {
      const exit = it.state === 'escorted' ? G.keeper : nearestEdge(it);
      if (it.state === 'flee') { const dx = exit.x - it.x, dy = exit.y - it.y, d = Math.hypot(dx, dy); if (d < .3 || it.x < -.3 || it.y < -.3 || it.y > N + .3) { G.intruders.splice(i, 1); logEv('🏃', 'Смельчак перелез обратно через забор'); continue; } it.x += dx / d * 4 * dt; it.y += dy / d * 4 * dt; setFacing(it, dx, dy); it.moving = true; it.z = groundAt(G.W, it.x, it.y); it.rz = it.z; continue; }
      else { const k = G.keeper; goTo(it, k.x - k.dx * .8, k.y - k.dy * .8, dt, 2.6); if (k.state !== 'escort') { G.intruders.splice(i, 1); continue; } }
    } else { wander(it, dt, 1.4, 8); if (!it.moving && Math.random() < dt * .3) it.act = 'phone'; else if (it.moving) it.act = null; }
    physics(it, dt);
  }
}
function nearestEdge(e) { const c = [{ x: e.x, y: -.5 }, { x: -.5, y: e.y }, { x: e.x, y: N + .5 }]; return c.sort((a, b) => dist(a, e) - dist(b, e))[0]; }
function hitIntruder(by, kind, it) {
  if (!it || it.state !== 'wander') return;
  if (kind === 'poop' || kind === 'pee' || kind === 'stone' || kind === 'mega' || kind === 'tire' || kind === 'whip') {
    it.hp -= kind === 'mega' || kind === 'tire' ? 3 : 1; it.lastBy = by; it.emo = { t: 1.5, s: it.hp > 0 ? 'ЭЙ!' : 'БЕГУ!' };
    reward(by, { score: 5, fl: [it.x, it.y, it.z + 3, it.hp > 0 ? 'ещё ' + it.hp : 'ВЫГНАЛ!', P_.org] });
    if (it.hp <= 0) { it.state = 'flee'; reward(by, { score: 40, cnt: { intruders: 1 }, toast: ['🏃 Ты выгнал смельчака из вольера! +40', 'good'], sfx: 'up' }); }
  }
}

// ───────── Распорядок смотрителя: кормёжка и вывод нарушителей ─────────
function keeperRoutine(k, dt) {
  const W = G.W, ph = dayPhase();
  if (k.state === 'patrol') {
    const it = G.intruders.find(i => i.state === 'wander');
    if (it) { k.state = 'escort'; k.path = null; k.escortT = 0; return true; }
    const slot = ph > .32 && ph < .34 ? 1 : ph > .66 && ph < .68 ? 2 : 0;
    if (slot && k.fedSlot !== slot + G.day * 10) { k.fedSlot = slot + G.day * 10; k.state = 'feed'; k.path = null; logEv('🪣', 'Смотритель несёт еду в вольер'); return true; }
    return false;
  }
  if (k.state === 'feed') {
    if (!W.feed) W.feed = (() => { for (let r = 1; r < 8; r++) for (let i = 0; i < 12; i++) { const x = N / 2 + Math.cos(i) * r, y = N / 2 + Math.sin(i) * r; if (tileFree(x, y) && groundAt(W, x, y) === 0) return { x, y }; } return W.spawn; })();
    if (!k.path) k.path = findPath(W, k, W.feed) || [];
    const nx = k.path[0]; if (nx) { if (goTo(k, nx.x, nx.y, dt, k.speedP)) k.path.shift(); return true; }
    for (let i = 0; i < 4; i++) addPickup({ type: 'banana', x: k.x + rnd(-1.2, 1.2), y: k.y + rnd(-1.2, 1.2), z: groundAt(W, k.x, k.y), fly: { sx: k.x, sy: k.y, t: 0, fl: .5 }, age: 0, life: 50 });
    k.state = 'patrol'; k.wait = 2; k.path = null; logEv('🍌', 'Смотритель высыпал бананы — все бегут к кормушке'); return true;
  }
  if (k.state === 'escort') {
    const it = G.intruders.find(i => i.state === 'wander' || i.state === 'escorted');
    if (!it) { k.state = 'patrol'; return true; }
    k.escortT += dt;
    if (it.state === 'wander') { goTo(k, it.x, it.y, dt, 3.2); if (dist(k, it) < 1) { it.state = 'escorted'; k.path = findPath(W, k, { x: N - 1.5, y: W.gate.y + .5 }) || []; logEv('👮', 'Смотритель поймал смельчака и ведёт к выходу'); } }
    else { const nx = k.path && k.path[0]; if (nx) { if (goTo(k, nx.x, nx.y, dt, 2.4)) k.path.shift(); } else { k.state = 'patrol'; k.path = null; } }
    if (k.escortT > 70) k.state = 'patrol';
    return true;
  }
  return false;
}

// ───────── Посетители с характером ─────────
function visitorMood(dt) {   // хост: задиры бросают мусор в обезьян
  for (const v of G.vis) {
    if (!v.on || v.a < .8 || v.kind !== 'bully') continue;
    v.bullyT = (v.bullyT ?? rnd(8, 20)) - dt; if (v.bullyT > 0) continue; v.bullyT = rnd(15, 30);
    const p = nearestPlayer(v, q => !q.invuln && dist(q, v) < 9); if (!p) continue;
    v.emo = { t: 2, s: 'ХА-ХА!' };
    const from = { x: v.x, y: v.y, z: 2 }, sol = solveFrom(from, { x: p.x, y: p.y, z: p.z + .5 }, 12);
    spawnProj('stone', G.me, sol, true, from); NET.bcast({ t: 'proj', k: 'stone', x: from.x, y: from.y, z: from.z, vx: sol.vx, vy: sol.vy, vz: sol.vz });
    setTimeout(() => { if (dist(p, v) < 11 && !p.invuln) hurtPlayer(p, { stun: .3, fl: [p.x, p.y, p.z + 3, 'задира попал огрызком', P_.red], toast: ['😠 Задира из толпы кинул в тебя огрызком — ответь ему!', 'bad'] }); }, sol.T * 1000);
  }
}
