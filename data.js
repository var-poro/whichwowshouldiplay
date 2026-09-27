// Les versions possibles et les questions du quiz.
// Chaque réponse donne des points à une ou plusieurs versions ; `because` est
// la phrase affichée dans le résultat si cette réponse a pesé pour le gagnant.
// À vérifier à chaque nouvelle saison : quelle version Classic est en cours.
// `quips` (versions, curseurs, icônes) : répliques de Chromie, sans effet
// sur le score.

const VERSIONS = {
  retail: {
    icon: "achievement_zone_eversongwoods",
    name: "Retail — Midnight",
    kind: "Current expansion",
    tagline: "Modern WoW, always moving.",
    description:
      "The current expansion: Mythic+ (timed dungeons), raids at every difficulty, Delves for solo players, Skyriding, player housing and a new patch every few months. The most content, the most systems, the most players.",
    pros: ["Huge amount of content for every playstyle", "Play solo or in groups, on your schedule", "Best graphics, UI and quality of life"],
    cons: ["Lots of systems to learn when you come back", "Gear and meta reset every season"],
    quips: [
      "The present. It patches itself while you sleep.",
      "Bring a notebook. There are seventeen currencies.",
      "You'll hit max level before your tea gets cold.",
      "Skyriding: because walking is so 2004.",
    ],
  },
  mop: {
    icon: "achievement_zone_valeofeternalblossoms",
    name: "Mists of Pandaria Classic",
    kind: "Classic progression",
    tagline: "Pandaria, the whole of it.",
    description:
      "The Classic progression line, now in its final phase: Siege of Orgrimmar and the Timeless Isle are open, with challenge modes, pet battles, a talent choice every 15 levels and the legendary cloak quest. Much smoother than vanilla, without modern WoW's pile of systems.",
    pros: ["Many consider it the peak of class design", "Challenge modes and scenarios for small groups", "The whole expansion is open: nothing to wait for"],
    cons: ["Pandaria's vibe is not for everyone", "Final phase: what comes next hasn't been announced"],
    quips: [
      "Pandaria awaits. Bring snacks. The pandaren will.",
      "The Tillers need their crops watered. Daily. Forever.",
      "Pick a talent every 15 levels. Choose wisely.",
      "Pet battles, kung fu, a legendary cloak. Lovely.",
    ],
  },
  anniversary: {
    icon: "inv_misc_celebrationcake_01",
    name: "Classic Anniversary realms",
    kind: "Classic progression",
    tagline: "The 2024 realms, now in Outland.",
    description:
      "Realms that opened in November 2024 at vanilla and have since moved on to The Burning Crusade: Outland, flying mounts at 70, arenas, Black Temple and Mount Hyjal. Established guilds, a settled economy and groups already running. What comes after TBC hasn't been announced.",
    pros: ["The Burning Crusade, as many remember it", "Settled realms: guilds, groups and an economy already running", "Arenas and 25-player raids"],
    cons: ["Not a fresh start anymore: you join a world in progress", "The road after TBC is unannounced"],
    quips: [
      "Outland awaits. Mind the fel reavers. They're quieter than you think.",
      "Flying mounts at 70. Walking is so 2004.",
      "Illidan is expecting you. You are not prepared.",
      "The Dark Portal is open. Please keep your arms inside the portal.",
    ],
  },
  era: {
    icon: "inv_misc_head_dragon_01",
    name: "Classic Era",
    kind: "Vanilla, forever",
    tagline: "Vanilla, frozen in amber.",
    description:
      "Level 60, Molten Core to Naxxramas, forty-player raids, and that's it: no new content, ever, just the odd comfort like dual specialization. Smaller, veteran population, no pressure, no seasons. Vanilla the way you remember it, at your own pace.",
    pros: ["Nothing ever resets: your character is permanent", "Calm, knowledgeable community", "The original game, only a few comforts added"],
    cons: ["Smaller population, some quiet hours", "No new content, ever"],
    quips: [
      "Nothing changes here. That's the whole point.",
      "Molten Core, every week, forever. Pack fire resistance.",
      "The timeline I visit when I need a nap.",
      "You no take candle. You take your time.",
    ],
  },
  forever: {
    icon: "inv_scroll_03",
    name: "WoW Forever",
    kind: "Classic+",
    tagline: "The old world, with new pages.",
    description:
      "The \"Classic+\" everyone asked for, out on November 4, 2026: vanilla's look and pace, frozen at level 60, but with its own new story. Over a thousand new quests, new zones like Mount Hyjal, new dungeons, raids for 10 and 20 players, a new Skyborne race, account-wide collections, and it keeps growing without ever turning into The Burning Crusade.",
    pros: ["Vanilla's pace, with things you've never seen", "Brand new: everyone starts together", "Grows for years instead of resetting"],
    cons: ["Brand new: balance and content will shift", "Still vanilla-slow: walking, mana breaks, corpse runs"],
    quips: [
      "Old roads, new signposts. I approve.",
      "A timeline even I haven't read yet. Thrilling.",
      "Mount Hyjal at level 60? Don't tell Archimonde.",
      "Classic, plus. The plus is doing a lot of work.",
    ],
  },
  hardcore: {
    icon: "inv_misc_bone_humanskull_01",
    name: "Classic Hardcore",
    kind: "One life",
    tagline: "One life. Make it count.",
    description:
      "One rule: if you die, your character is dead for good. Hardcore realms exist on Classic Era and, from launch, on WoW Forever. Every pull matters, every Defias Pillager is a threat, and hitting 60 is an achievement people actually respect.",
    pros: ["The most adrenaline WoW has ever produced", "Every level-up feels earned", "Great stories to tell"],
    cons: ["You WILL lose a character to a disconnect", "Hard to play casually or while tired"],
    quips: [
      "Please don't die. I mean it. Permanently.",
      "Every Defias Pillager is a raid boss now.",
      "Leeroy would last about four seconds here.",
      "Never let your hearthstone out of your sight.",
    ],
  },
  none: {
    icon: "inv_misc_rune_01",
    name: "None. Don't.",
    kind: "Real life",
    tagline: "The winning move is not to play.",
    description:
      "Honestly? Based on your answers, a subscription MMO would cost you more than it gives. Your time is short, friction annoys you, and nobody's waiting for you in Stormwind. Play something that respects a 30-minute session, and come back when that changes.",
    pros: ["Saves you a subscription", "Your evenings stay yours"],
    cons: ["You will miss Barrens chat"],
    quips: [
      "Azeroth will still be here. I checked.",
      "The rarest ending. Most timelines lack it.",
      "Go touch grass. Peacebloom counts.",
      "Is this the real life? Apparently, yes.",
    ],
  },
};

