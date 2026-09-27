// Personnages : le joueur et Chromie.
// Si les vrais modèles exportés du jeu sont présents (voir assets/models/models.json
// ou player.glb / chromie.glb), on les charge avec leurs animations. Sinon, on
// assemble des figurines provisoires animées à la main, assez expressives
// pour régler les contrôles en attendant.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...extra });

function capsule(r, len, material) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 14), material);
  m.castShadow = true;
  return m;
}

function ball(r, material) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), material);
  m.castShadow = true;
  return m;
}

// Membre articulé : un pivot à l'épaule ou à la hanche, le segment pend dessous.
function limb(r, len, material, endR, endMat) {
  const pivot = new THREE.Group();
  const seg = capsule(r, len, material);
  seg.position.y = -len / 2 - r;
  pivot.add(seg);
  if (endR) {
    const end = ball(endR, endMat || material);
    end.position.y = -len - r * 2;
    pivot.add(end);
  }
  return pivot;
}

// Figurine humanoïde : proportions réglables (un gnome a une grosse tête).
function figurine(o) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const hipY = o.leg + o.legR * 2 + 0.08;
  body.position.y = hipY;

  const torso = capsule(o.torsoR, o.torso, o.cloth);
  torso.position.y = o.torso / 2 + o.torsoR * 0.6;
  body.add(torso);
  if (o.skirt) {
    const skirt = new THREE.Mesh(new THREE.ConeGeometry(o.torsoR * 1.7, o.leg * 0.9, 20, 1, true), o.skirt);
    skirt.position.y = -o.leg * 0.25;
    skirt.castShadow = true;
    body.add(skirt);
  }
  const belt = new THREE.Mesh(new THREE.TorusGeometry(o.torsoR * 0.98, o.torsoR * 0.14, 8, 24), o.trim);
  belt.rotation.x = Math.PI / 2;
  belt.position.y = o.torsoR * 0.3;
  body.add(belt);

  const neckY = o.torso + o.torsoR * 1.6;
  const head = new THREE.Group();
  head.position.y = neckY + o.head * 0.85;
  body.add(head);
  head.add(ball(o.head, o.skin));
  const eyeMat = mat("#1b1b1b", { roughness: 0.3 });
  for (const s of [-1, 1]) {
    const eye = ball(o.head * 0.13, eyeMat);
    eye.position.set(s * o.head * 0.36, o.head * 0.12, -o.head * 0.9);
    head.add(eye);
  }
  if (o.ears) {
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(o.head * 0.22, o.head * 0.9, 10), o.skin);
      ear.rotation.z = s * -Math.PI / 2.3;
      ear.position.set(s * o.head * 1.15, o.head * 0.15, 0);
      head.add(ear);
    }
  }
  if (o.hair) o.hair(head, o);

  const arms = [-1, 1].map((s) => {
    const a = limb(o.armR, o.arm, o.cloth, o.armR * 1.25, o.skin);
    a.position.set(s * (o.torsoR + o.armR * 1.1), neckY - o.armR, 0);
    body.add(a);
    if (o.shoulders) {
      const pad = ball(o.armR * 2.3, o.trim);
      pad.scale.y = 0.7;
      pad.position.copy(a.position).add(new THREE.Vector3(s * o.armR * 0.3, o.armR * 0.9, 0));
      body.add(pad);
    }
    return a;
  });
  const legs = [-1, 1].map((s) => {
    const l = limb(o.legR, o.leg, o.pants, o.legR * 1.3, o.boots);
    l.position.set(s * o.torsoR * 0.5, 0.05, 0);
    body.add(l);
    return l;
  });

  if (o.cape) {
    const cape = new THREE.Mesh(new THREE.PlaneGeometry(o.torsoR * 2.2, o.torso * 1.9, 1, 6), o.cape);
    cape.material.side = THREE.DoubleSide;
    cape.position.set(0, neckY - o.torso * 0.95, o.torsoR * 1.05);
    cape.castShadow = true;
    body.add(cape);
    o.capeMesh = cape;
  }

  let phase = 0;
  // Animation procédurale : immobile, marche, course, saut, salut de la main.
  const animate = (dt, st) => {
    const moving = st.speed > 0.1;
    phase += dt * (moving ? 2.2 + st.speed * 1.15 : 1.4);
    const swing = moving ? Math.min(1, st.speed / 7) * 0.95 + 0.25 : 0;
    const dir = st.backwards ? -1 : 1;
    legs[0].rotation.x = Math.sin(phase) * swing * dir;
    legs[1].rotation.x = -Math.sin(phase) * swing * dir;
    arms[0].rotation.x = -Math.sin(phase) * swing * 0.8 * dir;
    arms[1].rotation.x = Math.sin(phase) * swing * 0.8 * dir;
    arms[0].rotation.z = -0.08;
    arms[1].rotation.z = 0.08;
    body.position.y = hipY + (moving ? Math.abs(Math.cos(phase)) * 0.06 * swing : Math.sin(phase) * 0.012);
    body.rotation.x = moving ? -0.12 * Math.min(1, st.speed / 7) * dir : 0;
    if (!st.grounded) {
      legs[0].rotation.x = 0.6;
      legs[1].rotation.x = -0.25;
      arms[0].rotation.x = arms[1].rotation.x = -0.5;
    }
    if (st.wave > 0) {
      arms[1].rotation.z = 2.6 + Math.sin(st.wave * 14) * 0.35;
      arms[1].rotation.x = 0;
    }
    if (st.cheer > 0) {
      arms[0].rotation.z = -2.8;
      arms[1].rotation.z = 2.8;
      body.position.y += Math.abs(Math.sin(st.cheer * 9)) * 0.12;
    }
    if (o.capeMesh) o.capeMesh.rotation.x = 0.12 + swing * 0.5 + Math.sin(phase * 0.5) * 0.04;
    if (st.lookAt) {
      const want = Math.max(-0.9, Math.min(0.9, st.lookAt));
      head.rotation.y += (want - head.rotation.y) * Math.min(1, dt * 5);
    } else head.rotation.y *= 1 - Math.min(1, dt * 3);
  };

  return { root, animate, height: hipY + neckY + o.head * 1.8 };
}

