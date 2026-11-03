<script lang="ts">
	// Maps made by players (PLAN 8.2): the player's own on top, then every listed map, most played
	// first; a name to search, a tag to narrow. One green button: make a new one.
	import { replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import SubPage from '#lib/components/SubPage.svelte';
	import MapRow from '#lib/maps/MapRow.svelte';
	import { api, call, type Schemas } from '#lib/api/client.js';
	import { ensureSession, session } from '#lib/session.svelte.js';
	import { t, type Key } from '#lib/i18n/index.svelte.js';

	const TAGS = ['mahalla', 'shahar', 'kocha', 'tarixiy', 'bozor', 'metro', 'oliygoh', 'tabiat'];

	let mine = $state<Schemas['MapCard'][]>([]);
	let found = $state<Schemas['MapSearch'] | null>(null);
	let failed = $state(false);
	let q = $state(page.url.searchParams.get('q') ?? '');
	let tag = $state(page.url.searchParams.get('tag') ?? '');
	let more = $state(1);

	$effect(() => {
		void session.version;
		ensureSession()
			.then(() => call(api().GET('/v1/me/maps')))
			.then(
				(m) => (mine = m),
				() => {}
			);
	});

	let asked = 0;
	$effect(() => {
		const query = { q: q.trim() || undefined, tag: tag || undefined };
		const ask = ++asked;
		more = 1;
		const timer = setTimeout(async () => {
			try {
				const r = await call(api().GET('/v1/maps/search', { params: { query } }));
				if (ask === asked) {
					found = r;
					failed = false;
				}
			} catch {
				if (ask === asked) failed = true;
			}
			// the address keeps the search: back from a map comes back here
			const u = new URL(location.href);
			for (const [k, v] of Object.entries(query))
				if (v) u.searchParams.set(k, v);
				else u.searchParams.delete(k);
			replaceState(u.pathname + u.search, {});
		}, 250);
		return () => clearTimeout(timer);
	});

	async function loadMore() {
		const query = { q: q.trim() || undefined, tag: tag || undefined, page: more + 1 };
		const r = await call(api().GET('/v1/maps/search', { params: { query } })).catch(() => null);
		if (r && found) {
			found = { ...found, maps: [...found.maps, ...r.maps] };
			more++;
		}
	}

	const searching = $derived(!!q.trim() || !!tag);
</script>

<SubPage title={t('mapsHome')} back={{ href: '/', label: t('home') }}>
	<input
		class="search"
		type="search"
		bind:value={q}
		placeholder={t('mapsSearch')}
		aria-label={t('mapsSearch')}
		maxlength="60"
	/>
	<div class="tags">
		{#each TAGS as x (x)}
			<button class="tag" aria-pressed={tag === x} onclick={() => (tag = tag === x ? '' : x)}>
				{t(`tag_${x}` as Key)}
			</button>
		{/each}
	</div>

	{#if mine.length && !searching}
		<h2 class="section-title">{t('mapsMine')}</h2>
		<ul>
			{#each mine as m (m.slug)}
				<li><MapRow map={m} own /></li>
			{/each}
		</ul>
	{/if}

	<h2 class="section-title">{t('mapsAll')}</h2>
	{#if found?.maps.length}
		<ul>
			{#each found.maps as m (m.slug)}
				<li><MapRow map={m} /></li>
			{/each}
		</ul>
		{#if found.maps.length < found.total}
			<button class="btn btn-ghost more" onclick={loadMore}>{t('mapsMore')}</button>
		{/if}
	{:else if found}
		<p class="note">{t('mapsNone')}</p>
	{:else if failed}
		<p class="note">{t('err_network')}</p>
	{:else}
		<span class="spinner"></span>
	{/if}
	<div class="under-foot"></div>
</SubPage>

<div class="foot">
	<a class="btn btn-primary go" href="/maps/new">
		<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
		{t('mapsNew')}
	</a>
</div>

<style>
	.search {
		height: 50px;
		padding: 0 16px;
		border-radius: 14px;
		border: 2px solid var(--border);
		background: var(--surface);
		color: var(--text);
		font-size: 16px;
		width: 100%;
	}
	.search:focus {
		outline: none;
		border-color: var(--sky);
	}
	.tags {
		display: flex;
		gap: 8px;
		margin: 12px -16px 0; /* to the page's padding; wider would make the whole page wider */
		padding: 0 16px 4px;
		overflow-x: auto;
		scrollbar-width: none;
	}
	.under-foot {
		height: 56px;
	}
	.section-title {
		margin-top: 20px;
	}
	ul {
		list-style: none;
		margin-top: 4px;
	}
	li {
		border-bottom: 1px solid var(--border);
	}
	ul:last-of-type {
		margin-bottom: 8px;
	}
	.note {
		margin-top: 12px;
		color: var(--muted);
	}
	.more {
		width: 100%;
		margin: 14px 0 0;
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
		pointer-events: none;
	}
	.go {
		pointer-events: auto;
		width: 100%;
		max-width: 592px;
		height: 60px;
		font-size: 17px;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
	}
</style>
