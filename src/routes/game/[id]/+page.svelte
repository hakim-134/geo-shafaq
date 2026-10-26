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
	import ScoreCard from '#lib/game/ScoreCard.svelte';
	import PlaceCard from '#lib/game/PlaceCard.svelte';
	import { t, tx, type Key } from '#lib/i18n/index.svelte.js';
	import { ensureSession, refreshMe, session } from '#lib/session.svelte.js';
	import { fmtDistance, fmtNum, nameHasAvatar, verdictKey } from '#lib/format.js';
	import { showToast } from '#lib/toast.svelte.js';
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
	let error = $state<{ key: Key; retry: (() => void) | null; getKey?: boolean }>({
		key: 'loading',
		retry: null
	});
	let bestBefore = 0;
	let finalPick = $state<number | null>(null); // a round chosen in the final table
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
			.map((r) => ({ actual: r.result!.actual, guess: r.result!.guess, label: String(r.n) }))
	);

	function label(r: RoundResult): string {
		const p = r.place;
		return tx(p.street ?? p.district ?? p.city ?? p.region) || '—';
	}

	async function playAgain(map = game?.map.slug) {
		if (!game || !map) return;
		try {
			const g = await call(api().POST('/v1/games', { body: { map, rules: game.rules } }));
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
		if (!wider) return;
		const c = loadChoice();
		saveChoice({ ...c, map: wider.map }); // and the home picks it next time
		playAgain(wider.map);
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
					<button class="btn btn-primary" onclick={afterResult}>
						{result.gameOver ? t('finish') : t('next')}
					</button>
					{#if endless}
						<button class="btn btn-sky" onclick={finishGame}>{t('finishGame')}</button>
					{/if}
					<a class="btn btn-ghost" href="/">{t('menu')}</a>
				</div>
			</div>
			<div class="overlay-map">
				<ResultMap
					{bbox}
					layer={savedLayer()}
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
				{#if game.room}
					<div class="room-table">
						<div class="sub">{t('roomPlayers')}</div>
						{#each game.room.players as row, i (row.game)}
							<a class="room-row" class:me={row.game === game.id} href={`/game/${row.game}`}>
								<span class="place">{i + 1}</span>
								<span class="avatar">{row.player.avatar}</span>
								<span class="name">{row.player.name}</span>
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
				<div class="actions">
					<button class="btn btn-primary" onclick={() => playAgain()}
						>{mine ? t('playAgain') : t('playThisMap')}</button
					>
					<button class="btn btn-sky" onclick={share}>{t('share')}</button>
					<a class="btn btn-ghost" href="/">{t('menu')}</a>
				</div>
			</div>
			<div class="overlay-map">
				<ResultMap {bbox} layer={savedLayer()} pairs={finalPairs} />
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
	/* go wider */
	.wider {
		padding: 14px;
		border-radius: 16px;
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
		border-radius: 12px;
		background: var(--surface);
		color: var(--text);
		font-weight: 700;
		box-shadow: 0 1px 0 var(--border);
	}
	.wider-go .go {
		margin-left: auto;
	}
	.wider-go svg {
		width: 18px;
		height: 18px;
		fill: var(--green);
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

	/* a room game: everyone's total */
	.room-table {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.room-row {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 7px 8px;
		border-radius: 10px;
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
		font-weight: 600;
	}
	.room-row .avatar {
		width: 28px;
		height: 28px;
		font-size: 16px;
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
</style>
