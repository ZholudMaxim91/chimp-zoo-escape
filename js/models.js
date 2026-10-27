'use strict';
// ───────── 3D-модели (низкополигональные), которые потом рисуются в пиксельном стиле ─────────
// Единицы: 1 клетка = 1, высота одного яруса = LV.
const LV = 0.41;
const T3 = THREE;

// ── общие геометрии ──
const GEO = {
  box: new T3.BoxGeometry(1, 1, 1),
  sph: new T3.IcosahedronGeometry(1, 1),
  sph2: new T3.IcosahedronGeometry(1, 2),
  cyl: new T3.CylinderGeometry(1, 1, 1, 8, 1),
  cyl6: new T3.CylinderGeometry(1, 1, 1, 6, 1),
  cylT: new T3.CylinderGeometry(.7, 1, 1, 7, 1),      // сужающийся цилиндр
  cone: new T3.ConeGeometry(1, 1, 8, 1),
  cone5: new T3.ConeGeometry(1, 1, 5, 1),
  tor: new T3.TorusGeometry(1, .38, 6, 14),
  plane: new T3.PlaneGeometry(1, 1),
};
const NONIDX = new Map();
const nonIdx = g => { let r = NONIDX.get(g); if (!r) { r = g.index ? g.toNonIndexed() : g; r.computeVertexNormals(); NONIDX.set(g, r); } return r; };
const h3 = (x, y, z, s = 0) => { const v = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + s * 19.19) * 43758.5453; return v - Math.floor(v); };
const _m4 = new T3.Matrix4(), _q = new T3.Quaternion(), _e = new T3.Euler(), _p = new T3.Vector3(), _s = new T3.Vector3();
function M(x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
  _e.set(rx, ry, rz); _q.setFromEuler(_e); _p.set(x, y, z); _s.set(sx, sy, sz); return new T3.Matrix4().compose(_p, _q, _s);
}

// ── «текстура» на поверхности: мелкий шум в цвете по мировым координатам ──
function addDetail(m, amt = .12, scale = 24) {
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;\nfloat dh(vec3 p){return fract(sin(dot(floor(p),vec3(12.9898,78.233,37.719)))*43758.5453);}')
      .replace('#include <color_fragment>', `#include <color_fragment>\n diffuseColor.rgb *= 1.0 + (dh(vWP*${scale.toFixed(1)})-0.5)*${amt.toFixed(3)};`);
  };
  return m;
}
const MATS = new Map();
function mat(hex, opts = {}) {
  const key = hex + JSON.stringify(opts); let m = MATS.get(key);
  if (!m) { m = addDetail(new T3.MeshStandardMaterial(Object.assign({ color: hex, roughness: .9, metalness: 0, flatShading: true }, opts)), opts.emissive ? 0 : .1); MATS.set(key, m); }
  return m;
}
const VCMAT = addDetail(new T3.MeshStandardMaterial({ vertexColors: true, roughness: .92, metalness: 0, flatShading: true }), .06);

// ── сборщик статичной сцены: много мелких деталей → одна сетка (быстро рисуется) ──
class MB {
  constructor() { this.p = []; this.n = []; this.c = []; }
  add(geo, m, color, vari = .07, seed = 0, deform = 0) {
    const g = nonIdx(geo), pa = g.attributes.position, na = g.attributes.normal, nm = new T3.Matrix3().getNormalMatrix(m);
    const v = new T3.Vector3(), nn = new T3.Vector3(), col = new T3.Color(color);
    for (let i = 0; i < pa.count; i++) {
      v.fromBufferAttribute(pa, i);
      if (deform) v.multiplyScalar(1 + (h3(v.x, v.y, v.z, seed) - .5) * deform);
      v.applyMatrix4(m); nn.fromBufferAttribute(na, i).applyMatrix3(nm).normalize();
      this.p.push(v.x, v.y, v.z); this.n.push(nn.x, nn.y, nn.z);
      const k = 1 + (h3(Math.floor(i / 3), seed, 7) - .5) * 2 * vari;
      this.c.push(col.r * k, col.g * k, col.b * k);
    }
    return this;
  }
  get empty() { return this.p.length === 0; }
  build(material = VCMAT) {
    const g = new T3.BufferGeometry();
    g.setAttribute('position', new T3.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new T3.Float32BufferAttribute(this.n, 3)); g.setAttribute('color', new T3.Float32BufferAttribute(this.c, 3));
    const m = new T3.Mesh(g, material); m.castShadow = true; m.receiveShadow = true; return m;
  }
}
// отдельная деталь (для подвижных частей)
function part(geo, hex, pos, scl, rot, opts) {
  const m = new T3.Mesh(geo, mat(hex, opts)); if (pos) m.position.set(...pos); if (scl) m.scale.set(...scl); if (rot) m.rotation.set(...rot);
  m.castShadow = true; m.receiveShadow = true; return m;
}
const grp = (x = 0, y = 0, z = 0) => { const g = new T3.Group(); g.position.set(x, y, z); return g; };
// конечность: шарнир сверху, сама «палка» свисает вниз
function limb(len, r, hex, geo = GEO.cyl) { const j = new T3.Group(); j.add(part(geo, hex, [0, -len / 2, 0], [r, len, r])); return j; }
function canvasTex(w, h, draw) { const c = mkCanvas(w, h), x = c.getContext('2d'); draw(x, c); const t = new T3.CanvasTexture(c); t.magFilter = T3.NearestFilter; t.minFilter = T3.NearestFilter; return t; }

