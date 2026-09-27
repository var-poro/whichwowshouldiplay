// Les Voies du temps (The Timeways) : le carrefour flottant de l'Aube de
// l'Infini, là où Chromie envoie les héros d'une époque à l'autre. Un plateau
// de bronze en croix (WMO 10du_infinitedungeon_timewayshub01), quatre
// plateformes rondes au bout des bras, suspendu dans un ciel d'étoiles et de
// sable. On arrive par la plateforme du sud ; Chromie et le sablier au centre ;
// les portails des époques, deux par plateforme, sur les trois autres.
//
// Fichiers préparés par tools/build_timeways.py (assets/models/timeways).

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// Le plateau est à l'échelle 0,55 : en taille réelle, il faut vingt secondes
// de course pour aller du centre à un portail.
const SCALE = 0.55;
// Tourné d'un quart de tour : la grande plateforme (ouest dans le fichier)
// devient l'arrivée, au sud.
const TURN = Math.PI / 2;
const FLOOR_Y = 2.39; // hauteur du disque central dans le fichier : il devient le niveau 0

const cosT = Math.cos(TURN);
const sinT = Math.sin(TURN);
// repère du fichier (mètres de l'OBJ) -> monde, et l'inverse
const toWorld = (x, z) => new THREE.Vector2((x * cosT + z * sinT) * SCALE, (-x * sinT + z * cosT) * SCALE);
const toHub = (x, z) => [(x * cosT - z * sinT) / SCALE, (x * sinT + z * cosT) / SCALE];

// plateformes au bout des bras, dans le repère du fichier (centre et rayon mesurés)
const PADS = {
  spawn: [-128.3, 0.3],
  north: [125.6, 0],
  west: [28.8, -122],
  east: [28.9, 122.9],
};

// Deux ou trois portails par plateforme, côte à côte, tournés vers le centre.
// Les versions modernes à l'ouest, les classiques au nord (Forever au
// milieu), les défis à l'est.
const PORTAL_PADS = [
  ["west", ["retail", "mop"]],
  ["north", ["anniversary", "forever", "era"]],
  ["east", ["hardcore", "none"]],
];

function portalSpots() {
  const spots = [];
  for (const [pad, keys] of PORTAL_PADS) {
    const c = toWorld(...PADS[pad]);
    const toCenter = c.clone().negate().normalize();
    const side = new THREE.Vector2(-toCenter.y, toCenter.x);
    keys.forEach((key, i) => {
      // deux portails à 9,2 m l'un de l'autre, trois à 6 m
      const gap = keys.length > 2 ? 6 : 9.2;
      const p = c.clone().addScaledVector(side, (i - (keys.length - 1) / 2) * gap).addScaledVector(toCenter, -1.5);
      spots.push({ key, x: p.x, z: p.y, yaw: Math.atan2(-toCenter.x, -toCenter.y) + Math.PI });
    });
  }
  return spots;
}

// Arrivée au centre du disque brun incrusté dans la plateforme du sud (mesuré
// vu du dessus : 9,5 unités, soit 5 m, en arrière du centre de la plateforme),
// où l'on atterrit en tombant du ciel.
// (sur l'axe exact Chromie – disque : même x que Chromie)
const spawn = toWorld(PADS.spawn[0] - 9.5, 0);
export const LAYOUT = {
  chromie: new THREE.Vector2(0, 3),
  hourglass: new THREE.Vector2(0, -4),
  spawn,
  portals: portalSpots(),
  extent: 190, // côté de la carte (minicarte), en mètres
};

