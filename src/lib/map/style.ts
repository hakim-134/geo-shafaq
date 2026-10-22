// The guess map's look: the self-hosted Protomaps basemap in the game's colours, labels in
// the player's language. Without map labels (hard rules) the names of places and points of
// interest go; street names stay, as on v0's hard level.
import { addProtocol, setWorkerUrl, type StyleSpecification } from 'maplibre-gl';
// MapLibre runs its tile work in a web worker; bundlers need the worker's URL spelled out
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { Protocol } from 'pmtiles';
import { layers, namedFlavor, type Flavor } from '@protomaps/basemaps';
import { tilesUrl } from '#lib/config.js';
import type { Lang } from '#lib/i18n/index.svelte.js';

let registered = false;

/** Sets MapLibre up once per page: its worker, and pmtiles:// URLs. */
export function registerPMTiles() {
	if (registered) return;
	setWorkerUrl(workerUrl);
	addProtocol('pmtiles', new Protocol().tile);
	registered = true;
}

// Warm paper by day, deep night blue at night, as in design.md.
const flavors: Record<'light' | 'dark', Flavor> = {
	light: { ...namedFlavor('light'), background: '#efe7d6', earth: '#f4efe4', water: '#a9d3df' },
	dark: { ...namedFlavor('dark'), background: '#0a1120', earth: '#0f1a2d', water: '#14304a' }
};

// Assets (fonts, icons) from Protomaps' public CDN for now; self-host before launch.
const ASSETS = 'https://protomaps.github.io/basemaps-assets';

export function mapStyle(theme: 'light' | 'dark', lang: Lang, labels: boolean): StyleSpecification {
	const flavor = flavors[theme];
	const all = layers('protomaps', flavor, { lang });
	return {
		version: 8,
		glyphs: `${ASSETS}/fonts/{fontstack}/{range}.pbf`,
		sprite: `${ASSETS}/sprites/v4/${theme}`,
		sources: {
			protomaps: {
				type: 'vector',
				url: `pmtiles://${tilesUrl()}`,
				attribution:
					'<a href="https://openstreetmap.org/copyright">© OpenStreetMap</a> · <a href="https://protomaps.com">Protomaps</a>'
			}
		},
		layers: labels ? all : all.filter((l) => !/^(places_|pois)/.test(l.id))
	};
}
