<script lang="ts">
	// The home: one job, start playing. Above the map, what you'll play: the picked places (P1111
	// 1.3). One place is its picture (place-in-parent, in its pick colour) beside its gold tag
	// over its name; two or more are a row of their pictures, each with its ×, and on a laptop a
	// column of rows (picture, name, ×). A tap on a picture flies the map there; the small "+"
	// opens the ready maps (Butun O‘zbekiston, Tarixiy shaharlar). The map of Uzbekistan is where
	// the list changes, in place: a tap goes in, the square goes up, "Tanlash" adds the place on
	// screen (HomeMap). "O‘ynash" and a room with friends play the playable place on screen when
	// it is outside the list. Otherwise they play the list: one map or a mix (POST /v1/maps/mix).
	// Under the key, quietly: a room with friends, opened at once, and a friend's code
	// on a number plate. What a player hasn't earned stays out of sight: the key breathes only
	// before the first game; the count, the last game and "keep your results" show only after
	// one. On a laptop the words and the key stand in a left column and the map takes the rest.
	import { goto, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import GameBar from '#lib/components/GameBar.svelte';
	import Sheet from '#lib/components/Sheet.svelte';
	import HomeMap, { placeDetail } from '#lib/maps/HomeMap.svelte';
	import PlaceInParent from '#lib/maps/PlaceInParent.svelte';
	import {
		addPick,
		COUNTRY,
		listOf,
		pickOfMap,
		removePick,
		within,
		type NewPick,
		type Pick
	} from '#lib/maps/picks.js';
	import { shortName } from '#lib/maps/progress.js';
	import { api, call, ApiError, type GameListItem, type MapSummary } from '#lib/api/client.js';
	import { t, tx, type Key } from '#lib/i18n/index.svelte.js';
	import { ensureSession, session } from '#lib/session.svelte.js';
	import { openSignIn } from '#lib/account.svelte.js';
	import { fmtNum } from '#lib/format.js';
	import { loadChoice, saveChoice, rulesFor, testProviders } from '#lib/rules.js';
	import RulesForm from '#lib/game/RulesForm.svelte';
	import RulesFacts from '#lib/game/RulesFacts.svelte';
	import { showToast } from '#lib/toast.svelte.js';
	import { justMade } from '#lib/room.svelte.js';
	import { unlockAudio } from '#lib/sfx.svelte.js';

	type Mode = 'solo' | 'friends';

	let maps = $state<MapSummary[]>([]); // the ready maps
	let own = $state<MapSummary | null>(null); // a place's own map, or a mix of the list
	let last = $state<GameListItem | null>(null);
	let choice = $state(loadChoice());
	let busy = $state<Mode | null>(null);
	let offline = $state(false);
	// the server asked to wait (too many new players from one address, e.g. friends behind one
	// carrier): say so, and try again by itself
	let waiting = $state(false);
	let retryTimer: ReturnType<typeof setTimeout> | undefined;
	let loaded = $state(false);
	let settingsOpen = $state(false);
	let codeOpen = $state(false);
	let readyOpen = $state(false);

	// the picked places: on screen at once; the home's map follows when the server has answered
	let picks = $state<Pick[]>([]);
	let confirmed: Pick[] = []; // the list the home's map is (a failed change goes back to it)
	let pending = $state<Promise<boolean> | null>(null);
	let seq = 0;
	const ownList = $derived(!!choice.ownList || !!pending);
	let shownPlace = $state<NewPick>();
	const playPlace = $derived.by(() => {
		const place = shownPlace;
		return place && !picks.some((p) => within(place, p)) ? place : undefined;
	});
	const playName = $derived(
		playPlace ? tx(playPlace.name) : picks.map((p) => shortName(tx(p.name))).join(' · ')
	);

	const me = $derived(session.me);
	const banned = $derived(!!me?.user.banned);
	const newPlayer = $derived(loaded && (me?.stats.games ?? 0) === 0);
	const current = $derived(
		own?.slug === choice.map ? own : maps.find((m) => m.slug === choice.map)
	);
	const canPlay = $derived(!!current && !busy && !banned);
	const canMove = $derived(current?.canMove ?? true);
	const progress = $derived(loaded && !newPlayer ? current?.progress : undefined);
	// Butun O‘zbekiston first: "all", then the narrower ones
	const ready = $derived([...maps].sort((a, b) => +(b.slug === COUNTRY) - +(a.slug === COUNTRY)));

	$effect(() => saveChoice($state.snapshot(choice)));

	// again whenever the player on this device changes (signed in, merged, signed out)
	$effect(() => {
		void session.version;
		load_();
		return () => clearTimeout(retryTimer);
	});

	const mapSummary = (slug: string) =>
		call(api().GET('/v1/maps/{slug}', { params: { path: { slug } } }));

	async function load_() {
		try {
			await ensureSession();
			const want = choice.map;
			const revision = seq;
			// a place's own map, or a mix, comes with the list, so the list is right at once
			const [m, h, mine] = await Promise.all([
				call(api().GET('/v1/maps')),
				call(api().GET('/v1/me/games', { params: { query: { limit: 1 } } })),
				want.startsWith('place-') || want.startsWith('mix-')
					? mapSummary(want).catch((e) => {
							if (e instanceof ApiError && e.status === 404) return null; // gone
							throw e;
						})
					: null
			]);
			maps = m;
			last = h.games[0] ?? null;
			offline = false;
			waiting = false;
			if (choice.map === want && seq === revision && !pending) {
				own = mine;
				// A map that left the home: back to the first ready map.
				const cur = mine ?? m.find((x) => x.slug === want) ?? m[0];
				if (cur) {
					choice.map = cur.slug;
					picks = confirmed = listOf(cur, picks);
				}
			}
		} catch (e) {
			waiting = e instanceof ApiError && e.code === 'rate_limited';
			offline = !waiting;
			clearTimeout(retryTimer);
			if (waiting) retryTimer = setTimeout(load_, 20_000);
		}
		loaded = true;
	}

	// a mix's parts come without the places round them: asked once each, for the map's colours
	$effect(() => {
		for (const p of picks)
			if (p.place && !p.path) {
				const slug = p.place;
				placeDetail(slug).then(
					(d) => {
						const path = d.path.map((x) => x.slug);
						picks = picks.map((x) => (x.place === slug && !x.path ? { ...x, path } : x));
					},
					() => {}
				);
			}
	});

	/** The list changes: on screen now; the home's map becomes the one place's map, or the mix of
	 * them all (the server may fold it: its answer is the list). A change that fails goes back. */
	function setList(next: Pick[]) {
		picks = next;
		const my = ++seq;
		const job = (async () => {
			try {
				const m =
					next.length === 1
						? (maps.find((x) => x.slug === next[0].map) ?? (await mapSummary(next[0].map)))
						: await call(api().POST('/v1/maps/mix', { body: { parts: next.map((p) => p.map) } }));
				if (my !== seq) return true;
				if (!maps.some((x) => x.slug === m.slug)) own = m;
				choice.map = m.slug;
				choice.ownList = true;
				picks = confirmed = listOf(m, picks);
				return true;
			} catch (e) {
				if (my !== seq) return false;
				picks = confirmed;
				const code = e instanceof ApiError ? e.code : 'other';
				showToast(t(errorKeys[code] ?? 'err_other'), 3000);
				return false;
			}
		})();
		pending = job;
		job.finally(() => {
			if (pending === job) pending = null;
		});
	}

	/** "Tanlash" on the map, or a ready map from the sheet: into the list. */
	function add(p: NewPick): boolean {
		if (busy) return false;
		const readyMap = maps.find((m) => m.slug === p.map);
		const { list, outcome } = addPick(
			picks,
			readyMap ? { ...p, ...pickOfMap(readyMap) } : p,
			!ownList
		);
		if (outcome === 'full') showToast(t('pickLimit'), 2500);
		if (outcome === 'added') setList(list);
		return outcome !== 'full';
	}
	function remove(map: string) {
		if (busy) return;
		const next = removePick(picks, map);
		if (next !== picks) setList(next);
	}

	/** A pick's picture: its place in its parent; a map of several places, their points on the
	 * country (the historic cities never wear the whole country's picture). */
	const faceOf = (p: { place?: string; face?: string; places?: string[] }) =>
		p.place
			? { place: p.face ?? p.place }
			: { parent: COUNTRY, marks: p.places ?? [], trim: false };
	const colorOf = (p: Pick) => `var(--pick-${p.color})`;
	function pickTag(p?: Pick): string {
		if (p?.map !== 'historic') return tx(p?.top);
		// The official map description lists the cities served by this map.
		const description = p.top ?? maps.find((m) => m.slug === p.map)?.description;
		const cities = description?.uz.split(',').filter((name) => name.trim()).length;
		return cities ? t('nCities', { n: cities }) : '';
	}

	let homeMap = $state<ReturnType<typeof HomeMap>>();

	// an old link to the places page (/places/<slug> → /?at=<slug>): the map opens there
	$effect(() => {
		const at = page.url.searchParams.get('at');
		const map = homeMap;
		if (!at || !map) return;
		let active = true;
		untrack(() => map.flyTo(at)).then((opened) => {
			if (!opened || !active || page.url.searchParams.get('at') !== at) return;
			const url = new URL(page.url.href);
			url.searchParams.delete('at');
			replaceState(url, page.state);
		});
		return () => {
			active = false;
		};
	});

	const errorKeys: Record<string, Key> = {
		no_panorama: 'err_no_panorama',
		daily_cap: 'err_daily_cap',
		network: 'err_network',
		banned: 'bannedText',
		too_many_rooms: 'err_too_many_rooms'
	};

	/** Play what the key named when pressed: alone, or in a new room. */
	async function go(mode: Mode) {
		if (!canPlay) return;
		const place = playPlace;
		busy = mode;
		try {
			if (mode === 'friends') unlockAudio(); // the lobby's join sounds
			while (pending) {
				const revision = seq;
				const ok = await pending;
				if (revision !== seq) continue;
				if (!ok) return;
				break;
			}
			const map = place?.map ?? current?.slug;
			if (!map || banned) return;
			const body = { map, rules: rulesFor(choice, testProviders()) };
			if (mode === 'solo') {
				const game = await call(api().POST('/v1/games', { body }));
				await goto(`/game/${game.id}`);
			} else {
				const room = await call(api().POST('/v1/rooms', { body }));
				justMade.code = room.code;
				justMade.at = Date.now();
				await goto(`/room/${room.code}`);
			}
		} catch (e) {
			const code = e instanceof ApiError ? e.code : 'other';
			showToast(t(errorKeys[code] ?? 'err_other'), 3500);
		} finally {
			busy = null;
		}
	}

	function greeting(): Key {
		const h = new Date().getHours();
		return h < 5 ? 'goodNight' : h < 11 ? 'goodMorning' : h < 18 ? 'goodDay' : 'goodEvening';
	}

	/** A string with its numbers apart, so they can be drawn in the game's lettering. */
	function withNumbers(key: Key, nums: Record<string, number>) {
		const names = Object.keys(nums);
		const marked = Object.fromEntries(names.map((k, i) => [k, `\u0000${i}\u0000`]));
		return t(key, marked)
			.split('\u0000')
			.map((s, i) => (i % 2 ? { num: fmtNum(nums[names[+s]]) } : { text: s }));
	}

	/** Runs `fit` now, when the lettering's font arrives (it swaps in after the first paint and
	 * is wider than the stand-in), and when the box gets wider or narrower. */
	function refit(el: HTMLElement, fit: () => void) {
		// a size is measured right after it is set: no transition may hold the old one (with
		// reduced motion, app.css gives every property of every element a 0.01 ms transition)
		el.style.transitionProperty = 'none';
		const box = el.parentElement!;
		let width = box.clientWidth;
		fit();
		document.fonts?.ready.then(fit);
		document.fonts?.addEventListener('loadingdone', fit);
		const seen = new ResizeObserver(() => {
			if (box.clientWidth !== width) fit();
			width = box.clientWidth;
		});
		seen.observe(box);
		return {
			update: fit,
			destroy() {
				seen.disconnect();
				document.fonts?.removeEventListener('loadingdone', fit);
			}
		};
	}

	/** The place's name as large as fits: one line on a phone, two at most on a laptop (where
	 * the column allows wrapping), so nothing round it moves when the name changes. */
	function fitName(el: HTMLElement, _text?: string) {
		const box = el.parentElement!;
		return refit(el, () => {
			el.style.fontSize = '';
			const cs = getComputedStyle(el);
			let size = parseFloat(cs.fontSize);
			const lines = cs.whiteSpace === 'nowrap' ? 1 : 2;
			const lh = parseFloat(cs.lineHeight) / size || 1.05;
			const fits = () =>
				lines === 1
					? el.offsetWidth <= box.clientWidth - 8
					: el.offsetHeight <= size * lh * lines + 2 && el.offsetWidth <= box.clientWidth;
			while (!fits() && size > 16) {
				size -= 1;
				el.style.fontSize = `${size}px`;
			}
		});
	}

	/** Keep the small gold tag on one line. */
	function fitTag(el: HTMLElement, _text?: string) {
		return refit(el, () => {
			el.style.fontSize = '';
			el.style.letterSpacing = '';
			if (el.scrollWidth > el.clientWidth) el.style.letterSpacing = '0.04em';
			let size = parseFloat(getComputedStyle(el).fontSize);
			while (el.scrollWidth > el.clientWidth && size > 10) {
				size -= 0.5;
				el.style.fontSize = `${size}px`;
			}
		});
	}

	// ---------- a friend's room, by its code ----------
	let code = $state('');
	let codeInput = $state<HTMLInputElement>();
	const codeOk = $derived(/^[A-Za-z2-9]{5}$/.test(code.trim()));
	function joinRoom(e?: SubmitEvent) {
		e?.preventDefault();
		if (codeOk) goto(`/room/${code.trim().toUpperCase()}`);
	}
	// five letters typed: in you go, no button needed
	$effect(() => {
		if (codeOk) joinRoom();
	});
	$effect(() => {
		if (codeOpen) codeInput?.focus();
	});
</script>

<svelte:head><title>GeoShafaq — {t('heroTitle')}</title></svelte:head>

<div class="home">
	<GameBar />

	<main class="grid">
		<p class="greet">
			{t(greeting())}{#if me}, <a href="/me">{me.user.name}</a>{:else}!{/if}
		</p>

		<!-- what you'll play, the picked places: one is its picture beside a gold tag over its
		     name; several are a row of pictures (a laptop: rows with their names), each with its ×.
		     A tap on one flies the map there; "+" opens the ready maps -->
		<header class="place" class:many={picks.length > 1}>
			{#if picks.length > 1}
				<ul class="picks">
					{#each picks as p (p.map)}
						<li class="pk" style:--pc={colorOf(p)}>
							<button class="pk-go" aria-label={tx(p.name)} onclick={() => homeMap?.flyTo(p.place)}>
								<span class="pk-pic" aria-hidden="true"
									><PlaceInParent {...faceOf(p)} color={colorOf(p)} /></span
								>
								<span class="pk-name">{tx(p.name)}</span>
							</button>
							<button
								class="pk-x"
								aria-label={t('removePick', { name: tx(p.name) })}
								disabled={!!busy}
								onclick={() => remove(p.map)}
							>
								<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" /></svg>
							</button>
						</li>
					{/each}
				</ul>
			{:else}
				{@const one = picks[0]}
			{@const tag = pickTag(one)}
				{#key one?.map}
					{#if one}
						<!-- the map's face, the one it wears on every screen (P1111 §5), in its pick
						     colour: Tashkent's streets are Tashkent in its region -->
						<button
							class="pic pop-pic"
							aria-label={tx(one.name)}
							onclick={() => homeMap?.flyTo(one.place)}
						>
							<PlaceInParent {...faceOf(one)} color={colorOf(one)} />
						</button>
						<div class="words">
							{#if tag}
								<span class="kick d pop" use:fitTag={tag}>{tag}</span>
							{/if}
							<div class="tw">
								<h1 class="title d float pop" use:fitName={tx(one.name)}>{tx(one.name)}</h1>
							</div>
						</div>
					{:else}
						<!-- the same height while it loads: nothing jumps -->
						<span class="pic" aria-hidden="true"></span>
					{/if}
				{/key}
			{/if}
			{#if picks.length}
				<button
					class="more chip"
					aria-label={t('addMaps')}
					disabled={!!busy}
					onclick={() => (readyOpen = true)}
				>
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
					<span class="more-l">{t('addMaps')}</span>
				</button>
			{/if}
		</header>

		{#if waiting || offline || banned}
			<div class="state">
				{#if waiting}
					<div class="note">
						<p>{t('waitABit')}</p>
						<span class="spinner" aria-hidden="true"></span>
					</div>
				{:else if offline}
					<div class="note bad">
						<p>{t('err_network')}</p>
						<button class="chip retry" onclick={load_}>{t('retry')}</button>
					</div>
				{/if}
				{#if banned}
					<div class="note bad banned">
						<b>{t('bannedTitle')}</b>
						<p>{t('bannedText')}</p>
					</div>
				{/if}
			</div>
		{/if}

		<!-- the heart: the map; a tap zooms in, in place; "Tanlash" adds the place on screen -->
		<HomeMap
			bind:this={homeMap}
			bind:shownPlace
			{picks}
			{ownList}
			locked={!!busy}
			onpick={add}
			onunpick={remove}
		/>

		<!-- how much is known here: one gold line, only after the first game -->
		{#if progress && progress.unit === 'street'}
			<a class="count" href="/me" aria-label={t('myStreets')}>
				{#if progress.learned}
					<svg viewBox="0 0 24 24" aria-hidden="true"
						><path
							d="M12 2.2l2.9 6.2 6.8.8-5 4.7 1.3 6.7L12 17.3 6 20.6l1.3-6.7-5-4.7 6.8-.8z"
						/></svg
					>
					<b class="d">{fmtNum(progress.learned)} / {fmtNum(progress.total)}</b>
					<span>{t('streetsLearnedShort')}</span>
				{:else}
					<span>{t('firstLearnHint')}</span>
				{/if}
			</a>
		{:else if progress && progress.unit !== 'spot'}
			<p class="count">
				<svg viewBox="0 0 24 24" aria-hidden="true"
					><path
						d="M12 2.2l2.9 6.2 6.8.8-5 4.7 1.3 6.7L12 17.3 6 20.6l1.3-6.7-5-4.7 6.8-.8z"
					/></svg
				>
				{#each withNumbers('learnedOf', { n: progress.learned, m: progress.total }) as part, i (i)}
					{#if 'num' in part}<b class="d">{part.num}</b>{:else}<span>{part.text}</span>{/if}
				{/each}
			</p>
		{:else if loaded && !newPlayer && current}
			<p class="count quiet">{t('nSpots', { n: current.panoramas })}</p>
		{/if}

		<button class="rules" onclick={() => (settingsOpen = true)} aria-label={t('setup')}>
			<RulesFacts {choice} />
			<svg viewBox="0 0 24 24" class="chev" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
		</button>

		<!-- THE key -->
		<div class="go">
			<button
				class="btn btn-primary play"
				class:breathe={newPlayer && !busy}
				disabled={!canPlay}
				onclick={() => go('solo')}
			>
				{#if busy === 'solo'}
					<span class="spinner" aria-hidden="true"></span>
				{/if}
				<span class="play-text">
					<span class="lbl">{t('play')}</span>
					{#if playName}<span class="play-name">{playName}</span>{/if}
				</span>
			</button>
		</div>

		<!-- quiet, side by side: friends, and a friend's code -->
		<div class="chips">
			<button class="chip" disabled={!canPlay} onclick={() => go('friends')}>
				{#if busy === 'friends'}
					<span class="spinner small"></span>
				{:else}
					<svg viewBox="0 0 24 24" aria-hidden="true"
						><circle cx="9" cy="8" r="3.5" /><path
							d="M2.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5"
						/><circle cx="17" cy="9" r="2.6" /><path d="M17 14.5c2.4 0 4.1 1.5 4.6 4" /></svg
					>
				{/if}
				{t('playFriends')}
			</button>
			{#if codeOpen}
				<form class="join" onsubmit={joinRoom}>
					<div class="plate">
						<input
							aria-label={t('haveCode')}
							bind:this={codeInput}
							bind:value={code}
							placeholder="·····"
							maxlength="5"
							autocomplete="off"
							autocapitalize="characters"
							spellcheck="false"
							enterkeyhint="go"
						/>
						<span class="uz" aria-hidden="true"><i></i><b>UZ</b></span>
					</div>
				</form>
			{:else}
				<button class="chip" onclick={() => (codeOpen = true)}>
					<svg viewBox="0 0 24 24" aria-hidden="true"
						><rect x="3" y="6" width="18" height="12" rx="3" /><path
							d="M7 12h.01M11 12h.01M15 12h.01"
						/></svg
					>
					{t('haveCode')}
				</button>
			{/if}
		</div>

		{#if loaded && !newPlayer && last}
			<div class="last">
				<a href={`/game/${last.id}`}>
					{#each withNumbers('homeLast', { score: last.total }) as part, i (i)}
						{#if 'num' in part}<b class="d">{part.num}</b>{:else}{part.text}{/if}
					{/each}
				</a>
				{#if me?.user.guest}
					<p>
						{t('saveResults')} ·
						<button class="save" onclick={() => openSignIn('save')}>
							<svg viewBox="0 0 24 24" aria-hidden="true"
								><path d="m21 4-18 7.5 6 2.2M21 4l-3.5 16-8.5-6.3M21 4 9 13.7v5.8l3.2-3.3" /></svg
							>Telegram</button
						>
					</p>
				{/if}
			</div>
		{/if}

		<footer class="credits">{t('credits')}</footer>
	</main>
</div>

<!-- the ready maps, each with its face: a tap adds it to the list -->
<Sheet open={readyOpen} onclose={() => (readyOpen = false)} title={t('addMaps')}>
	<div class="ready">
		{#each ready as m (m.slug)}
			{@const inList = ownList ? picks.find((p) => p.map === m.slug) : undefined}
			<button
				class="rrow"
				class:on={!!inList}
				disabled={!!busy || !!inList}
				style:--pc={inList ? colorOf(inList) : undefined}
				onclick={() => {
					if (add(pickOfMap(m))) readyOpen = false;
				}}
			>
				<span class="rpic" aria-hidden="true"
					><PlaceInParent
						{...faceOf(pickOfMap(m))}
						on="panel"
						color={inList ? colorOf(inList) : undefined}
					/></span
				>
				<span class="rtext">
					<b>{tx(m.name)}</b>
					<span>{tx(m.description)}</span>
				</span>
				{#if inList}
					<svg class="tick" viewBox="0 0 24 24" aria-hidden="true"
						><path d="M5 12.5l4.5 4.5L19 7.5" /></svg
					>
				{/if}
			</button>
		{/each}
	</div>
</Sheet>

<Sheet open={settingsOpen} onclose={() => (settingsOpen = false)} title={t('setup')}>
	<RulesForm bind:choice {canMove} />
	<button class="btn btn-primary done" onclick={() => (settingsOpen = false)}
		><span class="lbl">{t('ready')}</span></button
	>
</Sheet>

<style>
	/* a phone: one column the height of the screen; the map takes what the rest leaves */
	.home {
		min-height: 100dvh;
		max-width: 560px;
		margin: 0 auto;
		padding: 0 16px calc(8px + env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
	}
	.grid {
		flex: 1;
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		grid-template-rows: auto auto auto minmax(190px, 1fr) auto auto auto auto auto auto;
		grid-template-areas: 'greet' 'place' 'state' 'hero' 'count' 'rules' 'go' 'chips' 'last' 'credits';
	}
	.greet {
		grid-area: greet;
		font-size: 15px;
		font-weight: 600;
		color: var(--on-ground-2);
	}
	.greet a {
		color: var(--on-ground);
		font-weight: 700;
		text-decoration: none;
	}
	.greet a:hover {
		text-decoration: underline;
	}

	/* what you'll play: one place's picture beside a gold tag over its name, which floats on the
	   stacked shadow; several places, a row of pictures. The block keeps one height whatever the
	   list: nothing round it moves */
	.place {
		grid-area: place;
		display: flex;
		align-items: center;
		gap: 12px;
		height: 86px;
		margin-top: 6px;
		min-width: 0;
	}
	.pic {
		width: 84px;
		height: 72px;
		flex: none;
		padding: 0;
		border: none;
		background: none;
		/* milk tiles on the ground, the place in its pick colour, like the map */
		--pip-tile: var(--tile-a);
		filter: drop-shadow(0 3px 0 var(--map-shadow)) drop-shadow(0 0 8px var(--map-glow));
	}
	button.pic:active {
		transform: scale(0.95);
	}
	/* the picked places, a row of their pictures; each × a small milk coin on its corner (a
	   finger's 34 px round it) */
	.picks {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 8px;
		list-style: none;
	}
	.pk {
		position: relative;
		flex: 0 1 62px;
		min-width: 0;
		--pip-tile: var(--tile-a);
	}
	.pk-go {
		display: block;
		width: 100%;
		padding: 0;
		border: none;
		background: none;
		color: inherit;
		transition: transform 0.12s var(--out);
	}
	.pk-go:active {
		transform: scale(0.94);
	}
	.pk-pic {
		display: block;
		height: 54px;
		filter: drop-shadow(0 3px 0 var(--map-shadow)) drop-shadow(0 0 6px var(--map-glow));
		animation: pop-pic 0.45s var(--spring);
	}
	.pk-name {
		display: none;
	}
	.pk-x {
		position: absolute;
		top: -8px;
		right: -6px;
		width: 22px;
		height: 22px;
		padding: 0;
		border: none;
		border-radius: 50%;
		background: var(--panel);
		color: var(--ink);
		display: grid;
		place-items: center;
		box-shadow:
			0 0 0 1.5px color-mix(in srgb, var(--pc) 70%, transparent),
			0 2px 0 var(--stack-2);
	}
	.pk-x::before {
		content: '';
		position: absolute;
		inset: -6px;
		border-radius: 50%;
	}
	.pk-x svg,
	.more svg {
		width: 13px;
		height: 13px;
		fill: none;
		stroke: currentColor;
		stroke-width: 3.2;
		stroke-linecap: round;
	}
	.pk-x:active {
		transform: scale(0.9);
	}
	/* "+": the ready maps; a round glass key at the end of the row */
	.more {
		flex: none;
		width: 40px;
		height: 40px;
		margin-left: auto;
		border-radius: 50%;
		display: grid;
		place-items: center;
		transition: transform 0.12s var(--out);
	}
	.more:active {
		transform: scale(0.92);
	}
	.more svg {
		width: 18px;
		height: 18px;
		stroke-width: 2.8;
	}
	.more-l {
		display: none;
	}
	.words {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 6px;
	}
	/* .words: past the lettering's own spacing (.d) */
	.words .kick {
		max-width: 100%;
		height: 24px;
		padding: 0 10px;
		border-radius: 7px;
		background: linear-gradient(180deg, var(--kick-a), var(--kick-b));
		box-shadow: 0 2px 0 var(--gold-lo);
		color: var(--kick-ink);
		font-size: 12.5px;
		line-height: 24px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.tw {
		width: 100%;
		min-width: 0;
		white-space: nowrap;
	}
	.title {
		margin: 0;
		font-size: 34px;
		line-height: 1.05;
		color: var(--on-ground);
	}
	/* a new place pops in (the lean stays in the keyframes: it is the lettering's transform) */
	.pop {
		animation: pop 0.5s var(--spring);
	}
	@keyframes pop {
		0% {
			transform: var(--lean) scale(0.86);
			opacity: 0.4;
		}
		100% {
			transform: var(--lean) scale(1);
			opacity: 1;
		}
	}
	.pop-pic {
		animation: pop-pic 0.5s var(--spring);
	}
	@keyframes pop-pic {
		0% {
			transform: scale(0.7);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.pop,
		.pop-pic {
			animation: none;
		}
	}

	.state {
		grid-area: state;
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-top: 14px;
	}
	.note {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 10px;
		padding: 10px 12px 10px 14px;
		border-radius: var(--r-m);
		background: var(--chip-bg);
		box-shadow: inset 0 0 0 1px var(--chip-line);
		font-weight: 600;
		font-size: 15px;
	}
	.note.bad {
		background: color-mix(in srgb, var(--red) 30%, transparent);
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--red) 55%, transparent);
	}
	.banned {
		flex-direction: column;
		align-items: flex-start;
		gap: 2px;
		font-size: 14px;
	}
	.banned b {
		font-family: var(--f-disp);
		font-weight: 800;
	}
	.retry {
		height: 40px;
		padding: 0 16px;
		border-radius: var(--r-s);
	}

	/* the map: a little past the page's edges on a phone, as in the look lab */
	.grid > :global(.mapbox) {
		grid-area: hero;
		margin: 6px -10px 0;
	}

	/* how much is known: gold on a quiet glass pill, so it reads on the day's turquoise too */
	.count {
		grid-area: count;
		justify-self: center;
		display: inline-flex;
		align-items: center;
		gap: 7px;
		max-width: 100%;
		margin-top: 8px;
		padding: 4px 14px 4px 11px;
		border-radius: 999px;
		background: var(--chip-bg);
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--gold) 40%, transparent);
		color: var(--gold-text);
		font-weight: 700;
		font-size: 15px;
		text-decoration: none;
		white-space: nowrap;
	}
	.count b {
		font-size: 21px;
		color: var(--gold-hi);
		text-shadow: 0 2px 0 var(--stack);
	}
	.count svg {
		width: 19px;
		height: 19px;
		flex: none;
		fill: var(--gold);
		filter: drop-shadow(0 2px 0 var(--stack));
	}
	.count.quiet {
		color: var(--on-ground-2);
		background: none;
		box-shadow: none;
		font-weight: 600;
	}
	a.count:hover {
		background: color-mix(in srgb, var(--chip-bg), #000 12%);
	}

	/* how: one quiet line; a tap opens the settings */
	.rules {
		grid-area: rules;
		justify-self: center;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		min-height: 40px;
		margin: 6px 0 8px;
		padding: 0 10px;
		border: none;
		border-radius: var(--r-s);
		background: none;
		color: var(--on-ground-2);
		font-size: 15px;
		transition: background 0.15s;
	}
	.rules:hover {
		background: var(--chip-bg);
	}
	/* three facts with dots between them, as one line: "Oson · 5 raund · vaqtsiz" */
	.grid .rules :global(.facts) {
		gap: 2px 0;
		justify-content: center;
	}
	.rules :global(.fact .icon) {
		display: none;
	}
	/* the fact's own gap stands after the dot: one margin before it, the same space each side */
	.rules :global(.fact + .fact::before) {
		content: '·';
		margin-left: 6px;
		opacity: 0.8;
	}
	.rules :global(.diff) {
		box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.22);
	}
	.chev {
		width: 16px;
		height: 16px;
		flex: none;
		fill: none;
		stroke: currentColor;
		stroke-width: 2.4;
		stroke-linecap: round;
		stroke-linejoin: round;
		opacity: 0.8;
	}

	/* THE key */
	.go {
		grid-area: go;
	}
	.play {
		width: 100%;
	}
	.play-text {
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		line-height: 1.1;
	}
	.play-name {
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font: 600 13px/1.25 var(--f-text);
		letter-spacing: normal;
		text-transform: none;
		opacity: 0.9;
	}
	.breathe {
		animation: big-breathe 1.8s ease-in-out infinite;
	}
	@keyframes big-breathe {
		50% {
			transform: scale(1.025);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.breathe {
			animation: none;
		}
	}

	/* friends and a code: two glass chips */
	.chips {
		grid-area: chips;
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 10px;
		margin-top: 16px;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		height: 46px;
		padding: 0 14px;
		border-radius: var(--r-s);
		font-size: 15px;
		white-space: nowrap;
		transition:
			background 0.15s,
			transform 0.12s var(--out);
	}
	.chips .chip {
		flex: 1 1 auto;
	}
	.chip:hover:not(:disabled) {
		background: color-mix(in srgb, var(--chip-bg), #fff 10%);
	}
	.chip:active:not(:disabled) {
		transform: translateY(2px);
	}
	.chip:disabled {
		opacity: 0.55;
	}
	/* a narrow phone: the two chips keep one row without their icons */
	@media (max-width: 379px) {
		.chips {
			gap: 8px;
		}
		.chips .chip {
			padding: 0 10px;
			font-size: 14px;
		}
		.chips .chip svg {
			display: none;
		}
	}
	.chip svg {
		width: 18px;
		height: 18px;
		flex: none;
		fill: none;
		stroke: currentColor;
		stroke-width: 2.2;
		stroke-linecap: round;
		stroke-linejoin: round;
		opacity: 0.9;
	}

	/* a friend's code, typed onto a car's number plate: white, by day and by night */
	.join {
		flex: 1 1 200px;
		max-width: 300px;
		animation: pop 0.35s var(--spring);
	}
	.plate {
		display: flex;
		align-items: stretch;
		height: 52px;
		border-radius: 10px;
		background: #fff;
		color: #111;
		border: 3px solid #111;
		box-shadow:
			0 4px 0 var(--stack),
			0 10px 20px rgba(4, 11, 46, 0.3);
		overflow: hidden;
	}
	.plate input {
		flex: 1;
		min-width: 0;
		border: none;
		background: transparent;
		color: #111;
		padding: 0 10px;
		font-family: var(--f-disp);
		font-weight: 900;
		font-size: 28px;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		text-align: center;
		outline: none;
	}
	.plate input::placeholder {
		color: #c4c8d4;
	}
	.plate:focus-within {
		box-shadow:
			0 4px 0 var(--stack),
			0 0 0 4px var(--gold);
	}
	.uz {
		width: 46px;
		border-left: 3px solid #111;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 3px;
	}
	.uz i {
		width: 28px;
		height: 16px;
		background: linear-gradient(
			to bottom,
			#0099b5 0 33%,
			#ce1126 33% 37%,
			#fff 37% 63%,
			#ce1126 63% 67%,
			#1eb53a 67%
		);
		box-shadow: 0 0 0 1px #111;
	}
	.uz b {
		font-family: var(--f-disp);
		font-weight: 900;
		font-size: 11px;
	}

	/* after the first game: the last one, and a guest's way to keep it */
	.last {
		grid-area: last;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		margin-top: 12px;
		font-size: 14px;
		color: var(--on-ground-2);
	}
	.last a {
		color: inherit;
		text-decoration: none;
		padding: 2px 6px;
	}
	.last a b {
		font-size: 16px;
		color: var(--on-ground);
	}
	.last a:hover {
		color: var(--on-ground);
	}
	.save {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		min-height: 32px;
		padding: 0;
		border: none;
		background: none;
		color: var(--on-ground);
		font-weight: 700;
		font-size: 14px;
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.save svg {
		width: 16px;
		height: 16px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linejoin: round;
	}

	.credits {
		grid-area: credits;
		margin-top: 14px;
		text-align: center;
		font-size: 11px;
		line-height: 1.35;
		color: var(--on-ground-3);
	}

	.spinner {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		border: 3px solid rgba(255, 255, 255, 0.3);
		border-top-color: #fff;
		animation: spin 0.9s linear infinite;
	}
	.spinner.small {
		width: 16px;
		height: 16px;
		border-width: 2.5px;
	}
	@keyframes spin {
		to {
			transform: rotate(1turn);
		}
	}

	.done {
		width: 100%;
		margin-top: 22px;
	}

	/* the ready maps, in the sheet: milk-2 rows, each its face, name and what it is */
	.ready {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.rrow {
		display: flex;
		align-items: center;
		gap: 14px;
		min-height: 64px;
		padding: 8px 14px 8px 10px;
		border: none;
		border-radius: var(--r-s);
		background: var(--panel-2);
		color: var(--ink);
		text-align: left;
		box-shadow: inset 0 0 0 1.5px var(--panel-line);
		transition: transform 0.12s var(--out);
	}
	.rrow:active:not(:disabled) {
		transform: scale(0.98);
	}
	.rrow.on {
		box-shadow: inset 0 0 0 2.5px var(--pc);
	}
	.rpic {
		width: 58px;
		height: 50px;
		flex: none;
	}
	.rtext {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.rtext b {
		font-size: 17px;
		line-height: 1.25;
	}
	.rtext span {
		font-size: 13.5px;
		color: var(--ink-2);
	}
	.tick {
		width: 24px;
		height: 24px;
		flex: none;
		fill: none;
		stroke: var(--pc);
		stroke-width: 3.2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	/* a short phone: tighter; if it still doesn't fit, the map keeps its size and the page
	   scrolls under the key (the last game and the credits go below the fold, never the key) */
	@media (max-height: 700px) and (max-width: 960px) {
		/* the map stays big enough to tap ("Tanlash" needs its corner): the page scrolls a
		   little sooner for a returning player, the key still in sight */
		.grid {
			grid-template-rows: auto auto auto minmax(230px, 1fr) auto auto auto auto auto auto;
		}
		.place {
			height: 76px;
			margin-top: 2px;
		}
		.pic {
			width: 74px;
			height: 64px;
		}
		.title {
			font-size: 30px;
		}
		.chips {
			margin-top: 10px;
		}
		.credits {
			margin-top: 8px;
		}
	}

	/* a laptop: the left column carries the words and the key; the map takes all the rest, its
	   square at its top left and "Tanlash" at its bottom right */
	@media (min-width: 961px) {
		.home {
			max-width: none;
			height: 100dvh;
			min-height: 600px;
			padding: 0 40px 18px;
		}
		.grid {
			min-height: 0;
			grid-template-columns: 400px minmax(0, 1fr);
			column-gap: 28px;
			grid-template-rows: 1fr auto auto auto auto auto auto auto auto 1fr auto;
			grid-template-areas:
				'. hero'
				'greet hero'
				'place hero'
				'state hero'
				'count hero'
				'rules hero'
				'go hero'
				'chips hero'
				'last hero'
				'. hero'
				'credits hero';
		}
		.greet {
			font-size: 17px;
		}
		.place {
			height: auto;
			min-height: 128px;
			margin-top: 14px;
			display: grid;
			grid-template-columns: auto minmax(0, 1fr);
			column-gap: 14px;
			row-gap: 6px;
		}
		.pic {
			width: 96px;
			height: 96px;
		}
		/* several places: a column of rows, picture, name, × */
		.picks {
			grid-column: 1 / -1;
			flex-direction: column;
			align-items: stretch;
			gap: 2px;
			max-height: min(400px, 46vh);
			overflow-y: auto;
			margin: 0 -8px;
			padding: 2px 0;
		}
		.pk {
			flex: none;
			display: flex;
			align-items: center;
			gap: 6px;
		}
		.pk-go {
			flex: 1;
			min-width: 0;
			display: flex;
			align-items: center;
			gap: 12px;
			padding: 5px 8px;
			border-radius: var(--r-s);
			text-align: left;
			transition: background 0.15s;
		}
		.pk-go:hover {
			background: var(--chip-bg);
		}
		.pk-go:active {
			transform: none;
		}
		.pk-pic {
			width: 46px;
			height: 40px;
			flex: none;
		}
		.pk-name {
			display: block;
			min-width: 0;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
			color: var(--on-ground);
			font-family: var(--f-disp);
			font-weight: 900;
			font-size: 19px;
		}
		.pk-x {
			position: relative;
			top: auto;
			right: auto;
			width: 34px;
			height: 34px;
			flex: none;
			background: var(--chip-bg);
			color: var(--on-ground);
			box-shadow: inset 0 0 0 1.5px var(--chip-line);
		}
		.pk-x::before {
			display: none;
		}
		/* "+ Tayyor xaritalar": a quiet row under the list */
		.more {
			grid-column: 1 / -1;
			justify-self: start;
			width: auto;
			height: 40px;
			margin: 4px 0 0 -6px;
			padding: 0 14px 0 10px;
			border-radius: var(--r-s);
			display: inline-flex;
			gap: 8px;
			background: none;
			box-shadow: none;
			color: var(--on-ground-2);
			font-weight: 700;
			font-size: 15px;
		}
		.more:hover {
			background: var(--chip-bg);
		}
		.more-l {
			display: inline;
		}
		.more svg {
			width: 16px;
			height: 16px;
		}
		.tw {
			white-space: normal;
		}
		.title {
			font-size: 50px;
			line-height: 1.02;
		}
		.grid > :global(.mapbox) {
			margin: 0 0 12px;
		}
		.count {
			justify-self: start;
			margin-top: 14px;
			margin-left: -4px;
		}
		.rules {
			justify-self: start;
			margin: 16px 0 18px -10px;
		}
		.chips {
			justify-content: flex-start;
			margin-top: 24px;
		}
		.chips .chip {
			flex: none;
			padding: 0 16px;
		}
		.last {
			align-items: flex-start;
			margin-top: 16px;
		}
		.last a {
			padding: 2px 0;
		}
		.credits {
			text-align: left;
		}
	}
</style>
