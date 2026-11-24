<script lang="ts">
	import { goto, onNavigate, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import GameBar from '#lib/components/GameBar.svelte';
	import Sheet from '#lib/components/Sheet.svelte';
	import Picker from '#lib/maps/Picker.svelte';
	import { within, type NewPick, type Pick } from '#lib/maps/picks.js';
	import { setFriendsMap } from '#lib/friends-room.js';
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

	let maps = $state<MapSummary[]>([]); // the ready maps
	let own = $state<MapSummary | null>(null); // a place's own map, or a mix of the list
	let last = $state<GameListItem | null>(null);
	let choice = $state(loadChoice());
	let busy = $state(false);
	let offline = $state(false);
	// the server asked to wait (too many new players from one address, e.g. friends behind one
	// carrier): say so, and try again by itself
	let waiting = $state(false);
	let retryTimer: ReturnType<typeof setTimeout> | undefined;
	let loaded = $state(false);
	let settingsOpen = $state(false);
	let picks = $state<Pick[]>([]);
	let picker = $state<ReturnType<typeof Picker>>();
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
			if (choice.map === want) {
				own = mine;
				// A map that left the home: back to the first ready map.
				const cur = mine ?? m.find((x) => x.slug === want) ?? m[0];
				if (cur) {
					choice.map = cur.slug;
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

	function chooseMap(map: MapSummary) {
		own = map;
		choice.map = map.slug;
		choice.ownList = true;
		saveChoice($state.snapshot(choice));
	}

	onNavigate(async ({ to }) => {
		if (to?.url.pathname !== '/friends') return;
		const place = playPlace;
		await picker?.waitForPicks();
		setFriendsMap(place?.map);
	});

	// an old link to the places page (/places/<slug> → /?at=<slug>): the map opens there
	$effect(() => {
		const at = page.url.searchParams.get('at');
		const map = picker;
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
		banned: 'bannedText'
	};

	async function go() {
		if (!canPlay) return;
		const place = playPlace;
		busy = true;
		try {
			if (picker && !(await picker.waitForPicks())) return;
			const map = place?.map ?? current?.slug;
			if (!map || banned) return;
			const body = { map, rules: rulesFor(choice, testProviders()) };
			const game = await call(api().POST('/v1/games', { body }));
			// The mix summary carries its parts. Keep the colours the player saw while picking.
			await goto('/game/' + game.id, {
				persistState: true,
				state: game.map.parts?.length
					? {
							pickColors: {
								gameId: game.id,
								picks: picks.map(({ map, color }) => ({ map, color }))
							}
						}
					: {}
			});
		} catch (e) {
			const code = e instanceof ApiError ? e.code : 'other';
			showToast(t(errorKeys[code] ?? 'err_other'), 3500);
		} finally {
			busy = false;
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
</script>

<svelte:head><title>GeoShafaq — {t('heroTitle')}</title></svelte:head>

<div class="home">
	<GameBar />

	<main class="grid picker-layout">
		<p class="greet">
			{t(greeting())}{#if me}, <b>{me.user.name}</b>{:else}!{/if}
		</p>

		<Picker
			bind:this={picker}
			bind:shownPlace
			bind:selected={picks}
			{current}
			{maps}
			{busy}
			defaultPick={!choice.ownList}
			onchange={chooseMap}
		/>

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

		<!-- how much is known here: one gold line, only after the first game -->
		{#if progress && progress.unit === 'street'}
			<p class="count">
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
			</p>
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
				onclick={go}
			>
				{#if busy}
					<span class="spinner" aria-hidden="true"></span>
				{/if}
				<span class="play-text">
					<span class="lbl">{t('play')}</span>
					{#if playName}<span class="play-name">{playName}</span>{/if}
				</span>
			</button>
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
	<button class="btn btn-primary done" onclick={() => (settingsOpen = false)}
		><span class="lbl">{t('ready')}</span></button
	>
</Sheet>

<style>
	/* a phone: one column, with the same map tracks as the room lobby */
	.home {
		min-height: 100%;
		max-width: 560px;
		margin: 0 auto;
		padding: 0 16px 8px;
		display: flex;
		flex-direction: column;
	}
	.grid {
		flex: 1;
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		grid-template-rows: var(--picker-band-height) var(--picker-map-height) repeat(7, auto);
		grid-template-areas: 'greet' 'hero' 'place' 'rules' 'go' 'state' 'count' 'last' 'credits';
	}
	.greet {
		grid-area: greet;
		align-self: center;
		font-size: 15px;
		font-weight: 600;
		color: var(--on-ground-2);
	}
	.greet b {
		color: var(--on-ground);
	}
	.grid > :global(.picker-place) {
		grid-area: place;
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

	.grid > :global(.picker-map) {
		grid-area: hero;
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
	@keyframes spin {
		to {
			transform: rotate(1turn);
		}
	}

	.done {
		width: 100%;
		margin-top: 22px;
	}

	@media (max-height: 700px) and (max-width: 960px) {
		.credits {
			margin-top: 8px;
		}
	}

	/* a laptop: the left column carries the words and the key; the map takes all the rest, its
	   square at its top left and "Tanlash" at its bottom right */
	@media (min-width: 961px) {
		.home {
			max-width: none;
			height: 100%;
			min-height: 600px;
			padding: 0 40px 18px;
		}
		.grid {
			min-height: 0;
			grid-template-columns: min(36vw, 400px) minmax(0, 1fr);
			column-gap: 28px;
			grid-template-rows: 1fr auto auto auto auto auto auto auto 1fr auto;
			grid-template-areas:
				'. hero'
				'greet hero'
				'place hero'
				'state hero'
				'count hero'
				'rules hero'
				'go hero'
				'last hero'
				'. hero'
				'credits hero';
		}
		.greet {
			font-size: 17px;
		}
		.grid > :global(.picker-map) {
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
