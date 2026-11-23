<script lang="ts">
	// The place the round was about, on a glazed lapis plaque: the larger place in small gold
	// caps over the name. It is the same object by day and by night, like a tile on a wall.
	// Under it, the nearest metro and the panorama link. With land, it rises in after the score:
	// the round's lesson is the thing that lands.
	// At its left end, the place's face (place-in-parent): the district filled gold inside its
	// city's shape, so the player sees where it is, not only what it is called.
	import type { LatLon, Schemas } from '#lib/api/client.js';
	import { fmtDistance } from '#lib/format.js';
	import { t, tx } from '#lib/i18n/index.svelte.js';
	import { openPanorama, panoramaUrl } from '#lib/map/map.js';
	import PlaceInParent from '#lib/maps/PlaceInParent.svelte';

	interface Props {
		place: Schemas['PlaceInfo'];
		at?: LatLon; // the real place: "Panoramada ko‘rish ↗" opens it, as the map's badge does
		heading?: number;
		land?: boolean;
		delay?: number;
	}
	let { place, at, heading, land = false, delay = 0 }: Props = $props();

	const name = $derived(tx(place.street ?? place.district ?? place.city ?? place.region) || '—');
	// the larger place on the small line: a street's district, a district's city, a city's region
	const top = $derived.by(() => {
		const p = place;
		const up = p.street
			? (p.district ?? p.city)
			: p.district
				? (p.city ?? p.region)
				: p.city
					? p.region
					: undefined;
		const s = tx(up);
		return s && s !== name ? s : '';
	});
	// the longest word sets how small the name may get: it wraps at a space, never inside a word
	const longest = $derived(Math.max(...name.split(/\s+/).map((w) => w.length)));
</script>

<div class="place">
	<div class="plaque" class:land style:animation-delay={`${delay}ms`}>
		{#if place.slug}
			<div class="pic"><PlaceInParent place={place.slug} /></div>
		{/if}
		<div class="words">
			{#if top}<span class="top">{top}</span>{/if}
			<span class="name" style:--len={name.length} style:--word={longest}>{name}</span>
		</div>
	</div>
	{#if place.metro || at}
		<div class="under">
			{#if place.metro}
				<span class="metro"
					><b aria-hidden="true">M</b>{tx(place.metro.name)}
					<span class="km">{fmtDistance(place.metro.km)}</span></span
				>
			{/if}
			{#if at}
				<a
					href={panoramaUrl(at, heading)}
					target="_blank"
					rel="noopener"
					onclick={(e) => {
						e.preventDefault();
						openPanorama(at, heading);
					}}>{t('seePanorama')}</a
				>
			{/if}
		</div>
	{/if}
</div>

<style>
	/* the picture's tiles are the plaque's own blue, a step lighter, by day and by night: the
	   gold place is what the eye finds */
	.pic {
		/* the parent drawn faint, so the gold place is what the eye finds */
		--pip-tile: var(--plaque-tile, rgba(255, 255, 255, 0.16));
		--pip-seam: var(--plaque-tline, rgba(190, 240, 240, 0.5));
		--pip-ring: var(--gold);
		flex: none;
		width: 60px;
		height: 60px;
		filter: drop-shadow(0 2px 0 var(--plaque-lip, #052e36));
	}
	/* a glazed tile: lapis, a thin double gold seam inside its edge, a dark lip under it */
	.plaque {
		--gold-seam: rgba(246, 188, 47, 0.9);
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 74px;
		padding: 12px 18px;
		border-radius: 16px;
		background: linear-gradient(180deg, var(--plaque-a, #0f6272), var(--plaque-b, #0a4753));
		color: #fff;
		box-shadow:
			inset 0 2px 0 rgba(255, 255, 255, 0.22),
			inset 0 0 0 1.5px var(--gold-seam),
			inset 0 0 0 4px var(--plaque-b, #0a4753),
			inset 0 0 0 5px rgba(246, 188, 47, 0.35),
			0 4px 0 var(--plaque-lip, #052e36),
			0 12px 22px var(--shade, rgba(2, 30, 36, 0.3));
		margin-bottom: 4px;
	}
	.words {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.top {
		font-family: var(--f-disp);
		font-weight: 800;
		transform: var(--lean);
		transform-origin: 0 75%;
		font-size: 12.5px;
		line-height: 1.2;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--plaque-kick, #ffd45e);
	}
	/* a long name gets smaller, down to a floor, then wraps at a space: "Mirzo Ulug‘bek tumani",
	   "Islom Karimov ko‘chasi", a long Russian name; the longest word always fits whole */
	.name {
		font-family: var(--f-disp);
		font-weight: 900;
		transform: var(--lean);
		transform-origin: 0 75%;
		font-size: clamp(18px, min(calc(560px / var(--len, 12)), calc(280px / var(--word, 8))), 24px);
		line-height: 1.08;
		letter-spacing: -0.01em;
		text-shadow: 0 2px 0 var(--plaque-lip, #052e36);
		overflow-wrap: normal;
		word-break: normal;
		hyphens: none;
		text-wrap: balance;
	}
	/* it rises in after the score and settles with a small bounce */
	.land {
		animation: plaque-in 0.6s var(--spring) both;
	}
	@keyframes plaque-in {
		0% {
			opacity: 0;
			transform: translateY(16px) scale(0.92);
		}
		100% {
			opacity: 1;
			transform: none;
		}
	}
	.under {
		margin-top: 12px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 8px 14px;
		font-size: 15px;
		font-weight: 700;
		color: var(--ink);
	}
	.under a {
		font-size: 14px;
		font-weight: 600;
		color: var(--link);
		text-decoration: none;
	}
	.metro {
		display: inline-flex;
		align-items: center;
		gap: 8px;
	}
	/* Tashkent metro's own letter: a blue M in a circle */
	.metro b {
		width: 24px;
		height: 24px;
		flex: none;
		border-radius: 50%;
		background: #1b6fe0;
		color: #fff;
		font-family: var(--f-disp);
		font-weight: 900;
		font-size: 13px;
		display: grid;
		place-items: center;
		box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.9);
	}
	.metro .km {
		font-weight: 600;
		color: var(--ink-3);
		font-variant-numeric: tabular-nums;
	}
	@media (min-width: 761px) {
		.plaque {
			min-height: 80px;
			padding: 14px 20px;
		}
		.name {
			font-size: clamp(18px, min(calc(700px / var(--len, 12)), calc(340px / var(--word, 8))), 26px);
		}
		.under {
			font-size: 16px;
			margin-top: 16px;
		}
	}
</style>
