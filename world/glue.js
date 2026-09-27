// Écrans d'avant le jeu (les « glue screens » du client), comme WoW Classic :
// connexion, puis sélection du personnage (Leeroy), puis le chargement.
// Textures de Classic (assets/ui/glues, dépôt Gethe/wow-ui-textures).
//
// La connexion est factice : le nom de compte et le mot de passe s'écrivent
// tout seuls (machine à écrire) et sont en lecture seule, rien de ce qu'on
// tape n'est pris. Elle s'affiche
// tout de suite et cache le chargement du monde ; « Connecting... » attend que
// le monde soit prêt avant la sélection du personnage.

import { channelVolume, settings } from "./settings.js?v=2";

// sons du client : bouton des écrans d'accueil, et « Enter World »
function sound(name, volume = 0.6) {
  const gain = channelVolume(settings.get(), "effects");
  if (gain <= 0) return;
  const a = new Audio(`assets/sounds/${name}.mp3`);
  a.volume = Math.min(1, volume * gain);
  a.play().catch(() => {});
}

// Musique des écrans d'accueil : un thème principal tiré au hasard parmi les
// extensions (Classic, Burning Crusade, Wrath exportés par Poro ; les autres
// depuis la sonothèque de Wowhead). Le navigateur n'accepte le son qu'après
// un premier geste : on réessaie au premier clic ou à la première touche.
const THEMES = [
  "wow_main_theme",
  "bc_main_theme",
  "wotlk_main_title",
  "MUS_50_HeartofPandaria_01",
  "MUS_60_ASiegeofWorlds_MainTitle",
  "MUS_70_KingdomsWillBurn_MainTitle",
  "MUS_80_BeforetheStorm_MainTitle",
  "MUS_90_ThroughTheRoofOfTheWorld_MainTitle",
  "MUS_100_Dragonflight_MainTitle",
  "MUS_110_TheWarWithin_Maintitle_6075186",
  "MUS_1200_Midnight_Main_Title_7713732",
];
function loginMusic() {
  const music = new Audio(`assets/sounds/login/${THEMES[Math.floor(Math.random() * THEMES.length)]}.mp3`);
  music.loop = true;
  // lue au fil de l'eau : les thèmes font jusqu'à 20 Mo, inutile de tout charger
  music.preload = "none";
  const level = () => channelVolume(settings.get(), "music") * 0.8;
  music.volume = level();
  const off = settings.onChange(() => (music.volume = level()));
  let playing = false;
  const tryPlay = () => {
    if (playing || level() <= 0) return;
    music.play().then(() => (playing = true), () => {});
  };
  tryPlay();
  const gesture = () => tryPlay();
  addEventListener("pointerdown", gesture);
  addEventListener("keydown", gesture);
  return {
    // fondu à l'entrée dans le monde
    stop() {
      removeEventListener("pointerdown", gesture);
      removeEventListener("keydown", gesture);
      off();
      const start = music.volume;
      let k = 1;
      const fade = setInterval(() => {
        k -= 0.05;
        music.volume = Math.max(0, start * k);
        if (k <= 0) {
          clearInterval(fade);
          music.pause();
        }
      }, 60);
    },
  };
}

function el(tag, cls, ...children) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  node.append(...children.filter((c) => c != null));
  return node;
}

// bouton rouge des écrans d'accueil (Glue-Panel-Button)
function glueButton(label, onclick, disabled = false, click = "iUiMainMenuButtonA") {
  const b = el("button", "glue-btn", label);
  b.disabled = disabled;
  b.dataset.sound = click;
  b.onclick = () => {
    sound(b.dataset.sound);
    onclick();
  };
  return b;
}

