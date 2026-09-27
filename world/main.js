// Le monde : le Carrefour des époques, au cœur des Grottes du Temps. On va
// parler à Chromie pour ouvrir la quête (la fenêtre du quiz, app.js), puis
// on franchit le portail de la version qu'elle a désignée.
// Contrôles comme en jeu : ZQSD/WASD, clic droit maintenu pour diriger,
// clic gauche maintenu pour regarder autour, les deux pour avancer, molette
// pour zoomer, espace pour sauter, Verr. num pour la course automatique.

import * as THREE from "three";
import { loadChromie, loadPlayer } from "./characters.js?v=26";
import { createAudio } from "./audio.js?v=4";
import { createHud } from "./hud.js?v=16";
import { createMenu } from "./menu.js?v=6";
import { createShop } from "./shop.js?v=2";
import { createJumpFx } from "./fx.js?v=11";
import { createTimeFx } from "./timefx.js?v=34";
import { createGlue } from "./glue.js?v=10";
import { createDust, createHourglass, createPortals } from "./props.js?v=34";
import { createQuestMarker } from "./marker.js?v=2";
import { settings } from "./settings.js?v=2";
import { createTimeways, LAYOUT, renderMap } from "./timeways.js?v=33";

const RUN = 7; // mètres par seconde, la vitesse de course du jeu
const BACK = 4.5;
const TURN = 3.1; // radians par seconde au clavier
const JUMP = 8.4;
const GRAVITY = 22;
const TALK_RANGE = 6;
const LEAVE_RANGE = 12;

const CHROMIE_LINES = {
  idle: [
    "Don't mind the hourglass. It's fine. It's always fine.",
    "Has anyone seen my sand timer? No, the other one.",
    "Right-click me! It's customary. And polite.",
    "I've seen this conversation before. You were wearing different boots.",
    "Every timeline has a you in it. This one has the best hair.",
    "Nozdormu says hi. Or will say. Or said. Tenses are hard.",
    "The Infinite Dragonflight would love for you to NOT talk to me. Just saying.",
  ],
  far: ["Come back when you're done sightseeing!", "Take your time! Literally, I have plenty."],
  done: ["Off you go, your timeline awaits!", "Tell your friends. Or yourself, from the future.", "Paradox avoided. Mostly."],
};
const pick = (list) => list[Math.floor(Math.random() * list.length)];

const canvas = document.getElementById("world");
const hud = createHud(document.getElementById("world-ui"));
// Écrans d'accueil : connexion tout de suite (le monde se charge derrière),
// puis choix du personnage, puis chargement et entrée dans le monde.
let mode = "login"; // login → select → game
const glue = createGlue({
  level: () => window.QuizUI?.level() ?? 1,
  onCharSelect: (on = true) => (mode = on === false ? "login" : "select"),
  onRotate: (d) => (selYaw += d),
  onEnterWorld: () => {
    mode = "loading";
    hud.playLoading(startGame);
  },
});
const audio = createAudio();
// Déconnexion : Leeroy s'assoit pendant le compte à rebours, comme en jeu
let sitting = false;
let dead = false; // tombé dans le vide, en attendant de libérer l'esprit
const menu = createMenu({
  onLogout: () => location.reload(),
  onLogoutStart: () => {
    sitting = true;
    chromieVoice?.(CHROMIE_VO.logout);
  },
  onLogoutCancel: () => (sitting = false),
});
const shop = createShop({ onLogout: () => location.reload() });
const ach = await import("./achievements.js?v=7")
  .then((mod) => mod.createAchievements({ onEarned: (a) => hud.chat(`[Leeroy Jenkins] has earned the achievement [${a.name}]!`, "achievement") }))
  .catch(() => null);
// le sac à dos (touche B), chargé s'il existe, comme les hauts faits
const bag = await import("./inventory.js?v=12").then((mod) => mod.createInventory()).catch(() => null);

// ---------- micro-boutons (barre du bas, à droite de la barre d'XP, avant les sacs) ----------
// Textures de Classic (UI-MicroButton-*) : hauts faits, journal de quêtes,
// carte du monde, menu du jeu. Au survol, l'info-bulle du jeu avec le raccourci.
const microBar = document.createElement("div");
microBar.className = "micro-bar";
function microButton(cls, onclick) {
  const b = document.createElement("button");
  b.className = `micro-btn ${cls}`;
  b.onclick = onclick;
  return b;
}
const MICRO_TIPS = {
  "micro-ach": ["Achievements (Y)", "Browse your achievements."],
  "micro-quest": ["Quest Log (L)", "Keep track of your quests."],
  "micro-world": ["World Map (M)", "Shows the map of the zone."],
  "micro-menu": ["Main Menu (Escape)", "Adjust your options, or log out."],
};
microBar.append(
  ...[
    document.querySelector(".micro-ach"),
    microButton("micro-quest", () => window.QuizUI?.toggleLog()),
    microButton("micro-world", () => hud.toggleWorldMap()),
    document.querySelector(".micro-menu"),
  ].filter(Boolean),
);
for (const b of microBar.children) {
  const [name, desc] = MICRO_TIPS[[...b.classList].find((c) => MICRO_TIPS[c])] || [];
  b.setAttribute("aria-label", name || "");
  b.addEventListener("pointerenter", () => hud.showObjectTip(name, desc));
  b.addEventListener("pointerleave", () => hud.hideObjectTip());
}
document.body.append(microBar);
// quêtes rendues lors d'une visite précédente : leurs hauts faits aussi
for (const id of window.QuizUI?.doneQuests() ?? []) ach?.unlock(id === "verdict" ? "verdict" : `quest-${id}`);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog("#2a1e14", 90, 420);
const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 2600);

// lumière des Voies du temps : chaude et dorée d'en haut, bleutée par en dessous
const sunDir = new THREE.Vector3(0.35, 0.85, 0.4).normalize();
scene.add(new THREE.HemisphereLight("#ffe2b0", "#3a4a7a", 1.8));
const sun = new THREE.DirectionalLight("#ffd9a0", 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 260 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.5;
sun.position.copy(sunDir).multiplyScalar(120);
scene.add(sun, sun.target);

const tick = () => new Promise((r) => requestAnimationFrame(() => r()));

function resize() {
  const w = innerWidth;
  const h = innerHeight;
  // 1,5 au plus : sur écran Retina, 2 rend quatre fois plus de pixels pour un gain à peine visible
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5) * settings.get().renderScale);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  // l'interface du monde a sa propre échelle : elle doit tenir autour de la scène
  document.documentElement.style.setProperty("--hud", Math.min(1.25, w / 820, h / 620).toFixed(2));
}
addEventListener("resize", resize);
resize();

// réglages Vidéo du menu, appliqués à la volée (et l'animation du texte de quête, lue par app.js)
settings.onChange((s) => {
  window.QUEST_TEXT_ANIMATION = s.questText;
  sun.castShadow = s.shadows;
  scene.fog.far = s.viewDistance;
  scene.fog.near = Math.min(80, s.viewDistance * 0.2);
  resize();
});

// ---------- chargement ----------

hud.setProgress(0.05);
await tick();
const zone = await createTimeways((p) => hud.setProgress(0.05 + p * 0.4));
const { groundAt } = zone;
const ground = zone.root;
scene.add(zone.root);
hud.setProgress(0.45);
await tick();
// minicarte : le plateau vu du dessus, sans le ciel
hud.setMap(renderMap(renderer, scene, LAYOUT.extent), LAYOUT.extent);
// Le ciel se dessine à part, comme un ciel du jeu : centré sur la caméra (il ne
// se rapproche jamais, ses nuages restent à l'infini), puis le monde par-dessus.
const skyScene = new THREE.Scene();
const skyCamera = new THREE.PerspectiveCamera(camera.fov, camera.aspect, 0.1, 3000);
skyScene.add(zone.sky);
if (zone.wowSky) skyScene.add(zone.wowSky);
function render() {
  skyCamera.quaternion.copy(camera.quaternion);
  if (skyCamera.fov !== camera.fov || skyCamera.aspect !== camera.aspect) {
    skyCamera.fov = camera.fov;
    skyCamera.aspect = camera.aspect;
    skyCamera.updateProjectionMatrix();
  }
  renderer.render(skyScene, skyCamera);
  renderer.autoClear = false;
  renderer.render(scene, camera);
  renderer.autoClear = true;
}
const hourglass = await createHourglass(groundAt);
const gates = createPortals(groundAt, LAYOUT.portals);
const marker = await createQuestMarker();
const dust = createDust();
scene.add(hourglass.root, dust.points, marker.root, ...gates.portals.map((p) => p.root));
hud.setProgress(0.6);
const [player, chromie] = await Promise.all([loadPlayer(), loadChromie()]);

