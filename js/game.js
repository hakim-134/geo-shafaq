// ================= settings =================
// game.html?room=CODE (or room=new) is a live room with friends, see js/room.js.
const ROOM_MODE = new URLSearchParams(window.location.search).has("room");
const COLORS = { guess: "#0099b5", actual: "#1eb53a", line: "#ce1126" };
const YANDEX_LANG = { uz: "uz_UZ", en: "en_US", ru: "ru_RU" };

// Solo games read the menu settings; a room sets them from the server.
let area, areaKey, diffKey, diff, totalRounds, roundTime, scaleKm;
let POOL, POOL_WEIGHTS, POOL_WEIGHT_SUM;

function soloSettings() {
  return {
    area: ls(SK.area, "tashkent"),
    diff: ls(SK.difficulty, "easy"),
    rounds: parseInt(ls(SK.rounds, "5")),
    time: parseInt(ls(SK.time, "0")),
  };
}

function configure(s) {
  areaKey = AREAS[s.area] ? s.area : "tashkent";
  area = AREAS[areaKey];
  diffKey = DIFFICULTIES[s.diff] ? s.diff : "easy";
  diff = DIFFICULTIES[diffKey];
  totalRounds = Math.min(Math.max(s.rounds || 5, 1), 10);
  roundTime = Math.max(s.time || 0, 0);
  scaleKm = area.scaleKm * diff.scoreMul;
  // Pick a city (or street) first, weighted by sqrt(points), so cities with few panoramas still
  // show up but Tashkent doesn't dominate.
  POOL = Object.values(areaGroups(area));
  POOL_WEIGHTS = POOL.map((g) => Math.pow(g.length, area.weightPow || 0.5));
  POOL_WEIGHT_SUM = POOL_WEIGHTS.reduce((a, b) => a + b, 0);
}

const state = {
  round: 0,
  total: 0,
  rounds: [], // { actual:[lat,lon], guess:[lat,lon]|null, km, score, hint, city }
  used: [],
  startPano: null,
  startDir: null,
  actual: null,
  guess: null,
  hintUsed: false,
  timerId: null,
  deadlineAt: 0,
  warned: new Set(), // timer warnings already shown this round
  lastTick: 0,
  inRound: false,
  saved: false,
};

// ================= location pool =================
function pickGroup() {
  let r = Math.random() * POOL_WEIGHT_SUM;
  for (let i = 0; i < POOL.length; i++) {
    r -= POOL_WEIGHTS[i];
    if (r <= 0) return POOL[i];
  }
  return POOL[POOL.length - 1];
}

function pickPoint() {
  const minKm = scaleKm * 0.3;
  for (let i = 0; i < 40; i++) {
    const group = pickGroup();
    const p = group[Math.floor(Math.random() * group.length)];
    const fresh = state.used.every((u) => distanceKm(u[0], u[1], p[0], p[1]) > minKm);
    if (fresh || i === 39) {
      if (area.jitter === false) return p; // street points are dense already and must stay on the street
      // small jitter so the same pool point gives different panoramas
      return [p[0] + (Math.random() - 0.5) * 0.002, p[1] + (Math.random() - 0.5) * 0.002];
    }
  }
}

// ================= loader =================
const loader = document.getElementById("loader");
let retryAction = null;
// onRetry: what "Try again" does; null = no buttons (still loading).
function showLoader(textKey, onRetry) {
  loader.classList.remove("hidden");
  loader.classList.toggle("error", !!onRetry);
  document.getElementById("loader-text").textContent = t(textKey);
  document.getElementById("loader-actions").hidden = !onRetry;
  document.getElementById("loader-key").hidden = textKey !== "keyFail" && textKey !== "noKey";
  retryAction = onRetry;
}
document.getElementById("loader-retry").addEventListener("click", () => retryAction && retryAction());
const reload = () => window.location.reload();
function hideLoader() {
  loader.classList.add("hidden");
}

// ================= Yandex =================
function loadYandex() {
  return new Promise((resolve, reject) => {
    const key = (window.UZG_CONFIG && window.UZG_CONFIG.yandexApiKey) || "";
    const s = document.createElement("script");
    s.src =
      "https://api-maps.yandex.ru/2.1/?lang=" +
      (YANDEX_LANG[LANG] || "ru_RU") +
      (key ? "&apikey=" + encodeURIComponent(key) : "");
    s.onload = () => window.ymaps.ready(resolve, reject);
    // Yandex answers 403 JSON for a bad or exhausted key; the browser then blocks the script.
    s.onerror = () => reject(new Error(navigator.onLine === false ? "offline" : "key"));
    document.head.appendChild(s);
  });
}

