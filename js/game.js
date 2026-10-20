'use strict';
// ───────── Игра: состояние, инструменты, взаимодействия, задания, интерфейс ─────────
const NEED_SUM = 11, MAX_LV = 5;
const STAT_META = { str: ['💪', 'Сила', '#ff7a5c'], agi: ['🤸', 'Ловкость', '#5cd6ff'], int: ['🧠', 'Интеллект', '#c59bff'], cha: ['🎭', 'Харизма', '#ffd84a'] };
const G = {
  state: 'menu', W: null, t: 0, players: [], me: null, npcs: [], keeper: null, vis: [], pickups: [], proj: [], parts: [], floaters: [], splats: [],
  mouse: { x: 240, y: 135, in: false }, aim: { x: 0, y: 0, z: 0 }, keys: new Set(), tool: 0, camSnap: true, keyHolder: null, pid: 0, duel: null, invite: null,
};
Object.defineProperty(G, 'hasKey', { get() { return G.keyHolder !== null && G.keyHolder === NET.id; } });
const inDuel = () => !!G.duel && (G.duel.a === NET.id || G.duel.b === NET.id);
function resetState() {
  Object.assign(G, {
    t: 0, score: 0, energy: 80, keyHolder: null, pid: 0, duel: null, invite: null, gateOpen: false, gateAnim: 0, combo: 0, comboT: 0, mini: null, tut: null, tutOk: false, tutDist: 0, dustT: 0, peanutT: 5,
    vineCool: 0, shotCool: 0, stickDur: 3, startedAt: performance.now(), keyHint: 0,
    st: { str: { lv: 1, xp: 0 }, agi: { lv: 1, xp: 0 }, int: { lv: 1, xp: 0 }, cha: { lv: 1, xp: 0 } },
    inv: { banana: 0, nut: 0, stone: 2, stick: 0, poop: 3, coin: 0, water: 0 },
    cnt: { banana: 0, peanut: 0, nuts: 0, fish: 0, dig: 0, treasure: 0, puzzle: 0, show: 0, drums: 0, hits: 0, viral: 0, bestCombo: 0, bestShow: 0, stolen: 0, friends: 0, decoy: 0, slips: 0, gongs: 0,
      squirts: 0, parrots: 0, summit: 0, vines: 0, jumps: 0, bounces: 0, ladders: 0, sprintT: 0, pacify: 0, locker: 0, throws: 0, shakes: 0, duels: 0 },
    pickups: [], proj: [], parts: [], floaters: [], splats: [],
  });
  QUESTS.forEach(q => q.done = false); ACHS.forEach(a => a.on = false);
}
const lvSum = () => G.st.str.lv + G.st.agi.lv + G.st.int.lv + G.st.cha.lv;

// ───────── Задания и достижения ─────────
const QUESTS = [
  { icon: '🍌', text: 'Съесть 5 бананов (R)', goal: 5, get: () => G.cnt.banana, reward: 20 },
  { icon: '🥜', text: 'Поймать 5 орешков от публики', goal: 5, get: () => G.cnt.peanut, reward: 20 },
  { icon: '🔨', text: 'Расколоть 3 ореха на наковальне', goal: 3, get: () => G.cnt.nuts, reward: 30 },
  { icon: '🥢', text: 'Выловить термитов палкой 2 раза', goal: 2, get: () => G.cnt.fish, reward: 30 },
  { icon: '⛰', text: 'Забраться в домик на вершине', goal: 1, get: () => G.cnt.summit, reward: 50 },
  { icon: '🤝', text: 'Подружиться с шимпанзе', goal: 1, get: () => G.cnt.friends, reward: 30 },
  { icon: '🧩', text: 'Решить 3 головоломки', goal: 3, get: () => G.cnt.puzzle, reward: 30 },
  { icon: '🎭', text: 'Устроить 3 шоу на сцене', goal: 3, get: () => G.cnt.show, reward: 30 },
  { icon: '💩', text: 'Попасть в зрителей 3 раза', goal: 3, get: () => G.cnt.hits, reward: 30 },
  { icon: '💎', text: 'Найти 3 клада (раскопки/сундуки)', goal: 3, get: () => G.cnt.treasure, reward: 40 },
  { icon: '🍌', text: 'Уронить смотрителя бананом', goal: 1, get: () => G.cnt.slips, reward: 40 },
  { icon: '🗝', text: 'Заполучить ключ от ворот', goal: 1, get: () => G.cnt.stolen, reward: 60 },
];
const ACHS = [
  { icon: '🍌', name: 'Первый банан', test: () => G.cnt.banana >= 1 },
  { icon: '🧗', name: 'Верхолаз — вершина горы', test: () => G.cnt.summit >= 1 },
  { icon: '🪢', name: 'Скалолаз — лиана', test: () => G.cnt.vines >= 1 },
  { icon: '🐒', name: 'Друг зверей — 3 друга', test: () => G.cnt.friends >= 3 },
  { icon: '🦍', name: 'Хитрец — отвлёк гориллу бананом 2 раза', test: () => G.cnt.decoy >= 2 },
  { icon: '🦹', name: 'Вор ключей', test: () => G.cnt.stolen >= 1 },
  { icon: '😈', name: 'Хулиган — комбо ×3', test: () => G.cnt.bestCombo >= 3 },
  { icon: '🌟', name: 'Звезда сцены — 60+ за шоу', test: () => G.cnt.bestShow >= 60 },
  { icon: '📸', name: 'Вирусный кадр', test: () => G.cnt.viral >= 1 },
  { icon: '💰', name: 'Кладоискатель — 6 кладов', test: () => G.cnt.treasure >= 6 },
  { icon: '🐢', name: 'Прыг-скок — отскочить от черепахи', test: () => G.cnt.bounces >= 1 },
  { icon: '💪', name: 'Силач — Сила 5', test: () => G.st.str.lv >= 5 },
  { icon: '🤸', name: 'Акробат — Ловкость 5', test: () => G.st.agi.lv >= 5 },
  { icon: '🧠', name: 'Гений — Интеллект 5', test: () => G.st.int.lv >= 5 },
  { icon: '🎭', name: 'Любимец публики — Харизма 5', test: () => G.st.cha.lv >= 5 },
];

// ───────── Помощники ─────────
function toast(text, cls = '') {
  const d = document.createElement('div'); d.className = 'toast ' + cls; d.textContent = text; $('toasts').appendChild(d);
  setTimeout(() => d.remove(), 3400); while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
}
function floater(x, y, z, text, col = '#fff') { G.floaters.push({ x, y, z, text, col, t: 0 }); }
function addScore(n) { G.score = Math.max(0, G.score + n); }
function addEnergy(n) { G.energy = clamp(G.energy + n, 0, 100); }
function addXp(k) {
  const s = G.st[k]; if (s.lv >= MAX_LV) return; s.xp++;
  const need = 2 + s.lv * 2;
  if (s.xp >= need) { s.xp -= need; s.lv++; toast(`${STAT_META[k][0]} ${STAT_META[k][1]} → уровень ${s.lv}!`, 'good'); sfx.up(); floater(G.me.x, G.me.y, G.me.z + 3, 'УРОВЕНЬ!', STAT_META[k][2]); emit(G.me.x, G.me.y, G.me.z + 2, 18, { kind: 'star', col: [STAT_META[k][2], '#ffe680', '#fff'], spread: 2, v0: 2, v1: 6, g: 8, life: 1.2 }); }
}
function startAct(type, dur, done) { const me = G.me; me.act = { type, t: 0, dur, done }; me.moving = false; }
function exertBlock(cost) { return G.energy >= cost ? null : 'Нет сил — съешь банан (R)!'; }
function tileKind(x, y) { const tx = Math.floor(x), ty = Math.floor(y); return tx < 0 || ty < 0 || tx >= N || ty >= N ? K.GRASS : G.W.kind[ty * N + tx]; }
function useStickDur() { G.stickDur--; if (G.stickDur <= 0) { G.inv.stick--; G.stickDur = 3; toast('Палка сломалась!', 'bad'); } }
function lootDrop(type, x, y) { addPickup({ type, x, y, z: groundAt(G.W, x, y), fly: { sx: x, sy: y, t: 0, fl: .4 }, age: 0 }); }
function eatBanana() {
  const me = G.me; if (me.act || G.mini || me.stun > 0) return;
  if (G.inv.banana <= 0) { toast('Нет бананов — сорви с пальмы (E)', 'bad'); return; }
  startAct('eat', .5, () => { G.inv.banana--; addEnergy(25); addScore(5); G.cnt.banana++; G.inv.poop = Math.min(9, G.inv.poop + 1); floater(me.x, me.y, me.z + 3, '+5  +1 заряд', P_.yel); sfx.eat(); });
}

