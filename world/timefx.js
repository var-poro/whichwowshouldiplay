// Effets temporels, tirés des exports du jeu (Dragonflight, Aube de l'Infini) :
// - emprunter un portail : les rubans de la Pierre de foyer du Marcheur du temps
//   et un voile doré de téléportation, fixés à l'écran, avec le son du
//   téléporteur temporel (spell_timeportal_teleport) ;
// - le portail qu'ouvre Chromie : une faille temporelle (TimeRift : Open,
//   Hold, Decay) qui s'ouvre, reste ouverte, puis se referme ;
// - la pierre de foyer : comme en jeu (SpellVisual 116995), avec les modèles
//   M2 du sort rendus en entier (particules, fusions, textures animées :
//   world/m2fx.js) ;
// - dans le ciel, des traits de lumière qui filent.
// Les exports glTF ne gardent pas les modes de fusion : les textures de
// lumière et de fumée sont rendues en additif, les pierres opaques.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { edgeGlow, loadM2, m2Instance } from "./m2fx.js?v=2";

const loader = new GLTFLoader();
// seules les pierres de la faille sont opaques (les autres textures « 10pm_ »
// sont du sable et des volutes)
const SOLID = /_520509[13]$/;
// cartes unies de 8 × 8 : dans le jeu, leur couleur et leur opacité sont animées ;
// sans cela, elles feraient de grandes plaques blanches
const FLAT = /^(white|gray)8x8/i;
// le disque de sable doré de la faille : opaque dans l'export, il fait un grand
// aplat jaune ; on le garde très atténué, en mouvement
const SAND_DISC = /_5205087$/;
// Retirés de la faille : le grand disque extérieur (5205089), immobile et plat
// sans l'animation du jeu, et le rayon vertical (energybeam), un bâton de
// lumière qui sortait de l'anneau
const RIFT_HIDDEN = /_5205089$|energybeam/i;

async function loadFx(url) {
  const gltf = await loader.loadAsync(url).catch(() => null);
  if (!gltf) return null;
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    o.castShadow = o.receiveShadow = false;
    const m = o.material;
    // de loin, le brouillard les éteindrait
    m.fog = false;
    if (SOLID.test(m.name)) return;
    // lumière et fumée : sans éclairage, comme dans le jeu
    o.material = new THREE.MeshBasicMaterial({
      name: m.name,
      map: m.map,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
      // les masques de fumée (« _blend ») n'ont pas d'alpha : en additif aussi
      blending: THREE.AdditiveBlending,
      opacity: FLAT.test(m.name) ? 0.15 : 0.75,
    });
  });
  return gltf;
}

// Une instance animée d'un modèle chargé, avec ses matériaux à elle (pour
// pouvoir l'effacer sans toucher aux autres).
function instance(gltf) {
  const root = SkeletonUtils.clone(gltf.scene);
  const mats = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.material = o.material.clone();
    mats.push(o.material);
  });
  const mixer = new THREE.AnimationMixer(root);
  const clip = (name) => gltf.animations.find((c) => c.name.startsWith(name));
  const play = (name, loop = true) => {
    const c = clip(name);
    if (!c) return 0;
    mixer.stopAllAction();
    const a = mixer.clipAction(c);
    a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    a.clampWhenFinished = !loop;
    a.reset().play();
    return c.duration;
  };
  // « k » : la lumière ; « solid » : les pierres (opaques tant qu'elles valent 1)
  const fade = (k, solid = 1) => {
    for (const m of mats) {
      m.userData.base ??= m.opacity;
      if (SOLID.test(m.name)) {
        m.transparent = solid < 1;
        m.opacity = solid;
      } else m.opacity = m.userData.base * k;
    }
  };
  return { root, mixer, play, fade };
}