let player = null;

// Returns { pano } or { error: "key" | "none" }. A panorama is accepted only if it is inside
// Uzbekistan's border and close to the point we asked for.
async function findPanorama() {
  let failures = 0;
  for (let attempt = 0; attempt < 8; attempt++) {
    const point = pickPoint();
    try {
      const found = await ymaps.panorama.locate(point);
      if (!found.length) continue;
      const [lat, lon] = found[0].getPosition();
      const snapKm = distanceKm(lat, lon, point[0], point[1]);
      if (!insideUzbekistan(lat, lon) || snapKm > (area.maxSnapKm || 1)) continue;
      return { pano: found[0] };
    } catch (e) {
      failures++;
      console.warn("panorama.locate failed", e);
    }
  }
  return { error: failures >= 8 ? "key" : "none" };
}

function preparePanorama(pano) {
  // Hide house numbers / POI labels unless the difficulty shows street names.
  if (!diff.streetNames) pano.getMarkers = () => [];
  return pano;
}

async function showPanorama(pano) {
  const dir = [Math.floor(Math.random() * 360), 0];
  state.startPano = pano;
  state.startDir = dir;
  if (!player) {
    player = new ymaps.panorama.Player("player", pano, {
      direction: dir,
      controls: ["zoomControl"],
      suppressMapOpenBlock: true,
      hotkeysEnabled: true,
    });
  } else {
    await player.setPanorama(pano);
    player.setDirection(dir);
  }
}

// ================= minimap =================
const WORLD_RING = [
  [-180, -90],
  [180, -90],
  [180, 90],
  [-180, 90],
  [-180, -90],
];

const tileLayers = {
  // crossOrigin: OSM sends CORS headers, so the result map can go into a screenshot
  map: () =>
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap",
      crossOrigin: true,
    }),
  satellite: () =>
    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 19, attribution: "© Esri" },
    ),
};

function pinIcon(color) {
  return L.divIcon({
    className: "",
    html: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 32 40"><path fill="${color}" stroke="#fff" stroke-width="2.5" d="M16 1.5C9.4 1.5 4 6.9 4 13.5c0 8 12 25 12 25s12-17 12-25C28 6.9 22.6 1.5 16 1.5z"/><circle cx="16" cy="13.5" r="4.5" fill="#fff"/></svg>`,
    iconSize: [28, 36],
    iconAnchor: [14, 36],
  });
}
const ICON_GUESS = pinIcon(COLORS.guess);
const ICON_ACTUAL = pinIcon(COLORS.actual);

// Everything outside Uzbekistan is dimmed, so the player sees where guesses make sense.
function addBorder(map, withMask) {
  if (withMask) {
    L.geoJSON(
      {
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [WORLD_RING, ...UZ_BORDER.coordinates.map((p) => p[0])] },
      },
      { style: { fillColor: "#0d1626", fillOpacity: 0.4, stroke: false }, interactive: false },
    ).addTo(map);
  }
  L.geoJSON(
    { type: "Feature", geometry: UZ_BORDER },
    { style: { color: COLORS.guess, weight: 2, fill: false }, interactive: false },
  ).addTo(map);
}

let minimap;
let guessMarker = null;
let hintCircle = null;
let currentTiles = null;

function initMinimap() {
  minimap = L.map("minimap", {
    zoomControl: false,
    attributionControl: true,
    zoomSnap: 0.25,
    maxBounds: L.latLngBounds(AREAS.uzbekistan.bounds).pad(0.4),
    worldCopyJump: false,
  });
  minimap.attributionControl.setPrefix(false);
  setLayer("map");
  addBorder(minimap, true);
  applyMapSettings();

  // metro names overlap when zoomed out; show them from street level up
  const metroNames = () => minimap.getContainer().classList.toggle("metro-names", minimap.getZoom() >= 12.5);
  minimap.on("zoomend", metroNames);
  metroNames();

  minimap.on("click", (e) => {
    if (!state.inRound) return;
    placeGuess(e.latlng);
  });

  document.querySelectorAll(".map-toolbar [data-layer]").forEach((b) => {
    b.addEventListener("click", () => setLayer(b.dataset.layer));
  });

  const container = document.getElementById("minimap-container");
  const resize = () => setTimeout(() => minimap.invalidateSize({ animate: false }), 260);
  container.addEventListener("mouseenter", resize);
  container.addEventListener("mouseleave", resize);
  document.getElementById("map-size").addEventListener("click", () => {
    container.classList.toggle("big");
    container.classList.toggle("pinned");
    resize();
  });
  document.getElementById("map-fab").addEventListener("click", toggleMobileMap);
}