// ───────── Взаимодействия (клавиша E) ─────────
function describe(t) {
  const me = G.me, W = G.W, o = t.o;
  switch (t.kind) {
    case 'banana_tree':
      if (o.bananas <= 0) return { text: 'Бананы ещё не созрели', bad: true };
      if (G.inv.banana >= 9) return { text: 'Карманы полны бананов (R — съесть)', bad: true };
      return { text: 'Сорвать банан', run: () => startAct('eat', .6, () => { o.bananas--; o.regrow = 0; G.inv.banana++; floater(o.x, o.y, 3, '+банан', P_.yel); sfx.eat(); emit(o.x, o.y, groundAt(W, o.x, o.y) + 4, 6, { col: [P_.g2, P_.g3], spread: 1, v0: 0, v1: 2, g: 5, life: 1.2 }); }) };
    case 'tree':
      if (o.cool > 0) return { text: 'Дерево уже трясли…', bad: true };
      return { text: 'Потрясти дерево (палки, орехи)', run: () => startAct('climb', .9, () => { o.cool = 25; G.cnt.shakes++; const r = Math.random(); lootDrop(r < .5 ? 'stick' : 'nut', o.x + rnd(-1, 1), o.y + rnd(.6, 1.4)); if (r > .7) lootDrop('nut', o.x + rnd(-1, 1), o.y + 1); emit(o.x, o.y, groundAt(W, o.x, o.y) + 4, 10, { kind: 'dust', col: P_.g2, spread: 1.4, v0: 0, v1: 1, g: 3, life: 1 }); sfx.tick(); }) };
    case 'bush':
      if (o.sticks > 0) return { text: 'Взять палку (инструмент 4)', run: () => startAct('eat', .5, () => { o.sticks--; o.regrow = 0; G.inv.stick = Math.min(5, G.inv.stick + 1); floater(o.x, o.y, 2, '+палка', P_.d3); sfx.tick(); }) };
      if (o.berries > 0) return { text: 'Съесть ягоды (+энергия)', run: () => startAct('eat', .5, () => { o.berries--; o.regrow = 0; addEnergy(10); addScore(2); floater(o.x, o.y, 2, '+10 сил', P_.red); sfx.eat(); }) };
      return { text: 'Пусто', bad: true };
    case 'stonepile':
      if (o.stones <= 0) return { text: 'Камней больше нет', bad: true };
      return { text: 'Взять камень (инструмент 3)', run: () => startAct('eat', .4, () => { o.stones--; o.regrow = 0; G.inv.stone = Math.min(9, G.inv.stone + 1); floater(o.x, o.y, 2, '+камень', P_.r3); sfx.tick(); }) };
    case 'nutpile':
      if (o.nuts <= 0) return { text: 'Орехов больше нет', bad: true };
      return { text: 'Взять орех', run: () => startAct('eat', .4, () => { o.nuts--; o.regrow = 0; G.inv.nut = Math.min(9, G.inv.nut + 1); floater(o.x, o.y, 2, '+орех', P_.d3); sfx.tick(); }) };
    case 'anvil':
      if (G.inv.nut <= 0) return { text: 'Нужен орех (кучка рядом, потряси деревья)', bad: true };
      if (G.inv.stone <= 0) return { text: 'Нужен камень-молоток', bad: true };
      return { text: 'Колоть орех камнем (тайминг!)', run: () => startMini({ type: 'crack', o }) };
    case 'termite':
      if (G.inv.stick <= 0) return { text: 'Нужна палка для термитов (кусты, трясти деревья)', bad: true };
      if (o.hp <= 0) return { text: 'Термиты ушли — вернутся позже', bad: true };
      return { text: 'Выловить термитов палкой', run: () => startAct('fish', 2.4, () => { o.hp--; o.regrow = 0; useStickDur(); addEnergy(18); addXp('int'); addScore(15); G.cnt.fish++; floater(o.x, o.y, 3, '+18 сил  +15', P_.lime); sfx.ok(); }) };
    case 'dig':
      if (o.dug) return null;
      return { text: G.inv.stick > 0 ? 'Копать палкой (быстро)' : 'Копать лапами', run: () => startAct('dig', G.inv.stick > 0 ? .9 : 1.7, () => {
        o.dug = true; G.cnt.dig++; G.cnt.treasure++; sfx.ok();
        const l = o.loot; if (l === 'coin') { for (let i = 0; i < 2; i++) lootDrop('coin', o.x + rnd(-.6, .6), o.y + rnd(.3, 1)); addScore(20); floater(o.x, o.y, 3, 'Клад! +20', P_.yel); } else { lootDrop(l, o.x, o.y + .6); floater(o.x, o.y, 3, 'Находка!', P_.yel); addScore(10); }
        emit(o.x, o.y, groundAt(W, o.x, o.y), 8, { kind: 'dust', spread: 1, v0: 1, v1: 3, g: 6, life: .6 });
      }) };
    case 'chest':
      if (o.opened) return null;
      return { text: 'Открыть сундук', run: () => startAct('dig', 1.2, () => { o.opened = true; G.cnt.treasure++; const n = o.tier2 ? 5 : 4; for (let i = 0; i < n; i++) lootDrop('coin', o.x + rnd(-1, 1), o.y + rnd(-1, 1)); lootDrop('banana', o.x, o.y + 1); addScore(o.tier2 ? 80 : 60); floater(o.x, o.y, 4, 'СУНДУК! +' + (o.tier2 ? 80 : 60), P_.yel); emit(o.x, o.y, groundAt(W, o.x, o.y) + 2, 20, { kind: 'star', col: [P_.yel, P_.white], spread: 2, v0: 2, v1: 6, g: 8, life: 1.2 }); sfx.up(); }) };
    case 'locker': {
      if (o.opened) return null;
      if (G.hasKey) return { text: 'Шкафчик пуст — ключ у тебя', bad: true };
      if (G.inv.stick <= 0) return { text: 'Шкафчик смотрителя: нужна палка-отмычка', bad: true };
      return { text: 'Взломать шкафчик (смотритель не должен видеть!)', run: () => startAct('dig', 3, () => {
        const k = G.keeper; useStickDur(); me.heat = Math.max(me.heat, 2);
        if (k.hasKey && dist(k, me) > 7 && !keeperSees(k, me) || k.state === 'stunned') { o.opened = true; claimKey(); G.cnt.stolen++; G.cnt.locker++; addScore(40); toast('Из шкафчика достал ключ от ворот!', 'good'); sfx.up(); floater(me.x, me.y, me.z + 3, 'КЛЮЧ!', P_.yel); }
        else { toast('Смотритель услышал возню у сторожки!', 'bad'); sfx.bad(); netNoise(me.x, me.y, 9, 'шкафчик'); }
      }) }; }
    case 'box':
      if (o.cool > 0) return { text: 'Ящик перезаряжается… ' + Math.ceil(o.cool) + 'с', bad: true };
      return { text: 'Открыть ящик-головоломку (🧠)', run: () => startMini({ type: 'puzzle', o }) };
    case 'swing': { const r = exertBlock(12); if (r) return { text: r, bad: true }; return { text: 'Качаться на шине (−12 сил → 🤸)', run: () => { o.active = 2.2; startAct('swing', 2.2, () => { addEnergy(-12); addXp('agi'); const g = 10 + G.st.agi.lv * 2; addScore(g); floater(o.x, o.y, 4, '+' + g, P_.teal); sfx.ok(); }); } }; }
    case 'frame': { const r = exertBlock(15); if (r) return { text: r, bad: true }; return { text: 'Лазать по лазалке (−15 сил → 💪)', run: () => startAct('climb', 2, () => { addEnergy(-15); addXp('str'); const g = 10 + G.st.str.lv * 2; addScore(g); floater(o.x, o.y, 5, '+' + g, P_.org); sfx.ok(); }) }; }
    case 'drums':
      if (o.cool > 0) return { text: 'Барабаны отдыхают… ' + Math.ceil(o.cool) + 'с', bad: true };
      return { text: 'Играть на барабанах (стучи E/Пробел!)', run: () => startMini({ type: 'drums', o }) };
    case 'gong':
      if (o.cool > 0) return { text: 'Гонг ещё гудит', bad: true };
      return { text: 'Ударить в гонг (шум привлечёт смотрителя)', run: () => { o.cool = 3; ringGong(o); G.cnt.gongs++; me.heat = Math.max(me.heat, 1); } };
    case 'ladder': return { text: 'Взобраться по лестнице', run: () => { me.act = { type: 'ladder', t: 0, dur: 99, done: null }; startTween(me, { x: o.to.x, y: o.to.y, z: o.to.z }, .5 + (o.to.z - me.z) * .22, 0, () => { me.act = null; G.cnt.ladders++; addXp('str'); }); } };
    case 'pond': return { text: 'Попить и набрать воды (инструмент 6)', run: () => startAct('eat', .9, () => { addEnergy(10); G.inv.water = 8; floater(me.x, me.y, me.z + 3, '+10 сил  вода 8', P_.w3); sfx.splash(); }) };
    case 'stage': {
      if (G.stageCool > 0) return { text: 'Публика отдыхает… ' + Math.ceil(G.stageCool) + 'с', bad: true };
      const n = G.vis.filter(v => v.on && v.a > .5 && v.side === 'n').length;
      if (n < 2) return { text: 'Зрителей мало — крикни (ПКМ), позови публику', bad: true };
      const r = exertBlock(10); if (r) return { text: r, bad: true };
      return { text: `Устроить шоу (зрителей: ${n}, −10 сил → 🎭)`, run: () => startAct('show', 2.6, () => {
        const m = G.vis.filter(v => v.on && v.a > .5 && v.side === 'n').length, fr = G.npcs.filter(c => c.sp === 'chimp' && c.friend && dist(c, me) < 7).length;
        const g = Math.round(m * 2.5 * (1 + .3 * (G.st.cha.lv - 1)) * (1 + .25 * fr));
        addEnergy(-10); G.cnt.show++; addXp('cha'); addScore(g); G.cnt.bestShow = Math.max(G.cnt.bestShow, g); G.stageCool = 6;
        floater(me.x, me.y, me.z + 3, '+' + g + (fr ? ` (друзья ×${1 + .25 * fr})` : ''), P_.yel); sfx.up();
        emit(me.x, me.y, me.z + 3, 40, { kind: 'star', col: [P_.red, P_.yel, P_.blue, P_.pur, P_.lime], spread: 2.4, v0: 2, v1: 7, g: 7, life: 1.8 });
        netCheer('n', 3, .3);
      }) }; }
    case 'gate':
      if (G.gateOpen) return null;
      if (!G.hasKey) return { text: 'Ворота заперты — нужен ключ (у смотрителя или в его шкафчике)', bad: true };
      if (lvSum() < NEED_SUM) return { text: `Ты ещё слабоват: уровни ${lvSum()}/${NEED_SUM}`, bad: true };
      return { text: 'Открыть ворота и бежать!', run: () => { G.gateOpen = true; if (!isHost()) NET.send({ t: 'gate' }); sfx.up(); toast('Ворота открыты — БЕГИ!', 'good'); } };
    case 'chimp':
      if (o.friend) { if (o.boostCool > 0) return { text: 'Друг устал', bad: true }; return { text: `${o.name}: подсадка (прыжок выше)`, run: () => { o.boostCool = 2.5; if (!isHost()) NET.send({ t: 'npc', op: 'boost', i: G.npcs.indexOf(o) }); me.vz = 11.2; me.grounded = false; sfx.jump(); floater(o.x, o.y, o.z + 3, 'ХОП!', P_.pink); } }; }
      if (G.inv.banana > 0) return { text: `Угостить ${o.name} бананом (дружба ${Math.round(o.bond)}%)`, run: () => startAct('eat', .5, () => { G.inv.banana--; if (isHost()) { o.bond = Math.min(100, o.bond + 30); o.mood = 'happy'; o.moodT = 2; checkBond(o, me); } else NET.send({ t: 'npc', op: 'give', i: G.npcs.indexOf(o) }); floater(o.x, o.y, o.z + 3, '+дружба', P_.pink); sfx.ok(); }) };
      return { text: `${o.name} хочет бананов (дружба ${Math.round(o.bond)}%)`, bad: true };
    case 'gorilla':
      if (G.st.str.lv < 4) return { text: 'Горилла огромна… (вызов — Сила 4+)', bad: true };
      if (o.pacified > 0) return { text: 'Горилла уважает тебя', bad: true };
      return { text: 'Бросить вызов горилле (рискованно!)', run: () => startAct('climb', 1.6, () => {
        const ch = clamp(.12 + .25 * (G.st.str.lv - 3), .1, .8);
        if (Math.random() < ch) { if (isHost()) { o.pacified = 90; o.rage = 0; } else NET.send({ t: 'npc', op: 'duelWin', i: G.npcs.indexOf(o) }); G.cnt.pacify++; addScore(60); addXp('str'); toast('Горилла признала твою силу!', 'good'); sfx.up(); floater(me.x, me.y, me.z + 3, 'ПОБЕДА! +60', P_.yel); }
        else { me.stun = .9; addScore(-10); toast('Горилла отшвырнула тебя!', 'bad'); sfx.bad(); if (isHost()) o.rage = 3; else NET.send({ t: 'npc', op: 'duelLose', i: G.npcs.indexOf(o) }); }
      }) };
    case 'player':
      if (G.duel) return { text: 'Дуэль уже идёт', bad: true };
      return { text: `⚔ Вызвать ${o.name} на дуэль говном`, run: () => { duelRequest(o.netId); sfx.hoot(); } };
    case 'keeper': {
      const k = G.keeper;
      if (!k.hasKey) return { text: 'Ключа у смотрителя уже нет', bad: true };
      if (k.cool > 0) return { text: 'Смотритель настороже… ' + Math.ceil(k.cool) + 'с', bad: true };
      const r = exertBlock(8); if (r) return { text: r, bad: true };
      const stunned = k.state === 'stunned', behind = ((me.x - k.x) * k.dx + (me.y - k.y) * k.dy) < -.2;
      const ch = stunned ? 1 : clamp((behind ? .45 : .12) + .12 * (G.st.agi.lv - 1), .05, .95);
      return { text: `Стащить ключ — шанс ${Math.round(ch * 100)}%${stunned ? ' (он оглушён!)' : behind ? ' (сзади — бонус)' : ' (зайди сзади, пригнись!)'}`, run: () => startAct('dig', .8, () => {
        addEnergy(-8); addXp('agi');
        if (Math.random() < ch) { claimKey(); G.cnt.stolen++; addScore(40); toast('Ты стащил ключ! Теперь — к воротам', 'good'); sfx.up(); floater(me.x, me.y, me.z + 3, 'КЛЮЧ!', P_.yel); }
        else { addScore(-10); me.stun = 1.4; if (isHost()) { k.cool = 6; k.state = 'chase'; k.lost = 0; k.chasing = me.netId; } else NET.send({ t: 'keeperFail' }); toast('Смотритель заметил — БЕГИ!', 'bad'); sfx.bad(); }
      }) }; }
  }
  return null;
}
function nearestInteractable() {
  const me = G.me, W = G.W; if (!me) return null; let best = null, bd = 99;
  const consider = (d, t) => { if (d < bd) { bd = d; best = t; } };
  for (const o of W.objs) {
    if (o.type === 'hut' || o.type === 'gate') continue;
    const reach = { banana_tree: 1.7, tree: 1.6, frame: 1.7, swing: 1.6, ladder: 1.2, chest: 1.3, dig: 1.2, anvil: 1.5 }[o.type] || 1.5, d = Math.hypot(o.x - me.x, o.y - me.y);
    if (d < reach && Math.abs(groundAt(W, o.x, o.y) - me.z) <= 1.7) { if (o.type === 'dig' && o.dug) continue; if (o.type === 'chest' && o.opened) continue; consider(d - (o.type === 'banana_tree' ? .4 : 0), { kind: o.type, o }); }
  }
  for (const n of G.npcs) { const d = dist(n, me); if (d < 1.8 && (n.sp === 'chimp' || n.sp === 'gorilla') && Math.abs(n.z - me.z) < 1.7) consider(d + .1, { kind: n.sp, o: n }); }
  for (const p of livePlayers()) if (!p.me && !p.tween) { const d = dist(p, me); if (d < 2.2 && Math.abs(p.z - me.z) < 1.7) consider(d + .15, { kind: 'player', o: p }); }
  const k = G.keeper; if (k) { const d = dist(k, me); if (d < 1.7 && Math.abs(k.z - me.z) < 1.7) consider(d - .2, { kind: 'keeper', o: k }); }
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (tileKind(me.x + i * .8, me.y + j * .8) === K.WATER) consider(.9, { kind: 'pond', o: {} });
  const st = W.stage; if (me.x >= st.x && me.x < st.x + st.w && me.y >= st.y && me.y < st.y + st.d && me.z >= .5) consider(.3, { kind: 'stage', o: {} });
  if (!G.gateOpen && Math.hypot(N - .5 - me.x, W.gate.y + .5 - me.y) < 2.6) consider(.5, { kind: 'gate', o: {} });
  return best;
}
function interact() {
  const me = G.me; if (me.act || me.stun > 0 || me.tween) return;
  if (G.mini) { miniKey(null); return; }
  const t = nearestInteractable(); if (!t) return;
  const d = describe(t); if (d && d.run) d.run(); else if (d) sfx.bad();
}

