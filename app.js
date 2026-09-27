// Déroulé du quiz : une question à la fois, puis le résultat.

const app = document.getElementById("app");
// Dans le monde 3D (index.html), la fenêtre de quête s'ouvre quand on parle
// à Chromie ; seule (quiz.html), elle s'affiche d'emblée.
const WORLD = !!window.WORLD;
const SKIP = "skip"; // « I'm not sure » : la question ne compte pour personne
let answers = []; // réponse brute par question (index, position, liste, horaire) ou SKIP
let onKey = null; // raccourcis clavier de l'écran courant

document.addEventListener("keydown", (e) => onKey?.(e));

// ---------- Calcul du résultat ----------

const zero = () => Object.fromEntries(Object.keys(VERSIONS).map((v) => [v, 0]));

// Points et raisons données par une réponse, selon le type de question.
function evaluate(q, a) {
  if (q.type === "choice") {
    const o = q.options[a];
    return { pts: o.pts, reasons: o.because ? [{ text: o.because, pts: o.pts }] : [] };
  }
  if (q.type === "slider") {
    const x = a * (q.stops.length - 1);
    const i = Math.floor(x);
    const j = Math.min(i + 1, q.stops.length - 1);
    const t = x - i;
    const pts = zero();
    for (const v in pts) pts[v] = (q.stops[i].pts[v] || 0) * (1 - t) + (q.stops[j].pts[v] || 0) * t;
    const near = q.stops[Math.round(x)];
    return { pts, reasons: near.because ? [{ text: near.because, pts: near.pts }] : [] };
  }
  if (q.type === "multi") {
    const picked = q.items.filter((it) => a.includes(it.id));
    const pts = zero();
    for (const it of picked) for (const [v, p] of Object.entries(it.pts)) pts[v] += p / picked.length;
    return { pts, reasons: picked.filter((it) => it.because).map((it) => ({ text: it.because, pts: it.pts })) };
  }
  if (q.type === "schedule") {
    const weekly = a.days.length * a.hours;
    const bucket = TIME_BUCKETS.find((b) => weekly <= b.upTo);
    const pts = { ...zero(), ...bucket.pts };
    // Peu de soirs mais longs : un rythme de raid. Tous les jours mais court : le jeu moderne.
    if (a.days.length > 0 && a.days.length <= 2 && a.hours >= 3) for (const v of ["era", "anniversary", "mop"]) pts[v] += 1;
    if (a.days.length >= 5 && a.hours <= 1.5) pts.retail += 1;
    const text = bucket.because?.replace("{hours}", fmtHours(weekly));
    return { pts, reasons: text ? [{ text, pts: bucket.pts }] : [] };
  }
}

// Toutes les réponses possibles (ou représentatives) d'une question,
// pour connaître le score maximal que chaque version peut y gagner.
function candidates(q) {
  if (q.type === "choice") return q.options.map((_, i) => i);
  if (q.type === "slider") return q.stops.map((_, i) => i / (q.stops.length - 1));
  if (q.type === "multi") return q.items.map((it) => [it.id]);
  const out = [];
  for (let d = 0; d <= 7; d++) for (let h = 0.5; h <= 24; h += 0.5) out.push({ days: [...Array(d).keys()], hours: h });
  return out;
}

const maxCache = new Map();
function maxFor(q) {
  if (!maxCache.has(q)) {
    const max = zero();
    for (const c of candidates(q)) for (const [v, p] of Object.entries(evaluate(q, c).pts)) max[v] = Math.max(max[v], p);
    maxCache.set(q, max);
  }
  return maxCache.get(q);
}

// On classe au pourcentage du score maximal atteignable, sinon les versions
// citées dans plus de réponses gagneraient toujours. Ce maximum ne compte que
// les questions répondues : un « Not sure » ne doit avantager personne.
function computeRanking() {
  const scores = zero();
  const max = zero();
  answers.forEach((a, i) => {
    if (a === undefined || a === SKIP) return;
    const q = QUESTIONS[i];
    for (const [v, p] of Object.entries(evaluate(q, a).pts)) scores[v] += p;
    for (const [v, p] of Object.entries(maxFor(q))) max[v] += p;
  });
  return Object.keys(VERSIONS)
    .map((v) => ({ key: v, score: scores[v], match: max[v] ? Math.round((scores[v] / max[v]) * 100) : 0 }))
    .sort((a, b) => b.match - a.match || b.score - a.score);
}

// « None » a peu de points possibles : quelques réponses suffiraient à lui
// donner un fort pourcentage. Il lui faut donc aussi un vrai score brut,
// sinon c'est la suivante qui l'emporte.
const NONE_MIN_SCORE = 7;
function pickResult(ranking) {
  return ranking.find((r) => r.key !== "none" || r.score >= NONE_MIN_SCORE).key;
}

function reasonsFor(key) {
  return answers
    .flatMap((a, i) => (a === undefined || a === SKIP ? [] : evaluate(QUESTIONS[i], a).reasons))
    .filter((r) => (r.pts[key] || 0) >= 2)
    .sort((x, y) => y.pts[key] - x.pts[key])
    .slice(0, 4)
    .map((r) => r.text);
}

// ---------- Affichage ----------
// Tout est dessiné en « pixels du jeu » dans le cadre de quête d'origine
// (351 × 440), puis agrandi d'un bloc pour remplir l'écran.

const ICON = (name) => `assets/icons/${name}.jpg`;
const UI = (name) => `assets/ui/${name}`;
const BUILT = (name) => `assets/built/${name}`;

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) node.setAttribute(k, v === true ? "" : v);
  }
  node.append(...children.flat().filter((c) => c != null && c !== false));
  return node;
}

// Répliques de Chromie (data.js) : tirage au hasard, palier « à partir de n »
// (un palier peut contenir plusieurs textes : on tourne selon n), et aparté
// en italique sous le texte principal.
const pick = (list) => list[Math.floor(Math.random() * list.length)];
function tier(tiers, n) {
  const found = tiers.filter(([min]) => n >= min).pop();
  if (!found) return null;
  return Array.isArray(found[1]) ? found[1][n % found[1].length] : found[1];
}
const aside = (...text) => el("p", { class: "hint" }, el("em", {}, text.filter(Boolean).join(" ")));

// Sons d'interface du jeu (assets/sounds, CDN de Wowhead). Le navigateur les
// bloque tant qu'on n'a pas cliqué une première fois dans la page.
const SOUNDS = {
  open: "iQuestLogOpenA",
  close: "iQuestLogCloseA",
  accept: "iQuestActivate",
  complete: "iQuestComplete",
  levelUp: "LevelUp",
  click: "iUiInterfaceButtonA",
  check: "uChatScrollButton",
  chromie: "VO_725_Chromie_109_F",
};
// Dans le monde, window.SFX_GAIN suit le volume « Sound Effects » des Options.
function play(name, volume = 0.5) {
  const gain = window.SFX_GAIN ?? 1;
  if (gain <= 0) return;
  const audio = new Audio(`assets/sounds/${SOUNDS[name]}.mp3`);
  audio.volume = Math.min(1, volume * gain);
  audio.play().catch(() => {});
}
window.playUiSound = play;

