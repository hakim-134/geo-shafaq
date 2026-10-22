// ---------- hero map: the real border and every panorama point ----------
const MAP_LABELS = ["tashkent", "samarkand", "bukhara", "khiva", "nukus", "muynak", "shahrisabz"];
const MAP_BOUNDS = AREAS.uzbekistan.bounds;
const MAP_K = Math.cos((41 * Math.PI) / 180); // squeeze longitude so the shape is not stretched
const svgNS = "http://www.w3.org/2000/svg";

function project(lat, lon) {
  const w = MAP_BOUNDS[0][1];
  const n = MAP_BOUNDS[1][0];
  return [((lon - w) * MAP_K * 100).toFixed(1), ((n - lat) * 100).toFixed(1)];
}

function el(name, attrs, parent) {
  const e = document.createElementNS(svgNS, name);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}

const mapSvg = document.getElementById("uz-map");
const mapDots = [];
(function drawMap() {
  const [[s, w], [n, e]] = MAP_BOUNDS;
  mapSvg.setAttribute("viewBox", `-10 -10 ${((e - w) * MAP_K * 100 + 20).toFixed(0)} ${((n - s) * 100 + 20).toFixed(0)}`);
  const d = UZ_BORDER.coordinates
    .flat()
    .map((ring) => "M" + ring.map(([lon, lat]) => project(lat, lon).join(" ")).join("L") + "Z")
    .join("");
  el("path", { d, class: "uz-shape", "fill-rule": "evenodd" }, mapSvg);

  // city markers under the dots, names on top of everything
  const cities = CITIES.filter((c) => MAP_LABELS.includes(c.key));
  for (const c of cities) {
    const [x, y] = project(c.lat, c.lon);
    el("circle", { cx: x, cy: y, r: 9, class: "uz-city" }, mapSvg);
  }

  const dots = el("g", { class: "uz-dots" }, mapSvg);
  for (const [lat, lon] of LOCATIONS) {
    const [x, y] = project(lat, lon);
    mapDots.push({ lat, lon, node: el("circle", { cx: x, cy: y, r: 8 }, dots) });
  }

  const labels = el("g", { class: "uz-labels" }, mapSvg);
  for (const c of cities) {
    const [x, y] = project(c.lat, c.lon);
    const left = c.key === "tashkent";
    const txt = el("text", { x: +x + (left ? -22 : 22), y: +y + 12, "text-anchor": left ? "end" : "start" }, labels);
    txt.textContent = c.name;
  }
})();

function highlightArea(key) {
  // street points are not on this map; light up Tashkent instead
  const groups = areaGroups(AREAS[key === "tashkent_streets" ? "tashkent" : key]);
  const on = new Set(Object.values(groups).flat().map((p) => p.join()));
  for (const d of mapDots) d.node.classList.toggle("on", on.has(d.lat + "," + d.lon));
}

// ---------- facts and area counts ----------
(function facts() {
  const cities = new Set(LOCATIONS.map(([a, b]) => nearestCity(a, b).city.key));
  const regions = new Set(CITIES.filter((c) => cities.has(c.key)).map((c) => c.region));
  const streetPoints = TASHKENT.streets.reduce((n, [, , pts]) => n + pts.length, 0);
  document.getElementById("fact-points").textContent = fmtNum(LOCATIONS.length + streetPoints);
  document.getElementById("fact-cities").textContent = cities.size;
  document.getElementById("fact-regions").textContent = regions.size;
})();

function renderCounts() {
  document.querySelectorAll("[data-count]").forEach((elx) => {
    const n = Object.values(areaGroups(AREAS[elx.dataset.count])).flat().length;
    elx.textContent = `${fmtNum(n)} ${t("spots")}`;
  });
  const seen = [...streetsSeen()].filter((k) => TASHKENT.streets.some(([uz]) => uz === k)).length;
  document.getElementById("streets-progress").textContent = t("streetsSeen")
    .replace("{n}", seen)
    .replace("{m}", TASHKENT.streets.length);
}

