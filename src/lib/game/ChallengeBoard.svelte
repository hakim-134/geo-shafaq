<script lang="ts">
	// A challenge's leaderboard: everyone who played these streets, best first, on a milk panel:
	// the place (the first one on a gold coin), the player's face and name, the hints taken and
	// the total. The player's own row is lit gold. open: the rows lead to each game (only after
	// one's own: they show the places). A room's table of totals is the same board (title).
	import type { Schemas } from '#lib/api/client.js';
	import { fmtNum } from '#lib/format.js';
	import { t } from '#lib/i18n/index.svelte.js';
	import { session } from '#lib/session.svelte.js';

	// seek: the end of one's own game: the board comes into sight with the player's row in it
	let {
		board,
		players,
		open = false,
		seek = false,
		title
	}: {
		board: Schemas['ChallengeRow'][];
		players: number;
		open?: boolean;
		seek?: boolean;
		title?: string; // the heading, instead of "Natijalar · 3"
	} = $props();

	let box = $state<HTMLElement>();
	$effect(() => {
		// only as far as it takes: where it already shows, nothing moves (scroll-margin keeps it
		// clear of a phone's keys at the bottom)
		if (seek) box?.querySelector('.me')?.scrollIntoView({ block: 'nearest' });
	});
</script>

<section class="board" bind:this={box}>
	<h2 class="section-title">{title ?? `${t('boardTitle')} · ${fmtNum(players)}`}</h2>
	<ol class="panel-list">
		{#each board as row (row.game)}
			<li>
				<svelte:element
					this={open ? 'a' : 'div'}
					class="row"
					class:me={row.player.id === session.me?.user.id}
					class:top={row.place === 1}
					href={open ? `/game/${row.game}` : undefined}
				>
					<span class="place d">{row.place}</span>
					<span class="avatar" data-frame={row.player.frame}>{row.player.avatar}</span>
					<span class="name">{row.player.name}</span>
					{#if row.hints}<span class="hints" title={t('hintsTaken', { n: row.hints })}
							>💡 {row.hints}</span
						>{/if}
					<b class="d">{fmtNum(row.total)}</b>
				</svelte:element>
			</li>
		{/each}
	</ol>
</section>

<style>
	.section-title {
		margin-bottom: 12px;
	}
	/* the list's li is only a holder: the row inside it is the line */
	.panel-list > li {
		display: block;
		min-height: 0;
		padding: 0;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 60px;
		padding: 8px 16px;
		color: var(--ink);
		text-decoration: none;
		font-size: 15.5px;
		transition: background 0.15s;
	}
	a.row:hover {
		background: var(--panel-2);
	}
	a.row:active {
		background: color-mix(in srgb, var(--panel-2), var(--ink) 6%);
	}
	/* the player's own row: lit gold, a gold bar at its edge */
	.row.me {
		scroll-margin: 24px 0;
	}
	/* a phone's end of a game: the keys stay over the page's foot */
	@media (max-width: 760px) {
		.row.me {
			scroll-margin-bottom: 180px;
		}
	}
	.row.me,
	a.row.me:hover {
		background: color-mix(in srgb, var(--gold) 20%, var(--panel));
		box-shadow: inset 4px 0 0 var(--gold);
	}
	/* by night a gold tint goes olive: the panel's lighter step, the gold bar and name say it */
	:global(:root[data-theme='dark']) .row.me {
		background: var(--panel-2);
	}
	:global(:root[data-theme='dark']) .me .name {
		color: var(--gold-text);
	}
	.place {
		width: 28px;
		height: 28px;
		flex: none;
		display: grid;
		place-items: center;
		font-size: 16px;
		color: var(--ink-3);
	}
	/* the first place on a gold coin */
	.top .place {
		border-radius: 50%;
		background: linear-gradient(180deg, var(--gold-hi), var(--gold));
		box-shadow: 0 2px 0 var(--gold-lo);
		color: var(--gold-ink);
		font-size: 14px;
	}
	.avatar {
		width: 38px;
		height: 38px;
		font-size: 21px;
	}
	.name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-weight: 700;
	}
	.me .name {
		font-weight: 800;
	}
	.hints {
		flex: none;
		font-size: 13px;
		font-weight: 700;
		color: var(--ink-3);
	}
	b {
		flex: none;
		font-size: 18px;
		color: var(--ink);
	}
</style>