// ───────── Палитры персонажей ─────────
const FUR = {
  brown: { id: 'brown', m: '#3d2a1c', d: '#22160e', l: '#5e4430', s: '#c9a07c', face: '#dcb48c' },
  ginger: { id: 'ginger', m: '#7a4424', d: '#4a2410', l: '#a8683c', s: '#d8a682', face: '#ecc4a0' },
  dark: { id: 'dark', m: '#241a14', d: '#120c08', l: '#3e2e22', s: '#a07a5a', face: '#8a6a52' },
  grey: { id: 'grey', m: '#3c3c4a', d: '#22222c', l: '#7a7a90', s: '#4a4a58', face: '#2e2e3a' },
  monkey: { id: 'monkey', m: '#8a7a5a', d: '#5a4a32', l: '#c0b08a', s: '#3a2e22', face: '#4a3a2c' },
  silver: { id: 'silver', m: '#3a3a44', d: '#1c1c22', l: '#9a9aae', s: '#54545e', face: '#2a2a32' },
};

// ───────── Обезьяна (шимпанзе / горилла / мартышка) ─────────
function makeApe(F, kind = 'chimp') {
  const big = kind === 'gorilla', S = big ? 1.55 : kind === 'monkey' ? .62 : 1;
  const root = new T3.Group(), body = grp(); root.add(body); body.scale.setScalar(S);
  const hips = grp(0, .42, 0); body.add(hips);
  const torso = grp(); hips.add(torso);
  torso.add(part(GEO.sph2, F.m, [0, .3, 0], [big ? .34 : .24, .34, big ? .27 : .19]));
  torso.add(part(GEO.sph2, F.m, [0, .42, .01], [big ? .4 : .28, .18, big ? .28 : .2]));
  torso.add(part(GEO.sph, F.d, [0, .1, 0], [big ? .26 : .17, .12, big ? .22 : .15]));
  torso.add(part(GEO.sph, big ? F.d : F.l, [0, .26, .12], [.14, .2, .08]));
  if (big) torso.add(part(GEO.sph, '#9a9aae', [0, .3, -.12], [.24, .22, .1]));        // серебристая спина
  const neck = grp(0, .55, .04); torso.add(neck); const head = grp(); neck.add(head);
  head.add(part(GEO.sph2, F.m, [0, .13, -.02], [.165, .17, .16]));
  head.add(part(GEO.sph, F.face, [0, .11, .1], [.125, .13, .09]));
  head.add(part(GEO.sph, F.face, [0, .035, .17], [.1, .08, .1]));
  const mouth = part(GEO.box, '#3a1410', [0, .02, .235], [.08, .014, .02]); head.add(mouth);
  for (const s of [-1, 1]) {
    head.add(part(GEO.sph, '#141010', [s * .056, .135, .19], [.024, .024, .02]));
    head.add(part(GEO.sph, '#ffffff', [s * .05, .142, .205], [.007, .007, .005]));
    head.add(part(GEO.sph, F.s, [s * .175, .13, 0], [.07, .085, .03]));
  }
  head.add(part(GEO.box, F.d, [0, .175, .165], [.17, .035, .045]));
  head.add(part(GEO.cone, F.d, [0, .31, -.02], [.05, .08, .05]));
  const j = { body, hips, torso, neck, head, mouth };
  for (const [s, n] of [[-1, 'L'], [1, 'R']]) {
    const sh = grp(s * .25, .46, 0); torso.add(sh);
    const up = limb(.33, big ? .1 : .065, F.m); sh.add(up);
    const el = grp(0, -.31, 0); up.add(el);
    const fo = limb(.32, big ? .09 : .056, F.m); el.add(fo);
    fo.add(part(GEO.sph, F.s, [0, -.33, .02], [.075, .07, .085]));
    const hip = grp(s * .12, 0, 0); hips.add(hip);
    const th = limb(.22, .085, F.m); hip.add(th);
    const kn = grp(0, -.22, 0); th.add(kn);
    const sn = limb(.2, .07, F.m); kn.add(sn);
    sn.add(part(GEO.box, F.s, [0, -.215, .05], [.1, .05, .17]));
    j['sh' + n] = sh; j['up' + n] = up; j['el' + n] = el; j['hip' + n] = hip; j['th' + n] = th; j['kn' + n] = kn;
  }
  const hold = part(GEO.sph, '#5a3a1a', [0, -.36, .05], [.07, .065, .07]); hold.visible = false; j.elR.children[0].add(hold); j.hold = hold;
  const holdB = part(GEO.sph, '#ffd23a', [0, -.38, .06], [.035, .035, .12], [.4, 0, 0]); holdB.visible = false; j.elL.children[0].add(holdB); j.holdB = holdB;
  const hand = j.elR.children[0], P = {};
  P.banana = part(GEO.sph, '#ffd23a', [0, -.37, .08], [.035, .035, .13], [.5, 0, .3]);
  P.stick = part(GEO.cyl, '#8a6238', [0, -.36, .18], [.018, .55, .018], [1.25, 0, 0]);
  P.stone = part(GEO.sph, '#9a9aa4', [0, -.37, .05], [.075, .06, .07]);
  P.coconut = part(GEO.sph2, '#5a3a1e', [0, -.39, .06], [.1, .11, .1]);
  P.nut = part(GEO.sph, '#a07040', [0, -.36, .05], [.045, .045, .045]);
  P.vine = new T3.Group(); for (let i = 0; i < 5; i++) P.vine.add(part(GEO.cyl, i % 2 ? '#4e7a2a' : '#5e8a32', [Math.sin(i * .6) * .08 * i, -.36 - i * .12, .05 + i * .04], [.022, .14, .022], [.2 + i * .15, 0, Math.sin(i) * .3]));
  P.poop = hold; P.mega = hold;
  for (const k in P) { if (P[k] !== hold) { P[k].visible = false; hand.add(P[k]); } }
  j.props = P;
  return { root, j, kind };
}
// ───────── Человек (смотритель / посетитель) ─────────
function makeHuman(o) {
  const root = new T3.Group(), body = grp(); root.add(body); body.scale.setScalar(o.kid ? .74 : 1);
  const hips = grp(0, .62, 0); body.add(hips);
  const torso = grp(); hips.add(torso);
  torso.add(part(GEO.box, o.shirt, [0, .26, 0], [.36, .5, .2]));
  if (o.belt) { torso.add(part(GEO.box, '#3a2410', [0, .03, 0], [.37, .06, .21])); o.keyMesh = part(GEO.box, '#ffd23a', [.12, .02, .12], [.05, .07, .02]); torso.add(o.keyMesh); }
  const neck = grp(0, .52, 0); torso.add(neck); const head = grp(); neck.add(head);
  head.add(part(GEO.sph2, o.skin, [0, .14, 0], [.14, .16, .14]));
  for (const s of [-1, 1]) head.add(part(GEO.sph, '#1a1416', [s * .05, .16, .13], [.018, .022, .01]));
  const mouth = part(GEO.box, '#7a3030', [0, .08, .135], [.05, .012, .01]); head.add(mouth);
  const hat = [];
  if (o.hat === 'cap') { hat.push(part(GEO.cyl, o.capCol, [0, .26, 0], [.15, .08, .15]), part(GEO.box, o.capCol2, [0, .23, .14], [.24, .025, .14])); }
  else if (o.hat === 'sun') { hat.push(part(GEO.cyl, '#e0c070', [0, .25, 0], [.25, .02, .25]), part(GEO.cyl, '#e8c97a', [0, .3, 0], [.12, .1, .12])); }
  if (hat.length) { hat.forEach(m => head.add(m)); hat.push(part(GEO.sph, o.hair || '#4a3020', [0, .2, -.02], [.145, .1, .145])); head.add(hat[hat.length - 1]); hat[hat.length - 1].visible = false; }
  else head.add(part(GEO.sph, o.hair, [0, .2, -.02], [.15, .11, .15]));
  const must = part(GEO.box, '#2a1a0e', [0, .105, .14], [.11, .022, .012]); must.visible = false; head.add(must);
  const j = { body, hips, torso, neck, head, mouth, hat, must };
  for (const [s, n] of [[-1, 'L'], [1, 'R']]) {
    const sh = grp(s * .23, .47, 0); torso.add(sh);
    const up = limb(.27, .055, o.shirt); sh.add(up); const el = grp(0, -.27, 0); up.add(el);
    const fo = limb(.25, .048, o.sleeve || o.skin); el.add(fo); fo.add(part(GEO.sph, o.skin, [0, -.27, 0], [.05, .055, .05]));
    const hip = grp(s * .1, 0, 0); hips.add(hip);
    const th = limb(.32, .075, o.pants); hip.add(th); const kn = grp(0, -.32, 0); th.add(kn);
    const sn = limb(.28, .065, o.pants); kn.add(sn); sn.add(part(GEO.box, o.shoes, [0, -.3, .04], [.1, .07, .2]));
    j['sh' + n] = sh; j['el' + n] = el; j['hip' + n] = hip; j['kn' + n] = kn;
  }
  if (o.belt) { j.bucket = new T3.Group(); j.bucket.add(part(GEO.cylT, '#8a8a96', [0, -.34, 0], [.11, .16, .11], [Math.PI, 0, 0])); j.bucket.add(part(GEO.sph, '#ffd23a', [0, -.27, 0], [.08, .04, .08])); j.bucket.visible = false; j.elL.children[0].add(j.bucket); }
  if (o.phone) { j.phone = part(GEO.box, '#111', [0, -.3, .04], [.05, .09, .015]); j.elR.children[0].add(j.phone); j.phone.visible = false; }
  return { root, j, kind: 'human' };
}
function makeParrot(col) {
  const root = new T3.Group(), body = grp(); root.add(body);
  body.add(part(GEO.sph2, col, [0, .18, 0], [.09, .13, .1], [.4, 0, 0]));
  const head = grp(0, .32, .05); body.add(head);
  head.add(part(GEO.sph, col, [0, 0, 0], [.075, .075, .075]));
  head.add(part(GEO.cone, '#f0a030', [0, -.01, .09], [.03, .07, .03], [1.6, 0, 0]));
  for (const s of [-1, 1]) head.add(part(GEO.sph, '#ffffff', [s * .045, .02, .04], [.022, .022, .015]));
  body.add(part(GEO.box, '#3f6fd0', [0, .06, -.14], [.06, .025, .2], [-.5, 0, 0]));
  const wings = [];
  for (const s of [-1, 1]) { const w = grp(s * .07, .22, 0); w.add(part(GEO.box, '#3f6fd0', [s * .13, 0, 0], [.26, .02, .12])); body.add(w); wings.push(w); }
  return { root, j: { body, head, wings }, kind: 'parrot' };
}
function makeTortoise() {
  const root = new T3.Group(), body = grp(); root.add(body);
  const mb = new MB();
  mb.add(GEO.sph2, M(0, .16, 0, .42, .26, .52), '#4f7a32', .22, 3, .1);
  mb.add(GEO.cyl, M(0, .1, 0, .46, .06, .56), '#3a5a24', .1);
  const shell = mb.build(); body.add(shell);
  const head = grp(0, .14, .5); body.add(head); head.add(part(GEO.sph, '#8aaa4a', [0, 0, .06], [.09, .08, .11]));
  head.add(part(GEO.sph, '#111', [.05, .03, .12], [.015, .015, .015])); head.add(part(GEO.sph, '#111', [-.05, .03, .12], [.015, .015, .015]));
  const legs = [];
  for (const [x, z] of [[-.3, .3], [.3, .3], [-.3, -.3], [.3, -.3]]) { const l = grp(x, .1, z); l.add(part(GEO.cyl, '#6a8a3a', [0, -.05, 0], [.07, .14, .07])); body.add(l); legs.push(l); }
  return { root, j: { body, head, legs }, kind: 'tortoise' };
}

