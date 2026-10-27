<script lang="ts">
	// Where the place really was and where the player guessed, joined by a dashed line (Yandex).
	// With reveal (one round's result): the map frames both points, the line runs from the
	// guess to the real place, and the real pin drops there; onlanded says when it has.
	import { onMount } from 'svelte';
	import {
		addBorder,
		bounds,
		boxOf,
		COLORS,
		countryShape,
		createMap,
		dropMarker,
		flagMarker,
		growLine,
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
		guessColor?: string; // a room's player
		guessLabel?: string;
	}

	interface Props {
		pairs: Pair[];
		bbox: BBox;
		layer: Layer; // the look the player chose on the guess map
		reveal?: boolean;
		onlanded?: () => void;
	}
	let { pairs, bbox, layer, reveal = false, onlanded }: Props = $props();

	let el: HTMLDivElement;
	let map = $state<YMap | null>(null);
	/* eslint-disable @typescript-eslint/no-explicit-any */
	let drawn: any[] = [];
	let run = 0;

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
			() => onlanded?.() // no map: the result shows without it
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
		const mine = ++run;
		for (const o of drawn) m.geoObjects.remove(o);
		drawn = [];
		const add = (o: any) => {
			if (mine !== run) return;
			m.geoObjects.add(o);
			drawn.push(o);
		};
		const points: LatLon[] = list.flatMap((p) => (p.guess ? [p.actual, p.guess] : [p.actual]));

		m.container.fitToViewport();
		if (points.length === 1) m.setCenter([points[0].lat, points[0].lon], 15);
		else if (points.length)
			m.setBounds(bounds(boxOf(points)), { zoomMargin: 70, checkZoomRange: true });

		if (reveal && list.length) {
			revealPairs(list, add, () => mine === run);
			return;
		}

		const objects: Promise<any>[] = [];
		const placed = new Set<string>(); // in a room, everyone's pairs share the real place
		for (const p of list) {
			const at = `${p.actual.lat},${p.actual.lon},${p.label ?? ''}`;
			if (!placed.has(at)) {
				placed.add(at);
				objects.push(flagMarker(p.actual, p.label));
			}
			if (p.guess)
				objects.push(
					guessLine(p.guess, p.actual),
					marker(p.guessColor ?? COLORS.guess, p.guess, p.guessLabel)
				);
		}
		Promise.all(objects).then((os) => os.forEach(add));
	});

	// the guesses first, then every line runs to the real place, then its pin drops
	async function revealPairs(list: Pair[], add: (o: any) => void, live: () => boolean) {
		try {
			const guesses = list.filter((p) => p.guess);
			for (const p of guesses)
				add(await marker(p.guessColor ?? COLORS.guess, p.guess!, p.guessLabel));
			const lines = await Promise.all(guesses.map((p) => guessLine(p.guess!, p.guess!)));
			lines.forEach(add);
			await new Promise((r) => setTimeout(r, 250));
			if (!live()) return;
			await Promise.all(
				lines.map((l, i) => growLine(l, guesses[i].guess!, guesses[i].actual, 850))
			);
			if (!live()) return;
			add(await dropMarker(list[0].actual));
		} catch {
			/* drawn as far as it got */
		}
		if (live()) onlanded?.();
	}
</script>

<div class="result-map" bind:this={el}></div>

<style>
	.result-map {
		width: 100%;
		height: 100%;
	}
</style>
