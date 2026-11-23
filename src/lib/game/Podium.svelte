<script lang="ts">
	// The end of a room's game as a stage on the turquoise ground: third, second and first rise
	// one by one as raised tiles in bronze, silver and gold, each with a note, then confetti for
	// everyone and this phone's own place floating above it ("Siz 2-o‘rindasiz"). Faces, names
	// and totals stand on the tiles; everyone after third is a milk card of rows under them.
	import type { RoomPlayer } from '#lib/api/client.js';
	import { t } from '#lib/i18n/index.svelte.js';
	import { fmtNum } from '#lib/format.js';
	import { sfxFanfare, sfxStep } from '#lib/sfx.svelte.js';
	import Confetti from './Confetti.svelte';

	interface Props {
		standings: RoomPlayer[]; // best first
		you: string;
		colorOf: (id: string) => string;
		costOf?: (id: string) => number; // the points a player's hints took, shown under the total
	}
	let { standings, you, colorOf, costOf = () => 0 }: Props = $props();

	// when each step rises (ms): third, second, first
	const AT = [300, 1000, 1700];

	const top = $derived(standings.slice(0, 3));
	const rest = $derived(standings.slice(3));
	// a tie shares the place
	const placeOf = (p: RoomPlayer) => 1 + standings.filter((x) => x.total > p.total).length;
	const mine = $derived(standings.find((p) => p.id === you));
	const myPlace = $derived(mine ? placeOf(mine) : 0);
	const anyScore = $derived(standings.some((p) => p.total > 0));

	let party = $state(false);
	$effect(() => {
		const n = top.length;
		const timers = [2, 1, 0]
			.filter((i) => i < n)
			.map((i) => setTimeout(() => (i === 0 ? sfxFanfare() : sfxStep(2 - i)), AT[2 - i]));
		timers.push(setTimeout(() => (party = true), AT[2] + 400));
		return () => timers.forEach(clearTimeout);
	});
</script>

