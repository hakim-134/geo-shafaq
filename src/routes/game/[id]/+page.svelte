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
		type RoundResult
	} from '#lib/api/client.js';
	import { PanoError } from '#lib/pano/index.js';
	import RoundView, { type Status } from '#lib/game/RoundView.svelte';
	import ResultMap, { type Pair } from '#lib/map/ResultMap.svelte';
	import { savedLayer, type BBox } from '#lib/map/map.js';
	import MapSign from '#lib/maps/MapSign.svelte';
	import { loadChoice, saveChoice } from '#lib/rules.js';
	import Loader from '#lib/game/Loader.svelte';
	import ResultLayout from '#lib/game/ResultLayout.svelte';
	import RoundReveal from '#lib/game/RoundReveal.svelte';
	import ScoreCount from '#lib/game/ScoreCount.svelte';
	import Stars from '#lib/game/Stars.svelte';
	import StreetPlate from '#lib/game/StreetPlate.svelte';
	import Confetti from '#lib/game/Confetti.svelte';
	import { sfxFanfare } from '#lib/sfx.svelte.js';
	import { t, tx, type Key } from '#lib/i18n/index.svelte.js';
	import { ensureSession, refreshMe, session } from '#lib/session.svelte.js';
	import { fmtDistance, fmtNum, nameHasAvatar, starsFor } from '#lib/format.js';
	import { showToast } from '#lib/toast.svelte.js';
	import { yandexKey } from '#lib/config.js';
	import { gameShare, nativeShare, type Share } from '#lib/game/share.js';
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
			game.total = res.total ?? game.total;
			upsertRound({ ...round, result: res });
			landed = false;
			phase = 'result';
			// the map's reveal says when; without a map, a moment later anyway
			setTimeout(() => (landed = true), 2600);
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
			bestBefore >= 0
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
			const g = await call(api().POST('/v1/games', { body: { map, rules: game.rules } }));
			saveChoice({ ...loadChoice(), map }); // the home's sign: the last place played
			goto(`/game/${g.id}`);
		} catch (e) {
			showToast(t(e instanceof ApiError && e.code === 'banned' ? 'bannedText' : errorKey(e)), 3500);
		}
	}

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

	// a link to the game on the site; the phone's share sheet, or our own
	let sharing = $state<Share | null>(null);
	async function share() {
		if (!game) return;
		const s = gameShare(game);
		if (!(await nativeShare(s))) sharing = s;
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
<svelte:head><title>{game ? tx(game.map.name) : ''} — Shafaq Geo</title></svelte:head>

<div class="game">
	{#if game && game.status === 'playing'}
		<RoundView
			bind:this={rv}
			rules={game.rules}
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
			{#if error.retry}<button class="btn btn-primary" onclick={error.retry}>{t('retry')}</button
				>{/if}
			{#if error.getKey}<a
					class="btn btn-ghost"
					href="https://developer.tech.yandex.ru/services"
					target="_blank"
					rel="noopener">{t('getKey')}</a
				>{/if}
			<a class="btn btn-ghost" href="/">{t('home')}</a>
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
					onlanded={() => (landed = true)}
				/>
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
				go={landed}
			/>
			{#snippet actions()}
				<button class="btn btn-primary next" onclick={afterResult}>
					{result!.gameOver ? t('finish') : t('next')}
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
				<div class="final-head">
					<MapSign slug={game.map.slug} name={tx(game.map.name)} size="small" />
					<h1 class:best={newBest}>
						{newBest
							? gamesBefore
								? t('newBest')
								: t('firstGame')
							: mine
								? t('gameOver')
								: t('playerGame', { name: game.player.name })}
					</h1>
					{#if !mine}
						<a class="player" href={`/u/${game.player.id}`}>
							{#if !nameHasAvatar(game.player)}<span class="avatar">{game.player.avatar}</span>{/if}
							<span>{game.player.name}</span>
						</a>
					{/if}
				</div>

				<div class="total">
					<ScoreCount score={total} max={game.max} big delay={200} />
					{#if done.length}
						<div class="total-stars">
							<Stars n={1} of={1} size={22} quiet />
							<b>{starsWon}</b>
							<span>/ {done.length * 3}</span>
							<span class="sep"></span>
							<span>{fmtDistance(done.reduce((s, r) => s + (r.result?.km ?? 0), 0))}</span>
						</div>
					{/if}
				</div>

				{#if done.length}
					<div class="trip">
						<h2 class="section-title">{t('streetsThisGame')}</h2>
						<ol>
							{#each done as r, i (r.n)}
								<li>
									<button
										class="stop"
										aria-pressed={finalPick === i}
										onclick={() => (finalPick = finalPick === i ? null : i)}
										style:animation-delay={`${300 + i * 90}ms`}
									>
										<span class="stop-plate"
											><StreetPlate place={r.result!.place} size="small" /></span
										>
										<span class="stop-score">
											<Stars n={starsFor(r.result!.score)} size={13} quiet />
											{#if r.result!.base}
												<span class="stop-cut" title={t('hintsTaken', { n: r.result!.hintsUsed })}
													>💡 <s>{fmtNum(r.result!.base)}</s></span
												>
											{/if}
											<b>{fmtNum(r.result!.score)}</b>
										</span>
									</button>
								</li>
							{/each}
						</ol>
					</div>
				{/if}

				{#if game.room}
					<div class="room-table">
						<h2 class="section-title">{t('roomPlayers')}</h2>
						{#each game.room.players as row, i (row.game)}
							<a class="room-row" class:me={row.game === game.id} href={`/game/${row.game}`}>
								<span class="place">{i + 1}</span>
								<span class="avatar">{row.player.avatar}</span>
								<span class="name">{row.player.name}</span>
								{#if row.hints}<span class="hints" title={t('hintsTaken', { n: row.hints })}
										>💡 {row.hints}</span
									>{/if}
								<b>{fmtNum(row.total)}</b>
							</a>
						{/each}
					</div>
				{/if}

				{#if wider}
					<div class="wider">
						<p>{t('goWider')}</p>
						<button class="wider-go" onclick={goWider}>
							<MapSign slug={wider.map} name={tx(wider.name)} size="small" />
							<span class="go">{t('goWiderPlay')}</span>
							<svg viewBox="0 0 24 24"><path d="M7 4.5v15l12-7.5z" /></svg>
						</button>
					</div>
				{/if}
				<!-- after the last street: sharing, quiet, and the way home -->
				<div class="after">
					<button class="btn btn-ghost" onclick={share}>
						<svg viewBox="0 0 24 24"
							><path
								d="M12 15V3.5M7.5 8 12 3.5 16.5 8M5 12.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-6.5"
							/></svg
						>
						{t('shareResults')}
					</button>
					<a class="btn btn-ghost home-btn" href="/" aria-label={t('home')} title={t('home')}
						><svg viewBox="0 0 24 24"
							><path d="M3.5 11 12 4l8.5 7M6 9.5V20h12V9.5M10 20v-5h4v5" /></svg
						></a
					>
				</div>
			</div>
			{#snippet actions()}
				<button class="btn btn-primary" onclick={() => playAgain()}>
					<svg viewBox="0 0 24 24"
						><path d="M3.5 12a8.5 8.5 0 1 0 2.8-6.3L3.5 8.3M3.5 3.5v4.8h4.8" /></svg
					>
					{mine ? t('playAgain') : t('playThisMap')}
				</button>
			{/snippet}
		</ResultLayout>
		{#if newBest}<Confetti />{/if}
	{/if}
</div>

<ShareSheet share={sharing} onclose={() => (sharing = null)} />

<style>
	.game {
		position: fixed;
		inset: 0;
		overflow: hidden;
		background: #000;
		color: #fff;
	}
	.next {
		height: 60px;
		font-size: 17px;
	}

	/* ---------- the end of a game ---------- */
	.final {
		display: flex;
		flex-direction: column;
		gap: 22px;
	}
	.final-head {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 10px;
	}
	h1 {
		font-family: var(--display);
		font-weight: 800;
		font-size: 32px;
		line-height: 1.08;
		letter-spacing: -0.02em;
		animation: pop-in 0.5s var(--pop) both;
	}
	h1.best {
		color: var(--green-ink);
	}
	:global(:root[data-theme='dark']) h1.best {
		color: var(--green);
	}
	.player {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 5px 12px 5px 5px;
		border-radius: 999px;
		background: var(--bg);
		text-decoration: none;
		font-weight: 600;
		font-size: 14px;
	}
	.player .avatar {
		width: 28px;
		height: 28px;
		font-size: 16px;
		background: var(--surface);
	}
	.total-stars {
		margin-top: 12px;
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 15px;
		color: var(--muted);
		font-weight: 600;
	}
	.total-stars b {
		font-family: var(--display);
		color: var(--text);
		font-size: 17px;
	}
	.total-stars .sep {
		width: 4px;
		height: 4px;
		border-radius: 50%;
		background: var(--border);
		margin: 0 6px;
	}

	/* the streets of this game, as small plates in the order they came */
	.trip ol {
		margin-top: 10px;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.stop {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 10px;
		border: none;
		border-radius: 14px;
		background: transparent;
		color: var(--text);
		text-align: left;
		animation: rise 0.4s var(--settle) both;
		transition: background 0.15s;
	}
	.stop:hover,
	.stop[aria-pressed='true'] {
		background: color-mix(in srgb, var(--sky) 12%, transparent);
	}
	.stop-plate {
		flex: 1;
		min-width: 0;
		display: flex;
	}
	.stop-plate :global(.where) {
		max-width: 100%;
	}
	.stop-score {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 2px;
		flex: none;
	}
	.stop-score b {
		font-family: var(--display);
		font-size: 15px;
		font-variant-numeric: tabular-nums;
	}
	/* a hint took points: the score before it, small and struck */
	.stop-cut {
		font-size: 12px;
		font-weight: 600;
		color: var(--muted);
		font-variant-numeric: tabular-nums;
	}

	/* after the last street: "Natijani ulashish" and the way home, a house as wide as it is tall */
	.after {
		display: flex;
		gap: 10px;
	}
	.after .btn {
		flex: 1;
		min-width: 0;
		padding: 0 14px;
	}
	.after .home-btn {
		flex: none;
		width: 56px;
		padding: 0;
	}

	/* a room game: everyone's total */
	.room-table {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.room-table .section-title {
		margin-bottom: 6px;
	}
	.room-row {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 7px 8px;
		border-radius: 12px;
		text-decoration: none;
		font-size: 14px;
	}
	.room-row:hover,
	.room-row.me {
		background: color-mix(in srgb, var(--sky) 10%, transparent);
	}
	.room-row .place {
		width: 18px;
		color: var(--muted);
		font-weight: 700;
	}
	.room-row .avatar {
		width: 30px;
		height: 30px;
		font-size: 17px;
		background: var(--bg);
	}
	.room-row .name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.room-row b {
		font-family: var(--display);
	}
	.room-row .hints {
		font-size: 13px;
		font-weight: 600;
		color: var(--muted);
	}

	/* go wider */
	.wider {
		padding: 14px;
		border-radius: 18px;
		background: color-mix(in srgb, var(--gold) 16%, var(--surface));
		border: 1px solid color-mix(in srgb, var(--gold) 40%, transparent);
	}
	.wider p {
		font-size: 14px;
		font-weight: 600;
	}
	.wider-go {
		margin-top: 10px;
		width: 100%;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 12px;
		border: none;
		border-radius: 14px;
		background: var(--surface);
		color: var(--text);
		font-weight: 700;
		box-shadow: 0 3px 0 var(--edge);
	}
	.wider-go:active {
		transform: translateY(2px);
		box-shadow: 0 1px 0 var(--edge);
	}
	.wider-go .go {
		margin-left: auto;
	}
	.wider-go svg {
		width: 18px;
		height: 18px;
		fill: var(--green);
	}

	@media (max-width: 760px) {
		.final {
			gap: 14px;
		}
		h1 {
			font-size: 26px;
		}
	}
</style>
