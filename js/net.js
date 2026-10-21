'use strict';
// ───────── Сеть без сервера (P2P) ─────────
// Хост (тот, кто создал сессию) считает общий мир. Гости считают сами себя и шлют хосту свои действия.
// Комната = сид мира. Транспорт: PeerJS (WebRTC, через интернет) или BroadcastChannel (вкладки одного браузера, для проверки: ?net=bc).
const NET = {
  role: 'solo', id: 'host', tr: null, room: '', ver: 2,
  send(m) { if (this.role === 'client' && this.tr) this.tr.sendToHost(m); },                 // гость → хосту
  sendTo(id, m) { if (this.role === 'host' && this.tr && id !== 'host') this.tr.sendTo(id, m); }, // хост → одному гостю
  bcast(m, except) { if (this.role === 'host' && this.tr) this.tr.bcast(m, except); },         // хост → всем гостям
  accP: 0, accS: 0, accO: 0, last: new Map(), lost: false,
};
const isHost = () => NET.role !== 'client';
const isNet = () => NET.role !== 'solo';
const FUR_IDS = ['brown', 'ginger', 'dark', 'grey'];
const roomKey = seed => hashStr(String(seed).trim().toLowerCase()).toString(36);
const USE_BC = new URLSearchParams(location.search).get('net') === 'bc';
const r2 = v => Math.round(v * 100) / 100;

// ── транспорты ──
function openTransport(role, room) {
  return USE_BC ? trBroadcast(role, room) : trPeer(role, room);
}
function trPeer(role, room) {
  return new Promise((res, rej) => {
    if (typeof Peer === 'undefined') return rej(new Error('Не загрузилась библиотека связи (нужен интернет). Для проверки на одном компьютере добавь ?net=bc к адресу.'));
    const hostId = 'chimpzoo2-' + room; let onMsg = () => { }, onLeave = () => { };
    if (role === 'host') {
      const peer = new Peer(hostId, { debug: 0 }), conns = new Map();
      peer.on('open', () => res({ kind: 'peer', sendTo: (id, m) => { const c = conns.get(id); if (c && c.open) c.send(m); }, bcast: (m, ex) => { for (const [id, c] of conns) if (id !== ex && c.open) c.send(m); }, close: () => peer.destroy(), set onmsg(f) { onMsg = f; }, set onleave(f) { onLeave = f; } }));
      peer.on('error', e => rej(new Error(e.type === 'unavailable-id' ? 'Сессия с таким сидом уже создана — выбери другой сид' : 'Ошибка связи: ' + e.type)));
      peer.on('connection', c => { conns.set(c.peer, c); c.on('data', m => onMsg(c.peer, m)); c.on('close', () => { conns.delete(c.peer); onLeave(c.peer); }); c.on('error', () => { }); });
    } else {
      const peer = new Peer({ debug: 0 }); let done = false;
      const fail = msg => { if (!done) { done = true; try { peer.destroy(); } catch (e) { } rej(new Error(msg)); } };
      setTimeout(() => fail('Не удалось подключиться (сессия не найдена или сеть закрыта)'), 9000);
      peer.on('error', e => fail(e.type === 'peer-unavailable' ? 'Сессия с таким сидом не найдена' : 'Ошибка связи: ' + e.type));
      peer.on('open', myId => {
        const c = peer.connect(hostId, { serialization: 'json', reliable: true });
        c.on('open', () => { done = true; res({ kind: 'peer', id: myId, sendToHost: m => { if (c.open) c.send(m); }, close: () => peer.destroy(), set onmsg(f) { onMsg = f; }, set onleave(f) { onLeave = f; } }); });
        c.on('data', m => onMsg('host', m)); c.on('close', () => onLeave('host')); c.on('error', () => { });
      });
    }
  });
}
function trBroadcast(role, room) {
  return new Promise((res, rej) => {
    const ch = new BroadcastChannel('chimpzoo2-' + room), myId = role === 'host' ? 'host' : 'bc' + Math.random().toString(36).slice(2, 8);
    let onMsg = () => { }, onLeave = () => { };
    const post = (to, m) => ch.postMessage({ f: myId, to, m });
    addEventListener('beforeunload', () => post(role === 'host' ? '*' : 'host', { t: 'bye' }));
    if (role === 'host') {
      let taken = false;
      ch.onmessage = e => { const { f, to, m } = e.data; if (m.t === 'taken') taken = true; };
      post('*', { t: 'probe' });
      setTimeout(() => {
        if (taken) return rej(new Error('Сессия с таким сидом уже создана — выбери другой сид'));
        ch.onmessage = e => { const { f, to, m } = e.data; if (m.t === 'probe') { post(f, { t: 'taken' }); return; } if (to === 'host') { if (m.t === 'bye') onLeave(f); else onMsg(f, m); } };
        res({ kind: 'bc', sendTo: (id, m) => post(id, m), bcast: (m, ex) => post('*x:' + (ex || ''), m), close: () => ch.close(), set onmsg(f) { onMsg = f; }, set onleave(f) { onLeave = f; } });
      }, 350);
    } else {
      let alive = false;
      ch.onmessage = e => { const { f, to, m } = e.data; if (f !== 'host') return; if (m.t === 'taken') { if (!alive) { alive = true; finish(); } return; } if (to === myId || (to === '*') || (to.startsWith('*x:') && to.slice(3) !== myId)) { if (m.t === 'bye') onLeave('host'); else onMsg('host', m); } };
      post('*', { t: 'probe' });
      function finish() { res({ kind: 'bc', id: myId, sendToHost: m => post('host', m), close: () => ch.close(), set onmsg(f) { onMsg = f; }, set onleave(f) { onLeave = f; } }); }
      setTimeout(() => { if (!alive) rej(new Error('Сессия с таким сидом не найдена')); }, 1200);
    }
  });
}

