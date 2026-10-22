# geo-shafaq

A GeoGuessr-style browser game for Uzbekistan, built on Yandex street panoramas. You land on
a random street, look around, and mark on the map where you think you are. Static
HTML/CSS/JS; the live rooms for playing with friends run on the
[api-geo-shafaq](https://github.com/hakim-134/api-geo-shafaq) server.

Continues UzbGuessr, which is based on [BeloGuessr](https://github.com/NotiLo-A/BeloGuessr)
by NotiLo-A.

- **Areas:** *Toshkent ko‘chalari* (2 356 places on 185 main Tashkent streets, within 2 km
  of a metro station, with the street, district and nearest metro after each round),
  *Toshkent*, *Tarixiy shaharlar* (Samarkand, Bukhara, Khiva, Shahrisabz), *Butun O‘zbekiston*.
- **Difficulties** Oson / O‘rta / Qiyin; hints; 3–10 rounds; optional timer with a warning
  near the end; a pin placed before time runs out counts.
- **With friends:** a room code or link, 2–12 players on the same panoramas. Needs the API.
- Uzbek (default), English, Russian. Light and dark theme. Works on phones.

## Run locally

1. Get **your own** Yandex Maps key at <https://developer.tech.yandex.ru/services>
   ("JavaScript API and HTTP Geocoder"). Allow `localhost` and `geo.shafaq.uz` as referrers.
2. `cp config.example.js config.js` and put the key in. `config.js` is gitignored.
3. Serve the pages: `python3 serve.py` → <http://localhost:8130>.
4. For rooms, run the API next to it: `go run .` in `api-geo-shafaq` (port 8131).

Solo play works without the API; the "With friends" block is greyed out then.

**Where the API is:** `js/api.js`. On `geo.shafaq.uz` it is `https://api.geo.shafaq.uz`;
anywhere else the same host on port 8131. From another device on your network
(`http://10.42.0.1:8130`), start the API with `go run . -origins 'http://10.42.0.1:*'` and
add that address to the key's referrers.

## Refreshing the data

- `tools/collect.html` rebuilds `js/locations.js`: open <http://localhost:8130/tools/collect.html>,
  wait a few minutes, copy the output into `js/locations.js`. It samples Yandex's panorama
  coverage over Uzbekistan and keeps points inside `js/border.js`.
- `tools/tashkent_streets.py` rebuilds `js/tashkent.js` from OpenStreetMap and Yandex's
  public coverage tiles (no API key used): `python3 tools/tashkent_streets.py` (needs Pillow).

## Files

| File | What it does |
|---|---|
| `index.html`, `js/menu.js` | Menu: map of all points, area, difficulty, rounds, timer, rooms, player, history |
| `game.html`, `js/game.js` | Panorama, minimap, hints, timer, round results, final summary |
| `js/room.js` | Live rooms in the browser: lobby, sync with the API, results with all players |
| `js/api.js` | Where the API is |
| `js/data.js` | Cities, areas, difficulty presets, location pool, border check |
| `js/border.js` | Uzbekistan border (OpenStreetMap, simplified) |
| `js/locations.js` | Verified panorama points |
| `js/tashkent.js` | Tashkent streets, districts, metro stations (© OpenStreetMap contributors, ODbL) |
| `js/i18n.js` | Uzbek / English / Russian strings |
| `js/common.js` | Storage, history, theme, language, helpers |
| `css/style.css` | All styles |
| `img/mark.svg` | Logo and favicon |
| `config.example.js` | Template for `config.js` (Yandex key) |
| `serve.py` | Local server without caching |

Keys: `Space` guess, `H` hint, `R` back to start, `M` map, `Enter` next round.

Vanilla JS, Yandex Maps JS API 2.1, Leaflet 1.9.4, OpenStreetMap and Esri tiles, fonts
Unbounded and Onest.
