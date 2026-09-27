#!/usr/bin/env python3
"""Convertit un décor exporté par wow.export en OBJ (+ .mtl, .png) en un seul
fichier .glb, textures comprises, pour le charger comme les personnages.

Le rendu des morceaux suit le fichier .json que wow.export pose à côté de
l'OBJ quand il existe : mode de fusion du jeu (opaque, découpé, transparent,
additif) et défilement de la texture (sable qui coule, magie qui tourne),
notés dans extras { blend, scroll } et appliqués par le site. Sans .json, on
devine d'après le nom : « _alpha » découpée, reflets et lueurs additifs.

Usage : python3 tools/obj_to_glb.py <modele.obj> <sortie.glb> [taille_max_texture]
"""

import io
import json
import os
import re
import struct
import sys

from PIL import Image

ADDITIVE = re.compile(r"gleam|glow|envmap|stars|energytrail|particle", re.I)


def load_mtl(path):
    mats, cur = {}, None
    for line in open(path, encoding="utf-8", errors="ignore"):
        parts = line.strip().split(None, 1)
        if not parts:
            continue
        if parts[0] == "newmtl":
            cur = parts[1]
            mats[cur] = None
        elif parts[0] == "map_Kd" and cur:
            mats[cur] = os.path.normpath(os.path.join(os.path.dirname(path), parts[1]))
    return mats


# Modes de fusion du jeu (M2 : blendingMode, WMO : blendMode) -> rendu du site
M2_BLEND = {0: "opaque", 1: "mask", 2: "alpha", 3: "add", 4: "add", 5: "mod", 6: "mod", 7: "add"}
WMO_BLEND = {0: "opaque", 1: "mask", 2: "alpha", 3: "add", 4: "add", 5: "mod", 6: "mod"}


def load_meta(src):
    """Par nom de matériau OBJ : { blend, scroll } lus dans le .json de wow.export."""
    path = os.path.splitext(src)[0] + ".json"
    if not os.path.exists(path):
        return {}
    d = json.load(open(path))
    meta = {}
    if d.get("fileType") == "wmo":
        by_id = {t.get("fileDataID"): t.get("mtlName") for t in d.get("textures", [])}
        for m in d.get("materials", []):
            name = by_id.get(m.get("texture1"))
            if name and name not in meta:
                meta[name] = {"blend": WMO_BLEND.get(m.get("blendMode", 0), "opaque")}
        return meta
    tex, mats, combos = d.get("textures", []), d.get("materials", []), d.get("textureCombos", [])
    transforms, lookup = d.get("textureTransforms", []), d.get("textureTransformsLookup", [])
    for u in (d.get("skin") or {}).get("textureUnits", []):
        try:
            name = tex[combos[u["textureComboIndex"]]]["mtlName"]
        except (IndexError, KeyError):
            continue
        info = {"blend": M2_BLEND.get(mats[u["materialIndex"]]["blendingMode"], "opaque") if u["materialIndex"] < len(mats) else "opaque"}
        li = u.get("textureTransformComboIndex", 65535)
        ti = lookup[li] if li < len(lookup) else 65535
        if ti < len(transforms):
            tr = transforms[ti].get("translation", {})
            ts, vs = tr.get("timestamps") or [], tr.get("values") or []
            if ts and vs and len(ts[0]) > 1 and ts[0][-1] > 0:
                (a, b) = vs[0][0], vs[0][-1]
                sec = ts[0][-1] / 1000
                info["scroll"] = [(b[0] - a[0]) / sec, -(b[1] - a[1]) / sec]
        meta.setdefault(name, info)
    return meta


