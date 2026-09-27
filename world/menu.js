// Menu du jeu (Échap) : Sound, Video, Interface, Key Bindings, Logout, Return to Game.
// Boîtes de dialogue du jeu : bordure argentée, en-tête, boutons rouges,
// cases à cocher et curseurs des Options d'origine. Les réglages s'appliquent
// tout de suite et sont gardés (settings.js).

import { settings } from "./settings.js?v=2";

function el(tag, cls, ...children) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  node.append(...children.filter((c) => c != null));
  return node;
}

function button(label, onclick) {
  const b = el("button", "wbtn", label);
  b.onclick = () => {
    window.playUiSound?.("click");
    onclick();
  };
  return b;
}

function checkbox(label, key) {
  const box = el("button", "wcheck");
  box.setAttribute("role", "checkbox");
  const row = el("label", "wcheck-row", box, el("span", null, label));
  const sync = (s) => box.setAttribute("aria-checked", String(!!s[key]));
  box.onclick = (e) => {
    e.preventDefault();
    window.playUiSound?.("check");
    settings.set({ [key]: !settings.get()[key] });
  };
  // cliquer le libellé coche aussi : le navigateur transmet le clic à la case
  settings.bind(row, sync);
  return row;
}

function slider(label, key, { min = 0, max = 1, step = 0.05, format = (v) => `${Math.round(v * 100)}%` } = {}) {
  const value = el("span", "wopt-value");
  const input = document.createElement("input");
  Object.assign(input, { type: "range", min, max, step });
  input.addEventListener("input", () => settings.set({ [key]: Number(input.value) }));
  settings.bind(input, (s) => {
    input.value = s[key];
    value.textContent = format(s[key]);
  });
  return el("div", "wopt-slider", el("div", "wopt-label", label, value), el("div", "wslider", el("div", "wslider-track", input)));
}