// City names (easy/normal, outside Tashkent) and the zoom depend on the settings; a room can
// change them in the lobby, so this runs again then.
let cityLayer = null;
function applyMapSettings() {
  if (cityLayer) minimap.removeLayer(cityLayer);
  cityLayer = L.layerGroup().addTo(minimap);
  if (area.streets && diff.cityLabels) {
    // metro stations are how people find their way in Tashkent: names on easy, dots on normal
    for (const [uz, ru, lat, lon] of TASHKENT.metro) {
      const m = L.circleMarker([lat, lon], {
        radius: 4,
        color: "#fff",
        weight: 1.5,
        fillColor: "#1c7ed6",
        fillOpacity: 1,
        interactive: false,
      });
      if (diffKey === "easy") {
        m.bindTooltip(localName(uz, ru), { permanent: true, direction: "right", className: "metro-label", offset: [3, 0] });
      }
      m.addTo(cityLayer);
    }
  } else if (diff.cityLabels && areaKey !== "tashkent") {
    for (const c of CITIES) {
      if (!c.label) continue;
      L.circleMarker([c.lat, c.lon], {
        radius: 3,
        color: "#13233f",
        weight: 1,
        fillColor: "#fff",
        fillOpacity: 1,
        interactive: false,
      })
        .bindTooltip(c.name, {
          permanent: true,
          direction: "right",
          className: "city-label",
          offset: [4, 0],
        })
        .addTo(cityLayer);
    }
  }
  fitArea();
}

function toggleMobileMap(force) {
  const container = document.getElementById("minimap-container");
  const open = typeof force === "boolean" ? force : !container.classList.contains("open");
  container.classList.toggle("open", open);
  document.getElementById("map-fab").textContent = open ? "✕" : t("map");
  setTimeout(() => {
    minimap.invalidateSize({ animate: false });
    if (open && pendingFit) fitMinimap(pendingFit);
  }, 50);
}

function setLayer(key) {
  if (currentTiles) minimap.removeLayer(currentTiles);
  currentTiles = tileLayers[key]().addTo(minimap);
  currentTiles.bringToBack();
  document.querySelectorAll(".map-toolbar [data-layer]").forEach((b) => {
    b.classList.toggle("active", b.dataset.layer === key);
  });
}

// A hidden map (phone layout) has no size, so remember the bounds and fit again when shown.
let pendingFit = null;
function fitMinimap(bounds) {
  minimap.fitBounds(bounds, { animate: false, padding: [10, 10] });
  pendingFit = minimap.getSize().x ? null : bounds;
}
function fitArea() {
  fitMinimap(L.latLngBounds(area.bounds));
}

function placeGuess(latlng) {
  state.guess = [latlng.lat, latlng.lng];
  if (guessMarker) guessMarker.setLatLng(latlng);
  else guessMarker = L.marker(latlng, { icon: ICON_GUESS, interactive: false }).addTo(minimap);
  const btn = document.getElementById("guess-btn");
  btn.disabled = false;
  btn.textContent = t("guess");
  if (ROOM_MODE) roomSendPin(); // counts if the round ends before "Guess"
}

// ================= HUD =================
function updateHud() {
  document.getElementById("hud-round").textContent = `${state.round} / ${totalRounds}`;
  document.getElementById("hud-score").textContent = fmtNum(state.total);
  document.getElementById("hud-dots").innerHTML = Array.from({ length: totalRounds }, (_, i) => {
    const r = state.rounds[i];
    const cls = r ? (r.score >= 4000 ? "hi" : r.score >= 2000 ? "mid" : "lo") : i === state.round - 1 ? "now" : "";
    return `<i class="${cls}"></i>`;
  }).join("");
}

function setupHintButton() {
  const btn = document.getElementById("btn-hint");
  btn.hidden = !diff.hints;
  btn.disabled = false;
  const tag = document.getElementById("hint-tag");
  if (diff.hintCost) {
    tag.textContent = `−${Math.round(diff.hintCost * 100)}%`;
    tag.classList.add("cost");
  } else {
    tag.textContent = t("hintFree");
    tag.classList.remove("cost");
  }
}

