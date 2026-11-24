<script lang="ts">
	// Streets I miss (PLAN 8.5): the streets the player has been on and hasn't found, worst first,
	// on a milk list (each with its district's face and name, and how far the closest guess
	// went), and one green key at the thumb that plays them. A street found within
	// 500 m leaves the list. The list is the map: the server makes it fresh for each game.
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

	// the home's map stays where it was: this map is a detour, not a place
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

{#snippet playMissed()}
	<button class="btn btn-primary go" disabled={busy} onclick={play}>
		{#if busy}<span class="spinner"></span>{:else}<span class="lbl">{t('play')}</span>{/if}
	</button>
{/snippet}

<SubPage
	title={t('missedTitle')}
	back={{ href: '/learn', label: t('tabLearn') }}
	footer={data?.streets.length ? playMissed : undefined}
>
	{#if data?.streets.length}
		<section class="top">
			<p class="d float waiting">{t('missedWaiting', { n: data.streets.length })}</p>
			<p class="note">{t('missedNote')}</p>
		</section>
		<div class="panel-list">
			{#each data.streets as s, i (i)}
				<StreetRow street={s} />
			{/each}
		</div>
	{:else if data}
		<div class="empty-state">
			<p>{t('missedNone')}</p>
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
	.top {
		margin-bottom: 18px;
	}
	.waiting {
		font-size: 24px;
		line-height: 1.2;
		color: var(--on-ground);
		transform-origin: 0 75%;
	}
	.note {
		margin-top: 8px;
		font-size: 14.5px;
		color: var(--on-ground-3);
	}
	.go {
		width: 100%;
	}
	.wait {
		display: grid;
		place-items: center;
		min-height: 40vh;
	}
</style>
