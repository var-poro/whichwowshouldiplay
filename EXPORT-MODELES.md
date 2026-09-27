# Remplacer les figurines par les vrais modèles du jeu

Le monde marche déjà avec des figurines provisoires. Il suffit d'exporter
Chromie et ton personnage avec **wow.export** dans le dossier du projet ;
ensuite je branche les fichiers (un petit `assets/models/models.json`).

## 1. Installer wow.export

1. Page https://github.com/Kruithne/wow.export/releases, dernière version (0.2.19).
2. Ton Mac est un Apple Silicon : prends **`wow-export-osx-arm64-0.2.19.tar.gz`**.
3. Double-clique l'archive, glisse l'application dans Applications.
4. Au premier lancement, macOS peut refuser une app d'un « développeur non
   identifié » : clic droit sur l'app → **Ouvrir**, puis **Ouvrir** encore
   (ou Réglages Système → Confidentialité et sécurité → **Ouvrir quand même**).

## 2. Ouvrir ton jeu

- **Open Local Installation** → `/Applications/World of Warcraft` → version **Retail**.
- Attends la fin du chargement de la liste des fichiers.

## 3. Choisir le dossier d'export

- Ouvre les réglages (**Settings**).
- **Export Directory** : `/Users/poro/which-wow/assets/models/export`
  (sans espace dans le chemin, l'outil le déconseille).
- Enregistre.

## 4. Chromie (onglet **Creatures**)

1. Dans **Filter creatures...**, tape `Chromie`. Il y a plusieurs entrées :
   clique-les une par une, l'aperçu 3D s'affiche. Prends la **gnome blonde aux
   chignons**, pas le dragon de bronze.
2. Le bouton **Export** a une petite flèche : choisis **GLTF** (le format
   par défaut est OBJ, sans animations).
3. Coche **Export animations** (la case n'apparaît qu'en GLTF) et laisse
   **Textures** coché.
4. Clique **Export**.

## 5. Le personnage joué : Leeroy Jenkins (onglet **Creatures**)

- Filtre `Leeroy`, prends **Leeroy Jenkins** (vérifie l'aperçu : humain en
  armure de paladin).
- Même réglages que Chromie : **GLTF**, **Export animations** et **Textures**
  cochés, et l'équipement coché s'il est proposé.
- **Export**.

## 6. C'est tout

Dis-moi quand c'est fait. Je passe l'export dans `tools/pack_gltf.py`
(on ne garde que les animations utiles, un seul fichier `.glb` léger) et il
remplace la figurine provisoire. Chromie est déjà faite (`assets/models/chromie.glb`).

## La zone : les Voies du temps

La carte vient de ton export de la carte 2678 (l'Aube de l'Infini) :

- le plateau central `10du_infinitedungeon_timewayshub01` (WMO) et ses décors
  (sabliers, sable qui coule, anneaux qui tournent), avec les plateformes
  voisines qui flottent plus bas ;
- le ciel : étoiles dorées (`7fx_arcane_starfield_holy`), nébuleuse et voile de
  sable (`10dg_dragon_temporalconflux_door02_*`) ;
- les portails : textures du portail de mage `11fx_arcaneportal01` (flux,
  anneau de runes, lueur, cercle au sol), animées par le site.

`tools/build_timeways.py` refait tout depuis `~/wow.export` : conversion en
`.glb` (`assets/models/timeways`), carte des hauteurs du sol (on marche sur le
plateau, on s'arrête au bord du vide) et `layout.json` (où poser chaque
chose). Il lit aussi les `.json` que wow.export pose à côté des modèles, pour
rendre les effets comme en jeu (fusion additive, transparence, textures qui
défilent). Les textures du ciel et des portails sont copiées dans
`assets/textures/timeways`.

```bash
python3 tools/build_timeways.py
```

(il faut `numpy` et `Pillow`)
