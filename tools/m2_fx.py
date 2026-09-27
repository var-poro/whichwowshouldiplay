#!/usr/bin/env python3
"""Métadonnées d'un modèle d'effet M2 que l'export glTF de wow.export perd.

Le glTF garde les maillages, les os et leurs animations, mais pas : les
particules, les modes de fusion, les textures combinées d'une passe, les
couleurs et opacités animées, les défilements de texture, les os « billboard »
(tournés vers la caméra). On les relit dans le M2 et son .skin d'origine, que
wow.export garde dans son cache CASC (~/Library/Application Support/wow.export/
Default/casc : root → encoding → data/<clé>, fichiers BLTE), ou dans un export
brut (.m2 + 00.skin).

Sortie : assets/models/fx/<nom>.m2.json (lu par world/m2fx.js), et les
textures des particules copiées dans assets/textures/fx/.

Usage :
  python3 tools/m2_fx.py <fileDataID> <nom>             (depuis le cache)
  python3 tools/m2_fx.py <fichier.m2> <nom> [00.skin]   (export brut)
Les textures sont cherchées dans ~/wow.export/spells (export glTF du modèle).
"""

import json
import os
import shutil
import struct
import sys
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CASC = os.path.expanduser("~/Library/Application Support/wow.export/Default/casc")
EXPORT = os.path.expanduser("~/wow.export/spells")
LISTFILE = os.environ.get("LISTFILE", "/tmp/listfile.csv")


# ---------- cache CASC de wow.export ----------
def blte(b):
    assert b[:4] == b"BLTE", "pas un fichier BLTE"
    hs = struct.unpack(">I", b[4:8])[0]
    if hs == 0:
        chunks, pos = [(len(b) - 8,)], 8
    else:
        n = struct.unpack(">I", b[8:12])[0] & 0xFFFFFF
        chunks = [struct.unpack(">I", b[12 + 24 * i : 16 + 24 * i]) for i in range(n)]
        pos = hs
    out = []
    for (cs,) in chunks:
        c = b[pos : pos + cs]
        pos += cs
        if c[:1] == b"N":
            out.append(c[1:])
        elif c[:1] == b"Z":
            out.append(zlib.decompress(c[1:]))
        else:
            raise ValueError("bloc BLTE chiffré ou inconnu")
    return b"".join(out)


def casc_files(fdids):
    """fileDataID → contenu, pour ceux présents dans le cache (build la plus récente)."""
    builds = os.path.join(CASC, "builds")
    build = max((os.path.join(builds, d) for d in os.listdir(builds)), key=lambda d: os.path.getsize(os.path.join(d, "root")))
    r = blte(open(os.path.join(build, "root"), "rb").read())
    assert r[:4] == b"TSFM"
    hsize, ver = struct.unpack_from("<II", r, 4)
    p, ckeys, want = hsize, {}, set(fdids)
    while p < len(r):
        n = struct.unpack_from("<I", r, p)[0]
        p += 4
        if ver >= 2:
            loc, u1, u2 = struct.unpack_from("<III", r, p)
            cf = u1 | u2 | (r[p + 12] << 17)
            p += 13
        else:
            cf, loc = struct.unpack_from("<II", r, p)
            p += 8
        ids = struct.unpack_from("<%di" % n, r, p)
        p += 4 * n
        ck = r[p : p + 16 * n]
        p += 16 * n
        if not cf & 0x10000000:
            p += 8 * n
        f = -1
        for i in range(n):
            f += ids[i] + 1
            if f in want:
                ckeys[f] = ck[16 * i : 16 * i + 16]
    e = blte(open(os.path.join(build, "encoding"), "rb").read())
    cpsz = struct.unpack_from(">H", e, 5)[0]
    ccount = struct.unpack_from(">I", e, 9)[0]
    espec = struct.unpack_from(">I", e, 18)[0]
    p = 22 + espec + ccount * 32
    wantc, ekeys = set(ckeys.values()), {}
    for pg in range(ccount):
        q = p + pg * cpsz * 1024
        end = q + cpsz * 1024
        while q < end and e[q]:
            kc = e[q]
            if e[q + 6 : q + 22] in wantc:
                ekeys[e[q + 6 : q + 22]] = e[q + 22 : q + 38]
            q += 22 + 16 * kc
    out = {}
    for f, ck in ckeys.items():
        ek = ekeys.get(ck)
        path = ek and os.path.join(CASC, "data", ek.hex())
        if path and os.path.exists(path):
            out[f] = blte(open(path, "rb").read())
    return out


