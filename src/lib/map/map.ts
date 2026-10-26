// Yandex map helpers shared by the guess map and the result map (JS API 2.1, the same script as
// the panoramas). Yandex keeps coordinates as [lat, lon]; the game's LatLon and the API's
// GeoJSON are turned into that here and nowhere else.
import { loadYmaps } from '#lib/ymaps.js';
import { api, call, type LatLon } from '#lib/api/client.js';
import type { Lang } from '#lib/i18n/index.svelte.js';
import { load, save } from '#lib/storage.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type YMap = any;

export const COLORS = { guess: '#0099b5', actual: '#1eb53a', line: '#ce1126' };

export type BBox = [number, number, number, number]; // west, south, east, north

type Pt = [number, number]; // [lat, lon], Yandex's order
const pt = (p: LatLon): Pt => [p.lat, p.lon];
export const bounds = (b: BBox): [Pt, Pt] => [
	[b[1], b[0]],
	[b[3], b[2]]
];

/** The map's look, as on v0's toolbar: the street map, satellite photos, or both. */
export type Layer = 'map' | 'satellite' | 'hybrid';
export const LAYERS: Layer[] = ['map', 'satellite', 'hybrid'];
export const yandexType = (l: Layer) => `yandex#${l}`;

/** The look the player chose on the guess map, remembered on this device. */
export function savedLayer(): Layer {
	const l = load('map_layer', 'map') as Layer;
	return LAYERS.includes(l) ? l : 'map';
}
export const saveLayer = (l: Layer) => save('map_layer', l);

export interface MapOptions {
	container: HTMLElement;
	lang: Lang;
	layer: Layer;
	bbox: BBox;
}

/** A Yandex map over the given area, kept around Uzbekistan, without Yandex's own popups. */
export async function createMap(o: MapOptions): Promise<YMap> {
	const ymaps = await loadYmaps(o.lang);
	return new ymaps.Map(
		o.container,
		{ bounds: bounds(o.bbox), type: yandexType(o.layer), controls: [] },
		{
			suppressMapOpenBlock: true,
			yandexMapDisablePoiInteractivity: true,
			restrictMapArea: [
				[33, 50],
				[49, 79]
			],
			zoomMargin: 10
		}
	);
}

/** A place's simplified border, fetched once per page. */
const shapes = new Map<string, Promise<GeoJSON.Geometry>>();
export function placeShape(slug: string): Promise<GeoJSON.Geometry> {
	let s = shapes.get(slug);
	if (!s) {
		s = call(api().GET('/v1/places/{slug}/shape', { params: { path: { slug } } })).then(
			(r) => r.geometry as unknown as GeoJSON.Geometry,
			(e) => {
				shapes.delete(slug);
				throw e;
			}
		);
		shapes.set(slug, s);
	}
	return s;
}

/** The country's border, everything outside dimmed: the player sees where guesses make sense. */
export const countryShape = () => placeShape('uzbekistan');

const polygons = (g: GeoJSON.Geometry): GeoJSON.Position[][][] =>
	g.type === 'MultiPolygon' ? g.coordinates : g.type === 'Polygon' ? [g.coordinates] : [];

/** The box around a shape, for zooming to a hint. */
export function shapeBox(g: GeoJSON.Geometry): BBox {
	const pts = polygons(g).flatMap((p) => p[0]);
	return boxOf(pts.map(([lon, lat]) => ({ lat, lon })));
}

const ring = (r: GeoJSON.Position[]): Pt[] => r.map(([lon, lat]) => [lat, lon]);

