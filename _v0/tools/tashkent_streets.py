#!/usr/bin/env python3
"""Builds js/tashkent.js: Tashkent's main streets, districts and metro stations.

Streets come from OpenStreetMap (trunk/primary/secondary roads, and long tertiary ones) inside
the city's 12 districts, within 2 km of a metro station, away from the city edge, without the
ring/bypass highways and side lanes, so the game shows places people know, not fields or suburbs. Points are sampled along each street and
kept only where Yandex has street panoramas (read from the public coverage tiles, so it does
not use the API key's daily limit).

    python3 tools/tashkent_streets.py            # needs Pillow; takes a few minutes
    python3 tools/tashkent_streets.py --cache /tmp/uzg-osm

Data: (c) OpenStreetMap contributors, ODbL.
"""
import argparse
import concurrent.futures
import io
import json
import math
import os
import re
import time
import urllib.parse
import urllib.request

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CITY_REL = 2216724  # Toshkent shahri
DISTRICT_RELS = [  # the 12 districts; Yangi Toshkent (new, mostly empty) is left out on purpose
    1751444, 2434059, 2439529, 2441651, 2441810, 2443769,
    2447546, 2447560, 2447634, 2448072, 5620904, 12030887,
]
# ring/bypass highways at the edge, and side lanes ("5-o‘tish", "tor ko‘chasi", dead ends)
EXCLUDE = re.compile(
    r"halqa avtomobil|aylanma|avtomobil yo|presidential|olmaliq|o.tish|tor ko.chasi|berk|proezd|tupik", re.I
)
STEP_KM = 0.22  # one point every ~220 m along a street
EDGE_KM = 0.8  # skip points this close to the city border
METRO_KM = 2.0  # and points farther than this from a metro station: the city you can get around
MIN_TERTIARY_KM = 1.5  # smaller tertiary streets are mostly local
UA = {"User-Agent": "UzbGuessr-tools/1.0 (github.com/NotiLo-A/UzbGuessr)"}
OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]


def fetch(url, data=None, tries=6):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, data=data, headers=UA)
            return urllib.request.urlopen(req, timeout=200).read()
        except Exception as e:  # busy servers are normal for Overpass
            print("  retry:", e)
            time.sleep(3 * (i + 1))
    raise RuntimeError("failed: " + url)


def overpass(query, cache, name):
    path = os.path.join(cache, name)
    if not os.path.exists(path):
        for attempt in range(6):
            body = fetch(OVERPASS[attempt % 2], urllib.parse.urlencode({"data": query}).encode())
            try:
                json.loads(body)
                break
            except ValueError:
                time.sleep(5)
        open(path, "wb").write(body)
    return json.load(open(path))["elements"]


# ---------- geometry ----------
def km(a, b):
    dx = (b[1] - a[1]) * 111.32 * math.cos(math.radians((a[0] + b[0]) / 2))
    dy = (b[0] - a[0]) * 110.57
    return math.hypot(dx, dy)


def rings(rel):
    """Outer rings of a relation (out geom) as [[lon, lat], ...], joining split ways."""
    ways = [[(p["lon"], p["lat"]) for p in m["geometry"]] for m in rel["members"]
            if m["type"] == "way" and m.get("role") in ("outer", "") and "geometry" in m]
    out = []
    while ways:
        ring = ways.pop(0)
        changed = True
        while changed and ring[0] != ring[-1]:
            changed = False
            for i, w in enumerate(ways):
                if w[0] == ring[-1]:
                    ring += w[1:]
                elif w[-1] == ring[-1]:
                    ring += w[-2::-1]
                elif w[-1] == ring[0]:
                    ring = w[:-1] + ring
                elif w[0] == ring[0]:
                    ring = w[:0:-1] + ring
                else:
                    continue
                ways.pop(i)
                changed = True
                break
        out.append(ring)
    return out


def inside(ring, lat, lon):
    c = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi) + xi:
            c = not c
        j = i
    return c


def edge_km(rings_, lat, lon):
    best = 1e9
    for ring in rings_:
        for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
            # point-segment distance in a local km frame
            kx = 111.32 * math.cos(math.radians(lat))
            ax, ay = (x1 - lon) * kx, (y1 - lat) * 110.57
            bx, by = (x2 - lon) * kx, (y2 - lat) * 110.57
            dx, dy = bx - ax, by - ay
            t = 0 if dx == dy == 0 else max(0, min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy)))
            best = min(best, math.hypot(ax + t * dx, ay + t * dy))
    return best