// Portraits des cadres : comme dans le jeu, un rendu 3D du visage du modèle.
function portrait(model, faceHeight, distance) {
  const size = 128;
  const target = new THREE.WebGLRenderTarget(size, size, { colorSpace: THREE.SRGBColorSpace });
  const studio = new THREE.Scene();
  studio.background = new THREE.Color("#1b1510");
  studio.add(new THREE.HemisphereLight("#fff4e0", "#3a2a18", 2.2));
  const key = new THREE.DirectionalLight("#ffffff", 2.4);
  key.position.set(0.6, 1.5, -2);
  studio.add(key);
  const parent = model.root.parent;
  const was = { pos: model.root.position.clone(), rot: model.root.rotation.y };
  model.root.position.set(0, 0, 0);
  model.root.rotation.y = 0;
  // la pose de repos a les paupières closes : on laisse jouer l'attente un instant
  for (let i = 0; i < 40; i++) model.animate(0.025, { speed: 0, grounded: true });
  studio.add(model.root);
  const cam = new THREE.PerspectiveCamera(28, 1, 0.01, 20);
  cam.position.set(0.12 * distance, faceHeight + 0.02, -distance);
  cam.lookAt(0, faceHeight, 0);
  renderer.setRenderTarget(target);
  renderer.render(studio, cam);
  const px = new Uint8Array(size * size * 4);
  renderer.readRenderTargetPixels(target, 0, 0, size, size, px);
  renderer.setRenderTarget(null);
  studio.remove(model.root);
  parent?.add(model.root);
  model.root.position.copy(was.pos);
  model.root.rotation.y = was.rot;
  target.dispose();
  // l'image lue est à l'envers (bas en haut) : on la retourne sur une toile
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) img.data.set(px.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL();
}
if (player.real) hud.setPortrait("player", portrait(player, player.height * 0.9, 0.6));
if (chromie.real) hud.setPortrait("target", portrait(chromie, chromie.height * 0.8, 0.75));
scene.add(player.root, chromie.root);
let chromieHead = null;
chromie.root.traverse((o) => {
  if (o.name === "bone_Head") chromieHead = o;
});
const NAME_RANGE = 30;
// état d'origine des matériaux du joueur, rétabli quand il redevient opaque
player.root.traverse((o) => {
  if (!o.isMesh) return;
  for (const mat of [o.material].flat()) {
    mat.userData.wasTransparent = mat.transparent;
    mat.userData.wasDepthWrite = mat.depthWrite;
  }
});
hud.setProgress(0.85);

// Chromie, face à l'arrivée ; une zone invisible pour la viser à la souris
const chromiePos = new THREE.Vector3(LAYOUT.chromie.x, groundAt(LAYOUT.chromie.x, LAYOUT.chromie.y), LAYOUT.chromie.y);
chromie.root.position.copy(chromiePos);
const hitbox = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, chromie.height + 0.4, 12), new THREE.MeshBasicMaterial({ visible: false }));
hitbox.position.y = (chromie.height + 0.4) / 2;
chromie.root.add(hitbox);

const me = {
  pos: new THREE.Vector3(LAYOUT.spawn.x, 0, LAYOUT.spawn.y),
  vy: 0,
  grounded: true,
  yaw: 0,
  stepDist: 0,
};
me.pos.y = groundAt(me.pos.x, me.pos.z);
me.yaw = Math.atan2(-(chromiePos.x - me.pos.x), -(chromiePos.z - me.pos.z));
chromie.root.rotation.y = Math.atan2(-(me.pos.x - chromiePos.x), -(me.pos.z - chromiePos.z));

const cam = { yaw: me.yaw, pitch: 0.32, dist: 9, want: 9 };

// premier rendu derrière l'écran de chargement : les shaders se compilent
renderer.compile(scene, camera);
hud.setProgress(1);
await tick();

// ---------- état de la quête (événements envoyés par app.js) ----------

// marqueur au-dessus de Chromie : available (« ! »), active (« ? »), done (rien)
let questState = window.QuizUI?.markerState() ?? "available";
let targeted = false;
let greeted = false;
let nextIdle = 0;
let wave = 0;
let cheer = 0;
let emote = null; // émote de Chromie en cours (wave, talk, cheer...)
let emoteT = 0;
function doEmote(name, secs) {
  emote = name;
  emoteT = secs;
  if (name === "wave") wave = secs;
  if (name === "cheer") cheer = secs;
}
let level = window.QuizUI?.level() ?? 1;
let talking = false; // fenêtre ouverte en parlant à Chromie (et non par un lien partagé)

// Leeroy Jenkins, le personnage joué : son cri (touche J, et en acceptant la première quête)
let roarT = 0;
let nextYell = 0;
// Message d'erreur rouge du jeu, dit à voix haute par le personnage comme en
// jeu (voix d'homme humain du client) ; pas deux fois de suite trop vite.
const ERROR_VOICE = {
  far: ["humanmale_err_outofrange02", "humanmale_err_outofrange04", "humanmale_err_outofrange05"],
  cant: ["humanmale_err_abilitycooldown02"],
  cantUse: ["humanmale_err_cantuseitem01"],
  notReady: ["humanmale_err_itemcooldown02", "humanmale_err_itemcooldown04", "humanmale_err_itemcooldown06"],
};
let nextErrorVoice = 0;
function sayError(text, kind) {
  hud.error(text);
  if (!kind || performance.now() < nextErrorVoice) return;
  nextErrorVoice = performance.now() + 1500;
  voice(`errors/${pick(ERROR_VOICE[kind])}`, 0.8);
}
function voice(file, volume = 0.8) {
  const gain = window.SFX_GAIN ?? 1;
  if (gain <= 0) return;
  const a = new Audio(`assets/sounds/${file}.mp3`);
  a.volume = Math.min(1, volume * gain);
  a.play().catch(() => {});
  return a;
}
// ---------- discussion (Entrée) : /s, /y et quelques émotes ----------
// Animation du personnage le temps de la phrase : parler, s'exclamer ou
// questionner selon la ponctuation, comme les PNJ du jeu.
let pEmote = null;
let pEmoteT = 0;
// L'arme d'hast : rangée dans le dos, sortie en main (en garde à l'arrêt).
// Le geste de la main vers le dos (Sheath) ; l'arme change de place à mi-geste.
let weaponDrawn = false;
// le geste du bras se joue même en courant (une émote, elle, s'arrêterait)
let sheathT = 0;
function toggleWeapon() {
  if (!player.weapon || dead || sitting) return;
  weaponDrawn = !weaponDrawn;
  sheathT = 0.8;
  voice(weaponDrawn ? "items/unsheathmetal" : "items/sheathmetal", 0.6);
  setTimeout(() => player.weapon.draw(weaponDrawn), 450);
}
function playerEmote(name, secs) {
  pEmote = name;
  pEmoteT = secs;
}
// Émotes du jeu : texte seul ou envers Chromie quand elle est ciblée, durée,
// animation (par défaut celle du même nom) et voix d'homme humain du client
// (assets/sounds/emotes, sonothèque de Wowhead).
const EMOTES = {
  dance: ["You burst into dance.", "You dance with Chromie.", Infinity],
  wave: ["You wave.", "You wave at Chromie.", 2.5],
  bow: ["You bow down graciously.", "You bow before Chromie.", 2.5],
  cheer: ["You cheer!", "You cheer at Chromie.", 2.5, "cheer", ["HumanMaleCheer01", "HumanMaleCheer02"]],
  laugh: ["You laugh.", "You laugh at Chromie.", 2.5, "laugh", "HumanMaleLaugh01"],
  applaud: ["You applaud. Bravo!", "You applaud at Chromie. Bravo!", 3],
  point: ["You point over yonder.", "You point at Chromie.", 2.5],
  roar: ["You roar with bestial vigor. So fierce!", "You roar with bestial vigor at Chromie. So fierce!", 2.2, "roar", "VO_PCHumanMaleRoar01"],
  train: ["You let off a train whistle. Choo Choo!", "You let off a train whistle at Chromie. Choo Choo!", 2.5, "train", "HumanMaleChooChoo01"],
  chicken: ["With arms flapping, you strut around. Cluck, Cluck, Chicken.", "With arms flapping, you strut around Chromie. Cluck, Cluck, Chicken.", 2.5, "chicken", "HumanMaleChicken01"],
  kiss: ["You blow a kiss into the wind.", "You blow a kiss to Chromie.", 2.5, "kiss", "HumanMaleKiss01"],
  cry: ["You cry.", "You cry on Chromie's shoulder.", 3, "cry", "HumanMaleCry01"],
  charge: ["You start to charge.", "You start to charge.", 2, "shout", "HumanMaleCharge01"],
  hello: ["You greet everyone with a hearty hello!", "You greet Chromie with a hearty hello!", 2.5, "wave", ["HumanMaleHello01", "HumanMaleHello02"]],
  bye: ["You wave goodbye to everyone. Farewell!", "You wave goodbye to Chromie. Farewell!", 2.5, "wave", "HumanMaleGoodbye01"],
  thank: ["You thank everyone around you.", "You thank Chromie.", 2.5, "bow", "HumanMaleThankYou01"],
  yes: ["You nod.", "You nod at Chromie.", 2, "yes", "HumanMaleYes01"],
  no: ["You clearly state, NO.", "You tell Chromie NO. Not going to happen.", 2, "no", "HumanMaleNo01"],
  congrats: ["You congratulate everyone around you.", "You congratulate Chromie.", 2.5, "applaud", "HumanMaleCongratulations01"],
  rasp: ["You make a rude gesture.", "You make a rude gesture at Chromie.", 2.5, "rude", "HumanMaleRaspberry01"],
  silly: ["You tell a joke.", "You tell Chromie a joke.", 2.5, "talkExclamation", "HumanMalePissed01"],
  flirt: ["You flirt.", "You flirt with Chromie.", 2.5, "shy", "HumanMaleFlirt05"],
  oom: ["You announce that you have low mana!", "You announce that you have low mana!", 2, "talk", "HumanMaleOutOfMana01"],
  healme: ["You call out for healing!", "You call out for healing!", 2, "shout", "HumanMaleHealMe01"],
  helpme: ["You cry out for help!", "You cry out for help!", 2, "shout", "HumanMaleHelp01"],
  incoming: ["You warn everyone of incoming enemies!", "You warn everyone of incoming enemies!", 2, "shout", "HumanMaleIncoming01"],
  flee: ["You yell for everyone to flee!", "You yell for everyone to flee!", 2, "shout", "HumanMaleFlee01"],
  openfire: ["You give the order to open fire.", "You give the order to open fire.", 2, "point", "HumanMaleOpenFire01"],
  follow: ["You motion for everyone to follow.", "You motion for Chromie to follow.", 2, "point", "HumanMaleFollowMe01"],
  wait: ["You ask everyone to wait.", "You ask Chromie to wait.", 2, "talk", "HumanMaleWaitHere01"],
  attacktarget: ["You tell everyone to attack something.", "You tell everyone to attack Chromie.", 2, "point", "HumanMaleAttackMyTarget01"],
  flex: ["You flex your muscles. Oooooh so strong!", "You flex at Chromie. Oooooh so strong!", 2.5],
  salute: ["You stand at attention and salute.", "You salute Chromie with respect.", 2.5],
  beg: ["You beg everyone around you. How pathetic.", "You beg Chromie. How pathetic.", 2.5],
  kneel: ["You kneel down.", "You kneel before Chromie.", Infinity],
};
// animation par défaut : celle du même nom
for (const [key, e] of Object.entries(EMOTES)) e[3] ??= key;
// raccourcis du jeu
Object.assign(EMOTES, { lol: EMOTES.laugh, hi: EMOTES.hello, goodbye: EMOTES.bye, thanks: EMOTES.thank, ty: EMOTES.thank, nod: EMOTES.yes, congratulate: EMOTES.congrats, raspberry: EMOTES.rasp, heal: EMOTES.healme, clap: EMOTES.applaud });
const COMMANDS = { s: "say", say: "say", y: "yell", yell: "yell", sh: "yell", shout: "yell" };
function speak(mode, text) {
  const words = text.trim().split(/\s+/);
  if (text.startsWith("/")) {
    const cmd = words[0].slice(1).toLowerCase();
    if (COMMANDS[cmd]) return speak(COMMANDS[cmd], words.slice(1).join(" "));
    if (EMOTES[cmd]) {
      if (dead) return hud.error("You can't do that when you're dead.");
      const [alone, at, secs, anim, sound] = EMOTES[cmd];
      hud.chat(targeted ? at : alone, "emote");
      playerEmote(anim, secs);
      if (sound) voice(`emotes/${Array.isArray(sound) ? pick(sound) : sound}`, 0.8);
      if (cmd === "roar") roarT = 2.2;
      return;
    }
    if (cmd === "help" || cmd === "h") {
      hud.chat("Chat: /s (say), /y (yell). Emotes: /dance /wave /hello /bye /bow /thank /cheer /laugh /applaud /point /roar /train /chicken /kiss /cry /charge /yes /no /flex /salute /kneel...", "system");
      return;
    }
    hud.chat('Type "/help" for a listing of a few commands.', "system");
    return;
  }
  const line = text.trim();
  if (!line) return;
  const yell = mode === "yell";
  // comme en jeu, le nom d'un joueur est un lien entre crochets (pas celui d'un PNJ)
  hud.chat(`[Leeroy Jenkins] ${yell ? "yells" : "says"}: ${line}`, yell ? "yell" : "say-player");
  hud.playerSay(line, yell);
  if (dead) return;
  const anim = yell || line.endsWith("!") ? "talkExclamation" : line.endsWith("?") ? "talkQuestion" : "talk";
  playerEmote(anim, Math.min(4, 1.2 + line.length * 0.04));
}
hud.onChat(speak);

