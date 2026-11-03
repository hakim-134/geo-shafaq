<script lang="ts" module>
	let located = false; // asked once per visit: coming back to the tab doesn't fly the map away
</script>

<script lang="ts">
	// The map maker's drawn area (PLAN 8.1): the real map with green dots where the library has
	// panoramas, opening where the player stands, a mahalla across. A finger moves it as always; with
	// the pen on (the page's button, or the round one here for another try) a finger draws a loop, and
	// lifting it closes the loop. One loop: drawing again replaces it. Coordinates come from the map
	// itself, so what is drawn is what the server fills.
	import { onMount } from 'svelte';
	import { loadYmaps } from '#lib/ymaps.js';
	import {
		bounds,
		boxOf,
		circleBox,
		createMap,
		libraryDots,
		type BBox,
		type YMap
	} from '#lib/map/map.js';
	import { i18n, t } from '#lib/i18n/index.svelte.js';
	import { showToast } from '#lib/toast.svelte.js';
	import type { LatLon } from '#lib/api/client.js';

	let {
		area,
		bbox,
		ondraw,
		drawing = $bindable(false),
		ready = $bindable(false),
		failed = $bindable(false)
	}: {
		area: LatLon[];
		bbox: BBox;
		ondraw: (a: LatLon[]) => void;
		drawing?: boolean;
		ready?: boolean;
		failed?: boolean; // Yandex's map didn't come: the page says so and offers another try
	} = $props();

	let el: HTMLDivElement;
	let map = $state<YMap | null>(null);
	let stroke = $state<[number, number][]>([]); // on screen, while the finger is down
	/* eslint-disable @typescript-eslint/no-explicit-any */
	let poly: any = null;

	onMount(() => {
		let gone = false;
		// back on this tab with a loop drawn: it, not the city
		const b = area.length ? pad(boxOf(area)) : bbox;
		const late = setTimeout(() => {
			if (!map) failed = true;
		}, 10_000);
		createMap({ container: el, lang: i18n.lang, layer: 'map', bbox: b }).then(
			(m) => {
				if (gone) return m.destroy();
				map = m;
				ready = true;
				failed = false;
				clearTimeout(late);
				libraryDots(m, i18n.lang).catch(() => {});
				if (canLocate && !area.length && !located) {
					located = true;
					locate(true);
				}
			},
			() => (failed = true) // places and streets still make a map
		);
		const seen = new ResizeObserver(() => map?.container.fitToViewport(true));
		seen.observe(el);
		return () => {
			gone = true;
			clearTimeout(late);
			seen.disconnect();
			ready = false;
			map?.destroy();
		};
	});

	// the loop on the map: gold, as what the player knows; the dots show through
	$effect(() => {
		const m = map;
		const pts = area.map((p) => [p.lat, p.lon]);
		if (!m) return;
		if (poly) m.geoObjects.remove(poly);
		poly = null;
		if (!pts.length) return;
		loadYmaps(i18n.lang).then((ymaps) => {
			if (poly) m.geoObjects.remove(poly);
			poly = new ymaps.Polygon(
				[pts],
				{},
				{
					fillColor: '#e8a90c44',
					strokeColor: '#c98f06',
					strokeWidth: 3,
					interactivityModel: 'default#transparent'
				}
			);
			m.geoObjects.add(poly);
		});
	});

	function here(e: PointerEvent): [number, number] {
		const r = el.getBoundingClientRect();
		return [e.clientX - r.left, e.clientY - r.top];
	}

	function down(e: PointerEvent) {
		(e.currentTarget as Element).setPointerCapture(e.pointerId);
		stroke = [here(e)];
	}
	function move(e: PointerEvent) {
		if (!stroke.length) return;
		for (const c of e.getCoalescedEvents?.() ?? [e]) stroke.push(here(c));
	}
	function up() {
		const line = simplify(stroke, 3);
		stroke = [];
		const xs = line.map((p) => p[0]);
		const ys = line.map((p) => p[1]);
		// a tap or a slip isn't a loop: the pen stays on
		if (
			line.length < 3 ||
			Math.max(...xs) - Math.min(...xs) < 24 ||
			Math.max(...ys) - Math.min(...ys) < 24
		)
			return;
		const r = el.getBoundingClientRect();
		const proj = map.options.get('projection');
		const zoom = map.getZoom();
		const geo = line.map(([x, y]) => {
			const [lat, lon] = proj.fromGlobalPixels(
				map.converter.pageToGlobal([x + r.left + scrollX, y + r.top + scrollY]),
				zoom
			);
			return { lat, lon };
		});
		drawing = false;
		ondraw(geo);
	}

	/** Douglas–Peucker: a finger's hundreds of points as the few the shape needs. */
	function simplify(pts: [number, number][], tol: number): [number, number][] {
		if (pts.length < 3) return pts;
		const [ax, ay] = pts[0];
		const [bx, by] = pts[pts.length - 1];
		const len = Math.hypot(bx - ax, by - ay) || 1;
		let far = 0;
		let at = 0;
		for (let i = 1; i < pts.length - 1; i++) {
			const d =
				len > 1
					? Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / len
					: Math.hypot(pts[i][0] - ax, pts[i][1] - ay);
			if (d > far) {
				far = d;
				at = i;
			}
		}
		if (far <= tol) return [pts[0], pts[pts.length - 1]];
		return [...simplify(pts.slice(0, at + 1), tol).slice(0, -1), ...simplify(pts.slice(at), tol)];
	}

	// on the real site (https) the map can open where the player stands
	const canLocate =
		typeof navigator !== 'undefined' && !!navigator.geolocation && globalThis.isSecureContext;
	function locate(quiet = false) {
		navigator.geolocation.getCurrentPosition(
			({ coords: { latitude: lat, longitude: lon } }) => {
				// about 4–5 km across: one loop of a thumb is a mahalla; abroad, the city stays
				if (lat > 37 && lat < 46 && lon > 56 && lon < 74)
					map?.setBounds(bounds(circleBox({ lat, lon }, 2.3)), { duration: 300 });
			},
			() => {
				if (!quiet) showToast(t('mkLocateOff'), 3000); // refused: the map stays where it is
			}
		);
	}
	function pad([w, s, e, n]: BBox): BBox {
		const d = Math.max(e - w, n - s) * 0.3;
		return [w - d, s - d, e + d, n + d];
	}
