<script lang="ts">
	// One round's result: how close (a word and up to three stars), the score as the hero,
	// counting up, how far off, and the place learned on its plaque. It plays when go turns
	// true (the real pin has landed on the map). Solo games and rooms both use it; a room adds
	// its table below.
	import type { Snippet } from 'svelte';
	import type { LatLon, Schemas } from '#lib/api/client.js';
	import Coin from '#lib/barg/Coin.svelte';
	import Stars from './Stars.svelte';
	import ScoreCount from './ScoreCount.svelte';
	import PlacePlaque from './PlacePlaque.svelte';
	import PlaceInParent from '#lib/maps/PlaceInParent.svelte';
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
		heading?: number; // the round's first heading: the plaque's panorama link faces it
		crowd?: number; // the average distance of the round's guesses: the ring on the map
		go: boolean;
		fiveK?: boolean;
		ondone?: () => void;
		earned?: Schemas['Earned'][]; // Barg this guess earned
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
		fiveK = score === 5000,
		ondone,
		earned = [],
		children
	}: Props = $props();
	const forStreet = $derived(earned.find((e) => e.reason === 'street'));
	const others = $derived(earned.filter((e) => e.reason !== 'street'));

	const stars = $derived(starsFor(score));
	const perfect = $derived(guessed && verdictKey(score) === 'perfect');
	// next to the ring: how this guess stands against the average
	const vsCrowd = $derived(
		guessed && !late && km != null && crowd != null ? crowdGap(crowd, km) : null
	);
	// the game's whole point, said when it happens: a street guessed within 500 m is learned
	const learned = $derived(guessed && km != null && km <= 0.5 && !!place.street);
	const title = $derived(late ? t('late') : guessed ? t(verdictKey(score)) : t('noGuess'));

	/** A sentence around a distance, cut so the distance can be set in display lettering. */
	function around(text: string, d: string): [string, string, string] {
		const i = text.indexOf(d);
		return i < 0 ? [text, '', ''] : [text.slice(0, i), d, text.slice(i + d.length)];
	}
	const far = $derived.by(() => {
		if (!guessed || km == null) return null;
		const d = fmtDistance(km);
		return around(t('kmAway', { d }), d);
	});
	const vs = $derived.by(() => {
		if (vsCrowd == null) return null;
		if (vsCrowd === 0) return [t('crowdSame'), '', ''] as [string, string, string];
		const d = fmtDistance(Math.abs(vsCrowd));
		return around(t(vsCrowd > 0 ? 'crowdCloser' : 'crowdFarther', { d }), d);
	});

	let party = $state(false);
	$effect(() => {
		if (!go) return;
		if (!fiveK && (perfect || earned.some((e) => e.reason === 'district'))) {
			party = true;
			setTimeout(sfxFanfare, 350);
		} else if (!fiveK && !stars) setTimeout(sfxFar, 200);
		if (learned) setTimeout(sfxLearned, 900);
	});
</script>

