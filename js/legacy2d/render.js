'use strict';
// ───────── Отрисовка мира (изометрия, пиксель-арт 480×270) ─────────
const VW = 480, VH = 270;
const cv = $('c'), g = cv.getContext('2d');
cv.width = VW; cv.height = VH; g.imageSmoothingEnabled = false;
function fitCanvas() { const s = Math.min(innerWidth / VW, innerHeight / VH); cv.style.width = Math.floor(VW * s) + 'px'; cv.style.height = Math.floor(VH * s) + 'px'; }
addEventListener('resize', fitCanvas); fitCanvas();

const CAM = { x: 0, y: 0 };
let CX = 0, CY = 0;
const SX = (x, y) => Math.round((x - y) * 16 - CX + VW / 2);
const SY = (x, y, z) => Math.round((x + y) * 8 - z * LH - CY + VH / 2);
function updateCam(dt, snap) {
  const m = G.me; if (!m) return;
  const tx = (m.x - m.y) * 16, ty = (m.x + m.y) * 8 - m.rz * LH * .8;
  if (snap) { CAM.x = tx; CAM.y = ty; } else { const k = 1 - Math.exp(-dt * 7); CAM.x += (tx - CAM.x) * k; CAM.y += (ty - CAM.y) * k; }
  CX = Math.round(CAM.x); CY = Math.round(CAM.y);
}
// курсор мыши → точка в мире (находит самую высокую поверхность под курсором)
function screenToWorld(mx, my) {
  const px = mx + CX - VW / 2, py = my + CY - VH / 2;
  for (let hz = 8; hz >= 0; hz--) {
    const a = px / 16, b = (py + hz * LH) / 8, x = (a + b) / 2, y = (b - a) / 2;
    if (x >= -12 && y >= -12 && x < N + 12 && y < N + 12) { const gh = (x >= 0 && y >= 0 && x < N && y < N) ? groundAt(G.W, x, y) : 0; if (gh === hz) return { x, y, z: gh }; }
  }
  const a = px / 16, b = py / 8; return { x: (a + b) / 2, y: (b - a) / 2, z: 0 };
}

const VIGN = (() => { const c = mkCanvas(VW, VH), x = c.getContext('2d'), gr = x.createRadialGradient(VW / 2, VH / 2, VH * .35, VW / 2, VH / 2, VW * .62); gr.addColorStop(0, 'rgba(10,20,30,0)'); gr.addColorStop(1, 'rgba(10,20,30,.45)'); x.fillStyle = gr; x.fillRect(0, 0, VW, VH); return c; })();

function shadowAt(x, y, rx = 5, ry = 2, a = .3) { const z = groundAt(G.W, x, y); g.globalAlpha = a; oval(g, SX(x, y), SY(x, y, z) + 0, rx, ry, P_.ink); g.globalAlpha = 1; }

