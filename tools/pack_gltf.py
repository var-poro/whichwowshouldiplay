#!/usr/bin/env python3
"""Allège un export glTF de wow.export et le range en un seul fichier .glb.

wow.export sort toutes les animations du modèle (plus de 300 pour Chromie,
77 Mo). On ne garde que celles dont le site a besoin, et on regroupe modèle,
animations et textures dans un seul fichier.

Usage :
  python3 tools/pack_gltf.py <export.gltf> <sortie.glb> [Nom1 Nom2 ...]
Sans liste, on garde ANIMS ci-dessous. Un nom seul (« Stand ») garde toutes
ses variantes ; « Stand#0 » ne garde que la variante 0.
"""

import json
import os
import re
import struct
import sys

COMP_SIZE = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
TYPE_COUNT = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}

ANIMS = [
    "Stand", "Walk", "Run", "WalkBackwards", "ShuffleLeft", "ShuffleRight",
    "JumpStart", "Jump", "JumpEnd", "Fall",
    "EmoteWave", "EmoteCheer", "EmoteTalk", "EmoteTalkExclamation", "EmoteTalkQuestion",
    "EmoteBow", "EmoteLaugh", "EmoteDance#0", "EmoteApplaud", "EmotePoint",
]


def wanted(name, keep):
    m = re.match(r"(.+?) \(ID \d+ variation (\d+)\)", name)
    base, var = (m.group(1), m.group(2)) if m else (name, "0")
    return base in keep or f"{base}#{var}" in keep


