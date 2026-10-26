<script lang="ts">
	import { goto } from '$app/navigation';
	import TopBar from '#lib/components/TopBar.svelte';
	import MapSign from '#lib/maps/MapSign.svelte';
	import GameRow from '#lib/game/GameRow.svelte';
	import { api, call, ApiError, type GameListItem, type MapSummary } from '#lib/api/client.js';
	import { t, tx, type Key } from '#lib/i18n/index.svelte.js';
	import { ensureSession, session } from '#lib/session.svelte.js';
	import { openSignIn } from '#lib/account.svelte.js';
	import { fmtClock, fmtNum } from '#lib/format.js';
	import {
		applyPreset,
		loadChoice,
		saveChoice,
		rulesFor,
		testProviders,
		roundsFromSlider,
		sliderFromRounds,
		timeFromSlider,
		sliderFromTime,
		ROUNDS_END,
		TIME_END,
		MAX_HINTS,
		HINT_COSTS,
		HINT_KINDS,
		MOVEMENTS,
		type Preset
	} from '#lib/rules.js';
	import { compass, setCompassStyle, COMPASS_STYLES, MNEMONIC } from '#lib/compass.svelte.js';
	import Progress from '#lib/maps/Progress.svelte';
	import { showToast } from '#lib/toast.svelte.js';
	import { load, save } from '#lib/storage.js';

	let maps = $state<MapSummary[]>([]);
	let placeMap = $state<MapSummary | null>(null); // a place picked in the place picker
	let history = $state<GameListItem[]>([]);
	let choice = $state(loadChoice());
	let starting = $state(false);
	let offline = $state(false);
	let loaded = $state(false);
	let settingsOpen = $state(false);
	let nudgeHidden = $state(load('nudge_hidden', '') === '1');

	const allMaps = $derived(placeMap ? [placeMap, ...maps] : maps);
	const selected = $derived(allMaps.find((m) => m.slug === choice.map) ?? maps[0]);
	const canMove = $derived(selected?.canMove ?? true);
	const me = $derived(session.me);
	const banned = $derived(!!me?.user.banned);
	const newPlayer = $derived(loaded && (me?.stats.games ?? 0) === 0);

	$effect(() => saveChoice($state.snapshot(choice)));

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

	async function play() {
		if (!selected || starting || banned) return;
		starting = true;
		try {
			const game = await call(
				api().POST('/v1/games', {
					body: { map: selected.slug, rules: rulesFor(choice, testProviders()) }
				})
			);
			goto(`/game/${game.id}`);
		} catch (e) {
			starting = false;
			const code = e instanceof ApiError ? e.code : 'other';
			const keys: Record<string, Key> = {
				no_panorama: 'err_no_panorama',
				daily_cap: 'err_daily_cap',
				network: 'err_network',
				banned: 'bannedText'
			};
			showToast(t(keys[code] ?? 'err_other'), 3500);
		}
	}

	const presets: Preset[] = ['easy', 'normal', 'hard'];

	function greeting(): Key {
		const h = new Date().getHours();
		return h < 5 ? 'goodNight' : h < 11 ? 'goodMorning' : h < 18 ? 'goodDay' : 'goodEvening';
	}

	function hideNudge() {
		nudgeHidden = true;
		save('nudge_hidden', '1');
	}

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Enter' && e.target === document.body) play();
	}

	const summary = $derived(
		[
			t(`diff_${choice.preset}`),
			choice.rounds ? t('nRounds', { n: choice.rounds }) : t('endlessShort'),
			choice.timeSec ? fmtClock(choice.timeSec) : t('noTimeLimit'),
			choice.hints.count ? t('nHints', { n: choice.hints.count }) : t('hintsNone').toLowerCase(),
			choice.movement !== 'move' || !canMove
				? t(`move_${canMove ? choice.movement : 'nomove'}`).toLowerCase()
				: '',
			choice.compass ? '' : t('noCompass')
		]
			.filter(Boolean)
			.join(' · ')
	);

	// the sliders paint their track up to the thumb
	const fill = (v: number, max: number, min = 0) => `${((v - min) / (max - min)) * 100}%`;
	const roundsPos = $derived(sliderFromRounds(choice.rounds));
	const timePos = $derived(sliderFromTime(choice.timeSec));
	const compassValue = $derived(choice.compass ? compass.style : 'none');
	function pickCompass(v: string) {
		choice.compass = v !== 'none';
		if (v !== 'none') setCompassStyle(v as typeof compass.style);
	}
	// the numbers under the sliders, each where its value sits on the track
	const roundMarks: [number, string][] = [
		[1, '1'],
		[5, '5'],
		[10, '10'],
		[15, '15'],
		[ROUNDS_END, '∞']
	];
	const timeMarks: [number, string][] = [
		...[10, 30, 60, 180].map((s): [number, string] => [sliderFromTime(s), fmtClock(s)]),
		[TIME_END, '∞']
	];
	const costLabel = (c: number) => (c ? `−${Math.round(c * 100)}%` : t('costFree'));