function makePlayerFigurine() {
  return figurine({
    torso: 0.55,
    torsoR: 0.27,
    head: 0.24,
    arm: 0.5,
    armR: 0.085,
    leg: 0.62,
    legR: 0.11,
    skin: mat("#e3b690"),
    cloth: mat("#2a4f93"),
    pants: mat("#5b4128"),
    boots: mat("#2d2118"),
    trim: mat("#c9a24a", { metalness: 0.8, roughness: 0.35 }),
    cape: mat("#8f1d1d"),
    shoulders: true,
    hair: (head, o) => {
      const hair = ball(o.head * 1.04, mat("#4a2d17"));
      hair.scale.set(1, 0.72, 1.05);
      hair.position.set(0, o.head * 0.25, o.head * 0.08);
      head.add(hair);
    },
  });
}

function makeChromieFigurine() {
  const pink = mat("#ff5aa5", { roughness: 0.55 });
  return figurine({
    torso: 0.26,
    torsoR: 0.19,
    head: 0.27,
    arm: 0.24,
    armR: 0.06,
    leg: 0.26,
    legR: 0.075,
    skin: mat("#f4c9a6"),
    cloth: mat("#6c3aa3"),
    pants: mat("#6c3aa3"),
    boots: mat("#4a2a14"),
    trim: mat("#d8a441", { metalness: 0.85, roughness: 0.3 }),
    skirt: mat("#b8772e", { metalness: 0.35, roughness: 0.5, side: THREE.DoubleSide }),
    ears: true,
    hair: (head, o) => {
      const cap = ball(o.head * 1.05, pink);
      cap.scale.set(1, 0.8, 1.05);
      cap.position.set(0, o.head * 0.28, o.head * 0.1);
      head.add(cap);
      for (const s of [-1, 1]) {
        const tail = ball(o.head * 0.55, pink);
        tail.scale.set(0.8, 1.25, 0.8);
        tail.position.set(s * o.head * 1.15, o.head * 0.55, o.head * 0.25);
        head.add(tail);
      }
      // la petite horloge-broche du vol bronze
      const clock = new THREE.Mesh(new THREE.CylinderGeometry(o.head * 0.25, o.head * 0.25, 0.03, 20), mat("#e8c060", { metalness: 0.9, roughness: 0.2 }));
      clock.rotation.x = Math.PI / 2;
      clock.position.set(0, -o.head * 1.35, -o.head * 0.8);
      head.add(clock);
    },
  });
}

