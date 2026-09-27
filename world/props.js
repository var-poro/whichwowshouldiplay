// Décors : le grand sablier flottant derrière Chromie, les portails des
// époques et le sable qui flotte dans l'air.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { noise2 } from "./noise.js?v=2";
import { LAYOUT } from "./timeways.js?v=33";

const texLoader = new THREE.TextureLoader();

const GOLD = new THREE.MeshStandardMaterial({ color: "#c9a24a", metalness: 0.85, roughness: 0.32 });
const BRONZE = new THREE.MeshStandardMaterial({ color: "#8a5a2b", metalness: 0.7, roughness: 0.45 });

// Le sablier géant du hall des Grottes du Temps (cot_hourglass_redo, exporté en
// GLTF avec ses animations puis passé dans tools/pack_gltf.py), mis à
// l'échelle de la cuvette. Sans le fichier, on garde le sablier dessiné.
export async function createHourglass(groundAt) {
  try {
    const gltf = await new GLTFLoader().loadAsync("assets/models/hourglass.glb");
    return realHourglass(gltf, groundAt);
  } catch {
    return drawnHourglass(groundAt);
  }
}

function realHourglass(gltf, groundAt) {
  const model = gltf.scene;
  const HEIGHT = 12;
  // exporté en GLTF avec ses animations : anneaux et sable bougent comme en jeu
  const mixer = gltf.animations.length ? new THREE.AnimationMixer(model) : null;
  const clip = (name) => gltf.animations.find((c) => c.name.startsWith(`${name} (`));
  const stand = mixer?.clipAction(clip("Stand") || gltf.animations[0]);
  stand?.play();
  mixer?.update(0);
  // Quatre sortes de maillages, emboîtés les uns dans les autres :
  // - l'armature dorée (foa_hourglass_01), opaque : l'alpha de sa texture n'est
  //   qu'un masque de reflets. Elle écrit sa profondeur, donc cache ce qui est
  //   derrière elle (le haut cache la base vu d'en haut, les montants cachent
  //   le « ! » de Chromie seulement quand il est derrière) ;
  // - les deux ampoules de verre : même matériau, mais tout le maillage prend
  //   ses coordonnées dans le coin turquoise de la texture, à demi transparent ;
  // - le sable (foa_hourglass_03), entièrement dans les ampoules ;
  // - les runes et filets lumineux (foa_hourglass_02), additifs, surtout autour.
  // (Avant : le test /glass/ attrapait « hourglass » dans tous les noms ; tout
  // le sablier, armature comprise, était transparent sans profondeur et se
  // peignait par-dessus lui-même et le reste, selon un ordre sans rapport avec
  // la caméra.)
  const glassUV = (g) => {
    const uv = g.attributes.uv;
    let n = 0;
    for (let i = 0; i < uv.count; i++) if (uv.getX(i) > 0.62 && uv.getY(i) < 0.3) n++;
    return n > uv.count * 0.9;
  };
  const glass = [];
  const sand = [];
  const glows = [];
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    const m = o.material;
    if (/hourglass_01/.test(m.name) && glassUV(o.geometry)) glass.push(o);
    else if (/hourglass_03/.test(m.name)) sand.push(o);
    else if (/hourglass_02/.test(m.name) || m.userData.blend === "add" || /star|fire|enviro|reflect|glow|gleam/i.test(m.name)) glows.push(o);
    else m.side = THREE.DoubleSide; // armature
  });
  // Ordre de dessin fixe, du dedans vers le dehors, et identique sous tous les
  // angles (tous ces maillages ont le même centre, le moteur ne saurait pas les
  // trier) : 1) le fond des ampoules (faces arrière du verre), 2) le sable,
  // 3) le devant des ampoules, 4) les lueurs. Tout cela après les autres
  // transparents de la scène (renderOrder 0 à 2) et contre la profondeur des
  // opaques, de l'armature et du disque des portails.
  let order = 10;
  for (const o of glass) {
    // verre sans éclairage : sous la lampe orangée du sablier, le turquoise
    // sombre de la texture tournait au brun et se confondait avec le sable
    const m = new THREE.MeshBasicMaterial({ name: o.material.name, map: o.material.map, transparent: true, depthWrite: false });
    const back = new THREE.SkinnedMesh(o.geometry, Object.assign(m.clone(), { side: THREE.BackSide }));
    back.bind(o.skeleton, o.bindMatrix);
    back.position.copy(o.position);
    back.quaternion.copy(o.quaternion);
    back.scale.copy(o.scale);
    back.frustumCulled = o.frustumCulled;
    back.castShadow = false;
    back.renderOrder = order;
    o.parent.add(back);
    o.material = m;
    o.castShadow = false;
    o.renderOrder = order + 2;
  }
  // Le sable est presque plein (alpha à 1 sauf sur les bords du filet) : il
  // écrit sa profondeur pour que les runes du côté opposé ne brillent pas à
  // travers, et jette ses franges presque invisibles pour ne pas les masquer.
  for (const o of sand) {
    Object.assign(o.material, { transparent: true, depthWrite: true, alphaTest: 0.1, side: THREE.DoubleSide });
    o.castShadow = false;
    o.renderOrder = order + 1;
  }
  // lueurs, étoiles, flammes, reflets et runes : rendu additif, comme en jeu ;
  // l'ordre entre elles n'importe pas (l'addition ne dépend pas de l'ordre)
  for (const o of glows) {
    Object.assign(o.material, { blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    o.castShadow = false;
    o.renderOrder = order + 3;
  }
  // Les mouvements continus du modèle en jeu (anneaux de runes qui tournent,
  // sable qui coule le long de la spirale) viennent de séquences globales et
  // d'animations de texture que l'export glTF ne garde pas : on les rejoue ici.
  // Anneaux : chaque os des runes (foa_hourglass_02) qu'aucune animation ne
  // pilote tourne autour de l'axe vertical, à sa vitesse et dans son sens.
  const animated = new Set(gltf.animations.flatMap((c) => c.tracks.map((tr) => tr.name.split(".")[0])));
  const ringBones = new Set();
  model.traverse((o) => {
    if (!o.isSkinnedMesh || !/hourglass_02/.test(o.material.name)) return;
    const si = o.geometry.attributes.skinIndex;
    const sw = o.geometry.attributes.skinWeight;
    const count = new Map();
    for (let k = 0; k < si.count; k++)
      for (let c = 0; c < 4; c++) if (sw.getComponent(k, c) > 0.5) count.set(si.getComponent(k, c), (count.get(si.getComponent(k, c)) || 0) + 1);
    for (const [b, n] of count) if (n > 20 && !animated.has(o.skeleton.bones[b].name)) ringBones.add(o.skeleton.bones[b]);
  });
  const rings = [...ringBones].map((bone, i) => ({
    bone,
    rest: bone.quaternion.clone(),
    speed: (0.12 + (i % 4) * 0.07) * (i % 2 ? 1 : -1),
  }));
  const up = new THREE.Vector3(0, 1, 0);
  const turn = new THREE.Quaternion();
  // Sable : la texture défile le long du filet qui descend en spirale.
  let sandMap = null;
  model.traverse((o) => {
    if (!o.isMesh) return;
    if (/hourglass_03/.test(o.material.name) && o.geometry.attributes.position.count > 150) {
      o.material = o.material.clone();
      o.material.map = o.material.map.clone();
      o.material.map.wrapS = o.material.map.wrapT = THREE.RepeatWrapping;
      o.material.map.needsUpdate = true;
      sandMap = o.material.map;
    }
  });

  const box = new THREE.Box3().setFromObject(model);
  const s = HEIGHT / (box.max.y - box.min.y);
  model.scale.setScalar(s);
  model.position.set(-(box.min.x + box.max.x) / 2 * s, -box.min.y * s, -(box.min.z + box.max.z) / 2 * s);
  const root = new THREE.Group();
  const spin = new THREE.Group();
  spin.add(model);
  root.add(spin);
  const { x, y: z } = LAYOUT.hourglass;
  root.position.set(x, groundAt(x, z), z);
  const light = new THREE.PointLight("#ffb347", 40, 26, 1.6);
  light.position.y = HEIGHT * 0.45;
  root.add(light);
  const update = (t, dt) => {
    if (mixer) mixer.update(dt);
    else spin.rotation.y += dt * 0.05;
    for (const r of rings) r.bone.quaternion.copy(r.rest).multiply(turn.setFromAxisAngle(up, t * r.speed));
    if (sandMap) sandMap.offset.y = (sandMap.offset.y + dt * 0.35) % 1;
    light.intensity = 36 + Math.sin(t * 2.1) * 6;
  };
  // la quête rendue, le sablier s'ouvre (animation « Open » jouée une fois)
  const open = () => {
    const a = clip("Open") && mixer.clipAction(clip("Open"));
    if (!a) return;
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    a.reset().fadeIn(0.4).play();
    stand?.fadeOut(0.4);
  };
  return { root, update, open, radius: ((box.max.x - box.min.x) / 2) * s + 0.4 };
}

function drawnHourglass(groundAt) {
  const root = new THREE.Group();
  const { x, y: z } = LAYOUT.hourglass;
  root.position.set(x, groundAt(x, z) + 1.6, z);

  const spin = new THREE.Group();
  root.add(spin);

  // plateaux et montants
  for (const py of [0, 10]) {
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(3.3, 3.5, 0.7, 40), GOLD);
    plate.position.y = py;
    plate.castShadow = true;
    spin.add(plate);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.18, 8, 48), BRONZE);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = py + (py ? 0.35 : -0.35);
    spin.add(rim);
  }
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 10, 12), GOLD);
    post.position.set(Math.cos(a) * 2.9, 5, Math.sin(a) * 2.9);
    post.castShadow = true;
    spin.add(post);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), BRONZE);
    knob.position.set(Math.cos(a) * 2.9, 5, Math.sin(a) * 2.9);
    spin.add(knob);
  }

  // verre : deux bulbes tournés autour d'un col étroit
  const profile = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const r = 0.22 + 2.35 * Math.pow(Math.sin(Math.PI * t), 1.35) * (t < 0.5 ? 1 : 1);
    profile.push(new THREE.Vector2(Math.max(0.22, r * Math.abs(Math.sin(Math.PI * (t * 2)))), t * 9.3 + 0.35));
  }
  const glass = new THREE.Mesh(
    new THREE.LatheGeometry(profile, 48),
    new THREE.MeshPhysicalMaterial({
      color: "#fff6e2",
      roughness: 0.04,
      transmission: 1,
      thickness: 0.3,
      ior: 1.35,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
    }),
  );
  spin.add(glass);

  // sable : un cône qui se vide en haut, un tas qui grossit en bas
  const sandMat = new THREE.MeshStandardMaterial({ color: "#f0c060", emissive: "#a8661a", emissiveIntensity: 0.55, roughness: 0.9 });
  const topSand = new THREE.Mesh(new THREE.ConeGeometry(1.9, 2.4, 32), sandMat);
  topSand.rotation.x = Math.PI;
  topSand.position.y = 6.2;
  spin.add(topSand);
  const pile = new THREE.Mesh(new THREE.ConeGeometry(2.1, 1.6, 32), sandMat);
  pile.position.y = 1.2;
  spin.add(pile);
  const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.6, 8), sandMat);
  stream.position.y = 3.6;
  spin.add(stream);

  // grains qui tombent par le col
  const grains = new THREE.BufferGeometry();
  const count = 160;
  const gp = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) gp.set([(Math.random() - 0.5) * 0.12, 1.8 + Math.random() * 3.6, (Math.random() - 0.5) * 0.12], i * 3);
  grains.setAttribute("position", new THREE.BufferAttribute(gp, 3));
  const points = new THREE.Points(grains, new THREE.PointsMaterial({ color: "#ffd780", size: 0.09, transparent: true, opacity: 0.9 }));
  spin.add(points);

  const light = new THREE.PointLight("#ffb347", 40, 26, 1.6);
  light.position.y = 5;
  root.add(light);

  const update = (t, dt) => {
    root.position.y = groundAt(x, z) + 1.6 + Math.sin(t * 0.6) * 0.35;
    spin.rotation.y += dt * 0.12;
    const cycle = (t * 0.02) % 1;
    topSand.scale.setScalar(1 - cycle * 0.55);
    pile.scale.set(0.6 + cycle * 0.4, 0.5 + cycle * 0.7, 0.6 + cycle * 0.4);
    for (let i = 0; i < count; i++) {
      let yy = gp[i * 3 + 1] - dt * 3.2;
      if (yy < 1.8) yy += 3.6;
      gp[i * 3 + 1] = yy;
    }
    grains.attributes.position.needsUpdate = true;
    light.intensity = 36 + Math.sin(t * 2.1) * 6;
  };
  return { root, update, radius: 3.8 };
}