</script>

<svelte:window onkeydown={onKey} />
<svelte:head><title>Shafaq Geo — {t('heroTitle')}</title></svelte:head>

<TopBar />

<main class="home">
	<div class="col main">
		<section class="intro">
			<p class="hello">
				{t(greeting())}{#if me}, <a href="/me">{me.user.name}</a>{/if}
			</p>
			<h1>{t('homeTitle')}</h1>
			<p class="sub">
				{#if !loaded}&nbsp;
				{:else if newPlayer}{t('homeFirst')}
				{:else if history[0]}{t('homeLast', {
						score: fmtNum(history[0].total),
						map: tx(history[0].map.name)
					})}
				{:else}{t('homeBack')}{/if}
			</p>
		</section>

		{#if offline}
			<div class="offline">
				<p>{t('err_network')}</p>
				<button class="btn btn-ghost" onclick={load_}>{t('retry')}</button>
			</div>
		{/if}

		<section class="maps" aria-label={t('map')}>
			{#each allMaps as m (m.slug)}
				{@const on = m.slug === selected?.slug}
				<button class="map" aria-pressed={on} onclick={() => (choice.map = m.slug)}>
					<MapSign slug={m.slug} name={tx(m.name)} top={tx(m.description)} outline={m.outline} />
					<span class="meta">
						{#if m.progress && m.progress.unit !== 'spot'}
							<Progress progress={m.progress} />
						{:else}
							<span>{t('nSpots', { n: m.panoramas })}</span>
						{/if}
						{#if on}
							<span class="picked">
								<svg viewBox="0 0 24 24" class="icon"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
								{t('chosen')}
							</span>
						{/if}
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

		{#if newPlayer}
			<section class="howto">
				<h2 class="section-title">{t('howTo')}</h2>
				<ol>
					<li>
						<svg viewBox="0 0 64 44" aria-hidden="true" class="pic"
							><path d="M6 38V16l8-6 8 6v22M26 38V8h14v30M44 38V20h14v18M2 38h60" /><path
								class="accent"
								d="M14 26h0M33 16h0M33 24h0M51 28h0"
							/></svg
						>
						<p>{t('howTo1')}</p>
					</li>
					<li>
						<svg viewBox="0 0 64 44" aria-hidden="true" class="pic"
							><rect x="8" y="10" width="48" height="20" rx="3" class="plate" /><rect
								x="11"
								y="13"
								width="42"
								height="14"
								rx="2"
								class="plate-line"
							/><path d="M17 20h22" class="plate-line" /><path d="M32 30v10" /></svg
						>
						<p>{t('howTo2')}</p>
					</li>
					<li>
						<svg viewBox="0 0 64 44" aria-hidden="true" class="pic"
							><path d="M6 34 22 28l18 6 18-6" /><path
								class="pin"
								d="M32 26s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"
							/><circle cx="32" cy="15" r="2.4" /></svg
						>
						<p>{t('howTo3')}</p>
					</li>
				</ol>
			</section>
		{/if}
	</div>

	<div class="col side">
		<section class="panel">
			{#if banned}
				<div class="banned">
					<b>{t('bannedTitle')}</b>
					<p>{t('bannedText')}</p>
				</div>
			{/if}
			<button
				class="summary"
				aria-expanded={settingsOpen}
				onclick={() => (settingsOpen = !settingsOpen)}
			>
				<svg viewBox="0 0 24 24" class="icon"
					><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle
						cx="10"
						cy="17"
						r="2"
					/></svg
				>
				<span class="summary-text">
					<span class="summary-label">{t('setup')}</span>
					<span>{summary}</span>
				</span>
				<svg viewBox="0 0 24 24" class="icon chev"><path d="m6 9 6 6 6-6" /></svg>
			</button>
			<div class="settings" class:open={settingsOpen}>
				<div>
					<div class="field-label">{t('difficulty')}</div>
					<div class="segmented">
						{#each presets as p (p)}
							<button
								aria-pressed={choice.preset === p}
								onclick={() => (choice = applyPreset(choice, p))}>{t(`diff_${p}`)}</button
							>
						{/each}
					</div>
					<p class="field-note">{t(`diffHint_${choice.preset}`)}</p>
				</div>

				<label class="slider">
					<span class="field-head">
						<span class="field-label">{t('rounds')}</span>
						<b>{choice.rounds ? choice.rounds : t('roundsEndless')}</b>
					</span>
					<input
						type="range"
						class="range"
						min="1"
						max={ROUNDS_END}
						step="1"
						value={roundsPos}
						style:--fill={fill(roundsPos, ROUNDS_END, 1)}
						oninput={(e) => (choice.rounds = roundsFromSlider(+e.currentTarget.value))}
					/>
					<span class="scale">
						{#each roundMarks as [v, label] (label)}
							<span style:left={fill(v, ROUNDS_END, 1)}>{label}</span>
						{/each}
					</span>
				</label>

				<label class="slider">
					<span class="field-head">
						<span class="field-label">{t('time')}</span>
						<b>{choice.timeSec ? fmtClock(choice.timeSec) : t('timeNone')}</b>
					</span>
					<input
						type="range"
						class="range"
						min="0"
						max={TIME_END}
						step="1"
						value={timePos}
						style:--fill={fill(timePos, TIME_END)}
						oninput={(e) => (choice.timeSec = timeFromSlider(+e.currentTarget.value))}
					/>
					<span class="scale">
						{#each timeMarks as [v, label] (label)}
							<span style:left={fill(v, TIME_END)}>{label}</span>
						{/each}
					</span>
				</label>

				<div>
					<div class="field-head">
						<span class="field-label">{t('hints')}</span>
						<span class="stepper">
							<button
								aria-label="−"
								disabled={choice.hints.count <= 0}
								onclick={() => choice.hints.count--}
								><svg viewBox="0 0 24 24" class="icon"><path d="M6 12h12" /></svg></button
							>
							<b>{choice.hints.count || t('hintsNone')}</b>
							<button
								aria-label="+"
								disabled={choice.hints.count >= MAX_HINTS}
								onclick={() => choice.hints.count++}
								><svg viewBox="0 0 24 24" class="icon"><path d="M6 12h12M12 6v12" /></svg></button
							>
						</span>
					</div>
					{#if choice.hints.count > 0}
						<div class="hint-rules">
							<div class="segmented small">
								{#each ['round', 'game'] as const as per (per)}
									<button
										aria-pressed={choice.hints.per === per}
										onclick={() => (choice.hints.per = per)}>{t(`hintsPer_${per}`)}</button
									>
								{/each}
							</div>
							<div class="field-label sub">{t('hintStart')}</div>
							<div class="segmented small">
								{#each HINT_KINDS as k (k)}
									<button
										aria-pressed={choice.hints.kind === k}
										onclick={() => (choice.hints.kind = k)}>{t(`hintKind_${k}`)}</button
									>
								{/each}
							</div>
							<p class="field-note">{t(`hintKindNote_${choice.hints.kind}`)}</p>
							<div class="field-label sub">{t('hintCost')}</div>
							<div class="segmented small">
								{#each HINT_COSTS as c (c)}
									<button
										aria-pressed={choice.hints.cost === c}
										onclick={() => (choice.hints.cost = c)}>{costLabel(c)}</button
									>
								{/each}
							</div>
						</div>
					{/if}
				</div>

				<div>
					<div class="field-label">{t('movement')}</div>
					<div class="segmented">
						{#each MOVEMENTS as mv (mv)}
							<button
								aria-pressed={(canMove
									? choice.movement
									: choice.movement === 'move'
										? 'nomove'
										: choice.movement) === mv}
								disabled={mv === 'move' && !canMove}
								onclick={() => (choice.movement = mv)}>{t(`move_${mv}`)}</button
							>
						{/each}
					</div>
					<p class="field-note">
						{!canMove && choice.movement === 'move'
							? t('moveNoteCantMove')
							: t(`moveNote_${choice.movement}`)}
					</p>
				</div>

				<div>
					<div class="field-label">{t('compass')}</div>
					<div class="segmented">
						{#each [...COMPASS_STYLES, 'none'] as c (c)}
							<button aria-pressed={compassValue === c} onclick={() => pickCompass(c)}
								>{c === 'none' ? t('compassNone') : t(`compass_${c}` as Key)}</button
							>
						{/each}
					</div>
					<p class="field-note">{t(`compassNote_${compassValue}` as Key, MNEMONIC)}</p>
				</div>
			</div>

			<button class="btn btn-play" onclick={play} disabled={!selected || starting || banned}>
				<span class="play-text">
					<span>{starting ? t('starting') : t('play')}</span>
					{#if selected}<small>{tx(selected.name)}</small>{/if}
				</span>
				<svg viewBox="0 0 24 24"><path d="M7 4.5v15l12-7.5z" /></svg>
			</button>

			<div class="friends">
				<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"
					><circle cx="9" cy="8" r="3.2" /><path d="M3 19c.6-3.3 3-5 6-5s5.4 1.7 6 5" /><circle
						cx="17"
						cy="9"
						r="2.5"
					/><path d="M16.5 14c2.4.2 4 1.7 4.5 4.5" /></svg
				>
				<span>{t('friends')}</span>
				<em>{t('soon')}</em>
			</div>
		</section>

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
	<span class="keys">{t('keys')}</span>
</footer>

<style>
	.home {
		max-width: 1200px;
		margin: 0 auto;
		padding: 12px 24px 40px;
		display: grid;
		grid-template-columns: minmax(0, 1fr) 380px;
		gap: 28px;
		align-items: start;
	}
	.col {
		display: flex;
		flex-direction: column;
		gap: 26px;
		min-width: 0;
	}
	.side {
		position: sticky;
		top: 16px;
	}

	/* hello */
	.hello {
		font-size: 15px;
		color: var(--muted);
	}
	.hello a {
		color: var(--text);
		font-weight: 600;
		text-decoration: none;
	}
	h1 {
		margin-top: 4px;
		font-family: var(--display);
		font-weight: 800;
		font-size: clamp(30px, 4.4vw, 46px);
		line-height: 1.05;
		letter-spacing: -0.03em;
	}
	.sub {
		margin-top: 10px;
		font-size: 15.5px;
		color: var(--muted);
		max-width: 560px;
	}
	.offline {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 12px 14px;
		border-radius: 12px;
		background: color-mix(in srgb, var(--red) 12%, transparent);
	}
	.offline .btn {
		height: 40px;
	}

	/* the maps, as road signs */
	.maps {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 18px 16px;
	}
	.map {
		border: none;
		background: none;
		text-align: left;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 9px;
		border-radius: 14px;
		transition: transform 0.15s;
	}
	.map :global(.sign) {
		transition:
			transform 0.15s,
			box-shadow 0.15s;
	}
	.map:hover :global(.sign) {
		transform: translateY(-2px);
	}
	.map[aria-pressed='true'] :global(.sign) {
		outline: 3px solid var(--green);
		outline-offset: 3px;
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
		min-height: 22px;
		padding: 0 4px;
		font-size: 13px;
		color: var(--muted);
	}
	/* the way to the place picker: a blank plate waiting for a name */
	.other {
		text-decoration: none;
		color: var(--text);
	}
	.other-plate {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 82px;
		padding: 12px 16px;
		border-radius: 10px;
		border: 2px dashed color-mix(in srgb, var(--muted) 55%, transparent);
		background: color-mix(in srgb, var(--surface) 60%, transparent);
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
		flex: none;
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
	.picked {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		color: var(--green-ink);
		font-weight: 600;
	}
	:global(:root[data-theme='dark']) .picked {
		color: var(--green);
	}
	.picked .icon {
		width: 16px;
		height: 16px;
		stroke-width: 2.6;
	}
	.skeleton {
		height: 112px;
		border-radius: 10px;
		background: var(--surface-2);
		animation: breathe 1.4s ease-in-out infinite;
	}
	@keyframes breathe {
		50% {
			opacity: 0.55;
		}
	}

	/* how to play: only until the first game */
	.howto ol {
		margin-top: 14px;
		list-style: none;
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 14px;
	}
	.howto li {
		padding: 14px 14px 16px;
		border-radius: 16px;
		background: var(--surface);
		border: 1px solid var(--border);
	}
	.howto p {
		margin-top: 8px;
		font-size: 14px;
		line-height: 1.45;
	}
	.pic {
		width: 64px;
		height: 44px;
		fill: none;
		stroke: var(--text);
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.pic .accent {
		stroke: var(--gold);
		stroke-width: 4;
	}
	.pic .plate {
		fill: var(--sign-blue);
		stroke: none;
	}
	.pic .plate-line {
		stroke: #fff;
		stroke-width: 1.6;
	}
	.pic .pin {
		fill: var(--green);
		stroke: var(--green);
	}

	/* the panel: settings and Play */
	.panel {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 20px;
		padding: 8px 8px 16px;
		display: flex;
		flex-direction: column;
		gap: 12px;
		box-shadow: 0 1px 0 var(--border);
	}
	.banned {
		margin: 8px 8px 0;
		padding: 12px 14px;
		border-radius: 12px;
		background: color-mix(in srgb, var(--red) 12%, transparent);
		font-size: 14px;
	}
	.summary {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		border: none;
		background: none;
		text-align: left;
		padding: 10px 10px;
		border-radius: 14px;
	}
	.summary:hover {
		background: var(--bg);
	}
	.summary > .icon {
		color: var(--muted);
	}
	.summary-text {
		flex: 1;
		display: flex;
		flex-direction: column;
		font-size: 14.5px;
		font-weight: 600;
		min-width: 0;
	}
	.summary-label {
		font-size: 12px;
		font-weight: 500;
		color: var(--muted);
	}
	.chev {
		transition: transform 0.2s;
		color: var(--muted);
	}
	.summary[aria-expanded='true'] .chev {
		transform: rotate(180deg);
	}
	.settings {
		display: none;
		flex-direction: column;
		gap: 16px;
		padding: 2px 10px 6px;
	}
	.settings.open {
		display: flex;
	}
	.settings .field-note {
		min-height: 0;
		margin-top: 8px;
	}
	.field-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
	}
	.field-head .field-label {
		margin-bottom: 0;
	}
	.field-head > b {
		font-family: var(--display);
		font-size: 17px;
		font-variant-numeric: tabular-nums;
	}
	.slider {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	/* the thumb's middle runs 13px in from each end of the track */
	.scale {
		position: relative;
		height: 14px;
		margin: -6px 13px 0;
		font-size: 11.5px;
		color: var(--muted);
	}
	.scale span {
		position: absolute;
		transform: translateX(-50%);
		white-space: nowrap;
	}
	.stepper {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 3px;
		border-radius: 12px;
		background: var(--surface-2);
	}
	.stepper button {
		width: 38px;
		height: 34px;
		border: none;
		border-radius: 9px;
		background: var(--surface);
		color: var(--text);
		display: grid;
		place-items: center;
	}
	.stepper button:disabled {
		opacity: 0.4;
	}
	.stepper .icon {
		width: 16px;
		height: 16px;
		stroke-width: 2.4;
	}
	.stepper b {
		min-width: 64px;
		text-align: center;
		font-family: var(--display);
		font-size: 15px;
	}
	.hint-rules {
		margin-top: 10px;
		padding: 12px;
		border-radius: 14px;
		background: var(--bg);
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.hint-rules .field-note {
		margin-top: 0;
	}
	.field-label.sub {
		margin: 4px 0 0;
		font-size: 12px;
	}
	.segmented.small button {
		min-height: 34px;
		font-size: 13.5px;
	}
	.segmented button:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.btn-play {
		margin: 0 8px;
		height: 68px;
		justify-content: space-between;
		padding: 0 22px 0 24px;
		background: var(--green);
		color: #fff;
		box-shadow:
			0 4px 0 var(--green-ink),
			0 10px 24px color-mix(in srgb, var(--green) 30%, transparent);
		border-radius: 18px;
	}
	.btn-play:hover:not(:disabled) {
		filter: brightness(1.05);
	}
	.btn-play:active:not(:disabled) {
		transform: translateY(3px);
		box-shadow: 0 1px 0 var(--green-ink);
	}
	.play-text {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		min-width: 0;
		font-size: 20px;
		line-height: 1.1;
	}
	.play-text small {
		font-family: var(--body);
		font-weight: 500;
		font-size: 13px;
		opacity: 0.9;
		letter-spacing: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 100%;
	}
	.btn-play svg {
		width: 26px;
		height: 26px;
		fill: currentColor;
		stroke: none;
	}
	.friends {
		display: flex;
		align-items: center;
		gap: 10px;
		margin: 0 18px;
		font-size: 14px;
		color: var(--muted);
	}
	.friends em {
		margin-left: auto;
		font-style: normal;
		font-size: 11.5px;
		font-weight: 700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		padding: 3px 8px;
		border-radius: 999px;
		background: color-mix(in srgb, var(--gold) 22%, transparent);
		color: var(--text);
	}

	/* "keep your games" */
	.nudge {
		position: relative;
		padding: 18px 18px 18px;
		border-radius: 20px;
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
		height: 46px;
		width: 100%;
	}
	.nudge-x {
		position: absolute;
		top: 10px;
		right: 10px;
		width: 32px;
		height: 32px;
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

	.foot {
		max-width: 1200px;
		margin: 0 auto;
		padding: 18px 24px 28px;
		border-top: 1px solid var(--border);
		display: flex;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 8px 20px;
		font-size: 13px;
		color: var(--muted);
	}

	@media (max-width: 960px) {
		.home {
			grid-template-columns: minmax(0, 1fr);
			gap: 22px;
			padding-bottom: 110px; /* room for the Play bar */
		}
		/* one column, in the order a player needs: hello, maps, settings, the rest */
		.col {
			display: contents;
		}
		.intro {
			order: 1;
		}
		.offline {
			order: 2;
		}
		.maps {
			order: 3;
		}
		.panel {
			order: 4;
		}
		.nudge {
			order: 5;
		}
		.recent {
			order: 6;
		}
		.howto {
			order: 7;
		}
		.panel {
			padding-bottom: 8px;
		}
		.friends {
			margin-bottom: 8px;
		}
		/* Play stays under the thumb */
		.btn-play {
			position: fixed;
			left: 16px;
			right: 16px;
			bottom: max(14px, env(safe-area-inset-bottom));
			margin: 0;
			z-index: 100;
		}
		.foot {
			padding-bottom: 110px;
		}
	}
	@media (max-width: 640px) {
		.home,
		.foot {
			padding-left: 16px;
			padding-right: 16px;
		}
		.maps {
			grid-template-columns: minmax(0, 1fr);
			gap: 14px;
		}
		.howto ol {
			grid-template-columns: 1fr;
		}
		.howto li {
			display: flex;
			align-items: center;
			gap: 14px;
		}
		.howto p {
			margin-top: 0;
		}
		.pic {
			flex: none;
		}
		.keys {
			display: none;
		}
	}
</style>