// ---------- la voix de Chromie (répliques du jeu, exportées par Poro) ----------
// Chaque fichier va avec son texte exact (transcrit), dit dans la bulle et la
// discussion ; les salutations et au revoir du dialogue, comme en jeu, sont
// seulement parlés. Une seule réplique à la fois, et pas de loin.
const CHROMIE_VO = {
  firstGreet: ["vo_1105_chromie_53_f", "Champion! Over here! You look like you slept through quite a bit of history. Ah, no worries. I'll get you caught up."],
  greet: [
    ["vo_825_chromie_greetings_01", "Why, hello!"],
    ["vo_825_chromie_greetings_02", "It's like meeting again for the first time."],
    ["vo_825_chromie_greetings_03", "Hmm, haven't we done this before?"],
    ["vo_825_chromie_greetings_04", "It's so nice to see you!"],
    ["vo_825_chromie_greetings_05", "I always have time for you."],
    ["vo_825_chromie_greetings_06", "Ah, I knew you'd turn up eventually."],
    ["vo_825_chromie_greetings_07", "Is this hello or goodbye? I keep losing track."],
    ["vo_60_lq_chromie_greeting_01", "Hi!"],
    ["vo_60_lq_chromie_greeting_02", "We meet again."],
  ],
  farewell: [
    "vo_825_chromie_farewells_01",
    "vo_825_chromie_farewells_02",
    "vo_825_chromie_farewells_03",
    "vo_825_chromie_farewells_04",
    "vo_825_chromie_farewells_05",
    "vo_825_chromie_farewells_06",
    "vo_825_chromie_farewells_07",
  ],
  pissed: ["vo_825_chromie_pissed_01", "vo_825_chromie_pissed_02", "vo_825_chromie_pissed_03", "vo_825_chromie_pissed_04"],
  accept: ["vo_1015_chromie_74_f", "It's a long story. Trust me."],
  turnIn: [
    ["vo_1017_chromie_01_f", "I knew I could trust you with this, champion. Nice work."],
    ["vo_1105_chromie_11_f", "This spot now looks accurate to history. Yay! I'll lock this in place and we can move on."],
  ],
  portal: ["vo_1015_chromie_68_f", "Aha! Well, here goes nothing."],
  done: ["vo_1105_chromie_51_f", "With that, we're done. You really help me out. Just like you always do. Or is this the first time?"],
  yell: ["vo_1015_chromie_72_f", "Yes, yes, I know!"],
  logout: ["vo_1015_chromie_80_f", "Goodbye, everyone. It was nice to meet you all again. For the first time."],
};
let chromieAudio = null;
function chromieVoice(line, { say = true, near = 40 } = {}) {
  const [file, text] = Array.isArray(line) ? line : [line, null];
  if (me.pos.distanceTo(chromiePos) > near) return;
  const gain = window.SFX_GAIN ?? 1;
  if (gain > 0) {
    chromieAudio?.pause();
    chromieAudio = new Audio(`assets/sounds/chromie/${file}.mp3`);
    chromieAudio.volume = Math.min(1, 0.9 * gain);
    chromieAudio.play().catch(() => {});
  }
  if (say && text) chromieSays(text);
}
// cliquer Chromie encore et encore l'agace, comme les PNJ du jeu
let pokes = [];
function pokeChromie() {
  pokes = pokes.filter((p) => t - p < 4);
  pokes.push(t);
  if (pokes.length >= 4) {
    pokes = [];
    chromieVoice(pick(CHROMIE_VO.pissed), { say: false });
    return true;
  }
  return false;
}

function leeroy() {
  if (t < nextYell) return;
  nextYell = t + 8;
  roarT = 2.2;
  voice("VO_60_UBRS_LEROY_JENKINS_AGGRO_01");
  hud.chat("[Leeroy Jenkins] yells: LEEEEEEEROOOOOOOOY JENKINS!", "yell");
  ach?.unlock("leeroy");
  // à portée d'oreille, Chromie soupire
  if (me.pos.distanceTo(chromiePos) < 25) setTimeout(() => chromieVoice(CHROMIE_VO.yell), 2600);
}