// ── запуск роли ──
async function netHostOpen(seed) {
  const tr = await openTransport('host', roomKey(seed));
  NET.role = 'host'; NET.id = 'host'; NET.tr = tr; NET.room = roomKey(seed); NET.lost = false;
  tr.onmsg = hostOnMsg; tr.onleave = hostOnLeave;
}
function netJoinOpen(seed, name) {
  return new Promise(async (res, rej) => {
    let tr; try { tr = await openTransport('client', roomKey(seed)); } catch (e) { return rej(e); }
    NET.role = 'client'; NET.id = tr.id; NET.tr = tr; NET.lost = false; NET.room = roomKey(seed);
    const t = setTimeout(() => { try { tr.close(); } catch (e) { } NET.role = 'solo'; rej(new Error('Хост не ответил')); }, 6000);
    tr.onmsg = (from, m) => { if (m.t === 'welcome') { clearTimeout(t); tr.onmsg = clientOnMsg; res(m); } else if (m.t === 'deny') { clearTimeout(t); NET.role = 'solo'; rej(new Error(m.why || 'Отказано')); } };
    tr.onleave = () => { if (!NET.lost) clientLost(); };
    tr.sendToHost({ t: 'hello', name, v: NET.ver });
  });
}
function netClose() { try { NET.tr && NET.tr.close(); } catch (e) { } NET.tr = null; NET.role = 'solo'; NET.id = 'host'; }
function clientLost() { NET.lost = true; if (G.state === 'play') { G.state = 'lost'; $('lostBox').style.display = 'flex'; } }

// ── объекты: синхронизация изменений (разница) ──
const DYN = ['bananas', 'sticks', 'berries', 'stones', 'nuts', 'hp', 'dug', 'opened', 'cocos'], TRANS = ['cool', 'active', 'ring', 'boostCool'];
function objDyn(o) { const r = {}; for (const f of DYN) if (o[f] !== undefined) r[f] = o[f]; return r; }
function allObjDyn() { const r = {}; for (const o of G.W.objs) { const d = objDyn(o); if (Object.keys(d).length) r[o.id] = d; } return r; }
function applyObj(o, f) { for (const k in f) { if (TRANS.includes(k)) { o[k] = Math.max(o[k] || 0, f[k]); o['_l' + k] = o[k]; } else o[k] = f[k]; } NET.last.set(o.id, JSON.stringify(objDyn(o))); }
function objDiffTick() {
  for (const o of G.W.objs) {
    const d = objDyn(o); const s = JSON.stringify(d), prev = NET.last.get(o.id); let f = null;
    if (prev !== s) { f = { ...d }; NET.last.set(o.id, s); }
    for (const k of TRANS) { const v = o[k] || 0, lv = o['_l' + k] || 0; if (v > lv + .5) { f = f || {}; f[k] = v; } o['_l' + k] = v; }
    if (f) { const m = { t: 'obj', id: o.id, f }; if (isHost()) NET.bcast(m); else NET.send(m); }
  }
}