const button = (label, onclick, disabled = false, sound = "click") =>
  el("button", { class: "wbtn", onclick: () => (play(sound), onclick()), disabled }, label);

// Squelette fixe : le cadre, sa barre de défilement, les trois emplacements
// de boutons du bas ; tout en bas de l'écran, la barre d'XP et ses griffons.
const $ = {};
function mount() {
  $.title = el("div", { class: "qf-title" });
  $.content = el("div", { class: "content" });
  $.scroll = el("div", { class: "scroll" }, $.content);
  $.thumb = el("div", { class: "sb-thumb" });
  $.up = el("button", { class: "sb-btn up", "aria-label": "Scroll up", onclick: () => (play("check"), $.scroll.scrollBy({ top: -60, behavior: "smooth" })) });
  $.down = el("button", { class: "sb-btn down", "aria-label": "Scroll down", onclick: () => (play("check"), $.scroll.scrollBy({ top: 60, behavior: "smooth" })) });
  $.slots = [0, 1, 2].map((k) => el("div", { class: `slot slot-${k}` }));
  $.xpFill = el("div", { class: "xp-fill" });
  $.xpLabel = el("span", { class: "xp-label" });
  $.stage = el(
    "div",
    { class: "stage" },
    el(
      "div",
      { class: "qf" },
      el("img", { class: "portrait", src: ICON("achievement_character_gnome_female"), alt: "Chromie", onclick: () => play("chromie", 0.7) }),
      el("div", { class: "art" }),
      $.title,
      el("button", { class: "close", "aria-label": "Close", title: CHROMIE.close, onclick: closeQuest }),
      $.scroll,
      el("div", { class: "sb" }, $.up, el("div", { class: "sb-track" }, $.thumb), $.down),
      $.slots,
    ),
  );
  $.bar = el(
    "div",
    { class: "mainbar" },
    el("div", { class: "xp" }, $.xpFill),
    el("div", { class: "bar-art" }),
    $.xpLabel,
    el("img", { class: "gryphon left", src: UI("UI-MainMenuBar-EndCap-Dwarf.PNG"), alt: "" }),
    el("img", { class: "gryphon right", src: UI("UI-MainMenuBar-EndCap-Dwarf.PNG"), alt: "" }),
  );
  app.replaceChildren($.stage, el("div", { class: "bottom" }, $.bar));
  $.scroll.addEventListener("scroll", syncScrollbar);
  new ResizeObserver(syncScrollbar).observe($.content);
  new ResizeObserver(fit).observe(document.documentElement);
}

// Agrandit le cadre autant que l'écran le permet, sans dépasser MAX_SCALE :
// au-delà, les textures (256 px au plus) deviennent floues. Le jeu en 1080p
// affiche son interface autour de 1.4 ; 1.25 reste net sur écran Retina.
// La barre du bas se répète par motifs de 104 px (deux bulles d'XP) ; les
// griffons n'apparaissent que s'il reste de la place pour eux.
const MAX_SCALE = 1.25;
const BAR_TILE = 104;
function fit() {
  const vw = document.documentElement.clientWidth;
  const vh = innerHeight;
  const s = Math.floor(Math.min(MAX_SCALE, (vw - 16) / 351, (vh - 24) / (440 + 96)) * 100) / 100;
  // Dans le monde, la barre laisse la place à droite aux micro-boutons et au
  // sac (quatre boutons de 28, le sac de 37), à l'échelle de l'interface du
  // monde (même calcul que --hud dans world/main.js).
  const hudScale = Math.min(1.25, vw / 820, vh / 620);
  // La même réserve des deux côtés : la barre et ses griffons restent centrés.
  const reserve = WORLD ? (4 * 28 + 37) * hudScale + 8 : 0;
  $.bar.parentNode.style.left = `${reserve}px`;
  $.bar.parentNode.style.right = `${reserve}px`;
  const room = (vw - 2 * reserve) / s;
  const gryphons = room >= 12 + BAR_TILE * 4 + 2 * 96;
  const tiles = Math.max(2, Math.min(10, Math.floor((room - 12 - (gryphons ? 2 * 96 : 8)) / BAR_TILE)));
  $.bar.classList.toggle("with-gryphons", gryphons);
  $.bar.style.width = `${12 + tiles * BAR_TILE}px`;
  document.documentElement.style.setProperty("--s", s);
  // le cadre se centre dans l'espace laissé au-dessus de la barre
  app.style.paddingBottom = `${(gryphons ? 84 : 55) * s}px`;
}

// Comme dans le jeu : boutons grisés en butée, curseur masqué sans débordement.
// Course du curseur dans la colonne : sa partie visible (17 px de haut)
// va du bord du bouton du haut (y 92) à celui du bouton du bas (y 390).
const THUMB_MIN = 92 - 66 - 7;
const THUMB_MAX = 390 - 66 - 7 - 17;
function syncScrollbar() {
  const { scrollTop, scrollHeight, clientHeight } = $.scroll;
  const overflow = scrollHeight - clientHeight;
  $.thumb.style.display = overflow > 2 ? "" : "none";
  $.up.disabled = overflow <= 2 || scrollTop <= 1;
  $.down.disabled = overflow <= 2 || scrollTop >= overflow - 1;
  if (overflow > 2) $.thumb.style.top = `${Math.round(THUMB_MIN + (Math.min(scrollTop, overflow) / overflow) * (THUMB_MAX - THUMB_MIN))}px`;
}

// Croix du cadre : on repart de zéro, sur l'écran d'accueil.
function closeQuest() {
  if (WORLD) return window.QuizUI.close();
  play("close");
  history.replaceState(null, "", location.pathname);
  renderGossip(pick(CHROMIE.abandoned));
}