addEventListener("quest:state", (e) => (questState = e.detail.marker));
addEventListener("quest:accept", (e) => {
  hud.chat(`Quest accepted: ${e.detail.title}`, "system");
  if (e.detail.id === "profile") leeroy();
  else chromieVoice(CHROMIE_VO.accept);
});
// chaque quête rendue : XP, niveau, et Chromie applaudit
addEventListener("quest:done", (e) => {
  const { title, xp } = e.detail;
  hud.chat(`${title} completed.`, "system");
  hud.chat(`Experience gained: ${xp}.`, "system");
  // butin : message de la couleur de la qualité de l'objet, comme en jeu
  const reward = QUESTS.find((q) => q.id === e.detail.id)?.reward;
  if (reward) hud.chat(`You receive item: [${reward.name}].`, `loot ${reward.quality}`);
  if (e.detail.level > level) {
    level = e.detail.level;
    setTimeout(() => {
      window.playUiSound?.("levelUp", 0.4);
      hud.setPlayer({ level });
      hud.ding();
      hud.chat(`Congratulations, you have reached level ${level}!`, "level");
    }, 900);
  }
  doEmote("applaud", 2.2);
  // le verdict a sa propre réplique (plus bas)
  if (e.detail.id !== "verdict") setTimeout(() => chromieVoice(pick(CHROMIE_VO.turnIn)), 600);
});
// le verdict : les portails s'éveillent, le sablier s'ouvre
// Le verdict rendu, Chromie ouvre le portail de la version choisie juste à
// côté d'elle : elle canalise (ChannelCastDirected, son de son sort de voyage
// dans le temps), le portail grandit, puis elle relâche le sort
// (SpellCastDirected) et il s'emprunte comme les autres.
// portail du temps quand on emprunte un portail, faille du portail de
// Chromie, traits de lumière dans le ciel
const timeFx = await createTimeFx(scene, { sound: (f, v) => voice(f, v), camera, center: new THREE.Vector3(0, groundAt(0, 0), 0) });
const CHANNEL = 3;
const chromiePortalSpot = new THREE.Vector3(chromiePos.x + 4.4, 0, chromiePos.z + 0.6);
let channelT = 0; // secondes de canalisation restantes (Chromie se tourne vers le portail)
let chromiePortal = null;
// Le portail de Chromie a l'aspect d'une faille temporelle (world/timefx.js) ;
// le disque du portail reste, invisible, pour le clic, le survol et son nom.
let chromieRift = null;
function closeChromiePortal() {
  if (!chromiePortal) return;
  chromieRift?.close();
  chromieRift = null;
  chromiePortal.root.removeFromParent();
  gates.portals.splice(gates.portals.indexOf(chromiePortal), 1);
  chromiePortal = null;
}
function openChromiePortal(key, secs) {
  if (!key) return;
  closeChromiePortal();
  chromiePortal = gates.spawn(key, chromiePortalSpot.x, chromiePortalSpot.z, 0, secs);
  chromiePortal.swirl.material.visible = false;
  for (const o of chromiePortal.root.children) if (o !== chromiePortal.swirl && o.isMesh) o.visible = false;
  scene.add(chromiePortal.root);
  chromieRift = timeFx.rift(chromiePortal.pos, 0, { instant: !secs });
}
// la canalisation, puis le sort relâché ; « then » : la suite, une fois le portail ouvert
function channelPortal(then) {
  doEmote("channel", CHANNEL);
  channelT = CHANNEL;
  voice(`chromie/spell_825_chromie_time_travel_forwards_cast_0${1 + Math.floor(Math.random() * 2)}`, 0.8);
  openChromiePortal(resultKey, CHANNEL);
  setTimeout(() => {
    doEmote("castDirected", 1.2);
    then?.();
  }, CHANNEL * 1000);
}
// Le portail se referme quand on s'éloigne ; en revenant, Chromie le rouvre
// (et rejoue la canalisation).
const PORTAL_CLOSE = 34;
const PORTAL_REOPEN = 16;
let resultKey = window.QuizUI?.verdict() ?? null;
// déjà rendu : le portail reste fermé derrière les écrans d'accueil ; Chromie
// le rouvre quand on s'approche d'elle en jeu
if (resultKey) gates.highlight(resultKey);
addEventListener("quest:complete", (e) => {
  resultKey = e.detail?.key;
  if (e.detail?.name) hud.chat(`You receive item: [${e.detail.name}].`, "loot legendary");
  gates.highlight(resultKey);
  hourglass.open?.();
  const name = e.detail?.name;
  // la canalisation, puis le sort relâché : le portail est ouvert, et la quête est finie
  channelPortal(() => hud.chat(`Chromie opens a portal to ${VERSIONS[resultKey]?.name ?? "your timeline"}.`, "emote"));
  setTimeout(() => chromieVoice(CHROMIE_VO.portal), 200);
  setTimeout(() => chromieVoice(CHROMIE_VO.done), CHANNEL * 1000 + 900);
  // Leeroy fête ça une fois qu'elle a fini de parler
  setTimeout(() => voice("VO_60_UBRS_LEROY_JENKINS_VICTORY_01"), CHANNEL * 1000 + 13200);
  setTimeout(() => doEmote("applaud", 2.5), CHANNEL * 1000 + 13600);
});
// fin du dialogue : un au revoir (parlé seulement)
addEventListener("quest:close", () => {
  if (talking && !dead) chromieVoice(pick(CHROMIE_VO.farewell), { say: false, near: 15 });
  talking = false;
});

function chromieSays(text) {
  // elle parle avec les mains, sauf si elle est déjà en pleine émote
  if (emoteT <= 0) doEmote(text.trim().endsWith("?") ? "talkQuestion" : text.includes("!") ? "talkExclamation" : "talk", 2.4);
  hud.say(text);
  hud.chat(`Chromie says: ${text}`, "say");
}

// ---------- entrées ----------

const keys = new Set();
let autorun = false;
const mouse = { left: false, right: false, moved: 0, x: 0, y: 0, touch: false };
let moveTarget = null; // clic pour se déplacer (écrans tactiles)

addEventListener("keydown", (e) => {
  if (mode !== "game") return;
  // on écrit dans un champ (discussion…) : les touches ne sont pas des commandes
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  // Entrée ouvre la saisie ; « / » aussi, avec la barre déjà tapée (commande)
  if (e.code === "Enter" || e.code === "NumpadEnter" || e.key === "/") {
    e.preventDefault();
    keys.clear();
    autorun = false;
    hud.openChat(e.key === "/" ? "/" : "");
    return;
  }
  if (e.repeat && e.code !== "Space") return;
  // raccourcis du jeu : Ctrl+S coupe le son, Ctrl+M la musique (sans faire reculer)
  if (e.ctrlKey || e.metaKey) {
    if (e.code === "KeyS" || e.code === "KeyM") {
      e.preventDefault();
      const key = e.code === "KeyS" ? "sound" : "music";
      const on = !settings.get()[key];
      settings.set({ [key]: on });
      hud.chat(`${key === "sound" ? "Sound" : "Music"} ${on ? "enabled" : "disabled"}.`, "system");
    }
    return;
  }
  keys.add(e.code);
  if (e.code === "NumLock" || e.code === "KeyR") autorun = !autorun;
  // Échap, comme en jeu : ferme d'abord ce qui est ouvert, puis la cible,
  // et sinon ouvre le menu du jeu
  if (e.code === "Escape") {
    if (ach?.refOpen?.()) ach.closeRef();
    else if (hud.worldMapOpen()) hud.closeWorldMap();
    else if (bag?.isOpen()) bag.close();
    else if (ach?.isOpen()) ach.close();
    else if (shop.isOpen()) shop.close();
    else if (menu.isOpen()) menu.close();
    else if (window.QuizUI?.logOpen()) window.QuizUI.closeLog();
    else if (window.QuizUI?.isOpen()) window.QuizUI.close();
    else if (targeted) setTarget(false);
    else menu.open();
  }
  // M : la carte de la zone, comme en jeu
  if (e.code === "KeyM") hud.toggleWorldMap();
  // Z (touche physique : Z en QWERTY, W en AZERTY, où Z sert à avancer) :
  // sortir ou ranger l'arme, comme la touche du jeu
  if (e.code === "KeyZ") toggleWeapon();
  // comme en jeu : L le journal de quêtes, Y les hauts faits ; J pour Leeroy
  if (e.code === "KeyL") window.QuizUI?.toggleLog();
  if (e.code === "KeyY") ach?.toggle();
  if (e.code === "KeyB") bag?.toggle();
  if (e.code === "KeyJ") leeroy();
  if (e.code === "Tab") {
    e.preventDefault();
    setTarget(true);
  }
  // reculer coupe la course automatique ; toute touche de déplacement annule le clic pour se déplacer
  if (e.code === "KeyS" || e.code === "ArrowDown") autorun = false;
  if (["KeyW", "KeyS", "KeyA", "KeyD", "KeyQ", "KeyE", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) moveTarget = null;
});
addEventListener("keyup", (e) => keys.delete(e.code));
addEventListener("blur", () => keys.clear());

const raycaster = new THREE.Raycaster();
function pointerHits(x, y, object) {
  raycaster.setFromCamera(new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1), camera);
  return raycaster.intersectObject(object, true)[0] || null;
}

