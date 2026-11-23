<script lang="ts">
	// "Sizning Toshkentingiz" (P1028 4.3): Tashkent's 13 districts on the place map's own drawing
	// (PlaceMap: the districts as tiles with their names inside, gold as their streets are
	// learned), the streets learned beside its title. The profile's big picture: a tap on a
	// district shows its streets (onpick). Before the first game it glows under a gold "Shu
	// yerdan boshlang". It lies straight on the ground, as the home's map does.
	import { api, call, type Schemas } from '#lib/api/client.js';
	import { session } from '#lib/session.svelte.js';
	import { t } from '#lib/i18n/index.svelte.js';
	import { fmtNum } from '#lib/format.js';
	import PlaceMap from './PlaceMap.svelte';

	let {
		glow = false,
		onpick
	}: {
		glow?: boolean;
		onpick: (c: Schemas['PlaceCard']) => void;
	} = $props();

	let detail = $state<Schemas['PlaceDetail'] | null>(null);
	let drawing = $state<Schemas['PlaceMap'] | null>(null);
	// the city without what floats outside it (Mirzo Ulug‘bek's far piece reads as a stain, with a
	// blank band above the city for it): only here, the place map stays whole
	const city = $derived.by(() => {
		if (!drawing) return null;
		const rings = (d: string) => d.split('M').filter((r) => r.trim());
		const box = (r: string) => {
			const n = (r.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
			const xs = n.filter((_, i) => i % 2 === 0);
			const ys = n.filter((_, i) => i % 2 === 1);
			return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
		};
		const size = (b: number[]) => (b[2] - b[0]) * (b[3] - b[1]);
		const main = drawing.shapes.map((s) =>
			rings(s.d)
				.map(box)
				.reduce((a, b) => (size(b) > size(a) ? b : a))
		);
		const all = [
			Math.min(...main.map((b) => b[0])),
			Math.min(...main.map((b) => b[1])),
			Math.max(...main.map((b) => b[2])),
			Math.max(...main.map((b) => b[3]))
		] as [number, number, number, number];
		const inCity = (b: number[]) =>
			b[0] < all[2] && b[2] > all[0] && b[1] < all[3] && b[3] > all[1];
		return {
			crop: all,
			drawing: {
				...drawing,
				shapes: drawing.shapes.map((s) => ({
					...s,
					d: rings(s.d)
						.filter((r) => inCity(box(r)))
						.map((r) => `M${r}`)
						.join(' ')
				}))
			}
		};
	});
	const known = $derived(detail?.place.progress);

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
			/* the map is a bonus: without it the page goes on without it */
		}
	}
</script>

{#if detail && city}
	<figure class="city" class:glow>
		<!-- before the first game there is no "your Tashkent" yet: the city glows, start here -->
		<figcaption class="head">
			{#if glow}<span class="kick-tag">{t('startHere')}</span>{/if}
			<h2 class="d float title">{t('yourTashkent')}</h2>
			{#if !glow && known}
				{#if known.learned}
					<p class="count">
						<b class="d">{fmtNum(known.learned)}</b> / {fmtNum(known.total)}
						{t('streetsLearnedShort')}
					</p>
				{:else}
					<p class="count">{t('firstLearnHint')}</p>
				{/if}
			{/if}
		</figcaption>
		<PlaceMap
			drawing={city.drawing}
			crop={city.crop}
			level
			cards={detail.children}
			ondrill={() => {}}
			{onpick}
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
	.head {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 6px;
	}
	.title {
		font-size: 26px;
		line-height: 1.15;
		color: var(--on-ground);
		transform-origin: 0 75%;
	}
	.count {
		font-size: 15px;
		font-weight: 600;
		color: var(--on-ground-2);
	}
	/* the learned ones: gold, as on the map */
	.count b {
		font-size: 20px;
		color: var(--gold-text);
		margin-right: 2px;
	}
	/* before the first game the whole city breathes, gold, under the gold "start here" */
	.glow :global(svg) {
		animation: halo 2.4s ease-in-out infinite;
	}
	@keyframes halo {
		50% {
			filter: drop-shadow(0 6px 10px var(--shade))
				drop-shadow(0 0 16px color-mix(in srgb, var(--gold) 75%, transparent));
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.glow :global(svg) {
			animation: none;
		}
	}
</style>
