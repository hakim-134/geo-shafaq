<script lang="ts">
	// The end of a room's game as a stage: third, second and first rise one by one, each with a
	// note, then confetti for everyone and this phone's own place above it ("Siz 2-o‘rindasiz").
	// Everyone after third stands in a short list under it.
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
	<h1 style:animation-delay={`${AT[2] + 300}ms`}>
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
					<span class="avatar ring" style:--ring={colorOf(p.id)}>{p.avatar}</span>
					<span class="name">{p.name}</span>
					<b>{fmtNum(p.total)}</b>
					{#if costOf(p.id)}<span class="pill">💡 −{fmtNum(costOf(p.id))}</span>{/if}
				</span>
				<span class="block"><span>{placeOf(p)}</span></span>
			</li>
		{/each}
	</ol>

	{#if rest.length}
		<ol class="rest">
			{#each rest as p (p.id)}
				<li class:me={p.id === you} class:off={p.left}>
					<span class="pos">{placeOf(p)}</span>
					<span class="avatar ring" style:--ring={colorOf(p.id)}>{p.avatar}</span>
					<span class="name">{p.name}</span>
					{#if costOf(p.id)}<span class="pill">💡 −{fmtNum(costOf(p.id))}</span>{/if}
					<b>{fmtNum(p.total)}</b>
				</li>
			{/each}
		</ol>
	{/if}
</div>

{#if party && anyScore}<Confetti />{/if}

<style>
	/* the hints' cost: the same gold pill as the result's "−20% 💡" */
	.pill {
		padding: 2px 9px;
		border-radius: 999px;
		background: color-mix(in srgb, var(--gold) 24%, transparent);
		color: var(--text);
		font-size: 13.5px;
		font-weight: 700;
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}
	.podium-wrap {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	h1 {
		font-family: var(--display);
		font-weight: 800;
		font-size: 28px;
		line-height: 1.1;
		letter-spacing: -0.02em;
		text-align: center;
		animation: pop-in 0.5s var(--pop) both;
	}
	.podium {
		list-style: none;
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		grid-template-areas: 's2 s1 s3';
		align-items: end;
		gap: 6px;
		padding: 18px 4px 0;
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
		gap: 6px;
		min-width: 0;
		animation: step-rise 0.6s var(--pop) both;
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
		gap: 2px;
		width: 100%;
		min-width: 0;
		text-align: center;
	}
	.avatar {
		width: 46px;
		height: 46px;
		font-size: 25px;
		background: var(--bg);
		margin-bottom: 4px;
	}
	.avatar.ring {
		box-shadow: 0 0 0 3px var(--ring);
	}
	.s1 .avatar {
		width: 58px;
		height: 58px;
		font-size: 32px;
	}
	.s1 .avatar::after {
		content: '👑';
		position: absolute;
		top: -20px;
		font-size: 22px;
	}
	.avatar {
		position: relative;
	}
	.name {
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-weight: 600;
		font-size: 14px;
	}
	.me .name {
		color: var(--sky);
		font-weight: 800;
	}
	.who b {
		font-family: var(--display);
		font-size: 15px;
	}
	.block {
		width: 100%;
		display: grid;
		place-items: start center;
		padding-top: 8px;
		border-radius: 12px 12px 4px 4px;
		font-family: var(--display);
		font-weight: 800;
		font-size: 30px;
		color: rgba(0, 0, 0, 0.55);
		box-shadow:
			inset 0 -6px 0 rgba(0, 0, 0, 0.12),
			0 3px 0 rgba(0, 0, 0, 0.12);
	}
	.s1 .block {
		height: 104px;
		background: linear-gradient(var(--star), color-mix(in srgb, var(--star) 80%, #b07a00));
	}
	.s2 .block {
		height: 74px;
		background: linear-gradient(#d9dfe7, #b9c2ce);
	}
	.s3 .block {
		height: 52px;
		background: linear-gradient(#e2a873, #c7834b);
	}
	.me .block {
		outline: 3px solid var(--sky);
		outline-offset: 2px;
	}
	.off {
		opacity: 0.55;
	}
	.rest {
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 2px;
		animation: fade-in 0.4s ease both;
		animation-delay: 2.2s;
	}
	.rest li {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 7px 8px;
		border-radius: 12px;
		font-size: 14px;
	}
	.rest li.me {
		background: color-mix(in srgb, var(--sky) 12%, transparent);
	}
	.rest .pos {
		width: 22px;
		text-align: center;
		color: var(--muted);
		font-weight: 700;
	}
	.rest .avatar {
		width: 30px;
		height: 30px;
		font-size: 17px;
		margin: 0;
	}
	.rest .avatar.ring {
		box-shadow: 0 0 0 2.5px var(--ring);
	}
	.rest .name {
		flex: 1;
		min-width: 0;
		text-align: left;
	}
	.rest b {
		font-family: var(--display);
	}
	@media (min-width: 761px) {
		h1 {
			font-size: 32px;
		}
		.avatar {
			width: 64px;
			height: 64px;
			font-size: 36px;
		}
		.s1 .avatar {
			width: 84px;
			height: 84px;
			font-size: 48px;
		}
		.s1 .avatar::after {
			top: -26px;
			font-size: 28px;
		}
		.who b {
			font-size: 18px;
		}
		.s1 .block {
			height: 150px;
		}
		.s2 .block {
			height: 108px;
		}
		.s3 .block {
			height: 76px;
		}
		.block {
			font-size: 38px;
		}
	}
	@keyframes fade-in {
		from {
			opacity: 0;
		}
	}
</style>