canvas.addEventListener("contextmenu", (e) => e.preventDefault());
canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  mouse.touch = e.pointerType === "touch";
  if (e.button === 2) mouse.right = true;
  else mouse.left = true;
  mouse.moved = 0;
  mouse.x = e.clientX;
  mouse.y = e.clientY;
});
canvas.addEventListener("pointermove", (e) => {
  const dx = e.clientX - mouse.x;
  const dy = e.clientY - mouse.y;
  mouse.x = e.clientX;
  mouse.y = e.clientY;
  // choix du personnage : glisser le fait tourner sur lui-même
  if (mode !== "game") {
    if (mode === "select" && (mouse.left || mouse.right)) selYaw += dx * 0.012;
    return;
  }
  if (mouse.left || mouse.right) {
    mouse.moved += Math.abs(dx) + Math.abs(dy);
    if (mouse.moved > 4) {
      canvas.classList.add("dragging");
      cam.yaw -= dx * 0.0055;
      cam.pitch = Math.max(-1.0, Math.min(1.35, cam.pitch + dy * 0.0045));
      if (mouse.right) me.yaw = cam.yaw;
    }
    return;
  }
  // Survol, comme en jeu : un portail montre la roue crantée (grisée hors de
  // portée) et son nom dans l'info-bulle, d'aussi loin qu'on le voit ;
  // Chromie, le curseur « parler ».
  const gate = portalAt(e.clientX, e.clientY);
  if (gate) {
    canvas.dataset.cursor = me.pos.distanceTo(gate.pos) > USE_RANGE ? "unable-interact" : "interact";
    hud.showObjectTip(`Portal to ${VERSIONS[gate.key].name}`, VERSIONS[gate.key].kind);
    return;
  }
  hud.hideObjectTip();
  const over = pointerHits(e.clientX, e.clientY, hitbox);
  const far = me.pos.distanceTo(chromiePos) > TALK_RANGE;
  canvas.dataset.cursor = over ? (far ? "unable" : "speak") : "";
});
canvas.addEventListener("pointerleave", () => hud.hideObjectTip());

// Portail sous le curseur : le disque seulement (pas les coins de son carré),
// et pas s'il est caché derrière le plateau ou le sablier.
const USE_RANGE = 8;
function portalAt(x, y) {
  let best = null;
  for (const p of gates.portals) {
    const hit = pointerHits(x, y, p.swirl);
    if (hit && Math.hypot(hit.uv.x - 0.5, hit.uv.y - 0.5) < 0.5 && (!best || hit.distance < best.hit.distance)) best = { p, hit };
  }
  if (!best) return null;
  const wall = raycaster.intersectObjects([zone.root, hourglass.root], true)[0];
  return wall && wall.distance < best.hit.distance - 0.5 ? null : best.p;
}
canvas.addEventListener("pointerup", (e) => {
  if (mode !== "game") {
    mouse.left = mouse.right = false;
    return;
  }
  const wasClick = mouse.moved <= 4;
  const button = e.button;
  if (button === 2) mouse.right = false;
  else mouse.left = false;
  if (!mouse.left && !mouse.right) canvas.classList.remove("dragging");
  if (!wasClick) return;
  // clic droit sur un portail (ou toucher) : on l'emprunte, s'il est à portée
  const gate = portalAt(e.clientX, e.clientY);
  if (gate && (button === 2 || mouse.touch)) {
    if (dead) hud.error("You can't do that when you're dead.");
    else if (me.pos.distanceTo(gate.pos) > USE_RANGE) sayError("You are too far away!", "far");
    else usePortal(gate);
    return;
  }
  const onChromie = pointerHits(e.clientX, e.clientY, hitbox);
  if (onChromie) {
    setTarget(true);
    if (button === 2 || mouse.touch) interact();
    return;
  }
  if (mouse.touch) {
    const hit = pointerHits(e.clientX, e.clientY, ground);
    if (hit) moveTarget = hit.point.clone();
  } else if (button === 0) setTarget(false);
});
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  if (mode !== "game") return;
  // zoom continu jusqu'à la vue à la première personne (0) ; le terme additif
  // permet d'atteindre 0 et d'en ressortir, le multiplicatif garde un pas
  // proportionnel à la distance
  const next = cam.want * (1 + e.deltaY * 0.0012) + e.deltaY * 0.003;
  cam.want = next < 0.2 ? 0 : Math.min(32, next);
}, { passive: false });

// Cercle de sélection du jeu sous la cible (textures/unitselecttexture.blp,
// exporté en PNG par wow.export) : blanc, teinté vert (PNJ amical) ; sa pointe
// suit l'orientation de Chromie. Sans le fichier, pas de cercle.
const selection = new THREE.Mesh(
  new THREE.PlaneGeometry(1.8, 1.8).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -4 }),
);
selection.visible = false;
// le sol sous elle ondule de ±4 cm : un peu au-dessus, pour ne pas s'y enfoncer
selection.position.copy(chromiePos).y += 0.1;
scene.add(selection);
new THREE.TextureLoader().load("assets/textures/unitselecttexture.png", (tex) => {
  tex.colorSpace = THREE.SRGBColorSpace;
  selection.material.map = tex;
  selection.material.needsUpdate = true;
  selection.userData.ready = true;
  selection.visible = targeted;
});

function setTarget(on) {
  targeted = on;
  hud.setTarget(on);
  selection.visible = on && !!selection.userData.ready;
}

function interact() {
  if (dead) return hud.error("You can't do that when you're dead.");
  const d = me.pos.distanceTo(chromiePos);
  if (d > TALK_RANGE) {
    if (mouse.touch) {
      moveTarget = chromiePos.clone();
      moveTarget.talk = true;
      return;
    }
    sayError("You are too far away!", "far");
    return;
  }
  setTarget(true);
  if (pokeChromie()) return;
  const wasOpen = window.QuizUI?.isOpen();
  talking = true;
  window.QuizUI?.open();
  doEmote("talk", 2.2);
  // ouvrir le dialogue : une salutation, comme en jeu (parlée seulement)
  if (!wasOpen) chromieVoice(pick(CHROMIE_VO.greet), { say: false, near: 15 });
}

// ---------- boucle ----------

let last = performance.now();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const move = new THREE.Vector3();
const head = new THREE.Vector3();
const look = new THREE.Vector3();
const head2 = new THREE.Vector3();
const camTarget = new THREE.Vector3();
let started = false;
let t = 0;
let bodyOff = 0; // rotation du corps en pas de côté
let playerOpacity = 1; // fondu du personnage quand la caméra s'en approche
const pivot = new THREE.Vector3();
const back = new THREE.Vector3();

const angleTo = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

// Seuls le sablier et les statues arrêtent le joueur ; on traverse Chromie et
// les portails comme en jeu, et rien n'empêche de sauter dans le vide.
function blocked(x, z) {
  if (Math.hypot(x - LAYOUT.hourglass.x, z - LAYOUT.hourglass.y) < hourglass.radius) return true;
  return zone.obstacles.some((o) => Math.hypot(x - o.x, z - o.z) < o.r);
}

// ---------- mort dans le vide ----------
// Sous le plateau, plus rien ne rattrape la chute : le joueur meurt avant
// d'atteindre les plateformes du dessous. « Libérer l'esprit » le ramène à
// l'arrivée, en pleine forme (au bout de six minutes, ça se fait tout seul).
const VOID_DEATH = -22;
function die() {
  dead = true;
  autorun = false;
  moveTarget = null;
  me.vy = Math.min(me.vy, -12);
  if (sitting) menu.cancelLogout();
  window.QuizUI?.close();
  hud.setHealth(0);
  ach?.unlock("void");
  hud.showDeath(release);
}
function release() {
  dead = false;
  // La caméra repart de zéro derrière le personnage : un clic maintenu au
  // moment de la mort (relâché sur la fenêtre, jamais vu par le jeu), un reste
  // d'inclinaison ou de zoom en cours la laissaient dériver après la
  // résurrection.
  mouse.left = mouse.right = false;
  canvas.classList.remove("dragging");
  pitchBack = null;
  shake = 0;
  cam.dist = cam.want;
  hud.hideDeath();
  hud.setHealth(100);
  heroicLeap();
  chromieSays("Back already? The void has no bottom. I checked. Twice.");
}

// ---------- arrivée du ciel, comme le guerrier à Skyhold ----------
// Comme « Jump to Skyhold » (guerrier, Legion) : on tombe du ciel à la
// verticale, de plus en plus vite, dans le souffle du vent, et on s'écrase au
// centre de la plateforme (onde de choc, caméra secouée, son du Bond héroïque).
// La caméra reste accrochée au personnage, comme en jeu, mais plonge vers le
// sol pour qu'on voie la plateforme arriver ; elle se redresse à l'arrivée.
let leap = null; // { t, dur, from, to }
let shake = 0; // secondes de secousse restantes
const LEAP_DUR = 1.35;
let pitchBack = null; // inclinaison de la caméra à retrouver après l'atterrissage
function heroicLeap() {
  const to = new THREE.Vector3(LAYOUT.spawn.x, 0, LAYOUT.spawn.y);
  to.y = groundAt(to.x, to.z);
  // droit au-dessus du centre du disque : une chute bien verticale
  const from = to.clone();
  from.y = to.y + 48;
  leap = { t: 0, dur: LEAP_DUR, from, to };
  me.pos.copy(from);
  me.vy = 0;
  me.grounded = false;
  autorun = false;
  moveTarget = null;
  me.yaw = Math.atan2(-(chromiePos.x - to.x), -(chromiePos.z - to.z));
  cam.yaw = me.yaw;
  pitchBack = pitchBack ?? cam.pitch;
  cam.pitch = 1.05;
  // sons du Bond héroïque (sort 6544) : l'élan
  voice("mWooshLargeCrit", 0.8);
  voice("Spell_RO_GrapplingHook_Whoosh_Cast_01", 0.7);
}
// effets du jeu : traînée pendant la chute, impact du Bond héroïque, cratère de Skyhold
const jumpFx = await createJumpFx(scene);
function land() {
  me.pos.copy(leap.to);
  me.vy = 0;
  me.grounded = true;
  leap = null;
  shake = 0.5;
  jumpFx.impact(me.pos);
  // et l'impact (sort 52174 : onde de choc et coup de tonnerre)
  voice(pick(["SPELL_WR_HeroicLeap_AreaEffectImpact_01", "SPELL_WR_HeroicLeap_AreaEffectImpact_02"]), 1);
  voice("Spell_WR_ThunderClap_Impact_Revamp_01", 0.8);
  playerEmote("jumpEnd", 0.9);
}

