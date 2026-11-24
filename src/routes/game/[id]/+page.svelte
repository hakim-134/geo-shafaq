<script lang="ts">
	import { tick } from 'svelte';
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
		type RoundResult,
		type Schemas
	} from '#lib/api/client.js';
	import { PanoError } from '#lib/pano/index.js';
	import RoundView, { type Status } from '#lib/game/RoundView.svelte';
	import ResultMap, { type Pair } from '#lib/map/ResultMap.svelte';
	import { savedLayer, type BBox } from '#lib/map/map.js';
	import PlaceInParent from '#lib/maps/PlaceInParent.svelte';
	import { loadChoice, rulesFor, saveChoice, testProviders } from '#lib/rules.js';
	import Loader from '#lib/game/Loader.svelte';
	import ResultLayout from '#lib/game/ResultLayout.svelte';
	import FiveK from '#lib/game/FiveK.svelte';
	import { fiveKVisible } from '#lib/game/five-k.svelte.js';
	import RoundReveal from '#lib/game/RoundReveal.svelte';
	import ScoreCount from '#lib/game/ScoreCount.svelte';
	import Stars from '#lib/game/Stars.svelte';
	import Confetti from '#lib/game/Confetti.svelte';
	import EndStreets, { type EndRound } from '#lib/game/EndStreets.svelte';
	import { sfxFanfare } from '#lib/sfx.svelte.js';
	import { t, tx, type Key } from '#lib/i18n/index.svelte.js';
	import { ensureSession, refreshMe, session } from '#lib/session.svelte.js';
	import { fmtDistance, fmtNum, nameHasAvatar, starsFor } from '#lib/format.js';
	import { showToast } from '#lib/toast.svelte.js';
	import { yandexKey } from '#lib/config.js';
	import Coin from '#lib/barg/Coin.svelte';
	import { challengeCode, challengeShare, nativeShare, type Share } from '#lib/game/share.js';
	import ChallengeBoard from '#lib/game/ChallengeBoard.svelte';
	import ShareSheet from '#lib/components/ShareSheet.svelte';

	type Phase = 'loading' | 'opening' | 'playing' | 'sending' | 'result' | 'final' | 'error';

	let phase = $state<Phase>('loading');
	let game = $state<Game | null>(null);
	let round = $state<Round | null>(null);
	let result = $state<RoundResult | null>(null);
	let guess = $state<LatLon | null>(null);
	let hints = $state<Hint[]>([]);
	let hintsLeft = $state(0);
	let error = $state<{ key: Key; retry: (() => void) | null; getKey?: boolean }>({
		key: 'loading',
		retry: null
	});
	let bestBefore = 0;
	let gamesBefore = $state(0); // 0: this is the player's first game, and its score no record yet
	let finalPick = $state<number | null>(null); // a round chosen in the final table
	let landed = $state(false); // the real pin is on the result map: the result plays
	let rv = $state<ReturnType<typeof RoundView>>();

	const endless = $derived(game?.rules.rounds === 0);
	const total = $derived(game?.total ?? 0);
	const done = $derived(game?.rounds.filter((r) => r.result) ?? []);
	let countedRound = $state<string>();
	const perfectRound = $derived(
		phase === 'result' && landed && result?.score === 5000 && game && round
			? `solo:${game.id}:${round.n}`
			: undefined
	);
	const showFiveK = fiveKVisible(
		() => (countedRound === perfectRound ? perfectRound : undefined),
		() => 0
	);
	const bbox = $derived((game?.map.bbox ?? [55.9, 37.1, 73.3, 45.7]) as BBox);
	const status = $derived<Status>(
		phase === 'playing'
			? 'playing'
			: phase === 'sending'
				? 'sending'
				: phase === 'result' || phase === 'final'
					? 'off'
					: 'opening'
	);
	const dots = $derived(
		Array.from({ length: endless ? 0 : (game?.rules.rounds ?? 0) }, (_, i) => {
			const r = game?.rounds[i]?.result;
			if (r) return r.score >= 4000 ? 'hi' : r.score >= 2000 ? 'mid' : 'lo';
			return round?.n === i + 1 ? 'now' : '';
		})
	);

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
			gamesBefore = session.me?.stats.games ?? 0;
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
		rv?.stopTimer();
		round = null;
		result = null;
		guess = null;
		hints = [];
		finalPick = null;
		board = null;
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
		await tick(); // the round's view is on the page
		try {
			const { pos } = await rv!.open(rd.view);
			const shown = await call(
				api().POST('/v1/games/{gameId}/rounds/{n}/shown', {
					params: { path: { gameId: g.id, n: rd.n } },
					body: pos ? { pos } : {}
				})
			);
			round = shown;
			upsertRound(shown);
			rv!.startTimer(shown.remainingMs);
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
		rv?.stopTimer();
		rv?.closeMap();
		try {
			const res = await call(
				api().POST('/v1/games/{gameId}/rounds/{n}/guess', {
					params: { path: { gameId: game.id, n: round.n } },
					body: guess ? { pos: guess } : {}
				})
			);
			result = res;
			earnedHere = [...earnedHere, ...(res.earned ?? [])];
			game.total = res.total ?? game.total;
			upsertRound({ ...round, result: res });
			landed = false;
			phase = 'result';
		} catch (e) {
			phase = 'playing';
			showToast(t(errorKey(e)));
		}
	}

	async function useHint(): Promise<boolean> {
		if (phase !== 'playing' || !game || !round || hintsLeft <= 0) return false;
		try {
			const h = await call(
				api().POST('/v1/games/{gameId}/rounds/{n}/hint', {
					params: { path: { gameId: game.id, n: round.n } }
				})
			);
			hints = [...hints, h];
			hintsLeft--;
			return true;
		} catch (e) {
			showToast(t(errorKey(e)));
			return false;
		}
	}

	// The pin normally starts the reveal. Keep the map fallback scoped to this result.
	$effect(() => {
		if (phase !== 'result' || landed) return;
		const timer = setTimeout(() => (landed = true), 2600);
		return () => clearTimeout(timer);
	});

	// ---------- results ----------
	async function showFinal(justFinished: boolean) {
		if (!game) return;
		rv?.stopTimer();
		try {
			game = await call(api().GET('/v1/games/{gameId}', { params: { path: { gameId: game.id } } }));
		} catch {
			/* keep what we have */
		}
		phase = 'final';
		if (justFinished) refreshMe().catch(() => {});
	}

	const starsWon = $derived(done.reduce((s, r) => s + starsFor(r.result!.score), 0));
	// the whole way off, cut so the distance can be set in display lettering
	const tally = $derived.by(() => {
		const d = fmtDistance(done.reduce((s, r) => s + (r.result?.km ?? 0), 0));
		const text = t('totalKm', { km: d });
		const i = text.indexOf(d);
		return i < 0 ? [text, '', ''] : [text.slice(0, i), d, text.slice(i + d.length)];
	});

	// the end's list of this game's streets
	const endRounds = $derived<EndRound[]>(
		done.map((r) => ({
			n: r.n,
			place: r.result!.place,
			score: r.result!.score,
			base: r.result!.base,
			hintsUsed: r.result!.hintsUsed
		}))
	);

	// a room's game, opened later: everyone's total, as a board
	const roomBoard = $derived<Schemas['ChallengeRow'][]>(
		game?.room?.players.map((row, i) => ({
			place: i + 1,
			player: row.player,
			total: row.total,
			game: row.game,
			hints: row.hints
		})) ?? []
	);
	$effect(() => {
		if (newBest) setTimeout(sfxFanfare, 600);
	});

	// a game opened by its link from someone else: whose it is, and "play this map"
	const mine = $derived(!game || game.player.id === session.me?.user.id);

	const newBest = $derived(
		mine &&
			!endless &&
			!game?.room &&
			phase === 'final' &&
			game?.status === 'finished' &&
			total > bestBefore &&
			bestBefore >= 0 &&
			!game.map.slug.startsWith('miss-') // practice: the streets were just shown to the player
	);

	const finalPairs = $derived<Pair[]>(
		done
			.filter((r, i) => finalPick === null || i === finalPick)
			// the badge and its guess carry the same round number
			.map((r) => ({
				actual: r.result!.actual,
				heading: r.result!.heading,
				guess: r.result!.guess,
				label: String(r.n),
				guessLabel: String(r.n)
			}))
	);

	async function playAgain(map = game?.map.slug) {
		if (!game || !map) return;
		try {
			// the missed map: the player's own settings, its last game was cut to the streets left
			const rules = missMap ? rulesFor(loadChoice(), testProviders()) : game.rules;
			const g = await call(api().POST('/v1/games', { body: { map, rules } }));
			if (!missMap) saveChoice({ ...loadChoice(), map }); // the home's sign: the last place played
			goto(`/game/${g.id}`);
		} catch (e) {
			showToast(t(e instanceof ApiError && e.code === 'banned' ? 'bannedText' : errorKey(e)), 3500);
		}
	}

	// Barg this game earned, while the page is open, and what for
	let earnedHere = $state<Schemas['Earned'][]>([]);
	const earnedSum = $derived(earnedHere.reduce((sum, e) => sum + e.amount, 0));
	const earnedFor = $derived.by(() => {
		const n = (r: string) => earnedHere.filter((e) => e.reason === r).length;
		return [
			n('street') ? t('earnedStreets', { n: n('street') }) : '',
			n('district') ? t('earnedDistricts', { n: n('district') }) : '',
			n('challenge') ? t('earnedWin') : ''
		]
			.filter(Boolean)
			.join(', ');
	});

	// Streets I miss: the end says what left the list and how many are left; none left, no more game
	const missMap = $derived(game?.map.slug.startsWith('miss-') ?? false);
	let missedLeft = $state<number | null>(null);
	$effect(() => {
		if (phase !== 'final' || !missMap || !mine) return;
		call(api().GET('/v1/me/missed'))
			.then((d) => (missedLeft = d.streets.length))
			.catch(() => {
				/* the end stands without the count */
			});
	});
	const missedGot = $derived(
		new Set(
			done.filter((r) => (r.result?.km ?? Infinity) <= 0.5).map((r) => r.result?.place.street?.uz)
		).size
	);

	// "start narrow, go wide": after a good game in a place, the place around it
	const wider = $derived(
		mine &&
			phase === 'final' &&
			game?.status === 'finished' &&
			game.max > 0 &&
			total / game.max >= 0.7
			? game.map.parent
			: undefined
	);
	function goWider() {
		if (wider) playAgain(wider.map);
	}

	// an endless game ends when the player says so
	async function finishGame() {
		if (!game) return;
		rv?.stopTimer();
		try {
			game = await call(
				api().POST('/v1/games/{gameId}/finish', { params: { path: { gameId: game.id } } })
			);
			phase = 'final';
			refreshMe().catch(() => {});
		} catch (e) {
			showToast(t(errorKey(e)));
		}
	}

	// the same streets for a friend: a challenge's link; the phone's share sheet, or our own
	let sharing = $state<Share | null>(null);
	let inviting = $state(false);
	async function share() {
		if (!game || inviting) return;
		inviting = true;
		try {
			const s = challengeShare(game, await challengeCode(game.id));
			if (!(await nativeShare(s))) sharing = s;
		} catch (e) {
			showToast(t(errorKey(e)));
		}
		inviting = false;
	}

	// a game of a challenge ends on its leaderboard
	let board = $state<Schemas['Challenge'] | null>(null);
	$effect(() => {
		const code = game?.challenge;
		if (phase !== 'final' || !code) return;
		call(api().GET('/v1/challenges/{code}', { params: { path: { code } } }))
			.then((c) => (board = c))
			.catch(() => {
				/* the game's own numbers stand without it */
			});
	});
	const boardPlace = $derived(mine ? board?.you?.place : undefined);

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
		rv?.stopTimer();
		error = { key, retry, getKey };
		phase = 'error';
	}

	function onKey(e: KeyboardEvent) {
		if ((e.target as HTMLElement).closest('input, textarea')) return;
		if (phase === 'result' && e.key === 'Enter') {
			e.preventDefault();
			afterResult();
		}
	}

	function afterResult() {
		if (result?.gameOver) showFinal(true);
		else nextRound();
	}
