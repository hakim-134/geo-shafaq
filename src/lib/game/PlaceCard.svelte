<script lang="ts">
	// "You were here": the street, the district and the nearest metro in Tashkent, the city and
	// region elsewhere. Every round teaches something.
	import type { LatLon, Schemas } from '#lib/api/client.js';
	import { fmtDistance } from '#lib/format.js';
	import { t, tx } from '#lib/i18n/index.svelte.js';

	let { place, at }: { place: Schemas['PlaceInfo']; at: LatLon } = $props();

	const title = $derived(tx(place.street ?? place.district ?? place.city ?? place.region));
	const lines = $derived(
		[
			place.street ? place.district : undefined,
			place.city && (place.street || place.district) ? place.city : undefined,
			!place.city || place.region ? place.region : undefined
		]
			.filter((x) => x && tx(x) !== title)
			.map((x) => tx(x))
	);
	const mapUrl = $derived(`https://yandex.uz/maps/?pt=${at.lon},${at.lat}&z=17&l=map`);
</script>

<div class="place-card">
	{t('youWereIn')}:
	<b>{title || '—'}</b>
	{#each lines as line, i (i)}<span class="line">{line}</span>{/each}
	{#if place.metro}
		<span class="line metro"
			>{t('metro')}: {tx(place.metro.name)} · {fmtDistance(place.metro.km)}</span
		>
	{/if}
	<a href={mapUrl} target="_blank" rel="noopener">{t('openMap')} ↗</a>
</div>

<style>
	.place-card {
		border-radius: 14px;
		padding: 14px 16px;
		background: var(--bg);
		font-size: 13.5px;
		color: var(--muted);
	}
	b {
		display: block;
		margin-top: 2px;
		font-family: var(--display);
		font-weight: 700;
		font-size: 17px;
		color: var(--text);
	}
	.line {
		display: block;
		margin-top: 4px;
		color: var(--text);
		font-weight: 500;
	}
	.metro::before {
		content: 'Ⓜ ';
		color: var(--sky);
	}
	a {
		display: inline-block;
		margin-top: 10px;
		font-weight: 600;
		color: var(--sky-ink);
		text-decoration: none;
	}
	a:hover {
		text-decoration: underline;
	}
</style>
