'use strict';
// ───────── Спрайты: тайлы, объекты, существа (всё нарисовано кодом, пиксель-арт) ─────────
const P_ = PAL;

// ── тайлы ──
function topColor(kind, i, r, half, v) {
  const n = hash2(i, r, v * 7 + kind * 13), left = r < 8 && i - (16 - half) < 2 && r > 0, right = r >= 8 && i >= 16 + half - 2;
  switch (kind) {
    case K.GRASS: return left ? P_.g3 : right ? P_.g1 : n < .09 ? P_.g3 : n < .2 ? P_.g1 : n > .985 ? P_.g4 : P_.g2;
    case K.DIRT: return left ? P_.d4 : right ? P_.d2 : n < .12 ? P_.d4 : n < .26 ? P_.d2 : P_.d3;
    case K.ROCK: return left ? P_.r3 : right ? P_.r1 : n < .1 ? P_.r3 : n < .24 ? P_.r1 : n > .975 ? P_.r0 : P_.r2;
    case K.SAND: return left ? P_.s2 : right ? P_.s0 : n < .1 ? P_.s2 : n < .22 ? P_.s0 : P_.s1;
    case K.WATER: return left ? P_.w2 : right ? P_.w0 : n < .1 ? P_.w2 : n < .2 ? P_.w0 : P_.w1;
    case K.DECK: return left ? P_.d4 : right ? P_.d2 : ((i + 2 * r) % 8 === 0) ? P_.d2 : n < .08 ? P_.d4 : P_.d3;
    case K.COBBLE: return left ? P_.r4 : right ? P_.r1 : (((i >> 2) + (r >> 1)) % 2 === 0 ? P_.r3 : P_.r2);
  }
  return P_.g2;
}
function faceColor(kind, side, i, ry, v) {
  const n = hash2(i, ry, v + kind * 5 + side * 31);
  switch (kind) {
    case K.ROCK: { const base = side ? P_.r0 : P_.r1; if (ry % 8 === 0) return side ? P_.r1 : P_.r2; return n < .08 ? (side ? P_.r1 : P_.r2) : (hash2(i >> 1, ry >> 2, v) < .1 ? P_.ink : base); }
    case K.GRASS: case K.DIRT: { if (kind === K.GRASS && ry < 2) return ry === 0 ? P_.g2 : (n < .55 ? P_.g1 : (side ? P_.d1 : P_.d2)); const base = side ? P_.d1 : P_.d2; return n < .1 ? (side ? P_.d2 : P_.d3) : n < .2 ? P_.d0 : base; }
    case K.SAND: return n < .12 ? P_.s2 : (side ? '#a88444' : P_.s0);
    case K.DECK: { if (ry < 2) return side ? P_.d2 : P_.d3; if (i % 16 < 2 || (i % 16 >= 14)) return P_.d0; return (i % 4 === 0) ? P_.d0 : (side ? P_.d1 : P_.d2); }
    case K.COBBLE: return ((i >> 3) + (ry >> 2)) % 2 ? (side ? P_.r1 : P_.r2) : (side ? P_.r0 : P_.r1);
  }
  return P_.d1;
}
function tileSpr(kind, dl, dr, v) {
  const H = 16 + Math.max(dl, dr) * LH;
  return sprite(`t|${kind}|${dl}|${dr}|${v}`, 32, H, 16, 0, c => {
    for (let r = 0; r < 16; r++) { const half = r < 8 ? r * 2 + 2 : (15 - r) * 2 + 2; for (let i = 16 - half; i < 16 + half; i++) px(c, i, r, topColor(kind, i, r, half, v)); }
    if (kind !== K.WATER) {
      for (let i = 0; i < 16; i++) if (dl > 0) { const y0 = 8 + (i >> 1); for (let y = 0; y < dl * LH; y++) px(c, i, y0 + y, i === 15 ? P_.ink : faceColor(kind, 0, i, y, v)); }
      for (let i = 16; i < 32; i++) if (dr > 0) { const y0 = 16 - ((i - 16) >> 1); for (let y = 0; y < dr * LH; y++) px(c, i, y0 + y, faceColor(kind, 1, i, y, v)); }
    }
  }, false);
}
// землю за забором рисуем один раз целиком
let OUTER = null;
function buildOuter(W) {
  const M = 16, gy = W.gate.y;
  const minPX = (-M - (N + M)) * 16 - 20, maxPX = (N + M - -M) * 16 + 20, minPY = (-M - M) * 8 - 20, maxPY = (2 * N + 2 * M) * 8 + 40;
  const c = mkCanvas(maxPX - minPX, maxPY - minPY), cg = c.getContext('2d');
  for (let d = -2 * M; d <= 2 * (N + M); d++) for (let x = -M; x < N + M; x++) {
    const y = d - x; if (y < -M || y >= N + M) continue;
    let kind = K.GRASS;
    const walk = (y >= -4 && y < -1 && x >= -4) || (x >= -4 && x < -1 && y >= -4);
    const road = x >= N && Math.abs(y - gy) <= 1;
    if (walk || road) kind = K.COBBLE; else if (vnoise(x * .22, y * .22, W.seedNum) > .75) kind = K.DIRT;
    cg.drawImage(tileSpr(kind, 0, 0, hash2(x, y) * 4 | 0).c, (x - y) * 16 - minPX - 16, (x + y) * 8 - minPY);
  }
  OUTER = { c, minPX, minPY };
}