</script>

<div class="draw-map">
	<div class="map ymap" bind:this={el}></div>
	{#if drawing && map}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="pen"
			onpointerdown={down}
			onpointermove={move}
			onpointerup={up}
			onpointercancel={up}
		>
			<svg>
				<polyline points={stroke.map((p) => p.join(',')).join(' ')} />
			</svg>
		</div>
	{/if}
	{#if canLocate && map && !drawing}
		<button
			class="locate"
			onclick={() => locate()}
			aria-label={t('mkLocate')}
			title={t('mkLocate')}
		>
			<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"
				><circle cx="12" cy="12" r="6.5" /><circle cx="12" cy="12" r="1.5" /><path
					d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"
				/></svg
			>
		</button>
	{/if}
	{#if map}
		<!-- close or wide by hand too: a laptop has no pinch, and not everyone pinches -->
		<div class="zoom" class:drawing>
			<button onclick={() => map.setZoom(map.getZoom() + 1, { duration: 150 })} aria-label="+"
				>+</button
			>
			<button onclick={() => map.setZoom(map.getZoom() - 1, { duration: 150 })} aria-label="−"
				>−</button
			>
		</div>
	{/if}
	{#if failed}
		<p class="failed">{t('mkMapFailed')}</p>
	{/if}
	{#if map && area.length && !drawing}
		<button
			class="locate redraw"
			class:second={canLocate}
			onclick={() => (drawing = true)}
			aria-label={t('mkDrawAgain')}
			title={t('mkDrawAgain')}
		>
			<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"
				><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" /></svg
			>
		</button>
	{/if}
</div>

<style>
	.draw-map {
		position: relative;
		flex: 1;
		min-height: 280px;
		border-radius: 20px;
		overflow: hidden;
		background: var(--surface-2);
	}
	.map {
		position: absolute;
		inset: 0;
	}
	.pen {
		position: absolute;
		inset: 0;
		z-index: 5;
		touch-action: none;
		cursor: crosshair;
		box-shadow: inset 0 0 0 3px var(--gold);
		border-radius: inherit;
	}
	.pen svg {
		width: 100%;
		height: 100%;
		pointer-events: none;
	}
	polyline {
		fill: rgba(232, 169, 12, 0.2);
		stroke: #c98f06;
		stroke-width: 3;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.zoom {
		position: absolute;
		z-index: 4;
		right: 12px;
		bottom: 36px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.zoom.drawing {
		z-index: 6;
	}
	.zoom button {
		width: 46px;
		height: 46px;
		border: none;
		border-radius: 14px;
		background: #fff;
		color: #1b2a44;
		font-size: 24px;
		line-height: 1;
		box-shadow: 0 4px 12px rgba(19, 35, 63, 0.25);
	}
	.failed {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		font-weight: 600;
		color: var(--muted);
	}
	.second {
		top: 66px !important;
	}
	.locate {
		position: absolute;
		z-index: 4;
		right: 12px;
		top: 12px;
		width: 46px;
		height: 46px;
		display: grid;
		place-items: center;
		border: none;
		border-radius: 14px;
		background: #fff;
		color: #1b2a44;
		box-shadow: 0 4px 12px rgba(19, 35, 63, 0.25);
	}
</style>
