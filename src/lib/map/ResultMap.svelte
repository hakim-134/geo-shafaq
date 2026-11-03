<script lang="ts">
	// Where the place really was and where the player guessed, joined by a dashed line (Yandex).
	// Tapping the real place's badge opens its panorama on Yandex Maps.
	// With reveal (one round's result): the map frames both points, the line runs from the
	// guess to the real place, and the real pin drops there; onlanded says when it has.
	// With crowd (km): the crowd's gold ring around the real place, pulsing out as the pin lands.
	import { onMount } from 'svelte';
	import {
		addBorder,
		bounds,
		boxOf,
		COLORS,
		countryShape,
		createMap,
		crowdLabel,
		crowdPulse,
		crowdRing,
		circleBox,
		dropMarker,
		flagMarker,
		growLine,
		guessLine,
		kmBetween,
		marker,
		yandexType,
		type BBox,
		type Layer,
		type YMap
	} from './map.js';
	import type { LatLon } from '#lib/api/client.js';
	import { pinColor } from '#lib/barg/skins.js';
	import { fmtDistance } from '#lib/format.js';
	import { i18n, t } from '#lib/i18n/index.svelte.js';
	import { load, save } from '#lib/storage.js';

	export interface Pair {
		actual: LatLon;
		heading?: number; // the round's first heading: the badge opens the panorama facing it
		guess?: LatLon;
		label?: string;
		guessColor?: string; // a room's player
		guessLabel?: string;
		trail?: string; // a room's player's: '' for none
	}

	interface Props {
		pairs: Pair[];
		bbox: BBox;
		layer: Layer; // the look the player chose on the guess map
		reveal?: boolean;
		crowd?: number; // the average distance of the round's guesses, km
		onlanded?: () => void;
	}
	let { pairs, bbox, layer, reveal = false, crowd, onlanded }: Props = $props();

	let el: HTMLDivElement;
	let map = $state<YMap | null>(null);
	/* eslint-disable @typescript-eslint/no-explicit-any */
	let drawn: any[] = [];
	let drawnKey = '';
	let run = 0;

	const RING_FIT = 8; // the ring may be this many times the farthest guess, and still be framed
	const PULSE_MS = 1000; // one pulse and the wait for the badge to land: as .sg-crowd-pulse
	const PULSE_DELAY_MS = 350;

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
			run++;
			map?.destroy();
		};
	});

	$effect(() => {
		map?.setType(yandexType(layer));
	});

	$effect(() => {
		const m = map;
		const list = pairs;
		const ringKm = reveal ? crowd : undefined;
		if (!m) return;
		// the same points again (a room's state comes again on a pause, a ring tick): what is
		// drawn stays, and a reveal under way plays on to its flag
		const key = JSON.stringify(list) + reveal + ringKm;
		if (key === drawnKey) return;
		drawnKey = key;
		const mine = ++run;
		for (const o of drawn) m.geoObjects.remove(o);
		drawn = [];
		const add = (o: any) => {
			if (mine !== run) return;
			m.geoObjects.add(o);
			drawn.push(o);
		};
		const points: LatLon[] = list.flatMap((p) => (p.guess ? [p.actual, p.guess] : [p.actual]));
		if (ringKm != null && list.length && ringFits(list, ringKm)) {
			const [w, s, e, n] = circleBox(list[0].actual, ringKm);
			points.push({ lat: s, lon: w }, { lat: n, lon: e });
		}

		m.container.fitToViewport();
		if (points.length === 1) m.setCenter([points[0].lat, points[0].lon], 15);
		else if (points.length)
			// any zoom, not only whole steps: the flags fill the map, on a phone too. The
			// margins: Yandex's box and the flags' poles above the points, the key and the logo
			// under them; less on a short map (a room's result on a phone), or the pins pile up
			m.setBounds(bounds(boxOf(points)), {
				zoomMargin: m.container.getSize()[1] < 400 ? [64, 44, 44, 44] : [104, 56, 84, 56],
				preciseZoom: true,
				checkZoomRange: true
			});

		if (reveal && list.length) {
			revealPairs(m, list, ringKm, add, () => mine === run);
			return;
		}

		const objects: Promise<any>[] = [];
		const placed = new Set<string>(); // in a room, everyone's pairs share the real place
		for (const p of list) {
			const at = `${p.actual.lat},${p.actual.lon},${p.label ?? ''}`;
			if (!placed.has(at)) {
				placed.add(at);
				objects.push(flagMarker(p.actual, p.label, { at: p.actual, heading: p.heading }));
			}
			if (p.guess)
				objects.push(
					guessLine(p.guess, p.actual, p.trail),
					marker(p.guessColor ?? pinColor(), p.guess, p.guessLabel)
				);
		}
		Promise.all(objects).then((os) => os.forEach(add));
	});

	// the first badge that lands on this device keeps calling with its ring a while: motion, no
	// words over the answer ("Panoramada ko‘rish ↗" under the plate says it; a laptop has a hint)
	function firstTime(): boolean {
		if (load('flag_tip', '')) return false;
		save('flag_tip', '1');
		return true;
	}

	// the map frames the ring unless it is far bigger than the guess: a guess a street away stays
	// readable, the ring runs past the edges, and that says the same
	function ringFits(list: Pair[], km: number): boolean {
		const far = Math.max(0, ...list.map((p) => (p.guess ? kmBetween(p.actual, p.guess) : 0)));
		return !far || km <= far * RING_FIT;
	}

	// the pulse runs out from the badge twice (app.css): the ring stays where the first one
	// ends, its label comes when the last one is gone. Still for reduced motion.
	async function playCrowd(
		m: YMap,
		list: Pair[],
		km: number,
		add: (o: any) => void,
		live: () => boolean
	) {
		const c = list[0].actual;
		const showLabel = async () => {
			const label = await crowdLabel(
				m,
				c,
				km,
				list.flatMap((p) => (p.guess ? [p.guess] : [])),
				t('crowdAverage', { d: fmtDistance(km) })
			);
			if (label && live()) add(label);
		};
		const ring = await crowdRing(c, km);
		if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
			add(ring);
			await showLabel();
			return;
		}
		const pulse = await crowdPulse(m, c, km);
		const stopPulse = () => {
			m.geoObjects.remove(pulse);
			drawn = drawn.filter((o) => o !== pulse);
		};
		// a pulse is as wide as the ring at this zoom: zoomed, it would be wrong
		const onZoom = (e: any) => e.get('newZoom') !== e.get('oldZoom') && stopPulse();
		add(pulse);
		m.events.add('boundschange', onZoom);
		setTimeout(() => live() && add(ring), PULSE_MS + PULSE_DELAY_MS);
		setTimeout(
			() => {
				m.events.remove('boundschange', onZoom);
				if (!live()) return;
				stopPulse();
				void showLabel();
			},
			2 * PULSE_MS + PULSE_DELAY_MS
		);
	}

	// the guesses first, then every line runs to the real place, then its pin drops
	async function revealPairs(
		m: YMap,
		list: Pair[],
		ringKm: number | undefined,
		add: (o: any) => void,
		live: () => boolean
	) {
		try {
			const guesses = list.filter((p) => p.guess);
			for (const p of guesses)
				add(await marker(p.guessColor ?? pinColor(), p.guess!, p.guessLabel));
			const lines = await Promise.all(guesses.map((p) => guessLine(p.guess!, p.guess!, p.trail)));
			lines.forEach(add);
			await new Promise((r) => setTimeout(r, 250));
			if (!live()) return;
			await Promise.all(
				lines.map((l, i) => growLine(l, guesses[i].guess!, guesses[i].actual, 850))
			);
			if (!live()) return;
			add(
				await dropMarker(
					list[0].actual,
					{ at: list[0].actual, heading: list[0].heading },
					firstTime()
				)
			);
			if (ringKm != null) await playCrowd(m, list, ringKm, add, live);
		} catch {
			/* drawn as far as it got */
		}
		if (live()) onlanded?.();
	}
</script>

<div class="result-map ymap" bind:this={el}></div>

<style>
	.result-map {
		width: 100%;
		height: 100%;
	}
</style>
