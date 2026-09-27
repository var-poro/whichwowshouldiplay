#!/usr/bin/env python3
"""Prépare la zone des Voies du temps (The Timeways, Aube de l'Infini) à
partir des fichiers exportés par wow.export dans ~/wow.export :

- le plateau central (WMO 10du_infinitedungeon_timewayshub01) et ses décors
  (sabliers, sable qui coule, anneaux), en .glb ;
- les plateformes voisines qui flottent plus bas, pour le décor lointain ;
- une carte des hauteurs du sol, pour marcher sur le plateau et s'arrêter au
  bord du vide ;
- layout.json : où poser chaque chose, dans le repère du plateau (mètres de
  l'OBJ : x, y vers le haut, z).

Usage : python3 tools/build_timeways.py [dossier_wow_export]
Il faut numpy et Pillow.
"""

import json
import math
import os
import struct
import subprocess
import sys

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/wow.export")
OUT = os.path.join(ROOT, "assets", "models", "timeways")
CONVERT = os.path.join(ROOT, "tools", "obj_to_glb.py")

HUB = "world/wmo/dungeon/infinitedungeon/10du_infinitedungeon_timewayshub01_set0.obj"
MAP_CSVS = "maps/2678"
# plateformes voisines (même carte), gardées pour le décor
NEIGHBOURS = ("10du_infinitedungeon_platform01_set0.obj", "10du_infinitedungeon_platformlarge01_set0.obj")
CELL = 0.75  # pas de la carte des hauteurs, en mètres de l'OBJ


def convert(obj, name, tex=512):
    out = os.path.join(OUT, name + ".glb")
    if not os.path.exists(out):
        subprocess.run([sys.executable, CONVERT, obj, out, str(tex)], check=True)
    return name + ".glb"


def read_obj(path):
    v, f = [], []
    for line in open(path, encoding="utf-8", errors="ignore"):
        if line.startswith("v "):
            v.append(tuple(map(float, line.split()[1:4])))
        elif line.startswith("f "):
            idx = [int(c.split("/")[0]) - 1 for c in line.split()[1:]]
            for i in range(1, len(idx) - 1):
                f.append((idx[0], idx[i], idx[i + 1]))
    return np.array(v), np.array(f)


def neighbours8(a, fill):
    """Les 8 voisins de chaque case, empilés (bords remplis par `fill`)."""
    p = np.pad(a, 1, constant_values=fill)
    H, W = a.shape
    return np.stack([p[1 + dj : 1 + dj + H, 1 + di : 1 + di + W] for dj in (-1, 0, 1) for di in (-1, 0, 1) if dj or di])


def clean_floor(hm):
    """Répare la carte des hauteurs là où la géométrie la trompe.

    - Fissures : au pied de chaque marche, la contremarche est verticale et
      laisse une ligne de cases sans sol ; on y tomberait « dans le vide » et
      le joueur resterait bloqué, en montée comme en descente. Une case vide
      entourée de sol (5 voisins sur 8 au moins) prend la hauteur du plus haut.
    - Piquets et creux : de petits ornements dépassent du sol (mur
      invisible) ou y font un trou (on y tombe sans pouvoir remonter). Une
      bosse ou un creux de quelques cases seulement est ramené au niveau du
      sol autour ; les rambardes, longues, restent.
    """
    VOID = -1e9
    for _ in range(3):
        n = neighbours8(hm, VOID)
        valid = n > -1e8
        fill = (hm <= -1e8) & (valid.sum(0) >= 5)
        if not fill.any():
            break
        hm = np.where(fill, np.where(valid, n, -np.inf).max(0), hm)
    n = neighbours8(hm, VOID)
    valid = n > -1e8
    around = np.where(valid, n, np.nan)
    med = np.nanmedian(np.where(valid.any(0), around, 0), axis=0)
    raised = (hm > -1e8) & (np.abs(hm - med) > 0.4)
    # composantes connexes des bosses : on n'aplatit que les petites
    H, W = hm.shape
    seen = np.zeros_like(raised)
    flattened = 0
    for j0, i0 in zip(*np.nonzero(raised)):
        if seen[j0, i0]:
            continue
        comp, stack = [], [(j0, i0)]
        seen[j0, i0] = True
        while stack:
            j, i = stack.pop()
            comp.append((j, i))
            for dj, di in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                a, b = j + dj, i + di
                if 0 <= a < H and 0 <= b < W and raised[a, b] and not seen[a, b]:
                    seen[a, b] = True
                    stack.append((a, b))
        if len(comp) <= 6:
            for j, i in comp:
                hm[j, i] = med[j, i]
            flattened += len(comp)
    print(f"sol : fissures bouchées, {flattened} cases de piquets et de creux aplanies")
    return hm