function useHint() {
  if (!diff.hints || state.hintUsed || !state.inRound || !state.actual) return;
  state.hintUsed = true;
  document.getElementById("btn-hint").disabled = true;
  if (ROOM_MODE && state.guess) roomSendPin(); // the pin now costs the hint

  const [lat, lon] = state.actual;
  const { city } = nearestCity(lat, lon);
  const tp = tashkentPlace(lat, lon);
  const banner = document.getElementById("hint-banner");
  banner.textContent = tp ? `${t("district")}: ${tp.district}` : `${t("hintRegion")}: ${regionName(city.region)}`;
  banner.classList.add("show");

  // Circle that contains the real place, but is not centred on it.
  const radiusKm = Math.max(area.scaleKm * 0.4, 1);
  const ang = Math.random() * Math.PI * 2;
  const off = radiusKm * 0.6 * Math.random();
  const cLat = lat + (off / 111) * Math.sin(ang);
  const cLon = lon + (off / (111 * Math.cos((lat * Math.PI) / 180))) * Math.cos(ang);
  hintCircle = L.circle([cLat, cLon], {
    radius: radiusKm * 1000,
    color: COLORS.line,
    weight: 2,
    fillColor: COLORS.line,
    fillOpacity: 0.08,
    dashArray: "6 6",
    interactive: false,
  }).addTo(minimap);
  fitMinimap(hintCircle.getBounds());
  if (window.innerWidth <= 700) toggleMobileMap(true);
}

// ================= timer =================
// seconds = 0 hides the timer. Calling it again moves the deadline (rooms shorten it).
function startTimer(seconds = roundTime) {
  const chip = document.getElementById("hud-timer-chip");
  stopTimer();
  if (!seconds) {
    chip.hidden = true;
    return;
  }
  chip.hidden = false;
  state.deadlineAt = Date.now() + seconds * 1000;
  // a deadline that starts below a warning (a room resync) skips it
  state.warned = new Set(WARN_AT.filter((w) => seconds <= w));
  state.lastTick = 0;
  renderTimer();
  state.timerId = setInterval(() => {
    renderTimer();
    if (state.inRound) timerAlerts();
    if (Date.now() >= state.deadlineAt) {
      stopTimer();
      if (state.inRound) {
        showToast(t("timeUp"));
        submitGuess();
      }
    }
  }, 250);
}
function stopTimer() {
  clearInterval(state.timerId);
  state.timerId = null;
  document.getElementById("danger-vignette").classList.remove("on", "fast");
}
const timerLeft = () => Math.max(Math.ceil((state.deadlineAt - Date.now()) / 1000), 0);
function renderTimer() {
  const s = timerLeft();
  document.getElementById("hud-timer").textContent =
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const chip = document.getElementById("hud-timer-chip");
  chip.classList.toggle("warn", s <= WARN_AT[0] && s > 10);
  chip.classList.toggle("low", s <= 10);

  // red at the screen edges, like low health in a game: grows from 15 s, beats faster from 10 s
  const left = (state.deadlineAt - Date.now()) / 1000;
  const on = state.inRound && left <= WARN_AT[0];
  const vignette = document.getElementById("danger-vignette");
  vignette.classList.toggle("on", on);
  vignette.classList.toggle("fast", on && s <= 10);
  vignette.style.setProperty("--danger", Math.min(Math.max(1 - left / WARN_AT[0], 0), 1));
}

// Near the end: a toast and a beep at 15 and 10 seconds, a tick each of the last 5.
const WARN_AT = [15, 10];
function timerAlerts() {
  const s = timerLeft();
  const due = WARN_AT.filter((w) => s <= w && !state.warned.has(w));
  if (due.length) {
    due.forEach((w) => state.warned.add(w));
    const msg = t("secondsLeft").replace("{n}", s);
    showToast(state.guess ? msg : `${msg} ${t("placePin")}`, 2500);
    beep(s <= 10 ? 990 : 740, 0.18);
    if (s <= 10 && navigator.vibrate) navigator.vibrate(150);
  } else if (s <= 5 && s > 0 && s !== state.lastTick) {
    beep(1200, 0.06);
  }
  state.lastTick = s;
}

// Browsers keep audio muted until the player touches the page; any click or key unlocks it.
let audioCtx = null;
function unlockAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  if (!audioCtx) audioCtx = new AC();
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
}
document.addEventListener("pointerdown", unlockAudio, true);
document.addEventListener("keydown", unlockAudio, true);
function beep(freq, seconds) {
  if (!audioCtx || audioCtx.state !== "running") return;
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.12, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + seconds);
}

