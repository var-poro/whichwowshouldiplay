// Effets de l'arrivée du ciel, tirés des exports du jeu (spells/) :
// - pendant la chute, la traînée de « Jump to Skyhold » (7fx_warrior_skyjump_state :
//   un fuseau de 10 m texturé d'étoiles) autour du personnage ;
// - à l'impact, le modèle animé du Bond héroïque (warrior_heroic_leap : onde
//   de choc qui s'étend, éclair, étoile, sol fendu) et le cratère de Skyhold
//   (7fx_warrior_skyjump_impact : fissures sombres, et fissures incandescentes
//   qui refroidissent).
// Les exports glTF ne gardent ni les particules, ni les modes de fusion, ni la
// transparence animée : on rend les lueurs en additif et on fait s'effacer
// chaque couche nous-mêmes.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const loader = new GLTFLoader();
const texLoader = new THREE.TextureLoader();
const ADDITIVE = /star|glow|beam|shockwave|starfield|vfx/i;

function additive(root) {
  const mats = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    o.castShadow = o.receiveShadow = false;
    const m = o.material.clone();
    o.material = m;
    m.transparent = true;
    m.depthWrite = false;
    m.side = THREE.DoubleSide;
    if (ADDITIVE.test(m.name)) m.blending = THREE.AdditiveBlending;
    mats.push(m);
  });
  return mats;
}

function decal(file, size, blending) {
  const tex = texLoader.load(`assets/textures/fx/${file}.png`);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending, opacity: 0, polygonOffset: true, polygonOffsetFactor: -4 }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.visible = false;
  return mesh;
}

export async function createJumpFx(scene) {
  const [leapGltf, trailGltf] = await Promise.all([
    loader.loadAsync("assets/models/fx/warrior_heroic_leap.glb").catch(() => null),
    loader.loadAsync("assets/models/fx/7fx_warrior_skyjump_state.glb").catch(() => null),
  ]);

  // traînée : suit le personnage, étoiles qui défilent vers le haut
  const trail = trailGltf?.scene ?? new THREE.Group();
  const trailMats = additive(trail);
  const trailMaps = trailMats.map((m) => {
    if (!m.map) return null;
    m.map = m.map.clone();
    m.map.wrapS = m.map.wrapT = THREE.RepeatWrapping;
    m.map.needsUpdate = true;
    return m.map;
  });
  trail.visible = false;
  scene.add(trail);
  let trailFade = 0;

  // impact du Bond héroïque, joué une fois
  const leap = leapGltf?.scene ?? new THREE.Group();
  const leapMats = additive(leap);
  // Sans les modes de fusion du jeu, les ondes font de gros anneaux blancs et
  // jaunes : l'onde de choc, la couronne d'étoiles, le halo posé à plat
  // (Geoset1) et l'anneau qui s'élargit (beam1). On les retire ; restent
  // l'éclair vertical et le sol fendu.
  leap.traverse((o) => {
    if (o.isMesh && (/shockwave|star2|beam1/i.test(o.material.name) || /_Geoset1$/.test(o.name))) o.visible = false;
  });
  leap.scale.setScalar(0.6);
  leap.visible = false;
  scene.add(leap);
  const mixer = leapGltf ? new THREE.AnimationMixer(leap) : null;
  const action = leapGltf?.animations[0] ? mixer.clipAction(leapGltf.animations[0]) : null;
  action?.setLoop(THREE.LoopOnce, 1);
  let leapT = -1;

  // cratère de Skyhold : fissures sombres (durent), fissures incandescentes (refroidissent)
  const cracks = decal("cracks_regular_2", 10, THREE.NormalBlending);
  const glow = decal("cracks_regular_2_glow", 10, THREE.AdditiveBlending);
  glow.material.color.set("#ffb060");
  scene.add(cracks, glow);
  let craterT = -1;

  return {
    // pendant la chute : la traînée entoure le personnage
    fall(pos) {
      trail.visible = true;
      trailFade = 1;
      trail.position.copy(pos);
      for (const m of trailMats) m.opacity = 1;
    },
    // l'atterrissage : onde, éclair, cratère
    impact(pos) {
      trailFade = 0.999;
      leap.position.copy(pos);
      leap.visible = true;
      for (const m of leapMats) m.opacity = 1;
      action?.reset().play();
      leapT = 0;
      for (const d of [cracks, glow]) {
        d.position.set(pos.x, pos.y + 0.05, pos.z);
        d.rotation.z = Math.random() * Math.PI * 2;
        d.visible = true;
      }
      craterT = 0;
    },
    update(dt) {
      for (const map of trailMaps) if (map) map.offset.y = (map.offset.y - dt * 1.6) % 1;
      if (trailFade < 1 && trailFade > 0) {
        trailFade = Math.max(0, trailFade - dt * 3);
        for (const m of trailMats) m.opacity = trailFade;
        if (trailFade === 0) trail.visible = false;
      }
      if (leapT >= 0) {
        leapT += dt;
        mixer?.update(dt);
        // l'onde et l'éclair ne vivent qu'un instant, le sol fendu un peu plus
        const k = Math.max(0, 1 - leapT / 1.1);
        for (const m of leapMats) m.opacity = /crackedground/i.test(m.name) ? Math.max(0, 1 - leapT / 2.5) : k;
        if (leapT > 2.5) {
          leap.visible = false;
          leapT = -1;
        }
      }
      if (craterT >= 0) {
        craterT += dt;
        glow.material.opacity = craterT < 0.15 ? craterT / 0.15 : Math.max(0, 1 - (craterT - 0.15) / 2.5);
        cracks.material.opacity = Math.min(0.9, craterT * 8) * Math.max(0, 1 - Math.max(0, craterT - 4) / 2);
        if (craterT > 6) {
          cracks.visible = glow.visible = false;
          craterT = -1;
        }
      }
    },
  };
}