// Texte de quête révélé comme en jeu : les lettres apparaissent une à une en
// fondu, paragraphe après paragraphe ; les options (réponses, choix, objets)
// apparaissent ensuite toutes d'un coup, une fois le texte écrit. Un clic
// affiche tout d'un coup. Se coupe dans les Options du monde
// (window.QUEST_TEXT_ANIMATION = false).
const TYPE_MS = 14; // délai entre deux lettres
// le quiz seul (sans le monde) lit le même réglage, gardé dans le navigateur
try {
  if (JSON.parse(localStorage.getItem("which-wow-settings") || "{}").questText === false) window.QUEST_TEXT_ANIMATION = false;
} catch {
  // réglages illisibles : animation par défaut
}
function typewrite(container) {
  if (window.QUEST_TEXT_ANIMATION === false) return;
  let n = 0;
  const wrap = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) {
        const frag = document.createDocumentFragment();
        for (const ch of child.textContent) {
          const s = document.createElement("span");
          s.className = "tw";
          s.textContent = ch;
          s.style.transitionDelay = `${n++ * TYPE_MS}ms`;
          frag.append(s);
        }
        child.replaceWith(frag);
      } else if (child.nodeType === Node.ELEMENT_NODE) wrap(child);
    }
  };
  // Comme la fenêtre de quête du jeu : seul le texte avant la première
  // rubrique (h3 : Quest Objectives, Rewards…) s'écrit ; le titre de la
  // quête (h2) est là d'emblée. Les rubriques, leur contenu, les options,
  // objets et barres apparaissent ensemble une fois ce texte écrit.
  const later = [];
  let section = false;
  for (const block of container.children) {
    if (block.matches("h3")) section = true;
    if (block.matches("h2")) continue;
    if (!section && block.matches("p")) wrap(block);
    else if (!section && block.matches("ul")) for (const li of block.children) wrap(li);
    else later.push(block);
  }
  const after = `${n * TYPE_MS + 250}ms`;
  for (const block of later) {
    block.classList.add("tw-later");
    block.style.setProperty("--tw-after", after);
  }
  container.classList.remove("typed", "typed-now");
  requestAnimationFrame(() => requestAnimationFrame(() => container.classList.add("typed")));
  // un clic affiche tout d'un coup ; pas celui qui vient d'ouvrir cet écran
  // (le clic sur une option remonte jusqu'ici après le changement d'écran)
  const born = performance.now();
  container.onclick = (e) => e.timeStamp > born && container.classList.add("typed-now");
}

let screenId = 0; // change à chaque écran : une minuterie sait si le sien est encore affiché
function screen({ title = "Chromie", body, buttons = [], xp, typed = false }) {
  onKey = null;
  screenId++;
  $.title.textContent = title;
  $.content.replaceChildren(...body.flat().filter(Boolean));
  $.content.classList.remove("typed", "typed-now");
  $.content.onclick = null;
  if (typed) typewrite($.content);
  $.slots.forEach((slot, k) => slot.replaceChildren(...(buttons[k] ? [buttons[k]] : [])));
  $.xpFill.style.width = `${xp ? (xp.done / xp.total) * 100 : 0}%`;
  $.xpLabel.textContent = xp ? xp.label || `${xp.done} / ${xp.total} questions answered` : "";
  $.scroll.scrollTop = 0;
  syncScrollbar();
}

// Objet de récompense de quête : icône, cadre du nom, surbrillance si choisi.
function item({ icon, name, quality = "common", onclick, pressed }) {
  const attrs = { class: `item q-${quality}` };
  if (onclick) Object.assign(attrs, { onclick, "aria-pressed": String(!!pressed) });
  return el(
    onclick ? "button" : "div",
    attrs,
    el("span", { class: "item-slot" }, el("img", { class: "item-icon", src: ICON(icon), alt: "" })),
    el("span", { class: "item-name" }, name),
  );
}

// Récompense d'une quête, avec son info-bulle au survol (celle du sac, world/inventory.js).
function rewardItem(q) {
  const node = item(q.reward);
  const show = () => window.Inventory?.showRewardTip(node, q);
  const hide = () => window.Inventory?.hideTip();
  node.addEventListener("pointerenter", show);
  node.addEventListener("pointerleave", hide);
  node.addEventListener("click", show);
  return node;
}
// l'info-bulle ne survit pas à l'écran qui l'a montrée
addEventListener("pointerdown", (e) => !e.target.closest?.(".item") && window.Inventory?.hideTip());
addEventListener("scroll", () => window.Inventory?.hideTip(), true);

// ---------- Progression : chaîne de quêtes, sauvegardée dans le navigateur ----------

const SAVE_KEY = "which-wow-progress";
// À monter quand QUESTIONS change d'ordre ou de contenu : une ancienne
// sauvegarde ne correspondrait plus aux questions, on repart de zéro.
const SAVE_VERSION = 2;
let done = new Set(); // quêtes rendues
let accepted = new Set(); // quêtes acceptées, pas encore rendues
let verdictKey = null; // version désignée par Chromie (gardée : pickResult pourra tirer au sort)
let declines = 0;

function save() {
  localStorage.setItem(
    SAVE_KEY,
    JSON.stringify({ v: SAVE_VERSION, answers: answers.map((a) => (a === undefined ? null : a)), done: [...done], accepted: [...accepted], verdictKey }),
  );
  emitState();
}

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
    if (!s || s.v !== SAVE_VERSION) return;
    answers = (s.answers || []).map((a) => (a === null ? undefined : a));
    done = new Set(s.done || []);
    accepted = new Set(s.accepted || []);
    verdictKey = VERSIONS[s.verdictKey] ? s.verdictKey : null;
  } catch {
    // sauvegarde illisible : on repart de zéro
  }
}

const quest = (id) => QUESTS.find((q) => q.id === id);
function questStatus(q) {
  if (done.has(q.id)) return "done";
  if (accepted.has(q.id)) return "active";
  return q.requires.every((r) => done.has(r)) ? "available" : "locked";
}
const answeredCount = () => QUESTIONS.filter((_, i) => answers[i] !== undefined).length;

// Au-dessus de Chromie : « ! » s'il y a une quête à prendre, « ? » gris si une
// quête est en cours, rien quand tout est rendu.
function markerState() {
  if (QUESTS.some((q) => questStatus(q) === "available")) return "available";
  if (QUESTS.some((q) => questStatus(q) === "active")) return "active";
  return "done";
}
function emitState() {
  dispatchEvent(new CustomEvent("quest:state", { detail: { marker: markerState(), level: 1 + done.size } }));
}

// Oublier une quête (et ses réponses) pour pouvoir la refaire.
function abandon(id) {
  const q = quest(id);
  for (const i of q.questions) answers[i] = undefined;
  done.delete(id);
  accepted.delete(id);
  // le verdict dépend de tout le reste : il se refait aussi
  if (id !== "verdict" && done.has("verdict")) {
    done.delete("verdict");
    verdictKey = null;
  }
  save();
}

// Résumé du profil (quête A Hero's Measure), pour Chromie et le journal.
const fmtHours = (h) => (h % 1 ? `${Math.floor(h)}h30` : `${h}h`);
function profileLines() {
  const s = answers[0];
  const lines = [];
  if (s && s !== SKIP) lines.push(`Playtime: ${fmtHours(s.days.length * s.hours)} a week (${s.days.length} day${s.days.length === 1 ? "" : "s"} × ${fmtHours(s.hours)})`);
  const exp = answers[1];
  if (exp !== undefined) lines.push(`MMO experience: ${exp === SKIP ? "not sure" : QUESTIONS[1].options[exp].text}`);
  const friends = answers[2];
  if (friends !== undefined) lines.push(`Friends: ${friends === SKIP ? "not sure" : QUESTIONS[2].options[friends].text}`);
  return lines;
}

// ---------- Écrans ----------

// Icônes des quêtes dans le dialogue, comme en jeu.
const QUEST_ICON = { available: "AvailableQuestIcon.PNG", active: "IncompleteQuestIcon.PNG" };