// ================= rounds =================
// retry = load another panorama for the same round after a failure.
async function startRound(retry) {
  if (retry !== true) state.round++;
  resetRoundUi();

  const { pano, error } = await findPanorama();
  if (!pano) {
    showLoader(error === "key" ? "keyFail" : "noPano", () => startRound(true));
    return;
  }
  await beginPanorama(pano);
}

// Clears the pin, hint and buttons and shows the loader before a new panorama.
function resetRoundUi() {
  state.guess = null;
  state.actual = null;
  state.hintUsed = false;
  state.inRound = false;
  stopTimer();
  updateHud();
  hideOverlay();
  showLoader("loading");

  if (guessMarker) {
    minimap.removeLayer(guessMarker);
    guessMarker = null;
  }
  if (hintCircle) {
    minimap.removeLayer(hintCircle);
    hintCircle = null;
  }
  document.getElementById("hint-banner").classList.remove("show");
  const guessBtn = document.getElementById("guess-btn");
  guessBtn.disabled = true;
  guessBtn.textContent = t("placePin");
  setupHintButton();
  fitArea();
}

// timerSeconds: solo uses the round time; a room passes what the server says is left.
async function beginPanorama(pano, timerSeconds = roundTime) {
  await showPanorama(preparePanorama(pano));
  state.actual = pano.getPosition();
  state.used.push(state.actual);
  state.inRound = true;
  hideLoader();
  startTimer(timerSeconds);
}

function calcScore(km) {
  if (km <= scaleKm * 0.01) return 5000;
  return Math.round(5000 * Math.exp(-km / scaleKm));
}

function submitGuess() {
  if (!state.inRound) return;
  state.inRound = false;
  stopTimer();
  toggleMobileMap(false);
  if (ROOM_MODE) {
    roomSubmitGuess(); // js/room.js: the server scores it
    return;
  }

  const [aLat, aLon] = state.actual;
  let km = null;
  let score = 0;
  if (state.guess) {
    km = distanceKm(aLat, aLon, state.guess[0], state.guess[1]);
    score = calcScore(km);
    if (state.hintUsed && diff.hintCost) score = Math.round(score * (1 - diff.hintCost));
  }
  const { city } = nearestCity(aLat, aLon);
  const r = { actual: state.actual, guess: state.guess, km, score, hint: state.hintUsed, city };
  state.rounds.push(r);
  state.total += score;
  updateHud();
  showRoundResult(r);
}

function returnToStart() {
  if (!player || !state.startPano || !state.inRound) return;
  player.setPanorama(state.startPano).then(() => player.setDirection(state.startDir));
}

// ================= result overlay =================
let resultMap = null;
let resultLayer = null;

function ensureResultMap() {
  if (resultMap) return;
  resultMap = L.map("result-map", { zoomControl: true, attributionControl: true });
  resultMap.attributionControl.setPrefix(false);
  tileLayers.map().addTo(resultMap);
  addBorder(resultMap, false);
  resultLayer = L.layerGroup().addTo(resultMap);
}

function drawPairs(list) {
  resultLayer.clearLayers();
  const pts = [];
  list.forEach((r, i) => {
    const label = list.length > 1 ? `${t("round")} ${i + 1}` : t("actual");
    L.marker(r.actual, { icon: ICON_ACTUAL })
      .bindTooltip(`${label}: ${escapeHtml(placeLabel(r.actual[0], r.actual[1]))}`)
      .addTo(resultLayer);
    pts.push(r.actual);
    if (r.guess) {
      L.marker(r.guess, { icon: ICON_GUESS }).bindTooltip(t("yourGuess")).addTo(resultLayer);
      L.polyline([r.actual, r.guess], {
        color: COLORS.line,
        weight: 2.5,
        opacity: 0.85,
        dashArray: "8 8",
      }).addTo(resultLayer);
      pts.push(r.guess);
    }
  });
  fitResultMap(pts);
}

function fitResultMap(pts) {
  setTimeout(() => {
    resultMap.invalidateSize({ animate: false });
    if (pts.length === 1) resultMap.setView(pts[0], 14, { animate: false });
    else
      resultMap.fitBounds(L.latLngBounds(pts), { padding: [60, 60], maxZoom: 16, animate: false });
  }, 30);
}

function verdict(score) {
  if (score >= 4900) return t("perfect");
  if (score >= 4000) return t("great");
  if (score >= 2500) return t("good");
  if (score >= 1000) return t("ok");
  return t("far");
}