def simplify(pts, tol):
    """Douglas-Peucker on [lon, lat] points, tol in degrees."""
    if len(pts) < 3:
        return pts
    (x1, y1), (x2, y2) = pts[0], pts[-1]
    dmax, idx = 0, 0
    for i in range(1, len(pts) - 1):
        x0, y0 = pts[i]
        num = abs((y2 - y1) * x0 - (x2 - x1) * y0 + x2 * y1 - y2 * x1)
        den = math.hypot(y2 - y1, x2 - x1) or 1e-12
        if num / den > dmax:
            dmax, idx = num / den, i
    if dmax <= tol:
        return [pts[0], pts[-1]]
    return simplify(pts[: idx + 1], tol)[:-1] + simplify(pts[idx:], tol)


def simplify_ring(ring, tol):
    """A closed ring starts and ends on the same point, so simplify its two halves."""
    mid = len(ring) // 2
    return simplify(ring[: mid + 1], tol)[:-1] + simplify(ring[mid:], tol)


# ---------- Yandex panorama coverage tiles (elliptical Mercator) ----------
E = 0.0818191908426


def pixel(lat, lon, z):
    n = 256 * 2 ** z
    phi = math.radians(lat)
    con = E * math.sin(phi)
    y = math.log(math.tan(math.pi / 4 + phi / 2) * ((1 - con) / (1 + con)) ** (E / 2))
    return (lon + 180) / 360 * n, (0.5 - y / (2 * math.pi)) * n


