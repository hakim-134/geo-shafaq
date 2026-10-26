<script lang="ts">
	import { onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import {
		api,
		call,
		ApiError,
		type Game,
		type Hint,
		type LatLon,
		type Round,
		type RoundResult
	} from '#lib/api/client.js';
	import { createViewer, PanoError, type PanoViewer } from '#lib/pano/index.js';
	import GuessMap from '#lib/map/GuessMap.svelte';
	import ResultMap, { type Pair } from '#lib/map/ResultMap.svelte';
	import { LAYERS, type BBox, type Layer } from '#lib/map/map.js';
	import { load, save } from '#lib/storage.js';
	import Compass from '#lib/components/Compass.svelte';
	import ScoreCard from '#lib/game/ScoreCard.svelte';
	import PlaceCard from '#lib/game/PlaceCard.svelte';
	import { i18n, t, tx, type Key } from '#lib/i18n/index.svelte.js';
	import { ensureSession, refreshMe, session } from '#lib/session.svelte.js';
	import { fmtClock, fmtDistance, fmtNum, nameHasAvatar, verdictKey } from '#lib/format.js';
	import { showToast } from '#lib/toast.svelte.js';
	import { beep, unlockAudio, vibrate } from '#lib/sfx.js';
	import { yandexKey } from '#lib/config.js';
	import { shareResult } from '#lib/game/share.js';

	type Phase = 'loading' | 'opening' | 'playing' | 'sending' | 'result' | 'final' | 'error';

	let phase = $state<Phase>('loading');
	let game = $state<Game | null>(null);
	let round = $state<Round | null>(null);
	let result = $state<RoundResult | null>(null);
	let guess = $state<LatLon | null>(null);
	let hints = $state<Hint[]>([]);
	let hintsLeft = $state(0);
	let heading = $state(0);
	let error = $state<{ key: Key; retry: (() => void) | null; getKey?: boolean }>({
		key: 'loading',
		retry: null
	});
	let bestBefore = 0;
	let finalPick = $state<number | null>(null); // a round chosen in the final table

	// timer
	let deadlineAt = 0;
	let left = $state<number | null>(null); // seconds, null = no limit
	let ticker: ReturnType<typeof setInterval> | undefined;
	let warned = new Set<number>();
	let lastTick = 0;
	const WARN_AT = [15, 10];

	// layout
	let mapOpen = $state(false); // phones: the map is a sheet you open
	let mapPinned = $state(false); // computers: keep the map big
	// the player's map look, remembered on this device; hard rules (no map labels) are satellite only
	let chosenLayer = $state<Layer>(
		LAYERS.includes(load('map_layer', 'map') as Layer) ? (load('map_layer', 'map') as Layer) : 'map'
	);
	const layer = $derived<Layer>(game && !game.rules.mapLabels ? 'satellite' : chosenLayer);
	function chooseLayer(l: Layer) {
		chosenLayer = l;
		save('map_layer', l);
	}
	function togglePinned() {
		mapPinned = !mapPinned;
	}
	let guessMap = $state<ReturnType<typeof GuessMap>>();

	// one viewer per provider, each in its own element; only the round's one is visible
	let panoRoot: HTMLDivElement;
	const viewers = new Map<string, { viewer: PanoViewer; el: HTMLDivElement }>();
	let activeProvider = $state('');

	const rules = $derived(game?.rules);
	const total = $derived(game?.total ?? 0);
	const done = $derived(game?.rounds.filter((r) => r.result) ?? []);
	const bbox = $derived((game?.map.bbox ?? [55.9, 37.1, 73.3, 45.7]) as BBox);
	const hintCost = $derived(rules?.hints.cost ?? 0);

	// ---------- start ----------
	let loadedId = '';
	$effect(() => {
		const id = page.params.id;
		if (id && id !== loadedId) {
			loadedId = id;
			start(id);
		}
	});

	async function start(id: string) {
		reset();
		phase = 'loading';
		try {
			await ensureSession();
			bestBefore = session.me?.stats.best ?? 0;
			game = await call(api().GET('/v1/games/{gameId}', { params: { path: { gameId: id } } }));
		} catch (e) {
			return fail(
				e instanceof ApiError && e.code === 'not_found' ? 'err_not_found' : 'err_network',
				() => start(id)
			);
		}
		if (game.status !== 'playing') return showFinal(false);
		const last = game.rounds.at(-1);
		if (last && !last.result) return openRound(last); // a reload in the middle of a round
		nextRound();
	}

	function reset() {
		stopTimer();
		round = null;
		result = null;
		guess = null;
		hints = [];
		finalPick = null;
		mapOpen = false;
	}

	async function nextRound() {
		if (!game) return;
		reset();
		phase = 'opening';
		try {
			const rd = await call(
				api().POST('/v1/games/{gameId}/rounds', { params: { path: { gameId: game.id } } })
			);
			await openRound(rd);
		} catch (e) {
			if (e instanceof ApiError && e.code === 'game_over') return showFinal(true);
			fail(errorKey(e), nextRound);
		}
	}

	// Opens the round's panorama, tells the server it is on screen (the clock starts), and
	// swaps a panorama the provider no longer has.
	async function openRound(rd: Round, swaps = 0): Promise<void> {
		if (!game) return;
		const g = game;
		round = rd;
		hints = rd.hints ?? [];
		hintsLeft = rd.hintsLeft;
		guess = null;
		phase = 'opening';
		guessMap?.fitArea();
		try {
			const v = await viewerFor(rd.view.provider);
			const { pos } = await v.open(rd.view);
			const shown = await call(
				api().POST('/v1/games/{gameId}/rounds/{n}/shown', {
					params: { path: { gameId: g.id, n: rd.n } },
					body: pos ? { pos } : {}
				})
			);
			round = shown;
			upsertRound(shown);
			startTimer(shown.remainingMs);
			phase = 'playing';
		} catch (e) {
			const notFound =
				(e instanceof PanoError && e.kind === 'not_found') ||
				(e instanceof ApiError && e.code === 'too_far');
			if (notFound && swaps < 5) {
				try {
					const next = await call(
						api().POST('/v1/games/{gameId}/rounds/{n}/fail', {
							params: { path: { gameId: g.id, n: rd.n } },
							body: { reason: 'not_found' }
						})
					);
					return openRound(next, swaps + 1);
				} catch (e2) {
					return fail(errorKey(e2), () => openRound(rd, swaps));
				}
			}
			if (e instanceof PanoError && e.kind === 'key') {
				// no key at all happens only on a developer's machine; players see a plain retry
				return yandexKey()
					? fail('keyFail', () => location.reload())
					: fail('noKey', () => location.reload(), true);
			}
			fail(notFound ? 'noPano' : errorKey(e), () => openRound(rd, swaps));
		}
	}

	async function viewerFor(provider: string): Promise<PanoViewer> {
		let v = viewers.get(provider);
		if (!v) {
			const el = document.createElement('div');
			el.className = 'pano-layer';
			panoRoot.appendChild(el);
			const viewer = await createViewer(provider, el, {
				lang: i18n.lang,
				labels: rules?.panoLabels ?? false,
				movement: rules?.movement ?? 'move',
				onHeading: (d) => (heading = d)
			});
			v = { viewer, el };
			viewers.set(provider, v);
		}
		for (const [p, x] of viewers) x.el.hidden = p !== provider;
		activeProvider = provider;
		return v.viewer;
	}

	function upsertRound(rd: Round) {
		if (!game) return;
		const i = game.rounds.findIndex((r) => r.n === rd.n);
		if (i >= 0) game.rounds[i] = rd;
		else game.rounds.push(rd);
	}

	// ---------- playing ----------
	function pick(p: LatLon) {
		if (phase === 'playing') guess = p;
	}

	async function submit() {
		if (phase !== 'playing' || !game || !round) return;
		phase = 'sending';
		stopTimer();
		mapOpen = false;
		try {
			const res = await call(
				api().POST('/v1/games/{gameId}/rounds/{n}/guess', {
					params: { path: { gameId: game.id, n: round.n } },
					body: guess ? { pos: guess } : {}
				})
			);
			result = res;
			game.total = res.total ?? game.total;
			upsertRound({ ...round, result: res });
			phase = 'result';
		} catch (e) {
			phase = 'playing';
			showToast(t(errorKey(e)));
		}
	}

	async function useHint() {
		if (phase !== 'playing' || !game || !round || hintsLeft <= 0) return;
		try {
			const h = await call(
				api().POST('/v1/games/{gameId}/rounds/{n}/hint', {
					params: { path: { gameId: game.id, n: round.n } }
				})
			);
			hints = [...hints, h];
			hintsLeft--;
			if (window.innerWidth <= 700) openMap(true);
		} catch (e) {
			showToast(t(errorKey(e)));
		}
	}

	function backToStart() {
		if (phase === 'playing') viewers.get(activeProvider)?.viewer.reset();
	}

	// ---------- the clock ----------
	function startTimer(remainingMs: number | undefined) {
		stopTimer();
		if (!rules?.timeSec || remainingMs === undefined) {
			left = null;
			return;
		}
		deadlineAt = Date.now() + remainingMs;
		const startLeft = remainingMs / 1000;
		warned = new Set(WARN_AT.filter((w) => startLeft <= w)); // a reload below a warning skips it
		lastTick = 0;
		tickTimer();
		ticker = setInterval(tickTimer, 250);
	}

	function tickTimer() {
		left = Math.max((deadlineAt - Date.now()) / 1000, 0);
		const s = Math.ceil(left);
		const due = WARN_AT.filter((w) => s <= w && !warned.has(w));
		if (due.length) {
			due.forEach((w) => warned.add(w));
			showToast(`${t('secondsLeft', { n: s })}${guess ? '' : ` ${t('placePin')}`}`, 2500);
			beep(s <= 10 ? 990 : 740, 0.18);
			if (s <= 10) vibrate(150);
		} else if (s <= 5 && s > 0 && s !== lastTick) {
			beep(1200, 0.06);
		}
		lastTick = s;
		if (left <= 0) {
			stopTimer();
			showToast(t('timeUp'));
			submit(); // the pin placed so far counts
		}
	}

	function stopTimer() {
		clearInterval(ticker);
		ticker = undefined;
	}

	const danger = $derived(left !== null && phase === 'playing' && left <= WARN_AT[0]);
	const dangerLevel = $derived(left === null ? 0 : Math.min(Math.max(1 - left / WARN_AT[0], 0), 1));

	// ---------- results ----------
	async function showFinal(justFinished: boolean) {
		if (!game) return;
		stopTimer();
		try {
			game = await call(api().GET('/v1/games/{gameId}', { params: { path: { gameId: game.id } } }));
		} catch {
			/* keep what we have */
		}
		phase = 'final';
		if (justFinished) refreshMe().catch(() => {});
	}

	// a game opened by its link from someone else: whose it is, and "play this map"
	const mine = $derived(!game || game.player.id === session.me?.user.id);

	const newBest = $derived(
		mine &&
			phase === 'final' &&
			game?.status === 'finished' &&
			total > bestBefore &&
			bestBefore >= 0
	);

	const finalPairs = $derived<Pair[]>(
		done
			.filter((r, i) => finalPick === null || i === finalPick)
			.map((r) => ({ actual: r.result!.actual, guess: r.result!.guess, label: String(r.n) }))
	);

	function label(r: RoundResult): string {
		const p = r.place;
		return tx(p.street ?? p.district ?? p.city ?? p.region) || '—';
	}

	async function playAgain() {
		if (!game) return;
		try {
			const g = await call(
				api().POST('/v1/games', { body: { map: game.map.slug, rules: game.rules } })
			);
			goto(`/game/${g.id}`);
		} catch (e) {
			showToast(t(e instanceof ApiError && e.code === 'banned' ? 'bannedText' : errorKey(e)), 3500);
		}
	}

	function share() {
		if (game) shareResult(game, label);
	}

	// ---------- errors ----------
	function errorKey(e: unknown): Key {
		if (e instanceof PanoError) return e.kind === 'not_found' ? 'noPano' : 'viewerFail';
		if (e instanceof ApiError) {
			if (e.code === 'network') return 'err_network';
			if (e.code === 'no_panorama') return 'err_no_panorama';
			if (e.code === 'daily_cap') return 'err_daily_cap';
			if (e.code === 'not_found') return 'err_not_found';
		}
		return 'err_other';
	}

	function fail(key: Key, retry: (() => void) | null, getKey = false) {
		stopTimer();
		error = { key, retry, getKey };
		phase = 'error';
	}

	// ---------- layout and keys ----------
	function openMap(open = !mapOpen) {
		mapOpen = open;
	}

	function onKey(e: KeyboardEvent) {
		if ((e.target as HTMLElement).closest('input, textarea')) return;
		if (phase === 'result' || phase === 'final') {
			if (e.key === 'Enter') {
				e.preventDefault();
				if (phase === 'result') result?.gameOver ? showFinal(true) : nextRound();
			}
			return;
		}
		if (phase !== 'playing') return;
		const k = e.key.toLowerCase();
		if (e.key === ' ' && guess) {
			e.preventDefault();
			submit();
		} else if (k === 'h') useHint();
		else if (k === 'r') backToStart();
		else if (k === 'm') {
			if (window.innerWidth <= 700) openMap();
			else togglePinned();
		}
	}

	onDestroy(() => {
		stopTimer();
		for (const { viewer } of viewers.values()) viewer.destroy();
	});
</script>

<svelte:window onkeydown={onKey} onpointerdown={unlockAudio} />
<svelte:head><title>{game ? tx(game.map.name) : ''} — Shafaq Geo</title></svelte:head>

<div class="game">
	<div class="pano" bind:this={panoRoot}></div>
	{#if rules?.movement === 'nmpz' && phase === 'playing'}
		<div class="freeze" aria-hidden="true"></div>
	{/if}
	<div
		class="danger"
		class:on={danger}
		class:fast={danger && (left ?? 99) <= 10}
		style:--danger={dangerLevel}
	></div>

	{#if game}
		<div class="hud">
			<div class="group">
				<a class="logo" href="/" title={t('menu')}
					><img src="/mark.svg" alt="Shafaq Geo" width="30" height="30" /></a
				>
				<div class="chip">
					<span class="chip-label">{t('round')}</span>
					<span class="chip-value">{round?.n ?? done.length} / {game.rules.rounds}</span>
					<span class="dots">
						{#each { length: game.rules.rounds } as _, i (i)}
							{@const r = game.rounds[i]?.result}
							<i
								class={r
									? r.score >= 4000
										? 'hi'
										: r.score >= 2000
											? 'mid'
											: 'lo'
									: round?.n === i + 1
										? 'now'
										: ''}
							></i>
						{/each}
					</span>
				</div>
				<div class="chip">
					<span class="chip-label">{t('score')}</span>
					<span class="chip-value">{fmtNum(total)}</span>
				</div>
				{#if left !== null}
					<div class="chip timer" class:warn={left <= 15 && left > 10} class:low={left <= 10}>
						<span class="chip-label">{t('time')}</span>
						<span class="chip-value">{fmtClock(left)}</span>
					</div>
				{/if}
			</div>
			<div class="group">
				{#if game.rules.hints.count > 0}
					<button
						class="hud-btn"
						onclick={useHint}
						disabled={phase !== 'playing' || hintsLeft <= 0}
						title={t('hint')}
					>
						<svg class="icon" viewBox="0 0 24 24"
							><path
								d="M9 18h6M10 21.5h4M12 2.5a6.5 6.5 0 0 0-3.8 11.8V16.5h7.6v-2.2A6.5 6.5 0 0 0 12 2.5z"
							/></svg
						>
						<span class="label">{t('hint')}</span>
						<span class="tag" class:cost={hintCost > 0}
							>{hintCost > 0 ? `−${Math.round(hintCost * 100)}%` : t('hintFree')}</span
						>
					</button>
				{/if}
				{#if rules?.movement !== 'nmpz'}
					<button class="hud-btn" onclick={backToStart} title={t('backToStart')}>
						<svg class="icon" viewBox="0 0 24 24"
							><path d="M3.5 12a8.5 8.5 0 1 0 2.8-6.3L3.5 8.3" /><path d="M3.5 3.5v4.8h4.8" /></svg
						>
						<span class="label">{t('backToStart')}</span>
					</button>
				{/if}
				<a class="hud-btn" href="/" title={t('menu')}>
					<svg class="icon" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
					<span class="label">{t('menu')}</span>
				</a>
			</div>
		</div>

		{#if hints.length && phase === 'playing'}
			<div class="hint-banner">
				{t(hints.at(-1)!.kind === 'district' ? 'district' : 'region')}: {tx(hints.at(-1)!.text)}
			</div>
		{/if}

		{#if game.rules.compass && phase === 'playing'}
			<div class="compass-spot"><Compass {heading} /></div>
		{/if}

		<div
			class="minimap"
			class:open={mapOpen}
			class:pinned={mapPinned}
			class:hidden={phase === 'final' || phase === 'result'}
		>
			<div class="map-toolbar">
				{#if game.rules.mapLabels}
					{#each LAYERS as l (l)}
						<button aria-pressed={layer === l} onclick={() => chooseLayer(l)}>{t(l)}</button>
					{/each}
				{:else}
					<span class="toolbar-note">{t('satellite')}</span>
				{/if}
				<button
					class="size-btn"
					aria-pressed={mapPinned}
					aria-label={t('bigMap')}
					title={t('bigMap')}
					onclick={togglePinned}
				>
					<svg viewBox="0 0 24 24"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" /></svg>
				</button>
			</div>
			<div class="map-box">
				<GuessMap
					bind:this={guessMap}
					{bbox}
					{layer}
					{hints}
					{guess}
					active={phase === 'playing'}
					onpick={pick}
				/>
			</div>
			<button class="btn btn-guess" disabled={!guess || phase !== 'playing'} onclick={submit}>
				{guess ? t('guess') : t('placePin')}
			</button>
		</div>
		{#if phase === 'playing'}
			<button class="btn map-fab" onclick={() => openMap()}>{mapOpen ? '✕' : t('map')}</button>
		{/if}
	{/if}

	{#if phase === 'loading' || phase === 'opening' || phase === 'error'}
		<div class="loader girih">
			<img class="mark" src="/mark.svg" alt="" width="64" height="64" />
			<div class="loader-text">
				{phase === 'error' ? t(error.key) : phase === 'loading' ? t('starting') : t('loading')}
			</div>
			{#if phase === 'error'}
				<div class="loader-actions">
					{#if error.retry}<button class="btn btn-primary" onclick={error.retry}
							>{t('retry')}</button
						>{/if}
					{#if error.getKey}<a
							class="btn btn-ghost"
							href="https://developer.tech.yandex.ru/services"
							target="_blank"
							rel="noopener">{t('getKey')}</a
						>{/if}
					<a class="btn btn-ghost" href="/">{t('menu')}</a>
				</div>
			{/if}
		</div>
	{/if}

	{#if game && phase === 'result' && result}
		<div class="overlay">
			<div class="side">
				<div>
					<div class="sub">{t('round')} {round?.n} / {game.rules.rounds}</div>
					<div class="title">
						{result.late ? t('late') : result.guess ? t(verdictKey(result.score)) : t('noGuess')}
					</div>
				</div>
				<ScoreCard label={t('score')} score={result.score} max={5000} km={result.km ?? null} />
				<PlaceCard place={result.place} at={result.actual} />
				<div class="legend">
					<span class="l-actual">{t('actual')}</span><span class="l-guess">{t('yourGuess')}</span>
				</div>
				<div class="actions">
					<button
						class="btn btn-primary"
						onclick={() => (result?.gameOver ? showFinal(true) : nextRound())}
					>
						{result.gameOver ? t('finish') : t('next')}
					</button>
					<a class="btn btn-ghost" href="/">{t('menu')}</a>
				</div>
			</div>
			<div class="overlay-map">
				<ResultMap
					{bbox}
					layer={chosenLayer}
					pairs={[{ actual: result.actual, guess: result.guess }]}
				/>
			</div>
		</div>
	{/if}

	{#if game && phase === 'final'}
		<div class="overlay">
			<div class="side">
				<div>
					<div class="sub">{tx(game.map.name)}</div>
					<div class="title">
						{newBest
							? t('newBest')
							: mine
								? t('gameOver')
								: t('playerGame', { name: game.player.name })}
					</div>
					<a class="player" href={mine ? '/me' : `/u/${game.player.id}`}>
						{#if !nameHasAvatar(game.player)}<span class="avatar">{game.player.avatar}</span>{/if}
						<span>{game.player.name}</span>
					</a>
				</div>
				<ScoreCard
					label={t('total')}
					score={total}
					max={game.max}
					km={done.reduce((s, r) => s + (r.result?.km ?? 0), 0)}
				/>
				<table class="rounds">
					<tbody>
						{#each done as r, i (r.n)}
							<tr
								class:picked={finalPick === i}
								onclick={() => (finalPick = finalPick === i ? null : i)}
							>
								<td>{r.n}</td>
								<td>{label(r.result!)}</td>
								<td>{r.result!.km != null ? fmtDistance(r.result!.km) : '—'}</td>
								<td>{fmtNum(r.result!.score)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
				<div class="legend">
					<span class="l-actual">{t('actual')}</span><span class="l-guess">{t('yourGuess')}</span>
				</div>
				<div class="actions">
					<button class="btn btn-primary" onclick={playAgain}
						>{mine ? t('playAgain') : t('playThisMap')}</button
					>
					<button class="btn btn-sky" onclick={share}>{t('share')}</button>
					<a class="btn btn-ghost" href="/">{t('menu')}</a>
				</div>
			</div>
			<div class="overlay-map">
				<ResultMap {bbox} layer={chosenLayer} pairs={finalPairs} />
			</div>
		</div>
	{/if}
</div>

<style>
	.game {
		position: fixed;
		inset: 0;
		overflow: hidden;
		background: #000;
		color: #fff;
	}
	.pano,
	.pano :global(.pano-layer) {
		position: absolute;
		inset: 0;
	}
	/* hide the Yandex address line and "open in Yandex Maps": they give the answer away */
	.pano :global([class*='panorama-gotoymaps']),
	.pano :global([class*='panorama-control__name']),
	.pano :global([class*='panorama-control__close']),
	.pano :global([class*='panorama-control__fullscreen']) {
		display: none !important;
	}
	.freeze {
		position: absolute;
		inset: 0;
		z-index: 10;
	}

	/* low time: red creeps in from the edges, like low health in a game */
	.danger {
		position: fixed;
		inset: 0;
		z-index: 999;
		pointer-events: none;
		opacity: 0;
		transition: opacity 0.5s;
	}
	.danger::after {
		content: '';
		position: absolute;
		inset: 0;
		background: radial-gradient(
			ellipse at center,
			transparent 50%,
			rgba(206, 17, 38, 0.35) 78%,
			rgba(150, 0, 20, 0.75) 100%
		);
		box-shadow: inset 0 0 140px rgba(206, 17, 38, 0.55);
		animation: heartbeat 1.1s ease-in-out infinite;
	}
	.danger.on {
		opacity: calc(0.45 + 0.55 * var(--danger, 0));
	}
	.danger.fast::after {
		animation-duration: 0.6s;
	}
	@keyframes heartbeat {
		0%,
		100% {
			opacity: 0.55;
		}
		50% {
			opacity: 1;
		}
	}

	/* HUD */
	.hud {
		position: fixed;
		top: max(14px, env(safe-area-inset-top));
		left: 14px;
		right: 14px;
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 10px;
		pointer-events: none;
		z-index: 1000;
	}
	.group {
		display: flex;
		gap: 8px;
		align-items: stretch;
		flex-wrap: wrap;
		pointer-events: auto;
	}
	.logo,
	.chip,
	.hud-btn {
		background: var(--hud);
		color: #fff;
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		border-radius: 14px;
	}
	.logo {
		display: grid;
		place-items: center;
		width: 52px;
	}
	.chip {
		padding: 7px 14px;
		display: flex;
		flex-direction: column;
		justify-content: center;
		min-width: 74px;
	}
	.chip-label {
		font-size: 10.5px;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		opacity: 0.65;
	}
	.chip-value {
		font-family: var(--display);
		font-weight: 700;
		font-size: 18px;
		line-height: 1.25;
		font-variant-numeric: tabular-nums;
	}
	.timer.warn .chip-value {
		color: #ffc94d;
	}
	.timer.low .chip-value {
		color: #ff7a8a;
	}
	.timer.warn {
		animation: pulse 1s ease-in-out infinite;
	}
	.timer.low {
		animation: pulse 0.5s ease-in-out infinite alternate;
		box-shadow: 0 0 0 2px rgba(206, 17, 38, 0.6);
	}
	@keyframes pulse {
		50% {
			transform: scale(1.08);
		}
	}
	.dots {
		display: flex;
		gap: 4px;
		margin-top: 4px;
	}
	.dots i {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.22);
	}
	.dots i.now {
		background: #fff;
	}
	.dots i.hi {
		background: #36c853;
	}
	.dots i.mid {
		background: #e0b44e;
	}
	.dots i.lo {
		background: #f04157;
	}
	.hud-btn {
		height: 48px;
		border: none;
		padding: 0 15px;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		font-size: 14px;
		font-weight: 500;
		text-decoration: none;
		align-self: flex-start;
	}
	.hud-btn:hover:not(:disabled) {
		background: rgba(12, 20, 36, 0.95);
	}
	.hud-btn:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.hud-btn .tag {
		font-size: 11px;
		font-weight: 600;
		padding: 2px 7px;
		border-radius: 7px;
		background: #1eb53a;
	}
	.hud-btn .tag.cost {
		background: #ce1126;
	}
	.hint-banner {
		position: fixed;
		top: 84px;
		left: 50%;
		transform: translateX(-50%);
		background: var(--sky);
		color: #fff;
		padding: 10px 18px;
		border-radius: 12px;
		font-weight: 600;
		box-shadow: var(--shadow);
		z-index: 1000;
		white-space: nowrap;
	}
	/* under the HUD: the bottom corners belong to the viewers' own controls */
	.compass-spot {
		position: fixed;
		left: 14px;
		top: 92px;
		z-index: 1000;
	}

	/* the guess map */
	.minimap {
		position: fixed;
		right: 16px;
		bottom: 16px;
		z-index: 1000;
		width: 340px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		transition: width 0.25s;
	}
	.minimap.hidden {
		visibility: hidden;
	}
	.minimap:not(.pinned) {
		opacity: 0.88;
	}
	.minimap:hover,
	.minimap.pinned {
		opacity: 1;
		width: min(580px, calc(100vw - 32px));
	}
	/* v0's toolbar: the map's look, and keep it big */
	.map-toolbar {
		display: flex;
		gap: 6px;
	}
	.map-toolbar button,
	.toolbar-note {
		flex: 1;
		height: 34px;
		border: none;
		border-radius: 10px;
		background: var(--hud);
		color: #fff;
		font-size: 13px;
		font-weight: 500;
		display: grid;
		place-items: center;
	}
	.map-toolbar button[aria-pressed='true'] {
		background: var(--sky);
	}
	.map-toolbar .size-btn {
		flex: 0 0 34px;
	}
	.size-btn svg {
		width: 15px;
		height: 15px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2.2;
		stroke-linecap: round;
	}
	.map-box {
		height: 250px;
		border-radius: 14px;
		overflow: hidden;
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
		transition: height 0.25s;
		background: #dfe3e0;
	}
	.minimap:hover .map-box,
	.minimap.pinned .map-box {
		height: min(430px, calc(100vh - 230px));
	}
	.btn-guess {
		width: 100%;
		background: var(--green);
		color: #fff;
	}
	.btn-guess:hover:not(:disabled) {
		background: var(--green-ink);
	}
	.btn-guess:disabled {
		background: var(--hud);
		opacity: 1;
		color: rgba(255, 255, 255, 0.75);
		font-family: var(--body);
		font-weight: 500;
	}
	.map-fab {
		display: none;
	}

	/* loader */
	.loader {
		position: fixed;
		inset: 0;
		z-index: 3000;
		background: var(--bg);
		color: var(--text);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 18px;
		padding: 24px;
		text-align: center;
	}
	.mark {
		animation: bob 1.4s ease-in-out infinite;
	}
	@keyframes bob {
		50% {
			transform: translateY(-8px);
		}
	}
	.loader-text {
		font-family: var(--display);
		font-weight: 700;
		font-size: 17px;
		max-width: 420px;
	}
	.loader-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		justify-content: center;
	}

	/* results */
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 2000;
		background: var(--bg);
		color: var(--text);
		display: grid;
		grid-template-columns: 380px minmax(0, 1fr);
		grid-template-rows: minmax(0, 1fr);
	}
	.side {
		min-height: 0;
		padding: 26px 24px;
		display: flex;
		flex-direction: column;
		gap: 16px;
		overflow-y: auto;
		background: var(--surface);
		border-right: 1px solid var(--border);
	}
	.sub {
		font-size: 13px;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--muted);
	}
	.title {
		margin-top: 4px;
		font-family: var(--display);
		font-weight: 800;
		font-size: 32px;
		line-height: 1.1;
		letter-spacing: -0.02em;
	}
	.player {
		margin-top: 10px;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 6px 12px;
		border-radius: 999px;
		background: var(--bg);
		text-decoration: none;
		font-weight: 600;
		font-size: 14px;
	}
	.player:has(.avatar) {
		padding-left: 4px;
	}
	.player .avatar {
		width: 28px;
		height: 28px;
		font-size: 16px;
		background: var(--surface);
	}
	.legend {
		display: flex;
		gap: 16px;
		font-size: 13px;
		color: var(--muted);
	}
	.legend span::before {
		content: '';
		display: inline-block;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		margin-right: 6px;
	}
	.l-actual::before {
		background: #1eb53a;
	}
	.l-guess::before {
		background: #0099b5;
	}
	.actions {
		margin-top: auto;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.actions .btn {
		width: 100%;
	}
	.overlay-map {
		position: relative;
		min-height: 300px;
	}
	.overlay-map > :global(div) {
		position: absolute;
		inset: 0;
	}
	.rounds {
		width: 100%;
		border-collapse: collapse;
		font-size: 14px;
	}
	.rounds td {
		padding: 9px 4px;
		border-bottom: 1px solid var(--border);
	}
	.rounds td:first-child {
		color: var(--muted);
		width: 26px;
	}
	.rounds td:last-child {
		text-align: right;
		font-family: var(--display);
		font-weight: 700;
	}
	.rounds tr {
		cursor: pointer;
	}
	.rounds tr:hover td,
	.rounds tr.picked td {
		background: color-mix(in srgb, var(--sky) 10%, transparent);
	}

	@media (max-width: 760px) {
		.overlay {
			grid-template-columns: 1fr;
			grid-template-rows: 40vh minmax(0, 1fr);
		}
		.overlay-map {
			order: -1;
		}
		.side {
			border-right: none;
			border-top: 1px solid var(--border);
			padding: 18px 16px;
			gap: 14px;
		}
		.title {
			font-size: 26px;
		}
		/* the next step stays under the thumb, however long the card above it */
		.actions {
			position: sticky;
			bottom: 0;
			margin: auto -16px -18px;
			padding: 12px 16px max(14px, env(safe-area-inset-bottom));
			background: var(--surface);
			box-shadow: 0 -8px 16px -8px rgba(0, 0, 0, 0.15);
		}
	}
	@media (max-width: 700px) {
		.hud {
			top: max(10px, env(safe-area-inset-top));
			left: 10px;
			right: 10px;
		}
		.logo {
			display: none;
		}
		.chip {
			padding: 6px 10px;
			min-width: 0;
		}
		.chip-value {
			font-size: 16px;
		}
		.hud-btn {
			height: 44px;
			padding: 0 12px;
		}
		.hud-btn .label {
			display: none;
		}
		.hint-banner {
			top: 76px;
			white-space: normal;
			max-width: calc(100vw - 32px);
		}
		.compass-spot {
			top: 140px;
			left: 10px;
		}
		.minimap {
			left: 10px;
			right: 10px;
			bottom: 10px;
			width: auto;
			opacity: 1;
			visibility: hidden;
		}
		.minimap.open {
			visibility: visible;
		}
		.minimap:hover,
		.minimap.pinned {
			width: auto;
		}
		.map-box,
		.minimap:hover .map-box,
		.minimap.pinned .map-box {
			height: 55vh;
		}
		.map-toolbar .size-btn {
			display: none;
		}
		.map-fab {
			display: inline-flex;
			position: fixed;
			right: 14px;
			bottom: max(14px, env(safe-area-inset-bottom));
			z-index: 1001;
			height: 56px;
			background: var(--sky);
			color: #fff;
			box-shadow: var(--shadow);
		}
		.minimap.open ~ .map-fab {
			bottom: auto;
			top: 70px;
		}
	}
</style>