// ───────── Позы и анимации (процедурные, кадровые) ─────────
const ZERO_KEYS = ['hips', 'torso', 'neck', 'head', 'shL', 'shR', 'elL', 'elR', 'hipL', 'hipR', 'knL', 'knR'];
function resetPose(j) { for (const k of ZERO_KEYS) if (j[k]) j[k].rotation.set(0, 0, 0); if (j.mouth) j.mouth.scale.y = j.mouth.userData.sy || (j.mouth.userData.sy = j.mouth.scale.y); }
// st: {move:0|1|2 (стоит/идёт/бежит), crouch, air, act, actP (0..1), t}
function poseApe(r, st) {
  const j = r.j, t = st.t; resetPose(j); j.hold.visible = false; j.holdB.visible = !!st.carry; j.body.rotation.z = 0; j.body.rotation.y = 0; j.body.rotation.x = 0; j.body.position.y = 0; j.hips.rotation.x = 0;
  if (j.props) { for (const k in j.props) j.props[k].visible = false; const pr = j.props[st.prop]; if (pr) { pr.visible = true; if (st.prop === 'poop' || st.prop === 'mega') pr.scale.set(.07 * (st.prop === 'mega' ? 2.4 : 1), .065 * (st.prop === 'mega' ? 2.4 : 1), .07 * (st.prop === 'mega' ? 2.4 : 1)); } }
  let hipsY = .42;
  if (st.move && !st.act) {          // ходьба на костяшках (четвероногая)
    const ph = t * (st.move === 2 ? 12 : 7.5), s = Math.sin(ph), c = Math.cos(ph);
    j.torso.rotation.x = st.move === 2 ? 1.15 : 1.0; j.neck.rotation.x = -.95;
    j.shL.rotation.x = -1.0 + .5 * s; j.shR.rotation.x = -1.0 - .5 * s;
    j.elL.rotation.x = -.15 - Math.max(0, -s) * .3; j.elR.rotation.x = -.15 - Math.max(0, s) * .3;
    j.hipL.rotation.x = -.55 * s - .2; j.hipR.rotation.x = .55 * s - .2;
    j.knL.rotation.x = .25 + Math.max(0, s) * .6; j.knR.rotation.x = .25 + Math.max(0, -s) * .6;
    hipsY = .38 + Math.abs(c) * .035; j.torso.rotation.z = s * .05;
  } else {
    // стойка: полусидя, руки свисают
    j.torso.rotation.x = .35 + Math.sin(t * 2.2) * .025; j.neck.rotation.x = -.3;
    j.shL.rotation.x = -.45; j.shR.rotation.x = -.45; j.shL.rotation.z = -.12; j.shR.rotation.z = .12;
    j.elL.rotation.x = -.2; j.elR.rotation.x = -.2;
    j.hipL.rotation.x = -.45; j.hipR.rotation.x = -.45; j.knL.rotation.x = .7; j.knR.rotation.x = .7; hipsY = .36;
    j.head.rotation.y = Math.sin(t * .7) * .25;
  }
  if (st.crouch && !st.act) { hipsY = .26; j.torso.rotation.x = .85; j.knL.rotation.x = j.knR.rotation.x = 1.3; j.hipL.rotation.x = j.hipR.rotation.x = -1.0; }
  if (st.air) {
    if ((st.vz || 0) > 1.5) { j.shL.rotation.x = j.shR.rotation.x = -2.7; j.hipL.rotation.x = j.hipR.rotation.x = -1.1; j.knL.rotation.x = j.knR.rotation.x = 1.6; j.torso.rotation.x = .3; }        // взлёт: поджался
    else { j.shL.rotation.x = j.shR.rotation.x = -1.6; j.shL.rotation.z = -1.1; j.shR.rotation.z = 1.1; j.hipL.rotation.x = -.5; j.hipR.rotation.x = -.1; j.knL.rotation.x = .5; j.knR.rotation.x = .2; j.torso.rotation.x = .05; }   // падение: руки в стороны
  }
  if (st.land > 0 && !st.act) { hipsY = .26; j.torso.rotation.x = .9; j.knL.rotation.x = j.knR.rotation.x = 1.4; j.hipL.rotation.x = j.hipR.rotation.x = -1.1; j.shL.rotation.x = j.shR.rotation.x = -.9; }
  if (!st.move && !st.act && !st.air && (t % 9) > 7.4) { j.shR.rotation.x = -2.6; j.shR.rotation.z = .9; j.elR.rotation.x = -1.6 + Math.sin(t * 22) * .2; j.head.rotation.z = -.2; }   // почёсывается
  const a = st.act, p = st.actP || 0;
  if (a === 'pick') {          // тянется вверх и срывает
    const k = clamp(st.actP || 0, 0, 1), up = k < .6;
    j.torso.rotation.x = -.15; j.shR.rotation.x = up ? -3.0 : -1.5; j.elR.rotation.x = up ? -.1 : -1.2; j.shL.rotation.x = -2.6; j.hips.position.y = .44; hipsY = .46 + (up ? .06 : 0);
    if (!up && j.props && j.props[st.prop]) j.props[st.prop].visible = true; else if (j.props && j.props[st.prop]) j.props[st.prop].visible = false;
  } else if (a === 'shake') {    // обхватил ствол и трясёт
    const w = Math.sin(t * 30); j.torso.rotation.x = .3; j.shL.rotation.x = j.shR.rotation.x = -1.9; j.shL.rotation.z = .4; j.shR.rotation.z = -.4; j.elL.rotation.x = j.elR.rotation.x = -.6; j.body.rotation.z = w * .06; j.hipL.rotation.x = -.3; j.hipR.rotation.x = .2; j.mouth.scale.y = j.mouth.userData.sy * 2;
  } else if (a === 'grab') {     // нагнулся, подобрал, выпрямился с предметом
    const k = clamp(st.actP || 0, 0, 1), down = k < .55;
    j.torso.rotation.x = down ? 1.2 : .4; j.neck.rotation.x = down ? -.7 : -.2; j.shR.rotation.x = down ? -1.1 : -1.7; j.elR.rotation.x = down ? -.1 : -1.0; j.knL.rotation.x = j.knR.rotation.x = down ? 1.0 : .5; j.hipL.rotation.x = j.hipR.rotation.x = down ? -.8 : -.4; hipsY = down ? .32 : .38;
    if (j.props && j.props[st.prop]) j.props[st.prop].visible = !down;
  } else if (a === 'fish') {     // сунул палку в термитник, потом облизывает
    const w = Math.sin(t * 9), lick = (t % 2.4) > 1.9;
    j.torso.rotation.x = .9; j.neck.rotation.x = -.6; j.hipL.rotation.x = j.hipR.rotation.x = -1.1; j.knL.rotation.x = j.knR.rotation.x = 1.4; hipsY = .28;
    if (lick) { j.shR.rotation.x = -1.7; j.elR.rotation.x = -1.9; j.mouth.scale.y = j.mouth.userData.sy * 2.5; } else { j.shR.rotation.x = -1.2 + w * .15; j.elR.rotation.x = -.15; }
    j.shL.rotation.x = -.9; if (j.props) j.props.stick.visible = true;
  } else if (a === 'crack') {    // бьёт камнем по ореху/кокосу
    const w = Math.abs(Math.sin(t * 7)); j.torso.rotation.x = .75; j.neck.rotation.x = -.5; j.hipL.rotation.x = j.hipR.rotation.x = -1.2; j.knL.rotation.x = j.knR.rotation.x = 1.5; hipsY = .27;
    j.shR.rotation.x = -2.4 + w * 1.5; j.elR.rotation.x = -.4; j.shL.rotation.x = -1.1; j.elL.rotation.x = -.3; if (j.props) j.props.stone.visible = true;
  } else if (a === 'drum') {
    const w = Math.sin(t * 16); j.torso.rotation.x = .45; j.shL.rotation.x = -1.6 + w * .6; j.shR.rotation.x = -1.6 - w * .6; j.elL.rotation.x = j.elR.rotation.x = -.5; j.mouth.scale.y = j.mouth.userData.sy * 2; hipsY = .34;
  } else if (a === 'puzzle') {
    const w = Math.sin(t * 10); j.torso.rotation.x = .6; j.neck.rotation.x = -.4; j.shL.rotation.x = -1.3 + w * .15; j.shR.rotation.x = -1.3 - w * .15; j.elL.rotation.x = j.elR.rotation.x = -.9; j.head.rotation.z = Math.sin(t * 2) * .2; hipsY = .3; j.knL.rotation.x = j.knR.rotation.x = 1.3; j.hipL.rotation.x = j.hipR.rotation.x = -1;
  } else if (a === 'drink') {    // присел, пьёт из ладоней
    const w = (t % 1.2) > .6; j.torso.rotation.x = 1.1; j.neck.rotation.x = -.3; j.hipL.rotation.x = j.hipR.rotation.x = -1.3; j.knL.rotation.x = j.knR.rotation.x = 1.6; hipsY = .25;
    j.shL.rotation.x = j.shR.rotation.x = w ? -1.9 : -.9; j.elL.rotation.x = j.elR.rotation.x = w ? -1.6 : -.2; j.shL.rotation.z = .3; j.shR.rotation.z = -.3;
  } else if (a === 'roll') {     // кувырок через голову
    const k = clamp(st.actP || 0, 0, 1); j.hips.rotation.x = k * Math.PI * 2; hipsY = .32; j.torso.rotation.x = 1.2; j.neck.rotation.x = .6; j.hipL.rotation.x = j.hipR.rotation.x = -1.6; j.knL.rotation.x = j.knR.rotation.x = 2.0; j.shL.rotation.x = j.shR.rotation.x = -1.6; j.elL.rotation.x = j.elR.rotation.x = -1.4;
  } else if (a === 'vineSwing') { // висит на одной руке, ноги болтаются
    const w = Math.sin(t * 3); j.shR.rotation.x = -3.1; j.elR.rotation.x = 0; j.shL.rotation.x = -1.4 + w * .3; j.shL.rotation.z = -.9; j.torso.rotation.x = -.1 + w * .1; j.hipL.rotation.x = -.4 + w * .4; j.hipR.rotation.x = -.4 - w * .4; j.knL.rotation.x = j.knR.rotation.x = .6; hipsY = .42; j.mouth.scale.y = j.mouth.userData.sy * 1.8;
  } else if (a === 'throw') {
    j.torso.rotation.x = .15; j.torso.rotation.y = p < .5 ? .5 : -.4;
    j.shR.rotation.x = p < .5 ? -2.9 : -1.3; j.elR.rotation.x = p < .5 ? -1.2 : -.1; j.shL.rotation.x = -.8; j.hold.visible = false; if (j.props) { const pr = j.props[st.prop || 'poop']; if (pr) pr.visible = p < .5; }
  } else if (a === 'eat' || a === 'drink') {
    j.torso.rotation.x = .3; j.shR.rotation.x = -1.6; j.elR.rotation.x = -1.9; j.shR.rotation.z = -.35; j.neck.rotation.x = -.2 + Math.sin(t * 14) * .08;
    j.mouth.scale.y = j.mouth.userData.sy * (1.6 + Math.sin(t * 14) * .8);
  } else if (a === 'up' || a === 'climb' || a === 'swing' || a === 'ladder' || a === 'vine') {
    const w = Math.sin(t * 9);
    j.torso.rotation.x = -.05; j.shL.rotation.x = -2.9 + w * .25; j.shR.rotation.x = -2.9 - w * .25;
    j.hipL.rotation.x = -.4 + w * .3; j.hipR.rotation.x = -.4 - w * .3; j.knL.rotation.x = j.knR.rotation.x = .6; hipsY = .42 + Math.abs(w) * .05;
  } else if (a === 'show' || a === 'drum') {
    const w = Math.sin(t * 11);
    j.torso.rotation.x = .1; j.hips.rotation.y = w * .4; j.shL.rotation.x = -2.4 + w * .6; j.shR.rotation.x = -2.4 - w * .6; j.shL.rotation.z = -.5; j.shR.rotation.z = .5;
    j.mouth.scale.y = j.mouth.userData.sy * 2.5; hipsY = .4 + Math.abs(w) * .08;
  } else if (a === 'push') {
    const w = Math.sin(t * 8); j.torso.rotation.x = .9; j.neck.rotation.x = -.7; j.shL.rotation.x = j.shR.rotation.x = -1.5 + w * .1; j.elL.rotation.x = j.elR.rotation.x = -.2; j.hipL.rotation.x = -.6 + w * .3; j.hipR.rotation.x = -.6 - w * .3; j.knL.rotation.x = j.knR.rotation.x = .6;
  } else if (a === 'whip') {
    j.torso.rotation.y = .5 - (st.actP || 0) * 1.2; j.shR.rotation.x = -2.8 + (st.actP || 0) * 2; j.shR.rotation.z = .4; j.elR.rotation.x = -.3; j.torso.rotation.x = .2;
  } else if (a === 'spin') {
    j.body.rotation.y = t * 14; j.shL.rotation.x = j.shR.rotation.x = -2.9; j.shL.rotation.z = -.4; j.shR.rotation.z = .4; j.torso.rotation.x = 0; hipsY = .42;
  } else if (a === 'sleep') {
    j.body.rotation.z = 1.45; j.body.position.y = .12; j.torso.rotation.x = .4; j.neck.rotation.x = .3; j.shL.rotation.x = j.shR.rotation.x = -1.2; j.elL.rotation.x = j.elR.rotation.x = -1.2; j.hipL.rotation.x = j.hipR.rotation.x = -1.3; j.knL.rotation.x = j.knR.rotation.x = 1.6; hipsY = .3; j.torso.scale.y = 1 + Math.sin(t * 1.6) * .03;
  } else if (a === 'groom') {
    const w = Math.sin(t * 7); j.torso.rotation.x = .55; j.neck.rotation.x = -.2; j.shL.rotation.x = -1.4 + w * .25; j.shR.rotation.x = -1.4 - w * .25; j.elL.rotation.x = j.elR.rotation.x = -.6; j.hipL.rotation.x = j.hipR.rotation.x = -1.2; j.knL.rotation.x = j.knR.rotation.x = 1.4; hipsY = .28; j.head.rotation.y = w * .2;
  } else if (a === 'pee') {
    j.torso.rotation.x = -.15; j.hips.rotation.x = -.2; j.shL.rotation.x = j.shR.rotation.x = -.3; j.shL.rotation.z = -.3; j.shR.rotation.z = .3; j.hipL.rotation.x = j.hipR.rotation.x = -.1; hipsY = .46; j.neck.rotation.x = -.1;
  } else if (a === 'hoot') {
    j.torso.rotation.x = -.15; j.neck.rotation.x = -.55; j.shL.rotation.x = -2.6; j.shR.rotation.x = -2.6; j.shL.rotation.z = -.6; j.shR.rotation.z = .6;
    j.mouth.scale.y = j.mouth.userData.sy * 5.5; hipsY = .44;
  } else if (a === 'beat') {
    const w = Math.sin(t * 16);
    j.torso.rotation.x = -.1; j.shL.rotation.x = -1.4 + w * .3; j.shR.rotation.x = -1.4 - w * .3; j.elL.rotation.x = j.elR.rotation.x = -1.6; j.shL.rotation.y = .6; j.shR.rotation.y = -.6; j.mouth.scale.y = j.mouth.userData.sy * 3;
  } else if (a === 'dig' || a === 'fish' || a === 'crack') {
    const w = Math.sin(t * 13);
    j.torso.rotation.x = 1.0; j.neck.rotation.x = -.6; j.shL.rotation.x = -1.6 + w * .35; j.shR.rotation.x = -1.6 - w * .35; j.elL.rotation.x = j.elR.rotation.x = -.4;
    j.hipL.rotation.x = j.hipR.rotation.x = -1.0; j.knL.rotation.x = j.knR.rotation.x = 1.4; hipsY = .28;
  } else if (a === 'stun') {
    j.torso.rotation.x = .6; j.torso.rotation.z = Math.sin(t * 20) * .2; j.head.rotation.y = t * 8; j.shL.rotation.x = j.shR.rotation.x = -.2;
  } else if (a === 'angry') { j.mouth.scale.y = j.mouth.userData.sy * 3.5; j.neck.rotation.x = -.3; }
  else if (a === 'happy') { j.mouth.scale.y = j.mouth.userData.sy * 2; j.head.rotation.z = Math.sin(t * 6) * .15; }
  j.hips.position.y = hipsY;
}
function poseHuman(r, st) {
  const j = r.j, t = st.t; resetPose(j);
  if (j.phone) j.phone.visible = false; if (j.bucket) j.bucket.visible = st.act === 'feed';
  if (st.move) {
    const ph = t * (st.move === 2 ? 11 : 7), s = Math.sin(ph);
    j.hipL.rotation.x = .55 * s; j.hipR.rotation.x = -.55 * s; j.knL.rotation.x = Math.max(0, -s) * .8; j.knR.rotation.x = Math.max(0, s) * .8;
    j.shL.rotation.x = -.5 * s; j.shR.rotation.x = .5 * s; j.elL.rotation.x = j.elR.rotation.x = -.3;
    j.hips.position.y = .62 + Math.abs(Math.cos(ph)) * .03; j.torso.rotation.x = st.move === 2 ? .2 : .05;
  } else { j.hips.position.y = .62; j.torso.rotation.x = Math.sin(t * 1.8) * .02; j.shL.rotation.z = -.08; j.shR.rotation.z = .08; j.head.rotation.y = Math.sin(t * .6 + (st.seed || 0)) * .4; }
  const a = st.act;
  if (a === 'alert') { j.shR.rotation.x = -1.55; j.neck.rotation.x = -.1; j.mouth.scale.y = j.mouth.userData.sy * 3; }
  else if (a === 'cheer') { const w = Math.sin(t * 10 + (st.seed || 0)); j.shL.rotation.x = -2.8 + w * .2; j.shR.rotation.x = -2.8 - w * .2; j.shL.rotation.z = -.3; j.shR.rotation.z = .3; j.mouth.scale.y = j.mouth.userData.sy * 4; j.hips.position.y = .62 + Math.abs(w) * .06; }
  else if (a === 'phone') { j.shR.rotation.x = -1.9; j.elR.rotation.x = -1.3; if (j.phone) j.phone.visible = true; }
  else if (a === 'scared') { j.shL.rotation.x = j.shR.rotation.x = -2.2; j.elL.rotation.x = j.elR.rotation.x = -1.6; j.torso.rotation.x = -.15; j.mouth.scale.y = j.mouth.userData.sy * 5; }
  else if (a === 'sleep') { j.hips.position.y = .32; j.hipL.rotation.x = j.hipR.rotation.x = -1.5; j.knL.rotation.x = j.knR.rotation.x = 1.5; j.torso.rotation.x = .45; j.neck.rotation.x = .7; j.shL.rotation.x = j.shR.rotation.x = -.6; j.elL.rotation.x = j.elR.rotation.x = -.8; j.head.rotation.z = Math.sin(t * 1.5) * .06; }
  else if (a === 'stun') { j.torso.rotation.x = .5; j.torso.rotation.z = Math.sin(t * 18) * .25; j.head.rotation.y = t * 6; j.hips.position.y = .45; j.knL.rotation.x = j.knR.rotation.x = 1.2; j.hipL.rotation.x = j.hipR.rotation.x = -1.2; }
}
function poseParrot(r, st) {
  const j = r.j, f = st.fly ? Math.sin(st.t * 22) * .9 : .15;
  j.wings[0].rotation.z = -f - (st.fly ? 0 : -1.1); j.wings[1].rotation.z = f + (st.fly ? 0 : -1.1);
  j.body.rotation.x = st.fly ? .5 : 0; j.head.rotation.y = st.fly ? 0 : Math.sin(st.t * 2) * .6;
}
function poseTortoise(r, st) {
  const j = r.j, s = st.move ? Math.sin(st.t * 5) : 0;
  j.legs.forEach((l, i) => l.rotation.x = (i % 3 === 0 ? s : -s) * .5);
  j.head.position.z = .5 + (st.hide ? -.2 : Math.sin(st.t * 1.3) * .02);
}