// ---------- Vrais modèles (glTF exportés du jeu) ----------

const loader = new GLTFLoader();

async function exists(url) {
  try {
    const r = await fetch(url, { method: "HEAD" });
    return r.ok;
  } catch {
    return false;
  }
}

// Animations reconnues par leur numéro dans le jeu (wow.export les nomme
// « Run (ID 5 variation 0) ») ou, à défaut, par leur nom.
const CLIP_IDS = {
  stand: 0,
  walk: 4,
  run: 5,
  back: 13,
  shuffleLeft: 11,
  shuffleRight: 12,
  jump: 38,
  fall: 40,
  jumpEnd: 39,
  channel: 124,
  readyOmni: 52,
  castOmni: 54,
  castDirected: 53,
  talk: 60,
  talkExclamation: 64,
  talkQuestion: 65,
  bow: 66,
  wave: 67,
  cheer: 68,
  dance: 69,
  laugh: 70,
  applaud: 80,
  point: 84,
  roar: 55,
  rude: 73,
  kneel: 75,
  kiss: 76,
  cry: 77,
  chicken: 78,
  beg: 79,
  shout: 81,
  flex: 82,
  shy: 83,
  salute: 113,
  yes: 185,
  no: 186,
  train: 195,
  sheath: 89,
  handsClosed: 15,
  sitDown: 96,
  sit: 97,
  sitUp: 98,
};
const CLIP_NAMES = {
  stand: /^stand\b|idle/i,
  walk: /^walk(?!back)/i,
  run: /^run\b/i,
  back: /walkback|backwards/i,
  jump: /^jump(?!start|end)/i,
  wave: /wave/i,
  cheer: /cheer/i,
  talk: /^emotetalk\b|talk/i,
};
function findClip(clips, key) {
  const byId = clips.filter((c) => new RegExp(`\\(ID ${CLIP_IDS[key]} `).test(c.name));
  if (byId.length) return byId.find((c) => /variation 0\)/.test(c.name)) || byId[0];
  return CLIP_NAMES[key] ? clips.find((c) => CLIP_NAMES[key].test(c.name)) : undefined;
}

