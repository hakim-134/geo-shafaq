<script lang="ts">
	// The place map (P1028 4.2, as the owner meant it on 2026-10-29), in the game's look (P1111
	// 1.1, decision 0024): Uzbekistan as its map, the regions to tap; a tap flies into one and its
	// districts and towns come up; a tap on one of those marks it blue. One green "O‘YNASH" plays
	// where the player stopped: the marked place, else the place on screen. The head is the
	// place's face (place-in-parent, P1111 §5) beside its parent's name, a gold tag, over its own
	// name. On the country's map the ready maps are the choice (Butun O‘zbekiston, Toshkent
	// ko‘chalari, Tarixiy shaharlar), three tiles with their pictures, and the map shows each:
	// the whole country edged gold, Tashkent's badge gold, the old cities' stars. The card under
	// the thumb shows what plays: its face, its name, its progress. The places also stand in a
	// list under the map, each with its face, for keyboards and those who prefer one. A place
	// with nothing inside opens its parent's map with it marked.
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import GameBar from '#lib/components/GameBar.svelte';
	import PlaceInParent from '#lib/maps/PlaceInParent.svelte';
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
	let picked = $state(''); // a place without places inside, marked on the map
	let busy = $state(false);
	let listOpen = $state(false); // the list's faces are fetched only once it is opened

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
	// a place that is a ready map's whole area plays that map, under its own name: one Tashkent
	const sameMap = $derived(
		ready.find((m) => m.places?.length === 1 && m.places[0] === place?.slug)
	);
	const newPlayer = $derived((session.me?.stats.games ?? 1) === 0);
	const title = $derived(place && !country ? tx(place.name) : t('placesTitle'));

	/** What PlaceInParent draws: a place's own face, the one it wears on every screen (the map's
	 * `face`: Toshkent ko‘chalari is Toshkent viloyati with the city gold, as on the lobby card,
	 * history and records). Only the old cities, a map of several places with no one face, show
	 * their points on Uzbekistan, so the three choices never wear the same picture. */
	interface Face {
		place?: string;
		parent?: string;
		marks?: string[];
		trim?: boolean;
	}
	function mapFace(m: MapSummary): Face {
		if (m.place) return { place: m.face ?? m.place.slug };
		return { parent: 'uzbekistan', marks: m.places ?? [], trim: false };
	}

	// what "O‘ynash" plays: the marked place, the country's ready map, or the place on screen
	interface Target {
		map: string;
		name: string;
		top: string;
		face: Face;
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
				face: { place: c.slug },
				progress: c.progress
			};
		const ready = country ? chosenMap : sameMap;
		if (ready)
			return {
				map: ready.slug,
				name: tx(ready.name),
				top: tx(ready.description),
				// the map's own face, the same on the country's page and inside Tashkent
				face: mapFace(ready),
				progress: ready.progress
			};
		return {
			map: place.map,
			name: tx(place.name),
			top: parent ? tx(parent.name) : '',
			face: { place: place.slug },
			progress: place.progress
		};
	});

	// the map shows what plays: a marked place blue; Tashkent's streets, chosen on the country,
	// its badge gold; the whole place edged gold
	const marked = $derived(picked ? [picked] : []);
	const lit = $derived(!picked && country && chosen === 'tashkent-streets' ? ['toshkent'] : []);
	const whole = $derived(!picked && (!country || chosen === 'uzbekistan'));
	// a ready map's places as named stars: one per name its description lists ("Samarqand,
	// Buxoro, Xiva, Shahrisabz"), at the first of its places with that name (matched in Uzbek,
	// named in the player's language)
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

	// a tap marks; a second tap keeps it ("if click, it is choose"): another place or the back
	// key changes it
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

	/** Plays the target now; it becomes the home's place too. */
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

	/** The title on two lines at most: a long name ("Qoraqalpog‘iston Respublikasi") steps down
	 * in size until it fits, never under 20 px. */
	function fit(el: HTMLElement, _text: string) {
		const run = () => {
			el.style.fontSize = '';
			const cs = getComputedStyle(el);
			let size = parseFloat(cs.fontSize);
			const ratio = (parseFloat(cs.lineHeight) || size * 1.08) / size;
			// lines by the box's own height: the round letters reach a little past their line, so
			// the scroll height would count a line that isn't there
			const over = () =>
				el.clientHeight > size * ratio * 2 + 1 || el.scrollWidth > el.clientWidth + 1;
			while (over() && size > 20) {
				size -= 1;
				el.style.fontSize = `${size}px`;
			}
		};
		run();
		document.fonts?.ready.then(run);
		const ro = new ResizeObserver(run);
		ro.observe(el.parentElement!);
		return { update: run, destroy: () => ro.disconnect() };
	}