// ───────── Инструменты (мышь) ─────────
const TOOLS = [
  { id: 'poop', name: 'Бросок', icon: '💩', throwable: true, ok: () => G.inv.poop > 0 || inDuel(), fail: 'Нет зарядов — поешь бананов (R)', use: t => throwItem('poop', t), count: () => G.inv.poop },
  { id: 'banana', name: 'Банан', icon: '🍌', throwable: true, ok: () => G.inv.banana > 0, fail: 'Нет бананов — сорви с пальмы (E)', use: t => throwItem('banana', t), count: () => G.inv.banana },
  { id: 'stone', name: 'Камень', icon: '🪨', throwable: true, ok: () => G.inv.stone > 0, fail: 'Нет камней — возьми из кучи (E)', use: t => throwItem('stone', t), count: () => G.inv.stone },
  { id: 'stick', name: 'Палка', icon: '🥢', ok: () => G.inv.stick > 0, fail: 'Нет палки — кусты и деревья (E)', use: t => useStick(t), count: () => G.inv.stick },
  { id: 'vine', name: 'Лиана', icon: '🪢', ok: () => G.st.agi.lv >= 2 && G.vineCool <= 0, fail: () => G.st.agi.lv < 2 ? 'Лиана открывается с Ловкостью 2' : 'Лиана перезаряжается', use: t => useVine(t), count: () => G.st.agi.lv >= 2 ? '∞' : '🔒' },
  { id: 'water', name: 'Вода', icon: '💦', throwable: true, range: 8, ok: () => G.inv.water > 0, fail: 'Нет воды — наберись у пруда (E)', use: t => squirt(t), count: () => G.inv.water },
];
function useTool() {
  const me = G.me; if (G.state !== 'play' || me.act || me.stun > 0 || G.mini || me.tween || G.shotCool > 0) return;
  const t = TOOLS[G.tool]; if (!t.ok()) { toast(typeof t.fail === 'function' ? t.fail() : t.fail, 'bad'); sfx.bad(); return; }
  t.use(G.aim);
}
function throwItem(kind, tgt) {
  const me = G.me; if (!(kind === 'poop' && inDuel())) G.inv[kind]--; G.cnt.throws += kind === 'poop' ? 1 : 0; G.shotCool = .35;
  setFacing(me, tgt.x - me.x, tgt.y - me.y); if (kind === 'poop' || kind === 'stone') me.heat = Math.max(me.heat, 3);
  startAct('throw', .22, () => { const sol = solveThrow(me, G.aim.x !== undefined ? { x: tgt.x, y: tgt.y, z: tgt.z } : tgt); spawnProj(kind, me, sol); netProj(kind, me, sol); sfx.throw(); });
}
function squirt(tgt) {
  const me = G.me; G.inv.water--; G.shotCool = .25; setFacing(me, tgt.x - me.x, tgt.y - me.y);
  startAct('throw', .2, () => { const sol = solveThrow(me, tgt, 8); sol.vx *= 1.1; for (let i = 0; i < 4; i++) { spawnProj('water', me, { vx: sol.vx + rnd(-.4, .4), vy: sol.vy + rnd(-.4, .4), vz: sol.vz + rnd(-.3, .3), T: sol.T }); } sfx.splash(); });
  // поливаем растения под курсором
  for (const o of G.W.objs) if ((o.type === 'banana_tree' || o.type === 'bush') && Math.hypot(o.x - tgt.x, o.y - tgt.y) < 1.8) { o.water = (o.water || 0) + 1; o.regrow = (o.regrow || 0) + 8; floater(o.x, o.y, 3, 'полил', P_.w3); }
}
function useStick(tgt) {
  const me = G.me, W = G.W; let best = null, bd = 2.8;
  for (const o of W.objs) if (['termite', 'dig', 'locker'].includes(o.type) && !(o.dug || o.opened)) { const d = Math.hypot(o.x - tgt.x, o.y - tgt.y); if (d < bd && Math.hypot(o.x - me.x, o.y - me.y) < 2.4) { best = o; bd = d; } }
  if (!best) { toast('Палка работает вблизи: термитники, раскопки, шкафчик', 'bad'); return; }
  const d = describe({ kind: best.type, o: best }); if (d && d.run) d.run(); else if (d) toast(d.text, 'bad');
}
function useVine(tgt) {
  const me = G.me, W = G.W;
  const d = Math.hypot(tgt.x - me.x, tgt.y - me.y);
  if (d > 10) { toast('Слишком далеко для лианы (до 10 клеток)', 'bad'); return; }
  if (tgt.z - me.z < .9) { toast('Лиана цепляется только за выступ выше тебя', 'bad'); return; }
  if (tgt.z - me.z > 6.1) { toast('Выступ слишком высоко', 'bad'); return; }
  const tx = Math.floor(tgt.x), ty = Math.floor(tgt.y); if (tx < 0 || ty < 0 || tx >= N || ty >= N || W.blocked[ty * N + tx]) { toast('Сюда не зацепиться', 'bad'); return; }
  const r = exertBlock(10); if (r) { toast(r, 'bad'); return; }
  addEnergy(-10); G.vineCool = 2.5; G.cnt.vines++; me.heat = Math.max(me.heat, 1);
  for (let i = 0; i <= 8; i++) { const k = i / 8; emit(lerp(me.x, tx + .5, k), lerp(me.y, ty + .5, k), lerp(me.z + 2, tgt.z + 1, k) + Math.sin(k * 3) * .3, 1, { col: P_.d3, spread: 0, v0: 0, v1: 0, g: 0, life: .45, size: 1 }); }
  me.act = { type: 'vine', t: 0, dur: 99, done: null };
  startTween(me, { x: tx + .5, y: ty + .5, z: tgt.z }, .35 + d * .045, 1.2, () => { me.act = null; addXp('agi'); sfx.ok(); });
  sfx.throw();
}
function hoot() {
  const me = G.me; if (G.state !== 'play' || me.act || me.stun > 0 || G.mini || me.tween || me.hootCool > 0) return;
  me.hootCool = 4; me.heat = Math.max(me.heat, 3);
  startAct('hoot', .55, () => {
    sfx.hoot(); floater(me.x, me.y, me.z + 3, 'У-У-А-А!', P_.white);
    emit(me.x, me.y, me.z + 3, 12, { kind: 'star', col: P_.white, spread: 2, v0: 0, v1: 2, g: 0, life: .6 });
    netHoot(me.x, me.y);
    if (G.vis.some(v => v.on && v.cheer > 0)) addScore(3);
  });
}

