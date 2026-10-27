<script lang="ts">
	// The Tashkent streets the player has been on, each as its own street plate: learned ones
	// (guessed within 500 m) with a green tick, the others with the closest guess so far. What
	// the game is for, in one list.
	import SubPage from '#lib/components/SubPage.svelte';
	import StreetPlate from '#lib/game/StreetPlate.svelte';
	import { api, call, type Schemas } from '#lib/api/client.js';
	import { ensureSession, session } from '#lib/session.svelte.js';
	import { t } from '#lib/i18n/index.svelte.js';
	import { fmtDistance, fmtNum } from '#lib/format.js';

	type Filter = 'all' | 'learned' | 'not';
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
	const shown = $derived(
		(data?.streets ?? []).filter(
			(s) => filter === 'all' || (filter === 'learned' ? s.learned : !s.learned)
		)
	);
	const pct = (n: number) => `${(n / Math.max(data?.total ?? 1, 1)) * 100}%`;
</script>

<SubPage title={t('myStreets')} back={{ href: '/me', label: t('profile') }}>
	{#if data}
		<section class="top">
			<p class="count">
				<b>{fmtNum(learned)}</b>
				<span>/ {fmtNum(data.total)} {t('streetsLearnedShort')}</span>
			</p>
			<div class="bar" aria-hidden="true">
				<i class="seen" style:width={pct(data.streets.length)}></i>
				<i class="got" style:width={pct(learned)}></i>
			</div>
			<p class="note">{t('streetsHint')}</p>
		</section>

		{#if data.streets.length}
			<div class="segmented filter">
				<button aria-pressed={filter === 'all'} onclick={() => (filter = 'all')}
					>{t('filterAll')} · {data.streets.length}</button
				>
				<button aria-pressed={filter === 'learned'} onclick={() => (filter = 'learned')}
					>{t('learnedLabel')} · {learned}</button
				>
				<button aria-pressed={filter === 'not'} onclick={() => (filter = 'not')}
					>{t('notYet')} · {data.streets.length - learned}</button
				>
			</div>
			<ul>
				{#each shown as s, i (i)}
					<li>
						<span class="plate"
							><StreetPlate place={{ street: s.name, district: s.place }} size="small" /></span
						>
						<span class="how">
							{#if s.learned}
								<span class="tick" title={t('learnedLabel')}>
									<svg viewBox="0 0 24 24" class="icon"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
								</span>
							{:else if s.bestKm != null}
								<b>{fmtDistance(s.bestKm)}</b>
							{:else}
								<b>—</b>
							{/if}
							<span>{t('nRounds', { n: s.rounds })}</span>
						</span>
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
	.filter {
		margin: 22px 0 8px;
	}
	.filter button {
		font-size: 13.5px;
		padding: 0 6px;
	}
	ul {
		list-style: none;
	}
	li {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 0;
		border-bottom: 1px solid var(--border);
	}
	.plate {
		flex: 1;
		min-width: 0;
		display: flex;
	}
	.how {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 2px;
		flex: none;
		font-size: 12.5px;
		color: var(--muted);
	}
	.how b {
		font-family: var(--display);
		font-size: 14px;
		color: var(--text);
	}
	.tick {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: var(--green);
		color: #fff;
		display: grid;
		place-items: center;
		box-shadow: 0 2px 0 var(--green-edge);
	}
	.tick .icon {
		width: 16px;
		height: 16px;
		stroke-width: 3;
	}
	.empty {
		margin-top: 24px;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 14px;
	}
</style>
