const SK = {
  nick: "uzg_nick",
  games: "uzg_games",
  best: "uzg_best",
  totalScore: "uzg_total_score",
  totalRounds: "uzg_total_rounds",
  history: "uzg_history",
  streets: "uzg_streets_seen",
  theme: "uzg_theme",
  lang: "uzg_lang",
  area: "uzg_area",
  difficulty: "uzg_difficulty",
  rounds: "uzg_rounds",
  time: "uzg_time",
};

function ls(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v !== null ? v : fallback;
  } catch {
    return fallback;
  }
}
function lsSet(key, val) {
  try {
    localStorage.setItem(key, String(val));
  } catch {}
}

// Last finished games, newest first: { t, area, diff, rounds, score, max }.
const HISTORY_SIZE = 8;
function readHistory() {
  try {
    const list = JSON.parse(ls(SK.history, "[]"));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
function pushHistory(entry) {
  lsSet(SK.history, JSON.stringify([entry, ...readHistory()].slice(0, HISTORY_SIZE)));
}

// Tashkent streets the player has already been on (Uzbek names), for the progress on the menu.
function streetsSeen() {
  try {
    const list = JSON.parse(ls(SK.streets, "[]"));
    return new Set(Array.isArray(list) ? list : []);
  } catch {
    return new Set();
  }
}
function markStreetSeen(key) {
  const seen = streetsSeen();
  if (seen.has(key)) return;
  seen.add(key);
  lsSet(SK.streets, JSON.stringify([...seen]));
}

// ---------- language ----------
let LANG = ls(SK.lang, "uz");
if (!STRINGS[LANG]) LANG = "uz";

function t(key) {
  return (STRINGS[LANG] && STRINGS[LANG][key]) || STRINGS.uz[key] || key;
}
function regionName(key) {
  const r = REGIONS[key];
  return r ? r[LANG] || r.uz : "";
}
function applyI18n(root = document) {
  document.documentElement.lang = LANG;
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  root.querySelectorAll("[data-i18n-title]").forEach((el) => {
    el.title = t(el.dataset.i18nTitle);
  });
}
function setLang(lang) {
  LANG = lang;
  lsSet(SK.lang, lang);
  applyI18n();
  document.querySelectorAll("[data-lang]").forEach((b) => {
    b.classList.toggle("active", b.dataset.lang === lang);
  });
  document.dispatchEvent(new CustomEvent("langchange"));
}

// ---------- theme ----------
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
}
function initTheme() {
  const prefersDark =
    window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(ls(SK.theme, prefersDark ? "dark" : "light"));
  const btn = document.getElementById("theme-btn");
  if (btn) {
    btn.addEventListener("click", () => {
      const next =
        document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      applyTheme(next);
      lsSet(SK.theme, next);
    });
  }
}

function initLangSwitch() {
  document.querySelectorAll("[data-lang]").forEach((b) => {
    b.classList.toggle("active", b.dataset.lang === LANG);
    b.addEventListener("click", () => setLang(b.dataset.lang));
  });
}

// ---------- misc ----------
function showToast(msg, ms = 2000) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), ms);
}

// Shares or copies text. Phones get the share sheet; plain http:// (a LAN address) has neither
// navigator.share nor the clipboard API, so fall back to the old copy command.
function shareText(text, copiedKey = "copied") {
  if (navigator.share) return navigator.share({ text }).catch(() => {});
  const done = () => showToast(t(copiedKey));
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(done);
  const area = document.createElement("textarea");
  area.value = text;
  area.style.cssText = "position:fixed;opacity:0";
  document.body.appendChild(area);
  area.select();
  try {
    document.execCommand("copy");
    done();
  } catch {
    window.prompt("", text);
  }
  area.remove();
}

function fmtNum(n) {
  return Math.round(n).toLocaleString("en-US").replace(/,/g, " ");
}

function fmtDistance(km) {
  if (km < 1) return { value: Math.round(km * 1000), unit: t("m") };
  if (km < 10) return { value: km.toFixed(1), unit: t("km") };
  return { value: fmtNum(km), unit: t("km") };
}

initTheme();
applyI18n();
initLangSwitch();
