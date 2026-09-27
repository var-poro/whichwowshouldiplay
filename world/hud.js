// Interface du monde, en textures du jeu : écran de chargement, cadres du
// joueur et de la cible, nom et point d'exclamation au-dessus de Chromie,
// bulle de dialogue, fenêtre de discussion, erreurs, nom de zone, minicarte.
// Tout est en « pixels du jeu », agrandi par --s comme la fenêtre de quête.

const UI = (n) => `assets/ui/${n}`;
const ICON = (n) => `assets/icons/${n}.jpg`;

function el(tag, cls, ...children) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  node.append(...children.filter((c) => c != null));
  return node;
}

// marge du calque .hud (inset de 16 px à l'écran, voir world.css)
const HUD_INSET = 16;

export function createHud(root) {
  const hud = el("div", "hud");
  root.append(hud);

  // ---------- écran de chargement ----------
  const loadFill = el("div", "load-fill");
  const loadSpark = el("div", "load-spark");
  const loadText = el("div", "load-text", "Loading...");
  const enter = el("button", "wbtn enter", "Enter World");
  enter.hidden = true;
  const loadLogo = el("img", "load-logo");
  loadLogo.src = "assets/built/wow-logo.png";
  const loading = el(
    "div",
    "loading",
    loadLogo,
    el("div", "load-tip", el("b", null, "Tip: "), "Right-click Chromie to talk to her. Move with WASD (ZQSD on AZERTY), hold right-click to steer."),
    el("div", "load-bar", loadFill, loadSpark, el("div", "load-border")),
    loadText,
    enter,
  );
  // caché tant qu'on est aux écrans de connexion (world/glue.js) : il ne
  // s'affiche qu'après « Enter World », comme en jeu
  loading.hidden = true;
  document.body.append(loading);

  // ---------- cadres du joueur et de la cible ----------
  const unitFrame = (cls, icon, name, level) => {
    const frame = el(
      "div",
      `unit ${cls}`,
      el("img", "unit-portrait", null),
      el("div", "unit-art"),
      el("div", "unit-name", name),
      el("div", "unit-bar hp", el("span", null, "100%")),
      el("div", "unit-bar mp", el("span", null, "")),
      el("div", "unit-level", String(level)),
    );
    frame.querySelector(".unit-portrait").src = ICON(icon);
    return frame;
  };
  const player = unitFrame("player", "achievement_character_human_male", "Leeroy Jenkins", 1);
  const target = unitFrame("target", "achievement_character_gnome_female", "Chromie", "??");
  target.hidden = true;
  hud.append(player, target);

  // ---------- mort ----------
  const deathText = el("div", "logout-text");
  const releaseBtn = el("button", "wbtn", "Release Spirit");
  const deathLayer = el("div", "death-layer", el("div", "wdialog death", el("div", "wdialog-body", deathText, el("div", "wdialog-footer", releaseBtn))));
  deathLayer.hidden = true;
  let deathTimer = 0;
  document.body.append(deathLayer);

  // ---------- au-dessus de Chromie : « ! », nom, titre, bulle ----------
  const plate = el("div", "nameplate", el("div", "np-name", "Chromie"), el("div", "np-title", "<Timewalker>"));
  // noms des portails, au-dessus de chacun
  const labels = new Map();
  const bubbleText = el("div", "bubble-text");
  const bubble = el("div", "bubble", bubbleText, el("div", "bubble-tail"));
  bubble.hidden = true;
  hud.append(plate, bubble);

  // Les bulles se placent pour que la pointe de leur queue (en bas à gauche)
  // tombe sur la tête de celui qui parle : 37 px du bord gauche, 21 px dessous.
  const TAIL_X = 31;
  const TAIL_Y = 14;
  // bulle au-dessus du joueur (ce qu'il dit ou crie)
  const pBubbleText = el("div", "bubble-text");
  const pBubble = el("div", "bubble player-bubble", pBubbleText, el("div", "bubble-tail"));
  pBubble.hidden = true;
  let pBubbleUntil = 0;
  hud.append(pBubble);

  // ---------- discussion, erreurs, nom de zone ----------
  // Fenêtre de discussion : on garde l'historique et la molette le fait
  // défiler ligne à ligne ; à gauche, les boutons du jeu (haut, bas, fin) ; le
  // bouton « fin » clignote quand un message arrive alors qu'on lit plus haut.
  const chatLines = el("div", "chat-lines");
  const chatBtn = (kind, label) => {
    const b = el("button", `chat-btn ${kind}`);
    b.setAttribute("aria-label", label);
    return b;
  };
  const chatUp = chatBtn("up", "Scroll up");
  const chatDown = chatBtn("down", "Scroll down");
  const chatEnd = chatBtn("end", "Scroll to bottom");
  const chat = el("div", "chat", el("div", "chat-buttons", chatUp, chatDown, chatEnd), chatLines);
  const LINE = 17; // hauteur d'une ligne (16 px + 1 d'écart)
  const atBottom = () => chatLines.scrollTop >= chatLines.scrollHeight - chatLines.clientHeight - 2;
  const syncChat = () => {
    const bottom = atBottom();
    chatUp.disabled = chatLines.scrollTop <= 0;
    chatDown.disabled = chatEnd.disabled = bottom;
    if (bottom) chatEnd.classList.remove("blink");
    chat.classList.toggle("scrolled", !bottom);
  };
  const scrollLines = (n) => {
    chatLines.scrollTop += n * LINE;
    syncChat();
  };
  let wheel = 0;
  chatLines.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      wheel += e.deltaY;
      while (Math.abs(wheel) >= 50) {
        scrollLines(Math.sign(wheel));
        wheel -= Math.sign(wheel) * 50;
      }
    },
    { passive: false },
  );
  chatUp.onclick = () => scrollLines(-1);
  chatDown.onclick = () => scrollLines(1);
  chatEnd.onclick = () => {
    chatLines.scrollTop = chatLines.scrollHeight;
    syncChat();
  };
  syncChat();
  // Zone de saisie du jeu (Entrée) : « Say: » ou « Yell: » devant le texte ;
  // taper « /y » ou « /s » suivi d'un espace change de canal, comme en jeu.
  const editHeader = el("span", "chat-edit-header");
  const editInput = document.createElement("input");
  editInput.maxLength = 255;
  editInput.spellcheck = false;
  editInput.autocomplete = "off";
  const edit = el("div", "chat-edit", editHeader, editInput);
  edit.hidden = true;
  let chatMode = "say";
  let onChatSend = () => {};
  const setMode = (mode) => {
    chatMode = mode;
    editHeader.textContent = mode === "yell" ? "Yell:" : "Say:";
    edit.dataset.mode = mode;
  };
  const closeEdit = () => {
    edit.hidden = true;
    editInput.value = "";
    editInput.blur();
  };
  editInput.addEventListener("keydown", (e) => {
    e.stopPropagation(); // le jeu n'entend pas ce qu'on tape
    if (e.key === "Escape") return closeEdit();
    if (e.key !== "Enter") return;
    const text = editInput.value;
    const mode = chatMode;
    closeEdit();
    // comme en jeu, /say reste choisi d'une fois sur l'autre, /yell non
    setMode("say");
    onChatSend(mode, text);
  });
  editInput.addEventListener("keyup", (e) => e.stopPropagation());
  editInput.addEventListener("input", () => {
    const m = editInput.value.match(/^\/(s|say|y|yell|sh|shout)\s/i);
    if (!m) return;
    setMode(/^(y|yell|sh|shout)$/i.test(m[1]) ? "yell" : "say");
    editInput.value = editInput.value.slice(m[0].length);
  });
  editInput.addEventListener("blur", () => !edit.hidden && closeEdit());

  // ---------- barre d'incantation (pierre de foyer…) ----------
  // CastingBarFrame du jeu : bordure UI-CastingBar-Border (256 × 64), barre de
  // 195 × 13 remplie en jaune, étincelle au bout ; verte avec un éclair quand
  // c'est fini, rouge « Interrupted » si on bouge.
  const castFill = el("div", "cast-fill");
  const castSpark = el("div", "cast-spark");
  const castText = el("div", "cast-text");
  const castFlash = el("div", "cast-flash");
  const castBar = el("div", "cast-bar", el("div", "cast-track", castFill, castSpark), el("div", "cast-border"), castFlash, castText);
  castBar.hidden = true;
  let castFade = 0;
  document.body.append(castBar);

  // ---------- carte de la zone (M, ou l'objet « Map of Every Azeroth ») ----------
  // Le WorldMapFrame de Classic (UI-WorldMap-*, 1024 × 768) : cadre sombre et
  // parchemin. Le plateau y est tracé à l'encre (image vue du dessus, passée en
  // sépia et multipliée sur le parchemin), les repères par-dessus.
  const MAP_W = 1002;
  const MAP_H = 668;
  const inkCanvas = document.createElement("canvas");
  inkCanvas.className = "wm-ink";
  inkCanvas.width = MAP_W;
  inkCanvas.height = MAP_H;
  const worldCanvas = document.createElement("canvas");
  worldCanvas.className = "wm-marks";
  worldCanvas.width = MAP_W;
  worldCanvas.height = MAP_H;
  const wctx = worldCanvas.getContext("2d");
  const worldClose = el("button", "close");
  worldClose.setAttribute("aria-label", "Close");
  const worldFrame = el("div", "wm-frame", el("div", "wm-title", "The Timeways"), inkCanvas, worldCanvas, worldClose);
  const worldMap = el("div", "world-map", worldFrame);
  worldMap.hidden = true;
  let inked = false;
  // encre : le plateau en brun, le vide blanc (sans effet une fois multiplié)
  function inkMap() {
    if (!terrainMap || inked) return;
    const src = terrainMap.canvas;
    const tmp = document.createElement("canvas");
    tmp.width = tmp.height = src.width;
    const t = tmp.getContext("2d");
    t.drawImage(src, 0, 0);
    const img = t.getImageData(0, 0, src.width, src.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const l = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255;
      // le vide (noir) reste parchemin ; le plateau, plus il est clair, plus l'encre est légère
      if (l < 0.03) {
        d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 255;
        continue;
      }
      const ink = 0.3 + Math.min(1, l * 1.6) * 0.55;
      d[i] = 255 * ink;
      d[i + 1] = 235 * ink;
      d[i + 2] = 200 * ink;
      d[i + 3] = 255;
    }
    t.putImageData(img, 0, 0);
    const ictx = inkCanvas.getContext("2d");
    ictx.fillStyle = "#fff";
    ictx.fillRect(0, 0, MAP_W, MAP_H);
    ictx.drawImage(tmp, (MAP_W - MAP_H) / 2, 0, MAP_H, MAP_H);
    inked = true;
  }
  // tient dans l'écran
  const fitWorldMap = () => {
    const k = Math.min(1, (innerWidth * 0.94) / 1024, (innerHeight * 0.94) / 768);
    worldFrame.style.zoom = k;
  };
  addEventListener("resize", fitWorldMap);
  worldClose.onclick = () => {
    worldMap.hidden = true;
    window.playUiSound?.("close");
  };
  document.body.append(worldMap);

  // info-bulle d'objet survolé (portails), en bas à droite comme celle du jeu
  const objName = el("div", "t-name");
  const objSub = el("div", "t-sub");
  const objTip = el("div", "tooltip object-tip", objName, objSub);
  objTip.hidden = true;
  document.body.append(objTip);
  const errors = el("div", "errors");
  const zone = el("div", "zone-text", el("div", "zone-main"), el("div", "zone-sub"));
  hud.append(chat, edit, errors, zone);

  // ---------- minicarte ----------
  const mapCanvas = document.createElement("canvas");
  mapCanvas.width = mapCanvas.height = 132;
  const minimap = el("div", "minimap", el("div", "mm-zone", "The Timeways"), mapCanvas, el("div", "mm-border"));
  hud.append(minimap);
  const mctx = mapCanvas.getContext("2d");
  const arrow = new Image();
  arrow.src = UI("MinimapArrow.PNG");
  const bang = new Image();
  bang.src = UI("AvailableQuestIcon.PNG");
  let terrainMap = null;

  let bubbleUntil = 0;
  let errorTimer = 0;

  return {
    // chargement
    setProgress(p) {
      // la barre s'étire sur 80 % de l'écran : remplissage et étincelle en proportion
      loading.style.setProperty("--p", Math.max(0, Math.min(1, p)));
    },
    // Chargement après la sélection du personnage : la barre se remplit, puis
    // on entre dans le monde tout seul (le monde est déjà prêt derrière).
    playLoading(onDone, secs = 1.6) {
      // la barre part de zéro (le chargement du monde l'avait laissée pleine)
      loading.style.setProperty("--p", 0);
      loading.hidden = false;
      loadText.textContent = "Loading...";
      enter.hidden = true;
      const start = performance.now();
      const step = () => {
        const p = Math.min(1, (performance.now() - start) / (secs * 1000));
        loading.style.setProperty("--p", p * p * (3 - 2 * p));
        if (p < 1) return requestAnimationFrame(step);
        setTimeout(() => {
          loading.classList.add("gone");
          setTimeout(() => loading.remove(), 900);
          onDone();
        }, 250);
      };
      requestAnimationFrame(step);
    },
    ready(onEnter) {
      loadText.textContent = "";
      enter.hidden = false;
      enter.focus();
      enter.onclick = () => {
        loading.classList.add("gone");
        setTimeout(() => loading.remove(), 900);
        onEnter();
      };
    },

    setPortrait(which, url) {
      (which === "player" ? player : target).querySelector(".unit-portrait").src = url;
    },
    setPlayer({ name, level }) {
      if (name) player.querySelector(".unit-name").textContent = name;
      if (level != null) player.querySelector(".unit-level").textContent = String(level);
    },
    ding() {
      player.classList.remove("ding");
      void player.offsetWidth;
      player.classList.add("ding");
    },
    setTarget(on) {
      target.hidden = !on;
    },
    // vie du joueur, en pourcentage (barre et texte)
    setHealth(pct) {
      const bar = player.querySelector(".unit-bar.hp");
      bar.style.setProperty("--w", `${pct}%`);
      bar.firstChild.textContent = pct > 0 ? `${pct}%` : "Dead";
    },
    // Fenêtre de mort du jeu, en haut de l'écran : « Release Spirit », et au
    // bout de six minutes l'esprit se libère tout seul.
    showDeath(onRelease) {
      clearInterval(deathTimer);
      let left = 360;
      const tick = () => {
        deathText.textContent = left >= 60 ? `${Math.ceil(left / 60)} Min until release` : `${left} Sec until release`;
        if (left-- <= 0) releaseBtn.onclick();
      };
      releaseBtn.onclick = () => {
        clearInterval(deathTimer);
        window.playUiSound?.("click");
        onRelease();
      };
      tick();
      deathTimer = setInterval(tick, 1000);
      deathLayer.hidden = false;
    },
    hideDeath() {
      clearInterval(deathTimer);
      deathLayer.hidden = true;
    },

    // position écran (px CSS) de la tête de Chromie, ou null si hors champ
    placeOverhead(pt, s, questState, showName = true) {
      if (!pt) {
        plate.hidden = true;
        bubble.hidden = true;
        return;
      }
      plate.hidden = !showName;
      // le calque .hud est décalé de 16 px du bord de l'écran : on retire ce décalage
      plate.style.transform = `translate(${(pt.x - HUD_INSET) / s}px, ${(pt.y - HUD_INSET) / s}px) translate(-50%, -100%)`;
      // la bulle apparaît et s'efface en fondu (classe « on »)
      bubble.hidden = false;
      bubble.classList.toggle("on", performance.now() < bubbleUntil);
      // la bulle passe au-dessus du marqueur de quête quand il est là
      const lift = questState === "done" ? 34 : 70;
      bubble.style.transform = `translate(${pt.x / s - TAIL_X}px, ${pt.y / s - lift - TAIL_Y}px) translate(0, -100%)`;
    },
    // étiquettes flottantes : [{ id, x, y, text, color }] en px d'écran, ou x null si hors champ
    placeLabels(items, s) {
      for (const it of items) {
        let node = labels.get(it.id);
        if (!node) {
          node = el("div", "world-label", it.text);
          node.style.color = it.color;
          labels.set(it.id, node);
          hud.append(node);
        }
        node.hidden = it.x == null;
        node.classList.toggle("behind", !!it.behind);
        if (!node.hidden) node.style.transform = `translate(${(it.x - HUD_INSET) / s}px, ${(it.y - HUD_INSET) / s}px) translate(-50%, -100%)`;
      }
    },
    // discussion du joueur
    onChat(fn) {
      onChatSend = fn;
    },
    // prefix : texte déjà tapé (« / » quand on ouvre la saisie avec la barre oblique)
    openChat(prefix = "") {
      if (!edit.hidden) return;
      setMode(chatMode);
      edit.hidden = false;
      editInput.value = prefix;
      editInput.focus();
    },
    chatOpen: () => !edit.hidden,
    // ce que dit le joueur, dans une bulle au-dessus de sa tête (rouge s'il crie)
    playerSay(text, yell = false) {
      pBubbleText.textContent = text;
      pBubble.classList.toggle("yell", yell);
      pBubbleUntil = performance.now() + Math.min(12000, 3500 + text.length * 70);
    },
    placePlayerBubble(pt, s) {
      pBubble.hidden = !pt;
      if (!pt) return;
      pBubble.classList.toggle("on", performance.now() < pBubbleUntil);
      pBubble.style.transform = `translate(${pt.x / s - TAIL_X}px, ${pt.y / s - TAIL_Y}px) translate(0, -100%)`;
    },
    // incantation : nom et avancée (0 à 1)
    castStart(name) {
      clearTimeout(castFade);
      castBar.className = "cast-bar";
      castBar.hidden = false;
      castText.textContent = name;
    },
    castProgress(p) {
      castFill.style.width = `${Math.min(1, p) * 100}%`;
      castSpark.style.left = `${Math.min(1, p) * 100}%`;
    },
    castEnd(ok) {
      castBar.classList.add(ok ? "done" : "failed");
      if (ok) castFill.style.width = "100%";
      else castText.textContent = "Interrupted";
      clearTimeout(castFade);
      castFade = setTimeout(() => (castBar.hidden = true), ok ? 500 : 1000);
    },
    // carte de la zone, avec le joueur, Chromie et les portails
    worldMapOpen: () => !worldMap.hidden,
    toggleWorldMap() {
      worldMap.hidden = !worldMap.hidden;
      if (!worldMap.hidden) {
        inkMap();
        fitWorldMap();
      }
      window.playUiSound?.(worldMap.hidden ? "close" : "open");
    },
    closeWorldMap() {
      worldMap.hidden = true;
    },
    drawWorldMap(px, pz, yaw, chromie, portals = []) {
      if (worldMap.hidden || !terrainMap) return;
      // la carte (carrée) occupe la hauteur du parchemin, centrée
      const k = MAP_H / terrainMap.extent;
      const x0 = (MAP_W - MAP_H) / 2;
      const toMap = (x, z) => [x0 + (x + terrainMap.extent / 2) * k, (z + terrainMap.extent / 2) * k];
      wctx.clearRect(0, 0, MAP_W, MAP_H);
      for (const p of portals) {
        const [x, z] = toMap(p.x, p.z);
        wctx.fillStyle = p.color;
        wctx.beginPath();
        wctx.arc(x, z, 7, 0, Math.PI * 2);
        wctx.fill();
        wctx.lineWidth = 2;
        wctx.strokeStyle = "#2a1a08";
        wctx.stroke();
      }
      const [cx, cz] = toMap(chromie.x, chromie.y);
      if (bang.complete) wctx.drawImage(bang, cx - 14, cz - 14, 28, 28);
      const [ax, az] = toMap(px, pz);
      wctx.save();
      wctx.translate(ax, az);
      wctx.rotate(-yaw);
      if (arrow.complete) wctx.drawImage(arrow, -20, -20, 40, 40);
      wctx.restore();
    },
    showObjectTip(name, sub) {
      objName.textContent = name;
      objSub.textContent = sub || "";
      objTip.hidden = false;
    },
    hideObjectTip() {
      objTip.hidden = true;
    },
    say(text, ms = 6000) {
      bubbleText.textContent = text;
      bubbleUntil = performance.now() + ms;
    },

    chat(text, kind = "system") {
      // (kind « yell » : cri en rouge, comme /yell)
      const line = el("div", `chat-line ${kind}`, text);
      const follow = atBottom();
      chatLines.append(line);
      while (chatLines.children.length > 200) chatLines.firstChild.remove();
      if (follow) chatLines.scrollTop = chatLines.scrollHeight;
      else chatEnd.classList.add("blink");
      syncChat();
      setTimeout(() => line.classList.add("faded"), 30000);
    },
    error(text) {
      errors.textContent = text;
      errors.classList.remove("fade");
      void errors.offsetWidth;
      errors.classList.add("fade");
      clearTimeout(errorTimer);
      errorTimer = setTimeout(() => (errors.textContent = ""), 2600);
    },
    zoneText(main, sub) {
      zone.querySelector(".zone-main").textContent = main;
      zone.querySelector(".zone-sub").textContent = sub;
      zone.classList.remove("show");
      void zone.offsetWidth;
      zone.classList.add("show");
    },

    // carte vue du dessus, précalculée une fois à partir du relief
    // carte toute faite (vue du dessus de la zone), centrée sur l'origine
    setMap(canvas, extent) {
      terrainMap = { canvas, extent };
    },
    drawMap(px, pz, yaw, chromie, questState, portals = []) {
      const R = 66;
      const range = 80; // mètres visibles d'un bord à l'autre
      mctx.save();
      mctx.clearRect(0, 0, 132, 132);
      mctx.beginPath();
      mctx.arc(R, R, R, 0, Math.PI * 2);
      mctx.clip();
      // fond noir opaque : le vide et le bord de la carte ne laissent rien voir au travers
      mctx.fillStyle = "#000";
      mctx.fillRect(0, 0, 132, 132);
      if (terrainMap) {
        const k = terrainMap.canvas.width / terrainMap.extent;
        const sx = (px + terrainMap.extent / 2) * k - (range / 2) * k;
        const sz = (pz + terrainMap.extent / 2) * k - (range / 2) * k;
        mctx.drawImage(terrainMap.canvas, sx, sz, range * k, range * k, 0, 0, 132, 132);
      }
      const toMap = (x, z) => [R + ((x - px) / range) * 132, R + ((z - pz) / range) * 132];
      for (const p of portals) {
        const [x, z] = toMap(p.x, p.z);
        mctx.beginPath();
        mctx.arc(x, z, 4, 0, Math.PI * 2);
        mctx.fillStyle = p.color;
        mctx.fill();
        mctx.lineWidth = 1.5;
        mctx.strokeStyle = "#000";
        mctx.stroke();
      }
      if (questState !== "done") {
        let [cx, cz] = toMap(chromie.x, chromie.y);
        const d = Math.hypot(cx - R, cz - R);
        if (d > R - 8) {
          cx = R + ((cx - R) / d) * (R - 8);
          cz = R + ((cz - R) / d) * (R - 8);
        }
        if (bang.complete) mctx.drawImage(bang, cx - 8, cz - 8, 16, 16);
      }
      mctx.translate(R, R);
      mctx.rotate(-yaw);
      if (arrow.complete) mctx.drawImage(arrow, -16, -16, 32, 32);
      mctx.restore();
    },
  };
}
