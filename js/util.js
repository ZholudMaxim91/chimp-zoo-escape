'use strict';
// ───────── Общие утилиты ─────────
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a, b) => a + Math.random() * (b - a);            // игровая случайность (не из сида)
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Сид → число → генератор. Один и тот же сид всегда строит один и тот же мир.
function hashStr(s) {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; }
  h = Math.imul(h ^ h >>> 16, 2246822507); h = Math.imul(h ^ h >>> 13, 3266489909);
  return (h ^= h >>> 16) >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
// детерминированный шум по клетке
function hash2(x, y, s = 0) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 982451653);
  h = Math.imul(h ^ h >>> 13, 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, y, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, f = t => t * t * (3 - 2 * t);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  const top = a + (b - a) * f(xf), bot = c + (d - c) * f(xf);
  return top + (bot - top) * f(yf);
}
const SEED_WORDS = ['банан', 'джунгли', 'лиана', 'обезьяна', 'бамбук', 'скала', 'пальма', 'озеро', 'манго', 'кокос', 'тропик', 'зоопарк'];
function randomSeed() { return pick(SEED_WORDS) + '-' + Math.floor(rnd(100, 999)); }

// ───────── Звук (простые «чиптюн»-сигналы) ─────────
let AC = null;
function beep(freq, dur = .1, type = 'square', vol = .04, slide = 0) {
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type; o.frequency.value = freq;
    if (slide) o.frequency.linearRampToValueAtTime(freq + slide, AC.currentTime + dur);
    g.gain.value = vol; g.gain.linearRampToValueAtTime(0, AC.currentTime + dur);
    o.connect(g); g.connect(AC.destination); o.start(); o.stop(AC.currentTime + dur);
  } catch (e) { }
}
const sfx = {
  ok: () => { beep(520, .08); setTimeout(() => beep(780, .1), 80); },
  up: () => [440, 550, 660, 880].forEach((f, i) => setTimeout(() => beep(f, .12, 'triangle', .06), i * 90)),
  bad: () => beep(150, .25, 'sawtooth', .05, -60),
  tick: () => beep(900, .04, 'square', .02),
  eat: () => { beep(300, .06, 'triangle'); setTimeout(() => beep(380, .06, 'triangle'), 70); },
  throw: () => beep(250, .15, 'sawtooth', .035, 200),
  hit: () => { beep(120, .18, 'sawtooth', .05); },
  jump: () => beep(300, .12, 'square', .03, 300),
  hoot: () => { beep(260, .25, 'sawtooth', .05, 180); setTimeout(() => beep(420, .3, 'sawtooth', .05, -120), 220); },
  splash: () => beep(500, .1, 'triangle', .03, -300),
  win: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, .2, 'triangle', .07), i * 140)),
};