// ── заборы: сегмент вдоль X (вдоль Y — зеркально) ──
function fenceSpr(hf) {
  return sprite(`fence|${hf}`, 19, 8 + hf + 4, 1, hf + 2, c => {
    const base = x => hf + 2 + (x >> 1);
    lineP(c, 1, hf + 2 - hf + 1, 17, hf + 2 + 8 - hf + 1, P_.d3);                         // верхняя перекладина
    lineP(c, 1, hf + 2 - (hf >> 1), 17, hf + 10 - (hf >> 1), P_.d2);
    for (let x = 5; x < 17; x += 4) lineP(c, x, base(x) - hf + 2, x, base(x), P_.grey);   // прутья
    for (const x of [1, 17]) { lineP(c, x, base(x), x, base(x) - hf, P_.d1, 2); px(c, x, base(x) - hf - 1, P_.d4); px(c, x - 1, base(x) - hf, P_.d4); }
  }, true);
}

// ── объекты ──
function treeSpr(v) {
  return sprite(`tree|${v}`, 44, 56, 22, 54, c => {
    const o = (v % 3) - 1;
    rect(c, 19, 36, 6, 18, P_.d1); rect(c, 22, 36, 3, 18, P_.d0); px(c, 20, 40, P_.d2); px(c, 20, 46, P_.d2); oval(c, 22, 54, 7, 2, P_.d0);
    oval(c, 22, 24, 17, 14, P_.g1); oval(c, 12 + o, 29, 10, 9, P_.g1); oval(c, 32 - o, 29, 10, 9, P_.g1);
    oval(c, 24, 31, 11, 6, P_.g0); dither(c, 6, 20, 32, 20, P_.g0, .1, v);
    oval(c, 18, 18, 11, 8, P_.g2); oval(c, 14 + o, 14, 7, 5, P_.g3); oval(c, 26, 15, 6, 4, P_.g2);
    dither(c, 8, 8, 24, 18, P_.g4, .09, v + 3); dither(c, 6, 16, 32, 20, P_.g3, .1, v + 9);
  });
}
function palmSpr(v) {
  return sprite(`palm|${v}`, 48, 56, 24, 54, c => {
    for (let i = 0; i < 26; i++) { const x = 23 + Math.round(Math.sin(i * .15 + v) * 2); rect(c, x, 54 - i, 3, 1, P_.d2); px(c, x + 2, 54 - i, P_.d0); if (i % 4 === 0) px(c, x, 54 - i, P_.d3); }
    const tx = 24, ty = 28;
    for (let a = 0; a < 7; a++) {
      const ang = -Math.PI * .95 + a * Math.PI * .32 + (v % 3) * .05, len = 17 - (a === 3 ? 3 : 0);
      const ex = tx + Math.cos(ang) * len, ey = ty + Math.sin(ang) * len * .55 + (Math.abs(Math.cos(ang)) * 7);
      lineP(c, tx, ty, ex, ey, P_.g2, 3); lineP(c, tx, ty + 1, ex, ey + 1, P_.g1, 1); lineP(c, tx, ty - 1, ex, ey - 1, P_.g3, 1);
    }
    disc(c, tx, ty, 2, P_.g1);
  });
}
function bananasSpr(n) {   // гроздья поверх пальмы
  return sprite(`ban|${n}`, 48, 20, 24, 0, c => {
    const pos = [[16, 3], [25, 5], [21, 8]];
    for (let i = 0; i < n; i++) {
      const [x, y] = pos[i];
      for (let k = 0; k < 3; k++) { lineP(c, x + k * 2, y, x + k * 2 - 1, y + 6, P_.yel, 2); px(c, x + k * 2, y + 6, P_.yel2); }
      px(c, x + 2, y - 1, P_.g1);
    }
  });
}
function bushSpr(v, berries, sticks) {
  return sprite(`bush|${v}|${berries}|${sticks}`, 22, 16, 11, 14, c => {
    oval(c, 11, 9, 9, 5, P_.g1); oval(c, 7, 8, 5, 4, P_.g2); oval(c, 15, 8, 5, 4, P_.g2); oval(c, 10, 5, 5, 3, P_.g3); dither(c, 3, 3, 16, 10, P_.g0, .12, v);
    if (berries) for (let i = 0; i < 5; i++) px(c, 4 + hash2(i, v, 1) * 14 | 0, 5 + hash2(i, v, 2) * 6 | 0, P_.red);
    if (sticks) { lineP(c, 3, 13, 9, 9, P_.d2); lineP(c, 15, 13, 19, 8, P_.d3); }
  });
}
function termiteSpr(hp) {
  return sprite(`term|${hp}`, 22, 22, 11, 20, c => {
    polyP(c, [[11, 1], [19, 20], [3, 20]], P_.d2); polyP(c, [[11, 1], [19, 20], [11, 20]], P_.d1); polyP(c, [[11, 1], [3, 20], [8, 12]], P_.d3);
    oval(c, 11, 20, 9, 2, P_.d1); dither(c, 4, 6, 14, 14, P_.d0, .15, hp);
    for (const [x, y] of [[9, 12], [13, 15], [8, 17]]) { px(c, x, y, P_.ink); px(c, x + 1, y, P_.ink); }
    if (hp > 0) { px(c, 11, 3, P_.yel2); }
  });
}
function anvilSpr() {
  return sprite('anvil', 26, 18, 13, 16, c => {
    rect(c, 8, 9, 10, 7, P_.d2); rect(c, 14, 9, 4, 7, P_.d1); oval(c, 13, 16, 7, 2, P_.d0);
    polyP(c, [[3, 9], [23, 9], [21, 4], [5, 4]], P_.r2); rect(c, 5, 4, 16, 1, P_.r4); polyP(c, [[3, 9], [23, 9], [22, 11], [4, 11]], P_.r1);
    px(c, 10, 3, P_.d3); px(c, 11, 3, P_.d3);
  });
}
function nutpileSpr() { return sprite('nutpile', 18, 12, 9, 10, c => { for (const [x, y] of [[4, 6], [8, 7], [12, 6], [6, 4], [10, 4], [8, 2]]) { disc(c, x, y, 1, P_.d3); px(c, x, y - 1, P_.d4); } oval(c, 9, 10, 7, 1, P_.d0); }); }
function stonepileSpr() { return sprite('stones', 20, 14, 10, 12, c => { for (const [x, y, r] of [[6, 8, 3], [12, 9, 3], [9, 5, 3]]) { oval(c, x, y, r + 1, r, P_.r2); px(c, x - 1, y - 2, P_.r4); px(c, x, y - 2, P_.r3); oval(c, x + 1, y + 1, r - 1, 1, P_.r1); } }); }
function boxSpr(open) {
  return sprite(`box|${open}`, 22, 24, 11, 20, c => {
    polyP(c, [[11, 6], [20, 11], [11, 16], [2, 11]], P_.pur); polyP(c, [[2, 11], [11, 16], [11, 22], [2, 17]], P_.pur2); polyP(c, [[20, 11], [11, 16], [11, 22], [20, 17]], '#503088');
    lineP(c, 11, 6, 20, 11, '#caa8ff'); lineP(c, 11, 6, 2, 11, '#caa8ff');
    pxText(c, '?', 7, 21, P_.yel, 8, 'center');
  });
}
function swingSpr(f) {
  return sprite(`swing|${f}`, 44, 48, 22, 44, c => {
    lineP(c, 6, 44, 16, 6, P_.d1, 2); lineP(c, 26, 44, 16, 6, P_.d1, 2); lineP(c, 38, 40, 28, 4, P_.d2, 2); lineP(c, 16, 6, 28, 4, P_.d3, 3);
    const sw = f ? 3 : -3; lineP(c, 22, 5, 22 + sw, 24, P_.s1); oval(c, 22 + sw, 28, 6, 4, P_.blk); oval(c, 22 + sw, 28, 3, 2, P_.d3);
    px(c, 18 + sw, 26, P_.grey);
  });
}
function drumsSpr() {
  return sprite('drums', 28, 20, 14, 18, c => {
    for (const [x, col, col2] of [[8, P_.red, P_.red2], [19, P_.blue, P_.blue2]]) { rect(c, x - 5, 8, 11, 8, col); rect(c, x + 1, 8, 5, 8, col2); oval(c, x, 16, 5, 2, col2); oval(c, x, 8, 5, 3, P_.white); oval(c, x, 8, 3, 1, P_.d3); }
    lineP(c, 10, 2, 14, 6, P_.d3); lineP(c, 18, 2, 14, 6, P_.d3);
  });
}
function gongSpr(f) {
  return sprite(`gong|${f}`, 30, 38, 15, 36, c => {
    lineP(c, 3, 36, 4, 6, P_.d1, 2); lineP(c, 27, 36, 26, 6, P_.d1, 2); lineP(c, 3, 6, 27, 6, P_.d2, 3);
    lineP(c, 15, 7, 15, 12, P_.s1); const off = f ? 1 : 0; disc(c, 15 + off, 20, 8, P_.yel2); disc(c, 15 + off, 20, 6, P_.yel); disc(c, 15 + off, 20, 2, P_.yel2); px(c, 12 + off, 16, P_.white);
  });
}
function frameSpr() {
  return sprite('cframe', 40, 44, 20, 40, c => {
    for (const [x, y] of [[6, 30], [34, 30], [20, 40]]) lineP(c, x, y, x, y - 28, P_.d1, 3);
    lineP(c, 6, 2, 34, 2, P_.d3, 3); lineP(c, 6, 14, 34, 14, P_.d2, 2); lineP(c, 6, 2, 20, 12, P_.d2, 2); lineP(c, 34, 2, 20, 12, P_.d2, 2);
    for (let i = 0; i < 4; i++) lineP(c, 8 + i * 8, 14, 8 + i * 8, 30, P_.s1);
    lineP(c, 6, 30, 34, 30, P_.d2, 2);
  });
}
function chestSpr(open) {
  return sprite(`chest|${open}`, 22, 20, 11, 18, c => {
    rect(c, 3, 9, 16, 8, P_.d2); rect(c, 3, 9, 16, 1, P_.d3); rect(c, 12, 9, 7, 8, P_.d1); rect(c, 3, 12, 16, 1, P_.yel2);
    if (open) { oval(c, 11, 7, 7, 3, P_.yel); px(c, 8, 6, P_.white); px(c, 13, 5, P_.white); polyP(c, [[3, 9], [19, 9], [17, 3], [5, 3]], P_.d1); }
    else { polyP(c, [[3, 9], [19, 9], [17, 4], [5, 4]], P_.d3); lineP(c, 5, 4, 17, 4, P_.d4); px(c, 11, 10, P_.yel); px(c, 11, 11, P_.yel2); }
    oval(c, 11, 17, 8, 1, P_.d0);
  });
}
function ladderSpr(dz) {
  const hgt = dz * LH + 6;
  return sprite(`ladder|${dz}`, 12, hgt + 2, 6, hgt, c => {
    lineP(c, 2, 0, 2, hgt - 1, P_.d2, 2); lineP(c, 9, 0, 9, hgt - 1, P_.d1, 2);
    for (let y = 3; y < hgt; y += 4) rect(c, 2, y, 8, 2, P_.d3);
  });
}
function digSpr(glow) {
  return sprite(`dig|${glow}`, 16, 10, 8, 8, c => { oval(c, 8, 6, 6, 3, P_.d1); dither(c, 3, 3, 10, 6, P_.d3, .3, 4); if (glow) { px(c, 8, 2, P_.yel); px(c, 7, 3, P_.white); px(c, 9, 3, P_.white); px(c, 8, 4, P_.yel); } }, false);
}
function hutSpr() {
  const oy = 44;
  return sprite('hut', 100, oy + 56, 50, oy + 24, c => {
    const wh = 20, T = [48, oy], R = [96, oy + 24], B = [48, oy + 48], L = [0, oy + 24];
    polyP(c, [L, B, [B[0], B[1] - wh], [L[0], L[1] - wh]], P_.d3); polyP(c, [B, R, [R[0], R[1] - wh], [B[0], B[1] - wh]], P_.d2);
    for (let i = 0; i < 48; i += 6) { lineP(c, i, oy + 24 + (i >> 1) - wh, i, oy + 24 + (i >> 1), P_.d2); lineP(c, 48 + i, oy + 48 - (i >> 1) - wh, 48 + i, oy + 48 - (i >> 1), P_.d1); }
    rect(c, 20, oy + 36 - 12 + 1, 8, 14, P_.d0); rect(c, 21, oy + 26, 6, 12, P_.d1); px(c, 25, oy + 33, P_.yel);                       // дверь
    rect(c, 60, oy + 24, 10, 8, P_.w2); rect(c, 60, oy + 24, 10, 1, P_.d0); rect(c, 60, oy + 31, 10, 1, P_.d0); rect(c, 64, oy + 24, 1, 8, P_.d0);
    const ap = [48, oy - 28], eL = [-4, oy + 24 - wh + 2], eB = [48, oy + 48 - wh + 6], eR = [100, oy + 24 - wh + 2];
    polyP(c, [eL, eB, ap], P_.red); polyP(c, [eB, eR, ap], P_.red2);
    lineP(c, eL[0], eL[1], ap[0], ap[1], '#ff7a60'); lineP(c, eL[0], eL[1], eB[0], eB[1], P_.red2);
    for (let i = 0; i < 6; i++) { lineP(c, 6 + i * 7, eL[1] + 3 - i * 2, 44, eB[1] - i * 5, '#b03a2c'); }
    rect(c, 70, oy - 30, 6, 12, P_.r2); rect(c, 70, oy - 30, 6, 2, P_.r4);
  });
}
function fenceGatePost() { return sprite('gpost', 10, 40, 5, 38, c => { lineP(c, 4, 38, 4, 2, P_.yel2, 4); rect(c, 2, 0, 6, 3, P_.yel); px(c, 3, 8, P_.yel); }); }
function bannerSpr() {
  return sprite('banner', 130, 52, 65, 50, c => {
    lineP(c, 3, 50, 3, 6, P_.d1, 3); lineP(c, 126, 50, 126, 6, P_.d1, 3);
    rect(c, 3, 4, 124, 20, P_.red); rect(c, 3, 4, 124, 2, '#ff7a60'); rect(c, 3, 22, 124, 2, P_.red2);
    for (let i = 0; i < 124; i += 10) rect(c, 3 + i, 6, 5, 16, 'rgba(255,255,255,.12)');
    pxText(c, 'ШОУ', 65, 19, P_.yel, 12, 'center');
  }, false);
}
// декор снаружи
function lampSpr() { return sprite('lamp', 12, 40, 6, 38, c => { lineP(c, 6, 38, 6, 8, P_.blk, 2); disc(c, 6, 6, 3, P_.yel); px(c, 5, 5, P_.white); rect(c, 3, 3, 7, 1, P_.blk); }); }
function benchSpr() { return sprite('bench', 30, 18, 15, 16, c => { rect(c, 3, 8, 24, 3, P_.d3); rect(c, 3, 11, 24, 1, P_.d1); rect(c, 3, 3, 24, 3, P_.d2); for (const x of [5, 24]) rect(c, x, 11, 2, 5, P_.blk); }); }
function kioskSpr() { return sprite('kiosk', 50, 50, 25, 46, c => { rect(c, 8, 20, 34, 24, P_.white); rect(c, 28, 20, 14, 24, '#d8d0b8'); rect(c, 12, 26, 18, 10, P_.w2); for (let i = 0; i < 6; i++) rect(c, 5 + i * 7, 12, 7, 9, i % 2 ? P_.white : P_.red); rect(c, 5, 20, 42, 1, P_.red2); pxText(c, 'ICE', 22, 44, P_.red, 7, 'center'); }); }
function signSpr() { return sprite('sign', 40, 40, 20, 38, c => { lineP(c, 8, 38, 8, 16, P_.d1, 3); lineP(c, 32, 38, 32, 16, P_.d1, 3); rect(c, 2, 4, 36, 18, P_.d4); rect(c, 2, 4, 36, 1, P_.white); rect(c, 2, 21, 36, 1, P_.d2); pxText(c, 'ШИМПАНЗЕ', 20, 17, P_.d0, 7, 'center'); }); }

