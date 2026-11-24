<script lang="ts">
	// All the player's games, ten to a page, newest first: a small white heading for each day
	// and that day's games as rows on a milk panel. How many in all stands at the head's right;
	// the page is in the address (?page=2) and the pager under the list says which.
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
	{#snippet aside()}
		{#if total > 0}<span class="count">{t('nGames', { n: total })}</span>{/if}
	{/snippet}

	<div class="days" class:dim={loading && games.length > 0}>
		{#each days as d (d.day)}
			<section>
				<h2 class="day">{d.day}</h2>
				<div class="panel-list">
					{#each d.games as g (g.id)}<GameRow game={g} day={false} />{/each}
				</div>
			</section>
		{/each}
	</div>

	{#if failed}
		<div class="empty-state">
			<p>{t('err_network')}</p>
			<button class="btn btn-chip" onclick={() => load(page)}
				><span class="lbl">{t('retry')}</span></button
			>
		</div>
	{:else if loading && !games.length}
		<div class="spin"><span class="spinner"></span></div>
	{:else if !games.length}
		<div class="empty-state">
			<p>{t('historyEmpty')}</p>
			<a class="btn btn-primary" href="/"><span class="lbl">{t('play')}</span></a>
		</div>
	{/if}

	<div class="pager">
		<Pager {page} {pages} href={(p) => (p === 1 ? '/games' : `/games?page=${p}`)} />
	</div>
</SubPage>

<style>
	.count {
		font-size: 15px;
	}
	.days {
		display: flex;
		flex-direction: column;
		gap: 22px;
		transition: opacity 0.15s;
	}
	.days.dim {
		opacity: 0.5;
	}
	/* the day: small white capitals on the ground over its panel */
	.day {
		margin: 0 0 10px 4px;
		font-family: var(--f-disp);
		font-weight: 900;
		font-size: 13px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--on-ground-2);
	}
	.spin {
		display: flex;
		justify-content: center;
		padding: 24px;
		color: var(--on-ground-2);
	}
	.pager {
		margin-top: 28px;
	}
</style>
