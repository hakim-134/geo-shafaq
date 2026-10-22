// Cities used for hints, round summaries and the map labels.
// [key, name, regionKey, lat, lon, labelOnMap]
const CITIES = [
  ["tashkent", "Toshkent", "tashkent_city", 41.3111, 69.2797, true],
  ["chirchiq", "Chirchiq", "tashkent_reg", 41.4689, 69.5822, true],
  ["angren", "Angren", "tashkent_reg", 41.0167, 70.1436, true],
  ["olmaliq", "Olmaliq", "tashkent_reg", 40.8447, 69.5983, false],
  ["yangiyol", "Yangiyo‘l", "tashkent_reg", 41.1122, 69.0469, false],
  ["nurafshon", "Nurafshon", "tashkent_reg", 41.0333, 69.35, false],
  ["bekobod", "Bekobod", "tashkent_reg", 40.2208, 69.2697, false],
  ["chimyon", "Chimyon", "tashkent_reg", 41.53, 70.02, false],
  ["samarkand", "Samarqand", "samarkand", 39.6542, 66.9597, true],
  ["kattakurgan", "Kattaqo‘rg‘on", "samarkand", 39.8986, 66.2561, false],
  ["bukhara", "Buxoro", "bukhara", 39.7747, 64.4286, true],
  ["khiva", "Xiva", "khorezm", 41.3783, 60.3639, true],
  ["urgench", "Urganch", "khorezm", 41.55, 60.6333, true],
  ["nukus", "Nukus", "karakalpakstan", 42.46, 59.61, true],
  ["muynak", "Mo‘ynoq", "karakalpakstan", 43.7683, 59.0214, true],
  ["namangan", "Namangan", "namangan", 40.9983, 71.6726, true],
  ["andijan", "Andijon", "andijan", 40.7821, 72.3442, true],
  ["fergana", "Farg‘ona", "fergana", 40.3864, 71.7864, true],
  ["kokand", "Qo‘qon", "fergana", 40.5286, 70.9425, true],
  ["margilan", "Marg‘ilon", "fergana", 40.4717, 71.7247, false],
  ["qarshi", "Qarshi", "kashkadarya", 38.8606, 65.7891, true],
  ["shahrisabz", "Shahrisabz", "kashkadarya", 39.0578, 66.8342, true],
  ["termez", "Termiz", "surkhandarya", 37.2242, 67.2783, true],
  ["denov", "Denov", "surkhandarya", 38.2667, 67.9, false],
  ["jizzakh", "Jizzax", "jizzakh", 40.1158, 67.8422, true],
  ["guliston", "Guliston", "syrdarya", 40.4897, 68.7842, true],
  ["navoiy", "Navoiy", "navoiy", 40.0844, 65.3792, true],
  ["zarafshon", "Zarafshon", "navoiy", 41.5733, 64.2, false],
].map(([key, name, region, lat, lon, label]) => ({ key, name, region, lat, lon, label }));

// The map for the streets area opens on the places themselves, not on the whole region.
function streetBounds() {
  const pts = TASHKENT.streets.flatMap(([, , p]) => p);
  const lats = pts.map((p) => p[0]);
  const lons = pts.map((p) => p[1]);
  const pad = 0.01;
  return [
    [Math.min(...lats) - pad, Math.min(...lons) - pad],
    [Math.max(...lats) + pad, Math.max(...lons) + pad],
  ];
}

