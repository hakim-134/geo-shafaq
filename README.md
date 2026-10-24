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
npm run tiles                   # the basemap, once (~155 MB, see below)
npm run dev                     # http://localhost:5173
```

The API must run next to it (`make up setup run` in `api-geo-shafaq`), on port 8131 of the same
host. Locally it serves the drawn `demo` panoramas first, so development never spends the
free Yandex key's ~100 views a day; pick "Yandex" on the menu to see real ones.

| Command | What |
|---|---|
| `npm run dev` | dev server |
| `npm run check` | types (svelte-check) |
| `npm test` | unit tests (vitest) |
| `npm run lint` / `format` | prettier |
| `npm run build` | the static site in `build/` |
| `npm run gen` | the API types (`src/lib/api/schema.d.ts`) from `../api-geo-shafaq/api/openapi.yaml` |
| `npm run tiles` | `static/tiles/uzbekistan.pmtiles` from Protomaps' daily OpenStreetMap build |

## How it fits together

| Where | What |
|---|---|
| `src/routes/+page.svelte` | the menu: maps, difficulty, rounds, time, panorama source, profile, history |
| `src/routes/game/[id]/+page.svelte` | a game: panorama, guess map, timer, hints, results, final summary |
| `src/lib/api/` | the typed API client (openapi-fetch); never edit `schema.d.ts` by hand |
| `src/lib/pano/` | one `PanoViewer` interface; `yandex.ts`, `sphere.ts` (our own and demo panoramas, Photo Sphere Viewer). Each loads its SDK only when a round needs it |
| `src/lib/map/` | MapLibre guess map and result map on the self-hosted basemap |
| `src/lib/game/` | score card, "you were here" card, share card |
| `src/lib/i18n/strings.ts` | Uzbek (first), English, Russian |
| `src/lib/config.ts` | where the API and the tiles are: the only file that names the domains |
| `src/env.ts` | the settings read from `.env.local` |
| `src/service-worker/` | the PWA shell cache |

The game never scores anything: the server sends the result. Game state lives on the server,
so a reload continues the round, clock included.

## Deploy

`npm run build` writes `build/`: plain files. Serve them with every unknown path falling back
to `index.html` (a single-page app). `build/tiles/` is the basemap; put it on the CDN once
and leave it out of each deploy (it changes only when `npm run tiles` runs).

Data: map © OpenStreetMap contributors (ODbL), tiles by Protomaps.
