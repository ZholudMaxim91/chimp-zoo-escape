'use strict';
// ───────── Отрисовка: настоящее 3D в низком разрешении (480×270) → пиксельный вид ─────────
const P_ = PAL;
const VW = 480, VH = 270, PPU = 42;               // пикселей на клетку по горизонтали (масштаб)
const glc = $('gl'), cv = $('c'), g = cv.getContext('2d');
cv.width = VW; cv.height = VH; g.imageSmoothingEnabled = false;
const renderer = new T3.WebGLRenderer({ canvas: glc, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1); renderer.setSize(VW, VH, false);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = T3.PCFShadowMap;
function fitCanvas() {
  const s = Math.min(innerWidth / VW, innerHeight / VH), w = Math.floor(VW * s) + 'px', h = Math.floor(VH * s) + 'px';
  for (const c of [glc, cv]) { c.style.width = w; c.style.height = h; }
  const v = $('view'); v.style.width = w; v.style.height = h;
}
addEventListener('resize', fitCanvas); fitCanvas();

// ── сцена, камера (изометрия 2:1), свет ──
const scene = new T3.Scene(); scene.background = new T3.Color('#2f5a30');
const camera = new T3.OrthographicCamera(-VW / 2 / (PPU / Math.SQRT2), VW / 2 / (PPU / Math.SQRT2), VH / 2 / (PPU / Math.SQRT2), -VH / 2 / (PPU / Math.SQRT2), .1, 160);
const CAM_OFF = new T3.Vector3(1, .8165, 1).normalize().multiplyScalar(70);
const hemi = new T3.HemisphereLight('#d8ecff', '#6a7a54', .78); scene.add(hemi);
const sun = new T3.DirectionalLight('#fff0d4', .95); sun.castShadow = true;
sun.shadow.mapSize.set(1536, 1536); Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 80 }); sun.shadow.bias = -.0012; sun.shadow.normalBias = .02;
scene.add(sun); scene.add(sun.target);
const CAM = { x: 0, y: 0, z: 0 };
function updateCam(dt, snap) {
  const m = G.me; if (!m) return;
  const tx = m.x, ty = m.y, tz = visY(m);
  if (snap) { CAM.x = tx; CAM.y = ty; CAM.z = tz; } else { const k = 1 - Math.exp(-dt * 7); CAM.x += (tx - CAM.x) * k; CAM.y += (ty - CAM.y) * k; CAM.z += (tz - CAM.z) * k; }
  // привязка к пиксельной сетке, чтобы картинка не «дрожала»
  const px = 1 / (PPU / Math.SQRT2);
  const tgt = new T3.Vector3(CAM.x, CAM.z * LV * .8, CAM.y);
  camera.position.copy(tgt).add(CAM_OFF); camera.lookAt(tgt); camera.updateMatrixWorld();
  const r = new T3.Vector3(), u = new T3.Vector3(), f = new T3.Vector3(); camera.matrixWorld.extractBasis(r, u, f);
  const sr = camera.position.dot(r), su = camera.position.dot(u);
  camera.position.addScaledVector(r, Math.round(sr / px) * px - sr).addScaledVector(u, Math.round(su / px) * px - su); camera.updateMatrixWorld();
  sun.position.set(tgt.x - 14, tgt.y + 22, tgt.z - 4); sun.target.position.copy(tgt); sun.target.updateMatrixWorld();
}
const _v3 = new T3.Vector3();
function project(x, zl, y) { _v3.set(x, zl * LV, y).project(camera); return { x: (_v3.x + 1) / 2 * VW, y: (1 - _v3.y) / 2 * VH }; }
const SX = (x, y) => Math.round(project(x, 0, y).x);
const SY = (x, y, z) => Math.round(project(x, z, y).y);