def main():
    src, out = sys.argv[1], sys.argv[2]
    max_tex = int(sys.argv[3]) if len(sys.argv) > 3 else 512
    pos, uv, nor = [], [], []
    groups = {}  # matériau -> liste de coins (iv, it, in)
    mtl = {}
    cur = None
    for line in open(src, encoding="utf-8", errors="ignore"):
        if line.startswith("v "):
            pos.append(tuple(map(float, line.split()[1:4])))
        elif line.startswith("vt "):
            uv.append(tuple(map(float, line.split()[1:3])))
        elif line.startswith("vn "):
            nor.append(tuple(map(float, line.split()[1:4])))
        elif line.startswith("usemtl "):
            cur = line.split(None, 1)[1].strip()
            groups.setdefault(cur, [])
        elif line.startswith("mtllib "):
            mtl = load_mtl(os.path.join(os.path.dirname(src), line.split(None, 1)[1].strip()))
        elif line.startswith("f "):
            corners = []
            for c in line.split()[1:]:
                p = c.split("/")
                corners.append(tuple(int(x) - 1 if x else None for x in (p + [None, None])[:3]))
            for i in range(1, len(corners) - 1):  # éventail de triangles
                groups.setdefault(cur, []).extend([corners[0], corners[i], corners[i + 1]])

    blob = bytearray()
    views, accessors, meshes_prims, materials, textures, images = [], [], [], [], [], []

    def add_view(data, target=None):
        while len(blob) % 4:
            blob.append(0)
        v = {"buffer": 0, "byteOffset": len(blob), "byteLength": len(data)}
        if target:
            v["target"] = target
        blob.extend(data)
        views.append(v)
        return len(views) - 1

    def add_acc(data, ctype, count, typ, target, mn=None, mx=None):
        a = {"bufferView": add_view(data, target), "componentType": ctype, "count": count, "type": typ}
        if mn is not None:
            a["min"], a["max"] = mn, mx
        accessors.append(a)
        return len(accessors) - 1

    meta = load_meta(src)
    tex_cache = {}

    # Texture d'un morceau opaque : JPEG (bien plus léger, l'alpha n'y sert à
    # rien) ; sinon PNG, pour garder la transparence.
    def texture_for(path, opaque=False):
        key = (path, opaque)
        if key not in tex_cache:
            im = Image.open(path).convert("RGBA")
            if max(im.size) > max_tex:
                k = max_tex / max(im.size)
                im = im.resize((max(1, int(im.width * k)), max(1, int(im.height * k))), Image.LANCZOS)
            buf = io.BytesIO()
            if opaque:
                im.convert("RGB").save(buf, "JPEG", quality=88)
                mime = "image/jpeg"
            else:
                im.save(buf, "PNG", optimize=True)
                mime = "image/png"
            images.append({"bufferView": add_view(buf.getvalue()), "mimeType": mime})
            textures.append({"source": len(images) - 1, "sampler": 0})
            tex_cache[key] = len(textures) - 1
        return tex_cache[key]

    for name, corners in groups.items():
        if not corners:
            continue
        index_of, vp, vt, vn, idx = {}, [], [], [], []
        for c in corners:
            if c not in index_of:
                index_of[c] = len(vp)
                vp.append(pos[c[0]])
                vt.append((uv[c[1]][0], 1 - uv[c[1]][1]) if c[1] is not None else (0.0, 0.0))
                vn.append(nor[c[2]] if c[2] is not None else (0.0, 1.0, 0.0))
            idx.append(index_of[c])
        n = len(vp)
        attrs = {
            "POSITION": add_acc(struct.pack(f"<{n * 3}f", *[x for p in vp for x in p]), 5126, n, "VEC3", 34962,
                                [min(p[k] for p in vp) for k in range(3)], [max(p[k] for p in vp) for k in range(3)]),
            "NORMAL": add_acc(struct.pack(f"<{n * 3}f", *[x for p in vn for x in p]), 5126, n, "VEC3", 34962),
            "TEXCOORD_0": add_acc(struct.pack(f"<{n * 2}f", *[x for p in vt for x in p]), 5126, n, "VEC2", 34962),
        }
        fmt, ctype = ("H", 5123) if n < 65536 else ("I", 5125)
        ind = add_acc(struct.pack(f"<{len(idx)}{fmt}", *idx), ctype, len(idx), "SCALAR", 34963)
        tex_path = mtl.get(name)
        mat = {"name": name, "pbrMetallicRoughness": {"metallicFactor": 0, "roughnessFactor": 0.85}, "doubleSided": True}
        info = meta.get(name)
        if tex_path and os.path.exists(tex_path):
            base = os.path.basename(tex_path)
            opaque = bool(info) and info["blend"] == "opaque"
            mat["pbrMetallicRoughness"]["baseColorTexture"] = {"index": texture_for(tex_path, opaque)}
            if info:
                extras = {"blend": info["blend"]}
                if info.get("scroll"):
                    extras["scroll"] = info["scroll"]
                mat["extras"] = extras
                if info["blend"] == "mask":
                    mat["alphaMode"] = "MASK"
                    mat["alphaCutoff"] = 0.5
                elif info["blend"] != "opaque":
                    mat["alphaMode"] = "BLEND"
            elif ADDITIVE.search(base):
                mat["extras"] = {"blend": "add"}
                mat["alphaMode"] = "BLEND"
            elif "_alpha" in base:
                mat["alphaMode"] = "MASK"
                mat["alphaCutoff"] = 0.5
        materials.append(mat)
        meshes_prims.append({"attributes": attrs, "indices": ind, "material": len(materials) - 1})

    g = {
        "asset": {"version": "2.0", "generator": "which-wow obj_to_glb"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": os.path.splitext(os.path.basename(src))[0]}],
        "meshes": [{"primitives": meshes_prims}],
        "materials": materials,
        "textures": textures,
        "images": images,
        "samplers": [{"wrapS": 10497, "wrapT": 10497}],
        "accessors": accessors,
        "bufferViews": views,
    }
    while len(blob) % 4:
        blob.append(0)
    g["buffers"] = [{"byteLength": len(blob)}]
    js = json.dumps(g, separators=(",", ":")).encode()
    js += b" " * ((4 - len(js) % 4) % 4)
    total = 12 + 8 + len(js) + 8 + len(blob)
    with open(out, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, total))
        f.write(struct.pack("<II", len(js), 0x4E4F534A))
        f.write(js)
        f.write(struct.pack("<II", len(blob), 0x004E4942))
        f.write(blob)
    print(f"{out}: {len(meshes_prims)} morceaux, {total / 1024:.0f} Ko")
    for m in materials:
        print("  ", m["name"], m.get("alphaMode", "OPAQUE"), m.get("extras", ""))


if __name__ == "__main__":
    main()