// ── кадр ──
const BASE = 24;
function renderWorld(dt) {
  const W = G.W, T = G.t;
  updateCam(dt, G.camSnap); G.camSnap = false;
  g.fillStyle = P_.g1; g.fillRect(0, 0, VW, VH);
  g.drawImage(OUTER.c, OUTER.minPX - CX + VW / 2, OUTER.minPY - CY + VH / 2);

  const B = Array.from({ length: 2 * N + BASE * 2 }, () => []);
  const put = (x, y, key, f) => { const d = clamp(Math.floor(x) + Math.floor(y) + BASE, 0, B.length - 1); B[d].push({ k: key, f }); };
  const inView = (x, y, m = 40) => { const sx = SX(x, y); if (sx < -m || sx > VW + m) return false; const sy = SY(x, y, 0); return sy > -90 - m && sy < VH + 70; };
  const me = G.me;

  // забор
  const gate = W.gate, gy = gate.y;
  for (let i = 0; i < N; i++) {
    for (const [x, y, flip, hf, kk] of [[i, 0, false, 15, -10], [0, i, true, 15, -10], [i, N, false, 8, 10], [N, i, true, 8, 10]]) {
      if (x === N && i >= gy - 1 && i <= gy + 1) continue;
      const cx = flip ? x : x + .5, cy = flip ? y + .5 : y;
      if (!inView(cx, cy, 30)) continue;
      const tz = groundAt(W, Math.min(x, N - 1), Math.min(y, N - 1)), s = fenceSpr(hf);
      put(Math.min(cx, N - .01), Math.min(cy, N - .01), cx + cy + kk, () => blit(g, s, SX(x, y), SY(x, y, tz), flip));
    }
  }
  // ворота
  put(N - .5, gy + 1.5, 200, () => drawGate(W));
  // сцена (баннер)
  const st = W.stage; put(st.x + st.w / 2, st.y + .2, st.x + st.w / 2 + st.y + .1, () => blit(g, bannerSpr(), SX(st.x + st.w / 2, st.y + .2), SY(st.x + st.w / 2, st.y + .2, 1)));
  // объекты
  for (const o of W.objs) { if (!inView(o.x, o.y, 60)) continue; if (o.type === 'hut') { put(o.x + 1.2, o.y + 1.2, o.x + o.y + 2.4, () => blit(g, hutSpr(), SX(o.x, o.y), SY(o.x, o.y, 0))); continue; } if (o.type === 'gate') continue; put(o.x, o.y, o.x + o.y, () => drawObj(o)); }
  for (const d of W.decor) { if (!inView(d.x, d.y, 60)) continue; put(d.x, d.y, d.x + d.y, () => drawDecor(d)); }
  // зрители
  for (const v of G.vis) { if (v.a < .05 || !inView(v.x, v.y)) continue; put(v.x, v.y, v.x + v.y, () => drawVisitor(v)); }
  // подбираемое
  for (const p of G.pickups) put(p.x, p.y, p.x + p.y, () => drawPickup(p));
  for (const s of G.splats) put(s.x, s.y, s.x + s.y - 20, () => { const x = SX(s.x, s.y), y = SY(s.x, s.y, s.z); g.globalAlpha = clamp((28 - s.t) / 6, 0, 1); oval(g, x, y, 4, 2, P_.d0); px(g, x + 3, y - 1, P_.d1); px(g, x - 3, y, P_.d1); g.globalAlpha = 1; });
  // животные, смотритель, игроки
  for (const n of G.npcs) put(n.x, n.y, n.x + n.y + .001, () => drawNpc(n));
  if (G.keeper) { const k = G.keeper; put(k.x, k.y, k.x + k.y, () => drawKeeper(k)); }
  for (const p of G.players) put(p.x, p.y, p.x + p.y + .002, () => drawPlayer(p));
  for (const pr of G.proj) put(pr.x, pr.y, pr.x + pr.y + 5, () => drawProj(pr));

  // тайлы по диагоналям + существа этой диагонали
  const hh = W.h, kd = W.kind;
  for (let d = -BASE; d <= 2 * N + BASE - 2; d++) {
    const x0 = Math.max(0, d - N + 1), x1 = Math.min(N - 1, d);
    for (let x = x0; x <= x1; x++) {
      const y = d - x, i = y * N + x, h = hh[i], k = kd[i];
      const sx = SX(x, y); if (sx < -20 || sx > VW + 20) continue;
      const dl = y + 1 < N ? Math.max(0, h - hh[i + N]) : h, dr = x + 1 < N ? Math.max(0, h - hh[i + 1]) : h;
      const z = k === K.WATER ? h - .35 : h, sy = SY(x, y, z);
      if (sy > VH + 8 || sy + 16 + Math.max(dl, dr) * LH < 0) continue;
      const spr = tileSpr(k, k === K.WATER ? 0 : Math.min(dl, 9), Math.min(dr, 9), (x * 7 + y * 13) & 3);
      g.drawImage(spr.c, sx - 16, sy);
      if (k === K.WATER) { const q = hash2(x, y, Math.floor(T * 3)); if (q < .25) { const ox = 8 + Math.floor(hash2(x, y, 1) * 16), oy = 5 + Math.floor(hash2(y, x, 2) * 5); px(g, sx - 16 + ox, sy + oy, P_.w3); px(g, sx - 16 + ox + 1, sy + oy, P_.w3); } }
      else if (k === K.GRASS && h <= 2 && hash2(x, y, 77) < .07) { const ox = 8 + Math.floor(hash2(x, y, 5) * 16), oy = 4 + Math.floor(hash2(x, y, 6) * 7), t = hash2(x, y, 8);
        if (t < .5) { px(g, sx - 16 + ox, sy + oy, P_.g4); px(g, sx - 16 + ox, sy + oy - 1, P_.g3); px(g, sx - 15 + ox, sy + oy - 1, P_.g3); }
        else { px(g, sx - 16 + ox, sy + oy, [P_.pink, P_.white, P_.yel][t < .7 ? 0 : t < .85 ? 1 : 2]); px(g, sx - 16 + ox, sy + oy + 1, P_.g1); } }
    }
    const list = B[d + BASE]; if (list.length) { list.sort((a, b) => a.k - b.k); for (const e of list) e.f(); }
  }
  // след частиц и подсказки
  drawParts();
  for (const f of G.floaters) { const a = clamp(1.6 - f.t, 0, 1); g.globalAlpha = a; pxText(g, f.text, SX(f.x, f.y), SY(f.x, f.y, f.z) - 14 - f.t * 14, f.col, 8); g.globalAlpha = 1; }
  drawTutArrows();
  g.drawImage(VIGN, 0, 0);
  drawAim();
}

