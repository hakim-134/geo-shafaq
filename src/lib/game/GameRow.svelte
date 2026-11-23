<script lang="ts">
	// One finished game, a row of a milk list (`<div class="panel-list">`): its map's face and
	// name, when (and how many played it, in a room), and the score in display numbers with a
	// quiet bar of how much of the most it is. It opens the game.
	import type { GameListItem } from '#lib/api/client.js';
	import PlaceInParent from '#lib/maps/PlaceInParent.svelte';
	import { t, tx } from '#lib/i18n/index.svelte.js';
	import { fmtDay, fmtNum } from '#lib/format.js';

	// day: say which day (off under a day's heading)
	let { game, day = true }: { game: GameListItem; day?: boolean } = $props();
	const meta = $derived(
		[
			day ? fmtDay(game.startedAt) : '',
			t('nRounds', { n: game.rounds }),
			game.players ? t('withPlayers', { n: game.players }) : '',
			game.hintsUsed ? `💡 ${game.hintsUsed}` : ''
		]
			.filter(Boolean)
			.join(' · ')
	);
	const share = $derived(game.max ? game.total / game.max : 0);
</script>

<a class="game-row" href={`/game/${game.id}`}>
	<span class="face">
		{#if game.map.face}<PlaceInParent place={game.map.face} on="panel" />{/if}
	</span>
	<span class="what">
		<b class="name d">{tx(game.map.name)}</b>
		<span class="when">{meta}</span>
	</span>
	<span class="score">
		<b class="d">{fmtNum(game.total)}</b>
		<i style:--p={`${Math.round(share * 100)}%`}></i>
	</span>
</a>

<style>
	.game-row {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 68px;
		padding: 10px 16px;
		color: var(--ink);
		text-decoration: none;
	}
	.face {
		width: 42px;
		height: 42px;
		flex: none;
	}
	.what {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 3px;
	}
	.name {
		max-width: 100%;
		font-size: 16.5px;
		line-height: 1.15;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.when {
		font-size: 13px;
		font-weight: 600;
		color: var(--ink-3);
	}
	.score {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 7px;
		flex: none;
	}
	.score b {
		font-size: 19px;
		line-height: 1;
	}
	/* how much of the most: the panel's own teal on a quiet track, no verdict in its colour */
	i {
		width: 72px;
		height: 6px;
		border-radius: 3px;
		background: linear-gradient(
			to right,
			color-mix(in srgb, var(--link) 75%, var(--panel)) var(--p),
			var(--panel-2) var(--p)
		);
		box-shadow: inset 0 0 0 1px var(--panel-line);
	}
</style>
