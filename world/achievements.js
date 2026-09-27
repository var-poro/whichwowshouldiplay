// Hauts faits, comme dans le jeu : l'alerte « Achievement Earned » en bas de
// l'écran (cadre, lueur, reflet, écusson de points), la fenêtre des hauts faits
// (bordure de bois, fronton, lignes sur parchemin) et son micro-bouton.
// Textures d'origine : assets/ui/ach/ (AchievementFrame du client) ; le fronton
// et la bordure de bois sont recomposés dans assets/built/ach-*.png.
// Les hauts faits obtenus et les compteurs sont gardés dans localStorage.
//
// Utilisation :
//   const ach = createAchievements({ onEarned: (a, line) => hud.chat(line, "achievement") });
//   ach.unlock("leeroy");          // obtenu tout de suite (sans effet s'il l'est déjà)
//   ach.progress("jumper");        // compteur +1, obtenu à la cible
//   ach.progress("explorer", "tbc"); // clé texte : compte les clés distinctes
// Le même objet est exposé en window.Achievements pour les scripts classiques.

const STORE = "which-wow-achievements";
const ICON = (n) => `assets/icons/${n}.jpg`;
const SOUND = (n) => `assets/sounds/${n}.mp3`;

export const ACHIEVEMENTS = [
  { id: "leeroy", name: "At Least I Have Chicken", description: "Shout your battle cry.", points: 10, icon: "inv_misc_food_15" },
  { id: "quest-profile", name: "A Hero's Measure", description: "Complete the quest A Hero's Measure.", points: 10, icon: "achievement_quests_completed_01" },
  { id: "quest-taste", name: "Acquired Taste", description: "Complete the quest Matters of Taste.", points: 10, icon: "achievement_quests_completed_02" },
  { id: "quest-company", name: "Good Company", description: "Complete the quest The Company You Keep.", points: 10, icon: "achievement_quests_completed_03" },
  { id: "quest-worlds", name: "World Shaper", description: "Complete the quest Shape of Worlds.", points: 10, icon: "achievement_quests_completed_04" },
  { id: "verdict", name: "The Timeways Beckon", description: "Receive Chromie's verdict.", points: 25, icon: "ability_mage_timewarp" },
  {
    id: "timewalker",
    name: "Timewalker",
    description: "Complete every quest in Chromie's chain.",
    points: 25,
    icon: "achievement_quests_completed_08",
    requires: ["quest-profile", "quest-taste", "quest-company", "quest-worlds", "verdict"],
  },
  { id: "wrong-portal", name: "Paradox Tourist", description: "Walk into the wrong timeline.", points: 5, icon: "spell_arcane_portaldalaran" },
  { id: "right-portal", name: "Through the Looking Glass", description: "Step through your own portal.", points: 10, icon: "spell_arcane_portalshattrath" },
  { id: "indecisive", name: "Indecisive", description: "Answer “Not sure” 5 times.", points: 5, icon: "inv_misc_questionmark", target: 5 },
  { id: "charter", name: "Friends in Timeless Places", description: "Get Chromie to sign your guild charter.", points: 5, icon: "inv_letter_15" },
  { id: "declines", name: "No Means No", description: "Decline Chromie's quest 5 times.", points: 5, icon: "ability_warrior_disarm", target: 5 },
  { id: "insomniac", name: "Do You Even Sleep?", description: "Plan a 24-hour gaming session.", points: 5, icon: "spell_nature_sleep" },
  { id: "first-person", name: "Up Close and Personal", description: "Zoom all the way into first person.", points: 5, icon: "ability_eyeoftheowl" },
  { id: "jumper", name: "Leap of Faith", description: "Jump 25 times.", points: 5, icon: "priest_spell_leapoffaith_a", target: 25 },
  { id: "window-shopper", name: "Window Shopper", description: "Visit the Blizzard shop from a portal.", points: 5, icon: "inv_misc_bag_10" },
  { id: "social", name: "Tell Your Friends", description: "Copy a share link.", points: 5, icon: "inv_letter_15" },
  { id: "touch-grass", name: "Touch Grass", description: "Be told to play nothing at all.", points: 10, icon: "spell_nature_naturetouchgrow" },
  { id: "void", name: "Into the Infinite", description: "Jump off the Timeways into the void.", points: 10, icon: "spell_shadow_twistedfaith" },
  { id: "explorer", name: "Timeways Explorer", description: "Visit every portal.", points: 10, icon: "inv_misc_map02", target: 7 },
];

const BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));
const TOTAL_POINTS = ACHIEVEMENTS.reduce((s, a) => s + a.points, 0);

function el(tag, cls, ...children) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  node.append(...children.filter((c) => c != null));
  return node;
}

// même règle de volume que les voix du monde (main.js) : suit « Sound Effects »
function sound(file, volume = 0.8) {
  const gain = window.SFX_GAIN ?? 1;
  if (gain <= 0) return;
  const a = new Audio(SOUND(file));
  a.volume = Math.min(1, volume * gain);
  a.play().catch(() => {});
}

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE)) || {};
    return { earned: s.earned || {}, counts: s.counts || {}, keys: s.keys || {} };
  } catch {
    return { earned: {}, counts: {}, keys: {} };
  }
}

// date à la façon du jeu : M/J/AA
const shortDate = (ms) => {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear() % 100).padStart(2, "0")}`;
};

// Ligne de discussion : « [Leeroy Jenkins] has earned the achievement [Nom]! »,
// le nom en lien doré entre crochets.
export function achievementChatLine(a) {
  const frag = document.createDocumentFragment();
  frag.append("[Leeroy Jenkins] has earned the achievement ", el("span", "ach-link", `[${a.name}]`), "!");
  return frag;
}

// Si l'appelant passe une simple chaîne à la discussion (classe « achievement »),
// on remet le nom en lien après coup : le texte entre crochets devient doré.
function linkifyChat() {
  const fix = (line) => {
    if (line.querySelector?.(".ach-link")) return;
    const text = line.textContent;
    // le lien est le nom du haut fait, pas celui du joueur (lui aussi entre crochets)
    const m = text.match(/^(.*achievement )(\[[^\]]+\])(.*)$/s);
    if (!m) return;
    line.replaceChildren(m[1], el("span", "ach-link", m[2]), m[3]);
  };
  new MutationObserver((records) => {
    for (const r of records)
      for (const n of r.addedNodes) if (n.nodeType === 1 && n.classList.contains("chat-line") && n.classList.contains("achievement")) fix(n);
  }).observe(document.body, { childList: true, subtree: true });
}

export function createAchievements({ onEarned } = {}) {
  const state = load();
  const save = () => {
    try {
      localStorage.setItem(STORE, JSON.stringify(state));
    } catch {}
  };

  // ---------- alertes ----------
  const toasts = el("div", "ach-toasts");

  function toast(a) {
    const shine = el("div", "ach-toast-shine");
    const node = el(
      "div",
      "ach-toast",
      el("div", "ach-toast-glow"),
      el("div", "ach-toast-icon", Object.assign(el("img"), { src: ICON(a.icon), alt: "" }), el("div", "ach-toast-iconframe")),
      el("div", "ach-toast-unlocked", "Achievement Earned"),
      el("div", "ach-toast-name", a.name),
      el("div", "ach-toast-shield", el("span", null, String(a.points))),
      shine,
    );
    node.title = "Click to open Achievements";
    node.onclick = () => open();
    toasts.append(node);
    // comme le jeu : quatre alertes au plus, la plus ancienne s'efface
    while (toasts.children.length > 4) toasts.firstChild.remove();
    setTimeout(() => node.classList.add("out"), 5200);
    setTimeout(() => node.remove(), 6800);
  }

  // ---------- fenêtre ----------
  const layer = el("div", "ach-layer");
  layer.hidden = true;
  const list = el("div", "ach-list");
  const pointsText = el("span");
  const barFill = el("div", "ach-bar-fill");
  const barText = el("span", "ach-bar-value");
  const closeBtn = el("button", "ach-close");
  closeBtn.setAttribute("aria-label", "Close");
  closeBtn.onclick = () => close();

  // barre de défilement du jeu : flèches, bouton de défilement, molette native
  const up = el("button", "ach-sb-btn up");
  const down = el("button", "ach-sb-btn down");
  const knob = el("div", "ach-sb-knob");
  const track = el("div", "ach-sb-track", knob);
  up.setAttribute("aria-label", "Scroll up");
  down.setAttribute("aria-label", "Scroll down");
  up.onclick = () => (window.playUiSound?.("check"), list.scrollBy({ top: -84, behavior: "smooth" }));
  down.onclick = () => (window.playUiSound?.("check"), list.scrollBy({ top: 84, behavior: "smooth" }));
  const syncScroll = () => {
    const { scrollTop, scrollHeight, clientHeight } = list;
    const max = scrollHeight - clientHeight;
    up.disabled = scrollTop <= 0;
    down.disabled = scrollTop >= max - 1;
    const room = track.clientHeight - 32;
    knob.style.top = `${max > 0 ? (scrollTop / max) * room : 0}px`;
    knob.hidden = max <= 0;
  };
  list.addEventListener("scroll", syncScroll);
  knob.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    knob.setPointerCapture(e.pointerId);
    const y0 = e.clientY;
    const top0 = list.scrollTop;
    const move = (ev) => {
      const room = track.getBoundingClientRect().height - knob.getBoundingClientRect().height;
      const max = list.scrollHeight - list.clientHeight;
      if (room > 0) list.scrollTop = top0 + ((ev.clientY - y0) / room) * max;
    };
    const stop = () => {
      knob.removeEventListener("pointermove", move);
      knob.removeEventListener("pointerup", stop);
    };
    knob.addEventListener("pointermove", move);
    knob.addEventListener("pointerup", stop);
  });

  const header = el(
    "div",
    "ach-header",
    el("div", "ach-title", "Achievements"),
    el("div", "ach-points", el("i", "ach-tinyshield"), pointsText),
  );
  const win = el(
    "div",
    "ach-window",
    el("div", "ach-corner tl"),
    el("div", "ach-corner tr"),
    el("div", "ach-corner bl"),
    el("div", "ach-corner br"),
    header,
    closeBtn,
    el("div", "ach-summary", el("div", "ach-bar big", barFill, el("span", "ach-bar-label", "Achievements Earned"), barText)),
    el("div", "ach-list-wrap", list, el("div", "ach-sb", up, track, down)),
  );
  layer.append(win);

  const micro = el("button", "micro-btn micro-ach");
  micro.setAttribute("aria-label", "Achievements");
  micro.onclick = () => toggle();

  document.body.append(toasts, layer, micro);
  linkifyChat();

  // Clic sur [Nom] dans la discussion : l'info-bulle du haut fait, comme un
  // lien de la discussion du jeu, avec une croix pour la refermer.
  let ref = null;
  const closeRef = () => {
    ref?.remove();
    ref = null;
  };
  function showRef(a) {
    closeRef();
    const when = state.earned[a.id];
    const p = progressOf(a);
    const close = el("button", "ach-ref-close");
    close.setAttribute("aria-label", "Close");
    close.onclick = () => (window.playUiSound?.("close"), closeRef());
    ref = el(
      "div",
      "tooltip ach-ref",
      close,
      el("div", "ach-ref-name", a.name),
      el("div", "ach-ref-desc", a.description),
      p && !when ? el("div", "ach-ref-progress", `${p.n} / ${p.target}`) : null,
      el("div", when ? "ach-ref-earned" : "ach-ref-locked", when ? `Achievement earned by Leeroy Jenkins on ${new Date(when).toLocaleDateString("en-US")}` : "Not yet earned"),
      el("div", "ach-ref-points", el("span", "ach-ref-shield"), `${a.points} points`),
    );
    document.body.append(ref);
  }
  document.addEventListener("click", (e) => {
    const link = e.target.closest?.(".chat .ach-link");
    if (!link) return;
    const name = link.textContent.replace(/^\[|\]$/g, "");
    const a = ACHIEVEMENTS.find((x) => x.name === name);
    if (a) (window.playUiSound?.("click"), showRef(a));
  });

  // avancement d'un haut fait : compteur, ou nombre de hauts faits requis obtenus
  function progressOf(a) {
    if (a.requires) return { n: a.requires.filter((id) => state.earned[id]).length, target: a.requires.length };
    if (a.target) return { n: Math.min(a.target, state.counts[a.id] || 0), target: a.target };
    return null;
  }

  function row(a) {
    const when = state.earned[a.id];
    const p = progressOf(a);
    const bar =
      !when && p
        ? el(
            "div",
            "ach-bar small",
            Object.assign(el("div", "ach-bar-fill"), { style: `width:${(p.n / p.target) * 100}%` }),
            el("span", "ach-bar-value", `${p.n} / ${p.target}`),
          )
        : null;
    return el(
      "div",
      `ach-row${when ? " earned" : ""}`,
      el("div", "ach-row-title", el("span", null, a.name)),
      when ? el("div", "ach-row-date", shortDate(when)) : null,
      el("div", "ach-row-icon", Object.assign(el("img"), { src: ICON(a.icon), alt: "" }), el("div", "ach-row-iconframe")),
      el("div", "ach-row-desc", a.description),
      bar,
      el("div", "ach-row-shield", el("span", null, String(a.points))),
    );
  }

  function render() {
    const earned = ACHIEVEMENTS.filter((a) => state.earned[a.id]);
    const points = earned.reduce((s, a) => s + a.points, 0);
    pointsText.textContent = `${points} / ${TOTAL_POINTS}`;
    barFill.style.width = `${(earned.length / ACHIEVEMENTS.length) * 100}%`;
    barText.textContent = `${earned.length} / ${ACHIEVEMENTS.length}`;
    const top = list.scrollTop;
    list.replaceChildren(...ACHIEVEMENTS.map(row));
    list.scrollTop = top;
    requestAnimationFrame(syncScroll);
  }

  function open() {
    if (!layer.hidden) return;
    render();
    layer.hidden = false;
    micro.classList.add("on");
    sound("AchievementMenuOpen", 0.6);
    requestAnimationFrame(syncScroll);
  }
  function close() {
    if (layer.hidden) return;
    layer.hidden = true;
    micro.classList.remove("on");
    sound("AchievementMenuClose", 0.6);
  }
  const toggle = () => (layer.hidden ? open() : close());

  // ---------- obtention ----------
  function earn(id) {
    const a = BY_ID.get(id);
    if (!a || state.earned[id]) return false;
    state.earned[id] = Date.now();
    save();
    toast(a);
    sound("AchievmentSound1", 0.7);
    onEarned?.(a, achievementChatLine(a));
    if (!layer.hidden) render();
    // hauts faits « méta » : obtenus quand tous leurs prérequis le sont
    for (const m of ACHIEVEMENTS) if (m.requires && !state.earned[m.id] && m.requires.every((r) => state.earned[r])) earn(m.id);
    return true;
  }

  function progress(id, amount = 1) {
    const a = BY_ID.get(id);
    if (!a || state.earned[id]) return;
    if (typeof amount === "string") {
      // clé texte : on compte les clés distinctes (portails visités, par exemple)
      const keys = new Set(state.keys[id] || []);
      keys.add(amount);
      state.keys[id] = [...keys];
      state.counts[id] = keys.size;
    } else state.counts[id] = (state.counts[id] || 0) + amount;
    save();
    if (a.target && state.counts[id] >= a.target) earn(id);
    else if (!a.target) earn(id);
    else if (!layer.hidden) render();
  }

  const api = {
    unlock: (id) => void earn(id),
    progress,
    isEarned: (id) => !!state.earned[id],
    open,
    close,
    toggle,
    isOpen: () => !layer.hidden,
  };
  api.closeRef = closeRef;
  api.refOpen = () => !!ref;
  window.Achievements = api;
  return api;
}