# ---------- lecture du M2 (MD20, version 272+) ----------
class M2:
    def __init__(self, data):
        self.chunks = {}
        p = 0
        if data[:4] == b"MD20":
            self.chunks["MD21"] = data
        else:
            while p < len(data):
                tag = data[p : p + 4].decode()
                sz = struct.unpack_from("<I", data, p + 4)[0]
                self.chunks[tag] = data[p + 8 : p + 8 + sz]
                p += 8 + sz
        self.d = self.chunks["MD21"]
        assert self.d[:4] == b"MD20"

    def u(self, fmt, off):
        return struct.unpack_from("<" + fmt, self.d, off)

    def arr(self, off):
        return self.u("II", off)

    def items(self, off, size):
        n, o = self.arr(off)
        return [o + i * size for i in range(n)]

    def track(self, off, reader, size):
        """M2Track : par séquence, (temps en ms, valeurs)."""
        interp, gs = self.u("Hh", off)
        ts, vs = self.items(off + 4, 8), self.items(off + 12, 8)
        seqs = {}
        for i, (t, v) in enumerate(zip(ts, vs)):
            n, to = self.arr(t)
            _, vo = self.arr(v)
            if n:
                seqs[str(i)] = [list(self.u("%dI" % n, to)), [reader(vo + k * size) for k in range(n)]]
        if not seqs:
            return None
        return {"interp": interp, "gs": gs, "seq": seqs}

    def fblock(self, off, reader, size):
        """M2PartTrack des particules : sur la vie normalisée de la particule."""
        n, to = self.arr(off)
        m, vo = self.arr(off + 8)
        if not m:
            return None
        return [[round(x / 32767, 4) for x in self.u("%dh" % n, to)], [reader(vo + k * size) for k in range(m)]]


def r3(x):
    return [round(v, 5) for v in x]