// ───────── Мини-игры ─────────
const ARROW = { U: '⬆', D: '⬇', L: '⬅', R: '➡' };
function startMini(m) {
  const me = G.me; me.moving = false;
  if (m.type === 'puzzle') { const len = 3 + Math.min(2, Math.floor(G.cnt.puzzle / 2)); Object.assign(m, { seq: Array.from({ length: len }, () => 'UDLR'[Math.floor(rnd(0, 4))]), phase: 'show', t: 0, showT: 1.2 + .45 * len + .25 * (G.st.int.lv - 1), idx: 0, limit: 7 }); }
  if (m.type === 'crack') Object.assign(m, { pos: 0, dir: 1, zone: rnd(.3, .7), w: .24 + .02 * G.st.int.lv, t: 0 });
  if (m.type === 'drums') Object.assign(m, { taps: 0, t: 0, dur: 6 });
  G.mini = m; renderMini();
}
function endMini() { G.mini = null; renderMini(); }
function renderMini() {
  const b = $('miniBox'), m = G.mini; if (!m) { b.style.display = 'none'; return; }
  b.style.display = 'block';
  if (m.type === 'puzzle') b.innerHTML = `<div class="mt">🧩 ${m.phase === 'show' ? 'Запоминай порядок!' : 'Повтори стрелками!'}</div><div class="seq">${m.seq.map((c, i) => m.phase === 'show' ? ARROW[c] : i < m.idx ? ARROW[c] : '❓').join(' ')}</div><div class="mh">Esc — отмена</div>`;
  else if (m.type === 'crack') b.innerHTML = `<div class="mt">🔨 Бей, когда маркер в зелёной зоне!</div><div class="cbar"><i class="zone" style="left:${(m.zone - m.w / 2) * 100}%;width:${m.w * 100}%"></i><i class="mark" style="left:${m.pos * 100}%"></i></div><div class="mh">E / Пробел / клик — удар · Esc — отмена</div>`;
  else if (m.type === 'drums') b.innerHTML = `<div class="mt">🥁 Стучи в ритм!</div><div class="seq">${m.taps}</div><div class="cbar"><i class="zone" style="left:0;width:${clamp(m.t / m.dur, 0, 1) * 100}%;background:#ffd84a"></i></div><div class="mh">E / Пробел / клик — удар</div>`;
}
function updateMini(dt) {
  const m = G.mini; if (!m) return;
  m.t += dt;
  if (m.type === 'puzzle') { if (m.phase === 'show' && m.t >= m.showT) { m.phase = 'input'; m.t = 0; renderMini(); } else if (m.phase === 'input' && m.t > m.limit) { m.o.cool = 3; endMini(); sfx.bad(); floater(G.me.x, G.me.y, G.me.z + 3, 'время вышло', P_.red); } }
  else if (m.type === 'crack') { m.pos += m.dir * dt * (1.1 + .1 * (1 - G.st.int.lv * .1)); if (m.pos >= 1) { m.pos = 1; m.dir = -1; } if (m.pos <= 0) { m.pos = 0; m.dir = 1; } renderMini(); }
  else if (m.type === 'drums') { if (m.t >= m.dur) { const o = m.o, pts = Math.min(80, m.taps * 2); o.cool = 12; G.cnt.drums++; addXp('cha'); addScore(pts); floater(G.me.x, G.me.y, G.me.z + 3, '+' + pts + ' ритм!', P_.yel); sfx.up(); endMini(); if (m.taps >= 12) netCheer(null, 4, .35); } else renderMini(); }
}
function miniKey(dir) {
  const m = G.mini; if (!m) return;
  if (m.type === 'puzzle') {
    if (!dir || m.phase !== 'input') return;
    if (dir === m.seq[m.idx]) { m.idx++; sfx.tick(); if (m.idx >= m.seq.length) { const o = m.o; endMini(); G.cnt.puzzle++; addXp('int'); addEnergy(10); const g = 15 + G.st.int.lv * 3; addScore(g); o.cool = 5; floater(G.me.x, G.me.y, G.me.z + 3, '+' + g, P_.pur); sfx.ok(); lootDrop(Math.random() < .5 ? 'banana' : 'coin', o.x, o.y + 1); } else renderMini(); }
    else { m.o.cool = 3; endMini(); sfx.bad(); floater(G.me.x, G.me.y, G.me.z + 3, 'не угадал', P_.red); }
  } else if (m.type === 'crack') {
    if (dir) return; const ok = Math.abs(m.pos - m.zone) < m.w / 2; G.inv.nut--; endMini();
    if (ok) { G.cnt.nuts++; addEnergy(20); addXp('int'); addScore(20); floater(G.me.x, G.me.y, G.me.z + 3, 'ХРЯСЬ! +20', P_.d4); sfx.ok(); emit(G.me.x, G.me.y, G.me.z + 1, 8, { col: P_.d4, spread: 1.2, v0: 1, v1: 3, life: .6 }); } else { floater(G.me.x, G.me.y, G.me.z + 3, 'мимо — орех улетел', P_.red); sfx.bad(); }
  } else if (m.type === 'drums') { if (dir) return; m.taps++; sfx.tick(); beep(180 + (m.taps % 2) * 60, .06, 'triangle', .05); renderMini(); }
}

