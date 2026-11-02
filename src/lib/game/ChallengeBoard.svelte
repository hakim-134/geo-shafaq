<script lang="ts">
	// A challenge's leaderboard: everyone who played these streets, best first, the player's own
	// row lit. open: the rows lead to each game (only after one's own: they show the places).
	import type { Schemas } from '#lib/api/client.js';
	import { fmtNum } from '#lib/format.js';
	import { t } from '#lib/i18n/index.svelte.js';
	import { session } from '#lib/session.svelte.js';

	let {
		board,
		players,
		open = false
	}: { board: Schemas['ChallengeRow'][]; players: number; open?: boolean } = $props();
</script>

<section class="board">
	<h2 class="section-title">{t('boardTitle')} · {fmtNum(players)}</h2>
	<ol>
		{#each board as row (row.game)}
			<li>
				<svelte:element
					this={open ? 'a' : 'div'}
					class="row"
					class:me={row.player.id === session.me?.user.id}
					class:top={row.place === 1}
					href={open ? `/game/${row.game}` : undefined}
				>
					<span class="place">{row.place}</span>
					<span class="avatar">{row.player.avatar}</span>
					<span class="name">{row.player.name}</span>
					{#if row.hints}<span class="hints" title={t('hintsTaken', { n: row.hints })}
							>💡 {row.hints}</span
						>{/if}
					<b>{fmtNum(row.total)}</b>
				</svelte:element>
			</li>
		{/each}
	</ol>
</section>

<style>
	.board {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	ol {
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 46px;
		padding: 6px 10px;
		border-radius: 14px;
		color: var(--text);
		text-decoration: none;
		font-size: 15px;
	}
	a.row:hover,
	.row.me {
		background: color-mix(in srgb, var(--sky) 14%, transparent);
	}
	.place {
		width: 20px;
		text-align: center;
		font-family: var(--display);
		font-weight: 800;
		color: var(--muted);
	}
	.top .place {
		color: var(--gold);
	}
	.avatar {
		width: 34px;
		height: 34px;
		font-size: 19px;
		background: var(--surface);
	}
	.name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-weight: 600;
	}
	.hints {
		font-size: 13px;
		font-weight: 600;
		color: var(--muted);
	}
	b {
		font-family: var(--display);
		font-variant-numeric: tabular-nums;
	}
</style>