// Temps de jeu hebdomadaire (jours × durée d'une session) → points.
const TIME_BUCKETS = [
  { upTo: 3, pts: { none: 3, retail: 1, era: 1 }, because: "You have about {hours} a week, and an MMO eats more than that." },
  { upTo: 10, pts: { retail: 3, era: 2, mop: 1 }, because: "You have about {hours} a week, and this game doesn't punish breaks." },
  { upTo: 20, pts: { mop: 2, anniversary: 2, retail: 2, forever: 1, hardcore: 1 } },
  { upTo: Infinity, pts: { anniversary: 3, hardcore: 3, forever: 2, mop: 1 }, because: "You have about {hours} a week, and a slow, demanding game needs exactly that." },
];

// Verdict de Chromie sous l'horaire, sans effet sur le score : la première
// règle qui s'applique gagne, des cas les plus précis aux plus généraux.
// n = nombre de jours, h = heures par session, w = heures par semaine,
// only = exactement ces jours (0 = lundi).
const SCHEDULE_QUIPS = [
  [({ n }) => n === 0, "Zero days. Are you sure you want an MMO?"],
  [({ n, h }) => n === 7 && h === 24, "Every hour of every day. Even I need naps."],
  [({ h }) => h === 24, "24 hours? Even Onyxia takes breaths."],
  [({ h }) => h >= 18, "Log off? Never heard of it."],
  [({ h }) => h >= 12, "Twelve hours in. \"Is this the real life?\""],
  [({ w }) => w >= 70, "Impressive. Also a little worrying."],
  [({ n, h }) => n === 7 && h >= 8, "Eight hours a day, every day. Does it pay?"],
  [({ w }) => w >= 55, "Do you... sleep?"],
  [({ w }) => w >= 40, "A full-time job. In Azeroth."],
  [({ n, h }) => n === 7 && h === 0.5, "Half an hour daily. Login bonus energy."],
  [({ h }) => h === 0.5, "Just enough to hearth and log off."],
  [({ n, h }) => n === 1 && h === 1, "One hour a week. Barely a boat ride."],
  [({ only, h }) => only(5, 6) && h >= 6, "Weekend marathon. Monday will hurt."],
  [({ only }) => only(5, 6), "Weekend warrior. Weekdays are recovery."],
  [({ only, h }) => only(0, 1, 2, 3, 4) && h <= 1.5, "A quick session after work. Very sensible."],
  [({ only }) => only(0, 1, 2, 3, 4), "Weekdays only. Weekends are for life."],
  [({ n, h }) => n === 7 && h <= 1.5, "A little every day. The dailies love you."],
  [({ n }) => n === 7, "Daily. The innkeeper knows your name."],
  [({ only, h }) => only(4) && h >= 3, "Friday night raid. A classic."],
  [({ only }) => only(0), "Mondays only? Brave. Most avoid Mondays."],
  [({ n, h }) => n === 1 && h >= 3, "One long night a week. Raid night, surely."],
  [({ w }) => w < 3, "Casual. Very casual."],
  [({ n }) => n === 6, "Six days. The seventh is for repair bills."],
  [({ w }) => w >= 30, "A part-time job, with worse pay."],
  [({ h }) => h >= 8, "Eight hours. Bring snacks. Many snacks."],
  [({ h }) => h >= 6, "Long nights. The raid leader loves you."],
  [({ h }) => h === 1, "One hour: one dungeon, if the tank stays."],
  [({ w }) => w < 5, "A light snack of Azeroth."],
  [({ w }) => w < 10, "A healthy adventurer."],
  [({ w }) => w < 15, "A regular. The guild bank knows you."],
  [({ w }) => w < 20, "Dedicated."],
  [() => true, "Your guild officer approves. Your family doesn't."],
];

