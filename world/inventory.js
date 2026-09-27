// Sac à dos, comme dans le jeu (Classic) : le cadre « Backpack » à 16 cases
// en bas à droite, son bouton (Button-Backpack-Up), l'argent en bas du sac,
// la bordure de qualité des objets (WhiteIconFrame teintée, comme le jeu
// moderne), la lueur des objets neufs (atlas Bags) et l'info-bulle d'objet.
// Textures d'origine : assets/ui/bag/ (ContainerFrame, Buttons, MoneyFrame,
// Common du client). Sons : igBackPackOpen / igBackPackClose (kits 862 / 863).
//
// Les objets ne sont pas stockés : ils se déduisent des quêtes rendues
// (window.QuizUI). Seuls les objets déjà vus (fin de la lueur « nouvel
// objet ») et les temps de recharge sont gardés dans localStorage.
//
// Clic droit sur un objet (ou second toucher) : on l'utilise. L'effet est
// décidé par le monde (world/main.js, via inv.onUse) ; le sac gère le temps
// de recharge (« Item is not ready yet. ») et son voile sur la case.
//
// Utilisation :
//   const inv = createInventory();
//   inv.toggle();   // touche B
//   inv.close();    // Échap
// Le même objet est exposé en window.Inventory pour les scripts classiques.

const STORE = "which-wow-inventory";
const ICON = (n) => `assets/icons/${n}.jpg`;
const SOUND = (n) => `assets/sounds/${n}.mp3`;

// Ce qu'il reste à Leeroy après les réparations : 0 po 13 pa 37 pc.
const MONEY = { gold: 0, silver: 13, copper: 37 };

const QUALITY = {
  common: "#ffffff",
  uncommon: "#1eff00",
  rare: "#0070dd",
  epic: "#a335ee",
  legendary: "#ff8000",
};

// Info-bulles des récompenses de quête, par identifiant de quête.
const REWARD_TIPS = {
  profile: {
    level: 5,
    slot: ["Trinket", ""],
    unique: true,
    lines: [["green", "Use: Tells you exactly how much time you have left. It is less than you think."]],
    flavor: "It runs five minutes fast. Or five years. Hard to say.",
    sell: { silver: 1 },
  },
  taste: {
    level: 10,
    lines: [
      ["green", "Use: Restores 2,006 health over 20 sec. Must remain seated while eating. Tastes different in every expansion."],
    ],
    flavor: "Chef's recommendation: whatever you liked in 2006.",
    sell: { copper: 25 },
  },
  company: {
    level: 1,
    unique: true,
    lines: [
      ["green", "Use: Ask nine strangers to sign. Most of them will leave within the week."],
      ["red", "Requires 9 more signatures"],
    ],
    flavor: "Guild name: <To Be Decided>.",
    sell: { copper: 1 },
  },
  worlds: {
    level: 25,
    unique: true,
    lines: [["green", "Use: Unfolds every version of Azeroth at once. Folding it back is left as an exercise to the reader."]],
    flavor: "Not to scale. Not to timeline either.",
    sell: { silver: 42 },
  },
};

// Info-bulle générique si une récompense n'a pas de texte prévu.
const FALLBACK_TIP = { level: 1, lines: [], flavor: "Chromie swears it was yours all along." };

function el(tag, cls, ...children) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  node.append(...children.filter((c) => c != null));
  return node;
}

// même règle de volume que le reste : suit « Sound Effects », muet à 0
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
    return { seen: Array.isArray(s.seen) ? s.seen : [], cooldowns: s.cooldowns && typeof s.cooldowns === "object" ? s.cooldowns : {}, signed: s.signed === true };
  } catch {
    return { seen: [], cooldowns: {}, signed: false };
  }
}

// Somme d'argent à la façon du jeu : nombre suivi de sa pièce. Le sac montre
// les petites pièces même à zéro ; une info-bulle, seulement les non nulles.
function money({ gold = 0, silver = 0, copper = 0 }, cls = "inv-money") {
  const node = el("span", cls);
  const parts = [
    ["gold", gold],
    ["silver", silver],
    ["copper", copper],
  ];
  const first = parts.findIndex(([, n]) => n);
  const shown = cls.includes("small") ? parts.filter(([, n]) => n) : first < 0 ? [] : parts.slice(first);
  for (const [coin, n] of shown.length ? shown : [["copper", 0]]) node.append(el("span", `inv-coin ${coin}`, String(n)));
  return node;
}