// ── существа ──
const FUR = {
  brown: { id: 'brown', d: P_.f0, m: P_.f1, l: P_.f3, s: P_.sk1, face: P_.sk0 },
  dark: { id: 'dark', d: '#201008', m: '#4e3018', l: '#8a6038', s: P_.sk1, face: P_.sk0 },
  ginger: { id: 'ginger', d: '#6a2a10', m: '#b4552a', l: '#e09060', s: P_.sk1, face: P_.sk0 },
  grey: { id: 'grey', d: '#262630', m: '#42425a', l: '#6e6e88', s: '#505068', face: '#2e2e3c' },
};
function chimpSpr(F, view, frame, act, big = false) {
  return sprite(`chimp|${F.id}|${view}|${frame}|${act}`, 30, 30, 15, 28, c => {
    const front = view === 'f', cr = act === 'crouch' ? 3 : 0;
    const lf = frame === 1 ? 1 : 0, rf = frame === 3 ? 1 : 0;
    rect(c, 12, 23 - lf + cr * 0, 3, 3 - cr + 0, F.d); rect(c, 16, 23 - rf, 3, 3 - cr, F.d);
    rect(c, 11, 26 - lf, 4, 1, F.s); rect(c, 16, 26 - rf, 4, 1, F.s);
    // руки сзади
    const up = act === 'up' || act === 'climb', sw = frame === 1 ? -1 : frame === 3 ? 1 : 0;
    const body = (dy) => {
      oval(c, 15, 18 + dy, 6, 6, F.m);
      if (front) { oval(c, 15, 19 + dy, 3, 4, F.l); dither(c, 18, 14 + dy, 4, 9, F.d, .3, 5); } else { lineP(c, 15, 13 + dy, 15, 22 + dy, F.d); dither(c, 10, 13 + dy, 4, 9, F.l, .25, 2); }
    };
    if (act !== 'throw') lineP(c, 9, 14 + cr, 7 + (up ? -1 : 0), up ? 6 : 21 + sw, F.m, 3);
    body(cr);
    if (act === 'throw') lineP(c, 9, 14 + cr, 6, 21, F.m, 3);
    if (act === 'throw') lineP(c, 21, 14 + cr, 26, 8, F.m, 3); else if (act === 'eat') lineP(c, 21, 14 + cr, 18, 10 + cr, F.m, 3); else lineP(c, 21, 14 + cr, 23 + (up ? 1 : 0), up ? 6 : 21 - sw, F.m, 3);
    for (const [hx, hy] of act === 'throw' ? [[6, 22], [26, 7]] : act === 'eat' ? [[6, 22], [18, 9 + cr]] : up ? [[6, 5], [24, 5]] : [[7, 22 + sw], [23, 22 - sw]]) disc(c, hx, hy, 1, F.s);
    // голова
    const hy = 9 + cr;
    disc(c, 9, hy, 2, F.m); disc(c, 21, hy, 2, F.m); px(c, 9, hy, F.s); px(c, 21, hy, F.s);
    disc(c, 15, hy, 6, F.m);
    if (front) {
      oval(c, 15, hy + 1, 4, 4, F.face); px(c, 13, hy, P_.blk); px(c, 17, hy, P_.blk); px(c, 13, hy - 1, F.d); px(c, 17, hy - 1, F.d);
      px(c, 14, hy + 2, F.s); px(c, 16, hy + 2, F.s);
      if (act === 'happy' || act === 'eat' || act === 'up') { rect(c, 13, hy + 3, 5, 1, P_.red2); } else rect(c, 14, hy + 3, 3, 1, F.s);
    } else { dither(c, 11, hy - 4, 8, 4, F.d, .3, 7); }
    px(c, 15, hy - 6, F.d); px(c, 14, hy - 5, F.d); px(c, 16, hy - 5, F.d);
    if (act === 'eat') { lineP(c, 19, hy + 3, 21, hy + 1, P_.yel, 2); }
  });
}
function gorillaSpr(F, view, frame, act) {
  return sprite(`gor|${view}|${frame}|${act}`, 46, 46, 23, 44, c => {
    const front = view === 'f', lf = frame === 1 ? 1 : 0, rf = frame === 3 ? 1 : 0;
    rect(c, 13, 36 - lf, 7, 7, F.d); rect(c, 25, 36 - rf, 7, 7, F.d);
    oval(c, 23, 27, 13, 11, F.m);
    if (front) { oval(c, 23, 28, 8, 7, F.d); dither(c, 15, 22, 16, 12, F.l, .12, 3); } else { oval(c, 23, 25, 9, 7, P_.grey); oval(c, 23, 24, 6, 4, '#c4c4d8'); dither(c, 14, 18, 18, 14, F.d, .15, 4); }
    const beat = act === 'beat';
    lineP(c, 10, 19, beat ? 18 : 6, beat ? 28 : 38, F.m, 5); lineP(c, 36, 19, beat ? 28 : 40, beat ? 28 : 38, F.m, 5);
    disc(c, beat ? 18 : 6, beat ? 28 : 39, 3, F.d); disc(c, beat ? 28 : 40, beat ? 28 : 39, 3, F.d);
    oval(c, 23, 13, 6, 6, F.m); oval(c, 23, 8, 5, 3, F.d);
    if (front) { oval(c, 23, 14, 4, 4, F.face); px(c, 21, 13, P_.white); px(c, 25, 13, P_.white); rect(c, 20, 11, 7, 1, F.d); rect(c, 21, 16, 5, 1, '#6a3a3a'); if (act === 'angry') rect(c, 21, 16, 5, 2, P_.red2); }
  });
}
function tortoiseSpr(frame) {
  return sprite(`tort|${frame}`, 30, 18, 15, 16, c => {
    rect(c, 6, 12 + (frame ? 0 : 1), 3, 3, '#6a8a3a'); rect(c, 18, 12 + (frame ? 1 : 0), 3, 3, '#6a8a3a');
    disc(c, 25, 9, 3, '#8aaa4a'); px(c, 26, 8, P_.blk); rect(c, 21, 10, 4, 3, '#6a8a3a');
    oval(c, 13, 9, 10, 7, '#4a7a30'); oval(c, 13, 8, 8, 5, '#5a9a3a');
    for (const [x, y] of [[13, 6], [9, 8], [17, 8], [13, 10]]) { disc(c, x, y, 2, '#3a6a2a'); px(c, x, y - 1, '#7ac04a'); }
    rect(c, 3, 14, 20, 1, P_.d2);
  });
}
function parrotSpr(col, frame) {
  return sprite(`par|${col}|${frame}`, 22, 18, 11, 16, c => {
    oval(c, 11, 8, 3, 5, col); lineP(c, 11, 12, 9, 17, P_.blue, 2); lineP(c, 12, 12, 13, 17, P_.yel, 1);
    disc(c, 11, 4, 2, col); px(c, 13, 4, P_.org); px(c, 13, 5, P_.org); px(c, 11, 3, P_.white); px(c, 12, 3, P_.blk);
    if (frame) { lineP(c, 8, 6, 2, 1, P_.blue, 2); lineP(c, 14, 6, 20, 1, P_.blue, 2); } else { lineP(c, 8, 7, 3, 12, P_.blue, 2); lineP(c, 14, 7, 19, 12, P_.blue, 2); }
  });
}
function keeperSpr(view, frame, act) {
  return sprite(`keep|${view}|${frame}|${act}`, 24, 38, 12, 36, c => {
    const front = view === 'f', lf = frame === 1 ? 1 : 0, rf = frame === 3 ? 1 : 0;
    rect(c, 7, 26 - lf * 0, 4, 8 - lf, P_.blue2); rect(c, 13, 26, 4, 8 - rf, P_.blue2); rect(c, 7, 34 - lf, 4, 2, '#3a2410'); rect(c, 13, 34 - rf, 4, 2, '#3a2410');
    rect(c, 6, 13, 12, 13, '#3f9a4f'); rect(c, 13, 13, 5, 13, '#2d7a3a'); rect(c, 6, 24, 12, 2, P_.d0); if (front) { px(c, 14, 25, P_.yel); px(c, 15, 26, P_.yel); }
    const up = act === 'alert';
    rect(c, 3, up ? 6 : 14, 3, up ? 8 : 10, '#3f9a4f'); rect(c, 18, up ? 6 : 14, 3, up ? 8 : 10, '#2d7a3a'); px(c, 4, up ? 5 : 24, P_.sk0); px(c, 19, up ? 5 : 24, P_.sk0);
    disc(c, 12, 8, 4, P_.sk0); if (front) { px(c, 10, 8, P_.blk); px(c, 14, 8, P_.blk); rect(c, 11, 11, 3, 1, P_.sk2); } else disc(c, 12, 8, 4, '#5a3a22');
    rect(c, 7, 3, 11, 3, '#2d7a3a'); rect(c, 7, 2, 11, 1, '#3f9a4f'); if (front) rect(c, 6, 6, 13, 1, '#1d5a2a');
  });
}
function visitorSpr(v, view, frame) {
  const kid = v.kid ? 1 : 0;
  return sprite(`vis|${v.col}|${v.pants}|${v.hair}|${v.hat}|${v.skin}|${kid}|${v.splat ? 1 : 0}|${view}|${frame}`, 18, 28, 9, 26, c => {
    const front = view === 'f', y0 = kid ? 5 : 0;
    rect(c, 5, 18 + y0, 3, 7 - y0, v.pants); rect(c, 10, 18 + y0, 3, 7 - y0, v.pants); rect(c, 5, 25, 3, 1, P_.white); rect(c, 10, 25, 3, 1, P_.white);
    rect(c, 4, 9 + y0, 10, 10, v.col); rect(c, 10, 9 + y0, 4, 10, 'rgba(0,0,0,.22)');
    const wave = frame === 2; rect(c, 2, wave ? 3 + y0 : 10 + y0, 2, wave ? 7 : 7, v.col); rect(c, 14, 10 + y0, 2, 7, v.col); px(c, 2, wave ? 2 + y0 : 17 + y0, v.skin); px(c, 14, 17 + y0, v.skin);
    disc(c, 9, 5 + y0, 3, v.skin); if (front) { px(c, 8, 5 + y0, P_.blk); px(c, 11, 5 + y0, P_.blk); px(c, 9, 7 + y0, P_.sk2); }
    rect(c, 6, 2 + y0, 7, 2, v.hair); if (!front) rect(c, 6, 2 + y0, 7, 5, v.hair);
    if (v.hat === 0) { rect(c, 5, 1 + y0, 9, 2, P_.red); rect(c, 12, 2 + y0, 4, 1, P_.red2); }
    if (v.hat === 1) { rect(c, 3, 2 + y0, 13, 1, P_.d4); rect(c, 6, 0 + y0, 7, 3, P_.d4); }
    if (v.splat) { rect(c, 6, 11 + y0, 3, 3, P_.d0); px(c, 9, 9 + y0, P_.d0); px(c, 10, 14 + y0, P_.d1); }
  });
}
