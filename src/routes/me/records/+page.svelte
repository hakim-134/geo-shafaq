<script lang="ts">
	// The player's best game on each map (best per round, so short and long games compare), on a
	// milk list: the map's face and name, how long that game was and how many were played, and
	// the best score in big leaning numbers. A row opens that game.
	import SubPage from '#lib/components/SubPage.svelte';
	import PlaceInParent from '#lib/maps/PlaceInParent.svelte';
	import { api, call, type Profile } from '#lib/api/client.js';
	import { ensureSession, session } from '#lib/session.svelte.js';
	import { t, tx } from '#lib/i18n/index.svelte.js';
	import { fmtNum } from '#lib/format.js';

	let profile = $state<Profile | null>(null);
	let failed = $state(false);

	$effect(() => {
		void session.version;
		load();
	});

	async function load() {
		try {
			await ensureSession();
			profile = await call(api().GET('/v1/me/profile'));
			failed = false;
		} catch {
			failed = true;
		}
	}
</script>

<SubPage title={t('myRecords')} back={{ href: '/me', label: t('profile') }}>
	{#if profile?.maps.length}
		<nav class="panel-list">
			{#each profile.maps as m (m.map.slug)}
				<a class="best" href={`/game/${m.gameId}`}>
					<span class="face">{#if m.map.face}<PlaceInParent place={m.map.face} on="panel" />{/if}</span>
					<span class="what">
						<b class="name">{tx(m.map.name)}</b>
						<span class="meta">{t('nRounds', { n: m.rounds })} · {t('nGames', { n: m.games })}</span>
					</span>
					<b class="d score">{fmtNum(m.best)}</b>
					<svg viewBox="0 0 24 24" class="icon chev" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
				</a>
			{/each}
		</nav>
	{:else if profile}
		<div class="empty-state">
			<p>{t('recordsEmpty')}</p>
			<a class="btn btn-primary" href="/"><span class="lbl">{t('play')}</span></a>
		</div>
	{:else if failed}
		<div class="empty-state">
			<p>{t('err_network')}</p>
			<button class="btn btn-chip" onclick={load}>{t('retry')}</button>
		</div>
	{:else}
		<div class="wait"><span class="spinner"></span></div>
	{/if}
</SubPage>

<style>
	.best {
		min-height: 80px;
		gap: 14px;
		padding: 12px 14px 12px 12px;
	}
	/* the map's place, in its parent: a small tile */
	.face {
		flex: none;
		width: 56px;
		height: 56px;
	}
	.what {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.name {
		font-size: 16px;
		font-weight: 800;
		line-height: 1.25;
		color: var(--ink);
	}
	.meta {
		font-size: 13px;
		font-weight: 600;
		color: var(--ink-3);
	}
	.score {
		flex: none;
		font-size: 24px;
		line-height: 1;
		color: var(--ink);
	}
	.chev {
		flex: none;
		width: 18px;
		height: 18px;
		margin-left: -6px;
		color: var(--ink-3);
		stroke-width: 2.6;
	}
	.wait {
		display: grid;
		place-items: center;
		min-height: 40vh;
	}
</style>