function gossipOption(icon, label, onclick) {
  return el("button", { class: "gossip-opt", onclick: () => (play("click"), onclick()) }, el("img", { src: UI(icon), alt: "" }), el("span", {}, label));
}

// Le dialogue de Chromie : sa réplique, puis ses quêtes et quelques options.
function renderGossip(lead) {
  const hours = answers[0] && answers[0] !== SKIP ? fmtHours(answers[0].days.length * answers[0].hours) : "a few hours";
  const greeting =
    lead ||
    (done.has("verdict") ? CHROMIE_GOSSIP.done : done.has("profile") ? CHROMIE_GOSSIP.returning.replace("{hours}", hours) : CHROMIE_GOSSIP.first);
  const options = [];
  for (const q of QUESTS) {
    const st = questStatus(q);
    if (st === "available") options.push(gossipOption(QUEST_ICON.available, q.title, () => renderQuestDetail(q)));
    if (st === "active") options.push(gossipOption(QUEST_ICON.active, q.title, () => resumeQuest(q)));
  }
  if (done.has("verdict")) {
    options.push(gossipOption("GossipGossipIcon.PNG", CHROMIE_GOSSIP.showVerdict, () => renderResult(verdictKey, true, { replay: true })));
    options.push(
      gossipOption("GossipGossipIcon.PNG", CHROMIE_GOSSIP.retake, () => {
        for (const id of ["taste", "company", "worlds", "verdict"]) abandon(id);
        renderGossip(CHROMIE_GOSSIP.busy);
      }),
    );
  }
  if (done.has("profile"))
    options.push(
      gossipOption("GossipGossipIcon.PNG", CHROMIE_GOSSIP.redoProfile, () => {
        abandon("profile");
        renderQuestDetail(quest("profile"));
      }),
    );
  screen({
    body: [el("p", {}, greeting), el("div", { class: "gossip" }, options)],
    buttons: [null, null, button("Goodbye", closeQuest)],
    xp: progressBar(),
    typed: true,
  });
}

// Barre d'XP : questions répondues sur l'ensemble de la chaîne.
function progressBar(label) {
  return { done: answeredCount(), total: QUESTIONS.length, label };
}

// Fiche de quête : texte, objectifs, récompenses, Accept / Decline.
function renderQuestDetail(q) {
  play("open");
  const rewards = [el("h3", {}, "Rewards")];
  if (q.reward) rewards.push(el("p", {}, "You will receive:"), rewardItem(q));
  rewards.push(el("p", { class: "xp-line" }, `Experience: ${q.xp}`));
  screen({
    body: [el("h2", {}, q.title), el("p", {}, q.text), el("h3", {}, "Quest Objectives"), el("p", {}, q.objective), ...rewards],
    buttons: [
      button(
        "Accept",
        () => {
          accepted.add(q.id);
          save();
          dispatchEvent(new CustomEvent("quest:accept", { detail: { id: q.id, title: q.title } }));
          if (q.final) finishVerdict(q);
          else renderQuestion(q, 0);
        },
        false,
        "accept",
      ),
      null,
      button(tier(CHROMIE.declineButton, declines), () => {
        declines++;
        window.Achievements?.progress("declines");
        renderGossip(tier(CHROMIE.declines, declines - 1));
      }),
    ],
    xp: progressBar(),
    typed: true,
  });
}

// Reprendre une quête en cours à sa première question sans réponse.
function resumeQuest(q) {
  const k = q.questions.findIndex((i) => answers[i] === undefined);
  if (k < 0) renderQuestComplete(q);
  else renderQuestion(q, k);
}

// Aparté de Chromie sur la réponse qu'on vient de donner, affiché à l'écran
// suivant : une contradiction avec une réponse précédente, sinon la réaction
// prévue pour cette réponse (data.js).
let reaction = null;
function takeReaction() {
  const r = reaction;
  reaction = null;
  return r && aside(r);
}
function reactTo(i, a) {
  const s = answers[0];
  const weekly = s && s !== SKIP ? s.days.length * s.hours : Infinity;
  const known = (n) => answers[n] !== undefined && answers[n] !== SKIP;
  const clash = CONTRADICTIONS.find((c) => c.about.includes(i) && c.about.every(known) && c.when((n) => answers[n], weekly));
  const q = QUESTIONS[i];
  reaction = clash?.line || (q.type === "choice" && typeof a === "number" ? q.options[a].react : null) || null;
}

function renderQuestion(q, k) {
  const i = q.questions[k];
  const qq = QUESTIONS[i];
  const next = (a) => {
    answers[i] = a;
    save();
    reactTo(i, a);
    if (a === SKIP) window.Achievements?.progress("indecisive");
    if (qq.type === "schedule" && a.hours >= 24) window.Achievements?.unlock("insomniac");
    if (k + 1 < q.questions.length) renderQuestion(q, k + 1);
    else renderQuestComplete(q);
  };
  const { content, value, ready } = WIDGETS[qq.type](qq, answers[i], next);
  // « I'm not sure » : toujours la dernière réplique de la liste, avec le
  // « ? » gris des quêtes en cours pour la distinguer des autres
  if (qq.skippable !== false) {
    const unsure = el(
      "button",
      { class: `gossip-opt unsure${answers[i] === SKIP ? " selected" : ""}`, onclick: () => (play("click"), next(SKIP)) },
      el("img", { src: UI("IncompleteQuestIcon.PNG"), alt: "" }),
      el("span", {}, "I'm not sure"),
    );
    const list = content.matches(".gossip") ? content : content.lastElementChild?.matches(".gossip") ? content.lastElementChild : null;
    if (list) list.append(unsure);
    else content.append(el("div", { class: "gossip" }, unsure));
  }
  // déjà passée (retour arrière) : Continue garde « I'm not sure »
  const keep = value || (answers[i] === SKIP ? () => SKIP : null);
  const cont = button("Continue", () => keep && next(keep()), !keep);
  // Chromie remarque les « Not sure » déjà donnés (sauf celui de cette question)
  const skipped = answers.filter((a, n) => a === SKIP && n !== i).length;
  const said = takeReaction();

  screen({
    body: [said, el("p", { class: "ask" }, qq.q), qq.hint && el("p", { class: "hint" }, qq.hint), !said && skipped > 0 && aside(tier(CHROMIE.skips, skipped)), content],
    // comme la fenêtre de quête du jeu : ce qui fait avancer à gauche (Accept,
    // Continue, Complete Quest), ce qui recule ou annule à droite
    buttons: [
      cont,
      null,
      button("Back", () => (k > 0 ? renderQuestion(q, k - 1) : renderQuestDetail(q))),
    ],
    // pas d'effet machine à écrire : une question se lit vite, on y revient
    xp: progressBar(`${q.title} · ${k + 1} / ${q.questions.length}`),
  });
  ready?.(cont);
}