// ── обводка (пиксель-арт): рендер в текстуру + проход с поиском краёв по глубине ──
const rt = new T3.WebGLRenderTarget(VW, VH, { minFilter: T3.NearestFilter, magFilter: T3.NearestFilter });
rt.depthTexture = new T3.DepthTexture(VW, VH); rt.depthTexture.type = T3.UnsignedIntType;
const postScene = new T3.Scene(), postCam = new T3.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const postMat = new T3.ShaderMaterial({
  uniforms: { tC: { value: rt.texture }, tD: { value: rt.depthTexture }, px: { value: new T3.Vector2(1 / VW, 1 / VH) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }',
  fragmentShader: `uniform sampler2D tC; uniform sampler2D tD; uniform vec2 px; varying vec2 vUv;
    void main(){ vec4 c=texture2D(tC,vUv); float d=texture2D(tD,vUv).r;
      float m=max(max(texture2D(tD,vUv+vec2(px.x,0.)).r,texture2D(tD,vUv-vec2(px.x,0.)).r),max(texture2D(tD,vUv+vec2(0.,px.y)).r,texture2D(tD,vUv-vec2(0.,px.y)).r));
      float e=step(0.0022,m-d);
      vec3 col=mix(c.rgb, c.rgb*0.32+vec3(0.03,0.02,0.05), e*0.85);
      gl_FragColor=vec4(col,1.); }`,
  depthTest: false, depthWrite: false,
});
postScene.add(new T3.Mesh(new T3.PlaneGeometry(2, 2), postMat));

// ───────── Рельеф ─────────
const OUT = 14;          // ширина полосы «за забором»
let TERR = null;         // {corner: Float32Array(N*N*4)} — высоты углов клеток (в ярусах), для плавной земли
const effH = (W, x, y) => { if (x < 0 || y < 0 || x >= N || y >= N) return 0; const i = y * N + x; return W.kind[i] === K.WATER ? -1.15 : W.h[i]; };
function outerKind(W, x, y) {
  const gy = W.gate.y;
  if ((y >= -4 && y < -1 && x >= -4) || (x >= -4 && x < -1 && y >= -4) || (x >= N && Math.abs(y - gy) <= 1)) return K.COBBLE;
  return vnoise(x * .22, y * .22, W.seedNum) > .75 ? K.DIRT : K.GRASS;
}
const kindAt = (W, x, y) => (x >= 0 && y >= 0 && x < N && y < N) ? W.kind[y * N + x] : outerKind(W, x, y);
function cornerOf(W, cx, cy, eh) {   // среднее высот клеток у угла, если они «рядом» по высоте (иначе — обрыв)
  let s = 0, n = 0;
  for (const [dx, dy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) { const h = effH(W, cx + dx, cy + dy); if (Math.abs(h - eh) <= 1.2) { s += h; n++; } }
  return n ? s / n : eh;
}
// плавная высота земли (в ярусах) — для отрисовки и прицела
function groundSmooth(x, y) {
  const W = G.W; if (!TERR) return groundAt(W, x, y);
  const tx = Math.floor(x), ty = Math.floor(y); if (tx < 0 || ty < 0 || tx >= N || ty >= N) return 0;
  const i = (ty * N + tx) * 4, c = TERR.corner, fx = x - tx, fy = y - ty;
  return (c[i] * (1 - fx) + c[i + 1] * fx) * (1 - fy) + (c[i + 3] * (1 - fx) + c[i + 2] * fx) * fy;
}
const C_ = (h) => { const c = new T3.Color(h); return [c.r, c.g, c.b]; };
const PALK = {
  g0: C_('#2e5e2a'), g1: C_('#4a8236'), g2: C_('#6ea648'), g3: C_('#98bf5e'), dry: C_('#b0b058'),
  d0: C_('#6e5032'), d1: C_('#97704a'), d2: C_('#c09868'),
  r0: C_('#7a7a88'), r1: C_('#9a9cac'), r2: C_('#c2c4d2'), moss: C_('#5e7a44'),
  s0: C_('#c2a26a'), s1: C_('#e6d2a0'), bed: C_('#7a8a64'),
  w0: C_('#7a5232'), w1: C_('#a87a4a'), w2: C_('#c89a62'),
  c0: C_('#8a8478'), c1: C_('#bdb6a6'), c2: C_('#d8d0bc'),
};
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
function kindColor(k, wx, wy, lv, seed) {
  const n1 = vnoise(wx * .45, wy * .45, seed), n2 = vnoise(wx * 1.7, wy * 1.7, seed + 3), n3 = vnoise(wx * 5.1, wy * 5.1, seed + 7);
  switch (k) {
    case K.GRASS: { let c = mix3(PALK.g1, PALK.g2, n1); c = mix3(c, PALK.g3, Math.max(0, n2 - .55) * 1.6); c = mix3(c, PALK.dry, Math.max(0, vnoise(wx * .2, wy * .2, seed + 11) - .62) * 1.8); return mix3(c, PALK.g0, Math.max(0, .35 - n3) * .9); }
    case K.DIRT: { let c = mix3(PALK.d0, PALK.d1, n1); return mix3(c, PALK.d2, Math.max(0, n3 - .5) * 1.2); }
    case K.ROCK: { let c = mix3(PALK.r0, PALK.r1, n1 * .7 + n3 * .3); c = mix3(c, PALK.r2, Math.max(0, n2 - .55) * 1.4); return mix3(c, PALK.moss, Math.max(0, vnoise(wx * .6, wy * .6, seed + 5) - .6) * 1.5); }
    case K.SAND: return mix3(PALK.s0, PALK.s1, n1 * .6 + n3 * .4);
    case K.WATER: return mix3(PALK.bed, PALK.s0, n2);
    case K.DECK: { const pl = Math.floor(wy * 4), ln = (wy * 4) % 1; let c = mix3(PALK.w1, PALK.w2, hash2(pl, Math.floor(wx * 1.3), 9)); if (ln < .12) c = PALK.w0; return mix3(c, PALK.w0, n3 * .25); }
    case K.COBBLE: { const ax = wx * 3 + (Math.floor(wy * 3) % 2) * .5, gx = ax % 1, gyy = (wy * 3) % 1; let c = mix3(PALK.c1, PALK.c2, hash2(Math.floor(ax), Math.floor(wy * 3), 4)); if (gx < .1 || gyy < .1) c = PALK.c0; return c; }
  }
  return PALK.g2;
}
// смешивание соседних типов земли с «рваной» границей
function blendColor(W, wx, wy, lv, seed) {
  const wxp = wx + (vnoise(wx * .9, wy * .9, seed + 21) - .5) * .9, wyp = wy + (vnoise(wx * .9 + 7, wy * .9, seed + 22) - .5) * .9;
  const fx = wxp - .5, fy = wyp - .5, x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0;
  let acc = [0, 0, 0], ws = 0;
  for (const [dx, dy, w] of [[0, 0, (1 - ax) * (1 - ay)], [1, 0, ax * (1 - ay)], [0, 1, (1 - ax) * ay], [1, 1, ax * ay]]) {
    const tx = x0 + dx, ty = y0 + dy; if (Math.abs(effH(W, tx, ty) - lv) > .7 && (tx >= 0 && ty >= 0 && tx < N && ty < N)) continue;
    const c = kindColor(kindAt(W, tx, ty), wx, wy, lv, seed); acc[0] += c[0] * w; acc[1] += c[1] * w; acc[2] += c[2] * w; ws += w;
  }
  if (!ws) return kindColor(kindAt(W, Math.floor(wx), Math.floor(wy)), wx, wy, lv, seed);
  return [acc[0] / ws, acc[1] / ws, acc[2] / ws];
}
function micro(k, wx, wy, seed) { if (k === K.DECK || k === K.COBBLE) return 0; return (vnoise(wx * 2.3, wy * 2.3, seed + 31) - .5) * (k === K.ROCK ? .09 : .05); }

function buildTerrain(W) {
  const seed = W.seedNum % 1000, corner = new Float32Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const eh = effH(W, x, y), i = (y * N + x) * 4;
    corner[i] = cornerOf(W, x, y, eh); corner[i + 1] = cornerOf(W, x + 1, y, eh); corner[i + 2] = cornerOf(W, x + 1, y + 1, eh); corner[i + 3] = cornerOf(W, x, y + 1, eh);
  }
  TERR = { corner };
  const P = [], Nn = [], Cc = [];
  const up = new T3.Vector3(), a = new T3.Vector3(), b = new T3.Vector3(), c = new T3.Vector3(), nrm = new T3.Vector3();
  const pushTri = (A, B, Cv, cA, cB, cC, nA, nB, nC, want) => {
    a.set(...A); b.set(...B); c.set(...Cv); nrm.subVectors(b, a).cross(up.subVectors(c, a));
    if (nrm.dot(want) < 0) { [B, Cv] = [Cv, B]; [cB, cC] = [cC, cB]; [nB, nC] = [nC, nB]; }
    P.push(...A, ...B, ...Cv); Cc.push(...cA, ...cB, ...cC); Nn.push(...nA, ...nB, ...nC);
  };
  const UP = new T3.Vector3(0, 1, 0);
  // верх клеток
  for (let ty = -OUT; ty < N + OUT; ty++) for (let tx = -OUT; tx < N + OUT; tx++) {
    const inside = tx >= 0 && ty >= 0 && tx < N && ty < N, k = kindAt(W, tx, ty);
    const S = !inside ? 1 : (k === K.DECK || k === K.COBBLE) ? 6 : 4;
    const ci = inside ? (ty * N + tx) * 4 : -1;
    const hAt = (fx, fy) => inside ? ((corner[ci] * (1 - fx) + corner[ci + 1] * fx) * (1 - fy) + (corner[ci + 3] * (1 - fx) + corner[ci + 2] * fx) * fy) : 0;
    const lvl = inside ? effH(W, tx, ty) : 0;
    const Y = (fx, fy) => hAt(fx, fy) * LV + (inside ? micro(k, tx + fx, ty + fy, seed) : 0);
    const vtx = (fx, fy) => {
      const wx = tx + fx, wy = ty + fy, y = Y(fx, fy), e = .02;
      const nx = (Y(Math.min(1, fx + e), fy) - Y(Math.max(0, fx - e), fy)) / (Math.min(1, fx + e) - Math.max(0, fx - e));
      const nz = (Y(fx, Math.min(1, fy + e)) - Y(fx, Math.max(0, fy - e))) / (Math.min(1, fy + e) - Math.max(0, fy - e));
      const n = new T3.Vector3(-nx, 1, -nz).normalize();
      let col = inside || k !== K.GRASS ? blendColor(W, wx, wy, lvl, seed) : kindColor(k, wx, wy, 0, seed);
      // крутой склон → земля/камень; затенение у подножия обрывов
      const slope = 1 - n.y; if (slope > .12 && k === K.GRASS) col = mix3(col, PALK.d1, Math.min(1, (slope - .12) * 3));
      let ao = 1; if (inside) for (const [dx, dy, d] of [[1, 0, 1 - fx], [-1, 0, fx], [0, 1, 1 - fy], [0, -1, fy]]) { const nh = effH(W, tx + dx, ty + dy) - lvl; if (nh >= 1) ao -= .22 * Math.max(0, 1 - d * 1.6) * Math.min(nh, 3) / 3; }
      const lt = 1 + Math.min(lvl, 5) * .025;
      return { p: [wx, y, wy], c: [col[0] * ao * lt, col[1] * ao * lt, col[2] * ao * lt], n: [n.x, n.y, n.z] };
    };
    const grid = []; for (let j = 0; j <= S; j++) { const row = []; for (let i = 0; i <= S; i++) row.push(vtx(i / S, j / S)); grid.push(row); }
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const q0 = grid[j][i], q1 = grid[j][i + 1], q2 = grid[j + 1][i + 1], q3 = grid[j + 1][i];
      pushTri(q0.p, q1.p, q2.p, q0.c, q1.c, q2.c, q0.n, q1.n, q2.n, UP); pushTri(q0.p, q2.p, q3.p, q0.c, q2.c, q3.c, q0.n, q2.n, q3.n, UP);
    }
  }
  // стенки обрывов
  const edges = [[0, 1, 0, -1], [1, 2, 1, 0], [2, 3, 0, 1], [3, 0, -1, 0]];   // углы ребра + направление соседа
  const cornerPos = (tx, ty, ci) => [[tx, ty], [tx + 1, ty], [tx + 1, ty + 1], [tx, ty + 1]][ci];
  for (let ty = 0; ty < N; ty++) for (let tx = 0; tx < N; tx++) {
    const i = (ty * N + tx) * 4, k = kindAt(W, tx, ty);
    for (const [ca, cb, dx, dy] of edges) {
      const nx = tx + dx, ny = ty + dy, nin = nx >= 0 && ny >= 0 && nx < N && ny < N;
      const aH = corner[i + ca], bH = corner[i + cb];
      // высоты соседа в тех же углах
      let naH = 0, nbH = 0;
      if (nin) { const j = (ny * N + nx) * 4, map = { '0,-1': [3, 2], '1,0': [0, 3], '0,1': [1, 0], '-1,0': [2, 1] }[dx + ',' + dy]; naH = corner[j + map[0]]; nbH = corner[j + map[1]]; }
      if (aH - naH < .03 && bH - nbH < .03) continue;
      const A = cornerPos(tx, ty, ca), Bp = cornerPos(tx, ty, cb), out = new T3.Vector3(dx, 0, dy);
      const top = Math.max(aH, bH), bot = Math.min(naH, nbH), rows = Math.max(1, Math.ceil((top - bot) * LV / .09)), cols = 4;
      for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
        const v = (rr, qq) => {
          const f = qq / cols, hT = aH + (bH - aH) * f, hB = naH + (nbH - naH) * f, h = hB + (hT - hB) * (rr / rows);
          const wx = A[0] + (Bp[0] - A[0]) * f, wy = A[1] + (Bp[1] - A[1]) * f, y = h * LV;
          const edge = rr === 0 || rr === rows || qq === 0 || qq === cols, bump = edge ? 0 : (h3(wx * 9, y * 9, wy * 9, 2) - .5) * (k === K.ROCK ? .07 : .035);
          const fromTop = (hT - h) * LV, nn = hash2(Math.floor(wx * 9 + wy * 9), Math.floor(y * 11), 5);
          let col;
          if (k === K.DECK) col = (Math.floor((wx + wy) * 4) % 4 === 0) ? PALK.w0 : mix3(PALK.w1, PALK.w0, nn * .5);
          else if (k === K.ROCK) col = mix3(Math.floor(y * 6) % 2 ? PALK.r0 : PALK.r1, PALK.r2, nn * .35);
          else if (k === K.COBBLE) col = mix3(PALK.c0, PALK.c1, nn);
          else if (k === K.SAND) col = mix3(PALK.s0, PALK.d1, .3 + nn * .3);
          else col = fromTop < .07 && k === K.GRASS ? PALK.g1 : mix3(PALK.d0, PALK.d1, nn * .8);
          const dark = .88 + .12 * (rr / rows);   // низ стенки темнее
          return { p: [wx + dx * bump, y, wy + dy * bump], c: [col[0] * dark, col[1] * dark, col[2] * dark], n: [dx, 0, dy] };
        };
        const v0 = v(r, q), v1 = v(r, q + 1), v2 = v(r + 1, q + 1), v3 = v(r + 1, q);
        pushTri(v0.p, v1.p, v2.p, v0.c, v1.c, v2.c, v0.n, v1.n, v2.n, out); pushTri(v0.p, v2.p, v3.p, v0.c, v2.c, v3.c, v0.n, v2.n, v3.n, out);
      }
    }
  }
  const geo = new T3.BufferGeometry();
  geo.setAttribute('position', new T3.Float32BufferAttribute(P, 3)); geo.setAttribute('normal', new T3.Float32BufferAttribute(Nn, 3)); geo.setAttribute('color', new T3.Float32BufferAttribute(Cc, 3));
  const m = new T3.Mesh(geo, addDetail(new T3.MeshStandardMaterial({ vertexColors: true, roughness: .95, metalness: 0 }), .05, 10));
  m.receiveShadow = true; m.castShadow = true;
  return m;
}
function buildWater(W) {
  const P = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (W.kind[y * N + x] === K.WATER || (W.kind[y * N + x] === K.SAND && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => kindAt(W, x + a, y + b) === K.WATER))) {
    const yy = -.32 * LV; P.push(x, yy, y, x + 1, yy, y, x + 1, yy, y + 1, x, yy, y, x + 1, yy, y + 1, x, yy, y + 1);
  }
  const geo = new T3.BufferGeometry(); geo.setAttribute('position', new T3.Float32BufferAttribute(P, 3));
  const m = new T3.Mesh(geo, new T3.ShaderMaterial({
    uniforms: { t: { value: 0 } }, transparent: true, depthWrite: false, side: T3.DoubleSide,
    vertexShader: 'varying vec3 vP; void main(){ vP=(modelMatrix*vec4(position,1.)).xyz; gl_Position=projectionMatrix*viewMatrix*vec4(vP,1.); }',
    fragmentShader: `uniform float t; varying vec3 vP;
      float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
      void main(){ vec2 p=vP.xz; float w=n(p*1.3+vec2(t*.25,t*.18))*.6+n(p*3.1-vec2(t*.4,-t*.3))*.4;
        vec3 c=mix(vec3(.13,.36,.62),vec3(.32,.62,.86),w);
        float r=smoothstep(.78,.86,n(p*4.+vec2(t*.6,t*.2)))*.55; float s=step(.985,h(floor(p*16.)+floor(t*3.)));
        gl_FragColor=vec4(c+vec3(r)+vec3(s*.6),.82); }`,
  }));
  m.renderOrder = 2; return m;
}
// трава и цветы (много мелких экземпляров)
function buildFoliage(W) {
  const seed = W.seedNum % 997, R = mulberry32(W.seedNum + 5), G3 = new T3.Group();
  const blade = new MB(); for (let i = 0; i < 3; i++) blade.add(GEO.cone5, M(Math.cos(i * 2.1) * .04, .07, Math.sin(i * 2.1) * .04, .022, .16, .022, Math.cos(i * 2.1) * .35, 0, Math.sin(i * 2.1) * .35), '#ffffff', 0);
  const tg = blade.build(new T3.MeshStandardMaterial({ vertexColors: true, roughness: 1 })).geometry;
  const tufts = [], flowers = [], pebbles = [];
  for (let y = -OUT; y < N + OUT; y++) for (let x = -OUT; x < N + OUT; x++) {
    const inside = x >= 0 && y >= 0 && x < N && y < N, k = kindAt(W, x, y);
    if (inside && W.blocked[y * N + x]) continue;
    const dens = inside ? 3 : (Math.abs(x - N / 2) < N / 2 + 6 && Math.abs(y - N / 2) < N / 2 + 6 ? 1 : 0);
    for (let q = 0; q < dens; q++) {
      const fx = R(), fy = R(), wx = x + fx, wy = y + fy, z = inside ? groundSmooth(wx, wy) : 0;
      if (k === K.GRASS && R() < .8) tufts.push([wx, z, wy, R()]);
      if (k === K.GRASS && R() < .07) flowers.push([wx, z, wy, R()]);
      if ((k === K.DIRT || k === K.SAND || k === K.ROCK) && R() < .25) pebbles.push([wx, z, wy, R()]);
    }
  }
  const mk = (geo, list, colFn, scale, matOpts = {}) => {
    const im = new T3.InstancedMesh(geo, new T3.MeshStandardMaterial(Object.assign({ roughness: 1, flatShading: true }, matOpts)), list.length);
    const m4 = new T3.Matrix4(), c = new T3.Color();
    list.forEach(([x, z, y, r], i) => { m4.compose(new T3.Vector3(x, z * LV, y), new T3.Quaternion().setFromEuler(new T3.Euler(0, r * 6.28, 0)), new T3.Vector3().setScalar(scale(r))); im.setMatrixAt(i, m4); im.setColorAt(i, c.set(colFn(r, x, y))); });
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; return im;
  };
  G3.add(mk(tg, tufts, (r, x, y) => { const c = mix3(PALK.g1, PALK.g3, vnoise(x * .45, y * .45, seed) * .7 + r * .3); return new T3.Color(c[0], c[1], c[2]); }, r => .7 + r * .7));
  G3.add(mk(GEO.sph, flowers, r => ['#ff8fb0', '#fff6d6', '#ffd23a', '#c8a0ff', '#ff6a4a'][Math.floor(r * 5)], () => .045));
  const pb = mk(GEO.sph, pebbles, r => r < .5 ? '#8a8a92' : '#a8a296', r => .035 + r * .04); G3.add(pb);
  return G3;
}

