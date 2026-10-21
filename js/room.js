// ================= live rooms with friends =================
// Needs the Go server (server/). The server owns the room: players, timer, scores. This file
// draws it. The host's browser picks each panorama with the same checks as a solo game and
// sends its exact position, so every player opens the same panorama.

// Pin colours by join order; green is left out, it marks the real place.
const PLAYER_COLORS = [
  "#0099b5", "#e8590c", "#7048e8", "#c99a2e", "#d6336c", "#1c7ed6",
  "#495057", "#a0522d", "#9c36b5", "#f03e3e", "#0b7285", "#5c7cfa",
];
const playerIcons = PLAYER_COLORS.map((c) => pinIcon(c));

const room = {
  ws: null,
  code: null, // known after "welcome"
  you: null,
  snap: null, // last state from the server
  ready: null, // promise: minimap + Yandex loaded
  queue: Promise.resolve(), // states are drawn one after another
  pickedRound: 0, // round this browser already picked a panorama for (as host)
  shownRound: 0, // round whose panorama is on screen
  shownResult: 0,
  pendingGuess: null, // resent if the connection dropped before the server got it
  pinUnsent: false, // the last pin was placed while the connection was down
  saved: false,
  editing: false, // host has the settings editor open
  pendingSettings: null, // sent by the host, not yet confirmed by the server
  settingsKey: "", // settings the page is configured with
  fatal: false,
  retry: 0,
};

function sessionGet(key) {
  try {
    return sessionStorage.getItem(key) || "";
  } catch {
    return "";
  }
}
function sessionSet(key, val) {
  try {
    sessionStorage.setItem(key, val);
  } catch {}
}
const tokenKey = (code) => "uzg_room_" + code;

// Returns false if the connection is down and the message was dropped.
function roomSend(msg) {
  if (!room.ws || room.ws.readyState !== WebSocket.OPEN) return false;
  room.ws.send(JSON.stringify(msg));
  return true;
}

const me = (s) => s.players.find((p) => p.id === room.you);
const isHost = (s) => s.hostId === room.you;
const errorKey = (code) => (STRINGS.uz["err_" + code] ? "err_" + code : "err_other");

// ---------- connection ----------
function roomBoot() {
  document.body.classList.add("in-room");
  document.body.dataset.connLost = t("connLost");
  const param = (new URLSearchParams(window.location.search).get("room") || "").toUpperCase();
  room.code = param === "NEW" ? null : param;
  if (room.code) document.getElementById("lobby-code").textContent = room.code;
  showLoader("connecting");

  const hasSeat = room.code && sessionGet(tokenKey(room.code));
  if (!ls(SK.nick, "").trim() && !hasSeat) askName();
  else connect();
}

function askName() {
  const lobby = document.getElementById("lobby");
  const form = document.getElementById("lobby-name");
  const input = document.getElementById("lobby-name-input");
  lobby.hidden = false;
  form.hidden = false;
  document.getElementById("lobby-body").hidden = true;
  input.value = ls(SK.nick, "");
  input.focus();
  form.onsubmit = (e) => {
    e.preventDefault();
    const name = input.value.trim();
    if (!name) return input.focus();
    lsSet(SK.nick, name);
    form.hidden = true;
    connect();
  };
}

function connect() {
  const ws = new WebSocket(window.UZG_API.replace(/^http/, "ws") + "/ws");
  room.ws = ws;
  ws.onopen = () => {
    room.retry = 0;
    room.pickedRound = 0; // a pick in flight may have been lost with the old connection
    document.body.classList.remove("conn-lost");
    const name = ls(SK.nick, "");
    if (room.code) roomSend({ t: "join", code: room.code, name, token: sessionGet(tokenKey(room.code)) });
    else roomSend({ t: "create", name, settings: soloSettings() });
  };
  ws.onmessage = (e) => {
    let m;
    try {
      m = JSON.parse(e.data);
    } catch {
      return;
    }
    onMessage(m);
  };
  ws.onclose = (e) => {
    if (room.ws !== ws || room.fatal) return;
    if (e.code === 4000) return fail(e.reason);
    document.body.classList.add("conn-lost");
    setTimeout(connect, Math.min(1000 * 2 ** room.retry++, 8000));
  };
}