// ── снимок мира (хост → гостям) ──
function buildSnap() {
  const k = G.keeper;
  return {
    t: 's', day: G.day, dayT: Math.round(G.dayT * 10) / 10, gate: G.gateOpen ? 1 : 0, key: G.keyHolder || 0, duel: G.duel, pid: G.pid,
    pl: livePlayers().map(p => ({ id: p.netId, x: r2(p.me ? p.x : p.x), y: r2(p.y), z: r2(p.z), fx: p.fx, fb: p.fb ? 1 : 0, mv: p.moving ? 1 : 0, sp: p.sprint ? 1 : 0, cr: p.crouch ? 1 : 0, a: p.act ? p.act.type : '', n: p.name, fu: p.fur.id, sc: p.me ? G.score : (p.score || 0), lv: p.me ? lvSum() : (p.lv || 4), hr: p.me ? hoolRank() : (p.hr || 0), hp: p.me ? hoolPts() : (p.hp || 0), sl: p.splat > 0 ? 1 : 0, iv: p.invuln > 0 ? 1 : 0, dp: p.dirtP || 0, db: p.dirtB || 0 })),
    k: { x: r2(k.x), y: r2(k.y), z: r2(k.z), fx: k.fx, fb: k.fb ? 1 : 0, mv: k.moving ? 1 : 0, st: k.state, dx: r2(k.dx), dy: r2(k.dy), hk: k.hasKey ? 1 : 0, vr: k.visRange },
    n: G.npcs.map(n => { const s = { x: r2(n.x), y: r2(n.y), z: r2(n.z), fx: n.fx, fb: n.fb ? 1 : 0, mv: n.moving ? 1 : 0 }; if (n.sp === 'chimp') Object.assign(s, { b: Math.round(n.bond), f: n.friend ? 1 : 0, w: n.want ? 1 : 0, m: n.mood || 0, bc: Math.round(n.boostCool * 10) / 10, g: n.gang || 0, l: Math.round(n.loyal), a: n.act || 0, c: n.carry ? 1 : 0, h: n.hool || 0 }); else if (n.sp === 'troop') s.fl = n.fleeT > 0 ? 1 : 0; else if (n.sp === 'gorilla') Object.assign(s, { st: n.state, a: n.act || '' }); else if (n.sp === 'parrot') Object.assign(s, { fl: n.flying ? 1 : 0, sy: n.sayT > 0 ? n.say : '' }); return s; }),
    it: G.intruders.map(i => [i.id, r2(i.x), r2(i.y), r2(i.z), i.state, i.from, i.act || 0, i.emo ? i.emo.s : '']),
    v: G.vis.map(v => [v.on ? 1 : 0, v.cheer > 0 ? 1 : 0, v.splat > 0 ? 1 : 0, v.emo ? v.emo.s : '']),
    pk: G.pickups.map(p => [p.id, p.type, r2(p.x), r2(p.y), r2(p.z), p.fly ? r2(p.fly.t) : -1, p.fly ? r2(p.fly.sx) : 0, p.fly ? r2(p.fly.sy) : 0, p.fly ? p.fly.fl : 0]),
  };
}
function applySnap(m) {
  G.gateOpen = !!m.gate; G.keyHolder = m.key || null; if (m.day) { G.day = m.day; G.dayT = m.dayT; } G.duel = m.duel || null; G.pid = Math.max(G.pid, m.pid || 0);
  // игроки
  const seen = new Set();
  for (const s of m.pl) {
    seen.add(s.id); if (s.id === NET.id) continue;
    let p = G.players.find(q => q.netId === s.id);
    if (!p) { p = mkRemote(s.id, s.n, s.fu); p.x = p.tx = s.x; p.y = p.ty = s.y; G.players.push(p); }
    p.tx = s.x; p.ty = s.y; p.tz = s.z; p.fx = s.fx; p.fb = !!s.fb; p.moving = !!s.mv; p.sprint = !!s.sp; p.crouch = !!s.cr; p.act = s.a ? { type: s.a, t: 0, dur: 0 } : null; p.score = s.sc; p.lv = s.lv; p.name = s.n; p.hr = s.hr; p.hp = s.hp; p.splat = s.sl ? 2 : 0; p.invuln = s.iv ? 1 : 0; p.dirtP = s.dp; p.dirtB = s.db;
  }
  G.players = G.players.filter(p => p.me || seen.has(p.netId));
  // смотритель
  const k = G.keeper, s = m.k; k.nx = s.x; k.ny = s.y; k.nz = s.z; k.fx = s.fx; k.fb = !!s.fb; k.moving = !!s.mv; k.state = s.st; k.dx = s.dx; k.dy = s.dy; k.hasKey = !!s.hk; k.visRange = s.vr;
  // животные
  m.n.forEach((s, i) => {
    const n = G.npcs[i]; if (!n) return; n.nx = s.x; n.ny = s.y; n.nz = s.z; n.fx = s.fx; n.fb = !!s.fb; n.moving = !!s.mv;
    if (n.sp === 'chimp') { n.bond = s.b; n.friend = !!s.f; n.want = !!s.w; n.mood = s.m || null; n.boostCool = s.bc; n.gang = s.g || null; n.loyal = s.l; n.act = s.a || null; n.carry = !!s.c; n.hool = s.h; } else if (n.sp === 'troop') n.fleeT = s.fl ? 1 : 0;
    else if (n.sp === 'gorilla') { n.state = s.st; n.act = s.a; } else if (n.sp === 'parrot') { n.flying = !!s.fl; n.say = s.sy; n.sayT = s.sy ? 1 : 0; }
  });
  // смельчаки в вольере
  if (m.it) { const old = new Map(G.intruders.map(i => [i.id, i])); G.intruders = m.it.map(a => { const o = old.get(a[0]) || mk({ id: a[0], x: a[1], y: a[2], z: a[3], rz: a[3] }); o.nx = a[1]; o.ny = a[2]; o.z = a[3]; o.state = a[4]; o.from = a[5]; o.act = a[6] || null; if (a[7] && (!o.emo || o.emo.s !== a[7])) o.emo = { t: 1.5, s: a[7] }; return o; }); }
  // зрители
  m.v.forEach((s, i) => { const v = G.vis[i]; if (!v) return; v.on = !!s[0]; if (s[1]) v.cheer = Math.max(v.cheer, 1.2); v.splat = s[2] ? Math.max(v.splat, 3) : Math.min(v.splat, 0); if (s[3] && (!v.emo || v.emo.s !== s[3])) v.emo = { t: 2, s: s[3] }; });
  // предметы на земле
  G.pickups = m.pk.map(a => ({ id: a[0], type: a[1], x: a[2], y: a[3], z: a[4], fly: a[5] >= 0 ? { t: a[5], sx: a[6], sy: a[7], fl: a[8] } : null, age: 0 }));
}
function updateNetEntities(dt) {   // гость: плавно двигаем чужие сущности к полученным позициям
  const k = 1 - Math.exp(-dt * 10);
  for (const n of G.npcs) { if (Math.hypot(n.nx - n.x, n.ny - n.y) > 6) { n.x = n.nx; n.y = n.ny; } else { n.x += (n.nx - n.x) * k; n.y += (n.ny - n.y) * k; } n.z = n.nz; n.rz = n.sp === 'parrot' ? n.z + Math.sin(G.t * 3 + n.hx) * .25 : n.rz + (n.nz - n.rz) * Math.min(1, dt * 14); if (n.sayT > 0) n.sayT -= dt; }
  for (const it of G.intruders) { if (it.nx === undefined) continue; it.x += (it.nx - it.x) * k; it.y += (it.ny - it.y) * k; it.rz += (it.z - it.rz) * Math.min(1, dt * 14); if (it.emo) { it.emo.t -= dt; if (it.emo.t <= 0) it.emo = null; } }
  const kp = G.keeper; if (Math.hypot(kp.nx - kp.x, kp.ny - kp.y) > 6) { kp.x = kp.nx; kp.y = kp.ny; } else { kp.x += (kp.nx - kp.x) * k; kp.y += (kp.ny - kp.y) * k; } kp.z = kp.nz; kp.rz += (kp.nz - kp.rz) * Math.min(1, dt * 14);
}