// ───────── Объекты вольера ─────────
const DYNOBJ = [];       // подвижные части: { o, update(o, t) }
function addDyn(obj3d, o, update) { scene.add(obj3d); DYNOBJ.push({ obj3d, o, update }); }
function treeInto(mb, x, z, y, s, seed) {
  const R = mulberry32(seed * 7 + 1), h = (1.1 + R() * .5) * s;
  mb.add(GEO.cylT, M(x, z + h / 2, y, .13 * s, h, .13 * s), '#6a4628', .12, seed);
  for (let b = 0; b < 2; b++) { const a = R() * 6.28; mb.add(GEO.cyl, M(x + Math.cos(a) * .18 * s, z + h * .85, y + Math.sin(a) * .18 * s, .05 * s, .45 * s, .05 * s, Math.sin(a) * .7, 0, -Math.cos(a) * .7), '#6a4628', .1, seed + b); }
  const greens = ['#2f7a32', '#3d8f3a', '#4ea442', '#62b44c'];
  for (let i = 0; i < 6; i++) { const a = R() * 6.28, d = R() * .35 * s, r = (.32 + R() * .25) * s; mb.add(GEO.sph, M(x + Math.cos(a) * d, z + h + .1 + R() * .45 * s, y + Math.sin(a) * d, r, r * .85, r), greens[Math.floor(R() * 4)], .16, seed + i, .25); }
}
function palmInto(mb, x, z, y, seed) {
  const R = mulberry32(seed * 13 + 3), segs = 9, lean = (R() - .5) * .5, leanA = R() * 6.28;
  let px = x, py = y, pz = z;
  for (let i = 0; i < segs; i++) { const k = i / segs, ox = Math.cos(leanA) * lean * k * k, oy = Math.sin(leanA) * lean * k * k; mb.add(GEO.cyl6, M(x + ox, z + .12 + i * .2, y + oy, .085 - k * .025, .2, .085 - k * .025), i % 2 ? '#8a6238' : '#a07448', .08, seed + i); px = x + ox; py = y + oy; pz = z + .12 + i * .2; }
  for (let f = 0; f < 8; f++) {
    const a = f / 8 * 6.28 + R() * .3;
    for (let s = 0; s < 5; s++) { const d = .12 + s * .16, droop = s * s * .035; mb.add(GEO.box, M(px + Math.cos(a) * d, pz + .08 - droop, py + Math.sin(a) * d, .17, .025, .1 - s * .012, 0, -a, -.15 - s * .12), s % 2 ? '#4ea442' : '#3d8f3a', .12, seed + f * 9 + s); }
  }
  return { x: px, y: py, z: pz };
}
function buildObjects(W) {
  const mb = new MB();
  const gz = (x, y) => groundSmooth(x, y) * LV;
  for (const o of W.objs) {
    const x = o.x, y = o.y, z = gz(x, y), s = o.seed || o.id;
    switch (o.type) {
      case 'tree': treeInto(mb, x, z, y, .9 + (s % 5) * .06, s); break;
      case 'banana_tree': {
        const top = palmInto(mb, x, z, y, s), bun = new T3.Group();
        for (let b = 0; b < 3; b++) { const a = b * 2.1 + .5, gb = grp(top.x + Math.cos(a) * .14, top.z - .12, top.y + Math.sin(a) * .14); for (let i = 0; i < 5; i++) gb.add(part(GEO.sph, i % 2 ? '#ffd23a' : '#f0c020', [Math.cos(i * 1.3) * .045, -i * .03, Math.sin(i * 1.3) * .045], [.028, .07, .028], [.3, 0, .4])); bun.add(gb); }
        addDyn(bun, o, (o) => bun.children.forEach((c, i) => c.visible = i < o.bananas)); break; }
      case 'bush': {
        const R = mulberry32(s); for (let i = 0; i < 4; i++) mb.add(GEO.sph, M(x + (R() - .5) * .45, z + .18 + R() * .12, y + (R() - .5) * .45, .24, .2, .24), ['#3d8f3a', '#4ea442', '#2f7a32'][i % 3], .18, s + i, .3);
        const ex = new T3.Group(), br = new T3.Group(), st = new T3.Group();
        for (let i = 0; i < 7; i++) br.add(part(GEO.sph, '#d23040', [x + (R() - .5) * .5, z + .2 + R() * .2, y + (R() - .5) * .5], [.035, .035, .035]));
        st.add(part(GEO.cyl, '#8a6238', [x + .25, z + .06, y + .1], [.025, .5, .025], [0, 0, 1.3])); st.add(part(GEO.cyl, '#7a5230', [x - .1, z + .06, y + .28], [.022, .45, .022], [1.2, 0, .3]));
        ex.add(br, st); addDyn(ex, o, o => { br.visible = o.berries > 0; st.visible = o.sticks > 0; }); break; }
      case 'termite': for (let i = 0; i < 3; i++) mb.add(GEO.cone, M(x + (i - 1) * .14, z + .4 - i * .07, y + (i % 2) * .1, .3 - i * .05, .85 - i * .2, .3 - i * .05), '#9a7048', .14, s + i, .2); for (let i = 0; i < 4; i++) mb.add(GEO.sph, M(x + Math.cos(i) * .2, z + .2 + i * .1, y + Math.sin(i) * .2 + .1, .04, .05, .03), '#2a1a10', 0); break;
      case 'anvil': mb.add(GEO.cyl, M(x, z + .15, y, .22, .3, .22), '#7a5230', .1, s); mb.add(GEO.box, M(x, z + .34, y, .55, .1, .38), '#8a8a9a', .1, s, .1); mb.add(GEO.box, M(x, z + .4, y, .5, .02, .33), '#a8a8b8', 0); break;
      case 'nutpile': { const g3 = new T3.Group(); for (let i = 0; i < 6; i++) g3.add(part(GEO.sph, '#a07040', [x + Math.cos(i * 1.7) * .14 * (i % 3) / 2, z + .05 + Math.floor(i / 3) * .07, y + Math.sin(i * 1.7) * .14 * (i % 3) / 2], [.06, .055, .06])); addDyn(g3, o, o => g3.children.forEach((c, i) => c.visible = i < o.nuts)); break; }
      case 'stonepile': { const g3 = new T3.Group(); for (let i = 0; i < 4; i++) g3.add(part(GEO.sph, i % 2 ? '#8a8a96' : '#a0a0aa', [x + Math.cos(i * 1.6) * .17, z + .08 + (i === 3 ? .1 : 0), y + Math.sin(i * 1.6) * .17], [.13, .1, .12])); addDyn(g3, o, o => g3.children.forEach((c, i) => c.visible = i < o.stones)); break; }
      case 'box': {
        mb.add(GEO.box, M(x, z + .28, y, .55, .55, .55), '#7a4ab8', .08, s); for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) mb.add(GEO.box, M(x + a * .27, z + .28, y + b * .27, .05, .57, .05), '#4a2a80', 0);
        const tex = canvasTex(16, 16, (c) => { c.fillStyle = '#7a4ab8'; c.fillRect(0, 0, 16, 16); c.fillStyle = '#ffd23a'; c.font = 'bold 13px monospace'; c.textAlign = 'center'; c.fillText('?', 8, 13); });
        const q = new T3.Group(); for (const [px, pz, ry] of [[.281, 0, Math.PI / 2], [0, .281, 0]]) { const pl = new T3.Mesh(GEO.plane, new T3.MeshBasicMaterial({ map: tex })); pl.scale.set(.42, .42, 1); pl.position.set(x + px, z + .3, y + pz); pl.rotation.y = ry; q.add(pl); }
        const glow = part(GEO.box, '#c59bff', [x, z + .28, y], [.6, .6, .6], null, { transparent: true, opacity: .25, emissive: '#c59bff', emissiveIntensity: .8 }); glow.castShadow = false; q.add(glow);
        addDyn(q, o, (o, t) => { glow.visible = !(o.cool > 0); glow.material.opacity = .12 + .12 * Math.sin(t * 3); }); break; }
      case 'swing': {
        for (const sx of [-.6, .6]) { mb.add(GEO.box, M(x + sx, z + .7, y - .25, .07, 1.5, .07, .18, 0, 0), '#7a5230', .1); mb.add(GEO.box, M(x + sx, z + .7, y + .25, .07, 1.5, .07, -.18, 0, 0), '#7a5230', .1); }
        mb.add(GEO.box, M(x, z + 1.42, y, 1.4, .09, .09), '#946238', .1);
        const sw = grp(x, z + 1.4, y); sw.add(part(GEO.cyl, '#d8c08a', [0, -.42, 0], [.012, .84, .012])); sw.add(part(GEO.tor, '#1e1e22', [0, -.92, 0], [.2, .2, .2], [Math.PI / 2, 0, 0]));
        addDyn(sw, o, (o, t) => { sw.rotation.x = Math.sin(t * (o.active > 0 ? 6 : 1.5)) * (o.active > 0 ? .55 : .08); }); break; }
      case 'drums': for (const [dx, col] of [[-.18, '#c03a2a'], [.2, '#3a5ac0']]) { mb.add(GEO.cyl, M(x + dx, z + .2, y, .17, .4, .17), col, .08); mb.add(GEO.cyl, M(x + dx, z + .41, y, .17, .02, .17), '#f0ead6', 0); } break;
      case 'gong': {
        for (const sx of [-.45, .45]) mb.add(GEO.box, M(x + sx, z + .65, y, .07, 1.3, .07), '#5a3a20', .1); mb.add(GEO.box, M(x, z + 1.3, y, 1.0, .08, .08), '#6a4628', .1);
        const dg = grp(x, z + 1.25, y); dg.add(part(GEO.cyl, '#e0a020', [0, -.42, 0], [.34, .04, .34], [Math.PI / 2, 0, 0], { metalness: .4, roughness: .5 })); dg.add(part(GEO.cyl, '#ffd23a', [0, -.42, .02], [.12, .03, .12], [Math.PI / 2, 0, 0]));
        addDyn(dg, o, (o, t) => { dg.rotation.x = o.ring > 0 ? Math.sin(t * 30) * .25 * o.ring : 0; }); break; }
      case 'frame': {
        for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) mb.add(GEO.cyl, M(x + a * .55, z + .7, y + b * .55, .045, 1.4, .045), '#8a5a28', .1);
        for (const hh of [.45, .9, 1.38]) { mb.add(GEO.cyl, M(x, z + hh, y - .55, .03, 1.1, .03, 0, 0, Math.PI / 2), '#b07c3c', .1); mb.add(GEO.cyl, M(x, z + hh, y + .55, .03, 1.1, .03, 0, 0, Math.PI / 2), '#b07c3c', .1); mb.add(GEO.cyl, M(x - .55, z + hh, y, .03, 1.1, .03, Math.PI / 2, 0, 0), '#b07c3c', .1); }
        for (let i = 0; i < 5; i++) mb.add(GEO.cyl, M(x + .55, z + .7, y - .4 + i * .2, .012, 1.4, .012), '#e0cc98', .05);
        break; }
      case 'chest': case 'locker': {
        const lock = o.type === 'locker';
        mb.add(GEO.box, M(x, z + (lock ? .45 : .18), y, lock ? .45 : .5, lock ? .9 : .32, lock ? .35 : .34), lock ? '#4a6a5a' : '#8a5a2a', .08, s);
        if (!lock) mb.add(GEO.box, M(x, z + .18, y + .172, .52, .05, .01), '#d8a020', 0);
        const lid = grp(x, z + (lock ? .45 : .34), y + (lock ? .18 : -.17));
        if (lock) lid.add(part(GEO.box, '#5a7a6a', [.2, 0, 0], [.4, .85, .03])); else lid.add(part(GEO.box, '#a06a32', [0, .05, .17], [.52, .1, .34]));
        const gold = part(GEO.sph, '#ffd23a', [x, z + (lock ? .5 : .3), y], [.15, .07, .12], null, { emissive: '#664400', emissiveIntensity: .5 }); gold.visible = false;
        const gg = new T3.Group(); gg.add(lid, gold);
        addDyn(gg, o, o => { if (lock) lid.rotation.y = o.opened ? -1.6 : 0; else lid.rotation.x = o.opened ? -1.7 : 0; gold.visible = !!o.opened && !lock; }); break; }
      case 'ladder': {
        const dz = (o.to.z - groundSmooth(x, y)) * LV + .15, lean = .18;
        const ang = Math.atan2(o.dx, o.dy);
        const lg = grp(x, z, y); lg.rotation.y = ang;
        const inner = grp(); inner.rotation.x = lean; lg.add(inner);
        for (const sx of [-.17, .17]) inner.add(part(GEO.box, '#8a5a28', [sx, dz / 2, 0], [.05, dz, .05]));
        for (let h = .15; h < dz; h += .17) inner.add(part(GEO.box, '#b07c3c', [0, h, 0], [.34, .035, .04]));
        scene.add(lg); break; }
      case 'dig': { const hole = part(GEO.cyl, '#3a2414', [x, z + .01, y], [.22, .02, .18]); hole.castShadow = false; const mound = part(GEO.sph, '#7a5232', [x + .25, z, y + .1], [.16, .08, .14]); const gg = new T3.Group(); gg.add(hole, mound); addDyn(gg, o, o => { gg.visible = !!o.dug; }); break; }
      case 'hut': {
        const hx = x, hy = y, hw = 2.6;
        mb.add(GEO.box, M(hx, z + .75, hy, hw, 1.5, hw), '#c8a070', .06, s);
        for (let i = 0; i < 6; i++) mb.add(GEO.box, M(hx, z + .12 + i * .25, hy, hw + .02, .02, hw + .02), '#9a7448', 0);
        mb.add(GEO.box, M(hx - hw / 2 - .01, z + .55, hy, .02, 1.05, .6), '#5a3a1e', .05);       // дверь (запад)
        mb.add(GEO.box, M(hx, z + .95, hy + hw / 2 + .01, .7, .5, .02), '#68b2f0', .05);         // окно (юг)
        mb.add(GEO.box, M(hx, z + .95, hy + hw / 2 + .02, .74, .04, .02), '#5a3a1e', 0); mb.add(GEO.box, M(hx, z + .95, hy + hw / 2 + .02, .04, .54, .02), '#5a3a1e', 0);
        mb.add(GEO.cone5, M(hx, z + 2.05, hy, 2.15, 1.1, 2.15, 0, Math.PI / 4, 0), '#b8402c', .1, s);
        mb.add(GEO.box, M(hx + .6, z + 2.2, hy - .4, .3, .7, .3), '#8a8a96', .08);
        break; }
    }
  }
  // забор
  const gy = W.gate.y, fence = (x0, y0, x1, y1, h, low) => {
    const len = Math.hypot(x1 - x0, y1 - y0), ang = Math.atan2(y1 - y0, x1 - x0);
    for (let i = 0; i <= len; i++) { const px = x0 + (x1 - x0) * i / len, py = y0 + (y1 - y0) * i / len; mb.add(GEO.box, M(px, h / 2, py, .09, h + .06, .09), '#6a4a24', .1, i); mb.add(GEO.box, M(px, h + .05, py, .12, .04, .12), '#8a6a34', 0); }
    for (const hh of [h * .95, h * .5]) mb.add(GEO.box, M((x0 + x1) / 2, hh, (y0 + y1) / 2, len, .05, .05, 0, -ang, 0), '#8a6538', .06);
    for (let i = .25; i < len; i += .25) { if (Math.abs(i % 1) < .01) continue; const px = x0 + (x1 - x0) * i / len, py = y0 + (y1 - y0) * i / len; mb.add(GEO.box, M(px, h * .48, py, .022, h * .95, .022), low ? '#9aa0a8' : '#8a9098', 0); }
  };
  fence(0, 0, N, 0, .95); fence(0, 0, 0, N, .95); fence(0, N, N, N, .5, true); fence(N, 0, N, gy - 1, .5, true); fence(N, gy + 2, N, N, .5, true);
  // ворота
  for (const py of [gy - 1, gy + 2]) { mb.add(GEO.box, M(N, .75, py, .16, 1.5, .16), '#d8a020', .08); mb.add(GEO.sph, M(N, 1.55, py, .12, .12, .12), '#ffd23a', .05); }
  mb.add(GEO.box, M(N, 1.45, gy + .5, .1, .1, 3), '#d8a020', .05);
  const leaves = [];
  for (const [py, dir] of [[gy - 1, 1], [gy + 2, -1]]) {
    const lf = grp(N, 0, py); for (let i = 1; i <= 6; i++) lf.add(part(GEO.box, '#b03028', [0, .55, dir * i * .24], [.04, 1.1, .04])); lf.add(part(GEO.box, '#c83a30', [0, 1.05, dir * .75], [.05, .06, 1.5])); lf.add(part(GEO.box, '#c83a30', [0, .2, dir * .75], [.05, .06, 1.5]));
    leaves.push([lf, dir]);
  }
  const lock = part(GEO.box, '#ffd23a', [N + .06, .6, gy + .5], [.08, .16, .12], null, { emissive: '#664400', emissiveIntensity: .4 });
  const gateG = new T3.Group(); leaves.forEach(([l]) => gateG.add(l)); gateG.add(lock);
  addDyn(gateG, null, () => { const a = Math.min(1, G.gateAnim) * 1.7; leaves[0][0].rotation.y = a; leaves[1][0].rotation.y = -a; lock.visible = !G.gateOpen; lock.material.emissiveIntensity = (G.hasKey && lvSum() >= NEED_SUM) ? .5 + .5 * Math.sin(G.t * 6) : .4; });
  // сцена: баннер и занавес
  const st = W.stage, bx = st.x + st.w / 2, sz = 1 * LV;
  for (const px of [st.x + .1, st.x + st.w - .1]) { mb.add(GEO.cyl, M(px, sz + .85, st.y + .1, .05, 1.7, .05), '#6a4628', .08); mb.add(GEO.box, M(px + (px < bx ? .25 : -.25), sz + .7, st.y + .15, .45, 1.3, .06), '#a82020', .12); }
  const ban = new T3.Mesh(GEO.plane, new T3.MeshStandardMaterial({ map: canvasTex(96, 20, (c) => { c.fillStyle = '#d24a34'; c.fillRect(0, 0, 96, 20); for (let i = 0; i < 96; i += 12) { c.fillStyle = 'rgba(255,255,255,.15)'; c.fillRect(i, 0, 6, 20); } c.fillStyle = '#ffd23a'; c.font = 'bold 14px monospace'; c.textAlign = 'center'; c.fillText('★ ШОУ ★', 48, 15); }), side: T3.DoubleSide }));
  ban.scale.set(st.w - .3, .55, 1); ban.position.set(bx, sz + 1.5, st.y + .12); scene.add(ban);
  // декор снаружи
  for (const d of W.decor) {
    const x = d.x, y = d.y;
    if (d.k === 'tree') treeInto(mb, x, 0, y, 1.15 + (d.s % 7) * .06, d.s + 100);
    else if (d.k === 'bush') for (let i = 0; i < 3; i++) mb.add(GEO.sph, M(x + (i - 1) * .22, .18, y + (i % 2) * .15, .25, .2, .25), i % 2 ? '#3d8f3a' : '#4ea442', .18, d.s + i, .3);
    else if (d.k === 'lamp') { mb.add(GEO.cyl, M(x, .9, y, .04, 1.8, .04), '#33363e', .05); const b = new T3.Mesh(GEO.sph, new T3.MeshStandardMaterial({ color: '#fff2b0', emissive: '#ffd27a', emissiveIntensity: 1, flatShading: true })); b.position.set(x, 1.85, y); b.scale.set(.1, .12, .1); scene.add(b); LAMPS.push(b); }
    else if (d.k === 'bench') { mb.add(GEO.box, M(x, .32, y, 1.2, .06, .35), '#a07448', .1); mb.add(GEO.box, M(x, .55, y - .16, 1.2, .3, .05), '#8a6238', .1); for (const s of [-.5, .5]) mb.add(GEO.box, M(x + s, .16, y, .06, .32, .3), '#2e2e34', 0); }
    else if (d.k === 'kiosk') { mb.add(GEO.box, M(x, .6, y, 1.6, 1.2, 1.1), '#f0ead6', .05); for (let i = 0; i < 7; i++) mb.add(GEO.box, M(x - .7 + i * .23, 1.32, y + .62, .23, .08, .5, .5, 0, 0), i % 2 ? '#f6f2e2' : '#d24a34', 0); mb.add(GEO.box, M(x, .75, y + .56, 1.0, .5, .02), '#68b2f0', 0); }
    else if (d.k === 'sign') { for (const s of [-.45, .45]) mb.add(GEO.cyl, M(x + s, .5, y, .04, 1.0, .04), '#6a4628', .05); const sg = new T3.Mesh(GEO.plane, new T3.MeshStandardMaterial({ map: canvasTex(64, 20, c => { c.fillStyle = '#e0b472'; c.fillRect(0, 0, 64, 20); c.fillStyle = '#5a3a10'; c.font = 'bold 9px monospace'; c.textAlign = 'center'; c.fillText('ШИМПАНЗЕ', 32, 13); }), side: T3.DoubleSide })); sg.scale.set(1.1, .36, 1); sg.position.set(x, .95, y); sg.rotation.y = Math.PI / 4; scene.add(sg); }
  }
  scene.add(mb.build());
}