// Toutes les questions répondues : texte de fin, récompense, « Complete Quest ».
function renderQuestComplete(q) {
  const rewards = [el("h3", {}, "Rewards")];
  if (q.reward) rewards.push(el("p", {}, "You will receive:"), rewardItem(q));
  rewards.push(el("p", { class: "xp-line" }, `Experience: ${q.xp}`));
  screen({
    title: "Chromie",
    body: [takeReaction(), el("h2", {}, q.title), el("p", {}, q.complete), ...rewards],
    buttons: [
      button(
        "Complete Quest",
        () => {
          finishQuest(q);
          // on enchaîne sur la quête suivante, sans repasser par le dialogue
          const following = QUESTS.find((x) => questStatus(x) === "available");
          if (following) renderQuestDetail(following);
          else renderGossip();
        },
        false,
        "complete",
      ),
      null,
      null,
    ],
    xp: progressBar(),
    typed: true,
  });
}

function finishQuest(q) {
  accepted.delete(q.id);
  done.add(q.id);
  save();
  dispatchEvent(new CustomEvent("quest:done", { detail: { id: q.id, title: q.title, xp: q.xp, level: 1 + done.size } }));
  window.Achievements?.unlock(`quest-${q.id}`);
}

// Le verdict : on calcule la version, on rend la quête, on affiche le résultat.
function finishVerdict(q) {
  verdictKey = pickResult(computeRanking());
  finishQuest(q);
  window.Achievements?.unlock("verdict");
  if (QUESTS.every((x) => done.has(x.id))) window.Achievements?.unlock("timewalker");
  if (verdictKey === "none") window.Achievements?.unlock("touch-grass");
  drumroll(() => renderResult(verdictKey, true));
}

// Avant le verdict : Chromie cherche, une ligne après l'autre. Un clic
// passe directement au résultat.
const DRUM_MS = 800;
function drumroll(then) {
  const lines = CHROMIE.drumroll.map((t) => el("p", { class: "drum" }, t));
  let finished = false;
  const finish = () => {
    if (finished || id !== screenId) return;
    finished = true;
    then();
  };
  screen({ body: [el("h2", {}, "The Timeways Beckon"), lines], buttons: [button("Skip", finish), null, null], xp: progressBar() });
  const id = screenId;
  $.content.onclick = finish;
  lines.forEach((p, k) => setTimeout(() => p.classList.add("shown"), k * DRUM_MS));
  setTimeout(finish, lines.length * DRUM_MS + 500);
}

// Chaque type de question fournit son contenu et, s'il n'avance pas tout
// seul au clic, une fonction `value` lue par le bouton Continue.
const WIDGETS = {
  choice(q, prev, next) {
    const content = el(
      "div",
      { class: "gossip" },
      q.options.map((o, idx) =>
        el(
          "button",
          { class: `gossip-opt${prev === idx ? " selected" : ""}`, onclick: () => (play("click"), next(idx)) },
          el("img", { src: UI("GossipGossipIcon.PNG"), alt: "" }),
          el("span", {}, o.text),
        ),
      ),
    );
    // déjà répondu (retour arrière) : Continue garde la même réponse
    return { content, value: typeof prev === "number" ? () => prev : null };
  },

  // Échelle entre deux pôles : cinq crans cliquables (0, 25, 50, 75, 100 %),
  // chacun avec la réplique de Chromie la plus proche, sans étiquette de pôle
  // (les réponses se suffisent). La valeur reste la position.
  slider(q, prev, next) {
    const lines = q.quips || q.stops.map((s) => s.label);
    const steps = [0, 0.25, 0.5, 0.75, 1];
    const chosen = typeof prev === "number" ? steps.reduce((best, s) => (Math.abs(s - prev) < Math.abs(best - prev) ? s : best)) : null;
    const content = el(
      "div",
      { class: "scale" },
      el(
        "div",
        { class: "gossip" },
        steps.map((s) =>
          el(
            "button",
            { class: `gossip-opt${chosen === s ? " selected" : ""}`, onclick: () => (play("click"), next(s)) },
            el("img", { src: UI("GossipGossipIcon.PNG"), alt: "" }),
            el("span", {}, lines[Math.round(s * (lines.length - 1))]),
          ),
        ),
      ),
    );
    // déjà répondu (retour arrière) : Continue garde la même réponse
    return { content, value: chosen === null ? null : () => chosen };
  },

  multi(q, prev) {
    const picked = Array.isArray(prev) ? [...prev] : [];
    const counter = el("p", { class: "counter" });
    const grid = el("div", { class: "item-grid" });
    let cont = null;
    const draw = () => {
      grid.replaceChildren(
        ...q.items.map((it) =>
          item({
            icon: it.icon,
            name: it.label,
            pressed: picked.includes(it.id),
            onclick: () => {
              play("check");
              const at = picked.indexOf(it.id);
              if (at >= 0) picked.splice(at, 1);
              else {
                if (picked.length >= q.max) picked.shift();
                picked.push(it.id);
              }
              draw();
            },
          }),
        ),
      );
      // la réaction suit l'ordre des icônes, pas celui des clics
      const combo = q.items.filter((it) => picked.includes(it.id)).map((it) => it.id).join("+");
      const quip = q.quips?.[combo];
      counter.replaceChildren(`Chosen: ${picked.length} / ${q.max}`, ...(quip ? [el("br"), el("em", {}, quip)] : []));
      if (cont) cont.disabled = picked.length === 0;
    };
    draw();
    return {
      content: el("div", {}, grid, counter),
      value: () => [...picked],
      ready: (b) => {
        cont = b;
        draw();
      },
    };
  },

  schedule(q, prev) {
    const state = prev && prev !== SKIP ? { days: [...prev.days], hours: prev.hours } : { days: [], hours: 2 };
    const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

    const toggle = (d) => {
      const at = state.days.indexOf(d);
      if (at >= 0) state.days.splice(at, 1);
      else state.days.push(d);
      refresh();
    };
    const slots = DAYS.map((name, d) =>
      el(
        "button",
        { class: "abtn", onclick: () => (play("check"), toggle(d)), "aria-label": name },
        el("img", { class: "abtn-icon", src: ICON("spell_holy_borrowedtime"), alt: "" }),
        el("span", { class: "hotkey" }, String(d + 1)),
        el("span", { class: "macro" }, name),
      ),
    );

    // Cadran : un tour complet = 24 heures, par pas d'une demi-heure.
    // L'angle (--deg) est animé en CSS ; le curseur tourne avec l'aiguille.
    const knob = el("div", { class: "dial-hand" }, el("img", { class: "dial-knob", src: UI("UI-SliderBar-Button-Horizontal.PNG"), alt: "" }));
    const readout = el("span", { class: "dial-value" });
    const dial = el(
      "div",
      { class: "dial", tabindex: 0, role: "slider", "aria-label": "Hours per session", "aria-valuemin": 0.5, "aria-valuemax": 24 },
      el("div", { class: "dial-face" }),
      el("img", { class: "dial-icon", src: ICON("inv_misc_pocketwatch_01"), alt: "" }),
      el("div", { class: "dial-sweep" }),
      el("div", { class: "dial-ticks" }),
      el("img", { class: "dial-ring", src: BUILT("dialring.png"), alt: "" }),
      readout,
      knob,
    );
    const setFromPointer = (e) => {
      const r = dial.getBoundingClientRect();
      const angle = (Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2))) * 180) / Math.PI;
      let hours = Math.round(((angle + 360) % 360) / 7.5) / 2 || 24;
      // butée à minuit : on ne repasse pas de 24 h à 0 h en glissant
      if (state.hours > 18 && hours < 6) hours = 24;
      if (state.hours < 6 && hours > 18) hours = 0.5;
      setHours(hours);
    };
    dial.addEventListener("pointerdown", (e) => {
      dial.setPointerCapture(e.pointerId);
      dial.classList.add("dragging");
      setFromPointer(e);
    });
    const release = () => dial.classList.remove("dragging");
    dial.addEventListener("pointerup", release);
    dial.addEventListener("pointercancel", release);
    dial.addEventListener("pointermove", (e) => {
      if (dial.hasPointerCapture(e.pointerId)) setFromPointer(e);
    });
    dial.addEventListener("keydown", (e) => {
      const step = { ArrowUp: 0.5, ArrowRight: 0.5, ArrowDown: -0.5, ArrowLeft: -0.5 }[e.key];
      if (!step) return;
      e.preventDefault();
      setHours(state.hours + step);
    });

    const setHours = (h) => {
      h = Math.min(24, Math.max(0.5, h));
      if (h === state.hours) return;
      state.hours = h;
      refresh();
    };

    const summary = el("p", { class: "schedule-summary" });
    const fmt = (h) => (h % 1 ? `${Math.floor(h)}h30` : `${h}h`);
    // verdict : première règle de SCHEDULE_QUIPS qui s'applique (data.js)
    const verdict = () => {
      const days = state.days;
      const only = (...want) => days.length === want.length && want.every((d) => days.includes(d));
      const ctx = { n: days.length, h: state.hours, w: days.length * state.hours, only };
      return SCHEDULE_QUIPS.find(([when]) => when(ctx))[1];
    };

    let cont = null;
    const refresh = () => {
      slots.forEach((s, d) => s.classList.toggle("checked", state.days.includes(d)));
      if (cont) cont.disabled = state.days.length === 0;
      dial.style.setProperty("--deg", `${state.hours * 15}deg`);
      // heures calées à droite, minutes à gauche : le « h » ne bouge jamais
      readout.replaceChildren(el("span", { class: "hh" }, String(Math.floor(state.hours))), "h", el("span", { class: "mm" }, state.hours % 1 ? "30" : ""));
      dial.setAttribute("aria-valuenow", state.hours);
      const weekly = state.days.length * state.hours;
      summary.replaceChildren(
        `${state.days.length} day${state.days.length === 1 ? "" : "s"} × ${fmt(state.hours)} = `,
        el("b", {}, `${fmt(weekly)} per week`),
        el("br"),
        verdict(),
      );
    };
    refresh();
    // à l'ouverture, l'aiguille part de minuit et balaie jusqu'à la valeur
    const target = dial.style.getPropertyValue("--deg");
    dial.style.setProperty("--deg", "0deg");
    requestAnimationFrame(() => requestAnimationFrame(() => dial.style.setProperty("--deg", target)));

    const content = el("div", { class: "schedule" }, el("div", { class: "actionbar" }, slots), dial, summary);
    return {
      content,
      value: () => ({ days: [...state.days], hours: state.hours }),
      ready: (b) => {
        cont = b;
        refresh();
        onKey = (e) => {
          const d = Number(e.key) - 1;
          if (d >= 0 && d < 7) toggle(d);
        };
      },
    };
  },
};

