'use strict';
// ───────── Пиксель-арт: палитра, примитивы, кэш спрайтов ─────────
// Всё рисуется на маленьком холсте 480×270 и растягивается без сглаживания.
const PAL = {
  ink: '#1b1726', night: '#2e2a4a',
  g0: '#2c6638', g1: '#3d8a44', g2: '#58a84c', g3: '#86cf66', g4: '#b8ec8a',
  d0: '#4e301c', d1: '#74492a', d2: '#966638', d3: '#bf8a50', d4: '#e0b472',
  r0: '#43435a', r1: '#62627a', r2: '#8486a0', r3: '#a8aac0', r4: '#d2d4e2',
  s0: '#c29c58', s1: '#dcbc78', s2: '#f0dca4',
  w0: '#2a5aa0', w1: '#3f84d0', w2: '#68b2f0', w3: '#b4e4ff',
  f0: '#3a2210', f1: '#68421f', f2: '#946238', f3: '#c79868',
  sk0: '#f8dcb4', sk1: '#dca878', sk2: '#a8744a',
  red: '#d24a34', red2: '#8a2a26', yel: '#ffd23a', yel2: '#d89a1c', org: '#f08a30',
  blue: '#3f6fd0', blue2: '#2a4a98', pur: '#9a6ae0', pur2: '#6a42b0', pink: '#ff8fb0',
  white: '#f6f2e2', grey: '#9a9aa8', blk: '#262330', teal: '#3fb8a0', lime: '#a8e040',
};
function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); return c; }

// ── примитивы (все координаты округляются до целых пикселей) ──
function px(g, x, y, c) { g.fillStyle = c; g.fillRect(x | 0, y | 0, 1, 1); }
function rect(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(x | 0, y | 0, w | 0, h | 0); }
function disc(g, cx, cy, r, c) {
  g.fillStyle = c; cx = Math.round(cx); cy = Math.round(cy);
  for (let dy = -r; dy <= r; dy++) { const dx = Math.floor(Math.sqrt(r * r + r * .6 - dy * dy) + .0); g.fillRect(cx - dx, cy + dy, dx * 2 + 1, 1); }
}
function oval(g, cx, cy, rx, ry, c) {
  g.fillStyle = c; cx = Math.round(cx); cy = Math.round(cy);
  for (let dy = -ry; dy <= ry; dy++) { const t = 1 - (dy * dy) / (ry * ry + .5), dx = Math.floor(rx * Math.sqrt(Math.max(0, t)) + .5); g.fillRect(cx - dx, cy + dy, dx * 2 + 1, 1); }
}
function lineP(g, x0, y0, x1, y1, c, th = 1) {
  g.fillStyle = c; x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let err = dx + dy;
  for (; ;) {
    g.fillRect(x0 - (th >> 1), y0 - (th >> 1), th, th);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
function polyP(g, pts, c) {   // заливка выпуклого/простого многоугольника по строкам
  g.fillStyle = c;
  let y0 = Infinity, y1 = -Infinity; for (const p of pts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  y0 = Math.round(y0); y1 = Math.round(y1);
  for (let y = y0; y <= y1; y++) {
    const xs = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if ((a[1] <= y + .5 && b[1] > y + .5) || (b[1] <= y + .5 && a[1] > y + .5)) xs.push(a[0] + (y + .5 - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
    }
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) g.fillRect(Math.round(xs[i]), y, Math.max(1, Math.round(xs[i + 1]) - Math.round(xs[i])), 1);
  }
}
function dither(g, x, y, w, h, c, density = .5, seed = 0) {   // «шахматная» россыпь пикселей
  g.fillStyle = c;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (hash2(x + i, y + j, seed) < density) g.fillRect(x + i, y + j, 1, 1);
}

// ── спрайты: рисуем один раз, потом просто копируем ──
const SPR = new Map();
// fn(g) рисует в канвас w×h. Якорь (ax,ay) — точка «ступней». outline — тёмная обводка в 1 пиксель.
function sprite(key, w, h, ax, ay, fn, outline = true, ink = PAL.ink) {
  let s = SPR.get(key); if (s) return s;
  const base = mkCanvas(w, h); fn(base.getContext('2d'));
  let c = base, pad = 0;
  if (outline) {
    pad = 1; c = mkCanvas(w + 2, h + 2); const g = c.getContext('2d');
    const sil = mkCanvas(w, h), sg = sil.getContext('2d'); sg.drawImage(base, 0, 0); sg.globalCompositeOperation = 'source-in'; sg.fillStyle = ink; sg.fillRect(0, 0, w, h);
    for (const [ox, oy] of [[0, 1], [2, 1], [1, 0], [1, 2]]) g.drawImage(sil, ox, oy);
    g.drawImage(base, 1, 1);
  }
  s = { c, ax: ax + pad, ay: ay + pad, w: c.width, h: c.height }; SPR.set(key, s); return s;
}
// рисуем спрайт в позиции (x,y) основного холста; flip — зеркально
function blit(g, s, x, y, flip = false, alpha = 1) {
  x = Math.round(x); y = Math.round(y);
  if (alpha < 1) g.globalAlpha = alpha;
  if (flip) { g.save(); g.translate(x, 0); g.scale(-1, 1); g.drawImage(s.c, -s.ax, y - s.ay); g.restore(); }
  else g.drawImage(s.c, x - s.ax, y - s.ay);
  if (alpha < 1) g.globalAlpha = 1;
}
// мини-шрифт 3×5 для цифр/букв над головами и в HUD-значках; обычный текст рисуем шрифтом браузера
function pxText(g, str, x, y, col = '#fff', size = 8, align = 'center') {
  g.font = `bold ${size}px "Courier New",monospace`; g.textAlign = align; g.textBaseline = 'alphabetic';
  g.fillStyle = PAL.ink; for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) g.fillText(str, Math.round(x) + dx, Math.round(y) + dy);
  g.fillStyle = col; g.fillText(str, Math.round(x), Math.round(y));
}
