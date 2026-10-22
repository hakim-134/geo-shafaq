<script lang="ts">
	// Where the place really was and where the player guessed, joined by a dashed line.
	import { onMount } from 'svelte';
	import type { Marker } from 'maplibre-gl';
	import {
		addBorder,
		boundsOf,
		COLORS,
		countryShape,
		createMap,
		marker,
		setGeoJSON,
		type BBox,
		type MlMap
	} from './map.js';
	import { mapStyle } from './style.js';
	import type { LatLon } from '#lib/api/client.js';
	import { theme } from '#lib/theme.svelte.js';
	import { i18n } from '#lib/i18n/index.svelte.js';

	export interface Pair {
		actual: LatLon;
		guess?: LatLon;
		label?: string;
	}

	let { pairs, bbox }: { pairs: Pair[]; bbox: BBox } = $props();

	let el: HTMLDivElement;
	let map: MlMap | null = null;
	let markers: Marker[] = [];
	let shape: GeoJSON.Geometry | null = null;
	// isStyleLoaded() is still false inside 'style.load', so we keep our own flag
	let styleReady = false;
	let ready = $state(false);

	onMount(() => {
		map = createMap({ container: el, theme: theme.value, lang: i18n.lang, labels: true, bbox });
		map.on('style.load', () => {
			styleReady = true;
			decorate();
			ready = true;
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

	function decorate() {
		if (!map || !styleReady) return;
		if (shape) addBorder(map, shape, false);
		if (!map.getSource('lines')) {
			map.addSource('lines', {
				type: 'geojson',
				data: { type: 'FeatureCollection', features: [] }
			});
			map.addLayer({
				id: 'lines',
				type: 'line',
				source: 'lines',
				paint: {
					'line-color': COLORS.line,
					'line-width': 2.5,
					'line-opacity': 0.85,
					'line-dasharray': [2, 2]
				}
			});
		}
		draw();
	}

	function draw() {
		if (!map) return;
		for (const m of markers) m.remove();
		markers = [];
		const lines: GeoJSON.Feature[] = [];
		const points: LatLon[] = [];
		for (const p of pairs) {
			markers.push(marker(COLORS.actual, p.actual, p.label).addTo(map));
			points.push(p.actual);
			if (p.guess) {
				markers.push(marker(COLORS.guess, p.guess).addTo(map));
				points.push(p.guess);
				lines.push({
					type: 'Feature',
					properties: {},
					geometry: {
						type: 'LineString',
						coordinates: [
							[p.actual.lon, p.actual.lat],
							[p.guess.lon, p.guess.lat]
						]
					}
				});
			}
		}
		setGeoJSON(map, 'lines', { type: 'FeatureCollection', features: lines });
		map.resize();
		if (points.length === 1) map.jumpTo({ center: [points[0].lon, points[0].lat], zoom: 14 });
		else if (points.length)
			map.fitBounds(boundsOf(points), { padding: 60, maxZoom: 16, duration: 0 });
	}

	$effect(() => {
		void pairs;
		if (ready) draw();
	});

	let styleKey = '';
	$effect(() => {
		const key = `${theme.value}/${i18n.lang}`;
		if (map && styleKey && key !== styleKey) {
			styleReady = false;
			map.setStyle(mapStyle(theme.value, i18n.lang, true));
		}
		styleKey = key;
	});
</script>

<div class="result-map" bind:this={el}></div>

<style>
	.result-map {
		width: 100%;
		height: 100%;
	}
</style>
