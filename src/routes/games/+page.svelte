<script lang="ts">
	// All the player's games, ten to a page, newest first, under a heading for each day. The
	// page is in the address (?page=2).
	import { page as here } from '$app/state';
	import SubPage from '#lib/components/SubPage.svelte';
	import Pager from '#lib/components/Pager.svelte';
	import GameRow from '#lib/game/GameRow.svelte';
	import { api, call, type GameListItem } from '#lib/api/client.js';
	import { ensureSession, session } from '#lib/session.svelte.js';
	import { t } from '#lib/i18n/index.svelte.js';
	import { fmtDay } from '#lib/format.js';

	const PER_PAGE = 10;

	let games = $state<GameListItem[]>([]);
	let total = $state(0);
	let loading = $state(true);
	let failed = $state(false);

	const page = $derived(Math.max(1, Number(here.url.searchParams.get('page')) || 1));
	const pages = $derived(Math.max(1, Math.ceil(total / PER_PAGE)));

	$effect(() => {
		void session.version;
		load(page);
	});

	async function load(p: number) {
		loading = true;
		failed = false;
		try {
			await ensureSession();
			const res = await call(
				api().GET('/v1/me/games', { params: { query: { limit: PER_PAGE, page: p } } })
			);
			games = res.games;
			total = res.total ?? res.games.length;
			window.scrollTo({ top: 0 });
		} catch {
			failed = true;
		}
		loading = false;
	}

	// the games of each day together
	const days = $derived.by(() => {
		const out: { day: string; games: GameListItem[] }[] = [];
		for (const g of games) {
			const day = fmtDay(g.startedAt);
			if (out.at(-1)?.day === day) out.at(-1)!.games.push(g);
			else out.push({ day, games: [g] });
		}
		return out;
	});
</script>

<SubPage title={t('myGames')} back={{ href: '/me', label: t('profile') }}>
	{#if total > 0}
		<p class="count">
			{t('nGames', { n: total })}{#if pages > 1}
				· {t('pageOf', { n: page, m: pages })}{/if}
		</p>
	{/if}

	<div class="days" class:dim={loading && games.length > 0}>
		{#each days as d (d.day)}
			<section>
				<h2>{d.day}</h2>
				<div class="list">
					{#each d.games as g (g.id)}<GameRow game={g} day={false} />{/each}
				</div>
			</section>
		{/each}
	</div>

	{#if failed}
		<p class="empty">{t('err_network')}</p>
		<button class="btn btn-ghost" onclick={() => load(page)}>{t('retry')}</button>
	{:else if loading && !games.length}
		<div class="spin"><span class="spinner"></span></div>
	{:else if !games.length}
		<p class="empty">{t('historyEmpty')}</p>
		<a class="btn btn-primary" href="/">{t('play')}</a>
	{/if}

	<div class="pager">
		<Pager {page} {pages} href={(p) => (p === 1 ? '/games' : `/games?page=${p}`)} />
	</div>
</SubPage>

<style>
	.count {
		margin: -12px 0 18px;
		color: var(--muted);
		font-weight: 600;
	}
	.days {
		display: flex;
		flex-direction: column;
		gap: 18px;
		transition: opacity 0.15s;
	}
	.days.dim {
		opacity: 0.5;
	}
	h2 {
		display: inline-block;
		padding: 3px 12px;
		border-radius: 10px;
		background: var(--surface-2);
		font-size: 13.5px;
		font-weight: 700;
	}
	.list {
		margin-top: 4px;
	}
	.list > :global(* + *) {
		border-top: 1px solid var(--border);
	}
	.empty {
		color: var(--muted);
		margin: 12px 0 16px;
	}
	.spin {
		display: flex;
		justify-content: center;
		padding: 24px;
		color: var(--muted);
	}
	.pager {
		margin-top: 28px;
	}
</style>