def main():
    src, out = sys.argv[1], sys.argv[2]
    keep = set(sys.argv[3:] or ANIMS)
    root = os.path.dirname(os.path.abspath(src))
    g = json.load(open(src))

    anims = [a for a in g.get("animations", []) if wanted(a["name"], keep)]

    buffers = {}

    def buffer_bytes(bi):
        if bi not in buffers:
            buffers[bi] = open(os.path.join(root, g["buffers"][bi]["uri"]), "rb").read()
        return buffers[bi]

    def read_elems(ai):
        """Éléments bruts (octets) d'un accesseur, un par sommet."""
        acc = g["accessors"][ai]
        v = g["bufferViews"][acc["bufferView"]]
        size = COMP_SIZE[acc["componentType"]] * TYPE_COUNT[acc["type"]]
        stride = v.get("byteStride", size)
        data = buffer_bytes(v["buffer"])
        base = v.get("byteOffset", 0) + acc.get("byteOffset", 0)
        return [data[base + i * stride : base + i * stride + size] for i in range(acc["count"])]

    # Maillages qu'aucun nœud n'affiche (morceaux de tenue décochés) : retirés
    # avant tout, pour ne pas embarquer leurs sommets.
    shown = sorted({n["mesh"] for n in g["nodes"] if "mesh" in n})
    mesh_map = {old: new for new, old in enumerate(shown)}
    g["meshes"] = [g["meshes"][i] for i in shown]
    for n in g["nodes"]:
        if "mesh" in n:
            n["mesh"] = mesh_map[n["mesh"]]
    # et les matériaux, textures et images qui ne servaient qu'à eux
    mats = sorted({p["material"] for m in g["meshes"] for p in m["primitives"] if "material" in p})
    mat_map = {old: new for new, old in enumerate(mats)}
    g["materials"] = [g["materials"][i] for i in mats]
    for m in g["meshes"]:
        for p in m["primitives"]:
            if "material" in p:
                p["material"] = mat_map[p["material"]]
    def tex_refs(mat):
        return [t for t in (mat.get("pbrMetallicRoughness", {}).get("baseColorTexture"), mat.get("emissiveTexture"), mat.get("normalTexture")) if t]
    texs = sorted({t["index"] for mat in g["materials"] for t in tex_refs(mat)})
    tex_map = {old: new for new, old in enumerate(texs)}
    g["textures"] = [g["textures"][i] for i in texs] if texs else []
    for mat in g["materials"]:
        for t in tex_refs(mat):
            t["index"] = tex_map[t["index"]]
    imgs = sorted({t["source"] for t in g["textures"]})
    img_map = {old: new for new, old in enumerate(imgs)}
    g["images"] = [g["images"][i] for i in imgs]
    for t in g["textures"]:
        t["source"] = img_map[t["source"]]

    # Compaction : wow.export met tout le modèle (toutes les variantes de
    # coiffure, de visage...) dans un seul tableau de sommets partagé ; chaque
    # morceau n'en garde ici que ceux qu'il utilise vraiment.
    extra_views = []  # (données, cible) ajoutées plus bas
    new_accessors = []
    cache = {}
    for mesh in g["meshes"]:
        for p in mesh["primitives"]:
            ia = g["accessors"][p["indices"]]
            ifmt = {5121: "B", 5123: "H", 5125: "I"}[ia["componentType"]]
            raw = b"".join(read_elems(p["indices"]))
            idx = list(struct.unpack(f"<{ia['count']}{ifmt}", raw))
            used_v = sorted(set(idx))
            remap = {old: new for new, old in enumerate(used_v)}
            for name, ai in list(p["attributes"].items()):
                key = (ai, tuple(used_v[:1]), len(used_v), p["indices"])
                if key not in cache:
                    elems = read_elems(ai)
                    data = b"".join(elems[i] for i in used_v)
                    acc = dict(g["accessors"][ai])
                    acc.pop("byteOffset", None)
                    acc["count"] = len(used_v)
                    if name == "POSITION":
                        pts = [struct.unpack("<3f", elems[i]) for i in used_v]
                        acc["min"] = [min(q[k] for q in pts) for k in range(3)]
                        acc["max"] = [max(q[k] for q in pts) for k in range(3)]
                    extra_views.append((data, 34962))
                    acc["bufferView"] = ("extra", len(extra_views) - 1)
                    new_accessors.append(acc)
                    cache[key] = ("new", len(new_accessors) - 1)
                p["attributes"][name] = cache[key]
            fmt = "H" if len(used_v) < 65536 else "I"
            data = struct.pack(f"<{len(idx)}{fmt}", *[remap[i] for i in idx])
            acc = {"componentType": 5123 if fmt == "H" else 5125, "count": len(idx), "type": "SCALAR"}
            extra_views.append((data, 34963))
            acc["bufferView"] = ("extra", len(extra_views) - 1)
            new_accessors.append(acc)
            p["indices"] = ("new", len(new_accessors) - 1)

    # Pistes d'animation immobiles (un os qui ne bouge pas pendant toute
    # l'animation, le cas de la plupart des os du visage ou des doigts) : une
    # seule image au lieu de toutes.
    # (à 1e-5 près : les valeurs exportées bougent d'un poil sans raison) ; et
    # les pistes qui partagent les mêmes instants partagent une seule liste.
    def still(outs):
        v = [struct.unpack(f"<{len(o) // 4}f", o) for o in outs]
        return all(abs(x - y) < 1e-5 for row in v[1:] for x, y in zip(row, v[0]))
    same_times = {}
    for an in anims:
        for s in an["samplers"]:
            outs = read_elems(s["output"])
            if len(outs) > 1 and still(outs):
                acc_in = dict(g["accessors"][s["input"]])
                acc_in.pop("byteOffset", None)
                acc_in.update(count=1, min=[0.0], max=[0.0])
                extra_views.append((struct.pack("<f", 0.0), None))
                acc_in["bufferView"] = ("extra", len(extra_views) - 1)
                new_accessors.append(acc_in)
                acc_out = dict(g["accessors"][s["output"]])
                acc_out.pop("byteOffset", None)
                acc_out.pop("min", None)
                acc_out.pop("max", None)
                acc_out["count"] = 1
                extra_views.append((outs[0], None))
                acc_out["bufferView"] = ("extra", len(extra_views) - 1)
                new_accessors.append(acc_out)
                s["input"] = ("new", len(new_accessors) - 2)
                s["output"] = ("new", len(new_accessors) - 1)
            else:
                key = b"".join(read_elems(s["input"]))
                s["input"] = same_times.setdefault(key, s["input"])

    # accesseurs utiles : maillages, peau, animations gardées
    used = []

    def use(i):
        if i is not None and not isinstance(i, tuple) and i not in used:
            used.append(i)

    for skin in g.get("skins", []):
        use(skin.get("inverseBindMatrices"))
    for a in anims:
        for s in a["samplers"]:
            use(s["input"])
            use(s["output"])

    blob = bytearray()
    views = []
    view_map = {}

    def add_view(data, extra=None):
        while len(blob) % 4:
            blob.append(0)
        view = {"buffer": 0, "byteOffset": len(blob), "byteLength": len(data)}
        view.update(extra or {})
        blob.extend(data)
        views.append(view)
        return len(views) - 1

    accessors = []
    acc_map = {}
    for old in used:
        acc = dict(g["accessors"][old])
        bv = acc.get("bufferView")
        if bv is not None:
            if bv not in view_map:
                v = g["bufferViews"][bv]
                data = buffer_bytes(v["buffer"])[v.get("byteOffset", 0) : v.get("byteOffset", 0) + v["byteLength"]]
                extra = {k: v[k] for k in ("byteStride", "target") if k in v}
                view_map[bv] = add_view(data, extra)
            acc["bufferView"] = view_map[bv]
        acc_map[old] = len(accessors)
        accessors.append(acc)

    # sommets compactés : nouvelles vues et nouveaux accesseurs
    extra_map = [add_view(data, {"target": target} if target else None) for data, target in extra_views]
    new_map = []
    for acc in new_accessors:
        acc["bufferView"] = extra_map[acc["bufferView"][1]]
        new_map.append(len(accessors))
        accessors.append(acc)
    for mesh in g["meshes"]:
        for p in mesh["primitives"]:
            p["attributes"] = {k: new_map[a[1]] for k, a in p["attributes"].items()}
            p["indices"] = new_map[p["indices"][1]]
            p.pop("targets", None)
    for skin in g.get("skins", []):
        if "inverseBindMatrices" in skin:
            skin["inverseBindMatrices"] = acc_map[skin["inverseBindMatrices"]]
    remap = lambda i: new_map[i[1]] if isinstance(i, tuple) else acc_map[i]
    for a in anims:
        for s in a["samplers"]:
            s["input"] = remap(s["input"])
            s["output"] = remap(s["output"])

    # textures intégrées au fichier
    for img in g.get("images", []):
        uri = img.pop("uri")
        data = open(os.path.join(root, uri), "rb").read()
        img["bufferView"] = add_view(data)
        img["mimeType"] = "image/png" if uri.lower().endswith(".png") else "image/jpeg"

    g["animations"] = anims
    g["accessors"] = accessors
    g["bufferViews"] = views
    while len(blob) % 4:
        blob.append(0)
    g["buffers"] = [{"byteLength": len(blob)}]

    # JSON allégé : noms d'accesseurs inutiles, bornes seulement là où la norme
    # les exige (positions, instants des animations)
    need_bounds = {s["input"] for a in anims for s in a["samplers"]}
    need_bounds |= {p["attributes"]["POSITION"] for m in g["meshes"] for p in m["primitives"] if "POSITION" in p["attributes"]}
    for i, acc in enumerate(g["accessors"]):
        acc.pop("name", None)
        if acc.get("byteOffset") == 0:
            acc.pop("byteOffset")
        if i not in need_bounds:
            acc.pop("min", None)
            acc.pop("max", None)
    js = json.dumps(g, separators=(",", ":")).encode()
    js += b" " * ((4 - len(js) % 4) % 4)
    total = 12 + 8 + len(js) + 8 + len(blob)
    with open(out, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, total))
        f.write(struct.pack("<II", len(js), 0x4E4F534A))
        f.write(js)
        f.write(struct.pack("<II", len(blob), 0x004E4942))
        f.write(blob)
    print(f"{out}: {len(anims)} animations, {total / 1024 / 1024:.1f} Mo")
    for a in anims:
        print("  ", a["name"])


if __name__ == "__main__":
    main()
