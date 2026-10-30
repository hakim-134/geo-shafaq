// Yandex map helpers shared by the guess map and the result map (JS API 2.1, the same script as
// the panoramas). Yandex keeps coordinates as [lat, lon]; the game's LatLon and the API's
// GeoJSON are turned into that here and nowhere else.
import { loadYmaps } from '#lib/ymaps.js';
import { api, call, type LatLon } from '#lib/api/client.js';
import { t, type Lang } from '#lib/i18n/index.svelte.js';
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

/** The box around a shape's biggest piece, for zooming to a hint: a district's far-off
 * exclave (Mirzo Ulug‘bek's, out past Qibray) is drawn but would zoom the map out of town. */
export function shapeBox(g: GeoJSON.Geometry): BBox {
	const area = (r: GeoJSON.Position[]) =>
		Math.abs(
			r.reduce((s, [x, y], i) => s + x * r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0] * y, 0)
		);
	const outer = polygons(g).map((p) => p[0]);
	const pts = outer.reduce((a, b) => (area(b) > area(a) ? b : a), outer[0] ?? []);
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
export function pinSvg(color: string, label = ''): string {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 32 40"><path fill="${color}" stroke="#fff" stroke-width="2.5" d="M16 1.5C9.4 1.5 4 6.9 4 13.5c0 8 12 25 12 25s12-17 12-25C28 6.9 22.6 1.5 16 1.5z"/>${
		label
			? `<text x="16" y="18" text-anchor="middle" font-family="Onest,sans-serif" font-size="12" font-weight="700" fill="#fff">${label}</text>`
			: '<circle cx="16" cy="13.5" r="4.5" fill="#fff"/>'
	}</svg>`;
	return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

/** The real place: a round badge, a white ring around a green disc with a white finish flag
 *  🏁 in it, on a short point that marks the exact spot, with a soft shadow on the ground.
 *  Green with a white ring is the real place's alone (players' pins are drops in their own
 *  colours), and the ring keeps it clear on satellite fields. On the end map its round's
 *  number sits in a gold dot on its shoulder. */
const BADGE_W = 44;
const BADGE_H = 52;
const BADGE_FOOT: [number, number] = [20, 45]; // the point's tip: the exact spot
export function flagSvg(label = ''): string {
	const cells = [0, 1, 2]
		.flatMap((r) => [0, 1, 2, 3].map((c) => [r, c]))
		.filter(([r, c]) => (r + c) % 2)
		.map(
			([r, c]) =>
				`<rect x="${15 + c * 3.25}" y="${9.5 + r * 3.25}" width="3.25" height="3.25" fill="#13233f"/>`
		)
		.join('');
	const dot = label
		? `<circle cx="35" cy="7.5" r="7.2" fill="#f5b81c" stroke="#fff" stroke-width="1.8"/><text x="35" y="11" text-anchor="middle" font-family="Onest,sans-serif" font-size="${label.length > 1 ? 8.5 : 10}" font-weight="800" fill="#13233f">${label}</text>`
		: '';
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${BADGE_W}" height="${BADGE_H}" viewBox="0 0 ${BADGE_W} ${BADGE_H}">
<ellipse cx="20" cy="46.5" rx="7" ry="2.6" fill="#000" opacity=".14"/><ellipse cx="20" cy="46.5" rx="4.5" ry="1.6" fill="#000" opacity=".22"/>
<path d="M12.6 32 20 47 27.4 32z" fill="#000" opacity=".18"/><circle cx="20" cy="20.4" r="17.6" fill="#000" opacity=".2"/>
<path d="M13 30.5 20 45.5 27 30.5z" fill="#fff"/><circle cx="20" cy="19" r="17" fill="#fff" stroke="#13233f" stroke-opacity=".22" stroke-width=".8"/>
<path d="M15.6 31 20 41 24.4 31z" fill="#1eb53a"/><circle cx="20" cy="19" r="14" fill="#1eb53a"/>
<rect x="12.6" y="8.6" width="2.2" height="20" rx="1.1" fill="#fff"/>
<rect x="15" y="9.5" width="13" height="9.75" fill="#fff"/>${cells}
${dot}</svg>`;
	return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

/** The real place's panorama on Yandex Maps, facing the way the round began (longitude
 *  first). Checked in a real Chrome: it opens full screen, on the nearest panorama. */
export function panoramaUrl(at: LatLon, heading = 0): string {
	const dir = Math.round((((heading % 360) + 360) % 360) * 10) / 10;
	return (
		`https://yandex.uz/maps/?panorama[point]=${at.lon},${at.lat}` +
		`&panorama[direction]=${dir},0&panorama[span]=120,60`
	);
}

/** Opens the place's panorama in a new tab; inside Telegram through its own openLink, so the
 *  game stays open behind it. */
export function openPanorama(at: LatLon, heading = 0) {
	const url = panoramaUrl(at, heading);
	const tg = (
		window as unknown as {
			Telegram?: { WebApp?: { initData?: string; openLink(u: string): void } };
		}
	).Telegram?.WebApp;
	if (tg?.initData) tg.openLink(url);
	else window.open(url, '_blank', 'noopener');
}

/** Where a badge goes when tapped: the place and the round's first heading. */
export interface PanoTarget {
	at: LatLon;
	heading?: number;
}

// the badge is pressable: a pointer on a laptop, Yandex's hint "Panoramada ko‘rish ↗"
function pressable(mark: any, go?: PanoTarget) {
	if (!go) return mark;
	mark.properties.set('hintContent', t('seePanorama'));
	mark.events.add('click', () => openPanorama(go.at, go.heading));
	return mark;
}
const pressOptions = (go?: PanoTarget) =>
	go
		? { cursor: 'pointer', interactivityModel: 'default#geoObject' }
		: { interactivityModel: 'default#transparent' };

/** The real place's badge; a later round sits over an earlier one. */
export async function flagMarker(at: LatLon, label = '', go?: PanoTarget): Promise<any> {
	const ymaps = await loadYmaps('uz');
	return pressable(
		new ymaps.Placemark(
			pt(at),
			{},
			{
				iconLayout: 'default#image',
				iconImageHref: flagSvg(label),
				iconImageSize: [BADGE_W, BADGE_H],
				iconImageOffset: [-BADGE_FOOT[0], -BADGE_FOOT[1]],
				zIndex: 1000 + (Number(label) || 0),
				...pressOptions(go)
			}
		),
		go
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

/** The real place's badge for the reveal: it drops in with a bounce and a ring around its
 *  point (the look is in app.css, .sg-drop). */
export async function dropMarker(at: LatLon, go?: PanoTarget, calling = false): Promise<any> {
	const ymaps = await loadYmaps('uz');
	const Layout = ymaps.templateLayoutFactory.createClass(
		`<div class="sg-drop${calling ? ' calling' : ''}"><i class="sg-drop-ring"></i><img src="${flagSvg()}" width="${BADGE_W}" height="${BADGE_H}" alt=""></div>`
	);
	return pressable(
		new ymaps.Placemark(
			pt(at),
			{},
			{
				iconLayout: Layout,
				iconShape: {
					type: 'Rectangle',
					coordinates: [
						[-BADGE_FOOT[0], -BADGE_FOOT[1]],
						[BADGE_W - BADGE_FOOT[0], BADGE_H - BADGE_FOOT[1]]
					]
				},
				zIndex: 1000,
				...pressOptions(go)
			}
		),
		go
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