const loader = new GLTFLoader();
const texLoader = new THREE.TextureLoader();
function texture(name, repeat = false) {
  const tex = texLoader.load(`assets/textures/timeways/${name}.png`);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// Surfaces « fenêtres sur le temps » : sols au shader MapObjParallax de
// Dragonflight (4497754) et pièces de métal sombre (4497744, 4497746, 4497766,
// 4497768). L'export n'en garde que la couche du dessus (éclats, emblèmes,
// glyphes), presque noire. On en fait des vitres sur le ciel : la surface se
// dessine en premier, sans couleur, rien que sa profondeur ; ce qui est dessous
// (plateformes, dessous du plateau) est donc caché, et le ciel, déjà peint,
// reste visible. Par-dessus, une vitre orangée faite des textures du matériau
// (fichier de la zone), à plat, sans effet de profondeur : reflet nuageux qui
// dérive, entrelacs dorés, paillettes, reflet plus vif en vue rasante, et les
// motifs clairs de la texture exportée.
const SEE_THROUGH = /timetemple01_(4497754|4497744|4497746|4497766|4497768)/;
const windowMaterial = new THREE.MeshBasicMaterial({ colorWrite: false });
const glassTime = { value: 0 };
let glassTextures = null;
function glassMaterial(map) {
  glassTextures ??= {
    clouds: texture("10dg_dragon_timetemple01_4497758_clouds", true),
    knots: texture("10dg_dragon_timetemple01_4497757_knot", true),
    speck: texture("10dg_dragon_timetemple01_4497759_speck", true),
  };
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    // un peu avancée vers la caméra : d'autres surfaces du plateau passent au
    // même niveau et la mangeaient par plaques
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
    uniforms: {
      time: glassTime,
      map: { value: map },
      clouds: { value: glassTextures.clouds },
      knots: { value: glassTextures.knots },
      speck: { value: glassTextures.speck },
    },
    vertexShader: `
      varying vec3 vWorld;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `
      uniform float time;
      uniform sampler2D map, clouds, knots, speck;
      varying vec3 vWorld;
      varying vec2 vUv;
      void main() {
        vec4 tex = texture2D(map, vUv);
        float lum = dot(tex.rgb, vec3(0.299, 0.587, 0.114));
        float motif = clamp((lum - 0.05) * 5.0, 0.0, 1.0);
        vec2 p = vWorld.xz;
        // la vitre : voile orangé, reflet nuageux qui dérive, entrelacs, paillettes
        float cloud = texture2D(clouds, p * 0.03 + time * vec2(0.004, 0.002)).r;
        float knot = 1.0 - texture2D(knots, vUv).r;
        float spk = pow(texture2D(speck, p * 0.12).r, 8.0);
        vec3 col = vec3(0.3, 0.1, 0.01);
        col += cloud * vec3(0.35, 0.22, 0.1) * 0.35;
        col = mix(col, vec3(0.6, 0.33, 0.08), knot * 0.7);
        col += spk * vec3(1.0, 0.8, 0.5) * 0.5;
        float a = 0.5 + cloud * 0.12 + knot * 0.4;
        // reflet plus vif quand on regarde la vitre de biais
        vec3 v = normalize(vWorld - cameraPosition);
        float grazing = pow(1.0 - abs(v.y), 4.0);
        col += vec3(0.5, 0.35, 0.2) * grazing * 0.25;
        a += grazing * 0.15;
        // les motifs clairs de la texture exportée, pleins
        col = mix(col, tex.rgb * 0.8, motif);
        gl_FragColor = vec4(col, clamp(max(a, motif), 0.0, 1.0));
        #include <colorspace_fragment>
      }`,
  });
}
function seeThrough(mesh) {
  const map = mesh.material.map;
  mesh.material = windowMaterial;
  mesh.renderOrder = -10;
  mesh.receiveShadow = mesh.castShadow = false;
  mesh.add(new THREE.Mesh(mesh.geometry, glassMaterial(map)));
}

// Rendu du jeu d'après extras (tools/obj_to_glb.py) : fusion additive,
// transparente ou découpée, et textures qui défilent (sable, magie).
const scrolling = [];
function wowMaterials(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = o.receiveShadow = false;
    const m = o.material;
    if (SEE_THROUGH.test(m.name)) {
      seeThrough(o);
      return;
    }
    const { blend, scroll } = m.userData;
    if (blend === "add") {
      m.blending = THREE.AdditiveBlending;
      m.transparent = true;
      m.depthWrite = false;
    } else if (blend === "alpha") {
      m.transparent = true;
      m.depthWrite = false;
    } else if (blend === "mod") {
      m.blending = THREE.MultiplyBlending;
      m.premultipliedAlpha = true;
      m.transparent = true;
      m.depthWrite = false;
    } else o.receiveShadow = true;
    if (blend && blend !== "opaque") m.side = THREE.DoubleSide;
    if (scroll && m.map) {
      m.map = m.map.clone();
      m.map.wrapS = m.map.wrapT = THREE.RepeatWrapping;
      m.map.needsUpdate = true;
      scrolling.push({ map: m.map, du: scroll[0], dv: scroll[1] });
    }
    m.metalness = 0;
    m.roughness = 0.9;
  });
}

const models = new Map();
async function model(file) {
  if (!models.has(file)) models.set(file, loader.loadAsync(`assets/models/timeways/${file}`).then((g) => g.scene));
  const scene = await models.get(file);
  const copy = scene.clone(true);
  wowMaterials(copy);
  return copy;
}

// Ciel : le vide des Voies du temps. Étoiles dorées et nébuleuse bleue du
// jeu (7fx_arcane_starfield_holy, temporalconflux), un voile de sable bronze
// qui tourne lentement vers l'horizon.
function createSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false,
    uniforms: {
      time: { value: 0 },
      stars: { value: texture("7fx_arcane_starfield_holy", true) },
      nebula: { value: texture("10dg_dragon_temporalconflux_door02_4546787", true) },
      sand: { value: texture("10dg_dragon_temporalconflux_door02_4546781", true) },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform float time; uniform sampler2D stars; uniform sampler2D nebula; uniform sampler2D sand;
      varying vec3 vDir;
      void main() {
        float lon = atan(vDir.z, vDir.x) / 6.2831853 + 0.5;
        float lat = asin(clamp(vDir.y, -1.0, 1.0)) / 3.14159265 + 0.5;
        // fond : le même indigo sombre partout, dessus comme dessous (pas
        // d'horizon : le plateau flotte dans le vide)
        vec3 col = vec3(0.05, 0.04, 0.08);
        // nébuleuse projetée sur les trois axes, elle aussi (pas de pincement au zénith)
        vec3 nw = pow(abs(vDir), vec3(4.0));
        nw /= nw.x + nw.y + nw.z;
        vec2 drift = vec2(time * 0.002, 0.0);
        vec4 n = texture2D(nebula, vDir.yz * 0.9 + drift) * nw.x + texture2D(nebula, vDir.xz * 0.9 + drift) * nw.y + texture2D(nebula, vDir.xy * 0.9 + drift) * nw.z;
        col += n.rgb * n.a * 0.3;
        // étoiles projetées sur les trois axes (sans étirement aux pôles,
        // qu'on voit en tombant dans le vide)
        vec3 wt = pow(abs(vDir), vec3(4.0));
        wt /= wt.x + wt.y + wt.z;
        vec4 s = texture2D(stars, vDir.yz * 2.2) * wt.x + texture2D(stars, vDir.xz * 2.2) * wt.y + texture2D(stars, vDir.xy * 2.2) * wt.z;
        col += s.rgb * s.a * 0.75;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1200, 48, 24), mat);
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  return { mesh: sky, update: (t) => (mat.uniforms.time.value = t) };
}

// Le vrai ciel des Voies du temps (environments/stars/10xp_timewaysky01) : une
// sphère de 420 m à couches (fond, nuages, étoiles, voiles de lumière). L'export
// ne garde ni les modes de fusion ni les défilements : on les rend d'après la
// nature de chaque texture — nuages et voiles sombres en transparence, étoiles
// et lueurs en additif — et chaque couche tourne lentement, à sa vitesse.
const SKY_LAYERS = {
  "5145882": { blend: "alpha", spin: 0.004, opacity: 0.6 }, // volutes brunes du fond
  starsa: { blend: "add", spin: 0.001 },
  "5145889": { blend: "add", spin: 0.0015 }, // étoiles
  "5145893": { blend: "alpha", spin: 0.006, opacity: 0.4 }, // nuages
  "5145897": { blend: "alpha", spin: 0.005, opacity: 0.4 },
  "5145901": { blend: "alpha", spin: 0.007, opacity: 0.4 },
  // Rubans (lignes temporelles) : dans le jeu, leurs bouts s'effacent et la
  // texture défile le long ; « flow » : défilement (tours de texture par seconde)
  "5145905": { blend: "alpha", spin: -0.004, flow: 0.01, opacity: 0.6 }, // bandes sombres
  "5145913": { blend: "add", spin: 0.002, opacity: 0.5 }, // halo
  "5185073": { blend: "add", spin: -0.006, flow: -0.02, opacity: 0.7 }, // voiles bleus
  "5204998": { blend: "add", spin: 0.008, flow: 0.03, opacity: 0.7 }, // voiles dorés
  // bande d'horizon : dans le jeu, un dégradé de transparence (perdu) l'estompe ;
  // sans lui, c'est un grand aplat rose-blanc
  "5205002": { hidden: true },
  "5205000": { blend: "add", spin: 0.003, flow: 0.025, opacity: 0.7 },
};

// Estompe les bords d'une couche du ciel (rubans et nuages) : dans le jeu, une
// transparence par sommet (perdue) les fond dans le ciel ; sans elle, on voit
// le bout de l'image. Fondu sur les bords de la zone de texture qu'elle occupe :
// 0,6 tour de texture au plus le long d'un ruban, 12 % ailleurs.
function fadeEdges(mat, geometry) {
  const uv = geometry.attributes.uv;
  const idx = geometry.index;
  const lo = [Infinity, Infinity];
  const hi = [-Infinity, -Infinity];
  for (let i = 0; i < idx.count; i++) {
    const k = idx.getX(i);
    lo[0] = Math.min(lo[0], uv.getX(k));
    hi[0] = Math.max(hi[0], uv.getX(k));
    lo[1] = Math.min(lo[1], uv.getY(k));
    hi[1] = Math.max(hi[1], uv.getY(k));
  }
  const w = [Math.min(0.6, (hi[0] - lo[0]) * 0.2), (hi[1] - lo[1]) * 0.15];
  // couche qui fait le tour du ciel (texture répétée plus de deux fois le long
  // de u) : pas de bord en u, seulement en haut et en bas
  if (hi[0] - lo[0] > 2.5) {
    lo[0] = -1e6;
    hi[0] = 1e6;
    w[0] = 1;
  }
  mat.customProgramCacheKey = () => `sky-edges-${lo}-${hi}`;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uLo = { value: new THREE.Vector2(...lo) };
    shader.uniforms.uHi = { value: new THREE.Vector2(...hi) };
    shader.uniforms.uW = { value: new THREE.Vector2(...w) };
    shader.vertexShader = shader.vertexShader.replace("void main() {", "varying vec2 vRaw;\nvoid main() {\n  vRaw = uv;");
    shader.fragmentShader = shader.fragmentShader
      .replace("void main() {", "varying vec2 vRaw;\nuniform vec2 uLo, uHi, uW;\nvoid main() {")
      .replace(
        "#include <alphamap_fragment>",
        `#include <alphamap_fragment>
        vec2 edge = smoothstep(uLo, uLo + uW, vRaw) * smoothstep(uHi, uHi - uW, vRaw);
        diffuseColor.a *= edge.x * edge.y;`,
      );
  };
}

// Estompe une couche en hauteur (sur 35 % de son étendue, en haut et en bas) :
// pour le voile de volutes (5145882), une bande autour de l'horizon dont les
// coordonnées de texture se répètent dans tous les sens, et dont le bord haut
// dessinait une ligne nette au-dessus de l'horizon.
function fadeHeight(mat, geometry) {
  const pos = geometry.attributes.position;
  const idx = geometry.index;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < idx.count; i++) {
    const y = pos.getY(idx.getX(i));
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  const h = (y1 - y0) * 0.35;
  mat.customProgramCacheKey = () => `sky-height-${y0}-${y1}`;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uY = { value: new THREE.Vector3(y0, y1, h) };
    shader.vertexShader = shader.vertexShader.replace("void main() {", "varying float vY;\nvoid main() {\n  vY = position.y;");
    shader.fragmentShader = shader.fragmentShader
      .replace("void main() {", "varying float vY;\nuniform vec3 uY;\nvoid main() {")
      .replace(
        "#include <alphamap_fragment>",
        `#include <alphamap_fragment>
        diffuseColor.a *= smoothstep(uY.x, uY.x + uY.z, vY) * smoothstep(uY.y, uY.y - uY.z, vY);`,
      );
  };
}

async function createWowSky() {
  const gltf = await loader.loadAsync("assets/models/sky/10xp_timewaysky01.glb").catch(() => null);
  if (!gltf) return null;
  const root = new THREE.Group();
  const layers = [];
  let order = -90;
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const key = Object.keys(SKY_LAYERS).find((k) => o.material.name.includes(k));
    const spec = SKY_LAYERS[key] ?? { blend: "alpha", spin: 0 };
    if (spec.hidden) return;
    let map = o.material.map;
    if (spec.flow && map) {
      map = map.clone();
      map.wrapS = THREE.RepeatWrapping;
      map.needsUpdate = true;
    }
    const mat = new THREE.MeshBasicMaterial({
      map,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
      toneMapped: false,
      blending: spec.blend === "add" ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    // toutes les couches ont leurs bords estompés, sauf le fond d'étoiles
    if (/5145882/.test(o.material.name)) fadeHeight(mat, o.geometry);
    else if (!/starsa/.test(o.material.name)) fadeEdges(mat, o.geometry);
    // Maillage à part (sans squelette), qui tourne sur lui-même. Le ciel du jeu
    // est fait pour être vu d'en haut : nuages et voiles au-dessus, bandes
    // sombres en dessous. Ici on voit aussi le dessous (le vide autour du
    // plateau) : chaque couche (hors étoiles, déjà sur toute la sphère) a donc
    // son reflet renversé, tourné d'un autre angle pour ne pas faire miroir.
    mat.opacity = spec.opacity ?? 1;
    const copies = /starsa|5145889/.test(o.material.name) ? [1] : [1, -1];
    for (const flip of copies) {
      // le reflet, plus discret
      let m = mat;
      if (flip < 0) {
        m = mat.clone();
        m.onBeforeCompile = mat.onBeforeCompile;
        m.customProgramCacheKey = mat.customProgramCacheKey;
        m.opacity = mat.opacity * 0.6;
      }
      const mesh = new THREE.Mesh(o.geometry, m);
      mesh.frustumCulled = false;
      mesh.renderOrder = order++;
      mesh.scale.y = flip;
      const pivot = new THREE.Group();
      pivot.rotation.y = flip < 0 ? 2.4 : 0;
      pivot.add(mesh);
      root.add(pivot);
      layers.push({ pivot, spin: spec.spin * flip, map: spec.flow && flip > 0 ? map : null, flow: spec.flow });
    }
  });
  return {
    root,
    update(dt) {
      for (const l of layers) {
        l.pivot.rotation.y += l.spin * dt;
        if (l.map) l.map.offset.x = (l.map.offset.x + l.flow * dt) % 1;
      }
    },
  };
}

export async function createTimeways(onProgress = () => {}) {
  const layout = await (await fetch("assets/models/timeways/layout.json")).json();
  const root = new THREE.Group();
  root.rotation.y = TURN;
  root.scale.setScalar(SCALE);
  root.position.y = -FLOOR_Y * SCALE;

  // sol : hauteurs en centimètres, -32768 pour le vide
  const f = layout.floor;
  const floorBuf = await (await fetch("assets/models/timeways/floor.bin")).arrayBuffer();
  const cells = new Int16Array(floorBuf);
  const cellAt = (i, j) => (i < 0 || j < 0 || i >= f.w || j >= f.h ? -32768 : cells[j * f.w + i]);
  const groundAt = (x, z) => {
    const [hx, hz] = toHub(x, z);
    const gx = (hx - f.x0) / f.cell - 0.5;
    const gz = (hz - f.z0) / f.cell - 0.5;
    const i = Math.floor(gx);
    const j = Math.floor(gz);
    const near = cellAt(Math.round(gx), Math.round(gz));
    if (near === -32768) return -Infinity;
    // interpolation sur les cases pleines voisines
    let sum = 0;
    let w = 0;
    for (const [di, dj] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const c = cellAt(i + di, j + dj);
      if (c === -32768) continue;
      const k = (di ? gx - i : 1 - (gx - i)) * (dj ? gz - j : 1 - (gz - j)) + 1e-4;
      sum += c * k;
      w += k;
    }
    return ((sum / w) / 100 - FLOOR_Y) * SCALE;
  };

  const hub = await model(layout.hub);
  root.add(hub);
  onProgress(0.5);

  // décors du plateau (sabliers, sable qui coule, anneaux sous les plateformes)
  const spinning = [];
  await Promise.all(
    layout.doodads.map(async (d) => {
      const m = await model(d.model);
      m.position.fromArray(d.pos);
      m.quaternion.fromArray(d.quat);
      m.scale.setScalar(d.scale);
      root.add(m);
      if (/rotatingthing/.test(d.model)) spinning.push(m);
    }),
  );
  onProgress(0.75);
  // plateformes voisines, plus bas dans le vide
  await Promise.all(
    layout.neighbours.map(async (d) => {
      const m = await model(d.model);
      m.position.fromArray(d.pos);
      m.rotation.y = d.rotY;
      m.scale.setScalar(d.scale);
      root.add(m);
    }),
  );

  // obstacles : les sabliers posés sur les bras
  const obstacles = [];
  root.updateMatrixWorld(true);
  for (const d of layout.doodads) {
    if (!/hourglasssand/.test(d.model) || d.pos[1] < 0) continue;
    const p = new THREE.Vector3(...d.pos).applyMatrix4(root.matrixWorld);
    obstacles.push({ x: p.x, z: p.z, r: 1.0 }); // la statue fait 1,7 m de large
  }

  const sky = createSky();
  const wowSky = await createWowSky();
  const update = (t, dt) => {
    glassTime.value = t;
    for (const s of scrolling) {
      s.map.offset.x = (s.map.offset.x + s.du * dt) % 1;
      s.map.offset.y = (s.map.offset.y + s.dv * dt) % 1;
    }
    for (const m of spinning) m.rotation.y += dt * 0.15;
    sky.update(t);
    wowSky?.update(dt);
  };
  return { root, sky: sky.mesh, wowSky: wowSky?.root, groundAt, obstacles, update };
}

// Minicarte : le plateau vu du dessus, rendu une fois au chargement, comme
// les cartes du jeu (le vide reste noir).
export function renderMap(renderer, scene, extent) {
  const size = 512;
  const target = new THREE.WebGLRenderTarget(size, size, { colorSpace: THREE.SRGBColorSpace });
  const cam = new THREE.OrthographicCamera(-extent / 2, extent / 2, extent / 2, -extent / 2, 1, 600);
  cam.position.set(0, 300, 0);
  cam.up.set(0, 0, -1);
  cam.lookAt(0, 0, 0);
  const bg = scene.background;
  const fog = scene.fog;
  scene.background = new THREE.Color("#000");
  scene.fog = null;
  renderer.setRenderTarget(target);
  renderer.render(scene, cam);
  const px = new Uint8Array(size * size * 4);
  renderer.readRenderTargetPixels(target, 0, 0, size, size, px);
  renderer.setRenderTarget(null);
  scene.background = bg;
  scene.fog = fog;
  target.dispose();
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) img.data.set(px.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
  // image opaque : les effets additifs (portails, lueurs) laissent un alpha partiel
  for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
  ctx.putImageData(img, 0, 0);
  return canvas;
}