// ── объекты ──
function drawObj(o) {
  const z = groundAt(G.W, o.x, o.y), x = SX(o.x, o.y), y = SY(o.x, o.y, z), T = G.t;
  switch (o.type) {
    case 'tree': blit(g, treeSpr(o.seed % 3), x, y); break;
    case 'banana_tree': blit(g, palmSpr(o.seed % 3), x, y); if (o.bananas > 0) blit(g, bananasSpr(o.bananas), x, y - 34); break;
    case 'bush': blit(g, bushSpr(o.seed % 3, o.berries > 0, o.sticks > 0), x, y); break;
    case 'termite': blit(g, termiteSpr(o.hp), x, y); break;
    case 'anvil': blit(g, anvilSpr(), x, y); break;
    case 'nutpile': if (o.nuts > 0) blit(g, nutpileSpr(), x, y); break;
    case 'stonepile': if (o.stones > 0) blit(g, stonepileSpr(), x, y); break;
    case 'box': blit(g, boxSpr(o.cool > 0), x, y + Math.round(Math.sin(T * 3) * (o.cool > 0 ? 0 : 1))); break;
    case 'swing': blit(g, swingSpr(Math.floor(T * (o.active > 0 ? 6 : 1.4)) % 2), x, y); break;
    case 'drums': blit(g, drumsSpr(), x, y); break;
    case 'gong': blit(g, gongSpr(o.ring > 0 ? Math.floor(T * 20) % 2 : 0), x, y); break;
    case 'frame': blit(g, frameSpr(), x, y); break;
    case 'chest': blit(g, chestSpr(o.opened), x, y); break;
    case 'locker': blit(g, chestSpr(o.opened), x, y); break;
    case 'ladder': blit(g, ladderSpr(Math.round(o.to.z - z)), x, y); break;
    case 'dig': { const near = G.me && Math.hypot(G.me.x - o.x, G.me.y - o.y) < 4.5; if (o.dug) blit(g, digSpr(false), x, y); else if (near && Math.floor(T * 2.5) % 2) blit(g, digSpr(true), x, y); break; }
  }
}
function drawDecor(d) {
  const z = 0, x = SX(d.x, d.y), y = SY(d.x, d.y, z);
  switch (d.k) {
    case 'tree': blit(g, treeSpr(d.s % 3), x, y); break;
    case 'bush': blit(g, bushSpr(d.s % 3, false, false), x, y); break;
    case 'lamp': blit(g, lampSpr(), x, y); break;
    case 'bench': blit(g, benchSpr(), x, y); break;
    case 'kiosk': blit(g, kioskSpr(), x, y); break;
    case 'sign': blit(g, signSpr(), x, y); break;
  }
}
function drawGate(W) {
  const gy = W.gate.y, open = G.gateOpen;
  const a = [N, gy - 1], b = [N, gy + 2];
  const ax = SX(a[0], a[1]), ay = SY(a[0], a[1], 0), bx = SX(b[0], b[1]), by = SY(b[0], b[1], 0);
  if (!open) { for (let t = 0; t <= 6; t++) { const yy = gy - 1 + t * .5, sx = SX(N, yy), sy = SY(N, yy, 0); lineP(g, sx, sy, sx, sy - 24, P_.red, 2); px(g, sx, sy - 24, '#ff8a70'); } lineP(g, ax, ay - 12, bx, by - 12, P_.red2, 2); }
  else { const sw = Math.min(1, G.gateAnim); for (const [p0, dir] of [[a, 1], [b, -1]]) { const ex = SX(N + sw * 1.3, p0[1] + dir * (1 - sw) * 1.5), ey = SY(N + sw * 1.3, p0[1] + dir * (1 - sw) * 1.5, 0), sx = SX(p0[0], p0[1]), sy = SY(p0[0], p0[1], 0); lineP(g, sx, sy - 24, ex, ey - 24, P_.red, 2); lineP(g, sx, sy - 4, ex, ey - 4, P_.red, 2); lineP(g, sx, sy, ex, ey, P_.red2, 1); } }
  blit(g, fenceGatePost(), ax, ay); blit(g, fenceGatePost(), bx, by); lineP(g, ax, ay - 38, bx, by - 38, P_.yel2, 3);
  if (!open) { disc(g, (ax + bx) / 2, (ay + by) / 2 - 14, 3, P_.yel); px(g, (ax + bx) / 2, (ay + by) / 2 - 14, P_.ink); if (G.hasKey && lvSum() >= NEED_SUM && Math.floor(G.t * 4) % 2) { disc(g, (ax + bx) / 2, (ay + by) / 2 - 14, 6, 'rgba(255,230,120,.35)'); } }
  else if (Math.floor(G.t * 3) % 2) pxText(g, '> БЕГИ! >', (ax + bx) / 2 + 26, (ay + by) / 2 - 46, P_.yel, 8);
}