// ───────── Ввод ─────────
const dirOf = c => ({ ArrowUp: 'U', KeyW: 'U', ArrowDown: 'D', KeyS: 'D', ArrowLeft: 'L', KeyA: 'L', ArrowRight: 'R', KeyD: 'R' })[c];
addEventListener('keydown', e => {
  if (G.state !== 'play') return;
  if (e.target && e.target.tagName === 'INPUT') return;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code)) e.preventDefault();
  if (G.mini) {
    if (e.code === 'Escape') { if (G.mini.o) G.mini.o.cool = Math.max(G.mini.o.cool || 0, 1); endMini(); return; }
    if (e.repeat) return;
    if (e.code === 'KeyE' || e.code === 'Space') { miniKey(null); return; }
    const d = dirOf(e.code); if (d) miniKey(d); return;
  }
  G.keys.add(e.code);
  if (e.repeat) return;
  if (e.code === 'KeyE') interact();
  else if (e.code === 'KeyR') eatBanana();
  else if (e.code === 'KeyF') useTool();
  else if (e.code === 'KeyQ') hoot();
  else if (e.code === 'KeyY') duelAccept();
  else if (/^Digit[1-6]$/.test(e.code)) { G.tool = +e.code.slice(5) - 1; sfx.tick(); }
});
addEventListener('keyup', e => G.keys.delete(e.code));
addEventListener('blur', () => G.keys.clear());
function setMouse(e) { const r = cv.getBoundingClientRect(); G.mouse.x = (e.clientX - r.left) * VW / r.width; G.mouse.y = (e.clientY - r.top) * VH / r.height; G.mouse.in = G.mouse.x >= 0 && G.mouse.y >= 0 && G.mouse.x < VW && G.mouse.y < VH; }
addEventListener('mousemove', setMouse);
cv.addEventListener('mouseleave', () => { G.mouse.in = false; });
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('mousedown', e => {
  if (G.state !== 'play') return; setMouse(e);
  if (G.mini) { if (e.button === 0) miniKey(null); return; }
  if (e.button === 0) useTool(); else if (e.button === 2) hoot();
});
addEventListener('wheel', e => { if (G.state !== 'play' || G.mini) return; G.tool = (G.tool + (e.deltaY > 0 ? 1 : 5)) % 6; sfx.tick(); }, { passive: true });

// прицел: курсор над существом «прилипает» к нему (иначе попасть по высоким спрайтам трудно)
function computeAim() {
  const m = G.mouse, ground = screenToWorld(m.x, m.y); let best = null, bd = 1e9;
  const test = (e, h, w, ez) => { const x = SX(e.x, e.y), y = SY(e.x, e.y, ez); if (Math.abs(m.x - x) <= w && m.y >= y - h && m.y <= y + 3) { const d = Math.abs(m.x - x) + Math.abs(m.y - (y - h / 2)); if (d < bd) { bd = d; best = e; } } };
  for (const v of G.vis) if (v.on && v.a > .5) test(v, 26, 7, 0);
  for (const n of G.npcs) test(n, n.sp === 'gorilla' ? 38 : n.sp === 'tortoise' ? 12 : n.sp === 'parrot' ? 12 : 28, n.sp === 'gorilla' ? 12 : 8, n.sp === 'parrot' ? n.rz : n.rz);
  if (G.keeper) test(G.keeper, 34, 8, G.keeper.rz);
  if (G.duel) for (const p of livePlayers()) if (!p.me) test(p, 28, 8, p.rz);
  if (best) return { x: best.x, y: best.y, z: (best.sp === 'parrot' ? best.z : best.z || 0) + 1, ent: best };
  return ground;
}

