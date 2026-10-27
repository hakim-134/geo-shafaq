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
	import { fmtDistance, starsFor, verdictKey } from '#lib/format.js';
	import { t } from '#lib/i18n/index.svelte.js';
	import { sfxFanfare, sfxFar } from '#lib/sfx.svelte.js';

	interface Props {
		n: number;
		rounds: number; // 0 = endless
		score: number;
		km: number | null | undefined;
		guessed: boolean;
		late?: boolean;
		place: Schemas['PlaceInfo'];
		actual: LatLon;
		go: boolean;
		children?: Snippet;
	}
	let {
		n,
		rounds,
		score,
		km,
		guessed,
		late = false,
		place,
		actual,
		go,
		children
	}: Props = $props();

	const stars = $derived(starsFor(score));
	const perfect = $derived(guessed && verdictKey(score) === 'perfect');
	const title = $derived(late ? t('late') : guessed ? t(verdictKey(score)) : t('noGuess'));

	let party = $state(false);
	$effect(() => {
		if (!go) return;
		if (perfect) {
			party = true;
			setTimeout(sfxFanfare, 350);
		} else if (!stars) setTimeout(sfxFar, 200);
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

	<ScoreCount {score} max={5000} {go} delay={350} />
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

	<div class="where">
		<div class="where-label">{t('youWereIn')}</div>
		<StreetPlate {place} at={actual} land={go} delay={450} />
	</div>

	{@render children?.()}
</div>

{#if party}<Confetti />{/if}

<style>
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
	.reveal:not(.go) .where {
		visibility: hidden;
	}
	.go .verdict {
		animation: pop-in 0.45s var(--pop) both;
	}
	.go .far {
		animation: rise 0.35s 0.3s var(--settle) both;
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
	.where {
		padding-top: 4px;
	}
	.where-label {
		font-size: 14px;
		font-weight: 600;
		color: var(--muted);
		margin-bottom: 8px;
	}
	@media (max-width: 760px) {
		.reveal {
			gap: 12px;
		}
		.verdict {
			font-size: 24px;
		}
	}
</style>