let countAnim = 0;
function setScoreCard(label, score, max, km) {
  document.getElementById("ov-score-label").textContent = label;
  document.getElementById("ov-score-max").textContent = `/ ${fmtNum(max)}`;
  const d = km != null ? fmtDistance(km) : null;
  document.getElementById("ov-distance").textContent = d ? `${d.value} ${d.unit}` : "—";

  const bar = document.getElementById("ov-bar");
  bar.style.width = "0";
  requestAnimationFrame(() => requestAnimationFrame(() => (bar.style.width = (score / max) * 100 + "%")));

  // count up from 0, ease-out
  const out = document.getElementById("ov-score");
  const start = performance.now();
  const id = ++countAnim;
  const step = (now) => {
    if (id !== countAnim) return;
    const k = Math.min((now - start) / 900, 1);
    out.textContent = fmtNum(score * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function setActions(buttons) {
  const box = document.getElementById("ov-actions");
  box.innerHTML = "";
  buttons.forEach(([cls, label, fn]) => {
    const b = document.createElement("button");
    b.className = "btn " + cls;
    b.textContent = label;
    b.addEventListener("click", fn);
    box.appendChild(b);
  });
}

function showOverlay() {
  document.getElementById("overlay").classList.add("show");
  ensureResultMap();
}
function hideOverlay() {
  document.getElementById("overlay").classList.remove("show");
}
function overlayVisible() {
  return document.getElementById("overlay").classList.contains("show");
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

function showRoundResult(r) {
  showOverlay();
  document.getElementById("ov-sub").textContent = `${t("round")} ${state.round} / ${totalRounds}`;
  document.getElementById("ov-title").textContent = r.guess ? verdict(r.score) : t("noGuess");
  setScoreCard(t("score"), r.score, 5000, r.km);
  document.getElementById("ov-table").innerHTML = "";

  renderPlaceCard(r.actual);

  const last = state.round >= totalRounds;
  setActions([
    ["btn-primary", last ? t("finish") : t("next"), last ? showFinal : () => startRound()],
    ["btn-ghost", t("menu"), () => (window.location.href = "index.html")],
  ]);
  drawPairs([r]);
}

// "You were here": the street, district and nearest metro in Tashkent (to learn the city),
// the city and region elsewhere, the address, and a link to see the spot in Yandex Maps.
function renderPlaceCard([lat, lon]) {
  const tp = tashkentPlace(lat, lon);
  const { city } = nearestCity(lat, lon);
  let title = `${city.name} · ${regionName(city.region)}`;
  const lines = [];
  if (tp) {
    title = tp.street ? tp.street.name : tp.district;
    if (tp.street) lines.push(tp.district);
    if (tp.metro) {
      const d = fmtDistance(tp.metro.km);
      lines.push(`${t("metro")}: ${tp.metro.name} · ${d.value} ${d.unit}`);
    }
    if (tp.street) markStreetSeen(tp.street.key);
  }
  const mapUrl = `https://yandex.uz/maps/?pt=${lon},${lat}&z=17&l=map`;
  document.getElementById("ov-place").innerHTML = `${escapeHtml(t("youWereIn"))}:<b>${escapeHtml(title)}</b>${lines
    .map((l) => `<span class="place-line">${escapeHtml(l)}</span>`)
    .join("")}<span id="ov-address"></span><a class="place-map" href="${mapUrl}" target="_blank" rel="noopener">${escapeHtml(
    t("openMap"),
  )} ↗</a>`;
  reverseGeocode([lat, lon]).then((addr) => {
    const el = document.getElementById("ov-address");
    if (el && addr) el.textContent = addr;
  });
}

// Yandex geocoder first (needs a key with the geocoder enabled), then OSM Nominatim.
function reverseGeocode(coords) {
  return ymaps
    .geocode(coords, { results: 1 })
    .then((res) => {
      const obj = res.geoObjects.get(0);
      if (!obj) throw new Error("empty");
      return obj.getAddressLine();
    })
    .catch(() =>
      fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&lat=${coords[0]}&lon=${coords[1]}&accept-language=${LANG}`,
      )
        .then((r) => r.json())
        .then((d) => {
          const a = d.address || {};
          return [a.road, a.neighbourhood || a.suburb || a.quarter, a.city_district, a.city || a.town || a.village]
            .filter(Boolean)
            .filter((v, i, arr) => arr.indexOf(v) === i)
            .join(", ");
        }),
    )
    .catch(() => "");
}

// Adds a finished game to the menu stats and history. Returns true for a new best.
function recordGame(total, extra) {
  const isBest = total > (parseInt(ls(SK.best, "0")) || 0);
  lsSet(SK.games, (parseInt(ls(SK.games, "0")) || 0) + 1);
  lsSet(SK.totalScore, (parseInt(ls(SK.totalScore, "0")) || 0) + total);
  lsSet(SK.totalRounds, (parseInt(ls(SK.totalRounds, "0")) || 0) + totalRounds);
  if (isBest) lsSet(SK.best, total);
  pushHistory({
    t: Date.now(),
    area: areaKey,
    diff: diffKey,
    rounds: totalRounds,
    score: total,
    max: totalRounds * 5000,
    ...extra,
  });
  return isBest;
}

function showFinal() {
  const max = totalRounds * 5000;
  if (!state.saved) {
    state.saved = true;
    state.isBest = recordGame(state.total);
  }
  const isBest = state.isBest;

  showOverlay();
  const nick = ls(SK.nick, "");
  document.getElementById("ov-sub").textContent =
    `${t("area_" + areaKey)} · ${t("diff_" + diffKey)}${nick ? " · " + nick : ""}`;
  document.getElementById("ov-title").textContent = isBest ? t("newBest") : t("gameOver");
  const sumKm = state.rounds.reduce((s, r) => s + (r.km || 0), 0);
  setScoreCard(t("total"), state.total, max, sumKm);
  document.getElementById("ov-place").innerHTML = "";

  const table = document.getElementById("ov-table");
  table.innerHTML = state.rounds
    .map((r, i) => {
      const dist = r.km != null ? fmtDistance(r.km) : null;
      return `<tr data-i="${i}"><td>${i + 1}</td><td>${escapeHtml(placeLabel(r.actual[0], r.actual[1]))}</td><td>${
        dist ? `${dist.value} ${dist.unit}` : "—"
      }</td><td>${fmtNum(r.score)}</td></tr>`;
    })
    .join("");
  table.querySelectorAll("tr").forEach((tr) =>
    tr.addEventListener("click", () => drawPairs([state.rounds[+tr.dataset.i]])),
  );

  setActions([
    ["btn-primary", t("playAgain"), () => window.location.reload()],
    ["btn-sky", t("share"), () => shareScreenshot(resultText(), "uzbguessr.png")],
    ["btn-ghost", t("menu"), () => (window.location.href = "index.html")],
  ]);
  drawPairs(state.rounds);
}

function resultText() {
  const lines = state.rounds.map((r, i) => {
    const sq = r.score >= 4000 ? "🟩" : r.score >= 2000 ? "🟨" : "🟥";
    return `${sq} ${t("round")} ${i + 1}: ${fmtNum(r.score)}`;
  });
  return `UzbGuessr — ${t("area_" + areaKey)}\n${t("total")}: ${fmtNum(state.total)} / ${fmtNum(
    totalRounds * 5000,
  )}\n${lines.join("\n")}`;
}

// ================= screenshot of the final screen =================
const HTML2CANVAS = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
let html2canvasLoad = null;
function loadHtml2canvas() {
  html2canvasLoad =
    html2canvasLoad ||
    new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = HTML2CANVAS;
      s.onload = resolve;
      s.onerror = () => {
        html2canvasLoad = null;
        reject(new Error("html2canvas"));
      };
      document.head.appendChild(s);
    });
  return html2canvasLoad;
}

// The overlay as a PNG, without the buttons. html2canvas draws the side panel; it misplaces
// Leaflet's moved layers, so the map is drawn by hand from where its pieces are on screen.
async function captureOverlay() {
  await loadHtml2canvas();
  const el = document.getElementById("overlay");
  const mapEl = document.getElementById("result-map");
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  const canvas = await html2canvas(el, {
    backgroundColor: getComputedStyle(el).backgroundColor,
    scale,
    logging: false,
    ignoreElements: (n) => n.id === "ov-actions" || n === mapEl,
  });
  await drawMapShot(canvas.getContext("2d"), mapEl, el.getBoundingClientRect(), scale);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/png"),
  );
}

async function drawMapShot(ctx, mapEl, origin, scale) {
  const at = (node) => {
    const r = node.getBoundingClientRect();
    return [(r.left - origin.left) * scale, (r.top - origin.top) * scale, r.width * scale, r.height * scale];
  };
  const box = at(mapEl);
  const svgs = [...mapEl.querySelectorAll(".leaflet-overlay-pane svg, .leaflet-marker-pane svg")];
  const svgImages = await Promise.all(svgs.map(svgToImage));

  ctx.save();
  ctx.beginPath();
  ctx.rect(...box);
  ctx.clip();
  ctx.fillStyle = "#ddd";
  ctx.fillRect(...box);
  ctx.filter = getComputedStyle(mapEl).filter; // the dark theme dims the map
  // tiles carry crossOrigin, so they don't taint the canvas
  mapEl.querySelectorAll(".leaflet-tile-pane img.leaflet-tile-loaded").forEach((img) => ctx.drawImage(img, ...at(img)));
  svgImages.forEach((img, i) => img && ctx.drawImage(img, ...at(svgs[i])));
  ctx.filter = "none";
  ctx.font = `${10 * scale}px sans-serif`;
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillText("© OpenStreetMap", box[0] + box[2] - 6 * scale, box[1] + box[3] - 6 * scale);
  ctx.restore();
}

// Lines and pins are SVG; as an image they draw onto the canvas without tainting it.
function svgToImage(svg) {
  const copy = svg.cloneNode(true);
  const r = svg.getBoundingClientRect();
  copy.removeAttribute("style"); // Leaflet's translate3d is already in the on-screen position
  copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  copy.setAttribute("width", r.width);
  copy.setAttribute("height", r.height);
  const img = new Image();
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(copy));
  return img.decode().then(
    () => img,
    () => null,
  );
}

// Phones get the share sheet with the picture, computers copy it. Both need HTTPS (or
// localhost); on a plain http:// LAN address the picture is downloaded instead. If the picture
// can't be made at all, the text result is shared as before.
function shareScreenshot(text, fileName) {
  const blob = captureOverlay();
  const download = () =>
    blob.then((b) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      showToast(t("imageSaved"));
    });
  const fallback = () =>
    download().catch((e) => {
      console.warn("screenshot failed", e);
      shareText(text);
    });

  if (window.isSecureContext && navigator.canShare && matchMedia("(pointer: coarse)").matches) {
    return blob
      .then((b) => {
        const files = [new File([b], fileName, { type: "image/png" })];
        if (!navigator.canShare({ files })) throw new Error("no file share");
        return navigator.share({ files, text }).catch((e) => {
          if (e.name !== "AbortError") throw e;
        });
      })
      .catch(fallback);
  }
  if (window.isSecureContext && window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
    // the blob goes in as a promise, so the copy still counts as part of the click
    return navigator.clipboard
      .write([new ClipboardItem({ "image/png": blob })])
      .then(() => showToast(t("imageCopied")))
      .catch(fallback);
  }
  return fallback();
}

// ================= input =================
document.getElementById("guess-btn").addEventListener("click", () => {
  if (state.guess) submitGuess();
});
document.getElementById("btn-hint").addEventListener("click", useHint);
document.getElementById("btn-start").addEventListener("click", returnToStart);

document.addEventListener("keydown", (e) => {
  if (e.target.closest("input, textarea")) return;
  if (overlayVisible()) {
    if (e.key === "Enter" || e.key === " ") {
      const first = document.querySelector("#ov-actions .btn");
      if (first) {
        e.preventDefault();
        first.click();
      }
    }
    return;
  }
  if (!state.inRound) return;
  const k = e.key.toLowerCase();
  if (e.key === " " && state.guess) {
    e.preventDefault();
    submitGuess();
  } else if (k === "h") useHint();
  else if (k === "r") returnToStart();
  else if (k === "m") {
    if (window.innerWidth <= 700) toggleMobileMap();
    else document.getElementById("map-size").click();
  }
});

// ================= boot =================
// Loads the minimap and Yandex. Returns false (and shows the error) if the game can't run.
async function setupGame() {
  if (!POOL.length) {
    showLoader("noPano", reload);
    return false;
  }
  if (!(window.UZG_CONFIG && window.UZG_CONFIG.yandexApiKey)) {
    showLoader("noKey", reload);
    return false;
  }
  initMinimap();
  try {
    await loadYandex();
  } catch (e) {
    console.error(e);
    showLoader(e && e.message === "key" ? "keyFail" : "apiFail", reload);
    return false;
  }
  if (!ymaps.panorama.isSupported()) {
    showLoader("apiFail", reload);
    return false;
  }
  return true;
}

if (!ROOM_MODE) {
  configure(soloSettings());
  showLoader("loading");
  setupGame().then((ok) => ok && startRound());
}