// ── сообщения хоста ──
const nameOf = id => (G.players.find(p => p.netId === id) || {}).name || '?';
function uniqueName(n) { n = (n || 'Гость').slice(0, 14); let r = n, i = 2; while (G.players.some(p => p.name === r)) r = n + i++; return r; }
function tellId(id, msg) { if (id === NET.id) handleEv(msg); else NET.sendTo(id, msg); }
function hostOnMsg(from, m) {
  const pl = G.players.find(p => p.netId === from);
  switch (m.t) {
    case 'hello': {
      if (G.state !== 'play') { NET.sendTo(from, { t: 'deny', why: 'Хост ещё не в игре' }); return; }
      if (m.v !== NET.ver) { NET.sendTo(from, { t: 'deny', why: 'Разные версии игры — обнови страницу' }); return; }
      if (livePlayers().length >= 6) { NET.sendTo(from, { t: 'deny', why: 'Сессия заполнена (максимум 6)' }); return; }
      if (pl) return;
      const fur = FUR_IDS[livePlayers().length % FUR_IDS.length], name = uniqueName(m.name), p = mkRemote(from, name, fur);
      G.players.push(p); NET.sendTo(from, { t: 'welcome', seed: G.W.seed, you: from, name, fur, objs: allObjDyn(), snap: buildSnap() });
      toast(`${name} присоединился к игре`, 'good'); sfx.ok(); break;
    }
    case 'p': if (!pl) return; pl.tx = m.x; pl.ty = m.y; pl.tz = m.z; pl.fx = m.fx; pl.fb = !!m.fb; pl.moving = !!m.mv; pl.sprint = !!m.sp; pl.crouch = !!m.cr; pl.act = m.a ? { type: m.a, t: 0, dur: 0 } : null; pl.score = m.sc; pl.lv = m.lv; pl.bn = m.bn; pl.heat = m.ht ? 3 : 0; pl.tween = m.tw ? {} : null; pl.splat = m.spl; pl.invuln = m.iv ? 1 : 0; pl.ch = m.ch; pl.hr = m.hr; pl.hp = m.hp; pl.dirtP = m.dp; pl.dirtB = m.db; break;
    case 'obj': { const o = G.W.objs.find(o => o.id === m.id); if (o) { applyObj(o, m.f); NET.bcast({ t: 'obj', id: m.id, f: m.f }, from); } break; }
    case 'hit': if (pl) hostHit(pl, m.k, m.tk, m.i, { x: m.x, y: m.y, z: m.z }); break;
    case 'sp': addPickup({ ...m.p, age: 0 }); break;
    case 'noise': noiseAt(m.x, m.y, m.r, m.why); break;
    case 'gangThrow': if (pl) hostGangThrow(pl, { x: m.x, y: m.y, z: m.z }); break;
    case 'mega': if (pl) megaSplash(pl, m.x, m.y); break;
    case 'scream': if (pl) hostScream(pl, m.x, m.y); break;
    case 'hoot': hostHoot(m.x, m.y); break;
    case 'cheer': hostCheer(m.side, m.secs, m.tp); break;
    case 'claimKey': if (!G.keyHolder && pl) { G.keyHolder = from; G.keeper.hasKey = false; G.keeper.speedP = 2.6; } break;
    case 'npc': { const n = G.npcs[m.i]; if (!n || !pl) return;
      if (m.op === 'give') { n.bond = Math.min(100, n.bond + 30); n.mood = 'happy'; n.moodT = 2; checkBond(n, pl); }
      else if (m.op === 'boost') n.boostCool = 2.5; else if (m.op === 'recruit') hostRecruit(pl, n); else if (m.op === 'feedGang' && n.gang === from) n.loyal = Math.min(100, n.loyal + 40); else if (m.op === 'duelWin') { n.pacified = 90; n.rage = 0; } else if (m.op === 'duelLose') n.rage = 3; break; }
    case 'keeperFail': G.keeper.cool = 6; G.keeper.state = 'chase'; G.keeper.lost = 0; G.keeper.chasing = from; break;
    case 'gate': G.gateOpen = true; break;
    case 'proj': { const owner = pl || G.me; spawnProj(m.k, owner, { vx: m.vx, vy: m.vy, vz: m.vz }, true, { x: m.x, y: m.y, z: m.z }); NET.bcast(m, from); break; }
    case 'won': if (pl) { pl.gone = true; toast(`🎉 ${pl.name} сбежал на волю! (${m.sc} очков)`, 'good'); sfx.up(); NET.bcast({ t: 'ev', ev: 'toast', txt: `🎉 ${pl.name} сбежал на волю! (${m.sc} очков)`, cls: 'good' }); if (G.keyHolder === from) G.keyHolder = null; } break;
    case 'duelReq': hostDuelReq(from, m.to); break;
    case 'duelAcc': if (!G.duel) duelStart(m.from, from); break;
    case 'ping': NET.sendTo(from, { t: 'pong' }); break;
  }
}
function hostOnLeave(id) {
  const p = G.players.find(q => q.netId === id); if (!p) return;
  toast(`${p.name} вышел из игры`); if (G.keyHolder === id) { G.keyHolder = null; G.keeper.hasKey = true; }
  G.players = G.players.filter(q => q !== p);
}
function hostDuelReq(fromId, toId) {
  if (G.duel) { tellId(fromId, { t: 'ev', ev: 'toast', txt: 'Дуэль уже идёт', cls: 'bad' }); return; }
  if (!livePlayers().some(p => p.netId === toId)) return;
  tellId(toId, { t: 'ev', ev: 'duelInvite', from: fromId, name: nameOf(fromId) });
  tellId(fromId, { t: 'ev', ev: 'toast', txt: `Вызов отправлен: ${nameOf(toId)}`, cls: '' });
}
// ── сообщения гостя ──
function clientOnMsg(from, m) {
  switch (m.t) {
    case 's': if (G.state === 'play' || G.state === 'won') applySnap(m); break;
    case 'ev': handleEv(m); break;
    case 'obj': { const o = G.W && G.W.objs.find(o => o.id === m.id); if (o) applyObj(o, m.f); break; }
    case 'proj': spawnProj(m.k, G.me, { vx: m.vx, vy: m.vy, vz: m.vz }, true, { x: m.x, y: m.y, z: m.z }); break;
  }
}
function handleEv(m) {   // события, адресованные именно мне (приходят по сети или от своего хоста)
  switch (m.ev) {
    case 'reward': applyReward(m.r); break;
    case 'hurt': applyHurt(m.h); break;
    case 'pk': collectPickup(m.type, G.me); break;
    case 'bounce': G.me.vz = 9.5 + .3 * (G.st.agi.lv - 1); G.me.grounded = false; G.cnt.bounces++; sfx.jump(); floater(G.me.x, G.me.y, G.me.z + 1, 'БОИНГ!', P_.lime); break;
    case 'alarm': sfx.bad(); toast('Смотритель заметил тебя!', 'bad'); break;
    case 'gift': giftToMe(m.item, m.name); break;
    case 'toast': toast(m.txt, m.cls || ''); break;
    case 'duelInvite': G.invite = { from: m.from, name: m.name, t: 10 }; toast(`⚔ ${m.name} вызывает тебя на дуэль! Нажми Y (10 с)`, 'good'); sfx.hoot(); break;
  }
}