function onMessage(m) {
  if (m.t === "welcome") {
    room.code = m.code;
    room.you = m.you;
    sessionSet(tokenKey(m.code), m.token);
    history.replaceState(null, "", "game.html?room=" + m.code);
    document.getElementById("lobby-code").textContent = m.code;
  } else if (m.t === "state") {
    room.snap = m;
    room.queue = room.queue.then(() => render(m)).catch((e) => console.error(e));
  } else if (m.t === "error") {
    showToast(t(errorKey(m.code)));
  }
}

function fail(code) {
  if (code === "bad_name") {
    showToast(t("err_bad_name"));
    return askName();
  }
  room.fatal = true;
  document.getElementById("lobby").hidden = true;
  showLoader(errorKey(code), () => (window.location.href = "index.html"));
  document.getElementById("loader-retry").textContent = t("menu");
}

function leaveRoom() {
  room.fatal = true;
  roomSend({ t: "leave" });
  window.location.href = "index.html";
}

// ---------- drawing a state ----------
async function render(s) {
  if (s !== room.snap) return; // a newer state is queued; it has everything
  const settingsKey = JSON.stringify(s.settings);
  if (!room.ready) {
    configure(s.settings);
    room.settingsKey = settingsKey;
    room.ready = setupGame();
  }
  if (!(await room.ready)) return; // setupGame already shows the error
  if (room.settingsKey !== settingsKey) {
    // the host changed the settings in the lobby
    room.settingsKey = settingsKey;
    configure(s.settings);
    applyMapSettings();
    if (!isHost(s)) showToast(t("settingsChanged"));
  }

  // "Play again" in the same room starts from round 1
  if (s.phase !== "final" && (room.shownRound > s.round || (room.saved && s.phase !== "result"))) {
    Object.assign(state, { rounds: [], used: [], total: 0, round: 0 });
    Object.assign(room, { shownRound: 0, shownResult: 0, pickedRound: 0, saved: false });
  }

  renderStrip(s);
  document.getElementById("lobby").hidden = s.phase !== "lobby";
  if (s.phase !== "result" && s.phase !== "final") hideOverlay();

  switch (s.phase) {
    case "lobby":
      return renderLobby(s);
    case "picking":
      showLoader("picking");
      if (isHost(s) && room.pickedRound !== s.round) pickPanorama(s);
      return;
    case "playing":
      if (room.shownRound !== s.round) await startRoomRound(s);
      return renderPlaying(room.snap);
    case "result":
      return renderResult(s);
    case "final":
      return renderFinal(s);
  }
}

function renderLobby(s) {
  hideLoader();
  document.getElementById("lobby-body").hidden = false;
  document.getElementById("lobby-share").hidden = false;
  const st = s.settings;
  const time = st.time ? `${st.time / 60}:00` : "∞";
  document.getElementById("lobby-settings").innerHTML = [
    t("area_" + st.area),
    t("diff_" + st.diff),
    `${st.rounds} × ${t("round").toLowerCase()}`,
    `⏱ ${time}`,
  ]
    .map((x) => `<span>${escapeHtml(x)}</span>`)
    .join("");

  const online = s.players.filter((p) => p.online).length;
  document.getElementById("lobby-count").textContent = `${online} / 12`;
  document.getElementById("lobby-players").innerHTML = s.players
    .map((p) => {
      const tags = [
        p.id === s.hostId ? `<em>${t("hostTag")}</em>` : "",
        p.id === room.you ? `<em class="you">${t("youTag")}</em>` : "",
        p.online ? "" : `<em class="off">${t("offline")}</em>`,
      ].join("");
      return `<li class="${p.online ? "" : "offline"}"><i style="background:${PLAYER_COLORS[p.color]}"></i><span>${escapeHtml(p.name)}</span>${tags}</li>`;
    })
    .join("");
  document.getElementById("lobby-start").hidden = !isHost(s);
  document.getElementById("lobby-wait").hidden = isHost(s);
  renderEditor(s);
}