</script>

<svelte:window onkeydown={onKey} />
<svelte:head><title>{game ? tx(game.map.name) : ''} — GeoShafaq</title></svelte:head>

<div class="game">
	{#if game && game.status === 'playing'}
		<RoundView
			bind:this={rv}
			rules={game.rules}
			map={game.map}
			{bbox}
			n={round?.n ?? done.length}
			rounds={endless ? 0 : game.rules.rounds}
			{dots}
			{total}
			{hints}
			{hintsLeft}
			{status}
			{guess}
			onpick={pick}
			onguess={submit}
			onhint={useHint}
			ontimeup={submit}
		/>
	{/if}

	{#if phase === 'loading' || phase === 'opening'}
		<Loader text={phase === 'loading' ? t('starting') : t('loading')} />
	{:else if phase === 'error'}
		<Loader text={t(error.key)} error>
			{#if error.retry}<button class="btn btn-primary" onclick={error.retry}
					><span class="lbl">{t('retry')}</span></button
				>{/if}
			{#if error.getKey}<a
					class="btn btn-chip"
					href="https://developer.tech.yandex.ru/services"
					target="_blank"
					rel="noopener">{t('getKey')}</a
				>{/if}
			<a class="btn btn-chip" href="/">{t('home')}</a>
		</Loader>
	{/if}

	{#if game && phase === 'result' && result}
		<ResultLayout>
			{#snippet map()}
				<ResultMap
					{bbox}
					layer={savedLayer()}
					pairs={[{ actual: result!.actual, heading: result!.heading, guess: result!.guess }]}
					reveal
					crowd={result!.crowd?.km}
					onlanded={() => (landed = true)}
				>
					{#snippet overlay(frame)}
						{#if showFiveK()}<FiveK place={result!.place} {frame} />{/if}
					{/snippet}
				</ResultMap>
			{/snippet}
			<RoundReveal
				n={round?.n ?? done.length}
				rounds={endless ? 0 : game.rules.rounds}
				score={result.score}
				base={result.base}
				hints={result.hintsUsed}
				cost={game.rules.hints.cost}
				km={result.km}
				guessed={!!result.guess}
				late={result.late}
				place={result.place}
				actual={result.actual}
				heading={result.heading}
				crowd={result.crowd?.km}
				go={landed}
				ondone={() => (countedRound = perfectRound)}
				earned={result.earned ?? []}
			/>
			{#snippet actions()}
				<button class="btn btn-primary next" onclick={afterResult}>
					<span class="lbl">{result!.gameOver ? t('finish') : t('next')}</span>
					<svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6" /></svg>
				</button>
				{#if endless}
					<button class="btn btn-ghost" onclick={finishGame}>{t('finishGame')}</button>
				{/if}
			{/snippet}
		</ResultLayout>
	{/if}

	{#if game && phase === 'final'}
		<ResultLayout scroll>
			{#snippet map()}
				<ResultMap {bbox} layer={savedLayer()} pairs={finalPairs} />
			{/snippet}
			<div class="final">
				<!-- the map's face and name as the head, the gold tag its kind, then what the game
				     came to; the playtest reads the name and the headline here -->
				<div class="final-head">
					<div class="map-head">
						{#if game.map.face}
							<span class="pic"><PlaceInParent place={game.map.face} /></span>
						{/if}
						<div class="words">
							{#if tx(game.map.description)}
								<span class="kick-tag">{tx(game.map.description)}</span>
							{/if}
							<span class="map-name d float">{tx(game.map.name)}</span>
						</div>
					</div>
					{#if mine}
						<h1 class="d float" class:best={newBest || (missMap && missedGot > 0)}>
							{missMap && missedLeft === 0
								? t('missedAllDone')
								: missMap && missedGot
									? t('missedGot', { n: missedGot })
									: missMap && missedLeft
										? t('missedLeft', { n: missedLeft })
										: boardPlace && (board?.players ?? 0) > 1
											? t('yourPlace', { n: boardPlace })
											: newBest
												? gamesBefore
													? t('newBest')
													: t('firstGame')
												: t('gameOver')}
						</h1>
					{:else}
						<!-- someone else's game: their face (a tap: their profile) beside the headline -->
						<!-- (a name that already carries its emoji: the headline itself leads there) -->
						<div class="whose">
							{#if nameHasAvatar(game.player)}
								<a class="whose-link" href={`/u/${game.player.id}`}
									><h1 class="d float">{t('playerGame', { name: game.player.name })}</h1></a
								>
							{:else}
								<a
									class="avatar"
									href={`/u/${game.player.id}`}
									aria-label={game.player.name}
									data-frame={game.player.frame}>{game.player.avatar}</a
								>
								<h1 class="d float">{t('playerGame', { name: game.player.name })}</h1>
							{/if}
						</div>
					{/if}
				</div>

				<!-- the total, the hero: white leaning digits counting up on the ground -->
				<div class="total" class:wide={total >= 10000}>
					<ScoreCount score={total} max={game.max} big delay={200} />
					{#if done.length}
						<p class="tally">
							<span class="fact">
								<Stars n={1} of={1} size={24} quiet />
								<b class="d">{starsWon}</b><span class="of">/ {done.length * 3}</span>
							</span>
							<span class="fact">
								<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"
									><path
										d="M4 12h16M4 12l3.5-3.5M4 12l3.5 3.5M20 12l-3.5-3.5M20 12l-3.5 3.5"
									/></svg
								>
								<span>{tally[0]}<b class="d">{tally[1]}</b>{tally[2]}</span>
							</span>
						</p>
					{/if}
				</div>

				{#if missMap && missedLeft && missedGot}
					<p class="missed-line">
						<a href="/me/missed">{t('missedLeft', { n: missedLeft })}</a>
					</p>
				{/if}

				{#if earnedHere.length}
					<a class="earned-line" href="/me/wallet">
						<b class="d">+{earnedSum}</b>
						<Coin size={20} /> <span>{earnedFor}</span>
						<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
					</a>
				{/if}

				{#if board && board.players > 1}
					<ChallengeBoard board={board.board} players={board.players} open seek={mine} />
				{/if}

				{#if done.length}
					<!-- the streets of this game, as a room's end lists them; a tap shows only that round -->
					<EndStreets rounds={endRounds} bind:pick={finalPick} />
				{/if}

				{#if game.room}
					<ChallengeBoard
						board={roomBoard}
						players={roomBoard.length}
						title={t('roomPlayers')}
						open
					/>
				{/if}

				{#if wider}
					<!-- start narrow, go wide: the place around this one, its face, one tap to play it -->
					<button class="wider panel" onclick={goWider}>
						<span class="wider-face"><PlaceInParent place={wider.slug} on="panel" /></span>
						<span class="wider-words">
							<small>{t('goWider')}</small>
							<b class="d">{tx(wider.name)}</b>
						</span>
						<span class="wider-go" aria-label={t('goWiderPlay')}
							><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" /></svg
							></span
						>
					</button>
				{/if}
			</div>
			{#snippet actions()}
				{#if missMap && missedLeft === 0}
					<a class="btn btn-primary" href="/"><span class="lbl">{t('home')}</span></a>
				{:else if mine && done.length && !missMap}
					<button class="btn btn-primary" onclick={() => playAgain()}>
						<svg viewBox="0 0 24 24"
							><path d="M3.5 12a8.5 8.5 0 1 0 2.8-6.3L3.5 8.3M3.5 3.5v4.8h4.8" /></svg
						>
						<span class="lbl">{t('playAgain')}</span>
					</button>
					<!-- always in sight: the same streets for a friend, quiet, and the way home -->
					<div class="row">
						<button class="btn btn-chip" disabled={inviting} onclick={share}>
							<svg viewBox="0 0 24 24"
								><path
									d="M12 15V3.5M7.5 8 12 3.5 16.5 8M5 12.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-6.5"
								/></svg
							>
							<span class="lbl">{t('challengeFriend')}</span>
						</button>
						<a class="btn btn-chip home-btn" href="/" aria-label={t('home')} title={t('home')}
							><svg viewBox="0 0 24 24"
								><path d="M3.5 11 12 4l8.5 7M6 9.5V20h12V9.5M10 20v-5h4v5" /></svg
							></a
						>
					</div>
				{:else}
					<!-- the missed streets, someone else's game: the one key full width, the way home
					     under it at the right, where every end keeps it -->
					<button class="btn btn-primary" onclick={() => playAgain()}>
						{#if mine}<svg viewBox="0 0 24 24"
								><path d="M3.5 12a8.5 8.5 0 1 0 2.8-6.3L3.5 8.3M3.5 3.5v4.8h4.8" /></svg
							>{/if}
						<span class="lbl">{mine ? t('playAgain') : t('playThisMap')}</span>
					</button>
					<div class="row home-only">
						<a class="btn btn-chip home-btn" href="/" aria-label={t('home')} title={t('home')}
							><svg viewBox="0 0 24 24"
								><path d="M3.5 11 12 4l8.5 7M6 9.5V20h12V9.5M10 20v-5h4v5" /></svg
							></a
						>
					</div>
				{/if}
			{/snippet}
		</ResultLayout>
		{#if newBest || (missMap && missedLeft === 0)}<Confetti />{/if}
	{/if}
</div>

<ShareSheet share={sharing} title={t('challengeFriend')} onclose={() => (sharing = null)} />

<style>
	.game {
		position: fixed;
		inset: 0;
		overflow: hidden;
		background: #000;
		color: #fff;
	}
	/* the result's one key, the look's own green key, bigger on a laptop */
	.next {
		height: 64px;
		font-size: clamp(18px, 5.6vw, 22px);
		white-space: nowrap;
	}
	.next svg {
		width: 26px;
		height: 26px;
		stroke-width: 3;
	}
	@media (min-width: 761px) {
		.next {
			height: 70px;
			font-size: 25px;
		}
	}

	/* ---------- the end of a game: a page on the ground, white words, milk lists ---------- */
	.final {
		display: flex;
		flex-direction: column;
		gap: 22px;
	}
	.final-head {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 12px;
	}
	/* the map's face beside a gold tag over its name, as the home shows the place to play */
	.map-head {
		display: flex;
		align-items: center;
		gap: 12px;
		max-width: 100%;
	}
	.pic {
		width: 72px;
		height: 62px;
		flex: none;
		/* milk tiles on the ground, the place in gold, like the home's map */
		--pip-tile: var(--tile-a);
		--pip-on: var(--gold);
		filter: drop-shadow(0 3px 0 var(--map-shadow)) drop-shadow(0 0 8px var(--map-glow));
		animation: pop-in 0.5s var(--spring) both;
	}
	.words {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 6px;
	}
	.map-name {
		max-width: 100%;
		font-size: clamp(22px, 6.4vw, 28px);
		line-height: 1.08;
		color: var(--on-ground);
		text-wrap: balance;
	}
	/* the headline: what the game came to; gold when it is a record or a street found */
	h1 {
		max-width: 100%;
		font-size: clamp(28px, 8.4vw, 36px);
		line-height: 1.05;
		color: var(--on-ground);
		text-wrap: balance;
		animation: headline-in 0.5s var(--spring) both;
	}
	h1.best {
		color: var(--gold-text);
	}
	@keyframes headline-in {
		from {
			transform: var(--lean) scale(0.6);
			opacity: 0;
		}
		to {
			transform: var(--lean);
		}
	}
	/* someone else's game: their face on a milk coin beside the headline */
	.whose {
		display: flex;
		align-items: center;
		gap: 12px;
		max-width: 100%;
	}
	.whose .avatar {
		width: 48px;
		height: 48px;
		font-size: 27px;
		text-decoration: none;
		box-shadow: 0 3px 0 var(--panel-lip);
		transition: transform 0.1s;
	}
	.whose .avatar:active {
		transform: scale(0.92);
	}
	.whose h1 {
		flex: 1;
		min-width: 0;
	}
	.whose-link {
		color: inherit;
		text-decoration: none;
	}

	/* the total on the ground: white digits on a gold step, the "/ 25 000 ball" soft white */
	.total {
		--score-a: #fff;
		--score-b: #c8f0ec;
		--score-stack: var(--gold-lo);
		--ink-3: var(--on-ground-2);
		margin-top: -4px;
	}
	/* five digits (a game's total can reach 25 000): a size smaller, so "/ 25 000 ball" stays
	   on the number's line */
	.total.wide :global(.value) {
		font-size: clamp(54px, 16.4vw, 64px);
	}
	@media (min-width: 761px) {
		.total.wide :global(.value) {
			font-size: 86px;
		}
	}
	.tally {
		margin-top: 14px;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 22px;
		font-size: 16px;
		font-weight: 600;
		color: var(--on-ground-2);
	}
	.fact {
		display: inline-flex;
		align-items: center;
		gap: 7px;
	}
	.fact b {
		font-size: 21px;
		color: var(--on-ground);
	}
	.fact .of {
		font-family: var(--f-disp);
		font-weight: 800;
		font-size: 15px;
	}
	.fact .icon {
		width: 22px;
		height: 22px;
		color: var(--on-ground-3);
		stroke-width: 2.6;
	}

	/* what the game earned: gold leaf coins, one line, to the wallet */
	.earned-line {
		display: inline-flex;
		align-items: center;
		align-self: flex-start;
		gap: 6px;
		min-height: 40px;
		padding: 4px 12px 4px 14px;
		border-radius: 999px;
		background: var(--chip-bg);
		box-shadow: inset 0 0 0 1.5px var(--chip-line);
		color: var(--on-ground);
		text-decoration: none;
		font-size: 14.5px;
		font-weight: 600;
		animation: pop-in 0.4s var(--spring) 0.8s both;
	}
	.earned-line b {
		font-size: 19px;
		color: var(--gold-text);
	}
	.earned-line .icon {
		width: 16px;
		height: 16px;
	}
	.missed-line {
		margin-top: -10px;
		font-size: 15px;
		font-weight: 700;
	}
	.missed-line a {
		color: var(--on-ground);
		text-underline-offset: 3px;
	}

	/* go wider: a milk card with the larger place's face, its name and a round green play */
	.wider {
		display: flex;
		align-items: center;
		gap: 14px;
		width: 100%;
		padding: 14px 16px;
		border: none;
		text-align: left;
		transition: transform 0.12s var(--out);
	}
	.wider:active {
		transform: translateY(2px);
	}
	.wider-face {
		width: 56px;
		height: 50px;
		flex: none;
	}
	.wider-words {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 3px;
	}
	.wider-words small {
		font-size: 13.5px;
		font-weight: 600;
		color: var(--ink-2);
		line-height: 1.3;
	}
	.wider-words b {
		font-size: 19px;
		line-height: 1.1;
		color: var(--ink);
	}
	.wider-go {
		width: 46px;
		height: 46px;
		flex: none;
		display: grid;
		place-items: center;
		border-radius: 50%;
		background: linear-gradient(180deg, var(--key-hi), var(--key-lo));
		box-shadow: 0 3px 0 var(--key-lip);
	}
	.wider-go svg {
		width: 20px;
		height: 20px;
		margin-left: 3px;
		fill: #fff;
	}

	/* the house alone in its row: at the right, under the key */
	.row.home-only {
		justify-content: flex-end;
	}
	/* the house as wide as it is tall (ResultLayout stretches the row's keys) */
	.home-btn {
		flex: none !important;
		width: 56px !important;
		padding: 0 !important;
	}

	@media (min-width: 761px) {
		.pic {
			width: 84px;
			height: 72px;
		}
		.map-name {
			font-size: 30px;
		}
		h1 {
			font-size: 40px;
		}
	}
	@media (max-width: 760px) {
		.final {
			gap: 20px;
		}
	}
</style>
