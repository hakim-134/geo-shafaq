<script lang="ts">
	// The map the player guesses on (Yandex): tap to place the pin. Shows the hint circles.
	import { onMount } from 'svelte';
	import {
		addBorder,
		bounds,
		circleBox,
		COLORS,
		countryShape,
		createMap,
		hintCircle,
		marker,
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
		return () => {
			gone = true;
			map?.destroy();
		};
	});

	$effect(() => {
		map?.setType(yandexType(layer));
	});

	$effect(() => {
		const m = map;
		const list = hints.map((h) => h.circle);
		if (!m) return;
		for (const c of circles) m.geoObjects.remove(c);
		circles = [];
		Promise.all(list.map((c) => hintCircle(c.center, c.radiusKm))).then((cs) => {
			for (const c of cs) m.geoObjects.add(c);
			circles = cs;
		});
		const last = list.at(-1);
		if (last) m.setBounds(bounds(circleBox(last.center, last.radiusKm)), { duration: 400 });
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

	/** Back to the whole map, e.g. at the start of a round. */
	export function fitArea() {
		map?.setBounds(bounds(bbox));
	}

	/** After the container changed size (bigger on hover, shown on a phone). */
	export function resize() {
		map?.container.fitToViewport();
	}
</script>

<div class="guess-map" class:scheme={layer === 'map'} bind:this={el}></div>

<style>
	.guess-map {
		width: 100%;
		height: 100%;
	}
</style>
