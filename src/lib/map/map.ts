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

/** The real place: a small Uzbekistan flag on a pole, planted on the spot (the pole's foot is
 *  the point). No player's pin looks like it: theirs are drops of one colour. A number (the
 *  round, on the final map) sits on a disc at the top of the pole. */
const FLAG_W = 40;
const FLAG_H = 50;
const FLAG_FOOT: [number, number] = [9, 47];
export function flagSvg(label = ''): string {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${FLAG_W}" height="${FLAG_H}" viewBox="0 0 40 50">
<ellipse cx="9" cy="47" rx="5" ry="2" fill="#000" opacity=".28"/>
<path d="M11 6c6-2.6 10 2.4 16 0s8-1.5 11-.5v18c-3-1-5-1.9-11 .5s-10-2.6-16 0z" fill="#fff" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>
<clipPath id="f"><path d="M11 6c6-2.6 10 2.4 16 0s8-1.5 11-.5v18c-3-1-5-1.9-11 .5s-10-2.6-16 0z"/></clipPath>
<g clip-path="url(#f)"><rect x="10" y="0" width="30" height="12.2" fill="#0099b5"/><rect x="10" y="12.2" width="30" height="1" fill="#ce1126"/><rect x="10" y="13.2" width="30" height="4.4" fill="#fff"/><rect x="10" y="17.6" width="30" height="1" fill="#ce1126"/><rect x="10" y="18.6" width="30" height="12" fill="#1eb53a"/>
<circle cx="16" cy="8.6" r="2.4" fill="#fff"/><circle cx="17" cy="8.3" r="2.1" fill="#0099b5"/></g>
<rect x="7.6" y="4" width="2.8" height="43" rx="1.4" fill="#13233f" stroke="#fff" stroke-width="1.2"/>
${
	label
		? `<circle cx="9" cy="6" r="7" fill="#13233f" stroke="#fff" stroke-width="2"/><text x="9" y="9.6" text-anchor="middle" font-family="Onest,sans-serif" font-size="10" font-weight="800" fill="#fff">${label}</text>`
		: '<circle cx="9" cy="4" r="3" fill="#f5b81c" stroke="#fff" stroke-width="1.2"/>'
}</svg>`;
	return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

export async function flagMarker(at: LatLon, label = ''): Promise<any> {
	const ymaps = await loadYmaps('uz');
	return new ymaps.Placemark(
		pt(at),
		{},
		{
			iconLayout: 'default#image',
			iconImageHref: flagSvg(label),
			iconImageSize: [FLAG_W, FLAG_H],
			iconImageOffset: [-FLAG_FOOT[0], -FLAG_FOOT[1]],
			zIndex: 1000,
			interactivityModel: 'default#transparent'
		}
	);
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

/** The real place's flag for the reveal: it is planted with a bounce and a ring around its
 *  foot (the look is in app.css, .sg-drop). */
export async function dropMarker(at: LatLon): Promise<any> {
	const ymaps = await loadYmaps('uz');
	const Layout = ymaps.templateLayoutFactory.createClass(
		`<div class="sg-drop"><i class="sg-drop-ring"></i><img src="${flagSvg()}" width="${FLAG_W}" height="${FLAG_H}" alt=""></div>`
	);
	return new ymaps.Placemark(
		pt(at),
		{},
		{
			iconLayout: Layout,
			iconShape: {
				type: 'Rectangle',
				coordinates: [
					[-FLAG_FOOT[0], -FLAG_FOOT[1]],
					[FLAG_W - FLAG_FOOT[0], FLAG_H - FLAG_FOOT[1]]
				]
			},
			zIndex: 1000,
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

/** Draws a guess line from a towards b over ms, then resolves (the reveal). */
export function growLine(line: any, a: LatLon, b: LatLon, ms: number): Promise<void> {
	return new Promise((done) => {
		const start = performance.now();
		requestAnimationFrame(function step(now) {
			const k = Math.min((now - start) / ms, 1);
			const e = 1 - Math.pow(1 - k, 3);
			line.geometry.setCoordinates([
				pt(a),
				[a.lat + (b.lat - a.lat) * e, a.lon + (b.lon - a.lon) * e]
			]);
			if (k < 1) requestAnimationFrame(step);
			else done();
		});
	});
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
