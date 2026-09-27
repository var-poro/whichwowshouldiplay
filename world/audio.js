// Ambiance sonore : musique de Tanaris (« zone-desert day » de Classic et le thème de Cataclysm),
// l'ambiance des Voies du temps (boucle « 10.1.5amb-dungeon-doti-timeways-zonetone »
// du jeu, exportée par Poro), pas dans le sable.
// Trois canaux réglables dans les Options : musique, ambiance, effets.
// Tout démarre au clic sur « Enter World » : avant, le navigateur refuse le son.

import { channelVolume, settings } from "./settings.js?v=2";

const MUSIC = ["desert_day_53432", "desert_day_53433", "desert_day_53434", "mus_tanaris_gu01"];
const STEPS = [1, 2, 3, 4, 5, 6, 7, 8].map((k) => `step_sand_${k}`);
const url = (n) => `assets/sounds/${n}.mp3`;

export function createAudio() {
  let ctx = null;
  let ambience = null;
  let effects = null;
  let music = null;
  let musicPending = null;
  let track = Math.floor(Math.random() * MUSIC.length);
  const stepBuffers = [];

  // Les sons de la fenêtre de quête (app.js) lisent ce volume global.
  const apply = (s) => {
    window.SFX_GAIN = channelVolume(s, "effects");
    if (ambience) ambience.gain.value = channelVolume(s, "ambience");
    if (effects) effects.gain.value = channelVolume(s, "effects");
    if (music) music.volume = channelVolume(s, "music") * 0.7;
    // musique coupée : on arrête la piste, et le morceau suivant prévu après
    // le silence entre deux pistes (sinon elle revient toute seule) ;
    // rallumée : elle repart
    if (ctx && channelVolume(s, "music") > 0 && !music && !musicPending) startMusic();
    if (channelVolume(s, "music") === 0) {
      clearTimeout(musicPending);
      musicPending = null;
      music?.pause();
      music = null;
    }
  };

  async function start() {
    ctx = new AudioContext();
    ambience = ctx.createGain();
    ambience.connect(ctx.destination);
    effects = ctx.createGain();
    effects.connect(ctx.destination);
    startZoneTone();
    for (const n of STEPS) {
      fetch(url(n))
        .then((r) => r.arrayBuffer())
        .then((b) => ctx.decodeAudioData(b))
        .then((buf) => stepBuffers.push(buf))
        .catch(() => {});
    }
    settings.onChange(apply);
  }

  function startMusic() {
    musicPending = null;
    if (channelVolume(settings.get(), "music") === 0) return;
    const el = new Audio(url(MUSIC[track]));
    music = el;
    el.volume = channelVolume(settings.get(), "music") * 0.7;
    el.onended = () => {
      if (music !== el) return;
      music = null;
      // comme en jeu : un silence entre deux morceaux
      track = (track + 1) % MUSIC.length;
      musicPending = setTimeout(startMusic, 20000 + Math.random() * 25000);
    };
    el.play().catch(() => {});
  }

  // Ambiance de la zone : la boucle du jeu, jouée sans fin sur le canal « ambiance ».
  function startZoneTone() {
    fetch(url("amb_timeways_zonetone"))
      .then((r) => r.arrayBuffer())
      .then((b) => ctx.decodeAudioData(b))
      .then((buf) => {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        const gain = ctx.createGain();
        gain.gain.value = 0.8;
        src.connect(gain).connect(ambience);
        src.start();
      })
      .catch(() => {});
  }

  return {
    start,
    step(volume = 0.35) {
      if (!ctx || !stepBuffers.length) return;
      const src = ctx.createBufferSource();
      src.buffer = stepBuffers[Math.floor(Math.random() * stepBuffers.length)];
      src.playbackRate.value = 0.92 + Math.random() * 0.16;
      const g = ctx.createGain();
      g.gain.value = volume;
      src.connect(g).connect(effects);
      src.start();
    },
  };
}