// ---------- objets ----------

// La charte de guilde signée par Chromie (easter egg) : une signature sur neuf.
let charterSigned = false;
const SIGNED_CHARTER = {
  ...REWARD_TIPS.company,
  lines: [
    ["green", "Use: Ask nine strangers to sign. Most of them will leave within the week."],
    ["white", "Signed by: Chromie <Timewalker>"],
    ["red", "Requires 8 more signatures"],
  ],
  flavor: "Guild name: <To Be Decided>. Officer of time: Chromie.",
};

function items() {
  const quiz = window.QuizUI;
  const done = quiz?.doneQuests?.() || [];
  const list = [
    {
      id: "hearthstone",
      name: "Hearthstone",
      icon: "inv_misc_rune_01",
      quality: "common",
      tip: {
        unique: true,
        soulbound: true,
        lines: [
          ["green", "Use: Returns you to Chromie. Speak to an Innkeeper to change your home location."],
          ["white", "Cooldown: 1 min"],
        ],
        flavor: "Home is where the chicken is.",
      },
    },
  ];
  const quests = typeof QUESTS !== "undefined" ? QUESTS : [];
  for (const q of quests) {
    if (!q.reward || !done.includes(q.id)) continue;
    const tip = q.id === "company" && charterSigned ? SIGNED_CHARTER : REWARD_TIPS[q.id] || REWARD_TIPS[q.reward.name] || FALLBACK_TIP;
    list.push({ id: q.id, ...q.reward, tip });
  }
  const key = quiz?.verdict?.();
  const v = key && typeof VERSIONS !== "undefined" ? VERSIONS[key] : null;
  if (v) {
    list.push({
      id: `verdict-${key}`,
      name: v.name,
      icon: v.icon,
      quality: "legendary",
      tip: {
        level: 1000,
        bind: "Binds to account",
        unique: true,
        slot: ["Timeline", v.kind],
        lines: [
          ...v.pros.slice(0, 2).map((p) => ["green", `Equip: ${p}.`]),
          ...v.cons.slice(0, 1).map((c) => ["red", `${c}.`]),
          ["green", key === "none" ? "Use: Log out. Go outside." : "Use: Opens the way to your timeline. Chromie takes no refunds."],
        ],
        flavor: v.tagline,
        sellText: key === "none" ? "Sell Price: priceless" : "Sell Price: 1 subscription",
      },
    });
  }
  return list;
}

// Info-bulle d'objet : même cadre que .tooltip (style.css), nom à la couleur
// de la qualité, lignes dans l'ordre du jeu.
function tooltipFor(item, cooldownLeft = 0) {
  const t = item.tip || FALLBACK_TIP;
  const name = el("div", "t-name", item.name);
  name.style.color = QUALITY[item.quality] || QUALITY.common;
  const rows = [name];
  if (t.level) rows.push(el("div", "inv-t-level", `Item Level ${t.level}`));
  rows.push(el("div", null, t.bind || (t.soulbound ? "Soulbound" : "Binds when picked up")));
  if (t.unique) rows.push(el("div", null, "Unique"));
  if (t.slot) rows.push(el("div", "t-row", el("span", null, t.slot[0]), el("span", null, t.slot[1])));
  // en recharge, le jeu remplace la durée de recharge par ce qu'il en reste
  for (const [kind, text] of (t.lines || []).filter(([, text]) => !(cooldownLeft > 0 && text.startsWith("Cooldown:")))) rows.push(el("div", kind === "green" ? "t-green" : kind === "red" ? "t-red" : null, text));
  if (cooldownLeft > 0) rows.push(el("div", null, `Cooldown remaining: ${cooldownLeft >= 60 ? `${Math.ceil(cooldownLeft / 60)} min` : `${Math.ceil(cooldownLeft)} sec`}`));
  if (t.flavor) rows.push(el("div", "t-flavor", `"${t.flavor}"`));
  if (t.sellText) rows.push(el("div", null, t.sellText));
  else if (t.sell) rows.push(el("div", "inv-t-sell", "Sell Price: ", money(t.sell, "inv-money small")));
  return el("div", "tooltip inv-tip", ...rows);
}