// ───────── Обновление ─────────
function update(dt) {
  if (G.state !== 'play') return;
  const me = G.me, W = G.W, host = isHost();
  G.t += dt;
  if (G.shotCool > 0) G.shotCool -= dt; if (G.vineCool > 0) G.vineCool -= dt; if (G.stageCool > 0) G.stageCool -= dt; if (G.comboT > 0) { G.comboT -= dt; if (G.comboT <= 0) G.combo = 0; }
  for (const o of W.objs) {
    if (o.cool > 0) o.cool -= dt; if (o.active > 0) o.active -= dt; if (o.ring > 0) o.ring -= dt; if (o.boostCool > 0) o.boostCool -= dt;
    if (host && (o.type === 'banana_tree' && o.bananas < 3)) { o.regrow += dt; if (o.regrow > 22) { o.bananas++; o.regrow = 0; } }
    if (host && (o.type === 'bush')) { o.regrow += dt; if (o.regrow > 30) { o.regrow = 0; if (o.sticks < 2) o.sticks++; if (o.berries < 2) o.berries++; } }
    if (host && (o.type === 'stonepile' && o.stones < 4)) { o.regrow += dt; if (o.regrow > 35) { o.stones++; o.regrow = 0; } }
    if (host && (o.type === 'nutpile' && o.nuts < 6)) { o.regrow += dt; if (o.regrow > 30) { o.nuts++; o.regrow = 0; } }
    if (host && (o.type === 'termite' && o.hp < 3)) { o.regrow += dt; if (o.regrow > 25) { o.hp++; o.regrow = 0; } }
  }
  if (!host) for (const n of G.npcs) if (n.boostCool > 0) n.boostCool -= dt;
  G.aim = computeAim();
  updatePlayer(me, dt);
  if (me.act) { me.act.t += dt; if (me.act.done !== null && me.act.t >= me.act.dur) { const d = me.act.done; me.act = null; d && d(); } }
  updateMini(dt); if (host) { updateNpcs(dt); updateKeeper(G.keeper, dt); updateVisitors(dt); } else updateNetEntities(dt); fadeVisitors(dt); updateRemotes(dt); updatePickups(dt); updateProj(dt); updateParts(dt); netTick(dt); if (me.splat > 0) me.splat -= dt;
  for (let i = G.floaters.length - 1; i >= 0; i--) { G.floaters[i].t += dt; if (G.floaters[i].t > 1.6) G.floaters.splice(i, 1); }
  for (let i = G.splats.length - 1; i >= 0; i--) { G.splats[i].t += dt; if (G.splats[i].t > 28) G.splats.splice(i, 1); }
  G.gateAnim = clamp(G.gateAnim + (G.gateOpen ? dt * 1.5 : 0), 0, 1);
  if (me.z >= 4.9 && !G.cnt.summit) { G.cnt.summit = 1; toast('Ты в домике на вершине! Здесь сундук (E)', 'good'); sfx.up(); }
  for (const q of QUESTS) if (!q.done && q.get() >= q.goal) { q.done = true; addScore(q.reward); toast(`✅ ${q.text}  +${q.reward}`, 'good'); sfx.ok(); }
  for (const a of ACHS) if (!a.on && a.test()) { a.on = true; addScore(10); toast(`🏆 Достижение: ${a.name}  +10`); sfx.up(); }
  tutUpdate();
  if (G.gateOpen && me.x > N + 1.2) win();
}
function win() {
  G.state = 'won'; Profile.record(G.score, true); const secs = Math.round((performance.now() - G.startedAt) / 1000); addScore(100);
  $('winText').innerHTML = `<p>Ты прокачался, перехитрил смотрителя и вырвался на свободу!</p><p>⭐ Очки: <b>${G.score}</b> (с бонусом за побег +100)<br>⏱ Время: <b>${Math.floor(secs / 60)} мин ${secs % 60} с</b><br>💪 ${G.st.str.lv} · 🤸 ${G.st.agi.lv} · 🧠 ${G.st.int.lv} · 🎭 ${G.st.cha.lv}<br>📋 Заданий: <b>${QUESTS.filter(q => q.done).length}/${QUESTS.length}</b> · 🏆 Достижений: <b>${ACHS.filter(a => a.on).length}/${ACHS.length}</b><br>🌱 Сид мира: <b>${G.W.seed}</b></p>`;
  $('win').style.display = 'flex'; $('tut').style.display = 'none'; $('prompt').style.display = 'none'; sfx.win();
  $('winStay').style.display = isNet() && isHost() ? 'inline-block' : 'none';
  if (isNet() && !isHost()) { NET.send({ t: 'won', sc: G.score }); setTimeout(netClose, 900); }
  for (let i = 0; i < 6; i++) setTimeout(() => emit(G.me.x, G.me.y, G.me.z + 2, 40, { kind: 'star', col: [P_.red, P_.yel, P_.blue, P_.pur, P_.lime], spread: 3, v0: 3, v1: 8, g: 8, life: 2.2 }), i * 300);
}

// сетевые награды и «удары по мне»
function applyReward(r) {
  const me = G.me; if (!me) return;
  if (r.score) addScore(r.score);
  if (r.cnt) for (const k in r.cnt) G.cnt[k] = (G.cnt[k] || 0) + r.cnt[k];
  if (r.vis) visReward(r.vis);
  if (r.heat) me.heat = Math.max(me.heat, r.heat);
  if (r.fl) floater(r.fl[0], r.fl[1], r.fl[2], r.fl[3], r.fl[4]);
  if (r.toast) toast(r.toast[0], r.toast[1]);
  if (r.sfx && sfx[r.sfx]) sfx[r.sfx]();
}
function visReward(v) {   // попадание 💩 в зрителя: серия (комбо) считается у того, кто бросил
  const fx = HIT_FX[v.fx]; G.cnt.hits++; G.combo = G.comboT > 0 ? G.combo + 1 : 1; G.comboT = 6; G.cnt.bestCombo = Math.max(G.cnt.bestCombo, G.combo);
  const mult = Math.min(3, G.combo), pts = (15 + fx[3]) * mult;
  addScore(pts); floater(v.x, v.y, 3, '+' + pts + ' ' + fx[2] + (mult > 1 ? ' x' + mult : ''), P_.org);
  if (fx[1] === 'REC') { G.cnt.viral++; toast('Кто-то снял это на видео — ты звезда интернета! +80', 'good'); }
  addXp('cha'); G.me.heat = Math.max(G.me.heat, 3);
}
function applyHurt(h) {
  const me = G.me; if (!me) return;
  if (h.caught) {
    addScore(-20); me.stun = 1.2; me.act = null; endMini(); me.tween = null;
    if (h.hadKey) toast('Смотритель отобрал ключ!', 'bad');
    toast('Тебя поймали! −20 очков, назад на старт', 'bad'); sfx.bad();
    me.x = G.W.spawn.x; me.y = G.W.spawn.y; me.z = groundAt(G.W, me.x, me.y); me.rz = me.z; me.vz = 0; me.heat = 0; G.camSnap = true; return;
  }
  if (h.stun) { me.stun = Math.max(me.stun, h.stun); me.act = null; if (G.mini) endMini(); }
  if (h.push && walkableAt(G.W, h.push.x, h.push.y, me.z)) { me.x = h.push.x; me.y = h.push.y; }
  if (h.lose) G.inv[h.lose] = 0;
  if (h.score) addScore(h.score);
  if (h.splat) me.splat = h.splat;
  if (h.fl) floater(h.fl[0], h.fl[1], h.fl[2], h.fl[3], h.fl[4]);
  if (h.toast) toast(h.toast[0], h.toast[1]);
  if (h.sfx && sfx[h.sfx]) sfx[h.sfx]();
  emit(me.x, me.y, me.z + 2, 8, { kind: 'star', col: P_.red, spread: 1.4, v0: 1, v1: 4, g: 8, life: .7 });
}
function netProj(kind, me, sol) {   // чужие видят полёт моего снаряда (только картинка)
  if (!isNet()) return; const o = launchPoint(me), m = { t: 'proj', k: kind, x: o.x, y: o.y, z: o.z, vx: sol.vx, vy: sol.vy, vz: sol.vz };
  if (isHost()) NET.bcast(m); else NET.send(m);
}
function hostPlayOn() { G.state = 'play'; const me = G.me; me.x = N - 4; me.y = G.W.gate.y + .5; me.z = 0; me.rz = 0; G.camSnap = true; $('win').style.display = 'none'; }