<div class="reveal" class:go class:board={!!children}>
	<div class="head">
		<div class="titles">
			<div class="kicker">
				{t('roundN', { n })}{#if rounds}&nbsp;/ {rounds}{/if}
			</div>
			<h2 class="verdict d" class:perfect>{title}</h2>
		</div>
		<Stars n={stars} {go} delay={200} quiet={fiveK && score !== 5000} />
	</div>

	<ScoreCount {score} {base} {hints} {cost} max={5000} {go} {ondone} delay={350} />

	<div class="facts">
		<p class="far" class:nopin={!far}>
			{#if far}
				<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"
					><path d="M4 12h16M4 12l3.5-3.5M4 12l3.5 3.5M20 12l-3.5-3.5M20 12l-3.5 3.5" /></svg
				>
				<span>{far[0]}<b class="d">{far[1]}</b>{far[2]}</span>
			{:else}
				<svg viewBox="0 0 24 24" class="icon none" aria-hidden="true"
					><circle cx="12" cy="12" r="8" /><path d="M6.5 17.5l11-11" /></svg
				>
				<span>{t('noPin')}</span>
			{/if}
		</p>
		{#if vs}
			<p class="crowd">
				<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"
					><circle cx="12" cy="12" r="8" /></svg
				>
				<span>{vs[0]}<b class="d">{vs[1]}</b>{vs[2]}</span>
			</p>
		{/if}
	</div>

	{#if learned}
		<p class="earned">
			<span class="tick" aria-hidden="true"
				><svg viewBox="0 0 24 24"><path d="m5.5 12.5 4 4L18.5 7.5" /></svg></span
			>
			<span class="what">{t('streetLearned')}</span>
			{#if forStreet}<span class="plus d">+{forStreet.amount} <Coin size={18} /></span>{/if}
		</p>
	{/if}
	{#each others as e (e.reason)}
		{#if e.reason === 'district'}
			<p class="district">
				<!-- the district's face: the biggest moment names its place by its picture too -->
				{#if place.slug}<span class="face"><PlaceInParent place={place.slug} on="panel" /></span
					>{/if}
				<span class="what">{t('districtWon', { name: e.note ?? '' })}</span>
				<span class="plus d">+{e.amount} <Coin size={20} /></span>
			</p>
		{:else}
			<p class="earned">
				<span class="tick" aria-hidden="true"
					><svg viewBox="0 0 24 24"><path d="m5.5 12.5 4 4L18.5 7.5" /></svg></span
				>
				<span class="what">{t('reason_challenge')}</span>
				<span class="plus d">+{e.amount} <Coin size={18} /></span>
			</p>
		{/if}
	{/each}

	<div class="where">
		<PlacePlaque {place} at={actual} {heading} land={go} delay={450} />
	</div>

	{@render children?.()}
</div>

{#if party}<Confetti />{/if}

<style>
	.reveal {
		display: flex;
		flex-direction: column;
		gap: 12px;
		color: var(--ink);
	}
	.head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 10px;
	}
	.titles {
		min-width: 0;
	}
	.kicker {
		font-family: var(--f-disp);
		font-weight: 800;
		transform: var(--lean);
		transform-origin: 0 75%;
		font-size: 13px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--ink-3);
		font-variant-numeric: tabular-nums;
	}
	.verdict {
		margin-top: 3px;
		font-size: clamp(24px, 7.2vw, 28px);
		line-height: 1.05;
		color: var(--ink);
		overflow-wrap: normal;
	}
	/* a perfect round: the key's green, standing on the stacked shadow */
	.verdict.perfect {
		color: var(--key);
		text-shadow:
			0 2px 0 var(--key-lip),
			0 6px 14px rgba(29, 182, 80, 0.3);
	}
	/* the stars' size is the panel's, not the component's default: a phone keeps room for a
	   long verdict ("Очень близко!") on one line */
	.head :global(.stars) {
		flex: none;
		margin-top: -2px;
		--s: 32px !important;
	}

	.facts {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin-top: -2px;
	}
	.far,
	.crowd,
	.earned {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 16px;
		font-weight: 600;
		line-height: 1.25;
	}
	.facts b {
		font-weight: 900;
	}
	.icon {
		width: 22px;
		height: 22px;
		flex: none;
	}
	.far .icon {
		color: var(--red);
		stroke-width: 2.6;
	}
	.far .icon.none {
		color: var(--ink-3);
		stroke-width: 2.2;
	}
	.crowd .icon {
		fill: rgba(246, 188, 47, 0.22);
		stroke: var(--gold);
		stroke-width: 2.6;
	}

	/* what the round taught: a green tick, the words, and the leaf coins in gold numbers */
	.earned .tick {
		width: 22px;
		height: 22px;
		flex: none;
		display: grid;
		place-items: center;
		border-radius: 50%;
		background: linear-gradient(180deg, var(--key-hi), var(--key-lo));
		box-shadow: 0 2px 0 var(--key-lip);
	}
	.tick svg {
		width: 15px;
		height: 15px;
		fill: none;
		stroke: #fff;
		stroke-width: 3.4;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.earned .what {
		font-weight: 800;
	}
	.plus {
		flex: none;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 17px;
		color: var(--gold-on-panel);
	}
	/* a whole district learned: a gold bar, the biggest thing a round can give */
	.district {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 10px 14px;
		border-radius: var(--r-s);
		background: linear-gradient(180deg, var(--gold-hi), var(--gold));
		color: var(--gold-ink);
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.6),
			0 3px 0 var(--gold-lo);
		font-family: var(--f-disp);
		font-weight: 900;
		font-size: 16px;
		line-height: 1.15;
	}
	.district .plus {
		color: var(--gold-ink);
		font-size: 18px;
	}
	.district .what {
		flex: 1;
	}
	/* on a milk square, so the gold district stands out of the gold bar */
	.district .face {
		flex: none;
		width: 48px;
		height: 48px;
		margin: -4px 0 -4px -6px;
		padding: 4px;
		border-radius: 10px;
		background: var(--panel);
		box-shadow: 0 2px 0 var(--gold-lo);
	}

	/* nothing gives the answer away before the real pin lands */
	.reveal:not(.go) .verdict,
	.reveal:not(.go) .facts,
	.reveal:not(.go) .where,
	.reveal:not(.go) .earned,
	.reveal:not(.go) .district {
		visibility: hidden;
	}
	.go .verdict {
		animation: verdict-in 0.5s var(--spring) both;
	}
	@keyframes verdict-in {
		from {
			opacity: 0;
			transform: scale(0.6) rotate(-4deg);
		}
	}
	.go .far {
		animation: rise 0.35s 0.3s var(--out) both;
	}
	.go .crowd {
		animation: rise 0.35s 0.45s var(--out) both;
	}
	.go .earned {
		animation: pop-in 0.4s var(--spring) 0.9s both;
	}
	.go .district {
		animation: pop-in 0.5s var(--spring) 1s both;
	}
	.where {
		padding-top: 4px;
	}

	/* a room's result on a phone: the players' rows are the story, and all of them must stand
	   above the key. So the player's own distance is left to their row, which has it, the
	   score is a size smaller, and the lines sit closer. */
	@media (max-width: 760px) {
		.reveal.board {
			gap: 8px;
		}
		.reveal.board .far:not(.nopin) {
			display: none;
		}
		.reveal.board :global(.score .value) {
			font-size: clamp(52px, 15vw, 60px);
		}
	}

	/* a laptop: the panel is tall, the lettering grows with it */
	@media (min-width: 761px) {
		.reveal {
			gap: 14px;
		}
		.kicker {
			font-size: 14px;
		}
		.verdict {
			font-size: 34px;
		}
		.head :global(.stars) {
			--s: 42px !important;
		}
		.far,
		.crowd,
		.earned {
			font-size: 17px;
		}
		.where {
			padding-top: 8px;
		}
	}
</style>