export function createInventory() {
  const state = load();
  const seen = new Set(state.seen);
  seen.add("hearthstone"); // la pierre de foyer est là depuis toujours
  const cooldowns = state.cooldowns; // id -> fin du temps de recharge (ms, horloge du navigateur)
  charterSigned = state.signed;
  const save = () => {
    try {
      localStorage.setItem(STORE, JSON.stringify({ seen: [...seen], cooldowns, signed: charterSigned }));
    } catch {}
  };
  // durée de recharge (secondes) ; une recharge sauvegardée plus longue
  // (ancienne valeur) est ramenée à cette durée
  const DURATIONS = { hearthstone: 60 };
  const cooldownLeft = (id) => Math.min(DURATIONS[id] ?? Infinity, Math.max(0, ((cooldowns[id] || 0) - Date.now()) / 1000));
  let onUse = null;
  function use(item) {
    if (cooldownLeft(item.id) > 0) return onUse?.(item, { notReady: true });
    onUse?.(item, {});
  }

  // ---------- sac ----------
  const slots = el("div", "inv-slots");
  const closeBtn = el("button", "inv-close");
  closeBtn.setAttribute("aria-label", "Close");
  closeBtn.onclick = () => close();
  const bag = el(
    "div",
    "inv-bag",
    el("div", "inv-title", "Backpack"),
    closeBtn,
    slots,
    el("div", "inv-money-bar", money(MONEY)),
  );
  bag.hidden = true;
  bag.setAttribute("role", "dialog");
  bag.setAttribute("aria-label", "Backpack");

  // ---------- bouton du sac ----------
  const button = el("button", "inv-button");
  button.title = "Backpack";
  button.setAttribute("aria-label", "Backpack");
  button.onclick = () => toggle();

  document.body.append(bag, button);

  // ---------- info-bulle ----------
  let tip = null;
  let tipFor = null; // { slot, item, side, secs } : pour la rafraîchir pendant une recharge
  function hideTip() {
    tip?.remove();
    tip = null;
    tipFor = null;
  }
  // À gauche de la case, haut aligné, comme les sacs du jeu ; à droite s'il
  // n'y a pas la place, et toujours dans l'écran.
  // Dans une fenêtre (journal, Chromie), le jeu l'accroche à droite de l'objet.
  function showTip(slot, item, side = "left") {
    hideTip();
    tip = tooltipFor(item, cooldownLeft(item.id));
    tipFor = { slot, item, side, secs: Math.ceil(cooldownLeft(item.id)) };
    document.body.append(tip);
    const z = parseFloat(getComputedStyle(tip).zoom) || 1;
    const r = slot.getBoundingClientRect();
    const w = tip.offsetWidth * z;
    const h = tip.offsetHeight * z;
    let left = side === "right" && r.right + 2 + w <= innerWidth - 4 ? r.right + 2 : r.left - w - 2;
    if (left < 4) left = Math.min(r.right + 2, innerWidth - w - 4);
    const top = Math.max(4, Math.min(r.top, innerHeight - h - 4));
    tip.style.left = `${left / z}px`;
    tip.style.top = `${top / z}px`;
  }

  // ---------- cases ----------
  function slotFor(item) {
    const slot = el("div", "inv-slot");
    if (!item) return slot;
    slot.classList.add("full", item.quality);
    slot.style.setProperty("--q", QUALITY[item.quality] || QUALITY.common);
    slot.append(Object.assign(el("img", "inv-icon"), { src: ICON(item.icon), alt: item.name, draggable: false }));
    if (item.quality !== "common") slot.append(el("div", "inv-border"));
    if (!seen.has(item.id)) slot.append(el("div", `inv-new ${item.quality}`), el("div", "inv-flash"));
    slot.tabIndex = 0;
    slot.setAttribute("aria-label", item.name);
    const show = () => {
      // comme le jeu : survoler un objet neuf éteint sa lueur
      slot.querySelector(".inv-new")?.remove();
      showTip(slot, item);
    };
    // voile du temps de recharge, qui se retire en tournant comme en jeu
    const cd = el("div", "inv-cd");
    slot.append(cd);
    slot.dataset.id = item.id;
    slot._item = item;
    slot.addEventListener("pointerenter", show);
    slot.addEventListener("pointerleave", hideTip);
    slot.addEventListener("focus", show);
    slot.addEventListener("blur", hideTip);
    // clic droit : utiliser ; au doigt, un premier toucher montre l'info-bulle, le second utilise
    slot.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      use(item);
    });
    slot.addEventListener("click", (e) => {
      if (e.pointerType === "touch" && tip) return use(item);
      tip ? hideTip() : show();
    });
    return slot;
  }

  function render() {
    const list = items();
    const cells = [];
    for (let i = 0; i < 16; i++) cells.push(slotFor(list[i]));
    hideTip();
    slots.replaceChildren(...cells);
    paintCooldowns();
    return list;
  }

  // voiles de recharge et durée restante dans l'info-bulle, à chaque image
  // tant que le sac est ouvert, comme en jeu (le voile tourne en continu)
  function paintCooldowns() {
    for (const slot of slots.querySelectorAll(".inv-slot.full")) {
      const id = slot.dataset.id;
      const left = cooldownLeft(id);
      const cd = slot.querySelector(".inv-cd");
      cd.hidden = left <= 0;
      if (left > 0) cd.style.setProperty("--p", `${Math.min(1, left / (DURATIONS[id] || left)) * 360}deg`);
    }
  }
  const tick = () => {
    if (!bag.hidden) {
      paintCooldowns();
      // info-bulle ouverte sur un objet en recharge : refaite à chaque seconde écoulée
      if (tipFor?.slot.isConnected && Math.ceil(cooldownLeft(tipFor.item.id)) !== tipFor.secs) showTip(tipFor.slot, tipFor.item, tipFor.side);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  // ---------- placement ----------
  // Le bouton du sac se met dans le coin bas-droit de l'écran, à 2 px des
  // bords (son cadre UI-Quickslot2 déborde l'icône de 1,5 px), les
  // micro-boutons juste à sa gauche ; le sac s'ouvre au-dessus du bouton.
  function layout() {
    const z = parseFloat(getComputedStyle(button).zoom) || 1;
    const size = (37 + 2) * z;
    button.style.right = "2px";
    button.style.bottom = "2px";
    const micro = document.querySelector(".micro-bar");
    if (micro) {
      const mz = parseFloat(getComputedStyle(micro).zoom) || 1;
      micro.style.right = `${size / mz}px`;
    }
    const bz = parseFloat(getComputedStyle(bag).zoom) || 1;
    const room = innerHeight - 256 * bz - 8;
    bag.style.right = `${14 / bz}px`;
    bag.style.bottom = `${Math.max(0, Math.min(size + 8, room)) / bz}px`;
  }
  // après les autres écouteurs de « resize » (griffons, --hud)
  addEventListener("resize", () => requestAnimationFrame(layout));
  requestAnimationFrame(layout);
  // la barre (et ses griffons) peut arriver après nous
  setTimeout(layout, 1000);

  // ---------- ouverture ----------
  function open() {
    if (!bag.hidden) return;
    const list = render();
    layout();
    bag.hidden = false;
    button.classList.add("on");
    sound("iEquipmentContainerOpenA", 0.7);
    // la lueur reste visible pendant cette ouverture, puis disparaît
    let changed = false;
    for (const it of list)
      if (!seen.has(it.id)) {
        seen.add(it.id);
        changed = true;
      }
    if (changed) save();
  }
  function close() {
    if (bag.hidden) return;
    bag.hidden = true;
    hideTip();
    button.classList.remove("on");
    sound("iEquipmentContainerCloseA", 0.7);
  }
  const toggle = () => (bag.hidden ? open() : close());

  // Nouveaux objets pendant que le sac est ouvert : on redessine ; ils gardent
  // leur lueur jusqu'à la prochaine ouverture.
  function refresh() {
    if (bag.hidden) return;
    render();
  }
  addEventListener("quest:done", refresh);
  addEventListener("quest:complete", refresh);

  // Récompense de quête survolée hors du sac (fenêtre de Chromie, journal) :
  // même info-bulle que dans le sac.
  function showRewardTip(anchor, q) {
    if (!q?.reward) return;
    showTip(anchor, { id: q.id, ...q.reward, tip: REWARD_TIPS[q.id] || FALLBACK_TIP }, "right");
  }

  const api = {
    open,
    close,
    toggle,
    isOpen: () => !bag.hidden,
    refresh,
    showRewardTip,
    hideTip,
    // effet d'un objet utilisé : fn(item, { notReady })
    onUse(fn) {
      onUse = fn;
    },
    // la charte de guilde : signée par Chromie ?
    charterSigned: () => charterSigned,
    signCharter() {
      charterSigned = true;
      save();
      refresh();
    },
    // lance le temps de recharge d'un objet (secondes)
    startCooldown(id, secs) {
      cooldowns[id] = Date.now() + secs * 1000;
      DURATIONS[id] = secs;
      save();
      paintCooldowns();
    },
  };
  window.Inventory = api;
  return api;
}