// Portails des époques, faits comme les portails de mage du jeu avec les
// textures de 11fx_arcaneportal01 : un disque de magie qui tourne (flux
// tordu en spirale), l'anneau de runes qui pivote sur son bord, une lueur au
// cœur, et le cercle de runes posé au sol. Chacun a la couleur de sa version ;
// « None » est un portail presque éteint.
const PORTAL_COLORS = {
  retail: "#3f8cff",
  mop: "#2fd6a0",
  anniversary: "#ffc040",
  forever: "#b07cff",
  era: "#e8853a",
  hardcore: "#ff3a2a",
  none: "#8a8a8a",
};

const portalTex = (name) => {
  const tex = texLoader.load(`assets/textures/timeways/${name}.png`);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
};

const portalShader = {
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform float time; uniform vec3 color; uniform float power;
    uniform sampler2D flow; uniform sampler2D runes; uniform sampler2D glow;
    varying vec2 vUv;
    vec2 rot(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
    void main() {
      vec2 p = vUv * 2.0 - 1.0;
      float r = length(p);
      if (r > 1.0) discard;
      float a = atan(p.y, p.x) / 6.2831853;
      // flux en spirale, aspiré vers le centre
      vec4 f1 = texture2D(flow, vec2(a * 2.0 + r * 0.6 + time * 0.05, r * 0.9 - time * 0.22));
      vec4 f2 = texture2D(flow, vec2(-a * 3.0 + r * 0.4 - time * 0.03, r * 1.3 - time * 0.15));
      float lum = dot(f1.rgb * f1.a + f2.rgb * f2.a * 0.7, vec3(0.33));
      float disc = smoothstep(0.98, 0.78, r);
      vec3 col = color * (0.25 + lum * 1.6) * disc;
      // anneau de runes sur le bord, qui tourne
      vec4 ru = texture2D(runes, rot(p, time * 0.25) * 0.5 + 0.5);
      col += color * ru.rgb * ru.a * 1.6 + vec3(ru.rgb * ru.a) * 0.35;
      // lueur au cœur
      vec4 g = texture2D(glow, vUv);
      col += mix(color, vec3(1.0), 0.4) * g.rgb * g.a * 0.8;
      col *= power;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

const circleShader = {
  vertexShader: portalShader.vertexShader,
  fragmentShader: `
    uniform float time; uniform vec3 color; uniform float power; uniform sampler2D map;
    varying vec2 vUv;
    void main() {
      vec2 p = vUv * 2.0 - 1.0;
      float c = cos(time * 0.12), s = sin(time * 0.12);
      vec4 t = texture2D(map, vec2(c * p.x - s * p.y, s * p.x + c * p.y) * 0.5 + 0.5);
      gl_FragColor = vec4(color * t.rgb * t.a * 0.9 * power, 1.0);
    }`,
};

export function createPortals(groundAt, spots) {
  const flow = portalTex("11fx_arcaneportal01_3009468");
  const runes = portalTex("11fx_arcaneportal01_3009832");
  const glow = portalTex("11fx_arcaneportal01_3009470");
  const circle = portalTex("11fx_arcaneportal01_3009465");
  const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide };
  const makePortal = ({ key, x, z, yaw, id }) => {
    const g = groundAt(x, z);
    const color = new THREE.Color(PORTAL_COLORS[key]);
    const power = { value: key === "none" ? 0.3 : 0.8 };
    const time = { value: 0 };
    const root = new THREE.Group();
    root.position.set(x, g, z);
    root.rotation.y = yaw;
    const disc = new THREE.Mesh(
      new THREE.PlaneGeometry(5.2, 5.2),
      // le disque écrit sa profondeur (le shader jette ce qui dépasse du
      // cercle) : ce qui est derrière lui, le sablier par exemple, reste
      // derrière au lieu de passer par-dessus
      new THREE.ShaderMaterial({ ...additive, depthWrite: true, uniforms: { time, color: { value: color }, power, flow: { value: flow }, runes: { value: runes }, glow: { value: glow } }, ...portalShader }),
    );
    disc.position.y = 3.1;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(7.5, 7.5),
      new THREE.ShaderMaterial({ ...additive, uniforms: { time, color: { value: color }, power, map: { value: circle } }, ...circleShader }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0.06;
    const light = new THREE.PointLight(color, key === "none" ? 0 : 14, 12, 1.6);
    light.position.set(0, 3.1, 1.2);
    root.add(disc, ground, light);
    return { key, id: id || key, root, swirl: disc, time, power, light, color, grow: 1, pos: new THREE.Vector3(x, g, z), top: new THREE.Vector3(x, g + 6.2, z) };
  };
  const portals = spots.map(makePortal);

  let highlighted = null;
  return {
    portals,
    // Un portail de plus (celui qu'ouvre Chromie) : il grandit de rien en
    // `secs` secondes, puis s'emprunte comme les autres.
    spawn(key, x, z, yaw, secs = 0) {
      const p = makePortal({ key, x, z, yaw, id: `${key}-chromie` });
      p.grow = secs > 0 ? 0 : 1;
      p.growRate = secs > 0 ? 1 / secs : 0;
      p.root.scale.setScalar(Math.max(0.001, p.grow));
      portals.push(p);
      return p;
    },
    // le portail du résultat brille plus fort, les autres se tempèrent
    highlight(key) {
      highlighted = key;
    },
    update(t, dt = 0) {
      for (const p of portals) {
        if (p.grow < 1) {
          p.grow = Math.min(1, p.grow + dt * p.growRate);
          // il s'ouvre en tournoyant, vite au début puis en douceur
          const e = 1 - Math.pow(1 - p.grow, 3);
          p.root.scale.setScalar(Math.max(0.001, e));
        }
        p.time.value = t + p.pos.x * 0.1;
        const target = p.key === "none" ? 0.3 : !highlighted ? 0.8 : p.key === highlighted ? 1.15 : 0.4;
        p.power.value += (target - p.power.value) * 0.05;
        p.light.intensity = p.key === "none" ? 0 : (4 + p.power.value * 14) * (1 + Math.sin(t * 2 + p.pos.x) * 0.08);
      }
    },
  };
}

// Grains de sable portés par le vent autour du joueur.
export function createDust() {
  const count = 900;
  const geo = new THREE.BufferGeometry();
  const p = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) p.set([(Math.random() - 0.5) * 120, Math.random() * 14, (Math.random() - 0.5) * 120], i * 3);
  geo.setAttribute("position", new THREE.BufferAttribute(p, 3));
  // grain rond et flou (sans texture, un point est un carré, bien visible de près)
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 32;
  const ctx = canvas.getContext("2d");
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  const grain = new THREE.CanvasTexture(canvas);
  const points = new THREE.Points(geo, new THREE.PointsMaterial({ color: "#e9c890", map: grain, size: 0.09, transparent: true, opacity: 0.35, depthWrite: false }));
  points.frustumCulled = false;
  const update = (t, dt, center, groundAt) => {
    for (let i = 0; i < count; i++) {
      let x = p[i * 3] + dt * (3.5 + noise2(i, t * 0.1) * 2);
      let z = p[i * 3 + 2] + dt * 0.8;
      let y = p[i * 3 + 1] + Math.sin(t * 1.3 + i) * dt * 0.4;
      if (x > center.x + 60) x -= 120;
      if (x < center.x - 60) x += 120;
      if (z > center.z + 60) z -= 120;
      if (z < center.z - 60) z += 120;
      // au-dessus du vide, le sable flotte autour de la hauteur du joueur
      const g0 = groundAt(x, z);
      const g = Number.isFinite(g0) ? g0 : center.y - 3;
      if (y < g + 0.1 || y > g + 6) y = g + Math.random() * 4;
      p[i * 3] = x;
      p[i * 3 + 1] = y;
      p[i * 3 + 2] = z;
    }
    geo.attributes.position.needsUpdate = true;
  };
  return { points, update };
}