// Game areas. `cities` filters the location pool by nearest city; null = everything.
// `scaleKm` sets how fast the score drops with distance (GeoGuessr-style: ~map size / 10).
// `streets`: points come from TASHKENT.streets (js/tashkent.js), one group per street, and the
// panorama must stay on that street (`maxSnapKm`), so the place can be named and learned.
// Keep scaleKm in sync with server/score.go.
const AREAS = {
  uzbekistan: {
    cities: null,
    scaleKm: 150,
    bounds: [
      [37.1, 55.9],
      [45.6, 73.2],
    ],
  },
  tashkent: {
    cities: ["tashkent"],
    scaleKm: 4,
    bounds: [
      [41.2, 69.1],
      [41.42, 69.45],
    ],
  },
  tashkent_streets: {
    streets: true,
    scaleKm: 4,
    maxSnapKm: 0.12,
    jitter: false,
    weightPow: 0.75, // long main streets come up more often than small ones
    bounds: streetBounds(),
  },
  historic: {
    cities: ["samarkand", "bukhara", "khiva", "shahrisabz"],
    scaleKm: 80,
    bounds: [
      [38.9, 60.1],
      [41.7, 67.2],
    ],
  },
};

// Difficulty presets. `scoreMul` stretches the scoring scale (bigger = more forgiving).
const DIFFICULTIES = {
  easy: { scoreMul: 2, hints: true, hintCost: 0, streetNames: true, cityLabels: true },
  normal: { scoreMul: 1, hints: true, hintCost: 0.2, streetNames: false, cityLabels: true },
  hard: { scoreMul: 0.6, hints: false, hintCost: 0, streetNames: false, cityLabels: false },
};

function nearestCity(lat, lon) {
  let best = null;
  let bestD = Infinity;
  for (const c of CITIES) {
    const d = distanceKm(lat, lon, c.lat, c.lon);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return { city: best, km: bestD };
}

// Verified panorama points of one area, grouped by nearest city.
function areaGroups(area) {
  if (area.streets) {
    return Object.fromEntries(TASHKENT.streets.map(([uz, , pts]) => [uz, pts]));
  }
  const groups = {};
  const [[s, w], [n, e]] = area.bounds;
  for (const [lat, lon] of LOCATIONS) {
    if (lat < s || lat > n || lon < w || lon > e) continue;
    const { city } = nearestCity(lat, lon);
    if (area.cities && !area.cities.includes(city.key)) continue;
    (groups[city.key] = groups[city.key] || []).push([lat, lon]);
  }
  return groups;
}

// Point-in-polygon against the embedded border (js/border.js).
function insideUzbekistan(lat, lon) {
  const inRing = (ring) => {
    let c = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  return UZ_BORDER.coordinates.some((p) => inRing(p[0]) && !p.slice(1).some(inRing));
}

// ---------- Tashkent: district, street and nearest metro for a place ----------
function inRings(rings, lat, lon) {
  return rings.some((ring) => {
    let c = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  });
}

// Names are [uz, ru]; English uses the Uzbek (Latin) name, as street signs do.
function localName(uz, ru) {
  return LANG === "ru" && ru ? ru : uz;
}

// null outside Tashkent's districts. Otherwise { district, street|null, metro: { name, km } }.
function tashkentPlace(lat, lon) {
  const d = TASHKENT.districts.find(([, , rings]) => inRings(rings, lat, lon));
  if (!d) return null;
  let street = null;
  let streetKm = 0.15; // only name a street the place is really on
  for (const [uz, ru, pts] of TASHKENT.streets) {
    for (const p of pts) {
      const km = distanceKm(lat, lon, p[0], p[1]);
      if (km < streetKm) {
        streetKm = km;
        street = { key: uz, name: localName(uz, ru) };
      }
    }
  }
  let metro = null;
  for (const [uz, ru, mLat, mLon] of TASHKENT.metro) {
    const km = distanceKm(lat, lon, mLat, mLon);
    if (!metro || km < metro.km) metro = { name: localName(uz, ru), km };
  }
  return { district: localName(d[0], d[1]), street, metro };
}

// Short name of a place for tables and pins: the street in Tashkent, otherwise the city.
function placeLabel(lat, lon) {
  const tp = tashkentPlace(lat, lon);
  if (tp && tp.street) return tp.street.name;
  return nearestCity(lat, lon).city.name;
}

function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
