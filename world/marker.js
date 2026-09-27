// Marqueur de quête au-dessus de Chromie : les vrais modèles du jeu
// (talktomeorange_new, le « ! » légendaire orange ; talktomequestion_grey, le
// « ? » gris de quête en cours), avec leur animation. Sans les fichiers, un
// « ! » et un « ? » dessinés. Toujours tournés vers la caméra, rien une fois
// la quête rendue.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

function bang() {
  const s = new THREE.Shape();
  // barre évasée vers le haut
  s.moveTo(-0.07, 0.3);
  s.lineTo(0.07, 0.3);
  s.lineTo(0.12, 1.0);
  s.quadraticCurveTo(0, 1.08, -0.12, 1.0);
  s.closePath();
  const dot = new THREE.Shape();
  dot.absarc(0, 0.1, 0.1, 0, Math.PI * 2, false);
  return [s, dot];
}

function question() {
  const hook = new THREE.Shape();
  // crochet : arc extérieur, puis intérieur en sens inverse, puis la tige
  hook.absarc(0, 0.72, 0.3, Math.PI * 1.05, -Math.PI * 0.35, true);
  hook.lineTo(0.07, 0.42);
  hook.lineTo(0.07, 0.3);
  hook.lineTo(-0.07, 0.3);
  hook.lineTo(-0.07, 0.48);
  hook.absarc(0, 0.72, 0.16, -Math.PI * 0.4, Math.PI * 1.05, false);
  hook.closePath();
  const dot = new THREE.Shape();
  dot.absarc(0, 0.1, 0.1, 0, Math.PI * 2, false);
  return [hook, dot];
}

function build(shapes, color, emissive) {
  const geo = new THREE.ExtrudeGeometry(shapes, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.025, bevelSegments: 3, curveSegments: 20 });
  geo.center();
  const group = new THREE.Group();
  const body = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: 0.55, metalness: 0.35, roughness: 0.3 }));
  const outline = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: "#1a0f00", side: THREE.BackSide }));
  outline.scale.setScalar(1.12);
  group.add(outline, body);
  return group;
}

// Modèle du jeu : éclairé par lui-même (comme en jeu, il ne prend pas
// l'ombre), orienté face à la caméra, animation d'attente en boucle.
async function gameMarker(url, height) {
  const gltf = await new GLTFLoader().loadAsync(url);
  const model = gltf.scene;
  model.traverse((o) => {
    if (!o.isMesh) return;
    // Geoset1 est le contour : brun foncé, dessiné derrière, pour que le
    // « ! » et son point passent devant la couronne comme en jeu
    const outline = /Geoset1$/.test(o.name);
    o.material = new THREE.MeshBasicMaterial({
      map: o.material.map,
      color: outline ? "#6b3c12" : "#ffffff",
      transparent: true,
      alphaTest: 0.05,
      side: THREE.DoubleSide,
      depthWrite: !outline,
      polygonOffset: outline,
      polygonOffsetFactor: 2,
      polygonOffsetUnits: 8,
    });
    o.renderOrder = outline ? 1 : 2;
    o.frustumCulled = false;
  });
  const box = new THREE.Box3().setFromObject(model);
  const s = height / (box.max.y - box.min.y);
  model.scale.setScalar(s);
  model.position.y = -box.min.y * s - (box.max.y - box.min.y) * s * 0.5;
  // le marqueur regarde vers +x ; son groupe est tourné vers la caméra (+z) :
  // quart de tour dans l'autre sens que les personnages, sinon on le voit de dos
  const turn = new THREE.Group();
  turn.rotation.y = -Math.PI / 2;
  turn.add(model);
  const mixer = new THREE.AnimationMixer(model);
  if (gltf.animations[0]) mixer.clipAction(gltf.animations[0]).play();
  return { group: turn, mixer };
}

export async function createQuestMarker() {
  const root = new THREE.Group();
  let available;
  let active;
  const mixers = [];
  try {
    const [a, b] = await Promise.all([gameMarker("assets/models/marker-available.glb", 0.6), gameMarker("assets/models/marker-active.glb", 0.55)]);
    available = a.group;
    active = b.group;
    mixers.push(a.mixer, b.mixer);
  } catch {
    available = build(bang(), "#ffd21a", "#b07400");
    active = build(question(), "#b5b5b5", "#3a3a3a");
    root.scale.setScalar(0.55);
  }
  root.add(available, active);

  let state = "available";
  let last = 0;
  return {
    root,
    mixers,
    setState(s) {
      state = s;
    },
    update(t, headPos, camera) {
      for (const m of mixers) m.update(Math.max(0, t - last));
      last = t;
      available.visible = state === "available";
      active.visible = state === "active";
      root.visible = state !== "done";
      root.position.set(headPos.x, headPos.y + (mixers.length ? 0.8 : 0.45 + Math.sin(t * 2.4) * 0.06), headPos.z);
      // face à la caméra, autour de l'axe vertical seulement
      root.rotation.y = Math.atan2(camera.position.x - headPos.x, camera.position.z - headPos.z);
    },
  };
}