// Types de question :
// - choice : liste de réponses (dialogue de PNJ)
// - slider : cinq crans entre deux pôles ; `stops` répartis de gauche à droite,
//   les points sont interpolés entre les deux plus proches ; `quips` : une
//   réplique par cran
// - multi  : choisir jusqu'à `max` icônes ; points moyennés
// - schedule : jours de la semaine + cadran pour la durée d'une session
// `skippable: false` retire la réplique « I'm not sure ».
// `react` (sur une réponse) : l'aparté de Chromie à l'écran suivant.
// Ordre = celui du lien de partage et de la sauvegarde : le changer demande
// de monter SAVE_VERSION (app.js).
const QUESTIONS = [
  {
    type: "schedule",
    q: "When do you play?",
    hint: "Pick the days you can play, then turn the clock to set a typical session.",
    skippable: false,
  },
  {
    type: "choice",
    q: "How well do you know MMOs?",
    options: [
      {
        text: "Not at all, I'm brand new",
        pts: { retail: 3, none: 1 },
        because: "You're new to MMOs, and modern WoW has the best onboarding and the most players around you.",
        react: "A fresh face! Everyone was new once. Even me. Especially me.",
      },
      { text: "I've played some, a while ago", pts: { anniversary: 1, era: 1, mop: 1, retail: 1 } },
      {
        text: "A veteran: I know the genre inside out",
        pts: { hardcore: 2, era: 1, mop: 1, forever: 1 },
        react: "A veteran. You've seen things. Murloc things.",
      },
    ],
  },
  {
    type: "choice",
    q: "Do you have people to play WoW with?",
    options: [
      {
        text: "Yes, on modern WoW",
        pts: { retail: 4 },
        because: "Your friends are on modern WoW, and friends beat any version.",
        react: "Friends in the present. The present is lucky to have you.",
      },
      { text: "Yes, on a Classic version", pts: { anniversary: 1, era: 1, mop: 1, hardcore: 1 }, because: "Your friends play Classic: ask them which realm and join them." },
      {
        text: "No, I'd need to find people",
        pts: { forever: 3, none: 1 },
        because: "You'd need to find people, and a brand-new launch is the best place to meet them.",
      },
      { text: "No, I play alone anyway", pts: { retail: 1, era: 1 }, react: "A lone wolf. Or a lone gnome. No judgment." },
    ],
  },
  {
    type: "slider",
    q: "How often do you want to be rewarded?",
    stops: [
      { label: "Something new every session", pts: { retail: 3, mop: 1 }, because: "You want something new every session, and modern WoW hands out rewards generously." },
      { label: "Goals I can plan over a few weeks", pts: { mop: 2, retail: 2, forever: 1, anniversary: 1 }, because: "You like goals you can plan, and a structured progression gives you exactly that." },
      { label: "Rarely, but it has to mean something", pts: { era: 3, anniversary: 2, hardcore: 2, forever: 1 }, because: "You want rewards to be rare and earned, and the old-school game makes you work for every one." },
    ],
    quips: [
      "Loot the moment I log in. Ideally before",
      "A shiny thing every evening keeps boredom away",
      "A weekly chest and a plan, like a grown-up",
      "A month of work for one mount sounds fair",
      "Six months of farming for one mount? Finally, a hobby",
    ],
  },
  {
    type: "choice",
    q: "What should happen when you fail?",
    options: [
      { text: "A quick retry, no big deal", pts: { retail: 2, mop: 1 } },
      {
        text: "It should cost me: lost time, a long walk back",
        pts: { era: 2, forever: 2, anniversary: 1, hardcore: 1 },
        because: "You want failure to cost something, and old-school design makes sure it does.",
      },
      {
        text: "I lose my character. That's what makes it exciting",
        pts: { hardcore: 5 },
        because: "You want death to be final, and only one version does that.",
        react: "One life. Bold. I'll keep a candle lit.",
      },
      {
        text: "Honestly, I'd rather not fail at all",
        pts: { none: 3, retail: 1 },
        because: "You don't enjoy friction, and MMOs are full of it.",
        react: "Understandable. Failure is overrated. So is lava.",
      },
    ],
  },
  {
    type: "choice",
    q: "What kind of challenge do you enjoy most?",
    options: [
      {
        text: "Short and intense: a perfect dungeon run against the clock",
        pts: { retail: 4, mop: 3 },
        because: "You like short, timed dungeon runs, and challenge modes and Mythic+ are built around them.",
      },
      { text: "Learning a hard boss over weeks with a small, tight group", pts: { mop: 3, retail: 2 }, because: "You like mastering hard fights with a tight group." },
      {
        text: "Huge raids with dozens of players, where logistics are half the fight",
        pts: { era: 3, anniversary: 1, forever: 1, mop: 1 },
        because: "You like big, messy group events, and forty-player raids are the biggest there are.",
        react: "Forty people, one pull timer. What could go wrong? Don't answer that, Leeroy.",
      },
    ],
  },
  {
    type: "choice",
    q: "How would you rather meet other players?",
    options: [
      { text: "I'd rather not need them: mostly solo", pts: { retail: 3, hardcore: 1, none: 1 }, because: "You want to play solo, and modern WoW has real solo content." },
      { text: "Press a button, get a group", pts: { retail: 3 }, because: "You want a group at the press of a button, and that's modern WoW." },
      {
        text: "Through chat, on a server where people know my name",
        pts: { forever: 3, anniversary: 2, era: 2, hardcore: 2 },
        because: "You want a server where reputation matters and people know each other.",
      },
      {
        text: "On a brand-new server where everyone starts together",
        pts: { forever: 4, hardcore: 1 },
        because: "You want to start on day one with everyone else, and WoW Forever opens on November 4.",
        react: "Day one, everyone at level 1. The Northshire wolves are already nervous.",
      },
      { text: "Only through my friends or guild", pts: { mop: 1, retail: 1, anniversary: 1 } },
    ],
  },
  {
    type: "choice",
    q: "How do you feel about fighting other players?",
    options: [
      { text: "I want it ranked and balanced: arenas, ladders", pts: { retail: 3, mop: 2, anniversary: 1 }, because: "You want competitive, balanced PvP." },
      { text: "Now and then, in big casual battles", pts: { retail: 1, mop: 1, anniversary: 1, era: 1, forever: 1 } },
      {
        text: "I like getting ambushed while I quest. Unfair, and fun",
        pts: { forever: 3, anniversary: 2, era: 1 },
        because: "You enjoy open-world chaos, and busy old-school servers have plenty of it.",
        react: "You enjoy being ganked? Every rogue in Stranglethorn just felt a disturbance.",
      },
      { text: "Never. Leave me alone", pts: { retail: 1, era: 1, hardcore: 1 }, react: "Noted. I'll ask the rogues to respect it. They won't." },
    ],
  },
  {
    type: "choice",
    q: "Which Azeroth calls to you?",
    options: [
      {
        text: "The original one, exactly as it was",
        pts: { era: 4, hardcore: 2, anniversary: 1 },
        because: "You want the original Azeroth, exactly as it was.",
        react: "The original. Bring a notebook: nobody will tell you where to go.",
      },
      {
        text: "The old style, but with places and stories I've never seen",
        pts: { forever: 5 },
        because: "You want the old style with places you've never seen, and that's exactly what WoW Forever is.",
        react: "Something old, something new. I do love a good paradox.",
      },
      {
        text: "Outland and the adventures that came after",
        pts: { anniversary: 4, mop: 1 },
        because: "You want the expansions that followed, and the Anniversary realms are in Outland right now.",
      },
      { text: "Pandaria, mists and all", pts: { mop: 5 }, because: "Pandaria calls to you, and MoP Classic has all of it open.", react: "Pandaria! Bring an appetite and a sense of humor." },
      { text: "Today's Azeroth, with the latest story", pts: { retail: 4 }, because: "You want the latest story, and only modern WoW has it." },
    ],
  },
  {
    type: "slider",
    q: "How full should your action bars be?",
    stops: [
      { label: "A small toolkit I can master", pts: { era: 2, hardcore: 2, anniversary: 2, forever: 1 }, because: "You like a small toolkit you can master." },
      { label: "A few meaningful choices", pts: { mop: 2, retail: 1 }, because: "You like a few meaningful choices, which is exactly how Pandaria's talents work." },
      { label: "Many systems and builds to optimize", pts: { retail: 3, mop: 1 }, because: "You like complex systems to optimize." },
    ],
    quips: [
      "Six buttons. I know each one by heart",
      "One bar, and every button matters",
      "Two bars and a talent choice every few levels",
      "Three bars and a build to tweak on a slow evening",
      "Every bar full, plus a spreadsheet for my spreadsheets",
    ],
  },
  {
    type: "multi",
    q: "Besides fighting, what do you enjoy?",
    hint: "Pick up to two.",
    max: 2,
    items: [
      { id: "collect", label: "Collecting", icon: "inv_misc_treasurechest01b", pts: { retail: 3, mop: 1, forever: 1 }, because: "You love collecting, and collections are at their richest on modern WoW." },
      { id: "housing", label: "Decorating a home", icon: "achievement_garrison_tier01_alliance", pts: { retail: 4 }, because: "You want a home to decorate, and player housing only exists on modern WoW." },
      { id: "trade", label: "Trading", icon: "inv_misc_coin_02", pts: { anniversary: 2, era: 2, mop: 1 }, because: "You like trading, and old-school economies really matter." },
      { id: "pets", label: "Pet battles", icon: "inv_pet_achievement_pandaria", pts: { mop: 3, retail: 2 }, because: "You like pet battles, which arrived with Pandaria." },
      { id: "explore", label: "Exploring", icon: "inv_misc_spyglass_03", pts: { forever: 3, era: 1, anniversary: 1, hardcore: 1, retail: 1 }, because: "You love exploring, and WoW Forever has whole new zones to discover." },
      { id: "fight", label: "Nothing, fighting is the game", icon: "inv_sword_04", pts: { hardcore: 1, mop: 1, retail: 1 } },
    ],
    // réaction au choix : rien, une icône, ou une paire (ids dans l'ordre de `items`)
    quips: {
      "": "Pick one. Even warriors have hobbies.",
      collect: "A collector. Your bank alts are already full.",
      housing: "Curtains before raiding. Fine priorities.",
      trade: "A goblin at heart. Time is money, friend.",
      pets: "You'll catch them all. Legally distinct.",
      explore: "An explorer. Mind the murlocs.",
      fight: "A purist. Or a warrior. Same thing.",
      "collect+housing": "Collecting things to display at home.",
      "collect+trade": "Buy low, collect high. Goblin approved.",
      "collect+pets": "Pets AND collections. Poor bank alts.",
      "collect+explore": "Every rare spawn, camped for days.",
      "collect+fight": "\"Only fighting\"... and collecting?",
      "housing+trade": "A house paid for by the Auction House.",
      "housing+pets": "A cozy home full of battle pets.",
      "housing+explore": "Travel far, bring souvenirs home.",
      "housing+fight": "\"Only fighting\"... and interior design. Sure.",
      "trade+pets": "Selling pets on the AH. A small empire.",
      "trade+explore": "Exploring for cheap herbs to resell. Sneaky.",
      "trade+fight": "\"Only fighting\", says the goblin.",
      "pets+explore": "Roaming the world to catch pets. Cute.",
      "pets+fight": "\"Only fighting.\" Pet fights count.",
      "explore+fight": "\"Only fighting\", plus sightseeing.",
    },
  },
  {
    type: "slider",
    q: "How should getting around feel?",
    stops: [
      { label: "Fast travel, flying everywhere", pts: { retail: 3, mop: 2 }, because: "You want to get to the fun fast, and flying gets you there." },
      { label: "Huge and dangerous: every trip is an adventure", pts: { era: 2, hardcore: 2, forever: 2, anniversary: 1 }, because: "You want a world that feels big because it's slow." },
    ],
    quips: [
      "Teleport me to the boss. Skip the cutscene too",
      "Flying, please. Walking is for level 1",
      "A flight path to every town will do",
      "A mount at level 40? Earning it is half the fun",
      "Corpse run across the Barrens, uphill both ways",
    ],
  },
];

