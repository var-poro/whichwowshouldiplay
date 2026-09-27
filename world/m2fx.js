// Modèles d'effet M2 rendus comme dans le jeu. L'export glTF de wow.export
// garde les maillages, les os et leurs animations ; le reste vient du M2
// d'origine, relu par tools/m2_fx.py (assets/models/fx/<nom>.m2.json) :
// - chaque passe de rendu du .skin : ses deux textures combinées (shader du
//   jeu), son mode de fusion, sa couleur et son opacité animées, le défilement
//   de ses textures ;
// - les os « billboard », tournés vers la caméra (en entier, ou autour de
//   leur axe vertical) ;
// - les émetteurs de particules (plan ou sphère), avec leurs pistes : débit,
//   vitesse, dispersion, durée de vie, gravité, freinage, couleur, opacité et
//   taille sur la vie de la particule, cases d'atlas, rotation.
// Comme dans le jeu, tout est calculé en espace gamma : textures lues telles
// quelles, fusion dans l'image finale, sans le rendu de tons de la scène.
// Axes : le M2 est en Z vers le haut (X devant, Y à gauche) ; wow.export
// passe en Y vers le haut : (x, y, z) du M2 → (x, z, -y).

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";

const loader = new GLTFLoader();
const texLoader = new THREE.TextureLoader();
const textures = new Map();
function tex(name, wrap = 3) {
  if (!name) return null;
  const key = `${name}|${wrap}`;
  if (!textures.has(key)) {
    const t = texLoader.load(`assets/textures/fx/${name}.png`);
    // coordonnées du M2 : origine en haut à gauche, comme le glTF
    t.flipY = false;
    t.wrapS = wrap & 1 ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    t.wrapT = wrap & 2 ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    textures.set(key, t);
  }
  return textures.get(key);
}

// ---------- pistes animées ----------
const lerpN = (a, b, k) => (typeof a === "number" ? a + (b - a) * k : a.map((v, i) => v + (b[i] - v) * k));
// M2Track : par séquence (ou boucle globale), temps en millisecondes
function evalTrack(tr, state, def) {
  if (!tr) return def;
  let s, t;
  if (tr.gs >= 0) {
    s = tr.seq["0"];
    const loop = state.loops[tr.gs];
    t = loop ? state.gt % loop : 0;
  } else {
    s = tr.seq[state.seq];
    t = state.ms;
  }
  if (!s) return def;
  return sample(s[0], s[1], t, tr.interp !== 0);
}
function sample(ts, vs, t, smooth = true) {
  const n = ts.length;
  if (n === 1 || t <= ts[0]) return vs[0];
  if (t >= ts[n - 1]) return vs[n - 1];
  let i = 0;
  while (ts[i + 1] < t) i++;
  if (!smooth) return vs[i];
  return lerpN(vs[i], vs[i + 1], (t - ts[i]) / (ts[i + 1] - ts[i] || 1));
}
// piste des particules : sur la vie normalisée de la particule (0 → 1)
const evalLife = (fb, k, def) => (fb ? sample(fb[0], fb[1], k) : def);

// M2 (Z en haut) → glTF (Y en haut)
const toGl = (x, y, z, out = new THREE.Vector3()) => out.set(x, z, -y);

// ---------- matériaux ----------
// Mélange de deux textures, d'après le shader de la passe (M2 shader_id).
// 0 : opaque, 1 : Mod, 2 : Mod_Mod, 3 : Mod_Mod2x, 4 : Mod_Add, 5 : Mod_Mod2xNA,
// 6 : Mod_AddNA, 7 : Opaque_Mod, 8 : Opaque_Mod2x, 9 : Opaque_Add ; 10 : trois
// textures (hors de la table connue : approximation, voir PASS_FRAG)
function combiner(shader, count) {
  if (count > 2) return 10;
  if (count < 2) return shader & 0x70 ? 1 : 0;
  const low = shader & 7;
  if (shader & 0x70) return { 0: 1, 3: 4, 4: 3, 6: 5, 7: 6 }[low] ?? 2;
  return { 0: 0, 3: 9, 7: 9, 4: 8, 6: 8 }[low] ?? 7;
}
// fusion du M2 : 0 opaque, 1 découpe, 2 alpha, 3 addition sans alpha,
// 4 addition, 5 modulation, 6 modulation ×2, 7 addition « prémultipliée »
function setBlend(m, blend) {
  m.transparent = blend >= 2;
  if (blend === 2) m.blending = THREE.NormalBlending;
  else if (blend >= 3) {
    m.blending = THREE.CustomBlending;
    m.blendEquation = THREE.AddEquation;
    const F = {
      3: [THREE.OneFactor, THREE.OneFactor],
      4: [THREE.SrcAlphaFactor, THREE.OneFactor],
      5: [THREE.DstColorFactor, THREE.ZeroFactor],
      6: [THREE.DstColorFactor, THREE.SrcColorFactor],
      7: [THREE.OneFactor, THREE.OneMinusSrcAlphaFactor],
    }[blend];
    m.blendSrc = F[0];
    m.blendDst = F[1];
    m.blendSrcAlpha = THREE.ZeroFactor;
    m.blendDstAlpha = THREE.OneFactor;
  }
}

