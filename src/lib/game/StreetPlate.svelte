<script lang="ts">
	// "You were here", as the sign you would see there: a street is a blue Tashkent street
	// plate (the district on the small line above the name), a district or town is a white
	// entry sign, a region a green one. The nearest metro is a badge under it. With land, the
	// plate drops in and settles: the round's lesson is the thing that lands.
	import type { LatLon, Schemas } from '#lib/api/client.js';
	import { fmtDistance } from '#lib/format.js';
	import { t, tx } from '#lib/i18n/index.svelte.js';
	import { openPanorama, panoramaUrl } from '#lib/map/map.js';

	interface Props {
		place: Schemas['PlaceInfo'];
		at?: LatLon; // the real place: "Panoramada ko‘rish ↗" opens it, as the map's badge does
		heading?: number;
		land?: boolean;
		delay?: number;
		size?: 'big' | 'small';
	}
	let { place, at, heading, land = false, delay = 0, size = 'big' }: Props = $props();

	const kind = $derived(place.street ? 'blue' : place.district || place.city ? 'white' : 'green');
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
</script>

<div class="where {size}">
	<span class="plate {kind}" class:land style:animation-delay={`${delay}ms`}>
		<span class="inner">
			{#if top}<span class="top">{top}</span>{/if}
			<span class="name" style:--len={name.length}>{name}</span>
		</span>
		<i class="bolt l" aria-hidden="true"></i><i class="bolt r" aria-hidden="true"></i>
	</span>
	{#if size === 'big' && (place.metro || at)}
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
	.plate {
		--plate: var(--sign-blue);
		--ink: #fff;
		--rim: #fff;
		position: relative;
		display: block;
		padding: 5px;
		border-radius: 10px;
		background: var(--plate);
		color: var(--ink);
		box-shadow:
			0 1px 0 rgba(255, 255, 255, 0.25) inset,
			0 4px 0 rgba(0, 0, 0, 0.18),
			0 10px 22px rgba(19, 35, 63, 0.18);
		transform-origin: 50% 0;
	}
	.plate.white {
		--plate: #fbfaf6;
		--ink: #13233f;
		--rim: #13233f;
	}
	.plate.green {
		--plate: var(--sign-green);
	}
	.inner {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 10px 22px 12px;
		border: 2.5px solid var(--rim);
		border-radius: 7px;
	}
	.top {
		font-size: 13px;
		font-weight: 600;
		opacity: 0.9;
		line-height: 1.2;
	}
	.name {
		font-family: var(--display);
		font-weight: 800;
		font-size: 24px;
		line-height: 1.12;
		letter-spacing: -0.01em;
		overflow-wrap: anywhere;
	}
	.small .inner {
		padding: 5px 12px 6px;
		border-width: 1.5px;
	}
	.small .top {
		display: none;
	}
	.small .name {
		font-size: 14px;
	}
	.small .bolt {
		display: none;
	}
	.bolt {
		position: absolute;
		top: 50%;
		width: 6px;
		height: 6px;
		margin-top: -3px;
		border-radius: 50%;
		background: color-mix(in srgb, var(--rim) 70%, transparent);
	}
	.bolt.l {
		left: 9px;
	}
	.bolt.r {
		right: 9px;
	}
	/* hung up like a real plate: it swings in from above and settles */
	.land {
		animation: hang 0.8s var(--settle) both;
	}
	@keyframes hang {
		0% {
			opacity: 0;
			transform: translateY(-40px) rotate(-7deg);
		}
		45% {
			opacity: 1;
			transform: translateY(0) rotate(3deg);
		}
		70% {
			transform: rotate(-1.5deg);
		}
		100% {
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
		font-size: 14px;
	}
	.under a {
		font-weight: 600;
		color: var(--sky-ink);
		text-decoration: none;
	}
	:global(:root[data-theme='dark']) .under a {
		color: var(--sky);
	}
	.metro {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		font-weight: 600;
	}
	/* Tashkent metro's own letter: a blue M in a circle */
	.metro b {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		background: #0a5bb5;
		color: #fff;
		font-family: var(--display);
		font-size: 12px;
		display: grid;
		place-items: center;
	}
	.metro .km {
		font-weight: 500;
		color: var(--muted);
	}
	/* on a phone a long name gets smaller to stay on one line, as on a real plate: a second line
	   would push a room's table under its buttons ("Yangi O‘zbekiston ko‘chasi": 17 px) */
	@media (max-width: 760px) {
		.name {
			font-size: clamp(15px, calc(440px / var(--len, 12)), 20px);
		}
	}
</style>