async function loadModel(url, targetHeight) {
  const gltf = await loader.loadAsync(url);
  const model = SkeletonUtils.clone(gltf.scene);
  model.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false; // la boîte englobante ne suit pas les animations
      // reflet des yeux (eyereflect) : additif dans le jeu ; opaque, il couvre
      // les yeux d'un voile blanc
      if (/eyereflect|eyeglow/i.test(o.material.name)) {
        o.material = o.material.clone();
        Object.assign(o.material, { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
        o.castShadow = false;
      }
    }
  });
  const mixer = new THREE.AnimationMixer(model);

  // Mesure sur la pose d'attente réelle (os appliqués) : la pose de repos
  // brute déborde largement de la silhouette. Puis mise à l'échelle sur la
  // hauteur voulue, pieds au sol ; les modèles du jeu regardent vers +x,
  // le monde vers -z : un quart de tour.
  const standClip = findClip(gltf.animations, "stand");
  if (standClip) {
    mixer.clipAction(standClip).play();
    mixer.update(0);
  }
  model.updateMatrixWorld(true);
  const box = new THREE.Box3();
  model.traverse((o) => {
    if (o.isSkinnedMesh) {
      o.computeBoundingBox();
      box.union(o.boundingBox.clone().applyMatrix4(o.matrixWorld));
    } else if (o.isMesh) box.expandByObject(o);
  });
  mixer.stopAllAction();
  const h = box.max.y - box.min.y || 1;
  const s = targetHeight / h;
  model.scale.setScalar(s);
  model.position.y = -box.min.y * s;
  const root = new THREE.Group();
  const turn = new THREE.Group();
  turn.rotation.y = Math.PI / 2;
  turn.add(model);
  root.add(turn);

  const actions = {};
  for (const key of Object.keys(CLIP_IDS)) {
    if (key === "sheath" || key === "handsClosed") continue;
    const clip = findClip(gltf.animations, key);
    if (clip) actions[key] = mixer.clipAction(clip);
  }
  // Animation d'une partie du corps seulement (un os et tout ce qui en dépend),
  // par-dessus l'animation en cours : un second mixeur n'anime que cette partie,
  // et on fond sa pose avec celle du reste du corps (poids w).
  const partial = (key, nodeName) => {
    const clip = findClip(gltf.animations, key);
    const top = model.getObjectByName(nodeName);
    if (!clip || !top) return null;
    const byName = {};
    top.traverse((o) => (byName[o.name] = o));
    // On évalue nous-mêmes les pistes de cette partie : un second mixeur
    // n'écrirait pas une valeur inchangée depuis l'image précédente, alors que
    // le mixeur principal, lui, l'a écrasée entre-temps.
    const tracks = clip.tracks
      .map((t) => {
        const [name, prop] = t.name.split(".");
        const node = byName[name];
        return node && (prop === "quaternion" || prop === "position") ? { node, prop, interp: t.createInterpolant(), v: prop === "quaternion" ? new THREE.Quaternion() : new THREE.Vector3() } : null;
      })
      .filter(Boolean);
    const duration = clip.duration;
    return {
      duration,
      // pose à l'instant t, fondue avec la pose actuelle (poids w)
      apply(t, w) {
        const time = duration > 0 ? Math.min(t, duration) : 0;
        for (const k of tracks) {
          k.v.fromArray(k.interp.evaluate(time));
          if (k.prop === "quaternion") k.node.quaternion.slerp(k.v, w);
          else k.node.position.lerp(k.v, w);
        }
      },
    };
  };
  // Sortir ou ranger l'arme (Sheath) : du bras droit seul (l'épaule droite et
  // tout ce qui en dépend), joué une fois, en fondu à l'entrée et à la sortie.
  const arm = partial("sheath", "bone_ShoulderR_p");
  if (arm) arm.t = -1;
  const armGesture = (dt, wanted) => {
    if (!arm) return;
    const start = wanted && !arm.wanted;
    arm.wanted = wanted;
    if (start) arm.t = 0;
    if (arm.t < 0) return;
    arm.t += dt;
    arm.apply(arm.t, Math.min(1, arm.t / 0.15, Math.max(0, (arm.duration - arm.t) / 0.15)));
    if (arm.t >= arm.duration) arm.t = -1;
  };
  // Arme en main : la main droite fermée sur le manche (HandsClosed, sur les
  // doigts de la main droite seulement)
  const fist = partial("handsClosed", "bone_HandR_p");
  let fistW = 0;
  const grip = (dt, closed) => {
    if (!fist) return;
    fistW = Math.max(0, Math.min(1, fistW + (closed ? dt : -dt) * 5));
    if (fistW > 0) fist.apply(0, fistW);
  };
  // émotes jouées une seule fois, puis retour à l'attente (le cri de guerre est
  // plus court que la réplique : en boucle, il se répéterait)
  const ONCE = ["roar", "bow", "point", "talkExclamation", "talkQuestion", "jumpEnd", "castDirected", "castOmni", "rude", "kiss", "cry", "chicken", "beg", "shout", "flex", "shy", "salute", "yes", "no", "train"];
  const done = new Set();
  for (const key of ONCE) {
    if (!actions[key]) continue;
    actions[key].setLoop(THREE.LoopOnce, 1);
    actions[key].clampWhenFinished = true;
  }
  mixer.addEventListener("finished", (e) => {
    for (const key of ONCE) if (e.action === actions[key]) done.add(key);
  });
  // pas d'animation de recul : la marche jouée à l'envers
  if (!actions.back && actions.walk) {
    actions.back = mixer.clipAction(actions.walk.getClip().clone());
    actions.back.timeScale = -1;
  }
  // variantes d'attente (gestes, regards) jouées de temps en temps
  const fidgets = gltf.animations.filter((c) => /\(ID 0 variation [1-9]/.test(c.name)).map((c) => {
    const a = mixer.clipAction(c);
    a.setLoop(THREE.LoopOnce, 1);
    return a;
  });

  let current = null;
  let fidgeting = null;
  let idleFor = 0;
  let nextFidget = 6 + Math.random() * 8;
  const play = (action) => {
    if (!action || action === current) return;
    action.reset().fadeIn(0.2).play();
    current?.fadeOut(0.2);
    current = action;
  };
  mixer.addEventListener("finished", (e) => {
    if (e.action === fidgeting) {
      fidgeting = null;
      current = e.action;
      play(actions.stand);
    }
  });
  play(actions.stand);

  // S'asseoir par terre (déconnexion) : s'asseoir une fois, rester assis en
  // boucle, se relever une fois quand on se remet à bouger.
  let sitPhase = null;
  const once = (a) => {
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    play(a);
  };
  const sitting = (dt, st) => {
    if (!actions.sit) return false;
    if (st.sitting) {
      if (!sitPhase) {
        sitPhase = "down";
        if (actions.sitDown) once(actions.sitDown);
        else play(actions.sit);
      } else if (sitPhase === "down" && !actions.sitDown?.isRunning()) {
        sitPhase = "sit";
        play(actions.sit);
      }
    } else if (sitPhase === "down" || sitPhase === "sit") {
      sitPhase = "up";
      if (actions.sitUp) once(actions.sitUp);
      else sitPhase = null;
    } else if (sitPhase === "up" && !actions.sitUp.isRunning()) sitPhase = null;
    if (!sitPhase) return false;
    mixer.update(dt);
    return true;
  };

  const animate = (dt, st) => {
    if (sitting(dt, st)) return;
    let key = "stand";
    // en chute (arrivée du ciel) : l'animation « Fall », sinon le saut
    if (!st.grounded) key = st.falling && actions.fall ? "fall" : "jump";
    else if (st.speed > 0.1) key = st.backwards ? "back" : st.speed > 5 ? "run" : "walk";
    // tourner sur place : petits pas chassés, comme en jeu
    else if (st.turning) key = st.turning > 0 ? "shuffleLeft" : "shuffleRight"; else if (st.emote && actions[st.emote] && !done.has(st.emote)) key = st.emote;
    // émote terminée et plus demandée : elle pourra rejouer la prochaine fois
    for (const k of done) if (st.emote !== k) done.delete(k);
    else if (st.wave > 0) key = "wave";
    else if (st.cheer > 0) key = "cheer";

    if (key === "stand") {
      idleFor += dt;
      if (!fidgeting && fidgets.length && idleFor > nextFidget) {
        fidgeting = fidgets[Math.floor(Math.random() * fidgets.length)];
        play(fidgeting);
        idleFor = 0;
        nextFidget = 8 + Math.random() * 10;
      } else if (!fidgeting) play(actions.stand);
    } else {
      idleFor = 0;
      fidgeting = null;
      play(actions[key] || actions.stand);
    }
    mixer.update(dt);
    grip(dt, !!st.drawn);
    armGesture(dt, !!st.sheath);
  };
  return { root, animate, height: targetHeight, real: true };
}