// ───────── Построение сцены для нового мира ─────────
let SCENE_W = null, WATER = null, KCONE = null;
function buildOuter(W) {   // имя оставлено для совместимости
  for (let i = scene.children.length - 1; i >= 0; i--) { const c = scene.children[i]; if (c !== hemi && c !== sun && c !== sun.target) scene.remove(c); }
  DYNOBJ.length = 0; RIGS.clear(); POOLS.clear(); LAMPS.length = 0;
  scene.add(buildTerrain(W)); WATER = buildWater(W); scene.add(WATER); scene.add(buildFoliage(W)); buildObjects(W);
  KCONE = new T3.Mesh(new T3.CircleGeometry(1, 14, -.85, 1.7), new T3.MeshBasicMaterial({ color: '#ffe680', transparent: true, opacity: .14, depthWrite: false })); KCONE.rotation.x = -Math.PI / 2; KCONE.renderOrder = 3; scene.add(KCONE);
  SCENE_W = W;
}

// ───────── Существа: модели по требованию ─────────
const RIGS = new Map();
function rigFor(e, kind) {
  let r = RIGS.get(e);
  if (!r) {
    if (kind === 'player') r = makeApe(e.fur || FUR.brown);
    else if (kind === 'chimp') r = makeApe(e.fur || FUR.brown);
    else if (kind === 'gorilla') r = makeApe(FUR.silver, 'gorilla');
    else if (kind === 'parrot') r = makeParrot(e.col || '#d24a34');
    else if (kind === 'tortoise') r = makeTortoise();
    else if (kind === 'keeper') r = makeHuman({ shirt: '#3f8a4a', sleeve: '#3f8a4a', pants: '#2a4462', shoes: '#2a1a0e', skin: '#f0c8a0', hat: 'cap', capCol: '#2d7a3a', capCol2: '#1d5a2a', belt: true });
    else if (kind === 'visitor') r = makeHuman({ shirt: e.col, pants: e.pants, hair: e.hair, skin: e.skin, shoes: '#e8e8e8', hat: e.hat === 0 ? 'cap' : e.hat === 1 ? 'sun' : null, capCol: '#d24a34', capCol2: '#8a2a26', kid: e.kid, phone: true });
    r.seed = Math.random() * 10; r.ang = 0; r.px = e.x; r.py = e.y; r.kind = kind;
    r.root.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
    scene.add(r.root); RIGS.set(e, r);
  }
  r.alive = true; return r;
}
function visY(e) {   // высота для рисования: плавная земля, если существо стоит, иначе — физическая
  const gs = groundSmooth(e.x, e.y), gd = groundAt(G.W, e.x, e.y), z = e.rz ?? e.z ?? 0;
  return Math.abs(z - gd) < .06 ? gs : Math.max(z, gs);
}
const STEP16 = Math.PI * 2 / 16;
function placeRig(r, e, y, ang) {
  if (ang !== null) r.ang = ang;
  r.root.position.set(e.x, y * LV, e.y);
  r.root.rotation.y = Math.round(r.ang / STEP16) * STEP16;      // 16 направлений
}
const tq = (t, s) => Math.floor((t + s) * 12) / 12;               // кадровая анимация (12 кадров/с)
function moveAngle(r, e) { const dx = e.x - r.px, dy = e.y - r.py; r.px = e.x; r.py = e.y; return dx * dx + dy * dy > 1e-5 ? Math.atan2(dx, dy) : null; }
function syncCreatures() {
  for (const r of RIGS.values()) r.alive = false;
  const T = G.t;
  for (const p of G.players) {
    if (p.gone) continue;
    const r = rigFor(p, 'player'), y = visY(p), mv = moveAngle(r, p);
    const ang = p.me ? Math.atan2(p.dx, p.dy) : mv;
    const a = p.act ? p.act.type : (p.stun > 0 ? 'stun' : null);
    const air = p.me ? (!p.grounded && p.z > groundAt(G.W, p.x, p.y) + .3) : false;
    poseApe(r, { t: tq(T, r.seed), move: p.moving ? (p.sprint ? 2 : 1) : 0, crouch: p.crouch, air, act: a === 'show' || a === 'climb' || a === 'swing' ? 'up' : a, actP: p.act && p.act.dur ? p.act.t / p.act.dur : 0 });
    placeRig(r, p, y, ang);
    showDirt(r, p.dirtP || 0, p.dirtB || 0); r.root.visible = !(p.invuln > 0 && Math.floor(G.t * 10) % 2);
  }
  for (const n of G.npcs) {
    const r = rigFor(n, n.sp), mv = moveAngle(r, n), t = tq(T, r.seed);
    if (n.sp === 'parrot') { poseParrot(r, { t, fly: n.flying }); placeRig(r, n, n.rz, mv); continue; }
    if (n.sp === 'tortoise') { poseTortoise(r, { t, move: n.moving }); placeRig(r, n, visY(n), mv); continue; }
    const act = n.sp === 'gorilla' ? (n.state === 'eat' ? 'eat' : n.state === 'chase' ? 'angry' : n.act) : (n.fleeT > 0 ? null : n.mood === 'happy' ? 'happy' : null);
    poseApe(r, { t, move: n.moving ? (n.state === 'chase' || n.fleeT > 0 ? 2 : 1) : 0, act });
    placeRig(r, n, visY(n), mv);
  }
  const k = G.keeper;
  if (k) {
    const r = rigFor(k, 'keeper'); moveAngle(r, k);
    poseHuman(r, { t: tq(T, r.seed), move: k.moving ? (k.state === 'chase' ? 2 : 1) : 0, act: k.state === 'stunned' ? 'stun' : k.state === 'sleep' ? 'sleep' : (k.state === 'chase' || k.state === 'suspicious') ? 'alert' : null });
    placeRig(r, k, visY(k), Math.atan2(k.dx, k.dy));
    const km = r.j.torso.children.find(c => c.geometry === GEO.box && c.material.color.getHexString() === 'ffd23a'); if (km) km.visible = k.hasKey;
    if (KCONE) { const range = k.visRange || 8.5; KCONE.visible = k.state !== 'stunned' && k.state !== 'sleep' && k.state !== 'tohut'; KCONE.scale.set(range, range, 1); KCONE.position.set(k.x, groundSmooth(k.x, k.y) * LV + .04, k.y); KCONE.rotation.z = -Math.atan2(k.dy, k.dx); KCONE.material.color.set(k.state === 'chase' ? '#ff4030' : k.state === 'suspicious' ? '#ffb020' : '#ffe680'); KCONE.material.opacity = k.state === 'chase' ? .24 : .13; }
  }
  for (const v of G.vis) {
    const r = rigFor(v, 'visitor'); r.root.visible = v.a > .5;
    if (!r.root.visible) continue;
    const phone = Math.sin(T * .5 + v.ph * 3) > .7;
    poseHuman(r, { t: tq(T, r.seed), seed: v.ph, act: v.cheer > 0 ? 'cheer' : (v.emo && v.emo.t > 1) ? 'scared' : phone ? 'phone' : null });
    placeRig(r, v, 0, Math.atan2(N / 2 - v.x, N / 2 - v.y));
  }
  for (const [e, r] of RIGS) if (!r.alive) { scene.remove(r.root); RIGS.delete(e); }
}
// пятна грязи на шерсти (коричневые — говно, белые — попугаи)
function showDirt(r, dp, db) {
  if (!r.dirt) {
    r.dirt = [];
    const spots = [[.12, .3, .16], [-.1, .4, .14], [.05, .2, -.18], [-.14, .25, -.12], [.16, .45, 0], [0, .5, .17], [-.17, .35, .05]];
    spots.forEach(([x, y, z], i) => { for (const col of ['#4a2e12', '#f0f0e6']) { const m = part(GEO.sph, col, [x * 1.05, y, z * 1.1], [.06 + (i % 3) * .015, .05, .045]); m.castShadow = false; m.visible = false; r.j.torso.add(m); r.dirt.push({ m, bird: col !== '#4a2e12', i }); } });
  }
  for (const d of r.dirt) d.m.visible = d.i < (d.bird ? db : dp);
}
// пулы мелочей: предметы, снаряды, кляксы
const POOLS = new Map();
function pool(kind, i, make) { let p = POOLS.get(kind); if (!p) { p = []; POOLS.set(kind, p); } while (p.length <= i) { const m = make(); scene.add(m); p.push(m); } p[i].visible = true; return p[i]; }
function hideFrom(kind, n) { const p = POOLS.get(kind); if (p) for (let i = n; i < p.length; i++) p[i].visible = false; }
const PICK_MK = {
  banana: () => part(GEO.sph, '#ffd23a', null, [.04, .04, .13], [0, 0, .5]), coin: () => part(GEO.cyl, '#ffd23a', null, [.09, .02, .09], [Math.PI / 2, 0, 0], { metalness: .5, roughness: .4, emissive: '#553300', emissiveIntensity: .5 }),
  peanut: () => part(GEO.sph, '#d8b070', null, [.07, .05, .1]), nut: () => part(GEO.sph, '#8a5a30', null, [.07, .07, .07]),
  stone: () => part(GEO.sph, '#9a9aa4', null, [.09, .07, .08]), stick: () => part(GEO.cyl, '#8a6238', null, [.025, .45, .025], [0, 0, 1.4]),
  poop: () => part(GEO.sph, '#5a3a1a', null, [.08, .07, .08]), water: () => part(GEO.sph, '#9ad8ff', null, [.04, .04, .04], null, { emissive: '#3a7aaa', emissiveIntensity: .4 }),
  hook: () => part(GEO.sph, '#c89a62', null, [.04, .04, .04]),
};
function syncItems() {
  const T = G.t, cnt = {};
  const put = (type, x, zl, y, spin) => { const i = cnt[type] = (cnt[type] || 0) + 1; const m = pool(type, i - 1, PICK_MK[type] || PICK_MK.stone); m.position.set(x, zl * LV + .06, y); if (spin) m.rotation.y = T * 3; return m; };
  for (const p of G.pickups) {
    let x = p.x, y = p.y, z = p.z || 0;
    if (p.fly) { const k = clamp(p.fly.t / p.fly.fl, 0, 1); x = p.fly.sx + (p.x - p.fly.sx) * k; y = p.fly.sy + (p.y - p.fly.sy) * k; z = groundSmooth(x, y) + Math.sin(Math.PI * k) * 4; }
    else z = groundSmooth(x, y);
    put(p.type, x, z + (p.type === 'coin' ? .3 + Math.sin(T * 4 + p.x) * .05 : 0), y, p.type === 'coin');
  }
  for (const q of G.proj) put(q.kind === 'poop' ? 'poop' : q.kind, q.x, q.z, q.y, true);
  for (const k of Object.keys(PICK_MK)) hideFrom(k, cnt[k] || 0);
  let si = 0;
  for (const s of G.splats) { const m = pool('splat', si++, () => { const mm = new T3.Mesh(new T3.CircleGeometry(.2, 9), new T3.MeshBasicMaterial({ color: '#4a2e12', transparent: true, depthWrite: false })); mm.rotation.x = -Math.PI / 2; mm.renderOrder = 1; return mm; }); m.position.set(s.x, groundSmooth(s.x, s.y) * LV + .02, s.y); m.material.opacity = clamp((28 - s.t) / 6, 0, .85); m.scale.setScalar(1 + (s.x * 7 % 1) * .5); }
  hideFrom('splat', si);
}

