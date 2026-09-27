// Fenêtre façon boutique du jeu, ouverte en franchissant le bon portail :
// la version désignée par Chromie, et les liens officiels de Blizzard.
// Textures : atlas Store-Main et Store-Splash du client (assets/built/store-*).

const LINKS = {
  retail: { site: "https://worldofwarcraft.blizzard.com/en-gb/", shop: "https://shop.battle.net/family/world-of-warcraft" },
  classic: { site: "https://worldofwarcraft.blizzard.com/en-gb/classic", shop: "https://shop.battle.net/family/world-of-warcraft-classic" },
  // WoW Forever se joue avec l'abonnement du jeu
  forever: { site: "https://worldofwarcraft.blizzard.com/forever", shop: "https://shop.battle.net/family/world-of-warcraft" },
};
const linksFor = (key) => LINKS[key] || LINKS.classic;

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

export function createShop({ onLogout }) {
  const layer = el("div", "shop-layer");
  layer.hidden = true;
  document.body.append(layer);

  const close = () => {
    if (layer.hidden) return;
    layer.hidden = true;
    window.playUiSound?.("close");
  };
  layer.onclick = (e) => {
    if (e.target === layer) close();
  };

  function open(key) {
    const v = VERSIONS[key];
    const none = key === "none";
    const links = linksFor(key);
    const icon = el("img", "shop-icon");
    icon.src = `assets/icons/${v.icon}.jpg`;
    const closeBtn = el("button", "shop-close");
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.onclick = close;
    const buttons = none
      ? [button("Log Off", onLogout), button("Stay a bit", close)]
      : [
          button("Buy Now", () => (window.Achievements?.unlock("window-shopper"), window.open(links.shop, "_blank", "noopener"))),
          button("Learn More", () => (window.Achievements?.unlock("window-shopper"), window.open(links.site, "_blank", "noopener"))),
        ];
    layer.replaceChildren(
      el(
        "div",
        "shop-card",
        el("div", "shop-banner", el("span", null, none ? "Your Timeline: Outside" : "Your Timeline")),
        closeBtn,
        el("div", "shop-art", el("div", "shop-burst"), icon, el("div", "shop-ring")),
        el(
          "div",
          "shop-info",
          el("div", "shop-kind", v.kind),
          el("h2", "shop-title", v.name),
          el("p", "shop-tagline", `“${v.tagline}”`),
          el("ul", "shop-perks", ...v.pros.map((p) => el("li", null, p))),
          el("div", "shop-price", none ? "Price: free. Sunlight included." : "Included with a World of Warcraft subscription"),
          el("div", "shop-buttons", ...buttons),
        ),
      ),
    );
    layer.hidden = false;
    window.playUiSound?.("open");
  }

  return { open, close, isOpen: () => !layer.hidden };
}
