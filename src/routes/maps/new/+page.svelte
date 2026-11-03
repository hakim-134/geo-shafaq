<script lang="ts">
	// The map maker (PLAN 8.1). First screen: what the map holds, by drawing on the map, by places on
	// the map of Uzbekistan, or by streets; the library fills it and says how many. Second screen: a
	// name, who plays it. One green button each. It ends on the map's own page, with "O‘ynash".
	import { goto } from '$app/navigation';
	import TopBar from '#lib/components/TopBar.svelte';
	import DrawMap from '#lib/maps/DrawMap.svelte';
	import MapForm from '#lib/maps/MapForm.svelte';
	import PlaceMap from '#lib/maps/PlaceMap.svelte';
	import StreetPlate from '#lib/game/StreetPlate.svelte';
	import { api, call, ApiError, type LatLon, type Schemas } from '#lib/api/client.js';
	import type { BBox } from '#lib/map/map.js';
	import { ensureSession } from '#lib/session.svelte.js';
	import { fmtNum } from '#lib/format.js';
	import { t, tx, type Key } from '#lib/i18n/index.svelte.js';
	import { showToast } from '#lib/toast.svelte.js';

	type Tab = 'draw' | 'places' | 'streets';
	type Card = Schemas['PlaceCard'];
	// where the draw map opens without the player's location: the city's middle, a mahalla across,
	// so one loop of a thumb is a mahalla there too
	const CENTRE: BBox = [69.252, 41.29, 69.307, 41.332];
	const BIG = 100; // spots: more than a mahalla, whatever it's called
	const MIN = 3; // the server's too: fewer isn't a game

	let step = $state<1 | 2>(1);
	let tab = $state<Tab>('draw');
	let pen = $state(false); // the finger draws
	let mapReady = $state(false);
	let mapFailed = $state(false);

	// what the map holds
	let area = $state<LatLon[]>([]);
	let places = $state<Card[]>([]);
	let streets = $state<Schemas['LibraryStreet'][]>([]);

	// ---------- how many ----------
	let count = $state<Schemas['MapPreview'] | null>(null);
	let counting = 0;
	const picked = $derived(area.length > 0 || places.length > 0 || streets.length > 0);
	const sources = $derived({
		places: places.map((p) => p.slug),
		streets: streets.map((s) => s.id),
		...(area.length ? { area: area.map((p) => [p.lat, p.lon]) } : {})
	});
	$effect(() => {
		const body = sources;
		if (!picked) {
			count = null;
			return;
		}
		const ask = ++counting;
		const timer = setTimeout(async () => {
			const n = await call(api().POST('/v1/maps/preview', { body })).catch(() => null);
			if (n && ask === counting) count = n;
		}, 200);
		return () => clearTimeout(timer);
	});
	// a map of streets alone is one round a street: three streets, as three spots elsewhere
	const fewStreets = $derived(!area.length && !places.length && streets.length < MIN);
	const ready = $derived(picked && !fewStreets && (count?.panoramas ?? 0) >= MIN);

	// ---------- places ----------
	let detail = $state<Schemas['PlaceDetail'] | null>(null);
	let drawing = $state<Schemas['PlaceMap'] | null>(null);
	async function openPlace(slug: string) {
		const params = { params: { path: { slug } } };
		try {
			const [d, m] = await Promise.all([
				call(api().GET('/v1/places/{slug}', params)),
				call(api().GET('/v1/places/{slug}/map', params))
			]);
			detail = d;
			drawing = m;
		} catch {
			showToast(t('err_network'));
		}
	}
	function togglePlace(c: Card) {
		places = places.some((p) => p.slug === c.slug)
			? places.filter((p) => p.slug !== c.slug)
			: [...places, c];
	}
	const here = $derived(detail?.place);
	const parent = $derived(detail?.path.at(-1));

	// ---------- streets ----------
	let library = $state<Schemas['LibraryStreet'][] | null>(null);
	let search = $state('');
	const norm = (s: string) => s.toLowerCase().replace(/['’ʻʼ`]/g, '‘');
	const found = $derived(
		(library ?? []).filter((s) => !search.trim() || norm(tx(s.name)).includes(norm(search.trim())))
	);
	function toggleStreet(s: Schemas['LibraryStreet']) {
		streets = streets.some((x) => x.id === s.id)
			? streets.filter((x) => x.id !== s.id)
			: [...streets, s];
	}

	$effect(() => {
		if (tab === 'places' && !detail) openPlace('uzbekistan');
		if (tab === 'streets' && !library)
			call(api().GET('/v1/library/streets')).then(
				(l) => (library = l),
				() => showToast(t('err_network'))
			);
	});

	// ---------- the second screen ----------
	let name = $state('');
	let visibility = $state<Schemas['MapVisibility']>('unlisted');
	let tags = $state<string[]>([]);
	let busy = $state(false);

	function next() {
		// a name to start from: what was picked first; a drawn loop is "my mahalla"
		if (!name)
			name = area.length
				? t((count?.panoramas ?? 0) > BIG ? 'mkDefaultBig' : 'mkDefaultName')
				: tx(places[0]?.name ?? streets[0]?.name) || t('mkDefaultName');
		step = 2;
	}
	function clear() {
		area = [];
		places = [];
		streets = [];
	}
	function open(to: Tab) {
		tab = to;
		pen = false;
	}
	const items = $derived([
		...(area.length ? [t('mkDrawn')] : []),
		...places.map((p) => tx(p.name)),
		...streets.map((s) => tx(s.name))
	]);

	const errors: Record<string, Key> = {
		bad_name: 'mapBadName',
		too_few_panoramas: 'mkTooFew',
		too_many_maps: 'mapTooMany',
		banned: 'bannedText',
		network: 'err_network'
	};

	async function create() {
		if (busy) return;
		busy = true;
		try {
			await ensureSession();
			const m = await call(
				api().POST('/v1/maps', { body: { ...sources, name, visibility, tags } })
			);
			goto(`/maps/${m.slug}`, { replaceState: true });
		} catch (e) {
			busy = false;
			showToast(t(errors[e instanceof ApiError ? e.code : ''] ?? 'err_other'), 3500);
		}
	}
</script>

<svelte:head><title>{t('mapsNew')} — Shafaq Geo</title></svelte:head>

<TopBar />

<main class="maker">
	<header>
		{#if step === 2}
			<button class="back icon-btn" onclick={() => (step = 1)} aria-label={t('mapsNew')}>
				<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><path d="M15 5 8 12l7 7" /></svg>
			</button>
		{:else}
			<a class="back icon-btn" href="/maps" aria-label={t('mapsHome')}>
				<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><path d="M15 5 8 12l7 7" /></svg>
			</a>
		{/if}
		<h1>{t('mapsNew')}</h1>
	</header>

	{#if step === 1}
		<div class="segmented tabs">
			<button aria-pressed={tab === 'draw'} onclick={() => open('draw')}>{t('mkDraw')}</button>
			<button aria-pressed={tab === 'places'} onclick={() => open('places')}>{t('mkPlaces')}</button
			>
			<button aria-pressed={tab === 'streets'} onclick={() => open('streets')}
				>{t('mkStreets')}</button
			>
		</div>

		{#if tab === 'draw'}
			<DrawMap
				{area}
				bbox={CENTRE}
				ondraw={(a) => (area = a)}
				bind:drawing={pen}
				bind:ready={mapReady}
				bind:failed={mapFailed}
			/>
		{:else if tab === 'places'}
			<section class="places">
				{#if here && drawing && detail}
					<div class="level">
						{#if parent}
							<button class="up link-btn" onclick={() => openPlace(parent.slug)}>
								<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"
									><path d="M15 5 8 12l7 7" /></svg
								>
								{tx(parent.name)}
							</button>
						{/if}
						{#if parent}
							<button
								class="tag whole"
								aria-pressed={places.some((p) => p.slug === here.slug)}
								onclick={() => togglePlace(here)}
							>
								{t('mkWhole', { name: tx(here.name) })}
							</button>
						{/if}
					</div>
					{#key here.slug}
						<PlaceMap
							{drawing}
							cards={detail.children}
							lit={places.map((p) => p.slug)}
							ondrill={(c) => openPlace(c.slug)}
							onpick={togglePlace}
						/>
					{/key}
				{:else}
					<span class="spinner"></span>
				{/if}
			</section>
		{:else}
			<section class="streets">
				<input
					class="search"
					type="search"
					bind:value={search}
					placeholder={t('mkStreetSearch')}
					aria-label={t('mkStreetSearch')}
				/>
				{#if library && !found.length}
					<p class="none">{t('mkNoStreet')}</p>
				{:else if library}
					<ul>
						{#each found as s (s.id)}
							{@const on = streets.some((x) => x.id === s.id)}
							<li>
								<button class="street" aria-pressed={on} onclick={() => toggleStreet(s)}>
									<span class="plate"><StreetPlate place={{ street: s.name }} size="small" /></span>
									<span class="check" class:on aria-hidden="true">
										{#if on}<svg viewBox="0 0 24 24" class="icon"
												><path d="m5 12.5 4.5 4.5L19 7.5" /></svg
											>{/if}
									</span>
								</button>
							</li>
						{/each}
					</ul>
				{:else}
					<span class="spinner"></span>
				{/if}
			</section>
		{/if}

		<!-- under the thumb, one button: start the pen; the pen is on; what's in it, and on -->
		<div class="bar">
			{#if pen}
				<div class="strip">
					<span>{t('mkDrawHint')}</span>
					<button onclick={() => (pen = false)} aria-label={t('mkCancel')} title={t('mkCancel')}
						>✕</button
					>
				</div>
			{:else if tab === 'draw' && !picked && mapFailed}
				<button class="btn btn-primary start" onclick={() => location.reload()}>{t('retry')}</button
				>
			{:else if tab === 'draw' && !picked}
				<button class="btn btn-primary start" disabled={!mapReady} onclick={() => (pen = true)}>
					<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"
						><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" /></svg
					>
					{t('mkStart')}
				</button>
			{:else}
				<div class="what">
					{#if !picked}
						<span class="hint">{t('mkPick')}</span>
					{:else if fewStreets}
						<span class="hint low">{t('mkTooFewStreets')}</span>
					{:else if count && count.panoramas < MIN}
						<span class="hint low">{t('mkTooFew')}</span>
					{:else if count}
						<b>{t('nSpots', { n: count.panoramas })}</b>
					{:else}
						<span class="spinner"></span>
					{/if}
					{#if items.length}
						<button class="chip" onclick={clear}>
							<span>{items[0]}</span>{#if items.length > 1}&nbsp;+{items.length - 1}{/if}&nbsp;✕
						</button>
					{/if}
				</div>
				{#if ready}
					<button class="btn btn-primary go" onclick={next}>{t('mkNext')}</button>
				{/if}
			{/if}
		</div>
	{:else}
		<section class="form">
			<MapForm bind:name bind:visibility bind:tags />
			<button
				class="btn btn-primary make"
				disabled={busy || name.trim().length < 2}
				onclick={create}
			>
				{#if busy}<span class="spinner"></span>{/if}
				{t('mkCreate')}
			</button>
		</section>
	{/if}
</main>

<style>
	/* the whole screen is the tool: nothing to scroll past on a phone */
	.maker {
		max-width: 920px;
		margin: 0 auto;
		padding: 6px 16px 104px;
		height: calc(100vh - 70px);
		height: calc(100dvh - 70px);
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	header {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.back {
		flex: none;
	}
	h1 {
		font-family: var(--display);
		font-weight: 800;
		font-size: 24px;
		letter-spacing: -0.02em;
	}
	.tabs {
		flex: none;
	}
	.places,
	.streets {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.level {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.level:empty {
		display: none;
	}
	.up {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		min-height: 40px;
		font-weight: 600;
		color: var(--muted);
	}
	.whole {
		overflow: hidden;
		text-overflow: ellipsis;
		min-width: 0;
	}
	.search {
		flex: none;
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
	ul {
		list-style: none;
		flex: 1;
		min-height: 0;
		overflow-y: auto;
	}
	li {
		border-bottom: 1px solid var(--border);
	}
	.none {
		margin-top: 8px;
		color: var(--muted);
		font-weight: 600;
	}
	.street {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		min-height: 60px;
		padding: 8px 2px;
		border: none;
		background: none;
		text-align: left;
	}
	.plate {
		min-width: 0;
	}
	.check {
		flex: none;
		width: 30px;
		height: 30px;
		display: grid;
		place-items: center;
		border-radius: 50%;
		border: 2px solid var(--border);
		color: #fff;
	}
	.check.on {
		background: var(--green);
		border-color: var(--green);
	}
	.bar {
		position: fixed;
		left: 12px;
		right: 12px;
		bottom: max(12px, env(safe-area-inset-bottom));
		max-width: 896px;
		margin: 0 auto;
		z-index: 100;
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 78px;
		padding: 10px 10px 10px 16px;
		border-radius: 20px;
		background: var(--surface);
		box-shadow:
			0 0 0 1px var(--border),
			0 10px 30px rgba(19, 35, 63, 0.18);
	}
	.what {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.what b {
		font-family: var(--display);
		font-weight: 800;
		font-size: 15px;
		white-space: nowrap;
	}
	.bar:has(.start),
	.bar:has(.strip) {
		padding: 10px;
	}
	.hint {
		font-size: 14.5px;
		font-weight: 600;
		color: var(--muted);
	}
	.hint.low {
		color: var(--red);
	}
	.chip {
		align-self: flex-start;
		max-width: 100%;
		display: inline-flex;
		align-items: center;
		min-height: 28px;
		padding: 0 10px;
		border: none;
		border-radius: 999px;
		background: var(--surface-2);
		color: var(--text);
		font-size: 12.5px;
		font-weight: 600;
		white-space: nowrap;
	}
	.chip span {
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.start {
		flex: 1;
		height: 58px;
		font-size: 15.5px;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
	}
	.strip {
		flex: 1;
		height: 58px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 0 8px 0 18px;
		border-radius: 14px;
		background: var(--gold);
		color: #1b2a44;
		font-family: var(--display);
		font-weight: 700;
		font-size: 15.5px;
	}
	.strip button {
		flex: none;
		width: 42px;
		height: 42px;
		border: none;
		border-radius: 50%;
		background: rgba(27, 42, 68, 0.14);
		color: inherit;
		font-size: 16px;
	}
	.go {
		flex: none;
		height: 58px;
		padding: 0 16px;
		font-size: 15px;
	}
	.form {
		display: flex;
		flex-direction: column;
		gap: 20px;
		max-width: 480px;
		width: 100%;
		margin: 0 auto;
		padding-top: 6px;
	}
	.make {
		height: 60px;
		font-size: 17px;
		margin-top: 4px;
	}
</style>