// ---------- portails ----------

const flash = document.createElement("div");
flash.className = "portal-flash";
document.body.append(flash);
let portalCooldown = 0;

function usePortal(p) {
  if (t < portalCooldown) return;
  portalCooldown = t + 2.5;
  const name = VERSIONS[p.key].name;
  ach?.progress("explorer", p.key); // compte chaque portail une seule fois
  if (!resultKey) {
    sayError("The timeline is sealed. Talk to Chromie first.", "cant");
    return;
  }
  if (p.key !== resultKey) {
    sayError(`Not your timeline. Chromie said: ${VERSIONS[resultKey].name}.`, "cantUse");
    ach?.unlock("wrong-portal");
    return;
  }
  // le bon portail : le portail du temps s'ouvre devant l'écran, puis la fenêtre de boutique ;
  // on quitte la zone : Chromie n'est plus ciblée
  setTarget(false);
  timeFx.travel(camera);
  ach?.unlock("right-portal");
  setTimeout(() => {
    // la « boutique » de la version, avec les liens officiels
    shop.open(p.key);
    hud.chat(p.key === "none" ? "You step through the grey portal. It leads to... outside. Touch grass." : `You glimpse ${name}. Your subscription awaits, adventurer.`, "system");
    chromieSays(p.key === "none" ? "Told you. Go outside, it's lovely." : "See? Told you. Now go, and don't make me come find you.");
  }, 2100);
}