// ── существа ──
const WALK = [0, 1, 0, 3];
function frameOf(e) { return e.moving ? WALK[Math.floor(G.t * (e.sprint ? 12 : 8)) % 4] : 0; }
function actName(p) {
  const a = p.act ? p.act.type : null;
  if (a === 'climb' || a === 'swing' || a === 'show' || a === 'drum' || a === 'hoot' || a === 'ladder') return 'up';
  if (a === 'throw' || a === 'eat' ) return a;
  if (a === 'crack' || a === 'fish' || a === 'dig') return p.act.t % .4 < .2 ? 'eat' : '';
  if (p.crouch && !a) return 'crouch';
  return a === 'rest' ? 'happy' : '';
}
function drawPlayer(p) {
  const gz = groundAt(G.W, p.x, p.y), x = SX(p.x, p.y), flip = p.fx < 0;
  shadowAt(p.x, p.y, 5, 2, .3);
  const bob = p.moving && p.grounded ? (Math.floor(G.t * (p.sprint ? 12 : 8)) % 2) : 0;
  const s = chimpSpr(p.fur, p.fb ? 'f' : 'b', frameOf(p), actName(p));
  const y = SY(p.x, p.y, p.rz) - bob;
  if (p.stun > 0) { blit(g, s, x + Math.round(Math.sin(G.t * 40)), y, flip); pxText(g, '*', x, y - 28, P_.yel, 10); } else blit(g, s, x, y, flip);
  if (p.splat > 0) { const sx = x - 3, sy = y - 12; rect(g, sx, sy, 4, 3, P_.d0); px(g, sx + 4, sy + 1, P_.d1); px(g, sx - 1, sy + 2, P_.d1); rect(g, x + 1, y - 22, 3, 2, P_.d0); px(g, x + 4, y - 21, P_.d1); }
  if (p.act && p.act.dur > .5) { const w = 20, pr = clamp(p.act.t / p.act.dur, 0, 1); rect(g, x - w / 2 - 1, y - 33, w + 2, 4, P_.ink); rect(g, x - w / 2, y - 32, w * pr, 2, P_.yel); }
  if (p.name) pxText(g, p.name, x, y - 34, p.me ? P_.white : P_.teal, 7);
}
function drawNpc(n) {
  const x = SX(n.x, n.y), flip = n.fx < 0, y = SY(n.x, n.y, n.rz);
  const f = frameOf(n);
  switch (n.sp) {
    case 'chimp': {
      shadowAt(n.x, n.y, 5, 2, .3);
      blit(g, chimpSpr(n.fur, n.fb ? 'f' : 'b', f, n.mood === 'happy' ? 'happy' : n.act || ''), x, y - (n.moving ? Math.floor(G.t * 8) % 2 : 0), flip);
      if (n.bond >= 50) pxText(g, '♥', x, y - 32, P_.pink, 8);
      else if (n.want && Math.floor(G.t * 2) % 2) pxText(g, '?', x, y - 32, P_.yel, 8);
      break; }
    case 'gorilla': shadowAt(n.x, n.y, 9, 3, .35); blit(g, gorillaSpr(FUR.grey, n.fb ? 'f' : 'b', f, n.act || ''), x, y, flip); if (n.state === 'chase') pxText(g, '!', x, y - 46, P_.red, 10); break;
    case 'tortoise': shadowAt(n.x, n.y, 7, 2, .3); blit(g, tortoiseSpr(n.moving ? Math.floor(G.t * 3) % 2 : 0), x, y, n.fx > 0 ? false : true); break;
    case 'parrot': { const z = n.rz, sy = SY(n.x, n.y, z); shadowAt(n.x, n.y, 3, 1, .2); blit(g, parrotSpr(n.col, n.flying ? Math.floor(G.t * 10) % 2 : 0), x, sy, flip);
      if (n.say && n.sayT > 0) pxText(g, n.say, x, sy - 14, P_.white, 7); break; }
  }
}
function drawKeeper(k) {
  const flip = k.fx < 0, x = SX(k.x, k.y), y = SY(k.x, k.y, k.rz) - (k.moving ? Math.floor(G.t * 8) % 2 : 0);
  // конус зрения на земле
  if (k.state !== 'stunned') {
    const gz = groundAt(G.W, k.x, k.y), ang = Math.atan2(k.dy, k.dx), range = k.visRange || 8, half = .85;
    const pts = [[SX(k.x, k.y), SY(k.x, k.y, gz)]];
    for (let i = 0; i <= 5; i++) { const a = ang - half + (half * 2) * i / 5; pts.push([SX(k.x + Math.cos(a) * range, k.y + Math.sin(a) * range), SY(k.x + Math.cos(a) * range, k.y + Math.sin(a) * range, gz)]); }
    g.globalAlpha = k.state === 'chase' ? .2 : k.state === 'suspicious' ? .16 : .09; polyP(g, pts, k.state === 'chase' ? P_.red : P_.yel); g.globalAlpha = 1;
  }
  shadowAt(k.x, k.y, 6, 2, .32);
  blit(g, keeperSpr(k.fb ? 'f' : 'b', frameOf(k), k.state === 'chase' || k.state === 'suspicious' ? 'alert' : ''), x, y, flip);
  if (k.state === 'chase') pxText(g, '!', x, y - 42, P_.red, 11); else if (k.state === 'suspicious') pxText(g, '?', x, y - 42, P_.yel, 11); else if (k.state === 'stunned') pxText(g, '*', x, y - 42, P_.yel, 11);
}
function drawVisitor(v) {
  const x = SX(v.x, v.y), bob = Math.sin(G.t * 2 + v.ph) > .9 ? 1 : 0, cheer = v.cheer > 0;
  g.globalAlpha = v.a; oval(g, x, SY(v.x, v.y, 0), 4, 1, 'rgba(0,0,0,.4)');
  blit(g, visitorSpr(v, 'f', cheer ? 2 : 0), x, SY(v.x, v.y, 0) - (cheer ? Math.floor(G.t * 8 + v.ph) % 2 * 2 : bob), v.fl);
  g.globalAlpha = 1;
  if (v.emo) { g.globalAlpha = Math.min(1, v.emo.t); pxText(g, v.emo.s, x, SY(v.x, v.y, 0) - 30 - (2 - v.emo.t) * 5, P_.white, 8); g.globalAlpha = 1; }
}
const PICK_COL = { peanut: P_.d4, coin: P_.yel, banana: P_.yel, nut: P_.d3, stone: P_.r2, stick: P_.d2 };
function drawPickup(p) {
  const x = SX(p.x, p.y), gz = groundAt(G.W, p.x, p.y), y = SY(p.x, p.y, p.z), by = SY(p.x, p.y, gz);
  oval(g, x, by, 3, 1, 'rgba(0,0,0,.3)');
  const c = PICK_COL[p.type] || P_.white;
  if (p.type === 'banana') { lineP(g, x - 3, y - 2, x + 3, y - 3, c, 2); px(g, x + 3, y - 4, P_.d1); }
  else if (p.type === 'coin') { disc(g, x, y - 3, 2, c); px(g, x, y - 4, P_.white); if (Math.floor(G.t * 4 + p.x) % 4 === 0) px(g, x + 2, y - 6, P_.white); }
  else if (p.type === 'stick') lineP(g, x - 3, y - 1, x + 3, y - 3, c, 1);
  else { disc(g, x, y - 2, 2, c); px(g, x - 1, y - 3, P_.white); }
}
function drawProj(p) {
  const x = SX(p.x, p.y), y = SY(p.x, p.y, p.z), by = SY(p.x, p.y, groundAt(G.W, p.x, p.y));
  oval(g, x, by, 2, 1, 'rgba(0,0,0,.3)');
  if (p.kind === 'poop') { disc(g, x, y - 2, 2, P_.d1); px(g, x - 1, y - 3, P_.d3); }
  else if (p.kind === 'banana') { lineP(g, x - 3, y - 1, x + 3, y - 3, P_.yel, 2); }
  else if (p.kind === 'stone') { disc(g, x, y - 2, 2, P_.r2); px(g, x - 1, y - 3, P_.r4); }
  else if (p.kind === 'hook') { disc(g, x, y - 2, 1, P_.d3); }
}

