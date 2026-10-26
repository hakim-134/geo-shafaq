<script lang="ts">
	// Where the place really was and where the player guessed, joined by a dashed line (Yandex).
	import { onMount } from 'svelte';
	import {
		addBorder,
		bounds,
		boxOf,
		COLORS,
		countryShape,
		createMap,
		guessLine,
		marker,
		yandexType,
		type BBox,
		type Layer,
		type YMap
	} from './map.js';
	import type { LatLon } from '#lib/api/client.js';
	import { i18n } from '#lib/i18n/index.svelte.js';

	export interface Pair {
		actual: LatLon;
		guess?: LatLon;
		label?: string;
	}

	// layer: the look the player chose on the guess map
	let { pairs, bbox, layer }: { pairs: Pair[]; bbox: BBox; layer: Layer } = $props();

	let el: HTMLDivElement;
	let map = $state<YMap | null>(null);
	/* eslint-disable @typescript-eslint/no-explicit-any */
	let drawn: any[] = [];

	onMount(() => {
		let gone = false;
		createMap({ container: el, lang: i18n.lang, layer, bbox }).then(
			(m) => {
				if (gone) return m.destroy();
				countryShape().then(
					(s) => addBorder(m, s, false),
					() => {}
				);
				map = m;
			},
			() => {}
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
		const list = pairs;
		if (!m) return;
		const objects: Promise<any>[] = [];
		const points: LatLon[] = [];
		for (const p of list) {
			objects.push(marker(COLORS.actual, p.actual, p.label));
			points.push(p.actual);
			if (p.guess) {
				objects.push(guessLine(p.guess, p.actual), marker(COLORS.guess, p.guess));
				points.push(p.guess);
			}
		}
		Promise.all(objects).then((os) => {
			for (const o of drawn) m.geoObjects.remove(o);
			for (const o of os) m.geoObjects.add(o);
			drawn = os;
		});
		m.container.fitToViewport();
		if (points.length === 1) m.setCenter([points[0].lat, points[0].lon], 15);
		else if (points.length)
			m.setBounds(bounds(boxOf(points)), { zoomMargin: 60, checkZoomRange: true });
	});
</script>

<div class="result-map" bind:this={el}></div>

<style>
	.result-map {
		width: 100%;
		height: 100%;
	}
</style>