// ── свет по времени суток ──
const LAMPS = [];
const _c1 = new T3.Color(), _c2 = new T3.Color();
function applyDaylight() {
  const p = typeof dayPhase === 'function' ? dayPhase() : .5;
  const sunUp = Math.sin((p - .25) * Math.PI * 2);              // >0 днём
  const day = clamp(sunUp * 1.6 + .25, 0, 1), dusk = clamp(1 - Math.abs(sunUp) * 4, 0, 1) * (p > .15 && p < .9 ? 1 : 0);
  sun.intensity = .12 + .88 * day; sun.color.copy(_c1.set('#ffe2b0').lerp(_c2.set('#fff4dc'), day)).lerp(_c2.set('#ff9a5a'), dusk * .7);
  hemi.intensity = .32 + .5 * day; hemi.color.copy(_c1.set('#5a6a9a').lerp(_c2.set('#d8ecff'), day));
  scene.background.copy(_c1.set('#14203a').lerp(_c2.set('#2f5a30'), day));
  const ang = (p - .25) * Math.PI * 2;                                     // солнце идёт по дуге
  sun.position.set(sun.target.position.x - Math.cos(ang) * 16, sun.target.position.y + 6 + Math.max(.2, sunUp) * 18, sun.target.position.z - 5);
  for (const l of LAMPS) l.material.emissiveIntensity = .4 + (1 - day) * 2.2;
}