// ── частицы ──
function emit(x, y, z, n, o = {}) {
  for (let i = 0; i < n; i++) G.parts.push({
    x, y, z, vx: rnd(-1, 1) * (o.spread ?? 1), vy: rnd(-1, 1) * (o.spread ?? 1), vz: rnd(o.v0 ?? 1, o.v1 ?? 4), g: o.g ?? 12,
    life: rnd(.6, 1) * (o.life ?? 1), t: 0, size: o.size ?? 1, kind: o.kind ?? 'dot', col: Array.isArray(o.col) ? o.col[i % o.col.length] : (o.col ?? '#fff')
  });
}
function updateParts(dt) {
  const L = G.parts;
  for (let i = L.length - 1; i >= 0; i--) {
    const q = L[i]; q.t += dt; if (q.t > q.life) { L.splice(i, 1); continue; }
    q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt; q.vz -= q.g * dt;
    const gz = groundAt(G.W, q.x, q.y); if (q.z < gz) { q.z = gz; q.vz *= -.25; q.vx *= .6; q.vy *= .6; }
  }
}
function drawParts() {
  for (const q of G.parts) {
    const x = SX(q.x, q.y), y = SY(q.x, q.y, q.z), k = q.t / q.life; g.globalAlpha = clamp(1.4 - k * 1.4, 0, 1);
    if (q.kind === 'star') { px(g, x, y, q.col); px(g, x - 1, y, q.col); px(g, x + 1, y, q.col); px(g, x, y - 1, q.col); px(g, x, y + 1, q.col); }
    else if (q.kind === 'dust') { rect(g, x, y, 2, 2, 'rgb(214,190,140)'); }
    else rect(g, x, y, q.size, q.size, q.col);
    g.globalAlpha = 1;
  }
}