// Contradictions relevées par Chromie, au moment où l'on donne la seconde
// réponse. A(i) : réponse à la question i ; w : heures par semaine.
const CONTRADICTIONS = [
  { about: [1, 4], when: (A) => A(1) === 0 && A(4) === 2, line: "Brand new, and one life only? Brave. Deeply, beautifully brave." },
  { about: [0, 4], when: (A, w) => w < 3 && A(4) === 2, line: "Under three hours a week, with one life. That's one very careful level 12." },
  { about: [5, 6], when: (A) => A(5) === 2 && A(6) === 0, line: "Mostly solo, but forty-player raids? Thirty-nine of them will be strangers." },
  { about: [2, 6], when: (A) => A(2) === 3 && A(6) === 4, line: "You play alone, but only with your guild. A guild of one, I take it." },
  { about: [3, 8], when: (A) => A(3) <= 0.25 && A(8) === 0, line: "Loot every session, in the original game? The 2004 drop rates would like a word." },
  { about: [4, 7], when: (A) => A(4) === 3 && A(7) === 2, line: "You'd rather not fail, but you enjoy being ambushed. Complicated. I like it." },
  { about: [8, 11], when: (A) => A(8) === 0 && A(11) <= 0.25, line: "The original Azeroth, but flying everywhere? No flying before Outland, I'm afraid." },
];