export function createGlue({ onCharSelect, onEnterWorld, onRotate, level = () => 1 }) {
  document.body.classList.add("glue");
  // mise en page pensée pour 1024 × 768, à l'échelle de l'écran
  const fit = () => document.documentElement.style.setProperty("--glue", Math.min(1.25, innerWidth / 1024, innerHeight / 768).toFixed(3));
  addEventListener("resize", fit);
  fit();
  const root = el("div", "glue-layer");
  document.body.append(root);
  let state = "login";
  let worldReady = false;
  let connectTimer = 0;

  // ---------- boîte de dialogue (Connecting..., messages) ----------
  const dialogText = el("div", "glue-dialog-text");
  const dialogBtn = glueButton("Cancel", () => closeDialog());
  const dialog = el("div", "glue-dialog", el("div", "glue-dialog-box", dialogText, dialogBtn));
  dialog.hidden = true;
  function showDialog(text, button, onclick) {
    dialogText.textContent = text;
    dialogBtn.textContent = button;
    dialogBtn.hidden = !button;
    dialogBtn.onclick = () => {
      sound("iUiMainMenuButtonA");
      (onclick || closeDialog)();
    };
    dialog.hidden = false;
  }
  function closeDialog() {
    dialog.hidden = true;
    clearTimeout(connectTimer);
    if (state === "connecting") state = "login";
  }

  // ---------- connexion ----------
  const ACCOUNT = "lerooooooooooooooooooy@jeeeeeeeeeeeeeeenkins.loot";
  // masqué, mais lisible pour qui passe le champ en type="text"
  const PASSWORD = "ohmygodhejustwentin";
  const account = el("input", "glue-edit account");
  Object.assign(account, { value: "", readOnly: true, spellcheck: false });
  const password = el("input", "glue-edit password");
  Object.assign(password, { type: "password", value: "", readOnly: true });
  // Machine à écrire : le compte, puis le mot de passe, lettre à lettre. On
  // l'achève d'un coup si on se connecte avant la fin.
  let typing = 0;
  const typeIn = () => {
    const fields = [
      [account, ACCOUNT],
      [password, PASSWORD],
    ];
    const step = () => {
      const next = fields.find(([f, v]) => f.value.length < v.length);
      if (!next) return;
      const [f, v] = next;
      f.value = v.slice(0, f.value.length + 1);
      f.scrollLeft = f.scrollWidth;
      // une lettre toutes les 35 à 80 ms, une pause entre les deux champs
      typing = setTimeout(step, f.value.length === v.length ? 450 : 35 + Math.random() * 45);
    };
    typing = setTimeout(step, 700);
  };
  const finishTyping = () => {
    clearTimeout(typing);
    account.value = ACCOUNT;
    password.value = PASSWORD;
  };
  typeIn();
  const remember = el("button", "glue-check on");
  remember.onclick = () => remember.classList.toggle("on");
  const login = el(
    "div",
    "glue-login",
    el("img", "glue-logo"),
    el(
      "div",
      "glue-login-box",
      el("div", "glue-label", "Account Name"),
      account,
      el("div", "glue-label", "Password"),
      password,
      glueButton("Login", () => connect()),
      el("label", "glue-remember", remember, el("span", null, "Remember Account Name")),
    ),
    // à la place du copyright du jeu, en bas au centre : la mention de projet de fan
    el(
      "div",
      "glue-legal",
      "Fan project, non-commercial. Not affiliated with or endorsed by Blizzard Entertainment.",
      el("br"),
      "World of Warcraft and its game assets are trademarks and property of Blizzard Entertainment, Inc.",
    ),
  );
  login.querySelector(".glue-logo").src = "assets/built/wow-logo.png";
  const music = loginMusic();

  function connect() {
    if (state !== "login") return;
    finishTyping();
    state = "connecting";
    showDialog("Connecting", "Cancel");
    const steps = ["Authenticating", "Retrieving character list"];
    let i = 0;
    const next = () => {
      if (state !== "connecting") return;
      if (i < steps.length) {
        dialogText.textContent = steps[i++];
        connectTimer = setTimeout(next, 700);
      } else if (worldReady) charSelect();
      else connectTimer = setTimeout(next, 300);
    };
    connectTimer = setTimeout(next, 700);
  }

  // ---------- sélection du personnage ----------
  const charLevel = el("div", "glue-char-info");
  // « Create New Character » : on insiste, elle finit par avouer
  let createTries = 0;
  const createChar = () =>
    showDialog(
      createTries++ === 0
        ? "There's no point in creating a new character, you'll delete it anyways."
        : "You DO know this isn't the real deal and it's just an online in-browser experience, right?",
      "Okay",
    );
  // le personnage de la liste : un double-clic entre dans le monde, comme en jeu
  const charButton = el("button", "glue-char selected", el("div", "glue-char-name", "Leeroy Jenkins"), charLevel, el("div", "glue-char-zone", "The Timeways"));
  charButton.ondblclick = () => {
    sound("iEnterWorldA");
    enter();
  };
  // liste des personnages, sur toute la hauteur à droite : le royaume en tête
  const list = el(
    "div",
    "glue-charlist",
    el("div", "glue-realm", "The Timeways"),
    glueButton("Change Realm", () => showDialog("There is only one realm. Chromie made sure of it.", "Okay")),
    el("div", "glue-chars", charButton),
    glueButton("Create New Character", createChar),
  );
  // flèches pour faire tourner le personnage (comme glisser)
  const rotate = (dir) => {
    const b = el("button", `glue-arrow ${dir}`);
    b.setAttribute("aria-label", dir === "left" ? "Rotate left" : "Rotate right");
    let timer = 0;
    const stop = () => clearInterval(timer);
    b.onpointerdown = () => {
      stop();
      onRotate?.(dir === "left" ? -0.12 : 0.12);
      timer = setInterval(() => onRotate?.(dir === "left" ? -0.06 : 0.06), 30);
    };
    b.onpointerup = b.onpointerleave = stop;
    return b;
  };
  const select = el(
    "div",
    "glue-select",
    el("img", "glue-logo"),
    list,
    el("div", "glue-enter", glueButton("Enter World", () => enter(), false, "iEnterWorldA"), el("div", "glue-arrows", rotate("left"), rotate("right"))),
    el(
      "div",
      "glue-select-side",
      glueButton("Delete Character", () => showDialog("You cannot delete Leeroy Jenkins. Legends are forever.", "Okay")),
      glueButton("Back", () => backToLogin()),
    ),
  );
  select.querySelector(".glue-logo").src = "assets/built/wow-logo.png";
  select.hidden = true;

  function charSelect() {
    state = "select";
    dialog.hidden = true;
    login.hidden = true;
    charLevel.textContent = `Level ${level()} Paladin`;
    select.hidden = false;
    onCharSelect?.();
  }
  function backToLogin() {
    state = "login";
    select.hidden = true;
    login.hidden = false;
    onCharSelect?.(false);
  }
  function enter() {
    if (state !== "select") return;
    state = "done";
    music.stop();
    root.remove();
    document.body.classList.remove("glue");
    onEnterWorld?.();
  }

  // Entrée valide l'écran en cours, comme en jeu
  addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || state === "done") return;
    e.stopImmediatePropagation();
    if (!dialog.hidden && state !== "connecting") closeDialog();
    else if (state === "login") {
      sound("iUiMainMenuButtonA");
      connect();
    }
    else if (state === "select") {
      sound("iEnterWorldA");
      enter();
    }
  }, true);

  root.append(login, select, dialog);
  return {
    state: () => state,
    // le monde est chargé : la sélection du personnage peut s'afficher
    worldReady() {
      worldReady = true;
      login.classList.add("ready");
    },
  };
}
