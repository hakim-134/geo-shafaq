<script lang="ts">
	// One finished game in a list: its map's sign, when (and how many played it, in a room),
	// and the score with a bar.
	import type { GameListItem } from '#lib/api/client.js';
	import MapSign from '#lib/maps/MapSign.svelte';
	import { t, tx } from '#lib/i18n/index.svelte.js';
	import { fmtDay, fmtNum } from '#lib/format.js';

	let { game }: { game: GameListItem } = $props();
	const share = $derived(game.max ? game.total / game.max : 0);
</script>

<a class="row" href={`/game/${game.id}`}>
	<span class="what">
		<MapSign slug={game.map.slug} name={tx(game.map.name)} size="small" />
		<span class="when"
			>{fmtDay(game.startedAt)} · {t('nRounds', { n: game.rounds })}{#if game.players}
				· {t('withPlayers', { n: game.players })}{/if}</span
		>
	</span>
	<span class="score">
		<b>{fmtNum(game.total)}</b>
		<i style:--p={`${Math.round(share * 100)}%`} class:hi={share >= 0.8} class:lo={share < 0.4}></i>
	</span>
</a>

<style>
	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 11px 0;
		text-decoration: none;
	}
	.row:hover b {
		color: var(--sky-ink);
	}
	.what {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 5px;
		min-width: 0;
	}
	.when {
		font-size: 12.5px;
		color: var(--muted);
	}
	.score {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 6px;
		flex: none;
	}
	b {
		font-family: var(--display);
		font-size: 16px;
		font-variant-numeric: tabular-nums;
	}
	i {
		--c: var(--gold);
		width: 78px;
		height: 6px;
		border-radius: 3px;
		background: linear-gradient(to right, var(--c) var(--p), var(--surface-2) var(--p));
	}
	i.hi {
		--c: var(--green);
	}
	i.lo {
		--c: var(--red);
	}
</style>