// Répliques de Chromie autour du quiz, sans effet sur le score.
// Les paliers [n, texte] valent « à partir de n » ; un tableau de textes
// fait varier la réplique à l'intérieur du palier.
const CHROMIE = {
  // premier paragraphe de l'accueil, tiré au hasard
  greetings: [
    "Ah, there you are! Chromie, bronze dragonflight, at your service. Time has gotten... crowded. There are now several Azeroths ticking side by side: the ever-changing present, the old timelines of Classic, a brand-new old one called Forever, and one where death is rather permanent.",
    "Oh! You're early. Or late. With time travel it's hard to say. Chromie, bronze dragonflight. Several Azeroths now run side by side, and one of them has your name on it.",
    "Welcome, adventurer! Mind the paradox on the floor, I just mopped it. I'm Chromie, and the timelines have multiplied: the present, the Classic ones, Forever, and one where you only die once.",
    "Ah, a visitor! I was just having a snack from 2004. Still crunchy. Chromie, bronze dragonflight. So many Azeroths, so little you: let's find the right one.",
    "Hello again! Or for the first time. I lose track. Chromie, bronze dragonflight. The present, the old Classic timelines, the one-life one... they all want you, and they're getting pushy.",
  ],
  // retour depuis la question 1
  back: [
    "Back already? Time travel is my job, you know. Take a breath, then try again.",
    "Rewinding, are we? I approve. Just don't bump into yourself on the way.",
  ],
  // croix du cadre
  abandoned: [
    "Quest abandoned. Your log is lighter already. The offer stands, of course.",
    "You closed the window on a bronze dragon. Bold. Let's pretend that never happened.",
    "Abandoned? No matter. In another timeline, you finished it. Shall we catch up?",
  ],
  declines: [
    [1, "Declined? Fine. Time is patient, adventurer. I, however, am a dragon with a schedule. Come back when you're ready."],
    [2, "Declined again. I've seen this timeline. In it, you click Accept eventually."],
    [3, "Third time. The button on the left works too, you know."],
    [4, "Curious. Every time you decline, I'm still here. That's not how quests work."],
    [5, "Five declines. Even Leeroy read the quest before running in."],
    [6, "I once waited for Anachronos to finish a sentence. I can wait for you."],
    [7, "Seven. Are you farming these? There's no drop. Yet."],
    [8, "I'm having a snack now. Take your time. *crunch*"],
    [9, "You're one decline away from a very small achievement."],
    [10, "Achievement earned: [Chronically Reluctant]. No reward. Accept is still there."],
    [11, "Past ten, I stop counting. I'm lying. Eleven."],
    [12, "The Infinite Dragonflight would be proud. I am not."],
    [15, "You'd make a fine raid leader: nobody ever gets to pull."],
    [20, "Twenty. Declining IS your playstyle now. There's a timeline for that."],
    [30, "I checked every timeline. In all of them, you're still clicking Decline."],
    [50, "Fifty. Fine, you win. There's no prize. There was never a prize."],
  ],
  // libellé du bouton, selon le nombre de refus déjà faits
  declineButton: [
    [0, "Decline"],
    [2, "Still no"],
    [5, "Nope"],
    [10, "Never!"],
    [20, "Decline?"],
  ],
  // sous la question, selon le nombre de « Not sure » déjà donnés
  skips: [
    [1, ["One \"Not sure\". Noted. Not judged. Much."]],
    [2, ["Two shrugs. The timeline is getting blurry."]],
    [3, ["Another shrug. Filed under \"mysterious\".", "Are you AFK? Blink twice if you're AFK."]],
    [5, ["Half skipped. This is how corpse runs start.", "I'd read your future, but you keep hiding it.", "Even murlocs answer more. Mrgl mrgl."]],
    [8, ["At this point I'm answering for you.", "Skipped like a cinematic seen twice.", "Need before greed. Answer before skip?"]],
  ],
  // dans le résultat, même logique ; `all` si tout ce qui pouvait l'être a été passé
  skipsResult: [
    [0, "Not a single shrug. A model adventurer."],
    [1, "One question skipped. The verdict barely noticed."],
    [2, "Two skips. The verdict stands, slightly wobbly."],
    [3, "A few skips: this verdict comes with a paradox warranty."],
    [5, "Many skips. I filled the gaps with guesses and a snack."],
    [8, "Mostly skipped. This verdict is 40% science, 60% vibes."],
  ],
  skipsAll: "You skipped everything but the clock. This verdict is based on your calendar.",
  // écart entre le gagnant et le suivant, en points de pourcentage
  margins: [
    [0, "A dead heat. I had to flip a bronze coin."],
    [1, "Photo finish, with {runner} a nose behind."],
    [4, "A narrow win. {runner} came a close second."],
    [9, "A clear winner. The others will sulk politely."],
    [16, "Comfortable margin. Nobody saw it coming. Except me."],
    [26, "A landslide. The other timelines didn't even show up."],
  ],
  // cas particuliers, avant l'écart
  overruled: "The numbers said otherwise. I overruled them. Don't ask.",
  lukewarm: "No timeline loves you. This one tolerates you best.",
  soulmate: "Exalted, and not close. This timeline was made for you.",
  // au survol d'une barre de réputation
  standings: {
    Hated: "Would rather wipe than group with you.",
    Hostile: "Guards attack on sight.",
    Unfriendly: "Won't even sell you a repair.",
    Neutral: "Barely noticed you walk in.",
    Friendly: "Waves at you in town.",
    Honored: "Offers you a tabard and a discount.",
    Revered: "Named a quest after you. Probably.",
    Exalted: "Soulmates. Go get the mount.",
  },
  // bouton « Copy link », clic après clic
  copied: ["Copied", "Copied again", "Still copied", "Very copied", "Enough."],
  close: "Abandon quest",
  // avant le verdict, une ligne après l'autre
  drumroll: ["Consulting the timeways...", "Not that one...", "Definitely not that one...", "Ah."],
};

