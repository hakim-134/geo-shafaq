<script lang="ts" module>
	import type { Schemas } from '#lib/api/client.js';

	/** One round on the end's list: where it was, and how the player did there. */
	export interface EndRound {
		n: number;
		place: Schemas['PlaceInfo'];
		score: number;
		base?: number; // the score before a hint took points
		hintsUsed?: number;
	}
</script>

<script lang="ts">
	// The end of a game's streets, one list for a solo game and a room alike (a player who
	// plays both sees one thing): a milk card of rows in the order the rounds came, each the
	// round's number on a gold coin (its badge on the map), the district's face beside it,
	// never under it, the street in the leaning letters over its district, the stars and the
	// points. A tap shows that round alone on the map; a second tap, every round again.
	import PlaceInParent from '#lib/maps/PlaceInParent.svelte';
	import Stars from './Stars.svelte';
	import { fmtNum, starsFor } from '#lib/format.js';
	import { t, tx } from '#lib/i18n/index.svelte.js';

	interface Props {
		rounds: EndRound[];
		pick?: number | null; // the round shown alone on the map
		delay?: number; // ms before the list rises (a room's waits for its podium)
	}
	let { rounds, pick = $bindable(null), delay = 300 }: Props = $props();

	/** A round's place as two lines: the street (or the smallest place), and the larger place
	 * it is in, as the result's plaque says it. */
	function words(p: Schemas['PlaceInfo']) {
		const name = tx(p.street ?? p.district ?? p.city ?? p.region) || '—';
		const up = tx(
			p.street
				? (p.district ?? p.city)
				: p.district
					? (p.city ?? p.region)
					: p.city
						? p.region
						: undefined
		);
		return { name, up: up && up !== name ? up : '' };
	}
</script>

<section class="trip">
	<h2 class="section-title" style:animation-delay={`${delay}ms`}>{t('streetsThisGame')}</h2>
	<div class="panel-list stops">
		{#each rounds as r, i (r.n)}
			{@const w = words(r.place)}
			<button
				class="stop"
				aria-pressed={pick === i}
				onclick={() => (pick = pick === i ? null : i)}
				style:animation-delay={`${delay + 80 + i * 90}ms`}
			>
				<span class="stop-n d">{r.n}</span>
				<span class="stop-face">
					{#if r.place.slug}<PlaceInParent place={r.place.slug} on="panel" />{/if}
				</span>
				<span class="stop-name">
					<b class="d">{w.name}</b>
					{#if w.up}<small>{w.up}</small>{/if}
				</span>
				<span class="stop-score">
					<Stars n={starsFor(r.score)} size={14} quiet delay={delay + 400 + i * 200} />
					{#if r.base}
						<span class="stop-cut" title={t('hintsTaken', { n: r.hintsUsed ?? 1 })}
							>💡 <s>{fmtNum(r.base)}</s></span
						>
					{/if}
					<b class="d">{fmtNum(r.score)}</b>
				</span>
			</button>
		{/each}
	</div>
</section>

<style>
	.trip {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	/* the heading fades in (a rise would take its lean away), the rows rise one by one */
	.trip .section-title {
		animation: show 0.4s var(--out) both;
	}
	@keyframes show {
		from {
			opacity: 0;
		}
	}
	.stop {
		gap: 10px;
		min-height: 66px;
		padding: 10px 14px 10px 12px;
		color: var(--ink);
		text-align: left;
		animation: rise 0.4s var(--out) both;
		transition: background 0.15s;
	}
	.stop[aria-pressed='true'] {
		background: color-mix(in srgb, var(--gold) 18%, var(--panel));
		box-shadow: inset 4px 0 0 var(--gold);
	}
	/* by night a gold tint goes olive: the panel's lighter step, the gold bar says it */
	:global(:root[data-theme='dark']) .stop[aria-pressed='true'] {
		background: var(--panel-2);
	}
	/* the round's number: a gold coin like its badge on the map, left of the face */
	.stop-n {
		width: 26px;
		height: 26px;
		flex: none;
		border-radius: 50%;
		background: linear-gradient(180deg, var(--gold-hi), var(--gold));
		box-shadow:
			inset 0 1.5px 0 rgba(255, 255, 255, 0.55),
			0 2px 0 var(--gold-lo);
		color: var(--gold-ink);
		font-size: 14px;
		line-height: 26px;
		text-align: center;
	}
	/* the district in its city, whole */
	.stop-face {
		width: 40px;
		height: 40px;
		flex: none;
	}
	.stop-name {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 2px;
	}
	/* the street in the game's lettering; a long one wraps, never a word cut */
	.stop-name b {
		font-size: 16.5px;
		line-height: 1.15;
		color: var(--ink);
		transform-origin: 0 75%;
		overflow-wrap: break-word;
		max-width: 100%;
	}
	.stop-name small {
		font-size: 13px;
		font-weight: 600;
		line-height: 1.25;
		color: var(--ink-3);
	}
	.stop-score {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 3px;
		flex: none;
	}
	.stop-score b {
		font-size: 18px;
		color: var(--ink);
	}
	/* a hint took points: the score before it, small and struck */
	.stop-cut {
		font-size: 12px;
		font-weight: 700;
		color: var(--ink-3);
		font-variant-numeric: tabular-nums;
	}
</style>
