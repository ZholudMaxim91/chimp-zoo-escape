'use strict';
// ───────── Мир: рельеф с ярусами и объекты. Всё строится из сида ─────────
const N = 40;                                   // сторона вольера в клетках
const LH = 8;                                   // высота одного яруса в пикселях
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
    W.objs.push(o); if (block && inb(o.tx, o.ty)) blocked[I(o.tx, o.ty)] = 1; return o;
  };
  const free = (x, y) => inb(x, y) && !blocked[I(x, y)] && kind[I(x, y)] !== K.WATER && kind[I(x, y)] !== K.DECK;
  const flatFree = (x, y, hh = 0) => free(x, y) && h[I(x, y)] === hh;
  const findFree = (pred, tries = 400) => { for (let i = 0; i < tries; i++) { const x = ri(2, N - 3), y = ri(2, N - 3); if (pred(x, y)) return [x, y]; } return null; };
  const nearFree = (cx, cy, rad, hh = 0) => findFree((x, y) => Math.hypot(x - cx, y - cy) < rad && flatFree(x, y, hh) && neighborsFlat(x, y), 300);
  const neighborsFlat = (x, y) => { for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { if (!inb(x + i, y + j)) return false; if (h[I(x + i, y + j)] !== h[I(x, y)]) return false; } return true; };

  // ── основа: трава с пятнами земли
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) kind[I(x, y)] = vnoise(x * .22, y * .22, seed) > .72 ? K.DIRT : K.GRASS;

  // ── главная гора (с севера-запада): пологий склон с одной стороны, обрывы с другой
  const m = { x: ri(9, 13), y: ri(9, 13), r: 8 }, pathAng = rr(0, Math.PI * 2);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = x - m.x, dy = y - m.y, d = Math.hypot(dx, dy); if (d >= m.r) continue;
    let diff = Math.abs(Math.atan2(dy, dx) - pathAng); diff = Math.min(diff, Math.PI * 2 - diff);
    const t = clamp(1 - d / m.r + (vnoise(x * .35, y * .35, seed + 5) - .5) * .12, 0, 1);
    let hh;
    if (diff < .75) hh = Math.floor(t * 5.2);                       // пологий склон (ступеньки по 1)
    else if (diff > 2.45) hh = t > .3 ? 4 : 0;                      // отвесная стена (нужна лестница/лиана)
    else hh = t > .62 ? 4 : (t > .28 ? 2 : 0);                      // уступы по 2 (можно перепрыгнуть)
    if (t > .8) hh = Math.max(hh, 4);
    h[I(x, y)] = hh; kind[I(x, y)] = hh >= 3 ? K.ROCK : (hh >= 1 ? K.GRASS : kind[I(x, y)]);
  }
  W.mountain = m;
  // верхняя площадка-«домик на дереве» 3×3 на высоте 5
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const x = m.x + i, y = m.y + j; h[I(x, y)] = 5; kind[I(x, y)] = K.DECK; }
  // ── второй холм (юго-восток)
  const m2 = { x: ri(24, 28), y: ri(25, 29), r: 5.5 };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const d = Math.hypot(x - m2.x, y - m2.y); if (d >= m2.r) continue;
    const hh = Math.floor((1 - d / m2.r) * 4.2); h[I(x, y)] = Math.max(h[I(x, y)], hh); kind[I(x, y)] = hh >= 3 ? K.ROCK : K.GRASS;
  }
  W.hill2 = m2;
  // ── пруд (с северо-востока), песчаный берег
  const pd = { x: ri(27, 31), y: ri(9, 13), rx: 5.5, ry: 3.8 };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const d = Math.hypot((x - pd.x) / pd.rx, (y - pd.y) / pd.ry) + (vnoise(x * .5, y * .5, seed + 9) - .5) * .25;
    if (d < 1) { kind[I(x, y)] = K.WATER; h[I(x, y)] = 0; } else if (d < 1.35 && h[I(x, y)] === 0) kind[I(x, y)] = K.SAND;
  }
  W.pond = pd;
  for (let i = 0; i < 4; i++) { const x = Math.round(pd.x + rr(-3, 3)), y = Math.round(pd.y + rr(-2, 2)); if (kind[I(x, y)] === K.WATER) { h[I(x, y)] = 1; kind[I(x, y)] = K.ROCK; } }   // камни-ступеньки
  // ── песочница (юг-центр)
  const sb = { x: ri(14, 18), y: ri(28, 32), r: 3.8 };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (Math.hypot(x - sb.x, y - sb.y) + (vnoise(x * .6, y * .6, seed + 2) - .5) < sb.r && h[I(x, y)] === 0 && kind[I(x, y)] !== K.WATER) kind[I(x, y)] = K.SAND;
  W.sandbox = sb;
  // ── сцена (север-центр): помост на высоте 1
  const st = { x: ri(17, 21), y: 2, w: 7, d: 3 };
  for (let j = 0; j < st.d; j++) for (let i = 0; i < st.w; i++) { h[I(st.x + i, st.y + j)] = 1; kind[I(st.x + i, st.y + j)] = K.DECK; }
  W.stage = st;
  // ── мостки между горой и вторым холмом (высота 3)
  {
    let A = null, B = null, bd = 1e9;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (h[I(x, y)] === 3 && Math.hypot(x - m.x, y - m.y) < m.r) for (let y2 = 0; y2 < N; y2++) for (let x2 = 0; x2 < N; x2++) if (h[I(x2, y2)] === 3 && Math.hypot(x2 - m2.x, y2 - m2.y) < m2.r) {
      const d = Math.hypot(x - x2, y - y2); if (d < bd) { bd = d; A = [x, y]; B = [x2, y2]; }
    }
    if (A) {
      const n = Math.max(Math.abs(B[0] - A[0]), Math.abs(B[1] - A[1]));
      for (let i = 0; i <= n; i++) { const x = Math.round(lerp(A[0], B[0], i / n)), y = Math.round(lerp(A[1], B[1], i / n)); if (h[I(x, y)] < 3) { h[I(x, y)] = 3; kind[I(x, y)] = K.DECK; } }
      W.bridge = { A, B };
    }
  }
  // ── ворота и сторожка (восток)
  const gy = ri(17, 22); W.gate = { x: N - 1, y: gy };
  for (let j = -1; j <= 1; j++) for (let i = 1; i <= 3; i++) { const x = N - i, y = gy + j; if (kind[I(x, y)] === K.GRASS || kind[I(x, y)] === K.DIRT) kind[I(x, y)] = K.DIRT; }
  const hut = { x: N - 8, y: gy + 4 };
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) { h[I(hut.x + i, hut.y + j)] = 0; kind[I(hut.x + i, hut.y + j)] = K.COBBLE; blocked[I(hut.x + i, hut.y + j)] = 1; }
  W.hut = hut; add('hut', hut.x + 1.5, hut.y + 1.5, { w: 3, d: 3 }, false);
  add('locker', hut.x - .5, hut.y + 1.5, { opened: false });
  add('gate', N - .5, gy + .5, { open: false }, false);
  // ── старт: ровное место в центре-юге
  W.spawn = (() => { const p = nearFree(N * .35, N * .6, 7); return p ? { x: p[0] + .5, y: p[1] + .5 } : { x: 12.5, y: 25.5 }; })();
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const x = Math.floor(W.spawn.x) + i, y = Math.floor(W.spawn.y) + j; if (inb(x, y) && h[I(x, y)] === 0) { blocked[I(x, y)] = 0; } }

  // ── растительность
  const onHill = (x, y) => h[I(x, y)] >= 1 && h[I(x, y)] <= 2;
  // лес на юго-западе
  for (let y = 27; y < N - 1; y++) for (let x = 1; x < 15; x++) {
    if (R() < .3 && flatFree(x, y) && !(Math.abs(x - W.spawn.x) < 3 && Math.abs(y - W.spawn.y) < 3)) add(R() < .32 ? 'banana_tree' : 'tree', x + .5, y + .5, { bananas: 3, regrow: 0, seed: ri(0, 999), water: 0 });
  }
  // отдельные деревья и бананы по карте
  for (let i = 0; i < 20; i++) { const p = findFree((x, y) => (flatFree(x, y) || (onHill(x, y))) && Math.hypot(x - W.spawn.x, y - W.spawn.y) > 4); if (p) add(R() < .45 ? 'banana_tree' : 'tree', p[0] + .5, p[1] + .5, { bananas: 3, regrow: 0, seed: ri(0, 999), water: 0 }); }
  for (let i = 0; i < 22; i++) { const p = findFree((x, y) => flatFree(x, y)); if (p) add('bush', p[0] + .5, p[1] + .5, { seed: ri(0, 99), sticks: R() < .4 ? 2 : 0, berries: R() < .5 ? 2 : 0, regrow: 0 }, false); }
  // ── объекты и интерактивы
  const near = (cx, cy, rad, hh = 0) => nearFree(cx, cy, rad, hh) || findFree((x, y) => flatFree(x, y, hh) && neighborsFlat(x, y));
  for (let i = 0; i < 3; i++) { const p = near(pd.x - 2 + i * 3, pd.y + 6, 4); if (p) add('termite', p[0] + .5, p[1] + .5, { hp: 3, regrow: 0 }); }
  { const p = near(m.x + 8, m.y + 1, 4); if (p) { add('anvil', p[0] + .5, p[1] + .5, { cool: 0 }); const q = nearFree(p[0] + 2, p[1], 2); if (q) add('nutpile', q[0] + .5, q[1] + .5, { nuts: 6, regrow: 0 }); } }
  for (let i = 0; i < 3; i++) { const p = near(N * .5 + rr(-8, 8), N * .5 + rr(-6, 6), 8); if (p) add('stonepile', p[0] + .5, p[1] + .5, { stones: 4, regrow: 0 }); }
  { const p = near(sb.x, sb.y - 4, 5); if (p) add('box', p[0] + .5, p[1] + .5, { cool: 0 }); }
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
  for (let i = 0; i < 9; i++) { const p = findFree((x, y) => (kind[I(x, y)] === K.SAND || kind[I(x, y)] === K.DIRT) && flatFree(x, y) && h[I(x, y)] === 0); if (p) add('dig', p[0] + .5, p[1] + .5, { loot: loots[i % loots.length], dug: false }, false); }
  // лестницы на отвесных стенах
  { let n = 0; for (let y = 1; y < N - 1 && n < 3; y++) for (let x = 1; x < N - 1 && n < 3; x++) {
    if (hash2(x, y, seed) > .06) continue; const dd = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dy] of dd) { const nx = x + dx, ny = y + dy; if (!inb(nx, ny)) continue; const d = h[I(nx, ny)] - h[I(x, y)];
      if (d >= 3 && d <= 5 && flatFree(x, y, h[I(x, y)]) && !blocked[I(nx, ny)] && kind[I(nx, ny)] !== K.WATER) { add('ladder', x + .5 + dx * .35, y + .5 + dy * .35, { to: { x: nx + .5, y: ny + .5, z: h[I(nx, ny)] }, dx, dy }, false); n++; break; } } } }

  // ── путевые точки смотрителя: ровные свободные клетки по кругу
  const pts = []; for (let i = 0; i < 40 && pts.length < 8; i++) { const p = findFree((x, y) => flatFree(x, y) && neighborsFlat(x, y) && pts.every(q => Math.hypot(q.x - x, q.y - y) > 7)); if (p) pts.push({ x: p[0] + .5, y: p[1] + .5 }); }
  pts.sort((a, b) => Math.atan2(a.y - N / 2, a.x - N / 2) - Math.atan2(b.y - N / 2, b.x - N / 2)); W.wps = pts;
  // ── животные
  const spot = (cx, cy, rad) => nearFree(cx, cy, rad) || [Math.floor(W.spawn.x) + 2, Math.floor(W.spawn.y)];
  const fur = ['brown', 'dark', 'ginger'];
  for (let i = 0; i < 3; i++) { const p = spot(N * .5 + rr(-5, 5), N * .55 + rr(-4, 4), 7); W.npcSpawns.push({ sp: 'chimp', x: p[0] + .5, y: p[1] + .5, fur: fur[i], name: ['Чита', 'Бобо', 'Мими'][i] }); }
  { const p = spot(m2.x - 6, m2.y, 5); W.npcSpawns.push({ sp: 'gorilla', x: p[0] + .5, y: p[1] + .5 }); }
  for (let i = 0; i < 2; i++) { const p = spot(N * .5 + rr(-9, 9), N * .5 + rr(-3, 9), 10); W.npcSpawns.push({ sp: 'tortoise', x: p[0] + .5, y: p[1] + .5 }); }
  for (let i = 0; i < 3; i++) W.npcSpawns.push({ sp: 'parrot', x: rr(6, N - 6), y: rr(6, N - 6), col: [PAL.red, PAL.blue, PAL.lime][i] });
  // ── зрители снаружи: север и запад (и немного у ворот)
  for (let i = 0; i < 16; i++) W.visitors.push({ x: 2 + i * 2.3 + rr(-.4, .4), y: -1.5 - rr(0, 1.4), side: 'n' });
  for (let i = 0; i < 12; i++) W.visitors.push({ x: -1.5 - rr(0, 1.4), y: 3 + i * 2.8 + rr(-.4, .4), side: 'w' });
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
function groundAt(W, x, y) { const tx = Math.floor(x), ty = Math.floor(y); return (tx < 0 || ty < 0 || tx >= W.N || ty >= W.N) ? 0 : W.h[ty * W.N + tx]; }