// Chaîne de quêtes de Chromie. `questions` : indices dans QUESTIONS, dans
// l'ordre où on les pose. Le profil (A Hero's Measure) reste acquis d'une visite à l'autre ;
// les trois quêtes du milieu se font dans n'importe quel ordre ; le verdict
// demande les quatre autres.
const QUESTS = [
  {
    id: "profile",
    title: "A Hero's Measure",
    requires: [],
    questions: [1, 0, 2],
    text: "Before I send anyone anywhere in time, I need to know who I'm dealing with. How much time do you actually have? Have you done this sort of thing before? And who, if anyone, is waiting for you on the other side?",
    objective: "Tell Chromie about your schedule, your experience and your friends.",
    complete: "Splendid. I've written it all down. Well, I will have written it down. Tenses, you know. You won't have to tell me again, unless you want to.",
    xp: 450,
    reward: { icon: "inv_misc_pocketwatch_01", name: "Chromie's Pocket Watch", quality: "uncommon" },
  },
  {
    id: "taste",
    title: "Matters of Taste",
    requires: ["profile"],
    questions: [3, 4, 5],
    text: "Every hero likes their adventure seasoned differently. Some want rewards raining from the sky, some want to earn every copper the hard way, and some want to lose everything the moment they blink. Which one are you?",
    objective: "Tell Chromie how you like progress, failure and challenge.",
    complete: "Ah, a connoisseur. I'll pour you something from the right vintage.",
    xp: 600,
    reward: { icon: "inv_misc_food_60", name: "Timeless Tasting Menu", quality: "uncommon" },
  },
  {
    id: "company",
    title: "The Company You Keep",
    requires: ["profile"],
    questions: [6, 7],
    text: "Azeroth is a crowded place. Crowded with heroes, gankers, guild drama and people shouting in trade chat. How do you feel about all of them?",
    objective: "Tell Chromie how you find people to play with, and whether you'd rather fight them.",
    complete: "Noted. I'll seat you far from the gnome who keeps linking his mount in chat. Or right next to him.",
    xp: 600,
    reward: { icon: "achievement_guildperk_everybodysfriend", name: "Guild Charter (Unsigned)", quality: "uncommon" },
  },
  {
    id: "worlds",
    title: "Shape of Worlds",
    requires: ["profile"],
    questions: [8, 9, 10, 11],
    text: "Every timeline has its own shape. Some are the Azeroth you remember, some have never been seen before. Some let you fly everywhere, others make you walk to Blackrock Mountain uphill both ways. Describe your perfect world.",
    objective: "Tell Chromie which Azeroth calls to you, and how it should play and feel.",
    complete: "What a lovely world you described. Several of them exist. One of them is waiting for you.",
    xp: 800,
    reward: { icon: "inv_misc_map_01", name: "Map of Every Azeroth", quality: "rare" },
  },
  {
    id: "verdict",
    title: "The Timeways Beckon",
    requires: ["taste", "company", "worlds"],
    questions: [],
    final: true,
    text: "I have everything I need. Your schedule, your tastes, your company, your perfect world. Now for the fun part: which timeline is truly yours?",
    objective: "Hear Chromie's verdict.",
    xp: 1200,
  },
];

// Chromie quand on lui parle (fenêtre de dialogue avec la liste des quêtes).
const CHROMIE_GOSSIP = {
  first: "Ah, there you are! Chromie, bronze dragonflight, at your service. Time has gotten crowded: several Azeroths now tick side by side. I can tell you which one is yours, but first, a few questions.",
  returning: "Welcome back! Still the one with {hours} a week? Don't answer, I already know. I always already know.",
  busy: "Pick a question, any question. They're all mine anyway.",
  done: "You have your verdict. The portal is right there. Unless you'd like to change your answers... I won't tell anyone. Except the timeline.",
  redoProfile: "I'd like to tell you about myself again.",
  showVerdict: "Remind me of my verdict.",
  retake: "I've changed. Ask me everything again.",
};