// ── такт сети (вызывается из игрового цикла) ──
function netTick(dt) {
  if (!isNet() || !G.me) return;
  NET.accO += dt; if (NET.accO > .25) { NET.accO = 0; objDiffTick(); }
  if (G.invite) { G.invite.t -= dt; if (G.invite.t <= 0) G.invite = null; }
  if (isHost()) {
    NET.accS += dt; if (NET.accS > .12) { NET.accS = 0; NET.bcast(buildSnap()); }
    for (const p of G.players) if (!p.me && p.splat > 0) p.splat -= dt;
    updateDuel(dt);
  } else {
    NET.accP += dt; if (NET.accP > .07) {
      NET.accP = 0; const p = G.me;
      NET.send({ t: 'p', x: r2(p.x), y: r2(p.y), z: r2(p.z), fx: p.fx, fb: p.fb ? 1 : 0, mv: p.moving ? 1 : 0, sp: p.sprint ? 1 : 0, cr: p.crouch ? 1 : 0, a: p.act ? p.act.type : '', sc: G.score, lv: lvSum(), bn: G.inv.banana, ht: p.heat > 0 ? 1 : 0, tw: p.tween ? 1 : 0, spl: p.splat > 0 ? 1 : 0, iv: p.invuln > 0 ? 1 : 0, ch: G.st.cha.lv, hr: hoolRank(), hp: hoolPts(), dp: p.dirtP || 0, db: p.dirtB || 0 });
    }
  }
}
// ── дуэль: клиентская часть ──
function duelRequest(toId) { if (isHost()) hostDuelReq(G.me.netId, toId); else NET.send({ t: 'duelReq', to: toId }); }
function duelAccept() {
  const inv = G.invite; if (!inv) return; G.invite = null;
  if (isHost()) { if (!G.duel) duelStart(inv.from, G.me.netId); } else NET.send({ t: 'duelAcc', from: inv.from });
}
