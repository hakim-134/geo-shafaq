<script lang="ts">
	// My map (P1028 4.3): Tashkent's 13 tumanlar on the place map's own drawing (PlaceMap: names
	// inside their shapes, coloured by what the player knows), the streets learned beside its
	// title. The profile's big picture, where a tap on a district shows its streets; the laptop
	// home's right half, where the place on the sign is marked (a district lit, the whole city
	// edged) and a click on a district makes it the sign at once. onpick says which. Before the
	// first game it glows under "Shu yerdan boshlang".
	import { api, call, type Schemas } from '#lib/api/client.js';
	import { session } from '#lib/session.svelte.js';
	import { t, tx } from '#lib/i18n/index.svelte.js';
	import { fmtNum } from '#lib/format.js';
	import PlaceMap from './PlaceMap.svelte';
	import { shortName } from './progress.js';

	// chosen: the map on the home's sign ("tashkent-streets", "place-chilonzor-tumani", …);
	// onstreets: the home's way to the streets of the district on the sign, beside the title
	let {
		glow = false,
		chosen = '',
		onpick,
		onstreets
	}: {
		glow?: boolean;
		chosen?: string;
		onpick: (c: Schemas['PlaceCard']) => void;
		onstreets?: (c: Schemas['PlaceCard']) => void;
	} = $props();
	const pick = $derived(chosen.startsWith('place-') ? chosen.slice(6) : '');
	const whole = $derived(chosen === 'tashkent-streets' || pick === 'toshkent');

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
	const picked = $derived(detail?.children.find((c) => c.slug === pick));
	const known = $derived((picked ?? detail?.place)?.progress);

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

{#if detail && city}
	<figure class="city" class:glow>
		<!-- before the first game there is no "your Tashkent" yet: the city glows, start here -->
		<figcaption class="head">
			<span class="title">{glow ? t('startHere') : t('yourTashkent')}</span>
			{#if !glow && known}
				{#if picked && onstreets}
					<button class="count link" onclick={() => onstreets(picked)}>
						{shortName(tx(picked.name))}: <b>{fmtNum(known.learned)}</b> / {fmtNum(known.total)}
						{t('streetsWord')}
						<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
					</button>
				{:else if known.learned}
					<span class="count">
						<b>{fmtNum(known.learned)}</b> / {fmtNum(known.total)}
						{t('streetsLearnedShort')}
					</span>
				{:else}
					<span class="count">{t('firstLearnHint')}</span>
				{/if}
			{/if}
		</figcaption>
		<PlaceMap
			drawing={city.drawing}
			crop={city.crop}
			level
			cards={detail.children}
			lit={pick ? [pick] : []}
			{whole}
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
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 2px 12px;
	}
	.count {
		font-size: 14px;
		color: var(--muted);
		text-decoration: none;
	}
	.count.link {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		min-height: 32px;
		padding: 0;
		border: none;
		background: none;
		font: inherit;
		font-size: 14px;
		font-weight: 600;
		color: var(--sky-ink);
		cursor: pointer;
	}
	:global(:root[data-theme='dark']) .count.link {
		color: var(--sky);
	}
	.count.link:hover {
		text-decoration: underline;
	}
	.count.link .icon {
		width: 16px;
		height: 16px;
	}
	.count b {
		font-family: var(--display);
		font-size: 17px;
		color: var(--green-ink);
	}
	:global(:root[data-theme='dark']) .count b {
		color: var(--green);
	}
	.title {
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