<div class="podium-wrap">
	<h1 class="d float" style:animation-delay={`${AT[2] + 300}ms`}>
		{#if !anyScore || !mine}
			{t('gameOver')}
		{:else if myPlace === 1}
			{t('youWin')}
		{:else}
			{t('yourPlace', { n: myPlace })}
		{/if}
	</h1>

	<ol class="podium" class:solo={top.length === 1}>
		{#each top as p, i (p.id)}
			<li
				class="step s{i + 1}"
				class:me={p.id === you}
				class:off={p.left}
				style:animation-delay={`${AT[2 - i]}ms`}
			>
				<span class="who">
					<span class="avatar ring" style:--ring={colorOf(p.id)} data-frame={p.frame}
						><em class="pc"></em>{p.avatar}</span
					>
					<span class="name">{p.name}</span>
					<b class="d">{fmtNum(p.total)}</b>
					{#if costOf(p.id)}<span class="pill">💡 −{fmtNum(costOf(p.id))}</span>{/if}
				</span>
				<span class="block"><span class="d">{placeOf(p)}</span></span>
			</li>
		{/each}
	</ol>

	{#if rest.length}
		<ol class="rest panel-list">
			{#each rest as p (p.id)}
				<li class:me={p.id === you} class:off={p.left}>
					<span class="pos d">{placeOf(p)}</span>
					<span class="avatar ring" style:--ring={colorOf(p.id)} data-frame={p.frame}
						><em class="pc"></em>{p.avatar}</span
					>
					<span class="name">{p.name}</span>
					{#if costOf(p.id)}<span class="pill">💡 −{fmtNum(costOf(p.id))}</span>{/if}
					<b class="d">{fmtNum(p.total)}</b>
				</li>
			{/each}
		</ol>
	{/if}
</div>

{#if party && anyScore}<Confetti />{/if}

<style>
	/* the hints' cost: the same gold chip as the result's "−20% 💡" */
	.pill {
		padding: 1px 9px;
		border-radius: 8px;
		background: linear-gradient(180deg, var(--gold-hi), var(--gold));
		box-shadow: 0 2px 0 var(--gold-lo);
		color: var(--gold-ink);
		font-size: 13px;
		font-weight: 800;
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}
	.podium-wrap {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	/* this phone's own place, floating white on the ground; the lean stays in its keyframes */
	h1 {
		align-self: center;
		max-width: 100%;
		font-size: 32px;
		line-height: 1.1;
		text-align: center;
		color: var(--on-ground);
		animation: title-in 0.5s var(--spring) both;
	}
	@keyframes title-in {
		from {
			transform: var(--lean) scale(0.4);
			opacity: 0;
		}
		60% {
			transform: var(--lean) scale(1.1);
			opacity: 1;
		}
		to {
			transform: var(--lean) scale(1);
		}
	}
	.podium {
		list-style: none;
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		grid-template-areas: 's2 s1 s3';
		align-items: end;
		gap: 8px;
		padding: 22px 2px 0;
	}
	.podium.solo {
		grid-template-columns: minmax(0, 1fr);
		grid-template-areas: 's1';
		width: 40%;
		margin: 0 auto;
	}
	.step {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		min-width: 0;
		animation: step-rise 0.6s var(--spring) both;
	}
	.s1 {
		grid-area: s1;
	}
	.s2 {
		grid-area: s2;
	}
	.s3 {
		grid-area: s3;
	}
	@keyframes step-rise {
		from {
			transform: translateY(60px);
			opacity: 0;
		}
	}
	.who {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 3px;
		width: 100%;
		min-width: 0;
		text-align: center;
	}
	/* a face: a milk disc with a lip, milk like the map's tiles by day and by night */
	.avatar {
		position: relative;
		width: 50px;
		height: 50px;
		font-size: 27px;
		background: var(--tile-a);
		box-shadow:
			0 3px 0 color-mix(in srgb, var(--tile-b) 70%, var(--stack)),
			0 8px 16px var(--shade);
		margin-bottom: 5px;
	}
	.s1 .avatar {
		width: 62px;
		height: 62px;
		font-size: 34px;
	}
	.s1 .avatar::after {
		content: '👑';
		position: absolute;
		top: -22px;
		font-size: 23px;
		filter: drop-shadow(0 2px 0 var(--stack-2));
	}
	.name {
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-weight: 700;
		font-size: 14px;
		color: var(--on-ground);
		text-shadow: 0 1px 0 var(--stack-2);
	}
	/* this phone's own player: the name in gold */
	.me .name {
		color: var(--gold-text);
		font-weight: 800;
	}
	.who b {
		font-size: 19px;
		line-height: 1.1;
		color: var(--on-ground);
		text-shadow: 0 2px 0 var(--stack);
	}
	/* the steps: raised tiles of gold, silver and bronze, a light line on top, a lip under,
	   the place's number leaning in the tile's own dark */
	.block {
		--t-a: #fff;
		--t-b: #ddd;
		--t-c: #bbb;
		--t-lip: #888;
		--t-ink: #333;
		width: 100%;
		display: grid;
		place-items: start center;
		padding-top: 8px;
		border-radius: var(--r-s) var(--r-s) 6px 6px;
		background: linear-gradient(180deg, var(--t-a), var(--t-b) 45%, var(--t-c));
		box-shadow:
			inset 0 2px 0 rgba(255, 255, 255, 0.6),
			inset 0 -3px 0 rgba(0, 0, 0, 0.08),
			0 5px 0 var(--t-lip),
			0 16px 26px var(--shade);
		color: var(--t-ink);
		font-size: 36px;
		line-height: 1.1;
	}
	.block .d {
		text-shadow: 0 2px 0 rgba(255, 255, 255, 0.45);
	}
	.s1 .block {
		--t-a: var(--gold-hi);
		--t-b: var(--gold);
		--t-c: #e7a51d;
		--t-lip: var(--gold-lo);
		--t-ink: var(--gold-ink);
		height: 108px;
		font-size: 44px;
	}
	.s2 .block {
		--t-a: #f6f9fb;
		--t-b: #d3dbe3;
		--t-c: #b9c4cf;
		--t-lip: #7d8b99;
		--t-ink: #33414f;
		height: 78px;
	}
	.s3 .block {
		--t-a: #f6cd9f;
		--t-b: #dc9a5c;
		--t-c: #c47f42;
		--t-lip: #87491c;
		--t-ink: #4a2408;
		height: 56px;
	}
	.off {
		opacity: 0.55;
	}

	/* fourth and after: a milk card of rows */
	.rest {
		animation: fade-in 0.4s ease both;
		animation-delay: 2.2s;
	}
	.rest li {
		min-height: 54px;
		gap: 10px;
		padding: 8px 14px 8px 12px;
		font-size: 15px;
	}
	.rest li.me {
		background: color-mix(in srgb, var(--gold) 16%, var(--panel));
	}
	.rest .pos {
		width: 22px;
		text-align: center;
		color: var(--ink-3);
		font-size: 17px;
	}
	.rest .avatar {
		width: 34px;
		height: 34px;
		font-size: 19px;
		margin: 0;
		background: var(--panel-2);
		box-shadow: none;
	}
	.rest .name {
		flex: 1;
		min-width: 0;
		text-align: left;
		color: var(--ink);
		text-shadow: none;
	}
	.rest .me .name {
		color: var(--ink);
	}
	.rest b {
		font-size: 17px;
		color: var(--ink);
	}
	/* a laptop: a little bigger, still short enough for the streets to show under it */
	@media (min-width: 761px) {
		h1 {
			font-size: 40px;
		}
		.avatar {
			width: 58px;
			height: 58px;
			font-size: 32px;
		}
		.s1 .avatar {
			width: 72px;
			height: 72px;
			font-size: 40px;
		}
		.s1 .avatar::after {
			top: -26px;
			font-size: 27px;
		}
		.name {
			font-size: 15px;
		}
		.who b {
			font-size: 22px;
		}
		.s1 .block {
			height: 118px;
			font-size: 52px;
		}
		.s2 .block {
			height: 86px;
			font-size: 44px;
		}
		.s3 .block {
			height: 62px;
			font-size: 40px;
		}
	}
	@keyframes fade-in {
		from {
			opacity: 0;
		}
	}
</style>