// ───────── Кадр ─────────
function renderWorld(dt) {
  if (!G.W) return;
  if (SCENE_W !== G.W) buildOuter(G.W);
  updateCam(dt, G.camSnap); G.camSnap = false;
  if (WATER) WATER.material.uniforms.t.value = G.t;
  applyDaylight();
  for (const d of DYNOBJ) d.update(d.o, G.t);
  syncCreatures(); syncItems();
  renderer.setRenderTarget(rt); renderer.render(scene, camera);
  renderer.setRenderTarget(null); renderer.render(postScene, postCam);
  // интерфейсный слой поверх
  g.clearRect(0, 0, VW, VH);
  drawOverlay();
}
function drawOverlay() {
  const T = G.t;
  // подсказки над существами
  for (const p of G.players) {
    if (p.gone) continue; const y = visY(p), s = project(p.x, y + 2.9, p.y);
    if (isNet() || !p.me) pxText(g, p.name, s.x, s.y, p.me ? P_.white : P_.teal, 7);
    if (p.stun > 0) pxText(g, '*', s.x, s.y - 8, P_.yel, 10);
    if (p.me && p.act && p.act.dur > .5) { const w = 20, pr = clamp(p.act.t / p.act.dur, 0, 1); rect(g, s.x - w / 2 - 1, s.y + 2, w + 2, 4, P_.ink); rect(g, s.x - w / 2, s.y + 3, w * pr, 2, P_.yel); }
  }
  for (const n of G.npcs) {
    const y = n.sp === 'parrot' ? n.rz : visY(n), s = project(n.x, y + (n.sp === 'gorilla' ? 4.2 : n.sp === 'parrot' ? 1 : 3), n.y);
    if (n.sp === 'chimp' && n.bond >= 50) pxText(g, '♥', s.x, s.y, P_.pink, 8);
    else if (n.sp === 'chimp' && n.want && Math.floor(T * 2) % 2) pxText(g, '?', s.x, s.y, P_.yel, 8);
    if (n.sp === 'gorilla' && n.state === 'chase') pxText(g, '!', s.x, s.y, P_.red, 10);
    if (n.sp === 'parrot' && n.say && n.sayT > 0) pxText(g, n.say, s.x, s.y, P_.white, 7);
  }
  const k = G.keeper; if (k) { const s = project(k.x, visY(k) + 4.4, k.y); if (k.state === 'chase') pxText(g, '!', s.x, s.y, P_.red, 11); else if (k.state === 'suspicious') pxText(g, '?', s.x, s.y, P_.yel, 11); else if (k.state === 'stunned') pxText(g, '*', s.x, s.y, P_.yel, 11); else if (k.state === 'sleep') pxText(g, 'Zz', s.x + Math.sin(T * 2) * 3, s.y - (T * 6 % 6), P_.white, 9); }
  for (const v of G.vis) if (v.emo && v.a > .5) { const s = project(v.x, 4.2, v.y); g.globalAlpha = Math.min(1, v.emo.t); pxText(g, v.emo.s, s.x, s.y - (2 - v.emo.t) * 5, P_.white, 8); g.globalAlpha = 1; }
  for (const o of G.W.objs) if (o.type === 'dig' && !o.dug && G.me && Math.hypot(G.me.x - o.x, G.me.y - o.y) < 4.5 && Math.floor(T * 2.5) % 2) { const s = project(o.x, groundSmooth(o.x, o.y) + .3, o.y); rect(g, s.x, s.y - 3, 1, 1, P_.yel); rect(g, s.x - 1, s.y - 2, 3, 1, P_.white); rect(g, s.x, s.y - 1, 1, 1, P_.yel); }
  if (G.gateOpen && Math.floor(T * 3) % 2) { const s = project(N + 1.5, 4, G.W.gate.y + .5); pxText(g, '> БЕГИ! >', s.x, s.y, P_.yel, 8); }
  drawParts();
  for (const f of G.floaters) { const a = clamp(1.6 - f.t, 0, 1); g.globalAlpha = a; const s = project(f.x, f.z, f.y); pxText(g, f.text, s.x, s.y - 14 - f.t * 14, f.col, 8); g.globalAlpha = 1; }
  drawTutArrows(); drawAim();
}

