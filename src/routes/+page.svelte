<script lang="ts">
	// The home is a lobby with one green button. The sign says where you'll play (the last
	// place played or picked; a tap opens the place picker), one quiet line says how, and
	// "O‘ynash" puts you on a street. Under it, quietly: a room with friends, opened at once,
	// and a friend's code on a number plate. On a laptop the right half is the player's
	// Tashkent, where a click on a district makes it the sign. What a player hasn't earned stays out of sight: the button breathes only before
	// the first game; the count under the sign, the last game and "keep your results" show only
	// after one.
	import { goto } from '$app/navigation';
	import TopBar from '#lib/components/TopBar.svelte';
	import Sheet from '#lib/components/Sheet.svelte';
	import MapSign from '#lib/maps/MapSign.svelte';
	import CityMap from '#lib/maps/CityMap.svelte';
	import { api, call, ApiError, type GameListItem, type MapSummary } from '#lib/api/client.js';
	import { t, tx, type Key } from '#lib/i18n/index.svelte.js';
	import { ensureSession, session } from '#lib/session.svelte.js';
	import { openSignIn } from '#lib/account.svelte.js';
	import { fmtNum } from '#lib/format.js';
	import { loadChoice, saveChoice, rulesFor, testProviders } from '#lib/rules.js';
	import RulesForm from '#lib/game/RulesForm.svelte';
	import RulesFacts from '#lib/game/RulesFacts.svelte';
	import Progress from '#lib/maps/Progress.svelte';
	import { showToast } from '#lib/toast.svelte.js';
	import { justMade } from '#lib/room.svelte.js';
	import { unlockAudio } from '#lib/sfx.svelte.js';

	type Mode = 'solo' | 'friends';

	let maps = $state<MapSummary[]>([]);
	let placeMap = $state<MapSummary | null>(null); // a place picked in the place picker
	let last = $state<GameListItem | null>(null);
	let choice = $state(loadChoice());
	let busy = $state<Mode | null>(null);
	let offline = $state(false);
	let loaded = $state(false);
	let settingsOpen = $state(false);
	let codeOpen = $state(false);
	let wide = $state(false); // a laptop: the right half shows the city

	const me = $derived(session.me);
	const banned = $derived(!!me?.user.banned);
	const newPlayer = $derived(loaded && (me?.stats.games ?? 0) === 0);
	const current = $derived(
		placeMap?.slug === choice.map ? placeMap : (maps.find((m) => m.slug === choice.map) ?? maps[0])
	);
	const canMove = $derived(current?.canMove ?? true);
	// the sign opens the place map where the player is: a place's own level (a district opens
	// its city with it picked), the country for a ready map ("Toshkent ko‘chalari" too)
	const placesHref = $derived(
		current?.slug.startsWith('place-') && current.place
			? `/places/${current.place.slug}`
			: '/places'
	);

	$effect(() => saveChoice($state.snapshot(choice)));

	$effect(() => {
		const mq = matchMedia('(min-width: 961px)');
		wide = mq.matches;
		const on = () => (wide = mq.matches);
		mq.addEventListener('change', on);
		return () => mq.removeEventListener('change', on);
	});

	// again whenever the player on this device changes (signed in, merged, signed out)
	$effect(() => {
		void session.version;
		load_();
	});

	async function load_() {
		try {
			await ensureSession();
			const [m, h] = await Promise.all([
				call(api().GET('/v1/maps')),
				call(api().GET('/v1/me/games', { params: { query: { limit: 1 } } }))
			]);
			maps = m;
			last = h.games[0] ?? null;
			offline = false;
			placeMap = null;
			if (choice.map.startsWith('place-')) {
				try {
					placeMap = await call(
						api().GET('/v1/maps/{slug}', { params: { path: { slug: choice.map } } })
					);
				} catch {
					/* gone: back to the first map */
				}
			}
			// a map that left the home (a place gone, or "Toshkent"): back to the first one
			if (!placeMap && !m.some((x) => x.slug === choice.map) && m.length) choice.map = m[0].slug;
		} catch {
			offline = true;
		}
		loaded = true;
	}

	// a district clicked on the laptop's city map: the sign changes, the page stays
	async function pickPlace(map: string) {
		try {
			placeMap = await call(api().GET('/v1/maps/{slug}', { params: { path: { slug: map } } }));
			choice.map = map;
		} catch {
			showToast(t('err_network'));
		}
	}

	const errorKeys: Record<string, Key> = {
		no_panorama: 'err_no_panorama',
		daily_cap: 'err_daily_cap',
		network: 'err_network',
		banned: 'bannedText',
		too_many_rooms: 'err_too_many_rooms'
	};

	/** Play the sign's place now: alone, or in a new room with the home's settings. */
	async function go(mode: Mode) {
		if (busy || banned || !current) return;
		busy = mode;
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

<svelte:head><title>Shafaq Geo — {t('heroTitle')}</title></svelte:head>

<TopBar />

<main class="home">
	<div class="lobby">
		<section class="intro">
			<p class="hello">
				{t(greeting())}{#if me}, <a href="/me">{me.user.name}</a>{:else}!{/if}
			</p>
			<h1>{t('homeTitle')}</h1>
		</section>

		{#if offline}
			<div class="offline">
				<p>{t('err_network')}</p>
				<button class="btn btn-ghost" onclick={load_}>{t('retry')}</button>
			</div>
		{/if}

		{#if banned}
			<div class="banned">
				<b>{t('bannedTitle')}</b>
				<p>{t('bannedText')}</p>
			</div>
		{/if}

		<!-- where you'll play: the sign; a tap picks another place -->
		{#if current}
			<a class="where" href={placesHref} aria-label={`${tx(current.name)}. ${t('otherPlace')}`}>
				<MapSign
					slug={current.slug}
					name={tx(current.name)}
					top={tx(current.description)}
					outline={current.outline}
				/>
				<span class="meta">
					{#if newPlayer}
						<span></span>
					{:else if current.progress && current.progress.unit !== 'spot'}
						<Progress progress={current.progress} />
					{:else}
						<span>{t('nSpots', { n: current.panoramas })}</span>
					{/if}
					<span class="swap">
						<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"
							><path d="M7 7h11l-3-3M17 17H6l3 3" /></svg
						>
						{t('otherPlace')}
					</span>
				</span>
			</a>
		{:else if !offline}
			<div class="where skeleton"></div>
		{/if}

		<button class="rules" onclick={() => (settingsOpen = true)} aria-label={t('setup')}>
			<RulesFacts {choice} />
			<svg viewBox="0 0 24 24" class="icon change" aria-hidden="true"
				><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle
					cx="10"
					cy="17"
					r="2"
				/></svg
			>
		</button>

		<!-- THE button -->
		<div class="go">
			<button
				class="btn btn-primary play"
				class:breathe={newPlayer && !busy}
				disabled={!current || !!busy || banned}
				onclick={() => go('solo')}
			>
				{#if busy === 'solo'}
					<span class="spinner"></span>
				{:else}
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" /></svg>
				{/if}
				{t('play')}
			</button>
		</div>

		<!-- quiet, one row of links: the green button is the only box -->
		<div class="quiet">
			<button
				class="link-btn friends"
				disabled={!current || !!busy || banned}
				onclick={() => go('friends')}
			>
				{#if busy === 'friends'}
					<span class="spinner"></span>
				{:else}
					<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"
						><circle cx="9" cy="8" r="3.2" /><path d="M3 19c.6-3.3 3-5 6-5s5.4 1.7 6 5" /><circle
							cx="17"
							cy="9"
							r="2.5"
						/><path d="M16.5 14c2.4.2 4 1.7 4.5 4.5" /></svg
					>
				{/if}
				{t('playFriends')}
			</button>
			{#if !codeOpen}
				<span class="dot" aria-hidden="true">·</span>
				<button class="link-btn code" onclick={() => (codeOpen = true)}>{t('haveCode')}</button>
			{/if}

			{#if codeOpen}
				<form class="join" onsubmit={joinRoom}>
					<div class="plate-input">
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
			{/if}
		</div>

		{#if loaded && !newPlayer && last}
			<p class="stats">
				<a href={`/game/${last.id}`}>{t('homeLast', { score: fmtNum(last.total) })}</a>
			</p>
			{#if me?.user.guest}
				<p class="stats">
					{t('saveResults')} ·
					<button class="link-btn save" onclick={() => openSignIn('save')}>
						<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"
							><path d="m21 4-18 7.5 6 2.2M21 4l-3.5 16-8.5-6.3M21 4 9 13.7v5.8l3.2-3.3" /></svg
						>Telegram</button
					>
				</p>
			{/if}
		{/if}
	</div>

	{#if wide}
		<div class="side girih">
			<CityMap glow={newPlayer} chosen={current?.slug} onpick={pickPlace} />
		</div>
	{/if}
</main>

<footer class="foot">
	<span>{t('credits')}</span>
</footer>

<Sheet open={settingsOpen} onclose={() => (settingsOpen = false)} title={t('setup')}>
	<RulesForm bind:choice {canMove} />
	<button class="btn btn-primary done" onclick={() => (settingsOpen = false)}>{t('ready')}</button>
</Sheet>

<style>
	.home {
		max-width: 1160px;
		margin: 0 auto;
		padding: 8px 24px 40px;
		display: grid;
		grid-template-columns: minmax(0, 460px) minmax(0, 1fr);
		gap: 56px;
		align-items: start;
	}
	.lobby {
		display: flex;
		flex-direction: column;
		gap: 18px;
		min-width: 0;
	}
	.side {
		position: sticky;
		top: 16px;
		margin-top: 8px;
		padding: 24px 28px 20px;
		border-radius: 28px;
		background: var(--surface);
		border: 1px solid var(--border);
		color: var(--text);
	}

	.hello {
		font-size: 16px;
		color: var(--muted);
	}
	.hello a {
		color: var(--text);
		font-weight: 600;
		text-decoration: none;
	}
	h1 {
		margin-top: 2px;
		font-family: var(--display);
		font-weight: 800;
		font-size: clamp(30px, 4.4vw, 44px);
		line-height: 1.04;
		letter-spacing: -0.035em;
	}

	/* where: the sign, and under it how much is known there and the way to another place */
	.where {
		display: flex;
		flex-direction: column;
		gap: 8px;
		color: var(--text);
		text-decoration: none;
		border-radius: 14px;
		animation: rise 0.4s var(--settle) both;
	}
	.where :global(.sign) {
		transition: transform 0.12s;
	}
	.where:hover :global(.sign) {
		transform: translateY(-3px) rotate(-0.4deg);
	}
	.where:active :global(.sign) {
		transform: translateY(2px) scale(0.98);
	}
	.where:focus-visible {
		outline: none;
	}
	.where:focus-visible :global(.sign) {
		outline: 3px solid var(--sky);
		outline-offset: 3px;
	}
	.meta {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		min-height: 32px;
		padding: 0 2px 0 4px;
		font-size: 13px;
		color: var(--muted);
	}
	.swap {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		color: var(--sky-ink);
		font-weight: 700;
		font-size: 14px;
		flex: none;
	}
	.swap .icon {
		width: 18px;
		height: 18px;
	}
	:global(:root[data-theme='dark']) .swap {
		color: var(--sky);
	}
	.skeleton {
		height: 128px;
		border-radius: 12px;
		background: var(--surface-2);
		animation: breathe 1.4s ease-in-out infinite;
	}
	@keyframes breathe {
		50% {
			opacity: 0.55;
		}
	}

	/* how: three facts, quiet; a tap opens the sheet */
	.rules {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 48px;
		padding: 6px 14px;
		border: none;
		border-radius: 14px;
		background: var(--surface-2);
		color: var(--text);
		font-size: 14.5px;
		text-align: left;
		transition: filter 0.15s;
	}
	.rules:hover {
		filter: brightness(0.97);
	}
	.rules .change {
		margin-left: auto;
		color: var(--muted);
	}

	/* THE button */
	.go {
		position: relative;
		margin-top: 6px;
	}
	.play {
		width: 100%;
		height: 76px;
		border-radius: 22px;
		font-size: 24px;
		box-shadow: 0 6px 0 var(--b-edge);
		margin-bottom: 6px;
	}
	.play:active:not(:disabled) {
		transform: translateY(5px);
		box-shadow: 0 1px 0 var(--b-edge);
	}
	.play svg {
		width: 24px;
		height: 24px;
		fill: currentColor;
		stroke: none;
	}
	.play .spinner {
		width: 24px;
		height: 24px;
		border-width: 3px;
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

	/* quiet, under it: friends, and a friend's code */
	.quiet {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		align-items: center;
		gap: 6px 4px;
	}
	.friends,
	.code {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 44px;
		padding: 0 8px;
		font-size: 15px;
	}
	.friends .spinner {
		width: 16px;
		height: 16px;
	}
	.dot {
		color: var(--muted);
	}

	/* a friend's code, typed onto a number plate */
	.join {
		width: 100%;
		max-width: 300px;
		animation: rise 0.3s var(--settle);
	}
	.plate-input {
		display: flex;
		align-items: stretch;
		height: 62px;
		border-radius: 10px;
		background: #fff;
		color: #111;
		border: 3px solid #111;
		box-shadow: 0 4px 0 rgba(0, 0, 0, 0.18);
		overflow: hidden;
	}
	.plate-input input {
		flex: 1;
		min-width: 0;
		border: none;
		background: transparent;
		color: #111;
		padding: 0 12px;
		font-family: var(--display);
		font-weight: 800;
		font-size: 30px;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		text-align: center;
		outline: none;
	}
	.plate-input input::placeholder {
		color: #c9c4b8;
	}
	.plate-input:focus-within {
		box-shadow:
			0 4px 0 rgba(0, 0, 0, 0.18),
			0 0 0 4px color-mix(in srgb, var(--sky) 45%, transparent);
	}
	.uz {
		width: 50px;
		border-left: 3px solid #111;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 4px;
	}
	.uz i {
		width: 30px;
		height: 18px;
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
		font-family: var(--display);
		font-size: 12px;
	}

	/* after the first game: the last game */
	.stats {
		display: flex;
		justify-content: center;
		flex-wrap: wrap;
		gap: 4px 8px;
		font-size: 14px;
		color: var(--muted);
	}
	.stats a {
		color: inherit;
		text-decoration: none;
	}
	.save {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 14px;
	}
	.save .icon {
		width: 16px;
		height: 16px;
	}
	.stats a:hover {
		color: var(--text);
		text-decoration: underline;
	}

	.offline,
	.banned {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 12px;
		padding: 12px 14px;
		border-radius: 14px;
		background: color-mix(in srgb, var(--red) 12%, transparent);
	}
	.offline .btn {
		height: 42px;
	}
	.banned {
		flex-direction: column;
		align-items: flex-start;
		gap: 2px;
		font-size: 14px;
	}

	.done {
		width: 100%;
		margin-top: 22px;
	}

	.foot {
		max-width: 1160px;
		margin: 0 auto;
		padding: 18px 24px 28px;
		border-top: 1px solid var(--border);
		font-size: 13px;
		color: var(--muted);
	}

	@media (max-width: 960px) {
		.home {
			grid-template-columns: minmax(0, 1fr);
			max-width: 560px;
		}
	}
	@media (max-width: 640px) {
		.home,
		.foot {
			padding-left: 16px;
			padding-right: 16px;
		}
	}
</style>
