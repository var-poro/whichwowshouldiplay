// Réglages du menu Options, gardés dans le navigateur d'une visite à l'autre.

const KEY = "which-wow-settings";

export const DEFAULTS = {
  sound: true,
  music: true,
  ambience: true,
  effects: true,
  master: 0.8,
  musicVolume: 0.5,
  ambienceVolume: 0.7,
  effectsVolume: 0.8,
  questText: true, // texte de quête écrit lettre à lettre
  shadows: true,
  renderScale: 1,
  viewDistance: 430,
};

let current = { ...DEFAULTS };
try {
  current = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
} catch {
  // réglages illisibles : on repart des valeurs par défaut
}

const listeners = new Set();

export const settings = {
  get: () => current,
  set(patch) {
    current = { ...current, ...patch };
    localStorage.setItem(KEY, JSON.stringify(current));
    for (const fn of listeners) fn(current);
  },
  reset(keys) {
    const patch = {};
    for (const k of keys) patch[k] = DEFAULTS[k];
    settings.set(patch);
  },
  onChange(fn) {
    listeners.add(fn);
    fn(current);
    return () => listeners.delete(fn);
  },
  // Comme onChange, mais s'arrête tout seul quand l'élément quitte la page.
  bind(node, fn) {
    let off = null;
    let seen = false;
    off = settings.onChange((s) => {
      if (node.isConnected) seen = true;
      else if (seen) return off?.();
      fn(s);
    });
  },
};

// Volume effectif d'un canal (0 à 1), en tenant compte des cases à cocher.
export function channelVolume(s, channel) {
  if (!s.sound || !s[channel]) return 0;
  return s.master * s[`${channel}Volume`];
}
