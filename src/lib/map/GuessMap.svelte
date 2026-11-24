<script lang="ts">
	// The map the player guesses on (Yandex): tap to place the pin. Shows the hints: the
	// named district or region shaded, and the circles.
	import { onMount } from 'svelte';
	import {
		addBorder,
		bounds,
		circleBox,
		countryShape,
		createMap,
		hintArea,
		hintCircle,
		marker,
		pickBorder,
		pickBounds,
		placeShape,
		shapeBox,
		yandexType,
		type BBox,
		type Layer,
		type YMap
	} from './map.js';
	import { pickColorToken, type PickOutline } from '#lib/maps/picks.js';
	import type { Hint, LatLon } from '#lib/api/client.js';
	import { pinColor } from '#lib/barg/skins.js';
	import { i18n } from '#lib/i18n/index.svelte.js';

	interface Props {
		bbox: BBox;
		outlines: PickOutline[];
		layer: Layer;
		hints: Hint[];
		guess: LatLon | null;
		active: boolean;
		onpick: (p: LatLon) => void;
	}
	let { bbox, outlines, layer, hints, guess, active, onpick }: Props = $props();

	let el: HTMLDivElement;
	let map = $state<YMap | null>(null);
	/* eslint-disable @typescript-eslint/no-explicit-any */
	let pinMark: any = null;
	let circles: any[] = [];
	let moved = false; // the player panned or zoomed since the round began
	let pickBox = $state.raw<BBox | null>(null);
	let focus: BBox | null = null; // the last hint's area: the map keeps it in view as it grows

	onMount(() => {
		let gone = false;
		createMap({ container: el, lang: i18n.lang, layer, bbox }).then(
			(m) => {
				if (gone) return m.destroy();
				m.cursors.push('crosshair');
				m.events.add('click', (e: any) => {
					const [lat, lon] = e.get('coords');
					if (active) onpick({ lat, lon });
				});
				countryShape().then(
					(s) => addBorder(m, s, true),
					() => {}
				);
				map = m;
			},
			() => {} // no Yandex: the round itself shows the error
		);
		// the box grows on hover and with the size button: the map follows it, the centre
		// kept once the player has moved it; while not, the whole area or the hint's is shown
		// a drag or the wheel moves it; a tap that places the pin (on a laptop, the same moment
		// the box starts to grow) doesn't, or the hint's district would stay small in a corner
		const touch = () => (moved = true);
		const drag = (e: PointerEvent) => e.buttons && touch();
		el.addEventListener('pointermove', drag);
		el.addEventListener('wheel', touch, { passive: true });
		const seen = new ResizeObserver(refit);
		seen.observe(el);
		return () => {
			gone = true;
			seen.disconnect();
			map?.destroy();
		};
	});

	$effect(() => {
		map?.setType(yandexType(layer));
	});

	$effect(() => {
		const m = map;
		if (!m || outlines.length < 2) return;
		const colors = getComputedStyle(el);
		const milk = colors.getPropertyValue('--tile-a').trim();
		const borders: any[] = [];
		let gone = false;
		const drawn = outlines.map(async ({ slug, color }) => {
			const stroke = colors.getPropertyValue(pickColorToken(color)).trim();
			const shape = await placeShape(slug);
			const parts = await pickBorder(shape, stroke, milk);
			if (!gone)
				for (const part of parts) {
					m.geoObjects.add(part);
					borders.push(part);
				}
			return shape;
		});
		Promise.all(drawn).then(
			(shapes) => {
				if (gone) return;
				pickBox = pickBounds(shapes);
				if (pickBox && !focus && !moved && !guess) refit();
			},
			() => {}
		); // keep the map-wide view if one of the places could not be framed
		return () => {
			gone = true;
			pickBox = null;
			for (const border of borders) m.geoObjects.remove(border);
		};
	});

	$effect(() => {
		const m = map;
		const list = [...hints];
		if (!m) return;
		for (const c of circles) m.geoObjects.remove(c);
		circles = [];
		let gone = false;
		// only the latest named place: the region's border goes once the district is named
		const lastNamed = list.findLast((h) => h.place);
		const drawn = list.map(async (h) => {
			const out: any[] = [];
			if (h.place && h === lastNamed) {
				const shape = await placeShape(h.place).catch(() => null);
				if (shape) {
					out.push(...(await hintArea(shape)));
					if (h === list.at(-1)) zoomTo(m, shapeBox(shape));
				}
			}
			if (h.circle) {
				out.push(await hintCircle(h.circle.center, h.circle.radiusKm));
				if (h === list.at(-1)) zoomTo(m, circleBox(h.circle.center, h.circle.radiusKm));
			}
			return out;
		});
		Promise.all(drawn).then((all) => {
			if (gone) return;
			for (const o of all.flat()) m.geoObjects.add(o);
			circles = all.flat();
		});
		return () => {
			gone = true;
		};
	});

	$effect(() => {
		const m = map;
		const at = guess;
		if (!m) return;
		if (!at) {
			if (pinMark) m.geoObjects.remove(pinMark);
			pinMark = null;
		} else if (pinMark) {
			pinMark.geometry.setCoordinates([at.lat, at.lon]);
		} else {
			marker(pinColor(), at).then((p) => {
				if (pinMark || !guess) return; // placed meanwhile, or taken back
				p.geometry.setCoordinates([guess.lat, guess.lon]);
				pinMark = p;
				m.geoObjects.add(p);
			});
		}
	});

	function zoomTo(m: YMap, box: BBox) {
		focus = box;
		m.setBounds(bounds(box), { duration: 400 });
	}

	function frameArea(m: YMap) {
		if (pickBox) m.setBounds(bounds(pickBox), { zoomMargin: 16, preciseZoom: true });
		else m.setBounds(bounds(bbox));
	}

	/** Measures the box again and shows the hint's area or the whole one, unless the player
	 *  has moved the map. Called when the box changes size, and on a phone once the sheet has
	 *  finished sliding up: the map was laid out while the sheet was hidden below the screen. */
	export function refit() {
		if (!map) return;
		map.container.fitToViewport(true);
		if (moved) return;
		if (focus) map.setBounds(bounds(focus));
		else if (!guess) frameArea(map);
	}

	/** Back to the whole map, e.g. at the start of a round. */
	export function fitArea() {
		moved = false;
		focus = null;
		map?.container.fitToViewport();
		if (map) frameArea(map);
	}
</script>

<div
	class="guess-map ymap"
	data-pick-bounds-ready={pickBox ? true : undefined}
	bind:this={el}
></div>

<style>
	.guess-map {
		width: 100%;
		height: 100%;
	}
</style>