def main():
    src, name = sys.argv[1], sys.argv[2]
    listfile = {}
    if os.path.exists(LISTFILE):
        for line in open(LISTFILE, encoding="utf-8", errors="replace"):
            i, _, path = line.strip().partition(";")
            if i.isdigit():
                listfile[int(i)] = path
    if src.isdigit():
        data = casc_files([int(src)])[int(src)]
        m = M2(data)
        sfid = struct.unpack("<%dI" % (len(m.chunks["SFID"]) // 4), m.chunks["SFID"])
        skin = casc_files([sfid[0]])[sfid[0]]
    else:
        m = M2(open(src, "rb").read())
        skin = open(sys.argv[3] if len(sys.argv) > 3 else src[:-3] + "00.skin", "rb").read()
    txid = struct.unpack("<%dI" % (len(m.chunks.get("TXID", b"")) // 4), m.chunks.get("TXID", b""))
    f32 = lambda o: round(m.u("f", o)[0], 5)
    v3 = lambda o: r3(m.u("3f", o))
    v2 = lambda o: r3(m.u("2f", o))
    fx16 = lambda o: round(m.u("h", o)[0] / 32767, 4)
    u16 = lambda o: m.u("H", o)[0]
    u8 = lambda o: m.d[o]

    def quat(o):
        q = m.u("4h", o)
        return r3([(v + 32768 if v < 0 else v - 32767) / 32767 for v in q])

    out = {"name": name, "file": listfile.get(int(src), src) if src.isdigit() else src}
    out["globalLoops"] = list(m.u("%dI" % m.arr(20)[0], m.arr(20)[1])) if m.arr(20)[0] else []
    out["seqs"] = []
    for o in m.items(28, 64):
        sid, var, dur, spd, flags = m.u("HHIfI", o)
        vnext, anext = m.u("hH", o + 60)
        out["seqs"].append({"id": sid, "var": var, "dur": dur, "flags": flags, "next": vnext, "alias": anext})
    out["bones"] = []
    for o in m.items(44, 88):
        key, flags, parent, submesh = m.u("iIhH", o)
        b = {"flags": flags, "parent": parent, "pivot": v3(o + 76)}
        out["bones"].append(b)
    out["colors"] = [{"color": m.track(o, v3, 12), "alpha": m.track(o + 20, fx16, 2)} for o in m.items(72, 40)]
    textures = []
    for i, o in enumerate(m.items(80, 16)):
        ttype, tflags = m.u("II", o)
        fd = txid[i] if i < len(txid) else 0
        base = os.path.splitext(os.path.basename(listfile.get(fd, f"{fd}.blp")))[0].lower()
        png = f"{base}_{fd}" if os.path.exists(os.path.join(EXPORT, f"{base}_{fd}.png")) else base
        textures.append({"fdid": fd, "png": png, "flags": tflags, "type": ttype})
    out["textures"] = textures
    out["weights"] = [m.track(o, fx16, 2) for o in m.items(88, 20)]
    out["uvAnims"] = [{"t": m.track(o, v3, 12), "r": m.track(o + 20, lambda q: r3(m.u("4f", q)), 16), "s": m.track(o + 40, v3, 12)} for o in m.items(96, 60)]
    mats = [dict(zip(("flags", "blend"), m.u("HH", o))) for o in m.items(112, 4)]
    lut = lambda off: [u16(o) for o in m.items(off, 2)]
    texLut, weightLut, uvLut = lut(128), lut(144), lut(152)

    # le .skin : sections (géosets du glTF, dans l'ordre) et passes de rendu
    s = skin
    su = lambda fmt, off: struct.unpack_from("<" + fmt, s, off)
    n, o = su("II", 28)
    sections = [su("HHHHHH", o + i * 48) for i in range(n)]
    n, o = su("II", 36)
    passes = []
    for i in range(n):
        flags, prio, shader, sec, geo, color, mat, layer, tcount, tcombo, coordc, wcombo, uvcombo = su("BbHHHhHHHHHHH", o + i * 24)
        cnt = 1 if shader & 0x8000 else tcount
        passes.append({
            "section": sec, "flags": flags, "priority": prio, "shader": shader, "layer": layer,
            "blend": mats[mat]["blend"], "matFlags": mats[mat]["flags"],
            "textures": [textures[texLut[tcombo + k]]["png"] for k in range(cnt)],
            # répétition de chaque texture (M2Texture.flags : 1 en U, 2 en V)
            "wrap": [textures[texLut[tcombo + k]]["flags"] & 3 for k in range(cnt)],
            "color": color,
            "weight": weightLut[wcombo] if wcombo < len(weightLut) else -1,
            "uv": [uvLut[uvcombo + k] if uvcombo + k < len(uvLut) and uvLut[uvcombo + k] != 0xFFFF else -1 for k in range(cnt)],
            "sectionIndexCount": sections[sec][5],
        })
    out["passes"] = passes

    # particules (M2Particle, 492 octets) et leurs compléments (EXP2)
    exp2 = []
    if "EXP2" in m.chunks:
        c = m.chunks["EXP2"]
        cn, co = struct.unpack_from("<II", c, 0)
        # tableau relatif au début du chunk
        for i in range(cn):
            z, cm, am = struct.unpack_from("<3f", c, co + i * 28)
            exp2.append({"zSource": round(z, 4), "colorMult": round(cm, 4), "alphaMult": round(am, 4)})
    parts = []
    for i, o in enumerate(m.items(296, 492)):
        pid, flags = m.u("iI", o)
        tex = u16(o + 22)
        blendType, emitterType = u8(o + 40), u8(o + 41)
        rows, cols = m.u("HH", o + 48)
        p = {
            "flags": flags, "pos": v3(o + 8), "bone": u16(o + 20),
            "blend": blendType, "type": emitterType, "colorIndex": u16(o + 42),
            "rows": rows, "cols": cols, "tileRotation": m.u("h", o + 46)[0],
            "speed": m.track(o + 52, f32, 4), "speedVar": m.track(o + 72, f32, 4),
            "vRange": m.track(o + 92, f32, 4), "hRange": m.track(o + 112, f32, 4),
            "gravity": m.track(o + 132, f32, 4) if not flags & 0x800000 else m.track(o + 132, lambda q: list(m.u("4b", q)), 4),
            "life": m.track(o + 152, f32, 4), "lifeVar": f32(o + 172),
            "rate": m.track(o + 176, f32, 4), "rateVar": f32(o + 196),
            "areaL": m.track(o + 200, f32, 4), "areaW": m.track(o + 220, f32, 4),
            "zSource": m.track(o + 240, f32, 4),
            "color": m.fblock(o + 260, v3, 12), "alpha": m.fblock(o + 276, fx16, 2),
            "scale": m.fblock(o + 292, v2, 8), "scaleVar": v2(o + 308),
            "headCell": m.fblock(o + 316, u16, 2), "tailCell": m.fblock(o + 332, u16, 2),
            "tailLength": f32(o + 348), "twinkleSpeed": f32(o + 352), "twinklePercent": f32(o + 356),
            "twinkleScale": v2(o + 360), "burst": f32(o + 368), "drag": f32(o + 372),
            "baseSpin": f32(o + 376), "baseSpinVar": f32(o + 380), "spin": f32(o + 384), "spinVar": f32(o + 388),
            "wind": v3(o + 416), "windTime": f32(o + 428),
            "follow": [f32(o + 432), f32(o + 436), f32(o + 440), f32(o + 444)],
            "enabled": m.track(o + 456, u8, 1),
        }
        # textures : une seule, ou trois indices de 5 bits (multitexture), avec
        # l'échelle des coordonnées des 2e et 3e textures (virgule fixe 2.5) et
        # leur défilement : vitesse moyenne et écart (virgule fixe 6.9, signe à
        # part : bit de poids fort)
        if flags & 0x10000000:
            p["textures"] = [textures[(tex >> (5 * k)) & 0x1F]["png"] for k in range(3)]
            p["mtScale"] = [u8(o + 44) / 32, u8(o + 45) / 32]
            fp = lambda v: (v & 0x7FFF) / 512 * (-1 if v & 0x8000 else 1)
            p["mtVel"] = [[fp(v) for v in m.u("2H", o + 476 + 4 * k)] for k in range(2)]
            p["mtVelVar"] = [[fp(v) for v in m.u("2H", o + 484 + 4 * k)] for k in range(2)]
        else:
            p["textures"] = [textures[tex]["png"]]
        if i < len(exp2):
            p.update(exp2[i])
        parts.append(p)
    out["particles"] = parts

    dst = os.path.join(ROOT, "assets", "models", "fx", f"{name}.m2.json")
    json.dump(out, open(dst, "w"), separators=(",", ":"))
    # textures des particules (celles des maillages sont déjà dans le .glb) ;
    # les passes à plusieurs textures aussi, le glTF n'en garde qu'une
    need = {t for p in parts for t in p["textures"]} | {t for p in passes for t in p["textures"]}
    os.makedirs(os.path.join(ROOT, "assets", "textures", "fx"), exist_ok=True)
    found = {}
    for d, _, files in os.walk(os.path.dirname(EXPORT)):
        for f in files:
            if f.endswith(".png"):
                found.setdefault(f[:-4], os.path.join(d, f))
    for t in sorted(need):
        srcp = os.path.join(EXPORT, t + ".png")
        srcp = srcp if os.path.exists(srcp) else found.get(t)
        if srcp:
            shutil.copy(srcp, os.path.join(ROOT, "assets", "textures", "fx", t + ".png"))
        else:
            print("texture absente de l'export :", t)
    print(dst, "—", len(passes), "passes,", len(parts), "émetteurs")


if __name__ == "__main__":
    main()
