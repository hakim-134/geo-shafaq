<script lang="ts">
	// The home: one job, start playing. Above the map, where you'll play: the place's picture
	// (place-in-parent) beside its gold tag over its name. The map of Uzbekistan is where you
	// change it, in place: a tap zooms in, a tap marks, "Shu joyni tanlash" chooses (HomeMap).
	// One quiet line says how; "O‘ynash" puts you on a street. Under it, quietly: a room with
	// friends, opened at once, and a friend's code on a number plate. What a player hasn't
	// earned stays out of sight: the key breathes only before the first game; the count, the
	// last game and "keep your results" show only after one. On a laptop the words and the key
	// stand in a left column and the map takes all the rest.
	import { goto } from '$app/navigation';
	import GameBar from '#lib/components/GameBar.svelte';
	import Sheet from '#lib/components/Sheet.svelte';
	import HomeMap from '#lib/maps/HomeMap.svelte';
	import PlaceInParent from '#lib/maps/PlaceInParent.svelte';
	import { api, call, ApiError, type GameListItem, type MapSummary } from '#lib/api/client.js';
	import { t, tx, type Key } from '#lib/i18n/index.svelte.js';
	import { ensureSession, session } from '#lib/session.svelte.js';
	import { openSignIn } from '#lib/account.svelte.js';
	import { fmtNum } from '#lib/format.js';
	import { newLook } from '#lib/look.svelte.js';
	import { loadChoice, saveChoice, rulesFor, testProviders } from '#lib/rules.js';
	import RulesForm from '#lib/game/RulesForm.svelte';
	import RulesFacts from '#lib/game/RulesFacts.svelte';
	import { showToast } from '#lib/toast.svelte.js';
	import { justMade } from '#lib/room.svelte.js';
	import { unlockAudio } from '#lib/sfx.svelte.js';

	newLook();

	type Mode = 'solo' | 'friends';

	let maps = $state<MapSummary[]>([]);
	let placeMap = $state<MapSummary | null>(null); // a place's own map, chosen on the map
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

	const me = $derived(session.me);
	const banned = $derived(!!me?.user.banned);
	const newPlayer = $derived(loaded && (me?.stats.games ?? 0) === 0);
	const current = $derived(
		placeMap?.slug === choice.map ? placeMap : (maps.find((m) => m.slug === choice.map) ?? maps[0])
	);
	const canMove = $derived(current?.canMove ?? true);
	const progress = $derived(loaded && !newPlayer ? current?.progress : undefined);

	// the place's picture (P1111 §5): a region in Uzbekistan; a district or a town in its region
	// (Tashkent's districts in Tashkent); Tashkent's streets: the tiny city ringed in Uzbekistan;
	// the whole country: all of it; a ready map of several places: their points in Uzbekistan
	const picture = $derived.by(() => {
		const m = current;
		if (!m) return null;
		const p = m.place;
		if (!p) return { parent: 'uzbekistan', fill: [], whole: false, marks: m.places ?? [] };
		if (p.kind === 'country') return { parent: p.slug, fill: [], whole: true, marks: [] };
		return { parent: m.parent?.slug ?? 'uzbekistan', fill: [p.slug], whole: false, marks: [] };
	});

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
			// a place's own map comes with the list, so the name above the map is right at once
			const [m, h, own] = await Promise.all([
				call(api().GET('/v1/maps')),
				call(api().GET('/v1/me/games', { params: { query: { limit: 1 } } })),
				want.startsWith('place-')
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
			placeMap = own;
			// a map that left the home (a place gone, or "Toshkent"): back to the first one
			if (!own && !m.some((x) => x.slug === choice.map) && m.length) choice.map = m[0].slug;
		} catch (e) {
			waiting = e instanceof ApiError && e.code === 'rate_limited';
			offline = !waiting;
			clearTimeout(retryTimer);
			if (waiting) retryTimer = setTimeout(load_, 20_000);
		}
		loaded = true;
	}

	/** The map's gold button: this map plays from now on (its summary first, so the name, the
	 * count and the rules change together). */
	let homeMap = $state<ReturnType<typeof HomeMap>>();

	async function choose(slug: string): Promise<boolean> {
		if (slug === choice.map) return true;
		if (!maps.some((m) => m.slug === slug)) {
			try {
				placeMap = await mapSummary(slug);
			} catch (e) {
				const code = e instanceof ApiError ? e.code : 'other';
				showToast(t(errorKeys[code] ?? 'err_other'), 3000);
				return false;
			}
		}
		choice.map = slug;
		return true;
	}

	const errorKeys: Record<string, Key> = {
		no_panorama: 'err_no_panorama',
		daily_cap: 'err_daily_cap',
		network: 'err_network',
		banned: 'bannedText',
		too_many_rooms: 'err_too_many_rooms'
	};

	/** Play the shown place now: alone, or in a new room with the home's settings. */
	async function go(mode: Mode) {
		if (busy || banned || !current) return;
		busy = mode;
		// a district marked blue on the map is what the player is looking at: it plays
		if (homeMap && !(await homeMap.takeMarked())) {
			busy = null;
			return;
		}
		const body = { map: current.slug, rules: rulesFor(choice, testProviders()) };
		try {
			if (mode === 'solo') {
				const game = await call(api().POST('/v1/games', { body }));
				goto(`/game/${game.id}`);
			} else {
				unlockAudio(); // the lobby's join sounds
				const room = await call(api().POST('/v1/rooms', { body }));
				justMade.code = room.code;
				justMade.at = Date.now();
				goto(`/room/${room.code}`);
			}
		} catch (e) {
			busy = null;
			const code = e instanceof ApiError ? e.code : 'other';
			showToast(t(errorKeys[code] ?? 'err_other'), 3500);
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

	/** The small gold tag on one line: a long one ("Samarqand, Buxoro, Xiva, Shahrisabz") draws
	 * its letters closer, then smaller, down to 10 px, before it is cut. */
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

		<!-- where you'll play: its picture beside a gold tag over its name -->
		<header class="place">
			{#key current?.slug}
				{#if current && picture}
					<span class="pic pop-pic" aria-hidden="true">
						<PlaceInParent
							parent={picture.parent}
							fill={picture.fill}
							whole={picture.whole}
							marks={picture.marks}
							trim={false}
						/>
					</span>
					<div class="words">
						<span class="kick d pop" use:fitTag={tx(current.description)}
							>{tx(current.description)}</span
						>
						<div class="tw">
							<h1 class="title d float pop" use:fitName={tx(current.name)}>{tx(current.name)}</h1>
						</div>
					</div>
				{:else}
					<!-- the same height while it loads: nothing jumps -->
					<span class="pic" aria-hidden="true"></span>
				{/if}
			{/key}
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

		<!-- the heart: the map; a tap zooms in, in place; its gold button chooses -->
		<HomeMap bind:this={homeMap} map={current} onchoose={choose} />

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
				disabled={!current || !!busy || banned}
				onclick={() => go('solo')}
			>
				{#if busy === 'solo'}
					<span class="spinner"></span>
				{/if}
				<span class="lbl">{t('play')}</span>
			</button>
		</div>

		<!-- quiet, side by side: friends, and a friend's code -->
		<div class="chips">
			<button class="chip" disabled={!current || !!busy || banned} onclick={() => go('friends')}>
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

<Sheet open={settingsOpen} onclose={() => (settingsOpen = false)} title={t('setup')}>
	<RulesForm bind:choice {canMove} />
	<button class="btn btn-primary done" onclick={() => (settingsOpen = false)}>{t('ready')}</button>
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

	/* where you'll play: the place's picture beside a gold tag over its name, which floats on
	   the stacked shadow. The block keeps one height whatever the name: nothing round it moves */
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
		/* milk tiles on the ground, the place in gold, like the map */
		--pip-tile: var(--tile-a);
		--pip-on: var(--gold);
		--pip-edge: var(--gold-lo);
		--pip-ring: var(--gold-lo);
		filter: drop-shadow(0 3px 0 var(--map-shadow)) drop-shadow(0 0 8px var(--map-glow));
	}
	.words {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 6px;
	}
	/* .words: past the lettering's own spacing (look2's .d) */
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
		height: 62px;
		font-size: 23px;
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

	/* a short phone: tighter; if it still doesn't fit, the map keeps its size and the page
	   scrolls under the key (the last game and the credits go below the fold, never the key) */
	@media (max-height: 700px) and (max-width: 960px) {
		/* the map stays big enough to tap (the gold button needs its corner): the page scrolls a
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
	   square at its top left and its gold button at its bottom right */
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
		}
		.pic {
			width: 96px;
			height: 96px;
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
		.play {
			height: 68px;
			font-size: 26px;
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