// assets/models/models.json indique où sont les fichiers exportés, par ex.
// { "player": "export/character/human/male/humanmale_hd.gltf",
//   "chromie": "export/creatures/Chromie.gltf" } (chemins relatifs à assets/models).
// Sans ce fichier, on essaie player.glb / chromie.glb.
let manifest = null;
async function modelUrl(key) {
  if (manifest === null) {
    manifest = (await exists("assets/models/models.json")) ? await (await fetch("assets/models/models.json", { cache: "no-cache" })).json() : {};
  }
  if (manifest[key]) return `assets/models/${manifest[key]}`;
  const fallback = `assets/models/${key}.glb`;
  return (await exists(fallback)) ? fallback : null;
}

async function withFallback(key, height, figurine) {
  const url = await modelUrl(key);
  if (url) {
    try {
      return await loadModel(url, height);
    } catch (e) {
      console.warn("Modèle illisible, figurine provisoire à la place :", url, e);
    }
  }
  return figurine();
}

// Équipement de Leeroy, d'après les données du PNJ (Creature 82756 et son
// affichage 57227) : le Devout Mantle aux épaules, et la Blackhand Doomsaw
// (objet 12583, l'arme qu'il affiche). Exports de wow.export (onglet Items),
// accrochés aux os ; décalages réglés à l'œil, dans le repère des os (x devant,
// y en haut, z sur le côté). L'arme d'hast est rangée dans le dos, en
// diagonale ; sortie, elle passe dans la main droite, tenue en travers.
const SHOULDERS = [
  { file: "devout_mantle_l", bone: "bone_ShoulderL", pos: [-0.09, 0.03, -0.21] },
  { file: "devout_mantle_r", bone: "bone_ShoulderR", pos: [-0.09, 0.03, 0.21] },
];
export const WEAPON_SLOTS = {
  // twist : quart de tour sur son propre axe, lame à plat contre le dos
  back: { bone: "bone_Chest", pos: [-0.2, 0, 0], rot: [0.6, 0, -Math.PI / 2, "XYZ"], twist: -Math.PI / 2 },
  // tenue au manche, dans le poing (et non au ras de la lame)
  hand: { bone: "bone_HandR", pos: [0.2, -0.12, 0], rot: [0, 0, 0, "ZYX"] },
};
async function equip(root) {
  const bones = {};
  root.traverse((o) => {
    if (o.isBone) bones[o.name] = o;
  });
  const load = async (file) => {
    const gltf = await loader.loadAsync(`assets/models/items/${file}.glb`).catch(() => null);
    if (!gltf) return null;
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.frustumCulled = false;
    });
    return gltf.scene;
  };
  await Promise.all(
    SHOULDERS.map(async (e) => {
      const item = bones[e.bone] && (await load(e.file));
      if (!item) return;
      item.position.fromArray(e.pos);
      bones[e.bone].add(item);
    }),
  );
  const weapon = await load("blackhand_doomsaw");
  if (!weapon) return null;
  const place = (slot) => {
    const s = WEAPON_SLOTS[slot];
    bones[s.bone]?.add(weapon);
    weapon.position.fromArray(s.pos);
    weapon.rotation.set(...s.rot);
    if (s.twist) weapon.rotateX(s.twist);
  };
  place("back");
  // arme dans la main (true) ou dans le dos (false)
  return { draw: (drawn) => place(drawn ? "hand" : "back"), object: weapon, place };
}

export const loadPlayer = async () => {
  const player = await withFallback("player", 1.95, makePlayerFigurine);
  if (player.real) player.weapon = await equip(player.root);
  return player;
};
export const loadChromie = () => withFallback("chromie", 1.05, makeChromieFigurine);
