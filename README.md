# Which WoW should I play?

Quiz privé façon World of Warcraft : on arrive sur les Voies du temps (le
carrefour flottant de l'Aube de l'Infini), on va parler à Chromie, et sa chaîne
de quêtes dit quelle version de WoW jouer. Les portails des sept versions
attendent au bout des bras du plateau.

## Lancer

Le monde 3D utilise des modules JavaScript : il faut un petit serveur local
(ouvrir le fichier directement ne marche pas). Celui-ci désactive le cache,
pour que chaque rechargement prenne la dernière version des fichiers.

En ligne : https://var-poro.github.io/whichwowshouldiplay/ (GitHub Pages,
publié à chaque push sur `main`).

En local :

```bash
cd ~/which-wow && python3 tools/serve.py 8781
```

Puis http://localhost:8781 (le monde) ou http://localhost:8781/quiz.html
(le quiz seul, sans le monde). Sans numéro, le serveur prend le port 8765.

Comme dans le jeu, on passe d'abord par l'écran de connexion (faux : les
identifiants sont déjà remplis et ne peuvent pas être changés), puis par la
sélection du personnage (Leeroy), avant le chargement et l'arrivée du ciel.

## Contrôles

- ZQSD / WASD : avancer, reculer, tourner ; A et E (Q et E en QWERTY) : pas de côté
- clic droit maintenu : diriger le personnage ; clic gauche maintenu : regarder autour
- les deux boutons : avancer ; molette : zoom ; espace : sauter
- Verr. num ou R : course automatique ; Tab : cibler Chromie ; L : journal de quêtes ; Y : hauts faits ; J : le cri de Leeroy
- Échap : ferme la fenêtre ouverte, sinon enlève la cible, sinon ouvre le menu du jeu
  (Sound, Video, Key Bindings, Logout) ; aussi via le « ? » rouge sous la minicarte
- clic droit sur Chromie (à moins de 6 m) : lui parler ; M : la carte de la zone ; Ctrl + S : couper ou remettre le son, Ctrl + M : la musique
- clic droit sur un portail (à moins de 8 m) : l'emprunter ; le survoler, même de loin, affiche son nom
- molette sur la discussion (ou ses boutons à gauche) : revoir les anciens messages
- Entrée : écrire dans la discussion (/s dire, /y crier, et les émotes /dance, /wave, /bow, /cheer, /laugh, /applaud, /point, /roar)
- sur écran tactile : toucher le sol pour y marcher, toucher Chromie pour lui parler
- on peut sauter dans le vide : on y meurt, et « Release Spirit » ramène à l'arrivée
- sac (B) : clic droit sur un objet pour l'utiliser (pierre de foyer, montre, repas, charte, carte, objet du verdict)

## Fichiers

- `index.html`, `world/` : le monde 3D (three.js dans `assets/vendor/`)
- `quiz.html`, `app.js`, `data.js`, `style.css` : la fenêtre de quête et le quiz
- `world.css` : l'interface du monde (cadres, minicarte, discussion, chargement)
- `assets/ui` : textures d'interface du client (dépôt Gethe/wow-ui-textures)
- `assets/icons`, `assets/sounds` : icônes et sons (CDN de Wowhead)
- `assets/fonts` : Friz Quadrata et Morpheus
- `assets/models` : les vrais modèles du jeu (voir `EXPORT-MODELES.md`) ; `tools/pack_gltf.py` allège
  un export de wow.export (ne garde que les animations utiles, un seul fichier .glb)
- `assets/models/timeways`, `assets/textures/timeways` : la zone, refaite par `tools/build_timeways.py`

Projet privé, non affilié à Blizzard Entertainment.

## Mentions

Projet de fan, non commercial, sans lien avec Blizzard Entertainment ni
approuvé par elle. World of Warcraft, ses personnages, modèles, textures,
sons et musiques sont des marques et la propriété de Blizzard Entertainment,
Inc.

*Fan project, non-commercial. Not affiliated with or endorsed by Blizzard
Entertainment. World of Warcraft and its game assets are trademarks and
property of Blizzard Entertainment, Inc.*
