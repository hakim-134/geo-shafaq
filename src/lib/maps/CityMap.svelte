<script lang="ts">
	// Tashkent's tumanlar, drawn from their borders and coloured by what the player knows:
	// paper for unplayed, gold as streets are learned, each with its name, so the city's
	// shape is learned too. The place on the home's sign is marked (a district filled, the
	// whole city edged); a tap opens a district in the place picker. The laptop home's right
	// half, until the place map (P1028 4.1–4.3) replaces it.
	import { api, call, type Schemas } from '#lib/api/client.js';
	import { session } from '#lib/session.svelte.js';
	import { t, tx } from '#lib/i18n/index.svelte.js';
	import Progress from './Progress.svelte';

	// chosen: the map on the home's sign ("tashkent-streets", "place-chilonzor-tumani", …)
	let { glow = false, chosen = '' }: { glow?: boolean; chosen?: string } = $props();
	const pick = $derived(chosen.startsWith('place-') ? chosen.slice(6) : '');
	const whole = $derived(chosen === 'tashkent-streets' || pick === 'toshkent');

	type Card = Schemas['PlaceCard'];
	type Ring = number[][];
	interface District {
		card: Card;
		d: string;
		at: [number, number]; // where its name goes
	}

	let city = $state<Card | null>(null);
	let districts = $state<District[]>([]);
	let viewBox = $state('0 0 100 100');
	let hover = $state<Card | null>(null);

	$effect(() => {
		void session.version;
		load_();
	});

	async function load_() {
		try {
			const detail = await call(
				api().GET('/v1/places/{slug}', { params: { path: { slug: 'toshkent' } } })
			);
			const cards = detail.children.filter((c) => c.panoramas > 0);
			const shapes = await Promise.all(
				cards.map((c) =>
					call(api().GET('/v1/places/{slug}/shape', { params: { path: { slug: c.slug } } }))
				)
			);
			draw(
				cards,
				shapes.map((s) => polygons(s.geometry))
			);
			city = detail.place;
		} catch {
			/* the map is a bonus: without it the right half stays quiet */
		}
	}

	function polygons(g: Record<string, unknown>): Ring[][] {
		const c = g.coordinates as number[][][] | number[][][][];
		return g.type === 'Polygon' ? [c as Ring[]] : (c as Ring[][]);
	}

	// a flat projection is fine at a city's size: shrink longitude by the cosine of the latitude
	function draw(cards: Card[], shapes: Ring[][][]) {
		const pts = shapes.flat(3);
		const lat0 = (Math.min(...pts.map((p) => p[1])) + Math.max(...pts.map((p) => p[1]))) / 2;
		const kx = Math.cos((lat0 * Math.PI) / 180);
		const xy = (p: number[]): [number, number] => [p[0] * kx * 1000, -p[1] * 1000];
		const all = pts.map(xy);
		const x0 = Math.min(...all.map((p) => p[0]));
		const y0 = Math.min(...all.map((p) => p[1]));
		const w = Math.max(...all.map((p) => p[0])) - x0;
		const h = Math.max(...all.map((p) => p[1])) - y0;
		const pad = Math.max(w, h) * 0.03;
		viewBox = `${-pad} ${-pad} ${(w + 2 * pad).toFixed(1)} ${(h + 2 * pad).toFixed(1)}`;
		const local = (ring: Ring) => ring.map(xy).map(([x, y]): [number, number] => [x - x0, y - y0]);
		districts = cards.map((card, i) => {
			const rings = shapes[i].flat().map(local);
			return {
				card,
				d: rings
					.map((r) => 'M' + r.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L') + 'Z')
					.join(''),
				at: centroid(rings.reduce((a, b) => (Math.abs(area(b)) > Math.abs(area(a)) ? b : a)))
			};
		});
	}

	function area(r: [number, number][]): number {
		let s = 0;
		for (let i = 0, j = r.length - 1; i < r.length; j = i++)
			s += r[j][0] * r[i][1] - r[i][0] * r[j][1];
		return s / 2;
	}

	function centroid(r: [number, number][]): [number, number] {
		let x = 0,
			y = 0;
		for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
			const f = r[j][0] * r[i][1] - r[i][0] * r[j][1];
			x += (r[j][0] + r[i][0]) * f;
			y += (r[j][1] + r[i][1]) * f;
		}
		const a = area(r) * 6;
		return [x / a, y / a];
	}

	// "Chilonzor tumani" → "Chilonzor": the map is all districts
	const short = (name: string) => name.replace(/\s+(tumani|район|district)$/i, '');

	// names that would overlap (small districts side by side) move apart, up and down
	const labels = $derived.by(() => {
		const out = districts.map(({ card, at }) => ({
			slug: card.slug,
			text: short(tx(card.name)),
			x: at[0],
			y: at[1]
		}));
		const LINE = 9;
		for (let pass = 0; pass < 4; pass++)
			for (const a of out)
				for (const b of out) {
					if (a === b || Math.abs(a.x - b.x) > ((a.text.length + b.text.length) * 4.4) / 2)
						continue;
					const gap = LINE - Math.abs(a.y - b.y);
					if (gap <= 0) continue;
					const up = a.y < b.y || (a.y === b.y && a.slug < b.slug) ? -1 : 1;
					a.y += (up * gap) / 2;
					b.y -= (up * gap) / 2;
				}
		return out;
	});

	// how much gold: the share of its streets seen tints it, learned ones fill it; solid only
	// when every street there is learned (one game of five streets is a faint tint)
	function known(p: Card['progress']): string {
		if (!p.total || !p.seen) return '0%';
		return `${Math.round(10 + (70 * (0.35 * p.seen + 0.65 * p.learned)) / p.total)}%`;
	}

	const chosenCard = $derived(districts.find((x) => x.card.slug === pick)?.card ?? null);
	// the picked place keeps the caption wherever the mouse rests; otherwise the hovered one
	const shown = $derived(chosenCard ?? hover);