// ── питон: цепочка сегментов, поза задаётся каждый кадр
const PY_SEG = 14;
function makePython() {
  const root = new T3.Group(), segs = [];
  for (let i = 0; i < PY_SEG; i++) {
    const k = i / (PY_SEG - 1), r = .12 * (1 - k * .55);
    const g = new T3.Group(); g.add(part(GEO.sph2, i % 3 === 1 ? '#c8a848' : i % 2 ? '#6b7a2a' : '#7e8c34', null, [r, r * .85, r * 1.35]));
    if (i % 3 === 0) g.add(part(GEO.sph, '#3a3a1a', [r * .55, r * .35, 0], [r * .45, r * .3, r * .6]));
    root.add(g); segs.push(g);
  }
  const head = new T3.Group();
  head.add(part(GEO.sph2, '#7e8c34', [0, 0, .06], [.1, .075, .15]));
  for (const s of [-1, 1]) { head.add(part(GEO.sph, '#f0d040', [s * .06, .035, .1], [.022, .022, .022])); head.add(part(GEO.box, '#141010', [s * .065, .036, .108], [.006, .02, .01])); }
  const tongue = part(GEO.box, '#d23040', [0, -.01, .24], [.012, .006, .08]); head.add(tongue);
  root.add(head);
  return { root, j: {}, segs, head, tongue, kind: 'python' };
}
// mode: ground | held | spin | fly | coil
function posePython(r, o) {
  const t = o.t, S = r.segs, L = .155; let pts = [];
  if (o.mode === 'held') for (let i = 0; i < PY_SEG; i++) { const f = i / (PY_SEG - 1); pts.push([(f - .5) * 1.5, 1.05 + Math.sin(f * 3.1) * .25 + Math.sin(t * 5 + i * .6) * .05, .12 + Math.cos(t * 3 + i * .5) * .08]); }
  else if (o.mode === 'spin') { const a = t * 15; for (let i = 0; i < PY_SEG; i++) { const rr = .12 + i * .12; pts.push([Math.cos(a - i * .06) * rr, 1.3 + i * .012, Math.sin(a - i * .06) * rr]); } pts.reverse(); }
  else if (o.mode === 'coil') for (let i = 0; i < PY_SEG; i++) { const a = i * 1.05 + t * .8; pts.push([Math.cos(a) * .3, .95 - i * .06, Math.sin(a) * .3]); }
  else {
    const mv = o.mode === 'fly' ? 1.6 : o.moving ? 1 : .12, amp = o.mode === 'fly' ? .22 : .15;
    for (let i = 0; i < PY_SEG; i++) pts.push([Math.sin(i * .75 - t * 7 * mv) * amp * (i / PY_SEG + .25), .075, .15 - i * L]);
  }
  for (let i = 0; i < PY_SEG; i++) {
    const p = pts[i], q = pts[Math.min(PY_SEG - 1, i + 1)], pp = pts[Math.max(0, i - 1)];
    S[i].position.set(p[0], p[1], p[2]); S[i].rotation.y = Math.atan2(pp[0] - q[0], pp[2] - q[2]);
    const bulge = o.digest && (i === 6 || i === 7) ? 1.9 : o.digest && (i === 5 || i === 8) ? 1.35 : 1; S[i].scale.set(bulge, bulge, 1);
  }
  const h = pts[0], n2 = pts[1]; r.head.position.set(h[0] + (h[0] - n2[0]) * .6, h[1] + .01, h[2] + (h[2] - n2[2]) * .6); r.head.rotation.y = Math.atan2(h[0] - n2[0], h[2] - n2[2]);
  r.head.rotation.z = o.stunned ? 1.4 : 0; r.tongue.visible = !o.stunned && Math.sin(t * 9) > .3;
}