// ── частицы (пиксельные, поверх) ──
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
    const gz = groundSmooth(q.x, q.y); if (q.z < gz) { q.z = gz; q.vz *= -.25; q.vx *= .6; q.vy *= .6; }
  }
}
function drawParts() {
  for (const q of G.parts) {
    const s = project(q.x, q.z, q.y), x = Math.round(s.x), y = Math.round(s.y), k = q.t / q.life; g.globalAlpha = clamp(1.4 - k * 1.4, 0, 1);
    if (q.kind === 'star') { for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) px(g, x + dx, y + dy, q.col); }
    else if (q.kind === 'dust') rect(g, x, y, 2, 2, 'rgb(214,190,140)');
    else rect(g, x, y, q.size, q.size, q.col);
    g.globalAlpha = 1;
  }
}
// ── прицел и траектория ──
function drawAim() {
  const m = G.mouse; if (!m.in || G.state !== 'play') return;
  const tool = TOOLS[G.tool];
  if (tool && tool.throwable && G.me && !G.me.act && !G.mini) {
    const sol = solveThrow(G.me, G.aim, tool.range);
    if (sol) { g.globalAlpha = .8; for (let t = .06; t < sol.T; t += .06) { const q = throwPos(G.me, sol, t), s = project(q.x, q.z, q.y); rect(g, Math.round(s.x), Math.round(s.y), 1, 1, P_.white); } g.globalAlpha = 1; }
  }
  const x = Math.round(m.x), y = Math.round(m.y), c = (tool && tool.ok && !tool.ok()) ? P_.red : G.aim && G.aim.ent ? P_.yel : P_.white;
  g.fillStyle = P_.ink; for (const [dx, dy] of [[-4, 0], [4, 0], [0, -4], [0, 4]]) g.fillRect(x + dx - 1, y + dy - 1, 3, 3);
  g.fillStyle = c; for (const [dx, dy] of [[-4, 0], [-3, 0], [3, 0], [4, 0], [0, -4], [0, -3], [0, 3], [0, 4]]) g.fillRect(x + dx, y + dy, 1, 1);
  g.fillRect(x, y, 1, 1);
}
function drawTutArrows() {
  if (!G.tut || typeof tutTargets !== 'function') return;
  for (const t of tutTargets()) {
    const s = project(t.x, (t.z || 0), t.y), x = Math.round(s.x), y = Math.round(s.y) - (t.h || 30) - 6 + Math.round(Math.sin(G.t * 6) * 2);
    polyP(g, [[x, y + 6], [x - 5, y - 2], [x - 2, y - 2], [x - 2, y - 8], [x + 2, y - 8], [x + 2, y - 2], [x + 5, y - 2]], P_.yel);
    lineP(g, x, y + 7, x - 5, y - 1, P_.ink); lineP(g, x, y + 7, x + 5, y - 1, P_.ink);
  }
}
// ── курсор мыши → точка на земле ──
function screenToWorld(mx, my) {
  if (!G.W) return { x: 0, y: 0, z: 0 };
  const o = new T3.Vector3(mx / VW * 2 - 1, -(my / VH * 2 - 1), -1).unproject(camera), d = camera.getWorldDirection(new T3.Vector3());
  const gAt = (x, y) => groundSmooth(x, y) * LV;
  let t = 0, prev = 0;
  for (; t < 150; t += .1) { const px = o.x + d.x * t, py = o.y + d.y * t, pz = o.z + d.z * t; if (py <= gAt(px, pz)) break; prev = t; }
  let lo = prev, hi = t; for (let i = 0; i < 8; i++) { const m = (lo + hi) / 2, py = o.y + d.y * m; if (py <= gAt(o.x + d.x * m, o.z + d.z * m)) hi = m; else lo = m; }
  const x = o.x + d.x * hi, y = o.z + d.z * hi;
  return { x, y, z: (x >= 0 && y >= 0 && x < N && y < N) ? groundAt(G.W, x, y) : 0 };
}