export async function createTimeFx(scene, { sound, camera, center = new THREE.Vector3() }) {
  const [ribbonsGltf, dissolveGltf, riftGltf, hearth, drakks, ribbons, castHand] = await Promise.all([
    // la Pierre de foyer du Marcheur du temps (Dragonflight) : rubans dorés
    loadFx("assets/models/fx/timewalkers_hearthstone_3.glb"),
    // voile de téléportation fait pour la caméra (Légion, Valhallas)
    loadFx("assets/models/fx/7fx_valhallas_teleportdissolve_camera.glb"),
    loadFx("assets/models/fx/timerift.glb"),
    // l'incantation de la même pierre (modèles M2 complets : world/m2fx.js)
    loadM2("timewalkers_hearthstone"),
    loadM2("drakks_spell"),
    loadM2("timewalkers_hearthstone_3"),
    loadM2("10fx_generic_dragon_bronze_cast_hand_low"),
  ]);
  const live = []; // effets en cours : { update(dt) -> false quand fini }

  // ---------- emprunter un portail ----------
  // Fixé à l'écran : les rubans dorés de la Pierre de foyer du Marcheur du
  // temps tourbillonnent devant la caméra (Stand, puis Decay), puis le voile
  // doré de téléportation (fait pour la caméra) recouvre l'écran et s'efface.
  const TRAVEL = { ribbons: 2, decay: 0.8, veilIn: 1.4, veilPeak: 2.1, end: 3 };
  const TURN = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  function onCamera(obj, camera, dist, lift = 0) {
    const ahead = new THREE.Vector3();
    camera.getWorldDirection(ahead);
    obj.quaternion.copy(camera.quaternion).multiply(TURN);
    obj.position.copy(camera.position).addScaledVector(ahead, dist);
    if (lift) obj.position.addScaledVector(new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion), lift);
  }
  function overlay(gltf) {
    const e = instance(gltf);
    e.root.traverse((o) => {
      if (!o.isMesh) return;
      o.material.depthTest = false;
      o.renderOrder = 999;
    });
    scene.add(e.root);
    return e;
  }
  function travel(camera) {
    sound("time/spell_timeportal_teleport", 0.9);
    const ribbons = ribbonsGltf && overlay(ribbonsGltf);
    const veil = dissolveGltf && overlay(dissolveGltf);
    ribbons?.play("Stand", false);
    veil?.fade(0);
    let t = 0;
    let decaying = false;
    live.push({
      update(dt) {
        t += dt;
        if (ribbons) {
          if (!decaying && t > TRAVEL.ribbons) {
            decaying = true;
            ribbons.play("Decay", false);
          }
          ribbons.mixer.update(dt);
          // le modèle fait 12 m de large : à 9 m, il remplit l'écran
          ribbons.root.scale.setScalar(1);
          onCamera(ribbons.root, camera, 9, -1.6);
          ribbons.fade(Math.min(1, t / 0.3) * Math.max(0, Math.min(1, (TRAVEL.ribbons + TRAVEL.decay - t) / 0.5)));
        }
        if (veil) {
          onCamera(veil.root, camera, 0);
          const k = t < TRAVEL.veilPeak ? (t - TRAVEL.veilIn) / (TRAVEL.veilPeak - TRAVEL.veilIn) : (TRAVEL.end - t) / (TRAVEL.end - TRAVEL.veilPeak);
          veil.fade(Math.max(0, Math.min(1, k)));
        }
        if (t < TRAVEL.end) return true;
        ribbons?.root.removeFromParent();
        veil?.root.removeFromParent();
        return false;
      },
    });
  }

  // ---------- le portail de Chromie : une faille temporelle ----------
  // Elle s'ouvre (Open) pendant que Chromie canalise, reste ouverte (Hold),
  // et se referme (Decay) quand on s'éloigne. « instant » : déjà ouverte.
  // Dans le jeu, l'ouverture fait sortir les pierres du sol pour former
  // l'anneau (os animés, exportés) et allume la faille (transparence animée,
  // perdue à l'export) : on refait l'allumage et l'extinction en fondu.
  function rift(pos, yaw, { instant = false, scale = 0.6 } = {}) {
    if (!riftGltf) return { close() {} };
    const r = instance(riftGltf);
    // Lumière adoucie (sans les dégradés du jeu, le cœur de la faille éblouit),
    // et remise en mouvement : dans le jeu, sable et volutes défilent ; chaque
    // texture de lumière glisse ici à sa vitesse.
    const flows = [];
    r.root.traverse((o) => {
      if (!o.isMesh || SOLID.test(o.material.name)) return;
      const m = o.material;
      if (RIFT_HIDDEN.test(m.name)) {
        o.visible = false;
        return;
      }
      m.opacity *= SAND_DISC.test(m.name) ? 1.2 : 0.6;
      // Le disque de sable : dans le jeu, des bandes de sable qui coulent (ses
      // coordonnées de texture couvrent près de trois hauteurs d'image, faites
      // pour défiler) ; il s'estompe vers son bord (rayon de 4,2 m autour du
      // centre de l'anneau, à 4,2 m de haut dans le modèle) au lieu d'un
      // cercle net.
      if (SAND_DISC.test(m.name) && m.map) {
        m.map = m.map.clone();
        m.map.wrapS = m.map.wrapT = THREE.RepeatWrapping;
        m.map.needsUpdate = true;
        flows.push({ map: m.map, du: 0, dv: 0.18 });
        m.onBeforeCompile = (shader) => {
          shader.vertexShader = shader.vertexShader.replace("void main() {", "varying vec3 vDisc;\nvoid main() {\n  vDisc = position;");
          shader.fragmentShader = shader.fragmentShader
            .replace("void main() {", "varying vec3 vDisc;\nvoid main() {")
            .replace(
              "#include <alphamap_fragment>",
              `#include <alphamap_fragment>
              diffuseColor.a *= smoothstep(4.3, 1.8, length(vDisc.yz - vec2(4.2, 0.0)));`,
            );
        };
      }
      // seules les volutes défilent (les disques et dégradés sont faits pour
      // rester en place : décalés, ils sortiraient du cadre)
      if (m.map && /wisp|smoke|sand|streak|energybeam|dirt|wind/i.test(m.name) && !SAND_DISC.test(m.name)) {
        m.map = m.map.clone();
        m.map.wrapS = m.map.wrapT = THREE.RepeatWrapping;
        m.map.needsUpdate = true;
        flows.push({ map: m.map, du: (Math.random() - 0.5) * 0.08, dv: 0.05 + Math.random() * 0.08 });
      }
    });
    // posée au sol comme dans le jeu (origine du modèle) ; l'anneau, à 5,2 m
    // dans le modèle, tombe au centre des autres portails (3,1 m)
    r.root.rotation.y = yaw - Math.PI / 2;
    r.root.position.set(pos.x, pos.y, pos.z);
    r.root.scale.setScalar(scale);
    scene.add(r.root);
    let t = 0;
    let phase = instant ? "hold" : "open";
    let openDur = 0;
    let decayT = 0;
    let decayDur = 3.3;
    if (instant) r.play("Hold");
    else {
      openDur = r.play("Open", false) || 1.8;
      r.fade(0);
      // le son du retour dans le temps (spell_reversetime_cast)
      sound("time/spell_reversetime_cast", 0.7);
    }
    live.push({
      update(dt) {
        t += dt;
        r.mixer.update(dt);
        for (const f of flows) {
          f.map.offset.x = (f.map.offset.x + f.du * dt) % 1;
          f.map.offset.y = (f.map.offset.y + f.dv * dt) % 1;
        }
        // la faille respire : sa lumière enfle et retombe doucement
        if (phase === "hold") r.fade(0.8 + 0.2 * Math.sin(t * 1.7));
        if (phase === "open") {
          // la lumière s'allume quand les pierres ont presque rejoint l'anneau
          const k = Math.max(0, Math.min(1, (t / openDur - 0.35) / 0.65));
          r.fade(k * k * (3 - 2 * k));
          if (t > openDur) {
            phase = "hold";
            r.play("Hold");
          }
        }
        if (phase === "decay") {
          decayT += dt;
          // la lumière s'éteint vite, l'anneau se disloque, les pierres s'effacent
          const k = decayT / decayDur;
          r.fade(Math.max(0, 1 - decayT / 0.8), Math.max(0, 1 - k));
          if (k >= 1) {
            r.root.removeFromParent();
            return false;
          }
        }
        return true;
      },
    });
    return {
      close() {
        if (phase === "decay") return;
        phase = "decay";
        decayDur = r.play("Decay", false) || 3.3;
        // elle se referme au son du voyage de Chromie vers le passé
        sound(`chromie/spell_825_chromie_time_travel_backward_cast_0${1 + Math.floor(Math.random() * 2)}`, 0.6);
      },
    };
  }

  // ---------- le ciel : des traits de lumière qui filent ----------
  let nextStreak = 2;
  const pointOnSky = (radius, minY, maxY) => {
    const a = Math.random() * Math.PI * 2;
    return new THREE.Vector3(center.x + Math.cos(a) * radius, center.y + minY + Math.random() * (maxY - minY), center.z + Math.sin(a) * radius);
  };

  // trait de lumière : un ruban additif (tête vive, queue qui s'efface) qui
  // file le long du ciel
  const streakTex = (() => {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 16;
    const ctx = c.getContext("2d");
    const g = ctx.createLinearGradient(0, 0, 256, 0);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.85, "rgba(255,255,255,0.8)");
    g.addColorStop(1, "rgba(255,255,255,1)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 16);
    const v = ctx.createLinearGradient(0, 0, 0, 16);
    v.addColorStop(0, "rgba(0,0,0,1)");
    v.addColorStop(0.5, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,1)");
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, 256, 16);
    return new THREE.CanvasTexture(c);
  })();
  const STREAK_COLORS = ["#ffd27a", "#8fd8ff", "#c79bff", "#ffe9b0"];
  function streak() {
    const radius = 170 + Math.random() * 60;
    const start = pointOnSky(radius, 20, 110);
    const n = new THREE.Vector3().subVectors(center, start).normalize();
    // direction tangente au ciel, un peu penchée
    const dir = new THREE.Vector3().crossVectors(n, new THREE.Vector3(0, 1, 0)).normalize();
    if (Math.random() < 0.5) dir.negate();
    dir.y = (Math.random() - 0.6) * 0.5;
    dir.normalize();
    const len = 30 + Math.random() * 40;
    const mat = new THREE.MeshBasicMaterial({ map: streakTex, color: STREAK_COLORS[Math.floor(Math.random() * STREAK_COLORS.length)], transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(len, 2.4), mat);
    mesh.frustumCulled = false;
    const y = new THREE.Vector3().crossVectors(n, dir).normalize();
    const place = (p) => {
      mesh.matrix.makeBasis(dir, y, n).setPosition(p.clone().addScaledVector(dir, -len / 2));
      mesh.matrixWorldNeedsUpdate = true;
    };
    mesh.matrixAutoUpdate = false;
    const pos = start.clone();
    place(pos);
    scene.add(mesh);
    const speed = 120 + Math.random() * 80;
    const life = 1.2 + Math.random() * 0.8;
    let t = 0;
    if (Math.random() < 0.5) sound("Spell_RO_GrapplingHook_Whoosh_Cast_01", 0.025);
    live.push({
      update(dt) {
        t += dt;
        pos.addScaledVector(dir, speed * dt);
        place(pos);
        mat.opacity = Math.min(1, t / 0.15) * Math.max(0, Math.min(1, (life - t) / 0.4));
        if (t < life) return true;
        mesh.removeFromParent();
        mesh.geometry.dispose();
        mat.dispose();
        return false;
      },
    });
  }

  // ---------- incantation de la pierre de foyer ----------
  // Données du jeu, sort 375357 (Pierre de foyer du Marcheur du temps),
  // SpellVisual 116995, rendues avec leurs vrais modèles M2 (world/m2fx.js) :
  // - précast (kit 159673, de l'ordre d'incanter à la fin) : animation
  //   ReadySpellOmni (côté main.js) ; timewalkers_hearthstone à 0,35 dans
  //   chaque « main de sort » (points d'attache 21 et 22 du M2 : SpellHandL/R) ;
  //   drakks_spell à 0,5 au point « Base » (19), 2 m plus bas, tangage de −90°
  //   (son axe avant devient la verticale : un tourbillon de sable qui monte),
  //   qui n'apparaît qu'après 5 s (StartDelay) ; un liseré doré sur le
  //   personnage (EdgeGlowEffect 4000 : 10 s, apparition en 3 s, Fresnel 1,6,
  //   couleur (0,678 ; 0,616 ; 0,290) × 2, courbe 106 linéaire) ;
  // - chaque modèle joue Stand (naissance), puis Hold en boucle, puis Decay
  //   à l'arrêt (fin ou interruption), et s'en va quand ses particules sont
  //   éteintes ;
  // - incantation réussie (kit 159676) : SpellCastOmni (main.js),
  //   10fx_generic_dragon_bronze_cast_hand_low (particules seules) dans chaque
  //   main, timewalkers_hearthstone_3 à 0,25 sur le personnage (attache −1) ;
  // - arrivée (kit 159674, sur la cible, donc le personnage) : un éclair du
  //   même liseré (EdgeGlowEffect 4001 : 0,5 s, s'efface en 0,5 s).
  const HEARTH = {
    glow: { color: [0.678, 0.616, 0.29], power: 1.6, multiplier: 2, fadeIn: 3 },
    arrive: { color: [0.749, 0.694, 0.294], power: 1.6, multiplier: 2, fadeOut: 0.5 },
    groundDelay: 5,
  };
  // une instance M2 vivante : Stand, puis Hold en boucle ; end() : Decay,
  // puis retrait quand les particules sont éteintes
  function m2Live(model, parent, setup) {
    const e = m2Instance(model, scene);
    setup?.(e.root);
    parent.add(e.root);
    const standDur = e.play(0, !e.has(158));
    if (e.has(158)) e.onEnd(() => e.play(158, true));
    let ending = false;
    let gone = false;
    const item = {
      update(dt) {
        e.update(dt, camera);
        if (ending && gone && !e.alive()) {
          e.dispose();
          return false;
        }
        return true;
      },
    };
    live.push(item);
    return {
      standDur,
      end() {
        if (ending) return;
        ending = true;
        const done = () => {
          gone = true;
          e.root.removeFromParent();
          e.stopEmitting();
        };
        if (e.has(159)) {
          e.play(159, false);
          e.onEnd(done);
        } else done();
      },
    };
  }
  // un modèle joué une fois (Stand), puis Decay, puis retrait
  function m2Once(model, parent, setup) {
    const h = m2Live(model, parent, setup);
    let t = 0;
    live.push({
      update(dt) {
        t += dt;
        if (t < h.standDur) return true;
        h.end();
        return false;
      },
    });
    return h;
  }
  function modelFrame(body) {
    // le repère du modèle du personnage (celui du M2 : X devant, Z en haut)
    const g = new THREE.Group();
    g.rotation.y = Math.PI / 2;
    body.add(g);
    return g;
  }

  function channel(hands, body) {
    if (!hearth) return { stop() {} };
    // liseré d'abord (il ne doit pas prendre les effets accrochés ensuite)
    const glow = body && edgeGlow(body, HEARTH.glow);
    const fx = hands.filter(Boolean).map((hand) => m2Live(hearth, hand, (r) => r.scale.setScalar(0.35)));
    const frame = body && modelFrame(body);
    let ground = null;
    let t = 0;
    let over = false;
    live.push({
      update(dt) {
        if (over) return false;
        t += dt;
        glow?.set(Math.min(1, t / HEARTH.glow.fadeIn));
        if (!ground && drakks && frame && t >= HEARTH.groundDelay) {
          ground = m2Live(drakks, frame, (r) => {
            r.position.y = -2;
            r.rotation.z = Math.PI / 2;
            r.scale.setScalar(0.5);
          });
        }
        return true;
      },
    });
    return {
      stop(ok) {
        if (over) return;
        over = true;
        glow?.dispose();
        for (const e of fx) e.end();
        ground?.end();
        // le cadre reste le temps du Decay du tourbillon
        setTimeout(() => frame?.removeFromParent(), 3000);
        if (ok && body) depart(hands, body);
      },
    };
  }
  function depart(hands, body) {
    if (castHand) for (const hand of hands.filter(Boolean)) m2Once(castHand, hand);
    if (ribbons) {
      const frame = modelFrame(body);
      m2Once(ribbons, frame, (r) => r.scale.setScalar(0.25));
      setTimeout(() => frame.removeFromParent(), 4000);
    }
    // l'arrivée : un éclair doré qui s'efface
    const flash = edgeGlow(body, HEARTH.arrive);
    let t = 0;
    live.push({
      update(dt) {
        t += dt;
        flash.set(1 - t / HEARTH.arrive.fadeOut);
        if (t < HEARTH.arrive.fadeOut) return true;
        flash.dispose();
        return false;
      },
    });
  }

  return {
    travel,
    rift,
    channel,
    streak,
    update(dt, { sky = true } = {}) {
      if (sky) {
        nextStreak -= dt;
        if (nextStreak <= 0) {
          nextStreak = 1.5 + Math.random() * 4;
          streak();
          // parfois une gerbe
          if (Math.random() < 0.25) setTimeout(streak, 150);
        }
      }
      for (let i = live.length - 1; i >= 0; i--) if (!live[i].update(dt)) live.splice(i, 1);
    },
  };
}
