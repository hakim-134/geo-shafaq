<script lang="ts">
	// The place map (P1028 4.2, as the owner meant it on 2026-10-29): Uzbekistan as its map,
	// the regions to tap; a tap flies into one and its districts and towns come up; a tap on one
	// of those picks it. One green "O‘ynash" plays where the player stopped: the picked place,
	// else the place on screen. On the country's map the ready maps are the choice (Butun
	// O‘zbekiston, Toshkent ko‘chalari, Tarixiy shaharlar), as road signs, and the map shows
	// each: the whole country edged, Tashkent lit, the old cities' stars. The places also stand
	// in a list under the map, for keyboards and those who prefer one. A place with nothing
	// inside opens its parent's map with it picked.
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import TopBar from '#lib/components/TopBar.svelte';
	import MapSign from '#lib/maps/MapSign.svelte';
	import PlaceMap, { type Mark } from '#lib/maps/PlaceMap.svelte';
	import Progress from '#lib/maps/Progress.svelte';
	import { api, call, ApiError, type MapSummary, type Schemas } from '#lib/api/client.js';
	import { ensureSession, session } from '#lib/session.svelte.js';
	import { t, tx, type Key } from '#lib/i18n/index.svelte.js';
	import { loadChoice, saveChoice, rulesFor, testProviders } from '#lib/rules.js';
	import { showToast } from '#lib/toast.svelte.js';

	type Detail = Schemas['PlaceDetail'];
	type Card = Schemas['PlaceCard'];

	let detail = $state<Detail | null>(null);
	let drawing = $state<Schemas['PlaceMap'] | null>(null);
	let failed = $state<'' | 'network' | 'not_found'>('');
	let ready = $state<MapSummary[]>([]); // the ready maps, the country's choices
	let chosen = $state(''); // the country: the ready map that plays
	let picked = $state(''); // a place without places inside, picked on the map
	let busy = $state(false);

	$effect(() => {
		const slug = page.params.slug;
		void session.version;
		if (slug) open(slug);
	});

	async function open(slug: string) {
		failed = '';
		try {
			await ensureSession();
			const [d, m] = await Promise.all([
				call(api().GET('/v1/places/{slug}', { params: { path: { slug } } })),
				ready.length ? ready : call(api().GET('/v1/maps')).catch(() => [])
			]);
			// Butun O‘zbekiston first: "all", then the narrower ones
			ready = [...m].sort((a, b) => +(b.slug === 'uzbekistan') - +(a.slug === 'uzbekistan'));
			const parent = d.path.at(-1);
			if (!d.children.some((c) => c.panoramas > 0) && parent) {
				goto(`/places/${parent.slug}?pick=${d.place.slug}`, { replaceState: true });
				return;
			}
			const country = d.place.kind === 'country';
			// the country: the old cities' places; Toshkent viloyati: the capital, a hole in it
			const mark = country
				? ready.flatMap((x) => (x.slug === 'historic' ? (x.places ?? []) : []))
				: d.place.slug === 'toshkent-viloyati'
					? ['toshkent']
					: [];
			drawing = await call(
				api().GET('/v1/places/{slug}/map', {
					params: { path: { slug }, query: mark.length ? { mark } : {} },
					querySerializer: { array: { style: 'form', explode: false } } // mark=a,b, as the spec says
				})
			);
			detail = d;
			const pick = page.url.searchParams.get('pick') ?? '';
			picked = d.children.some((c) => c.slug === pick && c.panoramas > 0) ? pick : '';
			const home = loadChoice().map;
			chosen = ready.some((x) => x.slug === home) ? home : (ready[0]?.slug ?? '');
		} catch (e) {
			failed = e instanceof ApiError && e.code === 'not_found' ? 'not_found' : 'network';
		}
	}

	const place = $derived(detail?.place);
	const parent = $derived(detail?.path.at(-1));
	const country = $derived(place?.kind === 'country');
	const cards = $derived(detail?.children ?? []);
	const playable = $derived(cards.filter((c) => c.panoramas > 0));
	const chosenMap = $derived(ready.find((m) => m.slug === chosen));
	const newPlayer = $derived((session.me?.stats.games ?? 1) === 0);

	// what "O‘ynash" plays: the picked place, the country's ready map, or the place on screen
	interface Target {
		map: string;
		name: string;
		top: string;
		outline: string;
		progress?: Schemas['Progress'];
	}
	const target = $derived.by((): Target | null => {
		if (!place) return null;
		const c = cards.find((x) => x.slug === picked);
		if (c)
			return {
				map: c.map,
				name: tx(c.name),
				top: tx(place.name),
				outline: c.outline,
				progress: c.progress
			};
		if (country && chosenMap)
			return {
				map: chosenMap.slug,
				name: tx(chosenMap.name),
				top: tx(chosenMap.description),
				outline: chosenMap.outline ?? '',
				progress: chosenMap.progress
			};
		return {
			map: place.map,
			name: tx(place.name),
			top: parent ? tx(parent.name) : '',
			outline: place.outline,
			progress: place.progress
		};
	});

	// the map shows what plays
	const lit = $derived(
		picked ? [picked] : country && chosen === 'tashkent-streets' ? ['toshkent'] : []
	);
	const whole = $derived(!picked && (!country || chosen === 'uzbekistan'));
	// a ready map's places as named stars: one per name its sign lists ("Samarqand, Buxoro, Xiva,
	// Shahrisabz"), at the first of its places with that name (matched in Uzbek, named in the
	// player's language)
	const marks = $derived.by((): Mark[] => {
		if (place?.slug === 'toshkent-viloyati' && drawing)
			return drawing.marks.map((m) => ({
				slug: m.slug,
				x: m.x,
				y: m.y,
				label: tx(m.name),
				link: true
			}));
		if (!country || chosen !== 'historic' || !drawing || !chosenMap) return [];
		const uz = chosenMap.description.uz.split(/,\s*/);
		const shown = tx(chosenMap.description).split(/,\s*/);
		return uz.flatMap((w, i) => {
			const m = drawing!.marks.find((x) => x.name?.uz.startsWith(w));
			return m ? [{ slug: m.slug, x: m.x, y: m.y, label: shown[i] ?? w }] : [];
		});
	});

	// a tap picks; a second tap keeps it ("if click, it is choose"): another place or the back
	// arrow changes it
	function onpick(c: Card) {
		picked = c.slug;
	}
	function ondrill(c: Card) {
		goto(`/places/${c.slug}`);
	}
	function tapRow(c: Card) {
		if (c.places > 0) ondrill(c);
		else onpick(c);
	}

	const errorKeys: Record<string, Key> = {
		no_panorama: 'err_no_panorama',
		daily_cap: 'err_daily_cap',
		network: 'err_network',
		banned: 'bannedText'
	};

	/** Plays the target now; it becomes the home's sign too. */
	async function play() {
		if (!target || busy) return;
		busy = true;
		const choice = { ...loadChoice(), map: target.map };
		saveChoice(choice);
		try {
			const game = await call(
				api().POST('/v1/games', {
					body: { map: target.map, rules: rulesFor(choice, testProviders()) }
				})
			);
			goto(`/game/${game.id}`);
		} catch (e) {
			busy = false;
			const code = e instanceof ApiError ? e.code : 'other';
			showToast(t(errorKeys[code] ?? 'err_other'), 3500);
		}
	}