const PASS_VERT = `
#include <common>
#include <skinning_pars_vertex>
uniform mat3 uUv0, uUv1, uUv2;
varying vec2 vT0, vT1, vT2;
void main() {
  #include <begin_vertex>
  #include <skinbase_vertex>
  #include <skinning_vertex>
  #include <project_vertex>
  vT0 = (uUv0 * vec3(uv, 1.0)).xy;
  vT1 = (uUv1 * vec3(uv, 1.0)).xy;
  vT2 = (uUv2 * vec3(uv, 1.0)).xy;
}`;
const PASS_FRAG = `
uniform sampler2D uT0, uT1, uT2;
uniform int uMode, uCount;
uniform bool uPremul;
uniform vec4 uColor;
uniform float uAlphaKey;
varying vec2 vT0, vT1, vT2;
void main() {
  vec4 a = texture2D(uT0, vT0);
  vec4 b = uCount > 1 ? texture2D(uT1, vT1) : vec4(1.0);
  vec4 c;
  if (uMode == 0) c = vec4(a.rgb, 1.0);
  else if (uMode == 1) c = a;
  else if (uMode == 2) c = a * b;
  else if (uMode == 3) c = vec4(a.rgb * b.rgb * 2.0, a.a * b.a * 2.0);
  else if (uMode == 4) c = vec4(a.rgb + b.rgb * b.a, a.a + b.a);
  else if (uMode == 5) c = vec4(a.rgb * b.rgb * 2.0, a.a);
  else if (uMode == 6) c = vec4(a.rgb + b.rgb, a.a);
  else if (uMode == 7) c = vec4(a.rgb * b.rgb, 1.0);
  else if (uMode == 8) c = vec4(a.rgb * b.rgb * 2.0, 1.0);
  else if (uMode == 9) c = vec4(a.rgb + b.rgb * b.a, 1.0);
  // trois textures (le cône du drakks_spell) : la première (sable qui
  // défile) donne la matière, les deux autres (cônes) la forme
  else {
    float mask = b.a * texture2D(uT2, vT2).a;
    c = vec4(a.rgb * 2.0 * mask, a.a * mask);
  }
  c *= uColor;
  // fusion 7 (One, 1 − alpha) : la couleur suit l'opacité (fondus)
  if (uPremul) c.rgb *= uColor.a;
  if (c.a < uAlphaKey) discard;
  gl_FragColor = c;
}`;

function passMaterial(pass) {
  const n = Math.min(3, pass.textures.length);
  const t = pass.textures.map((name, i) => tex(name, pass.wrap?.[i] ?? 3));
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uT0: { value: t[0] },
      uT1: { value: t[1] || t[0] },
      uT2: { value: t[2] || t[0] },
      uUv0: { value: new THREE.Matrix3() },
      uUv1: { value: new THREE.Matrix3() },
      uUv2: { value: new THREE.Matrix3() },
      uMode: { value: combiner(pass.shader, n) },
      uCount: { value: n },
      uColor: { value: new THREE.Vector4(1, 1, 1, 1) },
      uAlphaKey: { value: pass.blend === 1 ? 224 / 255 : 1 / 255 },
      uPremul: { value: pass.blend === 7 },
    },
    vertexShader: PASS_VERT,
    fragmentShader: PASS_FRAG,
    // drapeaux du matériau : 0x4 deux faces, 0x10 sans écriture de profondeur
    side: pass.matFlags & 4 ? THREE.DoubleSide : THREE.FrontSide,
    depthWrite: !(pass.matFlags & 0x10) && pass.blend <= 1,
    depthTest: !(pass.matFlags & 8),
    toneMapped: false,
    fog: false,
  });
  setBlend(m, pass.blend);
  return m;
}

