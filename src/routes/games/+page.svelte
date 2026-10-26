<script lang="ts">
	import TopBar from '#lib/components/TopBar.svelte';
	import GameRow from '#lib/game/GameRow.svelte';
	import { api, call, type GameListItem } from '#lib/api/client.js';
	import { ensureSession, session } from '#lib/session.svelte.js';
	import { t } from '#lib/i18n/index.svelte.js';

	let games = $state<GameListItem[]>([]);
	let next = $state<string | undefined>();
	let loading = $state(true);
	let failed = $state(false);

	$effect(() => {
		void session.version;
		games = [];
		next = undefined;
		more();
	});

	async function more() {
		loading = true;
		failed = false;
		try {
			await ensureSession();
			const page = await call(
				api().GET('/v1/me/games', { params: { query: { limit: 20, before: next } } })
			);
			games = [...games, ...page.games];
			next = page.next;
		} catch {
			failed = true;
		}
		loading = false;
	}
</script>

<svelte:head><title>{t('gamesTitle')} — Shafaq Geo</title></svelte:head>

<TopBar />

<main class="page">
	<a class="back link-btn" href="/me">← {t('profile')}</a>
	<h1>{t('gamesTitle')}</h1>
	<div class="list">
		{#each games as g (g.id)}<GameRow game={g} />{/each}
	</div>
	{#if !loading && !failed && games.length === 0}
		<p class="empty">{t('historyEmpty')}</p>
		<a class="btn btn-primary" href="/">{t('play')}</a>
	{/if}
	{#if failed}
		<p class="empty">{t('err_network')}</p>
		<button class="btn btn-ghost" onclick={more}>{t('retry')}</button>
	{:else if loading}
		<div class="spin"><span class="spinner"></span></div>
	{:else if next}
		<button class="btn btn-ghost more" onclick={more}>{t('loadMore')}</button>
	{/if}
</main>

<style>
	.page {
		max-width: 720px;
		margin: 0 auto;
		padding: 16px 24px 64px;
	}
	.back {
		font-size: 14px;
		text-decoration: none;
	}
	h1 {
		margin: 8px 0 12px;
		font-family: var(--display);
		font-weight: 800;
		font-size: 28px;
		letter-spacing: -0.02em;
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
	.more {
		margin-top: 18px;
		width: 100%;
	}
	@media (max-width: 640px) {
		.page {
			padding: 12px 16px 48px;
		}
	}
</style>
