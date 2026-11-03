<script lang="ts">
	// Streets I miss (PLAN 8.5): the streets the player has been on and hasn't found, worst first,
	// and one green button that plays them. A street found within 500 m leaves the list. The list
	// is the map: the server makes it fresh for each game.
	import { goto } from '$app/navigation';
	import SubPage from '#lib/components/SubPage.svelte';
	import StreetRow from '#lib/maps/StreetRow.svelte';
	import { api, call, ApiError, type Schemas } from '#lib/api/client.js';
	import { ensureSession, session } from '#lib/session.svelte.js';
	import { t } from '#lib/i18n/index.svelte.js';
	import { loadChoice, rulesFor, testProviders } from '#lib/rules.js';
	import { showToast } from '#lib/toast.svelte.js';

	let data = $state<Schemas['MissedStreets'] | null>(null);
	let failed = $state(false);
	let busy = $state(false);

	$effect(() => {
		void session.version;
		load();
	});

	async function load() {
		try {
			await ensureSession();
			data = await call(api().GET('/v1/me/missed'));
			failed = false;
		} catch {
			failed = true;
		}
	}

	// the home's sign stays where it was: this map is a detour, not a place
	async function play() {
		if (!data || busy) return;
		busy = true;
		try {
			const choice = { ...loadChoice(), map: data.map };
			const game = await call(
				api().POST('/v1/games', {
					body: { map: data.map, rules: rulesFor(choice, testProviders()) }
				})
			);
			goto(`/game/${game.id}`);
		} catch (e) {
			busy = false;
			showToast(t(e instanceof ApiError && e.code === 'banned' ? 'bannedText' : 'err_other'), 3500);
		}
	}
</script>

<SubPage title={t('missedTitle')} back={{ href: '/me/streets', label: t('myStreets') }}>
	{#if data?.streets.length}
		<section class="top">
			<b>{t('missedWaiting', { n: data.streets.length })}</b>
			<p>{t('missedNote')}</p>
		</section>
		<ul>
			{#each data.streets as s, i (i)}
				<li><StreetRow street={s} plain /></li>
			{/each}
		</ul>
		<div class="foot">
			<button class="btn btn-primary go" disabled={busy} onclick={play}>
				{#if busy}<span class="spinner"></span>{:else}<svg viewBox="0 0 24 24" aria-hidden="true"
						><path d="M7 4.5v15l12-7.5z" /></svg
					>{/if}
				{t('play')}
			</button>
		</div>
	{:else if data}
		<p class="none">{t('missedNone')}</p>
		<div class="foot">
			<a class="btn btn-primary go" href="/">
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" /></svg>
				{t('play')}
			</a>
		</div>
	{:else if failed}
		<p class="note">{t('err_network')}</p>
		<button class="btn btn-ghost" onclick={load}>{t('retry')}</button>
	{:else}
		<span class="spinner"></span>
	{/if}
</SubPage>

<style>
	.top {
		padding: 16px 20px;
		border-radius: 22px;
		background: var(--surface);
		border: 1px solid var(--border);
		box-shadow: 0 4px 0 var(--edge);
	}
	.top b {
		font-family: var(--display);
		font-weight: 800;
		font-size: 22px;
		line-height: 1.15;
	}
	.top p {
		margin-top: 6px;
		font-size: 14.5px;
		color: var(--muted);
	}
	ul {
		list-style: none;
		margin-top: 10px;
		padding-bottom: 76px;
	}
	li {
		border-bottom: 1px solid var(--border);
	}
	.foot {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 50;
		display: flex;
		justify-content: center;
		padding: 12px 16px max(14px, env(safe-area-inset-bottom));
		background: linear-gradient(to top, var(--bg) 70%, transparent);
	}
	.go {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		width: 100%;
		max-width: 592px;
		height: 60px;
		font-size: 17px;
	}
	.go svg {
		width: 20px;
		height: 20px;
		fill: currentColor;
		stroke: none;
	}
	.note {
		color: var(--muted);
		margin-bottom: 12px;
	}
	.none {
		font-size: 17px;
		font-weight: 600;
	}
</style>