class Coverage:
    def __init__(self, cache, z=16):
        self.dir = os.path.join(cache, "stv")
        os.makedirs(self.dir, exist_ok=True)
        self.z, self.tiles = z, {}

    def tile(self, x, y):
        if (x, y) not in self.tiles:
            path = os.path.join(self.dir, f"{self.z}_{x}_{y}.png")
            if not os.path.exists(path):
                url = f"https://core-stv-renderer.maps.yandex.net/2.x/tiles?l=stv&x={x}&y={y}&z={self.z}&v=1&format=png"
                open(path, "wb").write(fetch(url))
            data = open(path, "rb").read()
            self.tiles[(x, y)] = Image.open(io.BytesIO(data)).convert("RGBA") if data else None
        return self.tiles[(x, y)]

    def tile_of(self, lat, lon):
        px, py = pixel(lat, lon, self.z)
        return int(px // 256), int(py // 256)

    def prefetch(self, points, workers=8):
        """Downloads the tiles for these points in parallel (one at a time is very slow)."""
        need = {self.tile_of(*p) for p in points}
        need = [t for t in need if not os.path.exists(os.path.join(self.dir, f"{self.z}_{t[0]}_{t[1]}.png"))]
        print(f"  downloading {len(need)} coverage tiles…")
        with concurrent.futures.ThreadPoolExecutor(workers) as pool:
            list(pool.map(lambda t: self.tile(*t), need))

    def covered(self, lat, lon, r=3):
        px, py = pixel(lat, lon, self.z)
        tx, ty = int(px // 256), int(py // 256)
        img = self.tile(tx, ty)
        if img is None:
            return False
        cx, cy = int(px) - tx * 256, int(py) - ty * 256
        return any(
            0 <= cx + dx < 256 and 0 <= cy + dy < 256 and img.getpixel((cx + dx, cy + dy))[3] > 120
            for dx in range(-r, r + 1)
            for dy in range(-r, r + 1)
        )


# ---------- names ----------
CYR = re.compile("[Ѐ-ӿ]")


def uz_name(s):
    s = re.sub(r"\s*\((dublyor|дублёр|дублер)\)\s*", "", s, flags=re.I).strip()
    s = re.sub(r"([OoGg])[ʻʼ'`’‘]", "\\1‘", s)  # o‘, g‘
    s = re.sub(r"[ʻʼ'`’]", "’", s)  # tutuq belgisi
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"\b(Ko‘chasi|Yo‘li|Tumani|Shoh|Mavzesi)\b", lambda m: m.group(1).lower(), s)
    return s[0].upper() + s[1:]


def short_station(s):
    return re.sub(r"\s*\(.*\)\s*", "", s).strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", default=os.path.join(ROOT, ".cache-osm"))
    args = ap.parse_args()
    os.makedirs(args.cache, exist_ok=True)

    print("OpenStreetMap: city, districts, roads, metro…")
    city = overpass(f"[out:json][timeout:180];rel({CITY_REL});out geom;", args.cache, "city.json")[0]
    city_rings = rings(city)
    dist_rels = overpass(
        f"[out:json][timeout:180];rel(id:{','.join(map(str, DISTRICT_RELS))});out geom;",
        args.cache, "districts.json")
    area = f"area({3600000000 + CITY_REL})->.t;"
    roads = overpass(
        f'[out:json][timeout:180];{area}way["highway"~"^(trunk|primary|secondary|tertiary)$"]["name"](area.t);out geom tags;',
        args.cache, "roads.json")
    metro = overpass(
        f'[out:json][timeout:180];{area}(node["station"="subway"](area.t);node["railway"="station"]["subway"="yes"](area.t););out;',
        args.cache, "metro.json")

    districts = []
    for rel in dist_rels:
        if rel["id"] not in DISTRICT_RELS:
            continue
        t = rel["tags"]
        rs = [simplify_ring(r, 0.0004) for r in rings(rel)]
        districts.append({"uz": uz_name(t.get("name:uz") or t["name"]), "ru": t.get("name:ru", ""), "rings": rs})

    # ---- streets: group ways by normalised Uzbek name ----
    streets = {}
    for w in roads:
        t = w["tags"]
        raw = t.get("name:uz") if t.get("name:uz") and not CYR.search(t["name:uz"]) else t["name"]
        if CYR.search(raw) or EXCLUDE.search(raw):
            continue
        name = uz_name(raw)
        ru = t.get("name:ru") or (t["name"] if CYR.search(t["name"]) else "")
        s = streets.setdefault(name.lower(), {"uz": name, "ru": ru, "km": 0.0, "major": False, "ways": []})
        s["ru"] = s["ru"] or ru
        geom = [(p["lat"], p["lon"]) for p in w["geometry"]]
        s["km"] += sum(km(a, b) for a, b in zip(geom, geom[1:]))
        s["major"] |= t["highway"] != "tertiary"
        s["ways"].append(geom)

    stations = sorted(
        {(short_station(uz_name(e["tags"].get("name:uz") or e["tags"]["name"])),
          short_station(e["tags"].get("name:ru", "")), round(e["lat"], 5), round(e["lon"], 5))
         for e in metro if "lat" in e},
    )

    # 1. sample every street; keep points inside the districts, away from the edge, near the metro
    edge_rings = [simplify_ring(r, 0.0003) for r in city_rings]
    candidates = []  # (street, [points])
    print(f"{len(streets)} named streets; sampling…")
    for s in sorted(streets.values(), key=lambda s: -s["km"]):
        if not s["major"] and s["km"] < MIN_TERTIARY_KM:
            continue
        pts = []
        for geom in s["ways"]:
            left = STEP_KM / 2
            for a, b in zip(geom, geom[1:]):
                seg = km(a, b)
                while left <= seg:
                    f = left / seg
                    p = (a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f)
                    left += STEP_KM
                    if (
                        min(km(p, (m[2], m[3])) for m in stations) <= METRO_KM
                        and any(inside(r, p[0], p[1]) for d in districts for r in d["rings"])
                        and edge_km(edge_rings, p[0], p[1]) >= EDGE_KM
                    ):
                        pts.append(p)
                left -= seg
        if pts:
            candidates.append((s, pts))

    # 2. keep the ones on Yandex's panorama coverage, at most one per ~120 m cell
    cov = Coverage(args.cache)
    cov.prefetch([p for _, pts in candidates for p in pts])
    out = []
    for s, pts in candidates:
        kept, cells = [], set()
        for p in pts:
            cell = (round(p[0] / 0.0011), round(p[1] / 0.0014))
            if cell not in cells and cov.covered(*p):
                cells.add(cell)
                kept.append([round(p[0], 5), round(p[1], 5)])
        if kept:
            out.append([s["uz"], s["ru"], kept])

    out.sort(key=lambda x: x[0])
    data = {
        "streets": out,
        "districts": [[d["uz"], d["ru"], [[[round(x, 5), round(y, 5)] for x, y in r] for r in d["rings"]]] for d in districts],
        "metro": [list(s) for s in stations],
    }
    path = os.path.join(ROOT, "js", "tashkent.js")
    with open(path, "w", encoding="utf-8") as f:
        f.write("// Tashkent streets, districts and metro stations for the \"Toshkent ko‘chalari\" area.\n")
        f.write("// Generated by tools/tashkent_streets.py. Data © OpenStreetMap contributors (ODbL);\n")
        f.write("// points are kept only where Yandex has street panoramas.\n")
        f.write("// streets: [uz, ru, [[lat, lon], ...]]  districts: [uz, ru, rings of [lon, lat]]\n")
        f.write("// metro: [uz, ru, lat, lon]\n")
        f.write("const TASHKENT = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n")
    n = sum(len(x[2]) for x in out)
    print(f"wrote {path}: {len(out)} streets, {n} points, {len(districts)} districts, {len(stations)} metro stations")


if __name__ == "__main__":
    main()