</script>

<svelte:head
	><title>{place && !country ? tx(place.name) : t('placesTitle')} — Shafaq Geo</title></svelte:head
>

<TopBar />

<main class="page places">
	<header class="head">
		<a
			class="back icon-btn"
			href={parent ? `/places/${parent.slug}` : '/'}
			aria-label={parent ? tx(parent.name) : t('home')}
			title={parent ? tx(parent.name) : t('home')}
		>
			<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><path d="M15 5 8 12l7 7" /></svg>
		</a>
		<div class="titles">
			{#if parent && !country}<span class="up">{tx(parent.name)}</span>{/if}
			<h1>{place && !country ? tx(place.name) : t('placesTitle')}</h1>
		</div>
	</header>

	{#if failed}
		<div class="failed">
			<p>{failed === 'not_found' ? t('notFoundTitle') : t('err_network')}</p>
			{#if failed === 'network'}
				<button class="btn btn-ghost" onclick={() => open(page.params.slug ?? 'uzbekistan')}
					>{t('retry')}</button
				>
			{/if}
		</div>
	{:else if !detail || !drawing}
		<div class="map-skeleton"></div>
	{:else}
		{#if country && ready.length}
			<!-- the country's choices: what "all of it" means, as road signs -->
			<div class="ready" role="radiogroup" aria-label={t('readyMaps')}>
				{#each ready as m (m.slug)}
					<button
						role="radio"
						aria-checked={!picked && chosen === m.slug}
						onclick={() => {
							chosen = m.slug;
							picked = '';
						}}
					>
						<MapSign slug={m.slug} name={tx(m.name)} outline={m.outline} size="small" />
					</button>
				{/each}
			</div>
		{/if}

		{#key place?.slug}
			<PlaceMap
				{drawing}
				{cards}
				{lit}
				{whole}
				{marks}
				glow={country && newPlayer && chosen === 'tashkent-streets' && !picked ? 'toshkent' : ''}
				{ondrill}
				{onpick}
				onmark={(m) => goto(`/places/${m.slug}`)}
			/>
		{/key}

		<!-- the same places as a list, folded: the map is the way, the list for those who want one -->
		<details class="list-box">
			<summary>{t('placesList')}</summary>
			<ul class="list">
				{#each playable as c (c.slug)}
					<li>
						<button class:on={picked === c.slug} onclick={() => tapRow(c)}>
							<span class="name">{tx(c.name)}</span>
							<Progress progress={c.progress} />
							{#if c.places > 0}
								<svg viewBox="0 0 24 24" class="icon go-in" aria-hidden="true"
									><path d="m9 5 7 7-7 7" /></svg
								>
							{/if}
						</button>
					</li>
				{/each}
			</ul>
		</details>
	{/if}
</main>

<!-- under the thumb: what plays, and the one button -->
{#if target}
	<div class="bar">
		<div class="what">
			<MapSign
				slug={target.map}
				name={target.name}
				top={target.top}
				outline={target.outline}
				size="small"
			/>
			{#if target.progress && target.progress.unit !== 'spot'}<Progress
					progress={target.progress}
				/>{/if}
		</div>
		<button class="btn btn-primary play" onclick={play} disabled={busy}>
			{#if busy}<span class="spinner"></span>{:else}<svg viewBox="0 0 24 24" aria-hidden="true"
					><path d="M7 4.5v15l12-7.5z" /></svg
				>{/if}
			{t('play')}
		</button>
	</div>
{/if}

<style>
	/* the map stands in the middle of the free space; "Ro‘yxat" just above the bar */
	.places {
		min-height: calc(100vh - 70px);
		min-height: calc(100dvh - 70px);
		max-width: 920px;
		margin: 0 auto;
		padding: 10px 24px 112px; /* the bar's height: "Ro‘yxat" sits just above it */
		overflow-x: clip;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.head {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.back {
		flex: none;
	}
	.titles {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.up {
		font-size: 13px;
		font-weight: 600;
		color: var(--muted);
	}
	h1 {
		font-family: var(--display);
		font-weight: 800;
		font-size: clamp(24px, 4vw, 34px);
		letter-spacing: -0.03em;
		line-height: 1.1;
	}
	/* all three in sight, wrapping on a phone: a sign out of sight is a choice nobody makes */
	.ready {
		display: flex;
		flex-wrap: wrap;
		gap: 12px 10px;
		padding: 4px 2px;
	}
	.ready button {
		flex: none;
		padding: 0;
		border: none;
		background: none;
		border-radius: 12px;
		transition:
			opacity 0.15s,
			transform 0.15s;
	}
	.ready button[aria-checked='true'] {
		opacity: 1;
		transform: translateY(-2px);
	}
	.ready button[aria-checked='true'] :global(.sign) {
		outline: 3px solid var(--sky);
		outline-offset: 3px;
	}
	.map-skeleton {
		height: min(420px, 50vh);
		border-radius: 18px;
		background: var(--surface-2);
	}
	.list {
		list-style: none;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
		gap: 6px 14px;
		margin-top: 6px;
	}
	.list button {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 12px;
		border: none;
		border-radius: 12px;
		background: var(--surface-2);
		color: var(--text);
		text-align: left;
		font-size: 14.5px;
	}
	.list button.on {
		background: color-mix(in srgb, var(--sky) 25%, var(--surface-2));
		box-shadow: inset 0 0 0 2px var(--sky);
	}
	.list .name {
		flex: 1;
		min-width: 0;
		font-weight: 700;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.list :global(.progress span) {
		font-size: 12.5px;
		color: var(--muted);
	}
	.go-in {
		width: 18px;
		height: 18px;
		color: var(--muted);
		flex: none;
	}
	.places > :global(.map) {
		margin-block: auto;
	}
	.list-box summary {
		width: fit-content;
		margin: 0 auto;
		padding: 6px 14px;
		border-radius: 999px;
		cursor: pointer;
		font-size: 14px;
		font-weight: 600;
		color: var(--muted);
	}
	.failed {
		display: flex;
		align-items: center;
		gap: 14px;
	}

	.bar {
		position: fixed;
		left: 12px;
		right: 12px;
		bottom: max(12px, env(safe-area-inset-bottom));
		max-width: 920px;
		margin: 0 auto;
		z-index: 100;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 12px;
		padding: 10px 10px 10px 14px;
		border-radius: 20px;
		background: var(--surface);
		box-shadow:
			0 0 0 1px var(--border),
			0 10px 30px rgba(19, 35, 63, 0.18);
		animation: rise 0.35s var(--settle) both;
	}
	.what {
		flex: 0 1 460px;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	/* a long name ("Qoraqalpog‘iston Respublikasi") wraps inside its sign, clear of the button */
	.what :global(.sign) {
		max-width: 100%;
		min-width: 0;
	}
	.what :global(.name) {
		white-space: normal;
		overflow-wrap: anywhere;
	}
	.what :global(.progress span) {
		font-size: 12.5px;
		color: var(--muted);
	}
	.play {
		flex: none;
		height: 58px;
		padding: 0 24px;
		font-size: 18px;
		border-radius: 16px;
	}
	.play svg {
		width: 20px;
		height: 20px;
	}

	@media (max-width: 760px) {
		.places {
			padding: 8px 16px 100px;
		}
		.list {
			grid-template-columns: minmax(0, 1fr);
		}
		.bar {
			padding: 8px 8px 8px 12px;
		}
		.play {
			height: 54px;
			padding: 0 18px;
			font-size: 17px;
		}
	}
</style>