// Réputation : le pourcentage d'affinité traduit en rang, avec les couleurs du jeu.
const STANDINGS = [
  [15, "Hated", "#cc3333"],
  [30, "Hostile", "#cc3333"],
  [45, "Unfriendly", "#bf4500"],
  [58, "Neutral", "#e6b300"],
  [70, "Friendly", "#009919"],
  [82, "Honored", "#009919"],
  [92, "Revered", "#009919"],
  [101, "Exalted", "#009919"],
];
const standing = (m) => STANDINGS.find(([max]) => m < max);

function tooltip(key) {
  const v = VERSIONS[key];
  return el(
    "div",
    { class: "tooltip" },
    el("div", { class: "t-name" }, v.name),
    el("div", {}, "Binds to account"),
    el("div", { class: "t-row" }, el("span", {}, "Game version"), el("span", {}, v.kind)),
    v.pros.map((p) => el("div", { class: "t-green" }, `Equip: ${p}.`)),
    v.cons.map((c) => el("div", { class: "t-red" }, `${c}.`)),
    el("div", { class: "t-flavor" }, `"${v.tagline}"`),
    el("div", {}, key === "none" ? "Sell Price: priceless" : "Sell Price: 1 subscription"),
  );
}

// Info-bulle d'objet : au survol (ou au toucher), accrochée à droite de
// l'objet comme en jeu, à gauche s'il n'y a pas la place.
function hoverTooltip(target, makeTip) {
  let tip = null;
  const show = () => {
    if (tip) return;
    tip = makeTip();
    tip.classList.add("floating");
    $.stage.append(tip);
    const s = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--s")) || 1;
    const st = $.stage.getBoundingClientRect();
    const r = target.getBoundingClientRect();
    let left = (r.right - st.left) / s + 4;
    if (st.left + (left + tip.offsetWidth) * s > document.documentElement.clientWidth) left = (r.left - st.left) / s - tip.offsetWidth - 4;
    tip.style.left = `${left}px`;
    tip.style.top = `${(r.top - st.top) / s}px`;
  };
  const hide = () => {
    tip?.remove();
    tip = null;
  };
  target.addEventListener("pointerenter", show);
  target.addEventListener("pointerleave", hide);
  target.addEventListener("click", () => (tip ? hide() : show()));
  $.scroll.addEventListener("scroll", hide);
  return target;
}