export function createMenu({ onLogout, onLogoutStart, onLogoutCancel }) {
  const root = el("div", "menu-layer");
  root.hidden = true;
  // le bouton « menu » de la barre du jeu, en bas à droite
  const micro = el("button", "micro-btn micro-menu");
  micro.setAttribute("aria-label", "Game Menu");
  micro.onclick = () => (root.hidden ? gameMenu() : close());
  document.body.append(root, micro);

  const show = (d) => {
    root.replaceChildren(d);
    root.hidden = false;
  };
  let logoutTimer = 0;
  // la déconnexion en cours s'arrête (fenêtre fermée, Cancel, ou on bouge)
  const cancelLogout = () => {
    if (!logoutTimer) return;
    clearInterval(logoutTimer);
    logoutTimer = 0;
    onLogoutCancel?.();
  };
  const close = () => {
    cancelLogout();
    root.hidden = true;
    root.replaceChildren();
  };

  const gameMenu = () => {
    window.playUiSound?.("open");
    show(
      el(
        "div",
        "wdialog game-menu",
        el("div", "wdialog-header", el("span", null, "Game Menu")),
        el(
          "div",
          "wdialog-body stack",
          button("Sound", soundMenu),
          button("Video", videoMenu),
          button("Interface", interfaceMenu),
          button("Key Bindings", keysMenu),
          el("div", "gap"),
          button("Logout", logout),
          el("div", "gap"),
          button("Return to Game", close),
        ),
      ),
    );
  };

  const footer = (keys) =>
    el(
      "div",
      "wdialog-footer",
      button("Defaults", () => settings.reset(keys)),
      button("Okay", gameMenu),
    );

  function soundMenu() {
    show(
      el(
        "div",
        "wdialog options",
        el("div", "wdialog-header", el("span", null, "Sound")),
        el(
          "div",
          "wdialog-body",
          el("h4", null, "Sound"),
          el(
            "div",
            "wopt-grid",
            el("div", "wopt-col", checkbox("Enable Sound", "sound"), checkbox("Music", "music"), checkbox("Ambient Sounds", "ambience"), checkbox("Sound Effects", "effects")),
            el(
              "div",
              "wopt-col",
              slider("Master Volume", "master"),
              slider("Music", "musicVolume"),
              slider("Ambience", "ambienceVolume"),
              slider("Sound Effects", "effectsVolume"),
            ),
          ),
          footer(["sound", "music", "ambience", "effects", "master", "musicVolume", "ambienceVolume", "effectsVolume"]),
        ),
      ),
    );
  }

  function videoMenu() {
    show(
      el(
        "div",
        "wdialog options",
        el("div", "wdialog-header", el("span", null, "Video")),
        el(
          "div",
          "wdialog-body",
          el("h4", null, "Graphics"),
          el(
            "div",
            "wopt-grid",
            el("div", "wopt-col", checkbox("Shadows", "shadows")),
            el(
              "div",
              "wopt-col",
              slider("Render Scale", "renderScale", { min: 0.5, max: 1, step: 0.05 }),
              slider("View Distance", "viewDistance", { min: 150, max: 600, step: 10, format: (v) => `${v} yd` }),
            ),
          ),
          footer(["shadows", "renderScale", "viewDistance"]),
        ),
      ),
    );
  }

  function interfaceMenu() {
    show(
      el(
        "div",
        "wdialog options",
        el("div", "wdialog-header", el("span", null, "Interface")),
        el(
          "div",
          "wdialog-body",
          el("h4", null, "Quests"),
          el("div", "wopt-grid", el("div", "wopt-col", checkbox("Animate Quest Text", "questText")), el("div", "wopt-col")),
          footer(["questText"]),
        ),
      ),
    );
  }

  function keysMenu() {
    const coarse = matchMedia("(pointer: coarse)").matches;
    const rows = coarse
      ? [
          ["Tap the ground", "Walk there"],
          ["Tap Chromie", "Talk"],
          ["Tap a portal", "Use the portal"],
          ["Drag", "Look around"],
        ]
      : [
          ["W / Z, S", "Move forward, backward"],
          ["A / Q, D", "Turn left, right"],
          ["Q / A, E", "Strafe left, right"],
          ["Space", "Jump"],
          ["Num Lock, R", "Autorun"],
          ["Right mouse (hold)", "Steer"],
          ["Left mouse (hold)", "Look around"],
          ["Both mouse buttons", "Move forward"],
          ["Mouse wheel", "Zoom, down to first person"],
          ["Right-click Chromie", "Talk"],
          ["Right-click a portal", "Use the portal"],
          ["Enter", "Chat (/s say, /y yell, /dance...)"],
          ["Tab", "Target Chromie"],
          ["L", "Quest Log"],
          ["Y", "Achievements"],
          ["B", "Backpack"],
          ["J", "LEEEEROOOOY JENKINS!"],
          ["M", "World map"],
          ["Ctrl + S", "Toggle sound"],
          ["Ctrl + M", "Toggle music"],
          ["Escape", "Close windows, Game Menu"],
        ];
    show(
      el(
        "div",
        "wdialog options keys",
        el("div", "wdialog-header", el("span", null, "Key Bindings")),
        el(
          "div",
          "wdialog-body",
          el("div", "keys-list", ...rows.map(([k, a]) => el("div", "keys-row", el("span", "keys-action", a), el("span", "keys-key", k)))),
          el("div", "wdialog-footer", button("Okay", gameMenu)),
        ),
      ),
    );
  }

  // Déconnexion façon jeu : compte à rebours, « Exit Now » ou « Cancel ».
  function logout() {
    let n = 5;
    const text = el("div", "logout-text");
    const tick = () => (text.textContent = `Logging out in ${n} sec...`);
    tick();
    cancelLogout();
    onLogoutStart?.();
    const timer = setInterval(() => {
      n -= 1;
      if (n <= 0) {
        clearInterval(timer);
        onLogout();
      } else tick();
    }, 1000);
    logoutTimer = timer;
    show(
      el(
        "div",
        "wdialog logout",
        el(
          "div",
          "wdialog-body",
          text,
          el(
            "div",
            "wdialog-footer",
            button("Exit Now", () => (clearInterval(timer), onLogout())),
            button("Cancel", close),
          ),
        ),
      ),
    );
  }

  return {
    isOpen: () => !root.hidden,
    open: gameMenu,
    loggingOut: () => !!logoutTimer,
    // déconnexion lancée d'ailleurs (objet « Log out. Go outside. »)
    logout,
    cancelLogout: () => {
      if (logoutTimer) close();
    },
    close,
    toggle: () => (root.hidden ? gameMenu() : close()),
  };
}
