<script lang="ts">
	// The player's best game on each map (best per round, so short and long games compare).
	// A row opens that game.
	import SubPage from '#lib/components/SubPage.svelte';
	import MapSign from '#lib/maps/MapSign.svelte';
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
	{#if profile}
		{#each profile.maps as m (m.map.slug)}
			<a class="best" href={`/game/${m.gameId}`}>
				<MapSign slug={m.map.slug} name={tx(m.map.name)} />
				<span class="score">
					<b>{fmtNum(m.best)}</b>
					<span>{t('nRounds', { n: m.rounds })} · {t('nGames', { n: m.games })}</span>
				</span>
			</a>
		{:else}
			<div class="empty">
				<p>{t('recordsEmpty')}</p>
				<a class="btn btn-primary" href="/">{t('play')}</a>
			</div>
		{/each}
	{:else if failed}
		<p>{t('err_network')}</p>
		<button class="btn btn-ghost" onclick={load}>{t('retry')}</button>
	{:else}
		<span class="spinner"></span>
	{/if}
</SubPage>

<style>
	.best {
		display: flex;
		flex-direction: column;
		gap: 10px;
		margin-bottom: 22px;
		text-decoration: none;
		color: var(--text);
	}
	.best :global(.sign) {
		transition: transform 0.12s;
	}
	.best:hover :global(.sign) {
		transform: translateY(-2px);
	}
	.score {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		padding: 0 4px;
	}
	.score b {
		font-family: var(--display);
		font-weight: 800;
		font-size: 26px;
		font-variant-numeric: tabular-nums;
	}
	.score span {
		font-size: 14px;
		color: var(--muted);
	}
	.empty {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 14px;
		color: var(--muted);
	}
</style>
