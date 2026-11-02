<script lang="ts">
	// One round's result: how close (a word and up to three stars), the score counting up,
	// how far off, and the place's own sign. It plays when go turns true (the real pin has
	// landed on the map). Solo games and rooms both use it; a room adds its table below.
	import type { Snippet } from 'svelte';
	import type { LatLon, Schemas } from '#lib/api/client.js';
	import Stars from './Stars.svelte';
	import ScoreCount from './ScoreCount.svelte';
	import StreetPlate from './StreetPlate.svelte';
	import Confetti from './Confetti.svelte';
	import { crowdGap, fmtDistance, starsFor, verdictKey } from '#lib/format.js';
	import { t } from '#lib/i18n/index.svelte.js';
	import { sfxFanfare, sfxFar, sfxLearned } from '#lib/sfx.svelte.js';

	interface Props {
		n: number;
		rounds: number; // 0 = endless
		score: number;
		base?: number; // the score before hints, when they took points
		hints?: number;
		cost?: number; // each hint's share of the score
		km: number | null | undefined;
		guessed: boolean;
		late?: boolean;
		place: Schemas['PlaceInfo'];
		actual: LatLon;
		heading?: number; // the round's first heading: the plate's panorama link faces it
		crowd?: number; // the average distance of the round's guesses: the ring on the map
		go: boolean;
		children?: Snippet;
	}
	let {
		n,
		rounds,
		score,
		base,
		hints = 0,
		cost = 0,
		km,
		guessed,
		late = false,
		place,
		actual,
		heading,
		crowd,
		go,
		children
	}: Props = $props();

	const stars = $derived(starsFor(score));
	const perfect = $derived(guessed && verdictKey(score) === 'perfect');
	// next to the ring: how this guess stands against the average
	const vsCrowd = $derived(
		guessed && !late && km != null && crowd != null ? crowdGap(crowd, km) : null
	);
	// the game's whole point, said when it happens: a street guessed within 500 m is learned
	const learned = $derived(guessed && km != null && km <= 0.5 && !!place.street);
	const title = $derived(late ? t('late') : guessed ? t(verdictKey(score)) : t('noGuess'));

	let party = $state(false);
	$effect(() => {
		if (!go) return;
		if (perfect) {
			party = true;
			setTimeout(sfxFanfare, 350);
		} else if (!stars) setTimeout(sfxFar, 200);
		if (learned) setTimeout(sfxLearned, 900);
	});
</script>

<div class="reveal" class:go>
	<div class="head">
		<div>
			<div class="round">
				{t('roundN', { n })}{#if rounds}&nbsp;/ {rounds}{/if}
			</div>
			<h2 class="verdict" class:perfect>{title}</h2>
		</div>
		<Stars n={stars} {go} delay={200} />
	</div>

	<ScoreCount {score} {base} {hints} {cost} max={5000} {go} delay={350} />
	<p class="far">
		{#if guessed && km != null}
			<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"
				><path d="M4 12h16M4 12l3-3M4 12l3 3M20 12l-3-3M20 12l-3 3" /></svg
			>
			{t('kmAway', { d: fmtDistance(km) })}
		{:else}
			{t('noPin')}
		{/if}
	</p>
	{#if learned}
		<p class="learned-line">
			<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"
				><path d="m5 12.5 4.5 4.5L19 7.5" /></svg
			>
			{t('streetLearned')}
		</p>
	{/if}
	{#if vsCrowd != null}
		<p class="crowd">
			<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><circle cx="12" cy="12" r="8" /></svg
			>
			{#if vsCrowd === 0}
				{t('crowdSame')}
			{:else}
				{t(vsCrowd > 0 ? 'crowdCloser' : 'crowdFarther', { d: fmtDistance(Math.abs(vsCrowd)) })}
			{/if}
		</p>
	{/if}

	<div class="where">
		<StreetPlate {place} at={actual} {heading} land={go} delay={450} />
	</div>

	{@render children?.()}
</div>

{#if party}<Confetti />{/if}

<style>
	.learned-line {
		display: flex;
		align-items: center;
		gap: 6px;
		font-weight: 800;
		color: var(--green-ink);
	}
	.reveal:not(.go) .learned-line {
		opacity: 0;
	}
	.go .learned-line {
		animation: pop-in 0.4s var(--pop) 0.9s both;
	}
	:global(:root[data-theme='dark']) .learned-line {
		color: var(--green);
	}
	.learned-line .icon {
		width: 20px;
		height: 20px;
		stroke-width: 3;
	}
	.reveal {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	.round {
		font-size: 14px;
		font-weight: 600;
		color: var(--muted);
	}
	.verdict {
		font-family: var(--display);
		font-weight: 800;
		font-size: 28px;
		line-height: 1.1;
		letter-spacing: -0.02em;
	}
	/* nothing gives the answer away before the real pin lands */
	.reveal:not(.go) .verdict,
	.reveal:not(.go) .far,
	.reveal:not(.go) .crowd,
	.reveal:not(.go) .where {
		visibility: hidden;
	}
	.go .verdict {
		animation: pop-in 0.45s var(--pop) both;
	}
	.go .far {
		animation: rise 0.35s 0.3s var(--settle) both;
	}
	.go .crowd {
		animation: rise 0.35s 0.45s var(--settle) both;
	}
	.verdict.perfect {
		color: var(--green-ink);
	}
	:global(:root[data-theme='dark']) .verdict.perfect {
		color: var(--green);
	}
	.far {
		display: flex;
		align-items: center;
		gap: 8px;
		font-weight: 600;
		font-size: 15px;
		margin-top: -4px;
	}
	.far .icon {
		color: var(--red);
	}
	.crowd {
		display: flex;
		align-items: center;
		gap: 8px;
		font-weight: 600;
		font-size: 15px;
		margin-top: -8px;
	}
	.crowd .icon {
		width: 24px;
		height: 24px;
		flex: none;
		fill: rgba(232, 169, 12, 0.18);
		stroke: #e8a90c;
		stroke-width: 2.5;
	}
	.where {
		padding-top: 4px;
	}
	@media (max-width: 760px) {
		.reveal {
			gap: 12px;
		}
		/* the stars say how good it was: the room's table gets the height */
		.reveal :global(.score .bar) {
			display: none;
		}
		.verdict {
			font-size: 24px;
		}
	}
</style>
