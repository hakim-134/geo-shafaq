<script lang="ts">
	// The laptop home's right half: Tashkent's 13 tumanlar on the place map's own drawing
	// (PlaceMap: names inside their shapes, coloured by what the player knows). The place on the
	// home's sign is marked (a district lit, the whole city edged); a click on a district makes
	// it the sign at once (onpick), no page in between. Before the first game it glows under
	// "Shu yerdan boshlang". The sign names what is picked, so the map has no caption of it.
	import { goto } from '$app/navigation';
	import { api, call, type Schemas } from '#lib/api/client.js';
	import { session } from '#lib/session.svelte.js';
	import { t } from '#lib/i18n/index.svelte.js';
	import PlaceMap from './PlaceMap.svelte';

	// chosen: the map on the home's sign ("tashkent-streets", "place-chilonzor-tumani", …);
	// onpick: a district clicked, by its map (without it, the place map opens with it picked)
	let {
		glow = false,
		chosen = '',
		onpick
	}: { glow?: boolean; chosen?: string; onpick?: (map: string) => void } = $props();
	const pick = $derived(chosen.startsWith('place-') ? chosen.slice(6) : '');
	const whole = $derived(chosen === 'tashkent-streets' || pick === 'toshkent');

	let detail = $state<Schemas['PlaceDetail'] | null>(null);
	let drawing = $state<Schemas['PlaceMap'] | null>(null);

	$effect(() => {
		void session.version;
		load_();
	});

	async function load_() {
		try {
			const params = { params: { path: { slug: 'toshkent' } } };
			[detail, drawing] = await Promise.all([
				call(api().GET('/v1/places/{slug}', params)),
				call(api().GET('/v1/places/{slug}/map', params))
			]);
		} catch {
			/* the map is a bonus: without it the right half stays quiet */
		}
	}
</script>

{#if detail && drawing}
	<figure class="city" class:glow>
		<!-- before the first game there is no "your Tashkent" yet: the city glows, start here -->
		<figcaption class="title">{glow ? t('startHere') : t('yourTashkent')}</figcaption>
		<PlaceMap
			{drawing}
			cards={detail.children}
			lit={pick ? [pick] : []}
			{whole}
			ondrill={() => {}}
			onpick={(c) => (onpick ? onpick(c.map) : goto(`/places/toshkent?pick=${c.slug}`))}
		/>
	</figure>
{/if}

<style>
	.city {
		display: flex;
		flex-direction: column;
		gap: 14px;
		margin: 0;
	}
	.title {
		align-self: flex-start;
		font-family: var(--display);
		font-weight: 800;
		font-size: 18px;
	}
	/* before the first game the whole city breathes, under a gold "start here" */
	.glow :global(svg) {
		animation: halo 2.4s ease-in-out infinite;
	}
	.glow .title {
		padding: 4px 14px;
		border-radius: 999px;
		background: color-mix(in srgb, var(--star) 30%, transparent);
	}
	@keyframes halo {
		50% {
			filter: drop-shadow(0 6px 10px rgba(19, 35, 63, 0.16))
				drop-shadow(0 0 14px color-mix(in srgb, var(--star) 70%, transparent));
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.glow :global(svg) {
			animation: none;
		}
	}
</style>
