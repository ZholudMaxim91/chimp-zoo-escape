'use strict';
// ───────── Мир: рельеф с ярусами и объекты. Всё строится из сида ─────────
const N = 51;                                   // сторона вольера в клетках (51² ≈ 1,6 × прежних 40²)
const WS = N / 40;                              // масштаб расстановки относительно старой карты
const LH = 8;                                   // высота одного яруса в пикселях
const TRUNKS = ['tree', 'banana_tree', 'coco_palm', 'giant_tree'];   // их клетка «круглая» (можно обходить вплотную)
const K = { GRASS: 0, DIRT: 1, ROCK: 2, SAND: 3, WATER: 4, DECK: 5, COBBLE: 6 };

function genWorld(seedStr) {
  const seed = hashStr(seedStr), R = mulberry32(seed);
  const rr = (a, b) => a + R() * (b - a), ri = (a, b) => Math.floor(rr(a, b + 1));
  const h = new Int8Array(N * N), kind = new Uint8Array(N * N), blocked = new Uint8Array(N * N);
  const I = (x, y) => y * N + x, inb = (x, y) => x >= 0 && y >= 0 && x < N && y < N;
  const W = { seed: seedStr, seedNum: seed, N, h, kind, blocked, objs: [], decor: [], npcSpawns: [], visitors: [], wps: [], spawn: null, gate: null };
  let uid = 1;
  const add = (type, x, y, extra = {}, block = true) => {
    const o = { id: uid++, type, x, y, tx: Math.floor(x), ty: Math.floor(y), ...extra };
    o.blk = !!(block && inb(o.tx, o.ty)); W.objs.push(o); if (o.blk) { blocked[I(o.tx, o.ty)] = TRUNKS.includes(type) ? 2 : 1; if (TRUNKS.includes(type)) W.trunkR[I(o.tx, o.ty)] = o.trunkR || (type === 'tree' ? (o.sp === 'baobab' ? .34 : .17) : .15); } return o;
  };
  const free = (x, y) => inb(x, y) && !blocked[I(x, y)] && kind[I(x, y)] !== K.WATER && kind[I(x, y)] !== K.DECK;
  const flatFree = (x, y, hh = 0) => free(x, y) && h[I(x, y)] === hh;
  const findFree = (pred, tries = 400) => { for (let i = 0; i < tries; i++) { const x = ri(2, N - 3), y = ri(2, N - 3); if (pred(x, y)) return [x, y]; } return null; };
  const nearFree = (cx, cy, rad, hh = 0) => findFree((x, y) => Math.hypot(x - cx, y - cy) < rad && flatFree(x, y, hh) && neighborsFlat(x, y), 300);
  const neighborsFlat = (x, y) => { for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { if (!inb(x + i, y + j)) return false; if (h[I(x + i, y + j)] !== h[I(x, y)]) return false; } return true; };

  // ── основа: трава с пятнами земли
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) kind[I(x, y)] = vnoise(x * .22, y * .22, seed) > .72 ? K.DIRT : K.GRASS;
  W.trunkR = new Float32Array(N * N);

  // ── раскладка: у каждого сида своя, но правила одни и те же
  const gy = ri(Math.round(N * .35), Math.round(N * .6));                 // ворота — на востоке
  const st = { x: ri(Math.round(N * .28), Math.round(N * .56)), y: 2, w: 8, d: 3 };   // сцена — у северного забора
  const zones = [{ x: st.x + 4, y: 3, r: 6 }, { x: N - 5, y: gy, r: 8 }];  // эти места не занимаем
  // soft — можно заходить на холмы и леса (но не на гору, рощу, пруды, сцену и вход)
  const place = (r, minY = 6, soft = false) => {
    for (let i = 0; i < 500; i++) {
      const x = rr(r + 2, N - r - 3), y = rr(r + minY, N - r - 3);
      if (zones.every(z => (soft && !z.hard) || Math.hypot(z.x - x, z.y - y) > z.r + r + (soft ? -1 : .8))) { const z = { x: Math.round(x), y: Math.round(y), r, hard: !soft }; zones.push(z); return z; }
    }
    return null;
  };
  zones.forEach(z => z.hard = true);
  // главная гора: пологий склон с одной стороны, уступы и отвесная стена с других
  const m = place(9) || { x: 12, y: 13, r: 9 }, pathAng = rr(0, Math.PI * 2), mPeak = R() < .5 ? 4 : 5;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = x - m.x, dy = y - m.y, d = Math.hypot(dx, dy) * (1 + (vnoise(x * .15, y * .15, seed + 41) - .5) * .35); if (d >= m.r) continue;
    let diff = Math.abs(Math.atan2(dy, dx) - pathAng); diff = Math.min(diff, Math.PI * 2 - diff);
    const t = clamp(1 - d / m.r + (vnoise(x * .35, y * .35, seed + 5) - .5) * .12, 0, 1);
    let hh;
    if (diff < .75) hh = Math.floor(t * 5.2);
    else if (diff > 2.45) hh = t > .3 ? 4 : 0;
    else hh = t > .62 ? 4 : (t > .28 ? 2 : 0);
    if (t > .8) hh = Math.max(hh, 4);
    h[I(x, y)] = hh; kind[I(x, y)] = hh >= 3 ? K.ROCK : (hh >= 1 ? K.GRASS : kind[I(x, y)]);
  }
  W.mountain = m;
  W.grove = place(6.5);                                              // роща гигантов — сразу после горы, чтобы ей хватило места
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const x = m.x + i, y = m.y + j; h[I(x, y)] = 5; kind[I(x, y)] = K.DECK; }
  // дополнительные холмы (1–2), разной высоты и формы
  const hills = [];
  for (let k = 0, nh = 1 + (R() < .55 ? 1 : 0); k < nh; k++) {
    const hz = place(rr(4.5, 6.5), 6, true); if (!hz) continue; const top = R() < .5 ? 3 : 4, ang = rr(0, 6.28), stretch = rr(.7, 1.3);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const ex = (x - hz.x) * Math.cos(ang) + (y - hz.y) * Math.sin(ang), ey = -(x - hz.x) * Math.sin(ang) + (y - hz.y) * Math.cos(ang);
      const d = Math.hypot(ex * stretch, ey / stretch) + (vnoise(x * .3, y * .3, seed + 17 + k) - .5) * 1.5; if (d >= hz.r) continue;
      const hh = Math.floor((1 - d / hz.r) * (top + .2)); h[I(x, y)] = Math.max(h[I(x, y)], hh); kind[I(x, y)] = hh >= 3 ? K.ROCK : K.GRASS;
    }
    hills.push(hz);
  }
  const m2 = hills[0] || { x: m.x + 14, y: m.y + 12, r: 5 }; W.hill2 = m2; W.hills = hills;
  // пруды (1–2) с песчаными берегами и камнями-ступеньками
  W.ponds = [];
  for (let k = 0, np = 1 + (R() < .45 ? 1 : 0); k < np; k++) {
    const r = k ? rr(3.5, 5) : rr(5, 6.8), pz = place(r); if (!pz) continue; pz.rx = r; pz.ry = r * rr(.55, .85); const pa = rr(0, 3.14);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const ex = (x - pz.x) * Math.cos(pa) + (y - pz.y) * Math.sin(pa), ey = -(x - pz.x) * Math.sin(pa) + (y - pz.y) * Math.cos(pa);
      const d = Math.hypot(ex / pz.rx, ey / pz.ry) + (vnoise(x * .5, y * .5, seed + 9 + k) - .5) * .3;
      if (d < 1 && h[I(x, y)] <= 1) { kind[I(x, y)] = K.WATER; h[I(x, y)] = 0; } else if (d < 1.35 && h[I(x, y)] === 0) kind[I(x, y)] = K.SAND;
    }
    for (let i = 0; i < 5; i++) { const x = Math.round(pz.x + rr(-pz.rx * .6, pz.rx * .6)), y = Math.round(pz.y + rr(-pz.ry * .5, pz.ry * .5)); if (kind[I(x, y)] === K.WATER) { h[I(x, y)] = 1; kind[I(x, y)] = K.ROCK; } }
    W.ponds.push(pz);
  }
  const pd = W.ponds[0] || { x: N * .7, y: N * .3, rx: 5, ry: 4 }; W.pond = pd;
  // песочница
  const sb = place(4, 6, true) || { x: N * .4, y: N * .7, r: 4.5 };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (Math.hypot(x - sb.x, y - sb.y) + (vnoise(x * .6, y * .6, seed + 2) - .5) < sb.r && h[I(x, y)] === 0 && kind[I(x, y)] !== K.WATER) kind[I(x, y)] = K.SAND;
  W.sandbox = sb;
  // леса (1–2) и роща гигантских деревьев с лианами
  W.forests = []; for (let k = 0, nf = 1 + (R() < .6 ? 1 : 0); k < nf; k++) { const fz = place(rr(5, 7), 6, true); if (fz) W.forests.push(fz); }
  // сцена (север): помост на высоте 1
  for (let j = 0; j < st.d; j++) for (let i = 0; i < st.w; i++) { h[I(st.x + i, st.y + j)] = 1; kind[I(st.x + i, st.y + j)] = K.DECK; }
  W.stage = st;
  // мостки между горой и ближайшим холмом (высота 3)
  {
    let A = null, B = null, bd = 1e9;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (h[I(x, y)] === 3 && Math.hypot(x - m.x, y - m.y) < m.r) for (let y2 = 0; y2 < N; y2++) for (let x2 = 0; x2 < N; x2++) if (h[I(x2, y2)] === 3 && Math.hypot(x2 - m2.x, y2 - m2.y) < m2.r) {
      const d = Math.hypot(x - x2, y - y2); if (d < bd) { bd = d; A = [x, y]; B = [x2, y2]; }
    }
    if (A && bd < 22) {
      const n = Math.max(Math.abs(B[0] - A[0]), Math.abs(B[1] - A[1]));
      for (let i = 0; i <= n; i++) { const x = Math.round(lerp(A[0], B[0], i / n)), y = Math.round(lerp(A[1], B[1], i / n)); if (h[I(x, y)] < 3) { h[I(x, y)] = 3; kind[I(x, y)] = K.DECK; } }
      W.bridge = { A, B };
    }
  }
  // ── ворота и сторожка (восток)
  W.gate = { x: N - 1, y: gy };
  for (let j = -1; j <= 1; j++) for (let i = 1; i <= 3; i++) { const x = N - i, y = gy + j; if (kind[I(x, y)] === K.GRASS || kind[I(x, y)] === K.DIRT) kind[I(x, y)] = K.DIRT; }
  const hut = { x: N - 8, y: gy + 4 };
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) { h[I(hut.x + i, hut.y + j)] = 0; kind[I(hut.x + i, hut.y + j)] = K.COBBLE; blocked[I(hut.x + i, hut.y + j)] = 1; }
  W.hut = hut; add('hut', hut.x + 1.5, hut.y + 1.5, { w: 3, d: 3 }, false);
  add('locker', hut.x - .5, hut.y + 1.5, { opened: false });
  { const p = nearFree(hut.x + 1, hut.y + 4.5, 4) || nearFree(hut.x - 2, hut.y + 1, 5); if (p) add('hose', p[0] + .5, p[1] + .5, {}); }
  add('gate', N - .5, gy + .5, { open: false }, false);
  // ── старт: ровное место в центре-юге
  W.spawn = (() => { const p = nearFree(N * .35, N * .6, 7); return p ? { x: p[0] + .5, y: p[1] + .5 } : { x: 12.5, y: 25.5 }; })();
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const x = Math.floor(W.spawn.x) + i, y = Math.floor(W.spawn.y) + j; if (inb(x, y) && h[I(x, y)] === 0) { blocked[I(x, y)] = 0; } }

  // ── точки возрождения после поимки (разбросаны по карте)
  W.respawns = [W.spawn];
  for (let i = 0; i < 80 && W.respawns.length < 9; i++) { const p = findFree((x, y) => flatFree(x, y) && neighborsFlat(x, y) && W.respawns.every(q => Math.hypot(q.x - x - .5, q.y - y - .5) > 9)); if (p) W.respawns.push({ x: p[0] + .5, y: p[1] + .5 }); }

  // ── растительность
  const onHill = (x, y) => h[I(x, y)] >= 1 && h[I(x, y)] <= 2;
  // породы деревьев: в лесу — сосны и дубы, у воды — ивы, на открытых местах — берёзы, акации, баобабы
  const nearWater = (x, y) => W.ponds.some(p => Math.hypot(x - p.x, y - p.y) < Math.max(p.rx, p.ry) + 3);
  const species = (x, y, inForest) => { const r = R(); if (inForest) return r < .5 ? 'pine' : r < .85 ? 'oak' : 'birch'; if (nearWater(x, y)) return r < .6 ? 'willow' : 'birch'; return r < .35 ? 'oak' : r < .6 ? 'birch' : r < .85 ? 'acacia' : 'baobab'; };
  for (const fz of W.forests) for (let y = Math.round(fz.y - fz.r); y <= fz.y + fz.r; y++) for (let x = Math.round(fz.x - fz.r); x <= fz.x + fz.r; x++) {
    if (!inb(x, y) || Math.hypot(x - fz.x, y - fz.y) + (vnoise(x * .4, y * .4, seed + 23) - .5) * 2 > fz.r) continue;
    if (R() < .34 && flatFree(x, y) && !(Math.abs(x - W.spawn.x) < 3 && Math.abs(y - W.spawn.y) < 3)) { const ban = R() < .25; add(ban ? 'banana_tree' : 'tree', x + .5, y + .5, { bananas: 3, regrow: 0, seed: ri(0, 999), water: 0, sp: ban ? null : species(x, y, true) }); }
  }
  // роща гигантов: огромные кривые деревья с лианами, на которых можно раскачиваться
  W.vines = [];
  if (W.grove) {
    const gz = W.grove, trees = [];
    for (let i = 0; i < 30 && trees.length < 4; i++) {
      const a = rr(0, 6.28), d = rr(0, gz.r - 2), x = Math.floor(gz.x + Math.cos(a) * d), y = Math.floor(gz.y + Math.sin(a) * d);
      if (!flatFree(x, y) || trees.some(t => Math.hypot(t.x - x, t.y - y) < 5)) continue;
      const t = add('giant_tree', x + .5, y + .5, { seed: ri(0, 999), ht: rr(9, 12), trunkR: .55, twist: rr(0, 6.28) }); trees.push(t);
      for (let v = 0; v < 3; v++) {
        const va = t.twist + v * 2.1 + rr(-.3, .3), vd = rr(2.6, 3.6), ax = t.x + Math.cos(va) * vd, ay = t.y + Math.sin(va) * vd;
        if (ax < 2 || ay < 2 || ax > N - 2 || ay > N - 2) continue;
        const ah = t.ht * rr(.48, .6);                          // высота крепления (в метрах сцены)
        W.vines.push({ id: W.vines.length, ax, ay, ah, len: ah - 1.25, tree: t.id });
      }
    }
    W.giants = trees;
  }
  // отдельные деревья и бананы по карте
  for (let i = 0; i < 32; i++) { const p = findFree((x, y) => (flatFree(x, y) || (onHill(x, y))) && Math.hypot(x - W.spawn.x, y - W.spawn.y) > 4); if (p) { const ban = R() < .45; add(ban ? 'banana_tree' : 'tree', p[0] + .5, p[1] + .5, { bananas: 3, regrow: 0, seed: ri(0, 999), water: 0, sp: ban ? null : species(p[0], p[1], false) }); } }
  for (let i = 0; i < 36; i++) { const p = findFree((x, y) => flatFree(x, y)); if (p) add('bush', p[0] + .5, p[1] + .5, { seed: ri(0, 99), sticks: R() < .4 ? 2 : 0, berries: R() < .5 ? 2 : 0, regrow: 0 }, false); }
  // ── кокосовые пальмы и питьевые фонтанчики
  for (let i = 0; i < 7; i++) { const p = findFree((x, y) => (kind[I(x, y)] === K.SAND || kind[I(x, y)] === K.GRASS) && flatFree(x, y) && Math.hypot(x - W.spawn.x, y - W.spawn.y) > 3); if (p) add('coco_palm', p[0] + .5, p[1] + .5, { cocos: 2, regrow: 0, seed: ri(0, 999) }); }
  for (const [cx, cy] of [[N * .45, N * .5], [st.x + 2, st.y + 6]]) { const p = nearFree(cx, cy, 5); if (p) add('fountain', p[0] + .5, p[1] + .5, {}); }
  // ── объекты и интерактивы
  const near = (cx, cy, rad, hh = 0) => nearFree(cx, cy, rad, hh) || findFree((x, y) => flatFree(x, y, hh) && neighborsFlat(x, y));
  for (let i = 0; i < 4; i++) { const p = near(pd.x - 3 + i * 3, pd.y + 7, 4); if (p) add('termite', p[0] + .5, p[1] + .5, { hp: 3, regrow: 0 }); }
  { const p = near(m.x + 8, m.y + 1, 4); if (p) { add('anvil', p[0] + .5, p[1] + .5, { cool: 0 }); const q = nearFree(p[0] + 2, p[1], 2); if (q) add('nutpile', q[0] + .5, q[1] + .5, { nuts: 6, regrow: 0 }); } }
  for (let i = 0; i < 5; i++) { const p = near(N * .5 + rr(-12, 12), N * .5 + rr(-9, 9), 8); if (p) add('stonepile', p[0] + .5, p[1] + .5, { stones: 4, regrow: 0 }); }
  { const p = near(sb.x, sb.y - 4, 5); if (p) add('box', p[0] + .5, p[1] + .5, { cool: 0 }); }
  { const p = near(m2.x - 7, m2.y - 4, 5); if (p) add('box', p[0] + .5, p[1] + .5, { cool: 0 }); }
  { const p = near(pd.x - 6, pd.y + 3, 5); if (p) add('swing', p[0] + .5, p[1] + .5, { cool: 0 }); }
  { const p = near(N * .5, N * .45, 5); if (p) add('swing', p[0] + .5, p[1] + .5, { cool: 0 }); }
  { const p = near(pd.x - 1, pd.y - 6, 4); if (p) add('drums', p[0] + .5, p[1] + .5, { cool: 0 }); }
  { const p = near(st.x - 3, st.y + 2, 3); if (p) add('gong', p[0] + .5, p[1] + .5, { cool: 0 }); }
  { // лазалка на вершине
    let top = null; for (let j = -3; j <= 3 && !top; j++) for (let i = -3; i <= 3; i++) { const x = m.x + i, y = m.y + j; if (inb(x, y) && h[I(x, y)] === 4 && !blocked[I(x, y)] && Math.hypot(i, j) > 2.2) { top = [x, y]; break; } }
    if (top) add('frame', top[0] + .5, top[1] + .5, { cool: 0 });
    add('chest', m.x + .5, m.y + .5, { opened: false }, false);                 // сундук в домике на дереве
  }
  { const p = findFree((x, y) => h[I(x, y)] === 3 && !blocked[I(x, y)] && kind[I(x, y)] === K.ROCK && Math.hypot(x - m2.x, y - m2.y) < 3); if (p) add('chest', p[0] + .5, p[1] + .5, { opened: false, tier2: true }, false); }
  // раскопки (клад)
  const loots = ['coin', 'coin', 'stone', 'stick', 'coin', 'nut', 'coin', 'banana'];
  for (let i = 0; i < 14; i++) { const p = findFree((x, y) => (kind[I(x, y)] === K.SAND || kind[I(x, y)] === K.DIRT) && flatFree(x, y) && h[I(x, y)] === 0); if (p) add('dig', p[0] + .5, p[1] + .5, { loot: loots[i % loots.length], dug: false }, false); }
  // лестницы на отвесных стенах
  { let n = 0; for (let y = 1; y < N - 1 && n < 5; y++) for (let x = 1; x < N - 1 && n < 5; x++) {
    if (hash2(x, y, seed) > .06) continue; const dd = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dy] of dd) { const nx = x + dx, ny = y + dy; if (!inb(nx, ny)) continue; const d = h[I(nx, ny)] - h[I(x, y)];
      if (d >= 3 && d <= 5 && flatFree(x, y, h[I(x, y)]) && !blocked[I(nx, ny)] && kind[I(nx, ny)] !== K.WATER) { add('ladder', x + .5 + dx * .35, y + .5 + dy * .35, { to: { x: nx + .5, y: ny + .5, z: h[I(nx, ny)] }, dx, dy }, false); n++; break; } } } }

  // ── путевые точки смотрителя: ровные свободные клетки по кругу
  // ── новые предметы: ящики, бочки, валуны (толкать → баррикады), шины, грязь, гамаки, брёвна
  for (let i = 0; i < 7; i++) { const p = findFree((x, y) => flatFree(x, y) && Math.hypot(x - W.spawn.x, y - W.spawn.y) > 3); if (p) add('crate', p[0] + .5, p[1] + .5, {}); }
  for (let i = 0; i < 5; i++) { const p = findFree((x, y) => flatFree(x, y) && Math.hypot(x - W.spawn.x, y - W.spawn.y) > 3); if (p) add('barrel', p[0] + .5, p[1] + .5, {}); }
  for (let i = 0; i < 3; i++) { const p = findFree((x, y) => flatFree(x, y) && neighborsFlat(x, y)); if (p) add('boulder', p[0] + .5, p[1] + .5, {}); }
  for (let i = 0; i < 2; i++) { const p = near(W.spawn.x + (i ? 6 : -4), W.spawn.y + (i ? -3 : 2), 6); if (p) add('tire', p[0] + .5, p[1] + .5, { held: null }, false); }
  for (let i = 0; i < 2; i++) { const p = findFree((x, y) => flatFree(x, y) && neighborsFlat(x, y) && kind[I(x, y)] !== K.SAND); if (p) { add('mud', p[0] + .5, p[1] + .5, {}, false); for (let j = -1; j <= 1; j++) for (let k2 = -1; k2 <= 1; k2++) if (Math.abs(j) + Math.abs(k2) < 2) kind[I(p[0] + k2, p[1] + j)] = K.DIRT; } }
  for (let i = 0; i < 2; i++) { const p = findFree((x, y) => flatFree(x, y) && neighborsFlat(x, y)); if (p) add('hammock', p[0] + .5, p[1] + .5, { cool: 0 }); }
  for (let i = 0; i < 2; i++) { const p = findFree((x, y) => flatFree(x, y)); if (p) add('logpile', p[0] + .5, p[1] + .5, { logs: 4, regrow: 0 }); }

  W.decorIn = [];
  for (let i = 0; i < 26; i++) { const p = findFree((x, y) => flatFree(x, y) && kind[I(x, y)] !== K.SAND); if (p) W.decorIn.push({ k: pick3(R, ['flog', 'stump', 'rocks', 'rocks', 'stump']), x: p[0] + rr(.2, .8), y: p[1] + rr(.2, .8), a: rr(0, 6.28), s: ri(0, 99) }); }

  const pts = []; for (let i = 0; i < 50 && pts.length < 11; i++) { const p = findFree((x, y) => flatFree(x, y) && neighborsFlat(x, y) && pts.every(q => Math.hypot(q.x - x, q.y - y) > 7)); if (p) pts.push({ x: p[0] + .5, y: p[1] + .5 }); }
  pts.sort((a, b) => Math.atan2(a.y - N / 2, a.x - N / 2) - Math.atan2(b.y - N / 2, b.x - N / 2)); W.wps = pts;
  // ── животные
  const spot = (cx, cy, rad) => nearFree(cx, cy, rad) || [Math.floor(W.spawn.x) + 2, Math.floor(W.spawn.y)];
  const fur = ['brown', 'dark', 'ginger'];
  for (let i = 0; i < 7; i++) { const p = spot(N * .5 + rr(-12, 12), N * .55 + rr(-9, 9), 12); W.npcSpawns.push({ sp: 'chimp', x: p[0] + .5, y: p[1] + .5, fur: fur[i % 3], name: ['Чита', 'Бобо', 'Мими', 'Гоша', 'Луна', 'Кузя', 'Тоша'][i] }); }
  { const p = spot(N * .6, N * .4, 8); W.npcSpawns.push({ sp: 'troop', x: p[0] + .5, y: p[1] + .5 }); }
  { const p = spot(m2.x - 6, m2.y, 5); W.npcSpawns.push({ sp: 'gorilla', x: p[0] + .5, y: p[1] + .5 }); }
  for (let i = 0; i < 2; i++) { const p = spot(N * .5 + rr(-9, 9), N * .5 + rr(-3, 9), 10); W.npcSpawns.push({ sp: 'tortoise', x: p[0] + .5, y: p[1] + .5 }); }
  { const pd2 = W.ponds[W.ponds.length - 1] || W.pond, p = spot(pd2.x + pd2.rx + 2, pd2.y + 1, 7); W.spawnPython = { x: p[0] + .5, y: p[1] + .5 }; }
  for (let i = 0; i < 3; i++) W.npcSpawns.push({ sp: 'parrot', x: rr(6, N - 6), y: rr(6, N - 6), col: [PAL.red, PAL.blue, PAL.lime][i] });
  W.npcSpawns.push({ sp: 'python', x: W.spawnPython.x, y: W.spawnPython.y });
  // ── зрители снаружи: север и запад (и немного у ворот)
  for (let i = 0; 2 + i * 2.3 < N - 2; i++) W.visitors.push({ x: 2 + i * 2.3 + rr(-.4, .4), y: -1.5 - rr(0, 1.4), side: 'n' });
  for (let i = 0; 3 + i * 2.8 < N - 3; i++) W.visitors.push({ x: -1.5 - rr(0, 1.4), y: 3 + i * 2.8 + rr(-.4, .4), side: 'w' });
  // ── декор снаружи
  for (let i = 0; i < 46; i++) {
    const a = rr(0, Math.PI * 2), rad = rr(N * .78, N * .78 + 14), x = N / 2 + Math.cos(a) * rad, y = N / 2 + Math.sin(a) * rad;
    if (x > N + 3 && Math.abs(y - gy) < 4) continue; if (x > -6 && x < N + 5 && y > -6 && y < N + 5) continue;
    W.decor.push({ k: R() < .75 ? 'tree' : 'bush', x, y, s: ri(0, 99) });
  }
  for (let i = 0; i < N; i += 7) { W.decor.push({ k: 'lamp', x: i + 1, y: -3.4 }); W.decor.push({ k: 'lamp', x: -3.4, y: i + 1 }); }
  W.decor.push({ k: 'bench', x: 8, y: -2.2 }, { k: 'bench', x: -2.2, y: 14 }, { k: 'kiosk', x: 30, y: -3 }, { k: 'sign', x: -2.4, y: 24 }, { k: 'lamp', x: N + 2.4, y: gy - 2 }, { k: 'lamp', x: N + 2.4, y: gy + 3 });
  return W;
}
// высота земли в точке (с учётом границ карты)
function pick3(R, a) { return a[Math.floor(R() * a.length)]; }
function groundAt(W, x, y) { const tx = Math.floor(x), ty = Math.floor(y); return (tx < 0 || ty < 0 || tx >= W.N || ty >= W.N) ? 0 : W.h[ty * W.N + tx]; }