// Défilement d'une texture (M2TextureTransform) : translation, puis rotation
// et échelle autour du centre de la texture.
function uvMatrix(anim, state, out) {
  const t = evalTrack(anim.t, state, null);
  const r = evalTrack(anim.r, state, null);
  const s = evalTrack(anim.s, state, null);
  out.identity();
  if (s || r) {
    const a = r ? 2 * Math.atan2(r[2], r[3]) : 0;
    const sx = s ? s[0] : 1;
    const sy = s ? s[1] : 1;
    const c = Math.cos(a);
    const n = Math.sin(a);
    // T(0,5) · R · S · T(-0,5)
    out.set(c * sx, -n * sy, 0.5 - 0.5 * (c * sx - n * sy), n * sx, c * sy, 0.5 - 0.5 * (n * sx + c * sy), 0, 0, 1);
  }
  if (t) {
    out.elements[6] += t[0];
    out.elements[7] += t[1];
  }
  return out;
}

// ---------- particules ----------
const PART_VERT = `
attribute vec4 color;
attribute vec4 uvB;
varying vec4 vColor;
varying vec2 vUv;
varying vec4 vUvB;
void main() {
  vColor = color;
  vUv = uv;
  vUvB = uvB;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
// Particules multi-textures (Particle_3colortex_3alphatex) : les trois
// textures se multiplient, couleur et opacité ; les deux dernières ont leurs
// propres coordonnées, à leur échelle, qui défilent sur la vie de la particule.
const PART_FRAG = `
uniform sampler2D uT0, uT1, uT2;
uniform bool uMulti, uPremul;
uniform float uAlphaKey;
varying vec4 vColor;
varying vec2 vUv;
varying vec4 vUvB;
void main() {
  vec4 c = texture2D(uT0, vUv);
  if (uMulti) c *= texture2D(uT1, vUvB.xy) * texture2D(uT2, vUvB.zw);
  c *= vColor;
  if (uPremul) c.rgb *= vColor.a;
  if (c.a < uAlphaKey) discard;
  gl_FragColor = c;
}`;
const rnd = () => Math.random() * 2 - 1;
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();

function createEmitter(p, inst) {
  const bone = inst.bones[p.bone];
  const pivot = inst.meta.bones[p.bone]?.pivot || [0, 0, 0];
  // position de l'émetteur dans le repère de son os (qui est à son pivot)
  const offset = toGl(p.pos[0] - pivot[0], p.pos[1] - pivot[1], p.pos[2] - pivot[2]);
  const rate = (s) => {
    const tr = p.rate;
    if (!tr) return 0;
    let max = 0;
    for (const k in tr.seq) for (const v of tr.seq[k][1]) max = Math.max(max, v);
    return s ? max : 0;
  };
  const lifeMax = Math.max(0.05, ...Object.values(p.life?.seq || { 0: [[0], [1]] }).flatMap((s) => s[1])) * (1 + Math.abs(p.lifeVar));
  const MAX = Math.min(600, Math.ceil(rate(true) * lifeMax * 1.3) + 8);
  const pos = new Float32Array(MAX * 4 * 3);
  const uv = new Float32Array(MAX * 4 * 2);
  const col = new Float32Array(MAX * 4 * 4);
  const uvB = new Float32Array(MAX * 4 * 4);
  const idx = new Uint16Array(MAX * 6);
  for (let i = 0; i < MAX; i++) idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute("uvB", new THREE.BufferAttribute(uvB, 4).setUsage(THREE.DynamicDrawUsage));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.setDrawRange(0, 0);
  const multi = p.textures.length > 1 && !!p.mtScale;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uT0: { value: tex(p.textures[0]) },
      uT1: { value: tex(p.textures[1] || p.textures[0]) },
      uT2: { value: tex(p.textures[2] || p.textures[0]) },
      uMulti: { value: multi },
      uPremul: { value: p.blend === 7 },
      uAlphaKey: { value: p.blend === 1 ? 224 / 255 : 1 / 255 },
    },
    vertexShader: PART_VERT,
    fragmentShader: PART_FRAG,
    depthWrite: p.blend <= 1,
    toneMapped: false,
    fog: false,
    side: THREE.DoubleSide,
  });
  setBlend(mat, p.blend);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  const list = [];
  let acc = 0;
  const cells = Math.max(1, p.rows * p.cols);
  // taille : la courbe du M2 multipliée par l'échelle de « twinkle » (les
  // modèles récents y rangent la taille réelle, la courbe finissant à 1/36)
  const [tMin, tMax] = p.twinkleScale;
  const g = new THREE.Vector3();
  if (Array.isArray(p.gravity?.seq?.["0"]?.[1]?.[0])) {
    // gravité compressée (drapeau 0x800000) : direction sur deux octets, force sur 16 bits
    const [x, y, lo, hi] = p.gravity.seq["0"][1][0];
    const z16 = ((hi & 0xff) << 8) | (lo & 0xff);
    let mag = (z16 > 0x7fff ? z16 - 0x10000 : z16) * 0.04238648;
    const dx = x / 128;
    const dy = y / 128;
    let dz = Math.sqrt(Math.max(0, 1 - dx * dx - dy * dy));
    if (mag < 0) {
      dz = -dz;
      mag = -mag;
    }
    toGl(dx * mag, dy * mag, dz * mag, g);
  } else toGl(0, 0, -(evalTrack(p.gravity, { seq: "0", ms: 0, gt: 0, loops: [] }, 0) || 0), g);
  const zSource = p.zSource ?? 0;

  function spawn(state, ws, M) {
    if (list.length >= MAX) return;
    const L = evalTrack(p.areaL, state, 0);
    const W = evalTrack(p.areaW, state, 0);
    const speed = evalTrack(p.speed, state, 0) * (1 + evalTrack(p.speedVar, state, 0) * rnd());
    const vR = evalTrack(p.vRange, state, 0);
    const hR = evalTrack(p.hRange, state, 0);
    const lp = new THREE.Vector3();
    const dir = new THREE.Vector3();
    if (p.type === 2) {
      // sphère : rayon entre les deux dimensions de la zone d'émission
      const r = L + (W - L) * Math.random();
      const polar = vR * rnd();
      const az = hR * rnd();
      dir.set(Math.cos(polar) * Math.cos(az), Math.cos(polar) * Math.sin(az), Math.sin(polar));
      lp.copy(dir).multiplyScalar(r);
    } else {
      // plan : rectangle dans le plan XY, émission le long de Z, dispersée
      lp.set(rnd() * L * 0.5, rnd() * W * 0.5, 0);
      const polar = vR * rnd();
      const az = hR * rnd();
      dir.set(Math.cos(az) * Math.sin(polar), Math.sin(az) * Math.sin(polar), Math.cos(polar));
    }
    if (zSource > 0.001) dir.set(lp.x, lp.y, lp.z - zSource).normalize();
    const pw = toGl(lp.x, lp.y, lp.z).add(offset).applyMatrix4(M);
    const vw = toGl(dir.x, dir.y, dir.z).transformDirection(M).multiplyScalar(speed * ws);
    const life = Math.max(0.02, evalTrack(p.life, state, 1) * (1 + p.lifeVar * rnd()));
    const sv = p.flags & 0x80000 ? [1 + p.scaleVar[0] * rnd(), 1 + p.scaleVar[1] * rnd()] : Array(2).fill(1 + p.scaleVar[0] * rnd());
    const tw = tMin + (tMax - tMin) * Math.random();
    const part = {
      p: pw,
      v: vw,
      age: 0,
      life,
      size: [sv[0] * tw * ws, sv[1] * tw * ws],
      rot: p.baseSpin + p.baseSpinVar * rnd(),
      spin: p.spin + p.spinVar * rnd(),
      // case d'atlas au hasard (0x10000 : texture au hasard, 0x200000 : départ au hasard)
      tile: p.flags & 0x210000 ? Math.floor(Math.random() * cells) : 0,
    };
    if (multi) {
      // départ au hasard dans les deux textures, vitesse moyenne ± écart
      part.tp = [Math.random(), Math.random(), Math.random(), Math.random()];
      part.tv = [0, 1].flatMap((k) => [p.mtVel[k][0] + p.mtVelVar[k][0] * rnd(), p.mtVel[k][1] + p.mtVelVar[k][1] * rnd()]);
    }
    // particules à plat dans le plan XY de l'émetteur (0x1000)
    if (p.flags & 0x1000) {
      part.ax = new THREE.Vector3(1, 0, 0).transformDirection(M);
      part.ay = new THREE.Vector3(0, 0, -1).transformDirection(M);
    }
    list.push(part);
  }

  return {
    mesh,
    alive: () => list.length > 0,
    update(dt, state, emitting, camera) {
      bone.updateWorldMatrix(true, false);
      const M = _m.copy(bone.matrixWorld);
      M.decompose(_v, _q, _s);
      const ws = _s.x;
      // débit (particules par seconde)
      const on = !p.enabled || evalTrack(p.enabled, state, 1) > 0;
      if (emitting && on) {
        const r = Math.max(0, evalTrack(p.rate, state, 0) + p.rateVar * rnd());
        acc += r * dt;
        while (acc >= 1) {
          spawn(state, ws, M);
          acc -= 1;
        }
      } else acc = 0;
      // mouvement : gravité (dans le repère du monde), freinage
      const drag = Math.exp(-p.drag * dt);
      for (let i = list.length - 1; i >= 0; i--) {
        const q = list[i];
        q.age += dt;
        if (q.age >= q.life) {
          list.splice(i, 1);
          continue;
        }
        q.v.addScaledVector(g, dt * ws).multiplyScalar(drag);
        q.p.addScaledVector(q.v, dt);
        q.rot += q.spin * dt;
      }
      // quads tournés vers la caméra
      const right = _v.setFromMatrixColumn(camera.matrixWorld, 0);
      const up = _w.setFromMatrixColumn(camera.matrixWorld, 1);
      const cm = p.colorMult ?? 1;
      const am = p.alphaMult ?? 1;
      for (let i = 0; i < list.length; i++) {
        const q = list[i];
        const k = q.age / q.life;
        const sc = evalLife(p.scale, k, [1, 1]);
        const c = evalLife(p.color, k, [255, 255, 255]);
        const a = evalLife(p.alpha, k, 1);
        const cell = (p.headCell ? Math.round(evalLife(p.headCell, k, 0)) + q.tile : q.tile) % cells;
        const sx = sc[0] * q.size[0];
        const sy = sc[1] * q.size[1];
        const ax = q.ax || right;
        const ay = q.ay || up;
        const cs = Math.cos(q.rot);
        const sn = Math.sin(q.rot);
        const cu = (cell % p.cols) / p.cols;
        const cv = Math.floor(cell / p.cols) / p.rows;
        const corners = [
          [-1, 1, 0, 0],
          [1, 1, 1, 0],
          [1, -1, 1, 1],
          [-1, -1, 0, 1],
        ];
        for (let j = 0; j < 4; j++) {
          const [x, y, u, v] = corners[j];
          const rx = (x * cs - y * sn) * sx;
          const ry = (x * sn + y * cs) * sy;
          const o = (i * 4 + j) * 3;
          pos[o] = q.p.x + ax.x * rx + ay.x * ry;
          pos[o + 1] = q.p.y + ax.y * rx + ay.y * ry;
          pos[o + 2] = q.p.z + ax.z * rx + ay.z * ry;
          uv[(i * 4 + j) * 2] = cu + u / p.cols;
          uv[(i * 4 + j) * 2 + 1] = cv + v / p.rows;
          col.set([(c[0] / 255) * cm, (c[1] / 255) * cm, (c[2] / 255) * cm, a * am], (i * 4 + j) * 4);
          if (multi) {
            const [s1, s2] = p.mtScale;
            uvB.set([u * s1 + q.tp[0] + q.tv[0] * q.age, v * s1 + q.tp[1] + q.tv[1] * q.age, u * s2 + q.tp[2] + q.tv[2] * q.age, v * s2 + q.tp[3] + q.tv[3] * q.age], (i * 4 + j) * 4);
          }
        }
      }
      geo.setDrawRange(0, list.length * 6);
      geo.attributes.position.needsUpdate = true;
      geo.attributes.uv.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      if (multi) geo.attributes.uvB.needsUpdate = true;
    },
    dispose() {
      mesh.removeFromParent();
      geo.dispose();
      mat.dispose();
    },
  };
}

// ---------- chargement et instances ----------
export async function loadM2(name) {
  const [gltf, meta] = await Promise.all([
    loader.loadAsync(`assets/models/fx/${name}.glb`).catch(() => null),
    fetch(`assets/models/fx/${name}.m2.json?v=1`)
      .then((r) => r.json())
      .catch(() => null),
  ]);
  return gltf && meta ? { gltf, meta } : null;
}

// Une instance : root à accrocher (os, personnage), les particules vivent
// dans la scène (espace du monde, comme dans le jeu : elles ne suivent pas
// l'objet une fois émises). play(id) : séquence par son identifiant
// d'animation (0 Stand, 158 Hold, 159 Decay).
export function m2Instance(model, scene) {
  const { gltf, meta } = model;
  const root = SkeletonUtils.clone(gltf.scene);
  const bones = meta.bones.map((_, i) => root.getObjectByName(`bone_${i}`));
  // passes de rendu : une copie du géoset par passe, avec son matériau
  const geosets = [];
  root.traverse((o) => {
    const m = o.isMesh && o.name.match(/_Geoset(\d+)$/);
    if (m) geosets[+m[1]] = o;
  });
  const used = new Set();
  const passes = meta.passes
    .map((pass) => {
      const base = geosets[pass.section];
      if (!base) return null;
      const mesh = used.has(base) ? base.clone() : base;
      if (mesh !== base) base.parent.add(mesh);
      used.add(base);
      mesh.material = passMaterial(pass);
      mesh.frustumCulled = false;
      mesh.castShadow = mesh.receiveShadow = false;
      mesh.renderOrder = 1 + pass.priority;
      return { pass, mesh, u: mesh.material.uniforms };
    })
    .filter(Boolean);
  const mixer = new THREE.AnimationMixer(root);
  const state = { seq: "0", ms: 0, gt: 0, loops: meta.globalLoops };
  let dur = 0;
  let loop = true;
  let seqEnd = null;
  function play(id, repeat = true) {
    const i = meta.seqs.findIndex((s) => s.id === id);
    if (i < 0) return 0;
    const s = meta.seqs[i];
    state.seq = String(i);
    state.ms = 0;
    dur = s.dur;
    loop = repeat;
    const clip = gltf.animations.find((c) => c.name.includes(`(ID ${s.id} variation ${s.var})`));
    mixer.stopAllAction();
    if (clip) {
      const a = mixer.clipAction(clip);
      a.setLoop(repeat ? THREE.LoopRepeat : THREE.LoopOnce, repeat ? Infinity : 1);
      a.clampWhenFinished = !repeat;
      a.reset().play();
    }
    return s.dur / 1000;
  }
  const has = (id) => meta.seqs.some((s) => s.id === id);
  const emitters = meta.particles.map((p) => createEmitter(p, { bones, meta }));
  for (const e of emitters) scene.add(e.mesh);
  let emitting = true;
  const billboards = meta.bones.map((b, i) => (b.flags & 0x48 && bones[i] ? { i, flags: b.flags, bone: bones[i] } : null)).filter(Boolean);
  const pq = new THREE.Quaternion();
  const basis = new THREE.Matrix4();
  const X = new THREE.Vector3();
  const Y = new THREE.Vector3();
  const Z = new THREE.Vector3();
  const P = new THREE.Vector3();
  const cam = new THREE.Vector3();

  function faceCamera(camera) {
    // os « billboard » : l'axe X du M2 (vers l'avant) regarde la caméra ;
    // sphérique (0x8) : le plan de l'os est celui de l'écran ; cylindrique
    // autour de Z (0x40) : il ne tourne qu'autour de la verticale de son parent
    cam.setFromMatrixPosition(camera.matrixWorld);
    for (const b of billboards) {
      const bone = b.bone;
      const parent = bone.parent;
      parent.updateWorldMatrix(true, false);
      pq.setFromRotationMatrix(_m.extractRotation(parent.matrixWorld));
      bone.updateWorldMatrix(false, false);
      P.setFromMatrixPosition(bone.matrixWorld);
      if (b.flags & 0x8) {
        X.setFromMatrixColumn(camera.matrixWorld, 2);
        Y.setFromMatrixColumn(camera.matrixWorld, 1);
      } else {
        Y.set(0, 1, 0).applyQuaternion(pq);
        X.subVectors(cam, P);
        X.addScaledVector(Y, -X.dot(Y));
        if (X.lengthSq() < 1e-8) continue;
      }
      X.normalize();
      Z.crossVectors(X, Y).normalize();
      Y.crossVectors(Z, X);
      basis.makeBasis(X, Y, Z);
      bone.quaternion.setFromRotationMatrix(basis).premultiply(pq.invert());
      bone.updateMatrixWorld(true);
    }
  }

  return {
    root,
    play,
    has,
    duration: (id) => (meta.seqs.find((s) => s.id === id)?.dur ?? 0) / 1000,
    // fin de séquence : cb() une fois la séquence non bouclée terminée
    onEnd(cb) {
      seqEnd = cb;
    },
    // le débit des émetteurs s'arrête (les particules émises finissent leur vie)
    stopEmitting() {
      emitting = false;
    },
    alive: () => emitters.some((e) => e.alive()),
    update(dt, camera, fade = 1) {
      // la caméra vient d'être placée : sa matrice n'est recalculée qu'au rendu
      camera.updateMatrixWorld();
      state.gt += dt * 1000;
      state.ms += dt * 1000;
      if (!loop && state.ms >= dur) {
        state.ms = dur;
        if (seqEnd) {
          const cb = seqEnd;
          seqEnd = null;
          cb();
        }
      } else if (loop && dur) state.ms %= dur;
      mixer.update(dt);
      if (root.parent) {
        root.updateWorldMatrix(true, true);
        faceCamera(camera);
      }
      for (const { pass, u } of passes) {
        const c = pass.color >= 0 ? meta.colors[pass.color] : null;
        const rgb = c ? evalTrack(c.color, state, [1, 1, 1]) : [1, 1, 1];
        const a = c ? evalTrack(c.alpha, state, 1) : 1;
        const w = pass.weight >= 0 ? evalTrack(meta.weights[pass.weight], state, 1) : 1;
        u.uColor.value.set(rgb[0], rgb[1], rgb[2], a * w * fade);
        const uvs = [u.uUv0, u.uUv1, u.uUv2];
        pass.uv.forEach((k, i) => (k >= 0 && meta.uvAnims[k] ? uvMatrix(meta.uvAnims[k], state, uvs[i].value) : uvs[i].value.identity()));
      }
      for (const e of emitters) e.update(dt, state, emitting && !!root.parent, camera);
    },
    dispose() {
      root.removeFromParent();
      for (const e of emitters) e.dispose();
      for (const { mesh } of passes) mesh.material.dispose();
    },
  };
}

// ---------- liseré lumineux (EdgeGlowEffect) ----------
// Un contour de Fresnel additif sur tout le modèle du personnage :
// couleur × multiplicateur × (1 − N·V)^coefficient.
const GLOW_VERT = `
#include <common>
#include <skinning_pars_vertex>
varying vec3 vN;
varying vec3 vV;
void main() {
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <defaultnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  #include <project_vertex>
  vN = normalize(transformedNormal);
  vV = normalize(-mvPosition.xyz);
}`;
const GLOW_FRAG = `
uniform vec3 uColor;
uniform float uPower, uK;
varying vec3 vN;
varying vec3 vV;
void main() {
  float f = pow(1.0 - clamp(abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0), uPower);
  gl_FragColor = vec4(uColor * f * uK, 1.0);
}`;
export function edgeGlow(model, { color, power, multiplier }) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color().setRGB(color[0] * multiplier, color[1] * multiplier, color[2] * multiplier) }, uPower: { value: power }, uK: { value: 0 } },
    vertexShader: GLOW_VERT,
    fragmentShader: GLOW_FRAG,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    depthFunc: THREE.LessEqualDepth,
    toneMapped: false,
    fog: false,
  });
  const copies = [];
  model.traverse((o) => {
    if (!o.isMesh || !o.visible || o.userData.edgeGlow) return;
    const c = o.isSkinnedMesh ? new THREE.SkinnedMesh(o.geometry, mat) : new THREE.Mesh(o.geometry, mat);
    if (o.isSkinnedMesh) c.bind(o.skeleton, o.bindMatrix);
    c.userData.edgeGlow = true;
    c.frustumCulled = false;
    c.renderOrder = 3;
    copies.push([o, c]);
  });
  for (const [o, c] of copies) o.add(c);
  return {
    set(k) {
      mat.uniforms.uK.value = Math.max(0, k);
      for (const [o, c] of copies) c.visible = k > 0 && o.visible;
    },
    dispose() {
      for (const [, c] of copies) c.removeFromParent();
      mat.dispose();
    },
  };
}
