<script lang="ts">
	// The Tashkent streets the player has been on: what the game is for, in one list. On the
	// ground the score of it beside the city's face, how many learned out of all, in big gold
	// (before the first, only the face and how to learn one); then the way to the streets still
	// missed; then the streets on a milk list, learned ones (guessed within 500 m) with a gold
	// tick, the others with the closest guess, each with the face and the name of the district
	// the player met it in. A row opens the street's panorama on Yandex Maps.
	import SubPage from '#lib/components/SubPage.svelte';
	import StreetRow from '#lib/maps/StreetRow.svelte';
	import MissedLink from '#lib/maps/MissedLink.svelte';
	import Progress from '#lib/maps/Progress.svelte';
	import PlaceInParent from '#lib/maps/PlaceInParent.svelte';
	import { api, call, type Schemas } from '#lib/api/client.js';
	import { ensureSession, session } from '#lib/session.svelte.js';
	import { t } from '#lib/i18n/index.svelte.js';
	import { fmtNum } from '#lib/format.js';

	type Filter = 'all' | 'learned';
	let data = $state<Schemas['MyStreets'] | null>(null);
	let failed = $state(false);
	let filter = $state<Filter>('all');

	$effect(() => {
		void session.version;
		load();
	});

	async function load() {
		try {
			await ensureSession();
			data = await call(api().GET('/v1/me/streets'));
			failed = false;
		} catch {
			failed = true;
		}
	}

	const learned = $derived(data?.streets.filter((s) => s.learned).length ?? 0);
	const shown = $derived((data?.streets ?? []).filter((s) => filter === 'all' || s.learned));
</script>

<SubPage title={t('myStreets')} back={{ href: '/me', label: t('profile') }}>
	{#if data}
		{#if data.streets.length}
			<section class="score">
				<div class="head">
					<!-- the streets of the game are Tashkent's (its total is the count's "of") -->
					<span class="face"><PlaceInParent place="toshkent" /></span>
					{#if learned}
						<p class="count">
							<b class="d float">{fmtNum(learned)}</b>
							<span>/ {fmtNum(data.total)} {t('streetsLearnedShort')}</span>
						</p>
					{:else}
						<p class="first">{t('firstLearnHint')}</p>
					{/if}
				</div>
				<!-- the bar and what "learned" means come with the first learned street: before it, a
				     stub of a bar and a sentence would only say the headline again -->
				{#if learned}
					<Progress
						progress={{ unit: 'street', total: data.total, seen: data.streets.length, learned }}
						wide
						bare
					/>
					<p class="note">{t('streetsHint')}</p>
				{/if}
			</section>

			<MissedLink count={data.streets.length - learned} />

			<!-- the switch only once there is something learned to show: never "O‘rganilgan · 0" -->
			{#if learned > 0}
				<div class="segmented filter">
					<button aria-pressed={filter === 'all'} onclick={() => (filter = 'all')}
						>{t('filterAll')} · {data.streets.length}</button
					>
					<button aria-pressed={filter === 'learned'} onclick={() => (filter = 'learned')}
						>{t('learnedLabel')} · {learned}</button
					>
				</div>
			{/if}
			<div class="panel-list streets">
				{#each shown as s, i (i)}
					<StreetRow street={s} />
				{/each}
			</div>
		{:else}
			<div class="empty-state">
				<p>{t('streetsEmpty')}</p>
				<a class="btn btn-primary" href="/"><span class="lbl">{t('play')}</span></a>
			</div>
		{/if}
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
	/* the score of it, on the ground: the learned ones in big gold, the bar, what "learned" means */
	.score {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin-bottom: 22px;
	}
	.head {
		display: flex;
		align-items: center;
		gap: 16px;
	}
	/* the city the streets are in: its face on the ground */
	.face {
		flex: none;
		width: 72px;
		height: 72px;
	}
	.count {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: baseline;
		gap: 10px;
		flex-wrap: wrap;
		color: var(--on-ground-2);
		font-weight: 700;
		font-size: 16px;
	}
	.count b {
		font-size: 56px;
		line-height: 1;
		color: var(--gold-text);
	}
	.first {
		flex: 1;
		font-family: var(--f-disp);
		font-weight: 900;
		font-size: 20px;
		line-height: 1.25;
		color: var(--gold-text);
	}
	.note {
		font-size: 13.5px;
		line-height: 1.45;
		color: var(--on-ground-3);
	}
	.filter {
		margin: 22px 0 14px;
	}
	.filter button {
		font-size: 14px;
		font-weight: 700;
		padding: 0 6px;
	}
	.wait {
		display: grid;
		place-items: center;
		min-height: 40vh;
	}
</style>