/** Adds the border, and with mask the dimmed world around it. */
export async function addBorder(map: YMap, geometry: GeoJSON.Geometry, mask: boolean) {
	const ymaps = await loadYmaps('uz');
	const outlines = polygons(geometry).map((p) => ring(p[0]));
	if (mask) {
		// a box well past what the map can show, not the whole world: a ring across ±180°
		// would be drawn the short way round, and dim Uzbekistan instead of the rest
		const world: Pt[] = [
			[20, 30],
			[60, 30],
			[60, 100],
			[20, 100],
			[20, 30]
		];
		map.geoObjects.add(
			new ymaps.Polygon(
				[world, ...outlines],
				{},
				{
					fillColor: '#0d162666',
					strokeWidth: 0,
					interactivityModel: 'default#transparent'
				}
			)
		);
	}
	for (const o of outlines)
		map.geoObjects.add(
			new ymaps.Polygon(
				[o],
				{},
				{
					fill: false,
					strokeColor: COLORS.guess,
					strokeWidth: 2,
					interactivityModel: 'default#transparent'
				}
			)
		);
}

/** A map pin as an image: a drop in the given colour, with an optional number. */
function pinSvg(color: string, label = ''): string {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 32 40"><path fill="${color}" stroke="#fff" stroke-width="2.5" d="M16 1.5C9.4 1.5 4 6.9 4 13.5c0 8 12 25 12 25s12-17 12-25C28 6.9 22.6 1.5 16 1.5z"/>${
		label
			? `<text x="16" y="18" text-anchor="middle" font-family="Onest,sans-serif" font-size="12" font-weight="700" fill="#fff">${label}</text>`
			: '<circle cx="16" cy="13.5" r="4.5" fill="#fff"/>'
	}</svg>`;
	return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

export async function marker(color: string, at: LatLon, label = ''): Promise<any> {
	const ymaps = await loadYmaps('uz');
	return new ymaps.Placemark(
		pt(at),
		{},
		{
			iconLayout: 'default#image',
			iconImageHref: pinSvg(color, label),
			iconImageSize: [28, 36],
			iconImageOffset: [-14, -36],
			interactivityModel: 'default#transparent'
		}
	);
}

/** A hint: a dashed red circle (km radius). */
export async function hintCircle(center: LatLon, radiusKm: number): Promise<any> {
	const ymaps = await loadYmaps('uz');
	return new ymaps.Circle(
		[pt(center), radiusKm * 1000],
		{},
		{
			fillColor: COLORS.line + '14',
			strokeColor: COLORS.line,
			strokeWidth: 2,
			strokeStyle: 'dash',
			interactivityModel: 'default#transparent'
		}
	);
}

/** A hint naming a district or region: its area, shaded, with a dashed red border. */
export async function hintArea(geometry: GeoJSON.Geometry): Promise<any[]> {
	const ymaps = await loadYmaps('uz');
	return polygons(geometry).map(
		(p) =>
			new ymaps.Polygon(
				[ring(p[0])],
				{},
				{
					fillColor: COLORS.line + '1a',
					strokeColor: COLORS.line,
					strokeWidth: 2.5,
					strokeStyle: 'dash',
					interactivityModel: 'default#transparent'
				}
			)
	);
}

/** The dashed line from where the player guessed to where the place was. */
export async function guessLine(a: LatLon, b: LatLon): Promise<any> {
	const ymaps = await loadYmaps('uz');
	return new ymaps.Polyline(
		[pt(a), pt(b)],
		{},
		{
			strokeColor: COLORS.line,
			strokeWidth: 2.5,
			strokeOpacity: 0.85,
			strokeStyle: 'dash'
		}
	);
}

/** The smallest box around the points, for fitting the map to them. */
export function boxOf(points: LatLon[]): BBox {
	const lons = points.map((p) => p.lon);
	const lats = points.map((p) => p.lat);
	return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
}

/** The box around a circle, for zooming to a hint. */
export function circleBox(c: LatLon, radiusKm: number): BBox {
	const dLat = radiusKm / 111.32;
	const dLon = radiusKm / (111.32 * Math.cos((c.lat * Math.PI) / 180));
	return [c.lon - dLon, c.lat - dLat, c.lon + dLon, c.lat + dLat];
}