// ───────── Обучение ─────────
const nearestOf = (pred) => { let b = null, bd = 1e9; for (const o of G.W.objs) if (pred(o)) { const d = Math.hypot(o.x - G.me.x, o.y - G.me.y); if (d < bd) { bd = d; b = o; } } return b; };
const TUT = [
  { t: 'Привет! Ты — шимпанзе. Походи: <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>. Зажми <kbd>Shift</kbd> — бег, <kbd>C</kbd> — красться.', done: () => G.tutDist >= 6 },
  { t: 'Нажми <kbd>Пробел</kbd> — прыжок (дважды). Прыгать можно на ступени и уступы.', done: () => G.cnt.jumps >= 2 },
  { t: 'Подойди к банановой пальме и нажми <kbd>E</kbd>, чтобы сорвать банан. Потом <kbd>R</kbd> — съесть (силы и заряд 💩).', done: () => G.cnt.banana >= 1, target: () => { const o = nearestOf(t => t.type === 'banana_tree' && t.bananas > 0); return o ? [{ x: o.x, y: o.y, z: groundAt(G.W, o.x, o.y), h: 58 }] : []; } },
  { t: 'Прицеливание! Выбери <kbd>1</kbd> (💩) или колесо мыши, наведи курсор на зрителя за забором и нажми <kbd>ЛКМ</kbd>.', init: () => { G.inv.poop = Math.max(G.inv.poop, 2); G.tool = 0; for (const v of G.vis.slice(0, 5)) { v.on = true; v.a = 1; } }, done: () => G.cnt.throws >= 1, target: () => { const v = G.vis.filter(v => v.on).sort((a, b) => dist(a, G.me) - dist(b, G.me))[0]; return v ? [{ x: v.x, y: v.y, z: 0, h: 38 }] : []; } },
  { t: 'Мир с ярусами! Поднимись на гору (пологий склон — ступеньки, прыгай на уступы). Выше — домик с сундуком.', done: () => G.me.z >= 2, target: () => [{ x: G.W.mountain.x + .5, y: G.W.mountain.y + .5, z: 5, h: 8 }] },
  { t: 'Главная цель: добыть 🗝 ключ (стащить у смотрителя сзади, свалить его бананом или взломать шкафчик в сторожке палкой), поднять уровни до ' + NEED_SUM + ' и выйти в ворота. Лиана (6) — Ловкость 2+. Удачи!', done: () => G.tutOk, final: true, target: () => [{ x: G.keeper.x, y: G.keeper.y, z: G.keeper.z, h: 48 }, { x: N - .5, y: G.W.gate.y + .5, z: 0, h: 44 }] },
];
function tutStart() { G.tut = { i: 0 }; G.tutOk = false; G.tutDist = 0; $('tut').style.display = 'block'; tutRender(); }
function tutRender() {
  const s = TUT[G.tut.i]; if (s.init) s.init();
  $('tutStep').textContent = `🎓 Обучение · шаг ${G.tut.i + 1} из ${TUT.length}`; $('tutText').innerHTML = s.t;
  $('tutOk').style.display = s.final ? 'inline-block' : 'none'; $('tutProg').style.width = (G.tut.i / TUT.length * 100) + '%';
}
function tutEnd(skipped) { G.tut = null; $('tut').style.display = 'none'; try { localStorage.setItem('chimpTutDone2', '1'); } catch (e) { } if (!skipped) { toast('🎓 Обучение пройдено! Теперь — на волю!', 'good'); sfx.up(); } }
function tutTargets() { return G.tut ? (TUT[G.tut.i].target ? TUT[G.tut.i].target() : []) : []; }
function tutUpdate() {
  if (!G.tut) return; G.energy = Math.max(G.energy, 35);
  if (TUT[G.tut.i].done()) { if (G.tut.i >= TUT.length - 1) { tutEnd(false); return; } G.tut.i++; sfx.ok(); toast('✅ Шаг пройден!', 'good'); tutRender(); }
}

// ───────── Интерфейс ─────────
const statEls = {};
for (const k of Object.keys(STAT_META)) { const [ic, nm, col] = STAT_META[k]; const d = document.createElement('div'); d.className = 'stat'; d.innerHTML = `<div class="row"><span>${ic} ${nm}</span><span class="lv"></span></div><span class="bar"><i style="background:${col}"></i></span>`; $('statRows').appendChild(d); statEls[k] = { lv: d.querySelector('.lv'), bar: d.querySelector('i') }; }
const qEls = QUESTS.map(q => { const d = document.createElement('div'); d.className = 'q'; d.innerHTML = `<span>${q.icon} ${q.text}</span><small></small>`; $('qList').appendChild(d); return d; });
const aEls = ACHS.map(a => { const s = document.createElement('span'); s.textContent = a.icon; s.title = a.name; $('ach').appendChild(s); return s; });
const slotEls = TOOLS.map((t, i) => { const d = document.createElement('div'); d.className = 'slot'; d.innerHTML = `<b>${i + 1}</b><span class="ic">${t.icon}</span><em></em>`; d.title = t.name; d.onclick = () => { if (G.state === 'play') { G.tool = i; sfx.tick(); } }; $('hotbar').appendChild(d); return d; });
$('needLv').textContent = NEED_SUM;

