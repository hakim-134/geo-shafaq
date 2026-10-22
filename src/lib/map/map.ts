// MapLibre helpers shared by the guess map and the result map.
import { Map as MlMap, Marker, LngLatBounds, type GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { mapStyle, registerPMTiles } from './style.js';
import { api, call, type LatLon } from '#lib/api/client.js';
import type { Lang } from '#lib/i18n/index.svelte.js';

export const COLORS = { guess: '#0099b5', actual: '#1eb53a', line: '#ce1126' };

export type BBox = [number, number, number, number]; // west, south, east, north

export interface MapOptions {
	container: HTMLElement;
	theme: 'light' | 'dark';
	lang: Lang;
	labels: boolean;
	bbox: BBox;
}

/** A map of Uzbekistan in the game's style, north up, no rotation. */
export function createMap(o: MapOptions): MlMap {
	registerPMTiles();
	const map = new MlMap({
		container: o.container,
		style: mapStyle(o.theme, o.lang, o.labels),
		bounds: o.bbox,
		fitBoundsOptions: { padding: 10 },
		maxBounds: [
			[50, 33],
			[79, 49]
		],
		dragRotate: false,
		pitchWithRotate: false,
		attributionControl: { compact: true }
	});
	map.touchZoomRotate.disableRotation();
	map.keyboard.disableRotation();
	return map;
}

/** The country's border, everything outside dimmed: the player sees where guesses make sense. */
let shape: Promise<GeoJSON.Geometry> | null = null;
export function countryShape(): Promise<GeoJSON.Geometry> {
	shape ??= call(
		api().GET('/v1/places/{slug}/shape', { params: { path: { slug: 'uzbekistan' } } })
	).then(
		(s) => s.geometry as unknown as GeoJSON.Geometry,
		(e) => {
			shape = null;
			throw e;
		}
	);
	return shape;
}

const WORLD: GeoJSON.Position[] = [
	[-180, -85],
	[180, -85],
	[180, 85],
	[-180, 85],
	[-180, -85]
];

/** Adds the mask and border (again after every style change). */
export function addBorder(map: MlMap, geometry: GeoJSON.Geometry, mask: boolean) {
	const polys =
		geometry.type === 'MultiPolygon'
			? geometry.coordinates
			: geometry.type === 'Polygon'
				? [geometry.coordinates]
				: [];
	if (mask && !map.getSource('mask')) {
		map.addSource('mask', {
			type: 'geojson',
			data: {
				type: 'Feature',
				properties: {},
				geometry: { type: 'Polygon', coordinates: [WORLD, ...polys.map((p) => p[0])] }
			}
		});
		map.addLayer({
			id: 'mask',
			type: 'fill',
			source: 'mask',
			paint: { 'fill-color': '#0d1626', 'fill-opacity': 0.4 }
		});
	}
	if (!map.getSource('border')) {
		map.addSource('border', {
			type: 'geojson',
			data: { type: 'Feature', properties: {}, geometry }
		});
		map.addLayer({
			id: 'border',
			type: 'line',
			source: 'border',
			paint: { 'line-color': COLORS.guess, 'line-width': 2 }
		});
	}
}

/** A map pin as an element: a drop in the given colour, with an optional number. */
export function pin(color: string, label = ''): HTMLElement {
	const el = document.createElement('div');
	el.className = 'sg-pin';
	el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 32 40"><path fill="${color}" stroke="#fff" stroke-width="2.5" d="M16 1.5C9.4 1.5 4 6.9 4 13.5c0 8 12 25 12 25s12-17 12-25C28 6.9 22.6 1.5 16 1.5z"/>${
		label
			? `<text x="16" y="18" text-anchor="middle" font-family="Onest,sans-serif" font-size="12" font-weight="700" fill="#fff">${label}</text>`
			: '<circle cx="16" cy="13.5" r="4.5" fill="#fff"/>'
	}</svg>`;
	return el;
}

export function marker(color: string, at: LatLon, label = ''): Marker {
	return new Marker({ element: pin(color, label), anchor: 'bottom' }).setLngLat([at.lon, at.lat]);
}

/** A circle as a polygon (km radius), for hints. */
export function circle(
	center: LatLon,
	radiusKm: number,
	steps = 64
): GeoJSON.Feature<GeoJSON.Polygon> {
	const coords: GeoJSON.Position[] = [];
	const dLat = radiusKm / 111.32;
	const dLon = radiusKm / (111.32 * Math.cos((center.lat * Math.PI) / 180));
	for (let i = 0; i <= steps; i++) {
		const a = (i / steps) * 2 * Math.PI;
		coords.push([center.lon + dLon * Math.sin(a), center.lat + dLat * Math.cos(a)]);
	}
	return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [coords] } };
}

export function setGeoJSON(
	map: MlMap,
	id: string,
	data: GeoJSON.FeatureCollection | GeoJSON.Feature
) {
	const src = map.getSource(id) as GeoJSONSource | undefined;
	src?.setData(data);
}

export function boundsOf(points: LatLon[]): LngLatBounds {
	const b = new LngLatBounds();
	for (const p of points) b.extend([p.lon, p.lat]);
	return b;
}

export type { MlMap };