</script>

{#if districts.length}
	<figure class="city" class:glow>
		<figcaption class="title">{t('yourTashkent')}</figcaption>
		<svg {viewBox} role="img" aria-label={city ? tx(city.name) : ''} class:whole>
			{#each districts as { card, d } (card.slug)}
				<a
					href={`/places/${card.slug}`}
					aria-label={tx(card.name)}
					onpointerenter={() => (hover = card)}
					onpointerleave={() => (hover = null)}
					onfocus={() => (hover = card)}
					onblur={() => (hover = null)}
				>
					<path {d} class:played={card.progress.seen > 0} style:--known={known(card.progress)} />
				</a>
			{/each}
			<!-- the chosen place and the hovered one, edged on top of their neighbours -->
			{#each districts as { card, d } (card.slug)}
				{#if card.slug === pick || card.slug === hover?.slug}
					<path {d} class="edge" class:pick={card.slug === pick} />
				{/if}
			{/each}
			{#each labels as l (l.slug)}
				<text x={l.x} y={l.y} class:on={hover?.slug === l.slug || pick === l.slug}>{l.text}</text>
			{/each}
		</svg>
		<!-- the chosen district by name (its count is under the sign); else a hovered one with its count -->
		<p class="caption">
			{#if shown}
				<b>{tx(shown.name)}</b>
				{#if !chosenCard && hover}<Progress progress={hover.progress} />{/if}
			{/if}
		</p>
	</figure>
{/if}

<style>
	.city {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 14px;
		margin: 0;
		animation: rise 0.5s var(--settle) both;
	}
	.title {
		align-self: flex-start;
		font-family: var(--display);
		font-weight: 800;
		font-size: 18px;
	}
	svg {
		width: 100%;
		max-height: min(560px, 64vh);
		overflow: visible;
	}
	svg {
		filter: drop-shadow(0 6px 10px rgba(19, 35, 63, 0.16));
	}
	path {
		fill: color-mix(in srgb, var(--gold) var(--known), var(--bg));
		stroke: var(--lapis);
		stroke-width: 1.4;
		stroke-linejoin: round;
		paint-order: stroke;
		transition: fill 0.15s;
	}
	:global(:root[data-theme='dark']) path {
		stroke: color-mix(in srgb, var(--sky) 55%, var(--bg));
	}
	/* on the night-blue map gold mixed thin turns brown: the stars' gold, stronger, gold-edged */
	:global(:root[data-theme='dark']) path.played {
		fill: color-mix(in srgb, var(--star) calc(var(--known) + 12%), var(--surface));
		stroke: var(--star);
	}
	path.edge {
		fill: none;
		stroke: var(--sky);
		stroke-width: 2.4;
		pointer-events: none;
	}
	path.edge.pick {
		fill: color-mix(in srgb, var(--sky) 28%, transparent);
		stroke-width: 3.2;
	}
	/* "Toshkent ko‘chalari": the whole city, edged */
	svg.whole {
		filter: drop-shadow(0 0 1.5px var(--sky)) drop-shadow(0 0 1.5px var(--sky))
			drop-shadow(0 6px 10px rgba(19, 35, 63, 0.16));
	}
	text {
		font-family: var(--body);
		font-weight: 700;
		font-size: 8px;
		text-anchor: middle;
		dominant-baseline: middle;
		fill: var(--text);
		stroke: color-mix(in srgb, var(--bg) 85%, transparent);
		stroke-width: 2.4px;
		paint-order: stroke;
		pointer-events: none;
		opacity: 0.8;
	}
	text.on {
		opacity: 1;
		font-weight: 800;
	}
	a:focus-visible {
		outline: none;
	}
	/* before the first game the whole city breathes */
	.glow svg {
		animation: halo 2.4s ease-in-out infinite;
	}
	@keyframes halo {
		50% {
			filter: drop-shadow(0 6px 10px rgba(19, 35, 63, 0.16))
				drop-shadow(0 0 14px color-mix(in srgb, var(--star) 70%, transparent));
		}
	}
	.caption {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 28px;
		font-size: 14px;
		color: var(--muted);
	}
	.caption b {
		font-family: var(--display);
		font-size: 15px;
		color: var(--text);
	}
	@media (prefers-reduced-motion: reduce) {
		.glow svg {
			animation: none;
		}
	}
</style>