</script>

<svelte:head><title>{title} — GeoShafaq</title></svelte:head>

<GameBar standalone />

<main class="page places">
	<!-- where you are: the place's picture beside its parent's name over its own -->
	<header class="head">
		<a
			class="back chip"
			href={parent ? `/places/${parent.slug}` : '/'}
			aria-label={parent ? tx(parent.name) : t('home')}
			title={parent ? tx(parent.name) : t('home')}
		>
			<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>
		</a>
		<span class="face" aria-hidden="true">
			{#if place}
				{#key place.slug}
					<span class="pop-pic"><PlaceInParent place={place.slug} /></span>
				{/key}
			{/if}
		</span>
		<div class="words">
			{#if parent && !country}<span class="kick-tag">{tx(parent.name)}</span>{/if}
			<h1 class="d float" use:fit={title}>{title}</h1>
		</div>
	</header>

	{#if failed}
		<div class="failed">
			<p>{failed === 'not_found' ? t('notFoundTitle') : t('err_network')}</p>
			{#if failed === 'network'}
				<button class="btn btn-chip" onclick={() => open(page.params.slug ?? 'uzbekistan')}
					>{t('retry')}</button
				>
			{/if}
		</div>
	{:else if !detail || !drawing}
		<div class="map-skeleton"></div>
	{:else}
		{#if country && ready.length}
			<!-- the country's choices: what "all of it" means, each with its picture -->
			<div class="ready" role="radiogroup" aria-label={t('readyMaps')}>
				{#each ready as m (m.slug)}
					{@const on = !picked && chosen === m.slug}
					<button
						role="radio"
						aria-checked={on}
						onclick={() => {
							chosen = m.slug;
							picked = '';
						}}
					>
						<span class="rpic" aria-hidden="true"
							><PlaceInParent {...mapFace(m)} on={on ? 'panel' : 'ground'} /></span
						>
						<span class="rname">{tx(m.name)}</span>
					</button>
				{/each}
			</div>
		{/if}

		{#key place?.slug}
			<PlaceMap
				{drawing}
				{cards}
				{lit}
				{marked}
				{whole}
				{marks}
				glow={country && newPlayer && chosen === 'tashkent-streets' && !picked ? 'toshkent' : ''}
				{ondrill}
				{onpick}
				onmark={(m) => goto(`/places/${m.slug}`)}
				zoomable
			/>
		{/key}

		<!-- the same places as a list, folded: the map is the way, the list for those who want one -->
		<details class="list-box" bind:open={listOpen}>
			<summary class="chip">
				<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"
					><path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" /></svg
				>
				{t('placesList')}
			</summary>
			{#if listOpen}
				<div class="rows panel-list">
					{#each playable as c (c.slug)}
						<button class="row" class:on={picked === c.slug} onclick={() => tapRow(c)}>
							<span class="lpic" aria-hidden="true"
								><PlaceInParent place={c.slug} on="panel" /></span
							>
							<span class="ltext">
								<b>{tx(c.name)}</b>
								<span class="sub">
									<Progress progress={c.progress} />
									<span class="n">{t('nPanoramas', { n: c.panoramas })}</span>
								</span>
							</span>
							{#if c.places > 0}
								<svg viewBox="0 0 24 24" class="icon go-in" aria-hidden="true"
									><path d="m9 6 6 6-6 6" /></svg
								>
							{/if}
						</button>
					{/each}
				</div>
			{/if}
		</details>
	{/if}
</main>

<!-- under the thumb: what plays, and the one key -->
{#if target}
	<div class="bar on-panel">
		<span class="bpic" aria-hidden="true">
			{#key target.map}
				<span class="pop-pic"><PlaceInParent {...target.face} on="panel" /></span>
			{/key}
		</span>
		<div class="what">
			{#if target.top}<span class="top">{target.top}</span>{/if}
			<b class="name d">{target.name}</b>
			{#if target.progress}<Progress progress={target.progress} short />{/if}
		</div>
		<button class="btn btn-primary play" onclick={play} disabled={busy}>
			{#if busy}<span class="spinner"></span>{:else}<span class="lbl">{t('play')}</span>{/if}
		</button>
	</div>
{/if}

<style>
	/* the map stands in the middle of the free space; "Ro‘yxat" just above the card */
	.places {
		min-height: calc(100vh - 70px);
		min-height: calc(100dvh - 70px);
		max-width: 920px;
		margin: 0 auto;
		padding: 4px 16px 120px; /* the card's height: "Ro‘yxat" sits just above it */
		overflow-x: clip;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	/* ---------- the head ---------- */
	.head {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 72px;
	}
	/* the quiet round back key: glass on the ground */
	.back {
		width: 44px;
		height: 44px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		flex: none;
		transition: transform 0.1s var(--out);
	}
	.back:active {
		transform: scale(0.92);
	}
	.back .icon {
		width: 22px;
		height: 22px;
		stroke-width: 2.8;
	}
	/* the place's face: milk tiles on the ground, the place gold, as the home's picture */
	.face {
		width: 76px;
		height: 66px;
		flex: none;
		--pip-tile: var(--tile-a);
		--pip-on: var(--gold);
		--pip-edge: var(--gold-lo);
		--pip-ring: var(--gold-lo);
		filter: drop-shadow(0 3px 0 var(--map-shadow)) drop-shadow(0 0 8px var(--map-glow));
	}
	.face > span,
	.bpic > span {
		display: block;
		width: 100%;
		height: 100%;
	}
	.words {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 6px;
	}
	h1 {
		max-width: 100%;
		font-size: 32px;
		line-height: 1.08;
		color: var(--on-ground);
		overflow-wrap: normal;
	}

	/* ---------- the country's three ready maps: tiles, the chosen one milk with a gold ring ---------- */
	.ready {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 10px;
	}
	.ready button {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 6px;
		min-height: 94px;
		padding: 10px 6px 9px;
		border: none;
		border-radius: var(--r-m);
		background: var(--chip-bg);
		box-shadow: inset 0 0 0 1.5px var(--chip-line);
		color: var(--chip-ink);
		font-weight: 700;
		font-size: 13.5px;
		line-height: 1.2;
		text-align: center;
		transition:
			transform 0.12s var(--out),
			background 0.15s,
			box-shadow 0.15s;
	}
	.ready button:active {
		transform: scale(0.97);
	}
	.ready button[aria-checked='true'] {
		background: var(--panel);
		color: var(--ink);
		box-shadow:
			inset 0 0 0 2.5px var(--gold),
			0 3px 0 var(--panel-lip),
			0 10px 20px -8px var(--shade);
	}
	.rpic {
		width: 52px;
		height: 38px;
		flex: none;
	}
	.rname {
		overflow-wrap: anywhere;
	}

	.map-skeleton {
		height: min(420px, 50vh);
		border-radius: var(--r);
		background: var(--chip-bg);
	}
	/* it takes the free space: close up the map uses all of it */
	.places > :global(.map) {
		flex: 1;
		justify-content: center;
		margin-inline: -16px; /* close up, to the screen's edges; the whole map keeps its margin */
		padding-inline: 16px;
	}

	/* ---------- the list ---------- */
	.list-box summary {
		list-style: none;
		width: fit-content;
		margin: 0 auto;
		display: flex;
		align-items: center;
		gap: 8px;
		height: 40px;
		padding: 0 16px;
		border-radius: 999px;
		cursor: pointer;
		font-size: 14.5px;
	}
	.list-box summary::-webkit-details-marker {
		display: none;
	}
	.list-box summary .icon {
		width: 18px;
		height: 18px;
	}
	.rows {
		max-width: 640px;
		margin: 12px auto 0;
	}
	.row {
		cursor: pointer;
	}
	/* the marked place: blue, as on the map */
	.row.on {
		background: color-mix(in srgb, var(--picked) 10%, var(--panel));
		box-shadow: inset 4px 0 0 var(--picked);
	}
	.lpic {
		width: 42px;
		height: 38px;
		flex: none;
	}
	.ltext {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.ltext b {
		font-size: 15.5px;
		font-weight: 700;
		color: var(--ink);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.sub {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
		font-size: 12.5px;
		font-weight: 600;
		color: var(--ink-3);
	}
	.sub .n {
		white-space: nowrap;
	}
	.go-in {
		width: 18px;
		height: 18px;
		color: var(--ink-3);
	}

	.failed {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 14px;
		padding: 40px 0;
		text-align: center;
		color: var(--on-ground-2);
		font-weight: 600;
	}

	/* ---------- the card under the thumb: a milk panel, the face, the name, the one key ---------- */
	.bar {
		position: fixed;
		left: 12px;
		right: 12px;
		bottom: max(12px, env(safe-area-inset-bottom));
		max-width: 720px;
		margin: 0 auto;
		z-index: 100;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 10px 10px 12px;
		border-radius: var(--r);
		background: var(--panel);
		box-shadow:
			0 3px 0 var(--panel-lip),
			0 14px 28px var(--shade);
		animation: rise 0.35s var(--out) both;
	}
	.bpic {
		width: 52px;
		height: 48px;
		flex: none;
	}
	.what {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 2px;
	}
	.top {
		max-width: 100%;
		font-size: 12.5px;
		font-weight: 600;
		color: var(--ink-3);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	/* a long name ("Qoraqalpog‘iston Respublikasi") wraps once, clear of the key */
	.name {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		max-width: 100%;
		font-size: 18px;
		line-height: 1.15;
		color: var(--ink);
	}
	/* the progress line, short ("1 / 177": the gold bar says what it counts), clear of the key */
	.what :global(.progress) {
		margin-top: 4px;
		max-width: 100%;
	}
	.play {
		flex: none;
		min-width: 128px;
		height: 58px;
		padding: 0 20px;
		font-size: 20px;
	}

	/* a new place pops in */
	.pop-pic {
		animation: pop-pic 0.5s var(--spring);
	}
	@keyframes pop-pic {
		0% {
			transform: scale(0.7);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.pop-pic {
			animation: none;
		}
	}

	@media (max-width: 400px) {
		.face {
			width: 64px;
			height: 56px;
		}
		.bpic {
			width: 44px;
			height: 42px;
		}
		.name {
			font-size: 16.5px;
		}
		.play {
			min-width: 0;
			height: 54px;
			padding: 0 18px;
			font-size: 19px;
		}
	}
	/* a laptop: as the home, the words in a left column (the head, the ready maps, the list) and
	   the map taking all the rest, as tall as the window allows above the card */
	@media (min-width: 961px) {
		.places {
			--map-h: calc(100dvh - 262px);
			max-width: 1280px;
			padding: 18px 40px 124px;
			display: grid;
			grid-template-columns: 380px minmax(0, 1fr);
			grid-template-rows: auto auto 1fr;
			grid-template-areas:
				'head map'
				'ready map'
				'list map';
			column-gap: 48px;
			row-gap: 20px;
			align-items: start;
		}
		.head {
			grid-area: head;
		}
		.ready {
			grid-area: ready;
		}
		.list-box {
			grid-area: list;
		}
		.places > :global(.map),
		.map-skeleton,
		.failed {
			grid-area: map;
		}
		/* the map stays in sight while a long list scrolls */
		.places > :global(.map) {
			position: sticky;
			top: 18px;
			height: calc(100dvh - 222px);
			margin-inline: 0;
			padding-inline: 0;
		}
		.map-skeleton {
			height: calc(100dvh - 222px);
		}
		.face {
			width: 84px;
			height: 72px;
		}
		h1 {
			font-size: 38px;
		}
		.list-box summary {
			margin: 0;
		}
		.rows {
			margin: 12px 0 0;
		}
		/* the three ready maps one under another, each picture beside its name */
		.ready {
			grid-template-columns: minmax(0, 1fr);
		}
		.ready button {
			flex-direction: row;
			justify-content: flex-start;
			min-height: 62px;
			padding: 10px 14px;
			font-size: 15px;
			text-align: left;
		}
		.bar {
			padding: 12px 12px 12px 16px;
			gap: 16px;
		}
		.bpic {
			width: 60px;
			height: 54px;
		}
		.name {
			font-size: 20px;
		}
		.play {
			min-width: 180px;
		}
	}
</style>