// ---------- lobby settings (host only) ----------
const NUMERIC_SETTINGS = ["rounds", "time"];

function renderEditor(s) {
  const host = isHost(s);
  if (!host) room.editing = false;
  if (room.pendingSettings && JSON.stringify(room.pendingSettings) === JSON.stringify(s.settings)) {
    room.pendingSettings = null; // the server has everything we sent
  }
  const settings = room.pendingSettings || s.settings;
  const editBtn = document.getElementById("lobby-edit");
  editBtn.hidden = !host;
  editBtn.classList.toggle("active", room.editing);
  editBtn.setAttribute("aria-expanded", room.editing);
  document.getElementById("lobby-editor").hidden = !room.editing;
  document.querySelectorAll("#lobby-editor [data-setting]").forEach((box) => {
    const value = String(settings[box.dataset.setting]);
    box.querySelectorAll("[data-value]").forEach((b) => b.classList.toggle("active", b.dataset.value === value));
  });
  document.getElementById("lobby-diff-note").textContent = t("diffHint_" + settings.diff);
}

function toggleEditor(open) {
  room.editing = typeof open === "boolean" ? open : !room.editing;
  if (room.snap) renderEditor(room.snap);
}

document.getElementById("lobby-editor").addEventListener("click", (e) => {
  const b = e.target.closest("[data-value]");
  const box = e.target.closest("[data-setting]");
  if (!b || !box || !room.snap || !isHost(room.snap)) return;
  const key = box.dataset.setting;
  // build on the last click, not on the server's state: quick clicks would undo each other
  const settings = {
    ...(room.pendingSettings || room.snap.settings),
    [key]: NUMERIC_SETTINGS.includes(key) ? +b.dataset.value : b.dataset.value,
  };
  room.pendingSettings = settings;
  renderEditor(room.snap);
  roomSend({ t: "settings", settings });
  // the menu remembers the host's choice for next time
  lsSet(SK.area, settings.area);
  lsSet(SK.difficulty, settings.diff);
  lsSet(SK.rounds, settings.rounds);
  lsSet(SK.time, settings.time);
});

// Player chips at the top while a round is on: who has guessed already.
function renderStrip(s) {
  const strip = document.getElementById("room-strip");
  strip.hidden = s.phase !== "playing";
  strip.innerHTML = s.players
    .filter((p) => p.online || p.guessed)
    .map(
      (p) =>
        `<span class="${p.guessed ? "done" : ""}${p.id === room.you ? " me" : ""}"><i style="background:${
          PLAYER_COLORS[p.color]
        }"></i>${escapeHtml(p.name)}</span>`,
    )
    .join("");
}

async function pickPanorama(s) {
  room.pickedRound = s.round;
  state.used = s.history.map((h) => h.actual);
  const { pano, error } = await findPanorama();
  const now = room.snap;
  if (now.phase !== "picking" || now.round !== s.round || !isHost(now)) return;
  if (!pano) {
    showLoader(error === "key" ? "keyFail" : "noPano", () => {
      showLoader("picking");
      pickPanorama(room.snap);
    });
    return;
  }
  roomSend({ t: "pano", round: s.round, pos: pano.getPosition() });
}

async function startRoomRound(s) {
  room.shownRound = s.round;
  room.pendingGuess = null;
  room.pinUnsent = false;
  state.round = s.round;
  resetRoundUi();
  let found = [];
  try {
    found = await ymaps.panorama.locate(s.pano);
  } catch (e) {
    console.warn("panorama.locate failed", e);
  }
  if (!found.length) {
    showLoader("noPano", () => {
      room.shownRound = 0;
      render(room.snap);
    });
    return;
  }
  // the round may have ended while the panorama was loading
  if (room.snap.phase !== "playing" || room.snap.round !== s.round) return;
  await beginPanorama(found[0], 0);
}