// мини-карта
const MM = 2; let miniBase = null;
function buildMinimap() {
  miniBase = mkCanvas(N * MM, N * MM); const c = miniBase.getContext('2d'), W = G.W;
  const col = { [K.GRASS]: '#58a84c', [K.DIRT]: '#bf8a50', [K.ROCK]: '#8486a0', [K.SAND]: '#dcbc78', [K.WATER]: '#3f84d0', [K.DECK]: '#966638', [K.COBBLE]: '#a8aac0' };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const i = y * N + x; c.fillStyle = col[W.kind[i]]; c.fillRect(x * MM, y * MM, MM, MM); if (W.h[i] > 0 && W.kind[i] !== K.DECK) { c.fillStyle = `rgba(255,255,255,${Math.min(.5, W.h[i] * .1)})`; c.fillRect(x * MM, y * MM, MM, MM); } if (W.blocked[i] && W.kind[i] !== K.COBBLE) { c.fillStyle = '#2c6638'; c.fillRect(x * MM, y * MM, MM, MM); } }
}
function drawMinimap() {
  if (!miniBase) return; const c = $('minimap').getContext('2d'); c.drawImage(miniBase, 0, 0);
  const dot = (x, y, col, r = 2) => { c.fillStyle = col; c.fillRect(Math.round(x * MM - r / 2), Math.round(y * MM - r / 2), r, r); };
  dot(N - .5, G.W.gate.y + .5, '#ffd23a', 3); for (const n of G.npcs) if (n.sp !== 'parrot') dot(n.x, n.y, n.sp === 'gorilla' ? '#262330' : n.sp === 'chimp' ? (n.friend ? '#ff8fb0' : '#e0b070') : '#3fb8a0');
  const k = G.keeper; dot(k.x, k.y, k.state === 'chase' ? '#ff3030' : '#d24a34', 3); dot(G.me.x, G.me.y, '#ffffff', 3);
}
let hudT = 0;
function updateHud() {
  $('score').textContent = G.score; $('energyBar').firstChild.style.width = G.energy + '%';
  for (const k of Object.keys(G.st)) { const s = G.st[k], need = 2 + s.lv * 2; statEls[k].lv.textContent = s.lv >= MAX_LV ? 'МАКС' : `ур. ${s.lv}`; statEls[k].bar.style.width = (s.lv >= MAX_LV ? 100 : s.xp / need * 100) + '%'; }
  QUESTS.forEach((q, i) => { qEls[i].classList.toggle('done', q.done); qEls[i].lastChild.textContent = q.done ? '✔' : `${Math.min(q.get(), q.goal)}/${q.goal}`; });
  ACHS.forEach((a, i) => aEls[i].classList.toggle('on', a.on));
  const k = G.keeper, ks = { patrol: ['👁 патруль', ''], suspicious: ['👁 ищет!', 'warn'], chase: ['👁 ПОГОНЯ!', 'alarm'], stunned: ['👁 оглушён', 'ok'] }[k.state];
  $('escapeInfo').innerHTML = `<span class="ks ${ks[1]}">${ks[0]}</span> · 🗝 ${G.hasKey ? '✔' : '✘'} · уровни ${lvSum()}/${NEED_SUM}${G.combo > 1 ? ' · 🔥×' + Math.min(3, G.combo) : ''}`;
  TOOLS.forEach((t, i) => { slotEls[i].classList.toggle('sel', i === G.tool); slotEls[i].classList.toggle('off', !t.ok()); slotEls[i].querySelector('em').textContent = t.count(); });
  $('seedInfo').textContent = '🌱 ' + G.W.seed; drawMinimap();
  $('netTag').textContent = NET.role === 'host' ? '🌐 хост' : NET.role === 'client' ? '🌐 гость' : '';
  const pls = livePlayers(); $('players').style.display = isNet() ? 'block' : 'none';
  if (isNet()) $('players').innerHTML = '<h3>👥 Игроки</h3>' + pls.map(p => '<div class="pl' + (p.me ? ' me' : '') + '"><span>' + p.name + (G.keyHolder === p.netId ? ' 🗝' : '') + '</span><b>⭐' + (p.me ? G.score : (p.score || 0)) + ' · ур.' + (p.me ? lvSum() : (p.lv || 4)) + '</b></div>').join('');
  const nm = id => (G.players.find(p => p.netId === id) || {}).name || '?';
  $('duelBar').style.display = G.duel ? 'block' : 'none'; if (G.duel) $('duelBar').textContent = '⚔ Дуэль: ' + nm(G.duel.a) + ' ' + G.duel.sa + ' : ' + G.duel.sb + ' ' + nm(G.duel.b) + ' (до ' + G.duel.goal + ')';
  $('invite').style.display = G.invite ? 'block' : 'none'; if (G.invite) $('invite').textContent = '⚔ ' + G.invite.name + ' вызывает тебя на дуэль говном — нажми Y (' + Math.ceil(G.invite.t) + ' с)';
  const pr = $('prompt'), me = G.me;
  if (me.act || G.mini || me.stun > 0 || G.state !== 'play') { pr.style.display = 'none'; return; }
  const t = nearestInteractable(), d = t && describe(t);
  if (d) { pr.style.display = 'block'; pr.className = d.bad ? 'bad' : ''; pr.textContent = (d.run ? '[E] ' : '') + d.text; } else pr.style.display = 'none';
}

// ───────── Запуск ─────────
function startGame(seed, withTut, opts = {}) {
  if (!opts.role) netClose();
  seed = (seed || '').trim() || randomSeed();
  resetState(); G.W = genWorld(seed); const W = G.W;
  buildOuter(W); buildMinimap();
  G.me = newPlayer(W, opts.name || Profile.cur || 'Ты', FUR[opts.fur] || FUR.brown); G.players = [G.me];
  G.npcs = W.npcSpawns.map(s => newNpc(s, W)); G.keeper = newKeeper(W); G.vis = newVisitors(W); Object.assign(G.keeper, { nx: G.keeper.x, ny: G.keeper.y, nz: G.keeper.z });
  G.camSnap = true; G.state = 'play'; G.stageCool = 0;
  document.body.classList.remove('inmenu'); $('menu').style.display = 'none'; $('win').style.display = 'none'; $('tutAgain').style.display = 'block'; $('tut').style.display = 'none'; $('lostBox').style.display = 'none'; NET.last.clear();
  try { localStorage.setItem('chimpSeed2', seed); } catch (e) { }
  beep(600, .1); updateHud();
  if (withTut) tutStart();
  document.activeElement && document.activeElement.blur();
}
let last = performance.now();
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  if (G.state === 'play') { update(dt); hudT -= dt; if (hudT <= 0) { hudT = .1; updateHud(); } }
  if (G.W) { if (G.state === 'play' || G.state === 'won') { if (G.state === 'won') { G.t += dt; updateParts(dt); } renderWorld(dt); } }
  requestAnimationFrame(frame);
}
$('seedInput').value = (() => { try { return localStorage.getItem('chimpSeed2') || randomSeed(); } catch (e) { return randomSeed(); } })();
$('seedRnd').onclick = () => { $('seedInput').value = randomSeed(); };
$('startBtn').onclick = () => startGame($('seedInput').value, true);
$('startSkip').onclick = () => startGame($('seedInput').value, false);
$('tutOk').onclick = () => { G.tutOk = true; document.activeElement.blur(); };
$('tutSkip').onclick = () => { tutEnd(true); document.activeElement.blur(); };
$('tutAgain').onclick = () => { if (G.state === 'play') tutStart(); document.activeElement.blur(); };
// ── профиль и сетевые кнопки меню ──
function lobbyMsg(t, bad) { const m = $('lobbyMsg'); m.textContent = t; m.style.color = bad ? '#ff9a8a' : '#a8e040'; }
function refreshProfile() {
  const p = Profile.info();
  $('pfStatus').textContent = Profile.cur ? 'Профиль: ' + Profile.cur + ' · лучший счёт ' + p.best + ' · игр ' + p.games + ' · побегов ' + p.wins : 'Гость (профиль не выбран) — для сетевой игры нужен профиль';
  $('hostBtn').disabled = $('joinBtn').disabled = !Profile.cur; $('logoutBtn').style.display = Profile.cur ? 'inline-block' : 'none';
}
$('pfName').value = (() => { try { return localStorage.getItem('chimpLastName') || ''; } catch (e) { return ''; } })();
$('loginBtn').onclick = async () => { try { const r = await Profile.enter($('pfName').value, $('pfPass').value); $('pfPass').value = ''; lobbyMsg(r === 'created' ? 'Профиль создан и сохранён на этом устройстве' : 'Вход выполнен'); } catch (e) { lobbyMsg(e.message, true); } refreshProfile(); };
$('logoutBtn').onclick = () => { Profile.logout(); refreshProfile(); lobbyMsg('Вы вышли из профиля'); };
$('hostBtn').onclick = async () => {
  const seed = $('seedInput').value.trim() || randomSeed(); $('seedInput').value = seed; lobbyMsg('Создаём сессию…');
  try { await netHostOpen(seed); startGame(seed, false, { role: 'host' }); toast('Сессия создана! Друзья входят по сиду: ' + seed, 'good'); } catch (e) { netClose(); lobbyMsg(e.message, true); }
};
$('joinBtn').onclick = async () => {
  const seed = $('seedInput').value.trim(); if (!seed) { lobbyMsg('Введи сид сессии', true); return; } lobbyMsg('Подключаемся…');
  try { const w = await netJoinOpen(seed, Profile.cur); startGame(w.seed, false, { role: 'client', name: w.name, fur: w.fur }); applySnap(w.snap); for (const id in w.objs) { const o = G.W.objs.find(o => o.id === +id); if (o) applyObj(o, w.objs[id]); } toast('Ты в игре! Сид: ' + w.seed, 'good'); } catch (e) { netClose(); lobbyMsg(e.message, true); }
};
$('winStay').onclick = () => hostPlayOn();
$('lostBtn').onclick = () => location.reload();
refreshProfile();
$('copySeed').onclick = () => { try { navigator.clipboard.writeText(G.W.seed); toast('Сид скопирован: ' + G.W.seed); } catch (e) { toast('Сид: ' + G.W.seed); } };
requestAnimationFrame(frame);
window.__g = { G, step(s) { for (let t = 0; t < s; t += .02) update(.02); updateHud(); }, startGame, renderWorld };
