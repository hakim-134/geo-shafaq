<script lang="ts">
	// The map the player guesses on: tap to place the pin. Shows the hint circles.
	import { onMount } from 'svelte';
	import type { Marker } from 'maplibre-gl';
	import {
		addBorder,
		circle,
		COLORS,
		countryShape,
		createMap,
		marker,
		setGeoJSON,
		type BBox,
		type MlMap
	} from './map.js';
	import { mapStyle } from './style.js';
	import type { Hint, LatLon } from '#lib/api/client.js';
	import { theme } from '#lib/theme.svelte.js';
	import { i18n } from '#lib/i18n/index.svelte.js';

	interface Props {
		bbox: BBox;
		labels: boolean;
		hints: Hint[];
		guess: LatLon | null;
		active: boolean;
		onpick: (p: LatLon) => void;
	}
	let { bbox, labels, hints, guess, active, onpick }: Props = $props();

	let el: HTMLDivElement;
	let map: MlMap | null = null;
	let pinMarker: Marker | null = null;
	let shape: GeoJSON.Geometry | null = null;
	// isStyleLoaded() is still false inside 'style.load', so we keep our own flag
	let styleReady = false;

	onMount(() => {
		map = createMap({ container: el, theme: theme.value, lang: i18n.lang, labels, bbox });
		map.getCanvas().style.cursor = 'crosshair';
		map.on('style.load', () => {
			styleReady = true;
			decorate();
		});
		map.on('click', (e) => {
			if (active) onpick({ lat: e.lngLat.lat, lon: e.lngLat.lng });
		});
		countryShape().then(
			(s) => {
				shape = s;
				decorate();
			},
			() => {}
		);
		return () => map?.remove();
	});

	// our layers go on top of the basemap, and again after every style change
	function decorate() {
		if (!map || !styleReady) return;
		if (shape) addBorder(map, shape, true);
		if (!map.getSource('hints')) {
			map.addSource('hints', {
				type: 'geojson',
				data: { type: 'FeatureCollection', features: [] }
			});
			map.addLayer({
				id: 'hints-fill',
				type: 'fill',
				source: 'hints',
				paint: { 'fill-color': COLORS.line, 'fill-opacity': 0.08 }
			});
			map.addLayer({
				id: 'hints-line',
				type: 'line',
				source: 'hints',
				paint: { 'line-color': COLORS.line, 'line-width': 2, 'line-dasharray': [3, 3] }
			});
		}
		drawHints();
	}

	function drawHints() {
		if (!map?.getSource('hints')) return;
		setGeoJSON(map, 'hints', {
			type: 'FeatureCollection',
			features: hints.map((h) => circle(h.circle.center, h.circle.radiusKm))
		});
	}

	// theme and language change the basemap
	let styleKey = '';
	$effect(() => {
		const key = `${theme.value}/${i18n.lang}/${labels}`;
		if (map && styleKey && key !== styleKey) {
			styleReady = false;
			map.setStyle(mapStyle(theme.value, i18n.lang, labels));
		}
		styleKey = key;
	});

	$effect(() => {
		void hints.length;
		drawHints();
		const last = hints.at(-1);
		if (map && last) {
			const c = circle(last.circle.center, last.circle.radiusKm).geometry.coordinates[0];
			const lons = c.map((p) => p[0]);
			const lats = c.map((p) => p[1]);
			map.fitBounds([Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)], {
				padding: 20,
				duration: 400
			});
		}
	});

	$effect(() => {
		if (!map) return;
		if (!guess) {
			pinMarker?.remove();
			pinMarker = null;
		} else if (pinMarker) {
			pinMarker.setLngLat([guess.lon, guess.lat]);
		} else {
			pinMarker = marker(COLORS.guess, guess).addTo(map);
		}
	});

	/** Back to the whole map, e.g. at the start of a round. */
	export function fitArea() {
		map?.fitBounds(bbox, { padding: 10, duration: 0 });
	}

	/** After the container changed size (bigger on hover, shown on a phone). */
	export function resize() {
		map?.resize();
	}
</script>

<div class="guess-map" bind:this={el}></div>

<style>
	.guess-map {
		width: 100%;
		height: 100%;
	}
	.guess-map :global(.maplibregl-ctrl-attrib) {
		font-size: 9px;
	}
</style>
