<script lang="ts">
	// The Tashkent streets the player has been on, each as its own street plate: learned ones
	// (guessed within 500 m) with a green tick, the others with the closest guess so far. What
	// the game is for, in one list. Each street's 🏁 badge opens its panorama on Yandex Maps.
	import SubPage from '#lib/components/SubPage.svelte';
	import StreetRow from '#lib/maps/StreetRow.svelte';
	import MissedLink from '#lib/maps/MissedLink.svelte';
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
	const pct = (n: number) => `${(n / Math.max(data?.total ?? 1, 1)) * 100}%`;
</script>

<SubPage title={t('myStreets')} back={{ href: '/me', label: t('profile') }}>
	{#if data}
		<section class="top">
			{#if learned}
				<p class="count">
					<b>{fmtNum(learned)}</b>
					<span>/ {fmtNum(data.total)} {t('streetsLearnedShort')}</span>
				</p>
				<div class="bar" aria-hidden="true">
					<i class="seen" style:width={pct(data.streets.length)}></i>
					<i class="got" style:width={pct(learned)}></i>
				</div>
				<p class="note">{t('streetsHint')}</p>
			{:else}
				<p class="first">{t('firstLearnHint')}</p>
			{/if}
		</section>

		<div class="missed"><MissedLink count={data.streets.length - learned} /></div>

		{#if data.streets.length}
			<div class="segmented filter">
				<button aria-pressed={filter === 'all'} onclick={() => (filter = 'all')}
					>{t('filterAll')} · {data.streets.length}</button
				>
				<button aria-pressed={filter === 'learned'} onclick={() => (filter = 'learned')}
					>{t('learnedLabel')} · {learned}</button
				>
			</div>
			<ul>
				{#each shown as s, i (i)}
					<li>
						<StreetRow street={s} plain />
					</li>
				{/each}
			</ul>
		{:else}
			<div class="empty">
				<p>{t('streetsEmpty')}</p>
				<a class="btn btn-primary" href="/">{t('play')}</a>
			</div>
		{/if}
	{:else if failed}
		<p class="note">{t('err_network')}</p>
		<button class="btn btn-ghost" onclick={load}>{t('retry')}</button>
	{:else}
		<span class="spinner"></span>
	{/if}
</SubPage>

<style>
	.top {
		padding: 18px 20px;
		border-radius: 22px;
		background: var(--surface);
		border: 1px solid var(--border);
		box-shadow: 0 4px 0 var(--edge);
	}
	.first {
		font-weight: 600;
	}
	.count {
		display: flex;
		align-items: baseline;
		gap: 8px;
		flex-wrap: wrap;
	}
	.count b {
		font-family: var(--display);
		font-weight: 800;
		font-size: 46px;
		line-height: 1;
		color: var(--green-ink);
	}
	:global(:root[data-theme='dark']) .count b {
		color: var(--green);
	}
	.count span {
		font-weight: 600;
		color: var(--muted);
	}
	.bar {
		position: relative;
		margin-top: 14px;
		height: 12px;
		border-radius: 6px;
		background: var(--surface-2);
		overflow: hidden;
	}
	.bar i {
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		border-radius: inherit;
	}
	.bar .seen {
		background: color-mix(in srgb, var(--gold) 45%, transparent);
	}
	.bar .got {
		background: var(--green);
	}
	.note {
		margin-top: 12px;
		font-size: 13.5px;
		color: var(--muted);
	}
	.missed {
		margin-top: 16px;
	}
	.filter {
		margin: 18px 0 8px;
	}
	.filter button {
		font-size: 13.5px;
		padding: 0 6px;
	}
	ul {
		list-style: none;
	}
	li {
		border-bottom: 1px solid var(--border);
	}
	.empty {
		margin-top: 24px;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 14px;
	}
</style>