function renderPlaying(s) {
  if (s.phase !== "playing" || room.shownRound !== s.round) return;
  const self = me(s);
  if (self && self.guessed) {
    if (state.inRound) {
      state.inRound = false; // guessed from another tab or before a reload
      stopTimer();
    }
  } else if (room.pendingGuess && !state.inRound) {
    roomSend(room.pendingGuess); // the first send was lost with the connection
  } else if (room.pinUnsent && state.inRound && state.guess) {
    roomSendPin();
  }

  if (state.inRound && s.remainingMs) {
    const at = Date.now() + s.remainingMs;
    if (!state.timerId || Math.abs(at - state.deadlineAt) > 1500) startTimer(s.remainingMs / 1000);
  }

  if (!state.inRound) {
    const online = s.players.filter((p) => p.online);
    const btn = document.getElementById("guess-btn");
    btn.disabled = true;
    btn.textContent = `${t("waitOthers")} · ${online.filter((p) => p.guessed).length} / ${online.length}`;
  }
}

// called by placeGuess() and useHint() in game.js: the server keeps the last pin and scores it
// if the round ends before the player presses "Guess" (tab asleep, phone locked, timer late)
function roomSendPin() {
  room.pinUnsent = !roomSend({ t: "pin", pos: state.guess, hint: state.hintUsed });
}

// called by submitGuess() in game.js
function roomSubmitGuess() {
  room.pendingGuess = { t: "guess", pos: state.guess, hint: state.hintUsed };
  roomSend(room.pendingGuess);
  renderPlaying(room.snap);
}

// ---------- results ----------
function rankRows(rows, me, fmtRight) {
  return rows
    .map((r, i) => {
      const place = ["🥇", "🥈", "🥉"][i] || i + 1;
      return `<tr data-id="${r.p.id}" class="${r.p.id === me ? "me" : ""}"><td>${place}</td><td><i class="pdot" style="background:${
        PLAYER_COLORS[r.p.color]
      }"></i>${escapeHtml(r.p.name)}</td>${fmtRight(r)}</tr>`;
    })
    .join("");
}

// Only the host moves the room on; everyone else sees who they are waiting for.
function hostActions(s, label, send) {
  return isHost(s)
    ? [["btn-primary", label, () => roomSend({ t: send })]]
    : [["btn-ghost waiting", t("waitHostNext"), () => {}]];
}

function renderResult(s) {
  const rec = s.history[s.round - 1];
  if (!rec) return;
  const last = s.round >= s.settings.rounds;
  const actions = [...hostActions(s, last ? t("finish") : t("next"), "next"), ["btn-ghost", t("leave"), leaveRoom]];

  if (room.shownResult !== s.round) {
    room.shownResult = s.round;
    stopTimer();
    state.inRound = false;
    hideLoader();
    toggleMobileMap(false);

    const mine = rec.guesses[room.you] || { score: 0, km: null, pos: null };
    state.rounds[s.round - 1] = { score: mine.score };
    state.total = (me(s) || { total: 0 }).total;
    updateHud();

    showOverlay();
    document.getElementById("ov-sub").textContent = `${t("round")} ${s.round} / ${s.settings.rounds}`;
    document.getElementById("ov-title").textContent = mine.pos ? verdict(mine.score) : t("noGuess");
    setScoreCard(t("score"), mine.score, 5000, mine.km);

    renderPlaceCard(rec.actual);

    const rows = s.players
      .map((p) => ({ p, g: rec.guesses[p.id] || { score: 0 } }))
      .sort((a, b) => b.g.score - a.g.score);
    document.getElementById("ov-table").innerHTML = rankRows(rows, room.you, (r) => {
      const d = r.g.km != null ? fmtDistance(r.g.km) : null;
      return `<td>${d ? `${d.value} ${d.unit}` : "—"}</td><td>${fmtNum(r.g.score)}</td>`;
    });
    drawRoom([rec], s);
  }
  setActions(actions); // the host may have changed
}

