# AGENTS.md — for Codex working on geo-shafaq (the game)

Codex reads this file on every run in this repo. Claude Code leads the work and sends you
bounded tasks with a short brief; this file is the context the brief leaves out. The brief
wins where it says something more specific.

<!-- The shared part below is the same in api-geo-shafaq/AGENTS.md. Change both together. -->

## The project

GeoShafaq (folders say "Shafaq Geo"): you land on a street in Uzbekistan, look around in a
Yandex panorama, and guess on the map where you are. Alone, or live with friends. Mostly
played **on phones**. The owner is the CEO and designer: they don't read the code, they play
the game and judge it. Fewer than 10 players today, all friends; built to grow to thousands.

- `geo-shafaq`: the game, a static SvelteKit + TypeScript app (Svelte 5 runes).
- `api-geo-shafaq`: the server, Go + Postgres/PostGIS + Redis; the contract between them is
  `api-geo-shafaq/api/openapi.yaml`.
- `_geoshafaq_claude`: the knowledge base (Claude's). Read it, never change it.

All three sit next to each other in `~/131/github.com/hakim-134/`. You may read any of them.

## Hard rules (breaking one by accident is the usual failure)

1. **No git writes.** No `git add`, `commit`, `push`, `stash`, `reset`, `checkout`, no new
   branches. Read-only git (`status`, `diff`, `log`, `show`) is fine. Claude commits.
2. **Keys never go into git or into tracked files.** The repos are public. Keys live in
   gitignored files only (`.env.local`, `config.js`, `.envrc`). Never print one in code,
   tests, fixtures or comments.
3. **Players see Yandex only**: Yandex panoramas and Yandex's map. No other map, tile or
   provider anywhere a player looks. The drawn `demo` panoramas are for development only and
   play only where `TEST_PROVIDERS` enables them.
4. **`KADASTR:`**: everything that exists because of the cadastre's mahalla borders carries
   a `KADASTR:` comment, so it can all be removed in one go. Keep that when you touch it.
5. **No Docker, no containers, no databases of your own.** Claude runs Docker and the
   integration tests.
6. **Stay inside the brief.** Touch only the files it names or clearly needs. Don't touch
   `_v0/` (the old version, kept as history), generated files by hand, or the OpenAPI
   contract unless the brief says so.
7. **Remove before adding.** When a new thing replaces an old one, the old one goes in the
   same change: its code, its text, its styles, its API field. No dead code, no leftovers.
8. **Domains** (`geo.shafaq.uz`, `api.geo.shafaq.uz`) live in config only; don't spread them.

## Who plays, and what the game must feel like

People of Uzbekistan, most of them Muslims: honest, simple people. The game never mentions
religion and stays **decent and clean**: no gambling, nothing vulgar, no tricks, no pressure
to keep playing, real numbers only.

- **Uzbek first** (Latin script), then Russian and English. Every new player-visible text in
  all three. Write `o‘` and `g‘` with U+2018 (‘), never `'` or `’`.
- **A game, not a form.** Clear, quick, fun. One screen, one job, one main button.
- **Show, don't type.** A place is shown by its face: the parent's whole shape with the place
  filled in (place-in-parent), never a sign or a banner.
- **One map, one behaviour.** A tap on a map zooms in, in place; a map never leads to
  another page with another map.

## How to finish a task

- Run the checks the brief names, and the repo's own checks below. If one can't run in your
  sandbox (no network, no sockets), say which and why; don't pretend it passed.
- Reply short, in this order: **what changed** (files, one line each) · **checks** (command →
  result) · **left or doubtful** (anything you skipped, guessed or would ask the owner).
- If the brief is wrong or the task is harder than it looks, say so and do the closest
  sound thing. Don't fake it, don't silently widen it.

<!-- End of the shared part. -->

## This repo: geo-shafaq

- **Read first**: `README.md` (how it fits together, commands). For anything a player sees,
  also `../_geoshafaq_claude/design.md` and, for in-game UI, the skill
  `../_geoshafaq_claude/skills/game-ui-frontend/SKILL.md`.
- **The look is a kit.** Tokens and shared classes are in `src/app.css`; its header lists
  every class (`.btn-primary` is THE one key, `.panel`, `.chip`, …). Use the tokens and the kit;
  no new colours, fonts or one-off button styles. Each screen keeps its own styles in its
  component.
- **Phones first**: every screen must work at 360–430 px wide, in light and dark theme.
- **Texts**: `src/lib/i18n/strings.ts` (uz, ru, en). No hard-coded player-visible strings.
- **API types**: `src/lib/api/schema.d.ts` is generated from the contract (`npm run gen`,
  needs network). Don't edit it by hand; if the contract changed and you can't generate it,
  say so.
- **Checks**: `npm run check` (svelte-check, must be 0 errors) and `npm test` (vitest).
  Format **only the files you changed**: `npx prettier --write <those files>`. Never
  `npm run format` on the whole repo; other files' formatting is not your task.
- You can't play the game in a browser here; Claude does that after you. Say in your reply
  what Claude should try on the phone to see your change.