// Réponses ⇄ courte chaîne pour l'adresse (?a=…) : un octet par question,
// deux pour l'horaire, 255 = « Not sure ». Base64 sans caractères spéciaux.
const NONE = 255;
function encodeAnswers() {
  const bytes = [];
  QUESTIONS.forEach((q, i) => {
    const a = answers[i];
    if (q.type === "schedule") return bytes.push(a.days.reduce((m, d) => m | (1 << d), 0), a.hours * 2);
    if (a === undefined || a === SKIP) return bytes.push(NONE);
    if (q.type === "choice") return bytes.push(a);
    if (q.type === "slider") return bytes.push(Math.round(a * 250));
    bytes.push(q.items.reduce((m, it, k) => (a.includes(it.id) ? m | (1 << k) : m), 0));
  });
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeAnswers(code) {
  try {
    const bytes = [...atob(code.replace(/-/g, "+").replace(/_/g, "/"))].map((c) => c.charCodeAt(0));
    const out = [];
    let k = 0;
    for (const q of QUESTIONS) {
      const b = bytes[k++];
      if (b === undefined) return null;
      if (q.type === "schedule") {
        const h = bytes[k++];
        if (!(h >= 1 && h <= 48)) return null;
        out.push({ days: [0, 1, 2, 3, 4, 5, 6].filter((d) => b & (1 << d)), hours: h / 2 });
      } else if (b === NONE) out.push(SKIP);
      else if (q.type === "choice") {
        if (b >= q.options.length) return null;
        out.push(b);
      } else if (q.type === "slider") out.push(Math.min(b, 250) / 250);
      else out.push(q.items.filter((_, j) => b & (1 << j)).map((it) => it.id));
    }
    return k === bytes.length ? out : null;
  } catch {
    return null;
  }
}

// Verdict de Chromie sur la victoire : écart en points de pourcentage entre
// la version affichée et la meilleure des autres. Écart négatif : pickResult
// a remplacé le vrai gagnant.
function marginQuip(key) {
  const ranking = computeRanking();
  const winner = ranking.find((r) => r.key === key);
  const runner = ranking.find((r) => r.key !== key);
  const gap = winner.match - runner.match;
  if (gap < 0) return CHROMIE.overruled;
  if (winner.match < 40) return CHROMIE.lukewarm;
  if (winner.match >= 92 && gap >= 16) return CHROMIE.soulmate;
  return tier(CHROMIE.margins, gap).replace("{runner}", VERSIONS[runner.key].name);
}

// Nombre de « Not sure » : tout ce qui pouvait être passé l'a été ?
function skipQuip() {
  const skipped = answers.filter((a) => a === SKIP).length;
  const all = skipped === QUESTIONS.filter((q) => q.skippable !== false).length;
  return all ? CHROMIE.skipsAll : tier(CHROMIE.skipsResult, skipped);
}

// mine : résultat de celui qui vient de répondre ; sinon, lien d'un ami.
// Avec les réponses (full), on affiche aussi les raisons et la réputation.
// mine : son propre verdict (replay : on le relit, sans refaire la fanfare) ;
// sinon, le lien d'un ami.
function renderResult(key, mine, { replay = false } = {}) {
  const v = VERSIONS[key];
  const full = QUESTIONS.every((_, i) => answers[i] !== undefined);
  const code = full ? encodeAnswers() : null;
  history.replaceState(null, "", `?r=${key}${code ? `&a=${code}` : ""}`);
  if (mine && !replay) {
    play("complete");
    setTimeout(() => play("levelUp", 0.4), 1400);
    dispatchEvent(new CustomEvent("quest:complete", { detail: { key, name: v.name } }));
  }

  let copies = 0;
  const share = button("Copy link", async () => {
    await navigator.clipboard.writeText(location.href);
    share.textContent = CHROMIE.copied[Math.min(copies++, CHROMIE.copied.length - 1)];
    window.Achievements?.unlock("social");
  });
  // retour au dialogue de Chromie (pour un lien d'ami : avec sa propre progression)
  const restart = button(mine ? "Back" : "Take quiz", () => {
    history.replaceState(null, "", location.pathname);
    renderGossip();
  });

  const body = [el("h2", {}, mine ? "The Timeways Beckon" : "A Friend's Timeline"), v.quips && aside(pick(v.quips)), el("p", {}, v.description)];

  if (full) {
    body.push(aside(marginQuip(key), skipQuip()));
    const reasons = reasonsFor(key);
    if (reasons.length) body.push(el("h3", {}, "Why this timeline"), el("ul", { class: "bullets" }, reasons.map((r) => el("li", {}, r))));
  }

  body.push(el("h3", {}, "Rewards"), el("p", {}, "You will receive:"), hoverTooltip(item({ icon: v.icon, name: v.name, quality: "legendary" }), () => tooltip(key)));

  if (full) {
    body.push(
      el("h3", {}, "Reputation"),
      el(
        "div",
        { class: "rep-list" },
        computeRanking().map((r) => {
          const [, label, color] = standing(r.match);
          return el(
            "div",
            { class: "rep-row", title: `${r.match}% · ${CHROMIE.standings[label]}` },
            el("span", { class: "rep-name" }, VERSIONS[r.key].name),
            el("div", { class: "rep-bar" }, el("div", { class: "rep-fill", style: `--p:${Math.max(r.match, 2)};background-color:${color}` }), el("span", {}, label)),
          );
        }),
      ),
    );
  }

  screen({
    title: mine ? "Quest Complete" : "Chromie",
    body,
    buttons: [restart, null, share],
    xp: mine ? progressBar() : null,
    typed: true,
  });
}

// ---------- Journal de quêtes (touche L dans le monde) ----------
// Le journal double de Wrath/MoP Classic (UI-QuestLogDualPane) : la liste à
// gauche, rangée sous l'en-tête de zone repliable, la quête choisie sur le
// parchemin de droite. Couleurs du jeu : en-tête gris, titre coloré selon
// l'écart de niveau (GetQuestDifficultyColor), blanc quand il est choisi.
const MAX_QUESTS = 25;
const QUEST_ZONE = "The Timeways";
function difficultyColor(questLevel, playerLevel) {
  const d = questLevel - playerLevel;
  if (d >= 5) return "#ff1a1a";
  if (d >= 3) return "#ff8040";
  if (d >= -2) return "#ffff00";
  if (d >= -5) return "#40bf40";
  return "#808080";
}

// Barre de défilement du jeu pour une zone qui défile (même rendu que celle du cadre de quête).
function scrollbar(scroll, content, cls) {
  const thumb = el("div", { class: "sb-thumb" });
  const up = el("button", { class: "sb-btn up", "aria-label": "Scroll up", onclick: () => (play("check"), scroll.scrollBy({ top: -48, behavior: "smooth" })) });
  const down = el("button", { class: "sb-btn down", "aria-label": "Scroll down", onclick: () => (play("check"), scroll.scrollBy({ top: 48, behavior: "smooth" })) });
  const sync = () => {
    const { scrollTop, scrollHeight, clientHeight } = scroll;
    const overflow = scrollHeight - clientHeight;
    thumb.style.display = overflow > 2 ? "" : "none";
    up.disabled = overflow <= 2 || scrollTop <= 1;
    down.disabled = overflow <= 2 || scrollTop >= overflow - 1;
    if (overflow > 2) thumb.style.top = `${Math.round(THUMB_MIN + (Math.min(scrollTop, overflow) / overflow) * (THUMB_MAX - THUMB_MIN))}px`;
  };
  scroll.addEventListener("scroll", sync);
  new ResizeObserver(sync).observe(content);
  return el("div", { class: `sb ${cls}` }, up, el("div", { class: "sb-track" }, thumb), down);
}

const questLog = (() => {
  const list = el("div", { class: "log-list" });
  const listScroll = el("div", { class: "scroll log-list-scroll" }, list);
  const detail = el("div", { class: "content log-detail" });
  const detailScroll = el("div", { class: "scroll log-detail-scroll" }, detail);
  const count = el("div", { class: "log-count" });
  const slots = [0, 1, 2, 3].map((k) => el("div", { class: `slot log-slot-${k}` }));
  const stage = el(
    "div",
    { class: "stage log" },
    el(
      "div",
      { class: "qf" },
      el("img", { class: "portrait", src: UI("qlog/UI-QuestLog-BookIcon.PNG"), alt: "" }),
      el("div", { class: "art" }),
      el("div", { class: "qf-title log-title" }, "Quest Log"),
      count,
      el("button", { class: "close log-close", "aria-label": "Close", onclick: () => close() }),
      listScroll,
      scrollbar(listScroll, list, "log-sb-list"),
      detailScroll,
      scrollbar(detailScroll, detail, "log-sb-detail"),
      slots,
    ),
  );
  stage.hidden = true;
  let selected = null;
  let confirming = false;
  let collapsed = false;

  function objectives(q) {
    const lines = [];
    if (q.questions.length) {
      const answered = q.questions.filter((i) => answers[i] !== undefined).length;
      lines.push([`Questions answered: ${answered}/${q.questions.length}`, answered === q.questions.length]);
    }
    if (q.id === "profile") for (const line of profileLines()) lines.push([line, true]);
    if (q.id === "verdict" && done.has("verdict")) lines.push([`Verdict: ${VERSIONS[verdictKey].name}`, true]);
    return lines.map(([text, finished]) => el("p", { class: `log-objective${finished ? " finished" : ""}` }, text));
  }

  function render() {
    const listed = QUESTS.filter((q) => ["active", "done"].includes(questStatus(q)));
    if (!listed.some((q) => q.id === selected)) selected = listed[0]?.id ?? null;
    const level = 1 + done.size;
    count.replaceChildren(el("span", {}, "Quests: "), `${listed.length}/${MAX_QUESTS}`);

    const rows = [];
    if (listed.length) {
      rows.push(
        el(
          "button",
          { class: "log-row log-header", onclick: () => (play("check"), (collapsed = !collapsed), render()) },
          el("span", { class: `log-toggle${collapsed ? " plus" : ""}` }),
          el("span", { class: "log-row-title" }, QUEST_ZONE),
        ),
      );
      if (!collapsed)
        for (const q of listed) {
          const qLevel = QUESTS.indexOf(q) + 1;
          rows.push(
            el(
              "button",
              {
                class: `log-row log-quest${q.id === selected ? " selected" : ""}`,
                style: `--c: ${difficultyColor(qLevel, level)}`,
                onclick: () => {
                  play("check");
                  selected = q.id;
                  confirming = false;
                  render();
                  detailScroll.scrollTop = 0;
                },
              },
              el("span", { class: "log-row-title" }, `[${qLevel}] ${q.title}`),
              questStatus(q) === "done" ? el("span", { class: "log-row-tag" }, "(Complete)") : null,
            ),
          );
        }
    }
    list.replaceChildren(...(rows.length ? rows : [el("p", { class: "log-empty" }, "No Active Quests")]));

    const q = selected && quest(selected);
    detail.replaceChildren(
      ...(q
        ? [
            el("h2", {}, q.title),
            el("p", {}, q.objective),
            ...objectives(q),
            el("h3", {}, "Description"),
            el("p", {}, q.text),
            el("h3", {}, "Rewards"),
            q.reward && el("p", {}, "You will receive:"),
            q.reward && el("div", { class: "items" }, rewardItem(q)),
            el("p", { class: "log-xp" }, `Experience: ${q.xp}`),
          ]
        : []),
    );

    const abandonBtn = button(confirming ? "Really?" : "Abandon", () => {
      if (!q) return;
      if (!confirming) {
        confirming = true;
        return render();
      }
      confirming = false;
      abandon(q.id);
      render();
      if (!$.stage.hidden) renderGossip();
    }, !q);
    slots[0].replaceChildren(abandonBtn);
    // pas de groupe, rien à partager ni à suivre : grisés, comme en solo dans le jeu
    slots[1].replaceChildren(button("Share", () => {}, true));
    slots[2].replaceChildren(button("Track", () => {}, true));
    slots[3].replaceChildren(button("Close", () => close()));
  }

  function open() {
    if (!stage.hidden) return;
    stage.hidden = false;
    confirming = false;
    play("open");
    render();
  }
  function close() {
    if (stage.hidden) return;
    stage.hidden = true;
    play("close");
  }
  addEventListener("quest:state", () => !stage.hidden && render());
  return {
    mount: () => app.append(stage),
    open,
    close,
    toggle: () => (stage.hidden ? open() : close()),
    isOpen: () => !stage.hidden,
  };
})();

// Un lien partagé ouvre directement le résultat : ?r=<version>&a=<réponses>.
// Le résultat affiché est celui de l'adresse (r), les réponses (a) donnent
// les raisons et la réputation. Elles ne remplacent jamais la progression
// du joueur : on les prête le temps d'afficher l'écran.
function renderShared(key, shared) {
  const own = answers;
  if (shared) answers = shared;
  renderResult(key, false);
  answers = own;
}

mount();
load();
const params = new URLSearchParams(location.search);
const sharedAnswers = params.get("a") && decodeAnswers(params.get("a"));
const sharedKey = VERSIONS[params.get("r")] ? params.get("r") : null;
if (!WORLD) {
  if (sharedKey) renderShared(sharedKey, sharedAnswers);
  else renderGossip();
} else {
  // Fenêtre pilotée par le monde : cachée tant qu'on n'a pas parlé à Chromie,
  // et elle garde où on en était quand on s'éloigne puis qu'on revient.
  let opened = false;
  let started = false;
  let pendingShared = sharedKey;
  $.stage.hidden = true;
  questLog.mount();
  window.QuizUI = {
    open() {
      if (opened) return;
      opened = true;
      $.stage.hidden = false;
      document.body.classList.add("quest-open");
      if (pendingShared) {
        renderShared(pendingShared, sharedAnswers);
        pendingShared = null;
        started = true;
      } else if (!started) {
        renderGossip();
        started = true;
      } else play("open");
    },
    close() {
      if (!opened) return;
      opened = false;
      $.stage.hidden = true;
      document.body.classList.remove("quest-open");
      play("close");
      dispatchEvent(new CustomEvent("quest:close"));
    },
    isOpen: () => opened,
    hasShared: () => !!pendingShared,
    markerState,
    level: () => 1 + done.size,
    verdict: () => (done.has("verdict") ? verdictKey : null),
    doneQuests: () => [...done],
    toggleLog: () => questLog.toggle(),
    closeLog: () => questLog.close(),
    logOpen: () => questLog.isOpen(),
  };
  emitState();
}
