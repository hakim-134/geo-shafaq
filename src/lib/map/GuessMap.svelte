<script lang="ts">
	// The map the player guesses on (Yandex): tap to place the pin. Shows the hints: the
	// named district or region shaded, and the circles.
	import { onMount } from 'svelte';
	import {
		addBorder,
		bounds,
		circleBox,
		COLORS,
		countryShape,
		createMap,
		hintArea,
		hintCircle,
		marker,
		placeShape,
		shapeBox,
		yandexType,
		type BBox,
		type Layer,
		type YMap
	} from './map.js';
	import type { Hint, LatLon } from '#lib/api/client.js';
	import { i18n } from '#lib/i18n/index.svelte.js';

	interface Props {
		bbox: BBox;
		layer: Layer;
		hints: Hint[];
		guess: LatLon | null;
		active: boolean;
		onpick: (p: LatLon) => void;
	}
	let { bbox, layer, hints, guess, active, onpick }: Props = $props();

	let el: HTMLDivElement;
	let map = $state<YMap | null>(null);
	/* eslint-disable @typescript-eslint/no-explicit-any */
	let pinMark: any = null;
	let circles: any[] = [];
	let moved = false; // the player panned or zoomed since the round began
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
		const seen = new ResizeObserver(() => {
			map?.container.fitToViewport(true);
			if (map && !moved && (focus || !guess)) map.setBounds(bounds(focus ?? bbox));
		});
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
			marker(COLORS.guess, at).then((p) => {
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

	/** Back to the whole map, e.g. at the start of a round. */
	export function fitArea() {
		moved = false;
		focus = null;
		map?.container.fitToViewport();
		map?.setBounds(bounds(bbox));
	}
</script>

<div class="guess-map ymap" bind:this={el}></div>

<style>
	.guess-map {
		width: 100%;
		height: 100%;
	}
</style>