// ---------- objets du sac (clic droit) ----------
// Incantation (pierre de foyer, 10 s) : bouger ou sauter l'interrompt, comme
// en jeu. Repas : on s'assoit pour manger, se lever l'arrête.
let cast = null; // { t, dur, done, fx, stop }
let eating = 0; // secondes de repas restantes
// « fx » : l'effet et les sons de l'incantation (la pierre de foyer) ;
// stop(ok) les arrête, à la fin ou à l'interruption.
function startCast(name, dur, done, fx = false) {
  cast = { t: 0, dur, done, fx, stop() {} };
  if (fx) {
    const glow = timeFx.channel([player.root.getObjectByName("bone_SpellHandL"), player.root.getObjectByName("bone_SpellHandR")], player.root);
    const loop = voice("time/timewalkershearthstone_precaststart_loop", 0.6);
    cast.stop = (ok) => {
      glow.stop(ok);
      loop?.pause();
      if (!ok) return;
      voice("time/timewalkershearthstone_cast_oneshot", 0.7);
      // le geste du départ (SpellCastOmni), comme en jeu
      pEmote = "castOmni";
      pEmoteT = 1.2;
    };
  }
  hud.castStart(name);
  hud.castProgress(0);
}
// « flash » : l'éclair plein écran ; la pierre de foyer s'en passe (le sort
// a son propre éclat d'arrivée, un liseré doré : world/timefx.js)
function teleport(x, z, faceX, faceZ, flashOn = true) {
  me.pos.set(x, groundAt(x, z), z);
  me.vy = 0;
  me.grounded = true;
  autorun = false;
  moveTarget = null;
  me.yaw = Math.atan2(-(faceX - x), -(faceZ - z));
  cam.yaw = me.yaw;
  if (!flashOn) return;
  flash.style.background = "radial-gradient(circle, #fff 0%, #7fb4ff 50%, #000 100%)";
  flash.classList.remove("on");
  void flash.offsetWidth;
  flash.classList.add("on");
}
bag?.onUse((item, { notReady }) => {
  if (notReady) return sayError("Item is not ready yet.", "notReady");
  if (dead) return hud.error("You can't do that when you're dead.");
  if (cast) return hud.error("Another action is in progress");
  const id = item.id;
  // « Returns you to Chromie » : devant elle, tourné vers elle
  if (id === "hearthstone")
    return startCast("Hearthstone", 10, () => {
      const dx = LAYOUT.spawn.x - chromiePos.x;
      const dz = LAYOUT.spawn.y - chromiePos.z;
      const d = Math.hypot(dx, dz);
      teleport(chromiePos.x + (dx / d) * 3.5, chromiePos.z + (dz / d) * 3.5, chromiePos.x, chromiePos.z, false);
      bag.startCooldown("hearthstone", 60);
    }, true);
  // la montre de Chromie : l'heure, avec cinq minutes d'avance
  if (id === "profile") {
    const time = new Date(Date.now() + 5 * 60000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    return hud.chat(`You check Chromie's Pocket Watch. It reads ${time}. It runs five minutes fast.`, "emote");
  }
  if (id === "taste") {
    eating = 20;
    return hud.chat("You sit down with the Timeless Tasting Menu. It tastes like 2006.", "emote");
  }
  // Easter egg : Chromie ciblée et à portée, elle signe la charte (une fois)
  if (id === "company") {
    const left = bag.charterSigned() ? 8 : 9;
    if (!targeted) return sayError(`You need ${left} more signatures to turn this charter in.`, "cantUse");
    if (me.pos.distanceTo(chromiePos) > TALK_RANGE) return sayError("You are too far away!", "far");
    if (bag.charterSigned()) return chromieSays("I already signed it. In this timeline and three others. Eight more to go: it builds character.");
    bag.signCharter();
    chromieSays("A guild charter? Oh, go on then. \"Chromie, Bronze Dragonflight.\" Eight to go. Try the Infinite Dragonflight, they love joining things they shouldn't.");
    hud.chat("Chromie has signed your charter.", "system");
    return ach?.unlock("charter");
  }
  if (id === "worlds") return hud.toggleWorldMap();
  // l'objet du verdict : ouvre le chemin de sa version (devant son portail)
  if (id.startsWith("verdict-")) {
    const key = id.slice("verdict-".length);
    if (key === "none") return menu.logout();
    const p = gates.portals.find((g) => g.key === key);
    if (!p) return;
    return startCast(VERSIONS[key].name, 3, () => {
      const d = Math.hypot(p.pos.x, p.pos.z);
      teleport(p.pos.x * (1 - 5 / d), p.pos.z * (1 - 5 / d), p.pos.x, p.pos.z);
    });
  }
});

function update(dt) {
  // mort : plus de déplacement, la caméra reste sur le corps
  const k = (...codes) => !dead && !leap && codes.some((c) => keys.has(c));
  const both = !dead && !leap && mouse.left && mouse.right;

  // A/D tournent le personnage et la caméra avec lui, même à l'arrêt
  // (sauf clic gauche maintenu : on regarde autour sans tourner la vue)
  let turning = 0;
  if (!mouse.right) {
    turning = k("KeyA", "ArrowLeft") - k("KeyD", "ArrowRight");
    const turn = turning * TURN * dt;
    me.yaw += turn;
    if (!mouse.left) cam.yaw += turn;
  }
  let fwd = (k("KeyW", "ArrowUp") || both || (autorun && !dead) ? 1 : 0) - (k("KeyS", "ArrowDown") ? 1 : 0);
  let strafe = k("KeyE") - k("KeyQ") + (mouse.right ? k("KeyD", "ArrowRight") - k("KeyA", "ArrowLeft") : 0);

  // clic pour se déplacer (tactile) : on marche vers le point, on parle à l'arrivée
  if (moveTarget && !fwd && !strafe) {
    const dx = moveTarget.x - me.pos.x;
    const dz = moveTarget.z - me.pos.z;
    const d = Math.hypot(dx, dz);
    const stop = moveTarget.talk ? TALK_RANGE - 1.5 : 0.4;
    if (d > stop) {
      me.yaw = Math.atan2(-dx, -dz);
      fwd = 1;
    } else {
      if (moveTarget.talk) interact();
      moveTarget = null;
    }
  }

  forward.set(-Math.sin(me.yaw), 0, -Math.cos(me.yaw));
  right.set(Math.cos(me.yaw), 0, -Math.sin(me.yaw));
  move.set(0, 0, 0).addScaledVector(forward, fwd).addScaledVector(right, strafe);
  const backwards = fwd < 0 && !strafe;
  let speed = 0;
  if (move.lengthSq() > 0) {
    move.normalize();
    speed = backwards ? BACK : RUN;
    const step = speed * dt;
    const g0 = groundAt(me.pos.x, me.pos.z);
    // trop raide pour grimper : on essaie de glisser le long de la pente
    const tryMove = (mx, mz) => {
      const nx = me.pos.x + mx * step;
      const nz = me.pos.z + mz * step;
      if (blocked(nx, nz)) return false;
      const g1 = groundAt(nx, nz);
      // on monte les marches (jusqu'à 60 cm d'un coup), pas les rambardes ;
      // une hauteur fixe, pour que ça ne dépende pas de la fluidité de l'image
      if (g1 - g0 > 0.6 && g1 > me.pos.y + 0.3) return false;
      me.pos.x = nx;
      me.pos.z = nz;
      return true;
    };
    if (!tryMove(move.x, move.z) && !tryMove(move.x, 0)) tryMove(0, move.z);
    if (me.grounded) {
      me.stepDist += step;
      if (me.stepDist > (backwards ? 1.1 : 1.45)) {
        me.stepDist = 0;
        audio.step();
      }
    }
  }

  // saut et gravité
  const g = groundAt(me.pos.x, me.pos.z);
  if (me.grounded && k("Space")) {
    me.vy = JUMP;
    ach?.progress("jumper");
    me.grounded = false;
  }
  // mort, le corps continue de tomber, de plus en plus vite, jusqu'à se perdre
  // dans le vide (la caméra, elle, reste où elle était)
  if (leap) {
    // chute libre : de plus en plus vite jusqu'à l'impact
    leap.t += dt;
    const p = Math.min(1, leap.t / leap.dur);
    me.pos.lerpVectors(leap.from, leap.to, p * p);
    me.grounded = false;
    if (p >= 1) land();
  } else {
    me.vy -= GRAVITY * (dead ? 1.6 : 1) * dt;
    me.pos.y += me.vy * dt;
  }
  if (!dead && me.pos.y < VOID_DEATH) die();
  if (dead || leap) me.grounded = false;
  else if (me.pos.y <= g || (me.grounded && me.pos.y - g < 0.6)) {
    if (!me.grounded) audio.step(0.5);
    me.pos.y = g;
    me.vy = 0;
    me.grounded = true;
  } else me.grounded = false;

  // Comme en jeu : en pas de côté, le corps se tourne vers sa direction
  // (90° en latéral pur, 45° en diagonale), les jambes courent normalement.
  const wantOff = speed > 0 && strafe ? (fwd >= 0 ? Math.atan2(-strafe, Math.max(fwd, 0)) : Math.atan2(strafe, -fwd)) : 0;
  bodyOff += angleTo(bodyOff, wantOff) * Math.min(1, dt * 12);
  player.root.position.copy(me.pos);
  player.root.rotation.y = me.yaw + bodyOff;
  roarT = Math.max(0, roarT - dt);
  // bouger annule la déconnexion (et le relève), comme en jeu
  if (sitting && (speed > 0 || turning || !me.grounded)) {
    menu.cancelLogout();
    hud.chat("You are no longer logging out.", "system");
  }
  if (speed > 0 || !me.grounded || turning) pEmoteT = 0;
  if (cast) {
    if (speed > 0 || !me.grounded || dead) {
      cast.stop(false);
      cast = null;
      hud.castEnd(false);
    } else {
      cast.t += dt;
      hud.castProgress(cast.t / cast.dur);
      if (cast.t >= cast.dur) {
        const done = cast.done;
        cast.stop(true);
        cast = null;
        hud.castEnd(true);
        done();
      }
    }
  }
  // repas : assis tant qu'on ne bouge pas
  if (eating > 0) eating = speed > 0 || !me.grounded || dead ? 0 : Math.max(0, eating - dt);
  pEmoteT = Math.max(0, pEmoteT - dt);
  sheathT = Math.max(0, sheathT - dt);
  // la pierre de foyer : les mains prêtes (ReadySpellOmni) le temps de l'incantation
  const current = roarT > 0 ? "roar" : cast?.fx ? "readyOmni" : pEmoteT > 0 ? pEmote : null;
  player.animate(dt, { speed, backwards: fwd < 0, grounded: me.grounded, falling: !!leap, turning, sitting: sitting || eating > 0, emote: current, drawn: weaponDrawn, sheath: sheathT > 0 });

  // la caméra revient doucement derrière le joueur quand il avance
  if (speed > 0 && !mouse.left && !mouse.right) cam.yaw += angleTo(cam.yaw, me.yaw) * Math.min(1, dt * 2.5);
  cam.dist += (cam.want - cam.dist) * Math.min(1, dt * 6);
  const cp = Math.cos(cam.pitch);
  // Une seule caméra pour toutes les distances, donc pas de saut : le pivot
  // glisse de l'épaule (loin) aux yeux (tout près), et on regarde toujours
  // dans l'axe pivot → caméra.
  const near = Math.min(1, cam.dist / 2.5);
  // après l'arrivée du ciel, la caméra se redresse doucement
  if (!leap && pitchBack !== null) {
    cam.pitch += (pitchBack - cam.pitch) * Math.min(1, dt * 2.5);
    if (Math.abs(cam.pitch - pitchBack) < 0.01) pitchBack = null;
  }
  if (dead) {
    // la caméra reste figée là où on est mort, et regarde le corps s'éloigner
    camTarget.set(me.pos.x, me.pos.y + player.height * 0.5, me.pos.z);
    camera.lookAt(camTarget);
  } else {
    pivot.set(me.pos.x, me.pos.y + player.height * (0.93 - 0.07 * near), me.pos.z);
    back.set(Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), Math.cos(cam.yaw) * cp);
    camera.position.copy(pivot).addScaledVector(back, cam.dist);
    const floor = groundAt(camera.position.x, camera.position.z) + 0.5;
    if (cam.dist > 0.5 && camera.position.y < floor) camera.position.y = floor;
    // secousse à l'impact du bond
    if (shake > 0) {
      const a = shake * 0.5;
      camera.position.x += (Math.random() - 0.5) * a;
      camera.position.y += (Math.random() - 0.5) * a;
      shake = Math.max(0, shake - dt);
    }
    camTarget.copy(camera.position).sub(back);
    camera.lookAt(camTarget);
  }
  // Tout près, le personnage s'efface en fondu, puis disparaît en vue subjective
  // (sauf mort : on regarde le corps tomber, même depuis la vue subjective).
  const opacity = dead ? 1 : Math.min(1, Math.max(0, (cam.dist - 0.35) / 1.6));
  if (opacity <= 0 && player.root.visible) {
    // en entrant en vue subjective, le regard se redresse à l'horizontale
    cam.pitch = Math.min(cam.pitch, 0.05);
    ach?.unlock("first-person");
  }
  player.root.visible = opacity > 0;
  if (opacity !== playerOpacity) {
    playerOpacity = opacity;
    player.root.traverse((o) => {
      if (!o.isMesh) return;
      for (const mat of [o.material].flat()) {
        const transparent = opacity < 1 || mat.userData.wasTransparent;
        // passer en transparent change le programme de rendu : il faut le signaler
        if (mat.transparent !== transparent) {
          mat.transparent = transparent;
          mat.needsUpdate = true;
        }
        mat.opacity = opacity;
        mat.depthWrite = opacity >= 1 ? mat.userData.wasDepthWrite : false;
      }
    });
  }

  // l'ombre du soleil suit le joueur
  sun.position.copy(me.pos).addScaledVector(sunDir, 120);
  sun.target.position.copy(me.pos);

  // Chromie : se tourne vers le joueur, le salue, bavarde
  const d = me.pos.distanceTo(chromiePos);
  const faceMe = Math.atan2(-(me.pos.x - chromiePos.x), -(me.pos.z - chromiePos.z));
  // pendant qu'elle ouvre le portail, elle se tourne vers lui
  channelT = Math.max(0, channelT - dt);
  const facePortal = Math.atan2(-(chromiePortalSpot.x - chromiePos.x), -(chromiePortalSpot.z - chromiePos.z));
  if (resultKey && channelT <= 0) {
    if (chromiePortal && d > PORTAL_CLOSE) closeChromiePortal();
    else if (!chromiePortal && d < PORTAL_REOPEN && !dead) channelPortal();
  }
  if (channelT > 0) chromie.root.rotation.y += angleTo(chromie.root.rotation.y, facePortal) * Math.min(1, dt * 5);
  else if (d < 22) chromie.root.rotation.y += angleTo(chromie.root.rotation.y, faceMe) * Math.min(1, dt * 3);
  // la pointe du cercle (bas de la texture, +z du plan) vers où regarde Chromie
  selection.rotation.y = chromie.root.rotation.y + Math.PI;
  if (!greeted && d < 28 && started) {
    greeted = true;
    // la toute première fois, sa grande réplique ; ensuite, une salutation
    const firstTime = !(window.QuizUI?.doneQuests()?.length);
    chromieVoice(firstTime ? CHROMIE_VO.firstGreet : pick(CHROMIE_VO.greet));
    doEmote("wave", 2.6);
    nextIdle = t + 22;
  } else if (greeted && d < 32 && t > nextIdle && !window.QuizUI?.isOpen()) {
    chromieSays(pick(resultKey ? CHROMIE_LINES.done : CHROMIE_LINES.idle));
    nextIdle = t + 24 + Math.random() * 20;
  }
  wave = Math.max(0, wave - dt);
  cheer = Math.max(0, cheer - dt);
  emoteT = Math.max(0, emoteT - dt);
  chromie.animate(dt, { speed: 0, grounded: true, wave, cheer, emote: emoteT > 0 ? emote : null, lookAt: 0 });

  // trop loin : la fenêtre de quête se ferme, comme en jeu
  if (talking && window.QuizUI?.isOpen() && d > LEAVE_RANGE) {
    talking = false;
    window.QuizUI.close();
    chromieSays(pick(CHROMIE_LINES.far));
  }

  if (leap) jumpFx.fall(me.pos);
  jumpFx.update(dt);
  timeFx.update(dt);
  hourglass.update(t, dt);
  zone.update(t, dt);
  gates.update(t, dt);
  dust.update(t, dt, me.pos, groundAt);

  // nom et « ! » au-dessus de sa tête, projetés à l'écran
  // centré sur sa tête (l'os), pas sur l'origine du modèle
  if (chromieHead) {
    chromieHead.getWorldPosition(head);
    head.y = chromiePos.y + chromie.height + 0.35;
  } else head.copy(chromiePos).setY(chromiePos.y + chromie.height + 0.12);
  marker.setState(questState);
  marker.update(t, head.clone().setY(head.y + 0.55), camera);
  // devant la caméra seulement (un point derrière elle se projette aussi à l'écran)
  camera.getWorldDirection(look);
  const inFront = head.clone().sub(camera.position).dot(look) > 0;
  const onScreen = head.clone().project(camera);
  const visible = inFront && d < 70 && Math.abs(onScreen.x) < 1.1 && Math.abs(onScreen.y) < 1.1;
  const s = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--hud")) || 1;
  // son nom ne se lit que de près, comme en jeu ; la bulle porte plus loin
  hud.placeOverhead(visible ? { x: ((onScreen.x + 1) / 2) * innerWidth, y: ((1 - onScreen.y) / 2) * innerHeight } : null, s, questState, d < NAME_RANGE);
  const toScreen = (v) => {
    if (v.clone().sub(camera.position).dot(look) <= 0) return null;
    const p = v.clone().project(camera);
    return Math.abs(p.x) > 1.1 || Math.abs(p.y) > 1.1 ? null : { x: ((p.x + 1) / 2) * innerWidth, y: ((1 - p.y) / 2) * innerHeight };
  };
  // Le personnage est devant les portails : leur nom s'efface quand il
  // tomberait sur lui (cadre du personnage à l'écran, pieds à tête).
  const feet = toScreen(me.pos);
  const top = toScreen(head2.copy(me.pos).setY(me.pos.y + player.height * 1.1));
  const box =
    feet && top && cam.dist > 1.5
      ? { x0: Math.min(feet.x, top.x) - (feet.y - top.y) * 0.3, x1: Math.max(feet.x, top.x) + (feet.y - top.y) * 0.3, y0: top.y, y1: feet.y }
      : null;
  // bulle au-dessus de la tête du joueur (pas en vue subjective)
  hud.placePlayerBubble(player.root.visible ? toScreen(head2.copy(me.pos).setY(me.pos.y + player.height + 0.35)) : null, s);
  hud.placeLabels(
    gates.portals.map((p) => {
      const sp = me.pos.distanceTo(p.pos) < 42 ? toScreen(p.top) : null;
      const behind = !!(sp && box && sp.x > box.x0 - 40 && sp.x < box.x1 + 40 && sp.y > box.y0 && sp.y < box.y1 + 14 && camera.position.distanceTo(p.top) > camera.position.distanceTo(me.pos));
      return { id: p.id, text: VERSIONS[p.key].name, color: `#${p.color.getHexString()}`, x: sp?.x, y: sp?.y, behind };
    }),
    s,
  );
  // micro-boutons enfoncés tant que leur fenêtre est ouverte
  microBar.querySelector(".micro-quest")?.classList.toggle("on", !!window.QuizUI?.logOpen());
  microBar.querySelector(".micro-world")?.classList.toggle("on", hud.worldMapOpen());
  microBar.querySelector(".micro-menu")?.classList.toggle("on", menu.isOpen());
  hud.drawWorldMap(me.pos.x, me.pos.z, me.yaw, LAYOUT.chromie, gates.portals.map((p) => ({ x: p.pos.x, z: p.pos.z, color: `#${p.color.getHexString()}` })));
  hud.drawMap(me.pos.x, me.pos.z, me.yaw, LAYOUT.chromie, questState, gates.portals.map((p) => ({ x: p.pos.x, z: p.pos.z, color: `#${p.color.getHexString()}` })));
}