def heightmap(obj):
    """Hauteur du plus haut sol praticable (faces tournées vers le haut) par case."""
    V, F = read_obj(obj)
    x0, z0 = V[:, 0].min(), V[:, 2].min()
    W = int((V[:, 0].max() - x0) / CELL) + 2
    H = int((V[:, 2].max() - z0) / CELL) + 2
    hm = np.full((H, W), -1e9, dtype=np.float32)
    a, b, c = V[F[:, 0]], V[F[:, 1]], V[F[:, 2]]
    n = np.cross(b - a, c - a)
    up = n[:, 1] / (np.linalg.norm(n, axis=1) + 1e-12)
    for A, B, C in zip(a[up > 0.6], b[up > 0.6], c[up > 0.6]):
        i0 = int((min(A[0], B[0], C[0]) - x0) / CELL)
        i1 = int((max(A[0], B[0], C[0]) - x0) / CELL) + 1
        j0 = int((min(A[2], B[2], C[2]) - z0) / CELL)
        j1 = int((max(A[2], B[2], C[2]) - z0) / CELL) + 1
        gx, gz = np.meshgrid(x0 + (np.arange(i0, i1 + 1) + 0.5) * CELL, z0 + (np.arange(j0, j1 + 1) + 0.5) * CELL)
        d = (B[2] - C[2]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[2] - C[2])
        if abs(d) < 1e-9:
            continue
        l1 = ((B[2] - C[2]) * (gx - C[0]) + (C[0] - B[0]) * (gz - C[2])) / d
        l2 = ((C[2] - A[2]) * (gx - C[0]) + (A[0] - C[0]) * (gz - C[2])) / d
        l3 = 1 - l1 - l2
        inside = (l1 >= -1e-4) & (l2 >= -1e-4) & (l3 >= -1e-4)
        y = l1 * A[1] + l2 * B[1] + l3 * C[1]
        sub = hm[j0 : j1 + 1, i0 : i1 + 1]
        inside, y = inside[: sub.shape[0], : sub.shape[1]], y[: sub.shape[0], : sub.shape[1]]
        upd = inside & (y > sub)
        sub[upd] = y[upd]
    hm = clean_floor(hm)
    # en centimètres sur 16 bits ; le vide vaut -32768
    cm = np.where(hm > -1e8, np.clip(np.round(hm * 100), -32767, 32767), -32768).astype("<i2")
    with open(os.path.join(OUT, "floor.bin"), "wb") as fh:
        fh.write(cm.tobytes())
    return {"x0": float(x0), "z0": float(z0), "cell": CELL, "w": W, "h": H}


def wmo_doodads(hub_obj):
    """Décors posés dans le WMO (repère WMO : z vers le haut) -> repère OBJ."""
    csv = os.path.splitext(hub_obj)[0] + "_ModelPlacementInformation.csv"
    rows = [l.strip().split(";") for l in open(csv)][1:]
    out, files = [], {}
    for r in rows:
        path = os.path.normpath(os.path.join(os.path.dirname(hub_obj), r[0]))
        name = os.path.splitext(os.path.basename(path))[0]
        if name not in files:
            files[name] = convert(path, name)
        x, y, z = map(float, r[1:4])
        qw, qx, qy, qz = map(float, r[4:8])
        out.append({
            "model": files[name],
            "pos": [x, z, -y],
            # quaternion WMO (x, y, z) -> OBJ (x, z, -y)
            "quat": [qx, qz, -qy, qw],
            "scale": float(r[8]),
        })
    return out


def neighbours(csv_dir):
    """Plateformes voisines, placées par la carte : position relative au plateau."""
    rows = []
    for fn in sorted(os.listdir(csv_dir)):
        if fn.endswith("_ModelPlacementInformation.csv"):
            rows += [l.strip().split(";") for l in open(os.path.join(csv_dir, fn))][1:]
    hub = next(r for r in rows if "timewayshub01" in r[0])
    hx, hy, hz, hrot = float(hub[1]), float(hub[2]), float(hub[3]), float(hub[5])
    seen, out, files = set(), [], {}
    for r in rows:
        base = os.path.basename(r[0])
        key = (base, r[1], r[3])
        if base not in NEIGHBOURS or key in seen:
            continue
        seen.add(key)
        px, py, pz, rot = float(r[1]), float(r[2]), float(r[3]), float(r[5])
        if math.hypot(px - hx, pz - hz) > 400:
            continue
        path = os.path.normpath(os.path.join(SRC, "maps", "2678", r[0]))
        name = os.path.splitext(base)[0]
        if name not in files:
            files[name] = convert(path, name, 256)
        # carte (import de wow.export) : x = 17066 - X, z = 17066 - Z, rotation Y + 90° ;
        # puis dans le repère du plateau (sa rotation retirée)
        dx, dz = -(px - hx), -(pz - hz)
        a = -math.radians(hrot + 90)
        lx = dx * math.cos(a) + dz * math.sin(a)
        lz = -dx * math.sin(a) + dz * math.cos(a)
        out.append({"model": files[name], "pos": [lx, py - hy, lz], "rotY": math.radians(rot - hrot), "scale": float(r[8])})
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    hub_obj = os.path.join(SRC, HUB)
    layout = {
        "hub": convert(hub_obj, "hub", 768),
        "doodads": wmo_doodads(hub_obj),
        "neighbours": neighbours(os.path.join(SRC, MAP_CSVS)),
        "floor": heightmap(hub_obj),
    }
    with open(os.path.join(OUT, "layout.json"), "w") as fh:
        json.dump(layout, fh, indent=1)
    total = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
    print(f"{OUT}: {len(os.listdir(OUT))} fichiers, {total / 1e6:.1f} Mo")


if __name__ == "__main__":
    main()