// ---------- choices ----------
function initChoice(id, key, fallback, valid, onChange) {
  const box = document.getElementById(id);
  let value = ls(key, fallback);
  if (!valid.includes(value)) value = fallback;
  const render = () => {
    box.querySelectorAll("[data-value]").forEach((b) => {
      b.classList.toggle("active", b.dataset.value === value);
      b.setAttribute("aria-pressed", b.dataset.value === value);
    });
    if (onChange) onChange(value);
  };
  box.addEventListener("click", (e) => {
    const b = e.target.closest("[data-value]");
    if (!b) return;
    value = b.dataset.value;
    lsSet(key, value);
    render();
  });
  lsSet(key, value);
  render();
  document.addEventListener("langchange", render);
}

initChoice("area-choice", SK.area, "tashkent", Object.keys(AREAS), highlightArea);
initChoice("difficulty-choice", SK.difficulty, "easy", Object.keys(DIFFICULTIES), (v) => {
  document.getElementById("difficulty-note").textContent = t("diffHint_" + v);
});
initChoice("rounds-choice", SK.rounds, "5", ["3", "5", "7", "10"]);
initChoice("time-choice", SK.time, "0", ["0", "60", "120", "180"]);

// ---------- player ----------
const nickInput = document.getElementById("nick-input");
nickInput.value = ls(SK.nick, "");
function saveNick() {
  const nick = nickInput.value.trim();
  if (nick === ls(SK.nick, "")) return;
  lsSet(SK.nick, nick);
  if (nick) showToast(t("nickSaved"));
}
nickInput.addEventListener("change", saveNick);
nickInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") nickInput.blur();
});

// ---------- stats and history ----------
function renderStats() {
  const games = parseInt(ls(SK.games, "0")) || 0;
  const rounds = parseInt(ls(SK.totalRounds, "0")) || 0;
  const sum = parseInt(ls(SK.totalScore, "0")) || 0;
  document.getElementById("stat-games").textContent = games;
  document.getElementById("stat-best").textContent = fmtNum(parseInt(ls(SK.best, "0")) || 0);
  document.getElementById("stat-avg").textContent = rounds ? fmtNum(sum / rounds) : "0";
}

function renderHistory() {
  const list = document.getElementById("history");
  const items = readHistory();
  if (!items.length) {
    list.innerHTML = `<li class="history-empty">${t("historyEmpty")}</li>`;
    return;
  }
  list.innerHTML = "";
  for (const h of items) {
    const li = document.createElement("li");
    const d = new Date(h.t);
    const date = `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
    li.innerHTML = `
      <div class="h-main">
        <b>${t("area_" + h.area)}</b>
        <span>${t("diff_" + h.diff)} · ${h.rounds} × · ${date}${
          h.players > 1 ? ` · 👥 ${t("placeOf").replace("{p}", h.place).replace("{n}", h.players)}` : ""
        }</span>
      </div>
      <div class="h-score">
        <b>${fmtNum(h.score)}</b>
        <i style="--p:${Math.round((h.score / h.max) * 100)}%"></i>
      </div>`;
    list.appendChild(li);
  }
}

function renderAll() {
  renderCounts();
  renderStats();
  renderHistory();
}
renderAll();
document.addEventListener("langchange", renderAll);

// ---------- with friends (live rooms need the Go server) ----------
const friends = document.getElementById("friends");
const joinCode = document.getElementById("join-code");
fetch(window.UZG_API + "/api/health", { cache: "no-store" })
  .then((r) => r.json())
  .then((d) => {
    if (!d.rooms) throw new Error("no rooms");
  })
  .catch(() => {
    friends.classList.add("off");
    document.getElementById("friends-note").dataset.i18n = "noServer";
    applyI18n(friends);
  });

document.getElementById("btn-create").addEventListener("click", () => {
  if (!friends.classList.contains("off")) window.location.href = "game.html?room=new";
});
joinCode.addEventListener("input", () => {
  joinCode.value = joinCode.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
});
document.getElementById("join-form").addEventListener("submit", (e) => {
  e.preventDefault();
  if (friends.classList.contains("off")) return;
  if (joinCode.value.length !== 5) return joinCode.focus();
  window.location.href = "game.html?room=" + joinCode.value;
});

// ---------- play ----------
document.getElementById("btn-play").addEventListener("click", () => {
  window.location.href = "game.html";
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target === document.body) document.getElementById("btn-play").click();
});