// accès pour inspecter la scène depuis la console du navigateur
window.WORLD_DEBUG = { scene, camera, me, cam, chromie, chromiePos, player, renderer, shop, marker, hourglass, zone, blocked, timeFx, step: (dt) => update(dt), freeze: false };

// Sans le focus (Alt-Tab), 4 images par seconde ; onglet masqué, le
// navigateur suspend déjà la boucle.
let focused = document.hasFocus();
addEventListener("focus", () => (focused = true));
addEventListener("blur", () => (focused = false));
let lastDraw = 0;

function frame() {
  const now = performance.now();
  if (!focused && now - lastDraw < 250) {
    requestAnimationFrame(frame);
    return;
  }
  lastDraw = now;
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  t += dt;
  if (mode !== "game") glueFrame(dt);
  else if (!window.WORLD_DEBUG.freeze) update(dt);
  else chromie.animate(dt, { speed: 0, grounded: true, wave: 0, cheer: 0 });
  render();
  requestAnimationFrame(frame);
}

// Derrière les écrans d'accueil : à la connexion, un plan fixe sur Chromie, le
// sablier et les portails ; au choix du personnage, Leeroy face à nous, sur son
// disque.
let selYaw = Math.PI; // Leeroy regarde la caméra (vers le sud)
// logo en haut à gauche, Chromie en bas à gauche, le sablier derrière les champs, les portails à droite
const LOGIN_CAM = new THREE.Vector3(5.2, 2.1, 7.55);
const LOGIN_LOOK = new THREE.Vector3(-1, 3.4, -4.35);
Object.assign(window.WORLD_DEBUG, { loginCam: LOGIN_CAM, loginLook: LOGIN_LOOK });
function glueFrame(dt) {
  // le « ! » de quête n'est placé qu'en jeu
  marker.root.visible = false;
  hourglass.update(t, dt);
  zone.update(t, dt);
  gates.update(t, dt);
  // le ciel vit aussi derrière les écrans d'accueil
  timeFx.update(dt);
  chromie.animate(dt, { speed: 0, grounded: true, wave: 0, cheer: 0 });
  if (mode === "select" || mode === "loading") {
    me.pos.set(LAYOUT.spawn.x, groundAt(LAYOUT.spawn.x, LAYOUT.spawn.y), LAYOUT.spawn.y);
    player.root.position.copy(me.pos);
    player.root.rotation.y = selYaw;
    player.root.visible = true;
    player.animate(dt, { speed: 0, grounded: true });
    // le soleil (et sa carte d'ombres) suit Leeroy, comme en jeu
    sun.position.copy(me.pos).addScaledVector(sunDir, 120);
    sun.target.position.copy(me.pos);
    // Leeroy au centre, sur presque toute la hauteur, comme le client
    camera.position.set(me.pos.x, me.pos.y + 1.05, me.pos.z + 2.7);
    camTarget.set(me.pos.x, me.pos.y + 0.98, me.pos.z);
    camera.lookAt(camTarget);
  } else {
    // connexion : plan fixe, Chromie au premier plan, le sablier et les portails derrière
    player.root.visible = false;
    camera.position.copy(LOGIN_CAM);
    camera.lookAt(LOGIN_LOOK);
    chromie.root.rotation.y = Math.atan2(-(LOGIN_CAM.x - chromiePos.x), -(LOGIN_CAM.z - chromiePos.z));
  }
}

function startGame() {
  mode = "game";
  marker.root.visible = true;
  started = true;
  audio.start();
  heroicLeap();
  hud.zoneText("The Timeways", "Dawn of the Infinite");
  hud.chat("Welcome to World of Warcraft!", "system");
  if (matchMedia("(pointer: coarse)").matches) {
    hud.chat("Chromie is waiting near the great hourglass. Tap her to talk.", "system");
    hud.chat("Tap the ground to walk there. Drag to look around.", "system");
  } else {
    hud.chat("Chromie is waiting by the great hourglass. Right-click her to talk.", "system");
    hud.chat("Move: WASD (ZQSD on AZERTY). Steer: hold right-click. Zoom: mouse wheel. Menu & sound: Esc.", "system");
  }
  // un lien partagé ouvre directement le résultat de l'ami
  if (window.QuizUI?.hasShared()) window.QuizUI.open();
}
frame();
// le monde est prêt : la connexion peut aboutir
glue.worldReady();