// ── прицел и траектория ──
function drawAim() {
  const m = G.mouse; if (!m.in || G.state !== 'play') return;
  const tool = TOOLS[G.tool];
  if (tool && tool.throwable && G.me && !G.me.act && !G.mini) {
    const tgt = G.aim, sol = solveThrow(G.me, tgt, tool.range);
    if (sol) for (let t = .06; t < sol.T; t += .06) { const q = throwPos(G.me, sol, t); g.globalAlpha = .75; rect(g, SX(q.x, q.y), SY(q.x, q.y, q.z), 1, 1, P_.white); } g.globalAlpha = 1;
  }
  const x = Math.round(m.x), y = Math.round(m.y), c = (tool && tool.ok && !tool.ok()) ? P_.red : G.aim && G.aim.ent ? P_.yel : P_.white;
  g.fillStyle = P_.ink; for (const [dx, dy] of [[-4, 0], [4, 0], [0, -4], [0, 4]]) g.fillRect(x + dx - 1, y + dy - 1, 3, 3);
  g.fillStyle = c; for (const [dx, dy] of [[-4, 0], [-3, 0], [3, 0], [4, 0], [0, -4], [0, -3], [0, 3], [0, 4]]) g.fillRect(x + dx, y + dy, 1, 1);
  g.fillRect(x, y, 1, 1);
}
// стрелки-подсказки обучения (пиксельные)
function drawTutArrows() {
  if (!G.tut || typeof tutTargets !== 'function') return;
  for (const t of tutTargets()) {
    const x = SX(t.x, t.y), y = SY(t.x, t.y, t.z || 0) - (t.h || 30) - 6 + Math.round(Math.sin(G.t * 6) * 2);
    polyP(g, [[x, y + 6], [x - 5, y - 2], [x - 2, y - 2], [x - 2, y - 8], [x + 2, y - 8], [x + 2, y - 2], [x + 5, y - 2]], P_.yel);
    lineP(g, x, y + 7, x - 5, y - 1, P_.ink); lineP(g, x, y + 7, x + 5, y - 1, P_.ink);
  }
}