function renderFinal(s) {
  const standings = [...s.players].sort((a, b) => b.total - a.total);
  const self = me(s) || { total: 0 };
  const myPlace = standings.indexOf(self) + 1;
  const actions = [
    ...hostActions(s, t("playAgain"), "start"),
    ["btn-sky", t("share"), () => shareScreenshot(roomText(s, standings), `uzbguessr-${s.code}.png`)],
    ["btn-ghost", t("leave"), leaveRoom],
  ];

  if (!room.saved) {
    room.saved = true;
    hideLoader();
    recordGame(self.total, { players: standings.length, place: myPlace });

    showOverlay();
    document.getElementById("ov-sub").textContent = `${t("area_" + areaKey)} · ${t("diff_" + diffKey)} · ${s.code}`;
    const top = standings[0];
    document.getElementById("ov-title").textContent =
      top.id === room.you ? t("youWin") : `${top.name} ${t("wins")}`;
    const myKm = s.history.reduce((sum, h) => sum + ((h.guesses[room.you] || {}).km || 0), 0);
    setScoreCard(t("total"), self.total, s.settings.rounds * 5000, myKm);
    document.getElementById("ov-place").innerHTML = `<b>${escapeHtml(t("standings"))}</b>`;

    const table = document.getElementById("ov-table");
    table.innerHTML = rankRows(
      standings.map((p) => ({ p })),
      room.you,
      (r) => `<td></td><td>${fmtNum(r.p.total)}</td>`,
    );
    // click a player to see only their pins
    table.querySelectorAll("tr").forEach((tr) =>
      tr.addEventListener("click", () => drawRoom(s.history, s, tr.dataset.id)),
    );
    drawRoom(s.history, s);
  }
  setActions(actions);
}

// Real places in green, every player's pins in their colour. onlyId shows one player.
function drawRoom(records, s, onlyId) {
  resultLayer.clearLayers();
  const pts = [];
  records.forEach((rec, i) => {
    L.marker(rec.actual, { icon: ICON_ACTUAL })
      .bindTooltip(`${records.length > 1 ? `${t("round")} ${i + 1}` : t("actual")}: ${escapeHtml(placeLabel(rec.actual[0], rec.actual[1]))}`)
      .addTo(resultLayer);
    pts.push(rec.actual);
    for (const p of s.players) {
      const g = rec.guesses[p.id];
      if ((onlyId && p.id !== onlyId) || !g || !g.pos) continue;
      L.polyline([rec.actual, g.pos], {
        color: PLAYER_COLORS[p.color],
        weight: 2.5,
        opacity: 0.8,
        dashArray: "6 7",
      }).addTo(resultLayer);
      L.marker(g.pos, { icon: playerIcons[p.color] })
        .bindTooltip(escapeHtml(p.name), {
          permanent: records.length === 1,
          direction: "top",
          offset: [0, -34],
          className: "pin-label",
        })
        .addTo(resultLayer);
      pts.push(g.pos);
    }
  });
  fitResultMap(pts);
}

function roomText(s, standings) {
  const lines = standings.map((p, i) => `${["🥇", "🥈", "🥉"][i] || i + 1 + "."} ${p.name} — ${fmtNum(p.total)}`);
  return `UzbGuessr — ${t("area_" + areaKey)}, ${s.settings.rounds} × ${t("round").toLowerCase()}\n${lines.join("\n")}`;
}

function shareLink() {
  const url = `${window.location.origin}/game.html?room=${room.code}`;
  shareText(`${t("invite")}: ${room.code}\n${url}`, "linkCopied");
}

// ---------- buttons ----------
document.getElementById("lobby-start").addEventListener("click", () => {
  toggleEditor(false);
  roomSend({ t: "start" });
});
document.getElementById("lobby-edit").addEventListener("click", toggleEditor);
document.getElementById("lobby-edit-done").addEventListener("click", () => toggleEditor(false));
document.getElementById("lobby-share").addEventListener("click", shareLink);
document.getElementById("lobby-leave").addEventListener("click", leaveRoom);

if (ROOM_MODE) roomBoot();
