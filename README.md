# geo-shafaq

The game: you land on a street in Uzbekistan, look around, and guess on the map where you
are. A static single-page app (SvelteKit + TypeScript); the server is
[api-geo-shafaq](https://github.com/hakim-134/api-geo-shafaq), which picks every round's
panorama and scores the guesses.

Based on [BeloGuessr](https://github.com/NotiLo-A/BeloGuessr) by NotiLo-A. The first version
(UzbGuessr-era, plain JS) is kept in `_v0/` and as the git tag `v0`.

## Run locally

```bash
npm install
cp .env.example .env.local      # put your Yandex key in (optional: demo panoramas need none)
npm run dev                     # http://localhost:5173
```

The API must run next to it (`make up setup run` in `api-geo-shafaq`), on port 8131 of the same
host. Players get Yandex panoramas only. For development there are drawn `demo` panoramas
that cost no Yandex views (the free key allows ~100 a day): in the browser console,
`localStorage.sg_test_providers = 'demo'`, and remove it to go back. The API plays them only
where `TEST_PROVIDERS` enables them, never on the real site.

Or the built game in Docker: `npm run lcl` builds it and serves `build/` with nginx on
`http://localhost:8130` (`docker-compose.lcl.yml`), next to the API's `make lcl`. A phone on the
same network opens the laptop's address on port 8130.

| Command                   | What                                                                                |
| ------------------------- | ----------------------------------------------------------------------------------- |
| `npm run dev`             | dev server                                                                          |
| `npm run check`           | types (svelte-check)                                                                |
| `npm test`                | unit tests (vitest)                                                                 |
| `npm run lint` / `format` | prettier                                                                            |
| `npm run build`           | the static site in `build/`                                                         |
| `npm run gen`             | the API types (`src/lib/api/schema.d.ts`) from `../api-geo-shafaq/api/openapi.yaml` |

## How it fits together

| Where                                                  | What                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/routes/+page.svelte`                              | the home: alone or with friends, the maps as road signs (a tap starts the game or opens a room), the settings as three facts that open a sheet, a friend's code on a number plate, recent games                                                                      |
| `src/routes/places/[slug]`                             | the place picker: a place as its entry sign, its panoramas and the player's progress, the places inside it                                                                                                                                                           |
| `src/routes/game/[id]/+page.svelte`                    | a game: the round, each result's reveal, the end (total, stars, the game's streets as plates; also someone else's finished game, by its link)                                                                                                                        |
| `src/routes/room/[code]/+page.svelte`                  | a live room with friends: the lobby (the code as a number plate, link, Telegram, QR, players, the host's tools), the rounds, each round's result for everyone, the final table                                                                                       |
| `src/lib/game/RoundView.svelte`                        | a round on screen, for solo games and rooms: panorama, status pill, clock and red glow, pause menu, hint and back-to-start under the thumb, the guess map (a sheet on phones), the first game's tips                                                                 |
| `src/lib/game/RulesForm.svelte`                        | the settings form: the home's, and a room host's between games                                                                                                                                                                                                       |
| `src/lib/room.svelte.ts`                               | a room on the page: its state over the WebSocket (reconnecting by itself), actions tried again while the server is away (a deploy)                                                                                                                                   |
| `src/routes/me`, `me/*`, `settings`, `games`, `u/[id]` | the player's own page (streets learned, three numbers, a menu) and its simple pages: name and picture, my streets, records, ways to sign in, settings (each choice as a picture of itself), all games (numbered pages, `Pager`); another player's page (with Report) |
| `src/lib/account.svelte.ts`                            | signing in: Telegram (bot link, QR code, Mini App), Google, merging, signing out                                                                                                                                                                                     |
| `src/lib/api/`                                         | the typed API client (openapi-fetch); never edit `schema.d.ts` by hand                                                                                                                                                                                               |
| `src/lib/pano/`                                        | one `PanoViewer` interface; `yandex.ts`, `sphere.ts` (our own and demo panoramas, Photo Sphere Viewer). Each loads its SDK only when a round needs it                                                                                                                |
| `src/lib/map/`                                         | the guess map (one button cycles map / satellite / hybrid; satellite only on hard rules) and the result map (its reveal: the line runs from the guess, the real pin drops): Yandex's map, the same JS API as the panoramas (`src/lib/ymaps.ts`)                      |
| `src/lib/game/`                                        | the result: `ResultLayout` (map + panel), `RoundReveal` (verdict, `Stars`, `ScoreCount`, `StreetPlate`), `Confetti`, `Loader`, `RulesFacts`; sharing a finished game as a link on the site (`share.ts`, `ShareSheet`)                                                |
| `src/lib/rules.ts`, `compass.svelte.ts`                | the settings as the server's rules (and the sliders' scales); the compass style, kept on the device                                                                                                                                                                  |
| `src/lib/sfx.svelte.ts`                                | the small sounds (made on the spot, no files) and the mute switch                                                                                                                                                                                                    |
| `src/lib/i18n/strings.ts`                              | Uzbek (first), English, Russian                                                                                                                                                                                                                                      |
| `src/lib/config.ts`                                    | where the API is, and the Yandex key: the only file that names the domains                                                                                                                                                                                           |
| `src/lib/errors.ts`                                    | players' crashes to GlitchTip (`PUBLIC_GLITCHTIP_DSN`), a ~1 KB reporter                                                                                                                                                                                             |
| `src/env.ts`                                           | the settings read from `.env.local`                                                                                                                                                                                                                                  |
| `src/service-worker/`                                  | the PWA shell cache                                                                                                                                                                                                                                                  |

The game never scores anything: the server sends the result. In a room the server also keeps
the clock for everyone and says when a round ends. Game state lives on the server,
so a reload continues the round, clock included.

## Deploy

`DEPLOY_TARGET=deploy@<server> scripts/deploy.sh` builds and copies the game to the server,
where Caddy serves it (api-geo-shafaq's `docker-compose.yml`). By hand; there is no CI.

`npm run build` writes `build/`: plain files. Serve them with every unknown path falling back
to `index.html` (a single-page app).

Map and panoramas: Yandex. Place names (streets, districts, metro) in the results: © OpenStreetMap
contributors (ODbL), from the API.
