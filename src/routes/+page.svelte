<script lang="ts">
	// The home is a lobby with one question: where are we going today? Alone or with friends
	// is one switch; then each map is a road sign, and tapping a sign starts the game (or
	// opens a room) at once. The settings fold into one line of three facts that opens a
	// sheet. What a player hasn't earned stays out of sight: "start here" only before the
	// first game, "keep your games" only after one.
	import { goto } from '$app/navigation';
	import TopBar from '#lib/components/TopBar.svelte';
	import Sheet from '#lib/components/Sheet.svelte';
	import MapSign from '#lib/maps/MapSign.svelte';
	import GameRow from '#lib/game/GameRow.svelte';
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
	import { load, save } from '#lib/storage.js';

	type Mode = 'solo' | 'friends';

	let maps = $state<MapSummary[]>([]);
	let placeMap = $state<MapSummary | null>(null); // a place picked in the place picker
	let history = $state<GameListItem[]>([]);
	let choice = $state(loadChoice());
	let mode = $state<Mode>(load('mode', 'solo') === 'friends' ? 'friends' : 'solo');
	let busy = $state<string | null>(null); // the sign being started
	let offline = $state(false);
	let loaded = $state(false);
	let settingsOpen = $state(false);
	let nudgeHidden = $state(load('nudge_hidden', '') === '1');

	const allMaps = $derived(placeMap ? [placeMap, ...maps] : maps);
	const me = $derived(session.me);
	const banned = $derived(!!me?.user.banned);
	const newPlayer = $derived(loaded && (me?.stats.games ?? 0) === 0);
	// the settings' "can walk" follows the map last played or picked
	const current = $derived(allMaps.find((m) => m.slug === choice.map) ?? allMaps[0]);
	const canMove = $derived(current?.canMove ?? true);

	$effect(() => saveChoice($state.snapshot(choice)));
	$effect(() => save('mode', mode));

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
				call(api().GET('/v1/me/games', { params: { query: { limit: 5 } } }))
			]);
			maps = m;
			history = h.games;
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
			if (!placeMap && !m.some((x) => x.slug === choice.map) && m.length) choice.map = m[0].slug;
		} catch {
			offline = true;
		}
		loaded = true;
	}

	const errorKeys: Record<string, Key> = {
		no_panorama: 'err_no_panorama',
		daily_cap: 'err_daily_cap',
		network: 'err_network',
		banned: 'bannedText',
		too_many_rooms: 'err_too_many_rooms'
	};

	/** A sign was tapped: play there now, alone or in a new room. */
	async function go(m: MapSummary) {
		if (busy || banned) return;
		busy = m.slug;
		choice.map = m.slug;
		const body = { map: m.slug, rules: rulesFor(choice, testProviders()) };
		try {
			if (mode === 'solo') {
				const game = await call(api().POST('/v1/games', { body }));
				goto(`/game/${game.id}`);
			} else {
				const room = await call(api().POST('/v1/rooms', { body }));
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

	function hideNudge() {
		nudgeHidden = true;
		save('nudge_hidden', '1');
	}

	// ---------- a friend's room, by its code ----------
	let code = $state('');
	const codeOk = $derived(/^[A-Za-z2-9]{5}$/.test(code.trim()));
	function joinRoom(e?: SubmitEvent) {
		e?.preventDefault();
		if (codeOk) goto(`/room/${code.trim().toUpperCase()}`);
	}
	// five letters typed: in you go, no button needed
	$effect(() => {
		if (codeOk) joinRoom();
	});
</script>

<svelte:head><title>Shafaq Geo — {t('heroTitle')}</title></svelte:head>

<TopBar />

<main class="home">
	<div class="col main">
		<section class="intro">
			<p class="hello">
				{t(greeting())}{#if me}, <a href="/me">{me.user.name}</a>{/if}
			</p>
			<h1>{t('homeTitle')}</h1>
			{#if loaded && history[0] && !newPlayer}
				<p class="last">
					{t('homeLast', { score: fmtNum(history[0].total), map: tx(history[0].map.name) })}
				</p>
			{/if}
		</section>

		<div class="controls">
			<div class="mode" role="radiogroup" aria-label={t('modeLabel')}>
				<button role="radio" aria-checked={mode === 'solo'} onclick={() => (mode = 'solo')}>
					<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"
						><circle cx="12" cy="8" r="3.6" /><path d="M5 20c.7-3.8 3.5-6 7-6s6.3 2.2 7 6" /></svg
					>
					{t('modeSolo')}
				</button>
				<button role="radio" aria-checked={mode === 'friends'} onclick={() => (mode = 'friends')}>
					<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"
						><circle cx="9" cy="8" r="3.2" /><path d="M3 19c.6-3.3 3-5 6-5s5.4 1.7 6 5" /><circle
							cx="17"
							cy="9"
							r="2.5"
						/><path d="M16.5 14c2.4.2 4 1.7 4.5 4.5" /></svg
					>
					{t('modeFriends')}
				</button>
			</div>

			<button class="rules" onclick={() => (settingsOpen = true)} aria-label={t('setup')}>
				<RulesFacts {choice} />
				<span class="change" title={t('change')}>
					<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"
						><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle
							cx="10"
							cy="17"
							r="2"
						/></svg
					>
				</span>
			</button>
		</div>

		{#if mode === 'friends'}
			<section class="how" aria-label={t('openRoom')}>
				<h2>{t('roomHowTitle')}</h2>
				<ol>
					<li>
						<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"
							><rect x="3" y="6" width="18" height="11" rx="2" /><path d="M7 11.5h10" /></svg
						>
						<span>{t('roomStep1')}</span>
					</li>
					<li>
						<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"
							><path
								d="M12 15V3.5M7.5 8 12 3.5 16.5 8M5 12.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-6.5"
							/></svg
						>
						<span>{t('roomStep2')}</span>
					</li>
					<li>
						<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"
							><path d="M7 4.5v15l12-7.5z" /></svg
						>
						<span>{t('roomStep3')}</span>
					</li>
				</ol>
			</section>
		{/if}

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

		<section class="maps" class:friends={mode === 'friends'} aria-label={t('map')}>
			{#each allMaps as m, i (m.slug)}
				<button
					class="map"
					class:busy={busy === m.slug}
					disabled={!!busy || banned}
					onclick={() => go(m)}
					style:animation-delay={`${i * 60}ms`}
				>
					{#if newPlayer && i === 0}<span class="start-here">{t('startHere')}</span>{/if}
					<MapSign slug={m.slug} name={tx(m.name)} top={tx(m.description)} outline={m.outline} />
					<span class="meta">
						{#if m.progress && m.progress.unit !== 'spot'}
							<Progress progress={m.progress} />
						{:else}
							<span>{t('nSpots', { n: m.panoramas })}</span>
						{/if}
						<span class="play-tag">
							{#if busy === m.slug}
								<span class="spinner"></span>
							{:else if mode === 'solo'}
								<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" /></svg>
							{:else}
								<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"
									><path d="M12 5v14M5 12h14" /></svg
								>
							{/if}
							{mode === 'solo' ? t('play') : t('openRoom')}
						</span>
					</span>
				</button>
			{:else}
				{#if !offline}
					{#each { length: 4 } as _, i (i)}<div class="map skeleton"></div>{/each}
				{/if}
			{/each}
			{#if maps.length}
				<a class="map other" href="/places">
					<span class="other-plate">
						<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"
							><path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z" /><circle
								cx="12"
								cy="10"
								r="2.3"
							/></svg
						>
						<span class="text">
							<b>{placeMap ? t('changePlace') : t('otherPlace')}</b>
							<span>{t('otherPlaceText')}</span>
						</span>
						<svg viewBox="0 0 24 24" class="icon chev-r" aria-hidden="true"
							><path d="m9 6 6 6-6 6" /></svg
						>
					</span>
				</a>
			{/if}
		</section>
	</div>

	<div class="col side">
		{#if mode === 'friends'}
			<form class="join" onsubmit={joinRoom}>
				<label for="code" class="join-label">{t('haveCode')}</label>
				<div class="plate-input">
					<input
						id="code"
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
		{#if me?.user.guest && (me?.stats.games ?? 0) > 0 && !nudgeHidden}
			<section class="nudge">
				<button class="nudge-x" onclick={hideNudge} aria-label={t('close')}>
					<svg viewBox="0 0 24 24" class="icon"><path d="M6 6l12 12M18 6 6 18" /></svg>
				</button>
				<b>{t('nudgeTitle')}</b>
				<p>{t('nudgeText')}</p>
				<button class="btn btn-telegram" onclick={() => openSignIn('save')}>{t('signIn')}</button>
			</section>
		{/if}

		{#if history.length}
			<section class="recent">
				<div class="recent-head">
					<h2 class="section-title">{t('history')}</h2>
					<a href="/games" class="link-btn">{t('allGames')}</a>
				</div>
				<div class="rows">
					{#each history as h (h.id)}<GameRow game={h} />{/each}
				</div>
			</section>
		{/if}
	</div>
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
		grid-template-columns: minmax(0, 1fr) 360px;
		gap: 40px;
		align-items: start;
	}
	.col {
		display: flex;
		flex-direction: column;
		gap: 22px;
		min-width: 0;
	}
	.side {
		position: sticky;
		top: 16px;
		padding-top: 8px;
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
		font-size: clamp(34px, 5vw, 52px);
		line-height: 1.02;
		letter-spacing: -0.035em;
	}
	.last {
		margin-top: 8px;
		color: var(--muted);
	}

	/* alone or with friends; then the three facts of the game */
	.controls {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		align-items: center;
	}
	.mode {
		display: flex;
		padding: 5px;
		gap: 4px;
		border-radius: 18px;
		background: var(--surface-2);
	}
	.mode button {
		display: flex;
		align-items: center;
		gap: 8px;
		height: 46px;
		padding: 0 18px 0 14px;
		border: none;
		border-radius: 14px;
		background: transparent;
		color: var(--muted);
		font-family: var(--display);
		font-weight: 700;
		font-size: 14px;
		transition:
			background 0.15s,
			color 0.15s,
			transform 0.1s;
	}
	.mode button:active {
		transform: scale(0.96);
	}
	.mode button[aria-checked='true'] {
		background: var(--surface);
		color: var(--text);
		box-shadow: 0 3px 0 var(--edge);
	}
	.mode button[aria-checked='true'] .icon {
		color: var(--sky);
	}
	.rules {
		display: flex;
		align-items: center;
		gap: 6px 14px;
		min-height: 56px;
		padding: 8px 16px;
		border: 2px solid var(--border);
		border-radius: 18px;
		background: var(--surface);
		color: var(--text);
		font-weight: 600;
		font-size: 14.5px;
		text-align: left;
		transition: border-color 0.15s;
	}
	.rules:hover {
		border-color: var(--sky);
	}
	.change {
		display: grid;
		place-items: center;
		width: 36px;
		height: 36px;
		margin-left: auto;
		border-radius: 12px;
		background: var(--surface-2);
		color: var(--sky-ink);
	}
	:global(:root[data-theme='dark']) .change {
		color: var(--sky);
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

	/* the maps, as road signs: each one is a button */
	.maps {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 22px 18px;
	}
	.map {
		position: relative;
		border: none;
		background: none;
		text-align: left;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 10px;
		border-radius: 14px;
		color: var(--text);
		animation: rise 0.4s var(--settle) both;
	}
	.map:disabled {
		cursor: default;
	}
	.map :global(.sign) {
		transition:
			transform 0.12s,
			box-shadow 0.12s;
	}
	.map:not(:disabled):hover :global(.sign) {
		transform: translateY(-3px) rotate(-0.4deg);
	}
	.map:not(:disabled):active :global(.sign) {
		transform: translateY(2px) scale(0.98);
	}
	.map.busy :global(.sign) {
		animation: boing 0.5s var(--pop);
	}
	.map:disabled:not(.busy) {
		opacity: 0.6;
	}
	.map:focus-visible {
		outline: none;
	}
	.map:focus-visible :global(.sign) {
		outline: 3px solid var(--sky);
		outline-offset: 3px;
	}
	.meta {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		min-height: 34px;
		padding: 0 2px 0 4px;
		font-size: 13px;
		color: var(--muted);
	}
	.play-tag {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 34px;
		padding: 0 14px 0 11px;
		border-radius: 12px;
		background: var(--green);
		color: #fff;
		font-family: var(--display);
		font-weight: 700;
		font-size: 13px;
		box-shadow: 0 3px 0 var(--green-edge);
		flex: none;
		transition: transform 0.1s;
	}
	.friends .play-tag {
		background: var(--sky);
		box-shadow: 0 3px 0 var(--sky-edge);
	}
	.play-tag svg {
		width: 14px;
		height: 14px;
		fill: currentColor;
	}
	.play-tag .icon {
		fill: none;
		stroke-width: 3;
	}
	.play-tag .spinner {
		width: 14px;
		height: 14px;
		border-width: 2px;
	}
	.map:not(:disabled):active .play-tag {
		transform: translateY(2px);
		box-shadow: none;
	}
	/* the first game: one sign says "start here" */
	.start-here {
		position: absolute;
		z-index: 2;
		top: -14px;
		right: 14px;
		padding: 4px 12px;
		border-radius: 10px;
		background: var(--star);
		color: #3a2600;
		font-weight: 800;
		font-size: 13px;
		box-shadow: 0 3px 0 #c98a00;
		animation: hop 1.6s ease-in-out infinite;
	}
	@keyframes hop {
		0%,
		60%,
		100% {
			transform: translateY(0);
		}
		75% {
			transform: translateY(-5px);
		}
	}

	/* the way to the place picker: a blank plate waiting for a name */
	.other {
		text-decoration: none;
	}
	.other-plate {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 84px;
		padding: 12px 16px;
		border-radius: 12px;
		border: 2.5px dashed color-mix(in srgb, var(--muted) 50%, transparent);
		transition:
			border-color 0.15s,
			transform 0.15s;
	}
	.other:hover .other-plate {
		border-color: var(--sky);
		transform: translateY(-2px);
	}
	.other-plate > .icon {
		width: 30px;
		height: 30px;
		color: var(--sky);
	}
	.other-plate .text {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.other-plate b {
		font-family: var(--display);
		font-size: 16px;
	}
	.other-plate .text span {
		font-size: 13px;
		color: var(--muted);
	}
	.chev-r {
		color: var(--muted);
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

	/* a friend's code, typed onto a number plate */
	.join {
		padding: 18px;
		border-radius: 22px;
		background: var(--surface);
		border: 1px solid var(--border);
		animation: rise 0.3s var(--settle);
	}
	.join-label {
		display: block;
		font-weight: 700;
		font-size: 15px;
		margin-bottom: 10px;
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
	/* friends: how a room starts, in three steps, right above the signs */
	.how {
		padding: 16px 18px;
		border-radius: 20px;
		background: color-mix(in srgb, var(--sky) 12%, var(--surface));
		border: 2px solid color-mix(in srgb, var(--sky) 35%, transparent);
		animation: rise 0.3s var(--settle);
	}
	.how h2 {
		font-family: var(--display);
		font-weight: 800;
		font-size: 18px;
	}
	.how ol {
		margin-top: 12px;
		list-style: none;
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 10px;
		counter-reset: step;
	}
	.how li {
		counter-increment: step;
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: 14px;
		font-weight: 600;
		line-height: 1.3;
	}
	.how li .icon {
		width: 34px;
		height: 34px;
		padding: 7px;
		border-radius: 12px;
		background: var(--sky);
		color: #fff;
		box-shadow: 0 3px 0 var(--sky-edge);
	}
	.how li span::before {
		content: counter(step) '. ';
		color: var(--sky-ink);
	}

	/* "keep your games" */
	.nudge {
		position: relative;
		padding: 18px;
		border-radius: 22px;
		background: color-mix(in srgb, var(--telegram) 10%, var(--surface));
		border: 1px solid color-mix(in srgb, var(--telegram) 30%, transparent);
	}
	.nudge b {
		font-family: var(--display);
		font-size: 15px;
		display: block;
		padding-right: 30px;
	}
	.nudge p {
		margin: 6px 0 14px;
		font-size: 14px;
		color: var(--muted);
	}
	.nudge .btn {
		height: 48px;
		width: 100%;
	}
	.nudge-x {
		position: absolute;
		top: 10px;
		right: 10px;
		width: 36px;
		height: 36px;
		border: none;
		background: none;
		color: var(--muted);
		display: grid;
		place-items: center;
	}
	.nudge-x .icon {
		width: 16px;
		height: 16px;
	}

	.recent-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
	}
	.recent-head .link-btn {
		font-size: 14px;
	}
	.rows {
		margin-top: 6px;
	}
	.rows > :global(* + *) {
		border-top: 1px solid var(--border);
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
			gap: 26px;
		}
		.side {
			position: static;
			padding-top: 0;
		}
	}
	@media (max-width: 640px) {
		.home,
		.foot {
			padding-left: 16px;
			padding-right: 16px;
		}
		.controls {
			flex-direction: column;
			align-items: stretch;
		}
		.mode button {
			flex: 1;
			justify-content: center;
			padding: 0 10px;
		}
		.rules {
			justify-content: flex-start;
		}
		.maps {
			grid-template-columns: minmax(0, 1fr);
			gap: 22px;
		}
	}
</style>
