#!/usr/bin/env python3
"""Refait assets/models/player.glb (Leeroy Jenkins) depuis l'export de wow.export.

L'export du PNJ contient tous les morceaux possibles du modèle (coiffures,
bottes, pieds...) ; on garde ceux de sa tenue (données du PNJ, affichage 57227) :
bottes « Boots2 » (hautes) avec les pieds chaussés « Feet2 » (Feet1 : les
orteils nus, qui traverseraient les bottes), tabard « Tabard2 ». Puis
tools/pack_gltf.py avec les animations dont le site a besoin.

Usage : python3 tools/pack_player.py [chemin/LeeroyJenkins.gltf]
"""

import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/wow.export/creatures/LeeroyJenkins.gltf")
KEEP = {
    "Geoset0", "Hair10", "FacialA2", "FacialB3", "FacialC7", "Gloves1", "Boots2", "Feet2", "Ears1",
    "Trousers1", "Belt1", "Torso1", "HeadSwap1", "HeadSwap2", "Eyes1", "Eyebrows2", "EyeGlowB1", "Tabard2",
}
ANIMS = (
    "Stand Walk Run Walkbackwards ShuffleLeft ShuffleRight JumpStart Jump JumpEnd Fall EmoteWave EmoteCheer "
    "EmoteTalk EmoteTalkExclamation EmoteTalkQuestion EmoteBow EmoteLaugh EmoteDance#0 EmoteApplaud EmotePoint "
    "SitGroundDown SitGround SitGroundUp BattleRoar EmoteKiss#0 EmoteCry#0 EmoteChicken#0 EmoteRude#0 EmoteShout#0 "
    "EmoteFlex#0 EmoteShy#0 EmoteBeg#0 EmoteYes#0 EmoteNo#0 EmoteTrain#0 EmoteSalute#0 EmoteKneel#0 Sheath#0 HandsClosed#0 ReadySpellOmni#0 SpellCastOmni#0"
).split()

g = json.load(open(SRC))
for node in g["nodes"]:
    name = node.get("name", "").split("_", 1)[-1]
    if "mesh" in node and name not in KEEP:
        del node["mesh"]
tmp = os.path.join(os.path.dirname(SRC), "_player_tmp.gltf")
json.dump(g, open(tmp, "w"))
try:
    subprocess.run([sys.executable, os.path.join(ROOT, "tools", "pack_gltf.py"), tmp, os.path.join(ROOT, "assets", "models", "player.glb"), *ANIMS], check=True)
finally:
    os.remove(tmp)
