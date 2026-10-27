<script lang="ts">
	// A live room: friends on one map, the same panorama at the same time. The lobby (the
	// code, the link, the QR code, the players), then the rounds, each round's result for
	// everyone, and the game's table. The host starts, goes on, and changes the rules.
	import { tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { renderSVG } from 'uqr';
	import {
		api,
		call,
		send,
		ApiError,
		type LatLon,
		type MapSummary,
		type RoomPlayer,
		type RoomResult,
		type RoomState
	} from '#lib/api/client.js';
	import { RoomLink } from '#lib/room.svelte.js';
	import RoundView, { type Status } from '#lib/game/RoundView.svelte';
	import ResultMap, { type Pair } from '#lib/map/ResultMap.svelte';
	import { savedLayer, type BBox } from '#lib/map/map.js';
	import MapSign from '#lib/maps/MapSign.svelte';
	import TopBar from '#lib/components/TopBar.svelte';
	import Sheet from '#lib/components/Sheet.svelte';
	import RulesForm from '#lib/game/RulesForm.svelte';
	import Loader from '#lib/game/Loader.svelte';
	import ResultLayout from '#lib/game/ResultLayout.svelte';
	import RoundReveal from '#lib/game/RoundReveal.svelte';
	import StreetPlate from '#lib/game/StreetPlate.svelte';
	import Confetti from '#lib/game/Confetti.svelte';
	import { extras } from '#lib/game/summary.js';
	import RulesFacts from '#lib/game/RulesFacts.svelte';
	import ShareSheet from '#lib/components/ShareSheet.svelte';
	import { nativeShare, type Share } from '#lib/game/share.js';
	import { siteUrl } from '#lib/config.js';
	import { playerColor } from '#lib/game/colors.js';
	import { choiceFrom, rulesFor, testProviders, type Choice } from '#lib/rules.js';
	import { PanoError } from '#lib/pano/index.js';
	import { t, tx, type Key } from '#lib/i18n/index.svelte.js';
	import { ensureSession, refreshMe, setMe } from '#lib/session.svelte.js';
	import { fmtDistance, fmtNum, starsFor } from '#lib/format.js';
	import { showToast } from '#lib/toast.svelte.js';

	let link = $state<RoomLink | null>(null);
	let loadError = $state<Key | null>(null);
	let rv = $state<ReturnType<typeof RoundView>>();

	const st = $derived<RoomState | null>(link?.state ?? null);
	const code = $derived(st?.code ?? (page.params.code ?? '').toUpperCase());
	const players = $derived(st?.players ?? []);
	const me = $derived(players.find((p) => p.id === st?.you));
	const isHost = $derived(!!st && st.joined && st.host === st.you);
	const colorOf = (id: string) => playerColor(players.findIndex((p) => p.id === id));
	const nameOf = (id: string) => players.find((p) => p.id === id);
	const roomUrl = $derived(`${location.origin}/room/${code}`);

	// ---------- the room ----------
	let started = '';
	$effect(() => {
		const c = (page.params.code ?? '').toUpperCase();
		if (c && c !== started) {
			started = c;
			open(c);
		}
		return () => link?.stop();
	});

	async function open(c: string) {
		link?.stop();
		loadError = null;
		const l = new RoomLink(c);
		link = l;
		try {
			await ensureSession();
			const s = await l.load();
			if (s.blocked) l.gone = s.blocked as typeof l.gone;
			else l.connect();
		} catch (e) {
			loadError = e instanceof ApiError && e.code === 'no_room' ? 'err_no_room' : 'err_network';
		}
	}

	function wake() {
		if (document.visibilityState === 'visible') link?.wake();
	}

	// "reconnecting" only when it lasts: a deploy's few seconds go by unnoticed
	let away = $state(false);
	let awayTimer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		const live = link?.live ?? true;
		clearTimeout(awayTimer);
		if (live || !st?.joined) away = false;
		else awayTimer = setTimeout(() => (away = true), 4000);
	});

	$effect(() => {
		if (link?.gone === 'left') goto('/');
	});

	// ---------- a round ----------
	let local = $state<'opening' | 'playing' | 'sending' | 'waiting'>('opening');
	let guess = $state<LatLon | null>(null);
	let opened = ''; // the round (n:swap) whose panorama this page opened
	let blind = $state(false); // this page could not open it: guess on the map alone
	let deadline = 0; // when the clock shown runs out (Date.now() ms), 0 = none

	const round = $derived(st?.phase === 'playing' ? st.round : undefined);
	const status = $derived<Status>(st?.phase === 'playing' ? local : 'off');

	$effect(() => {
		const rd = round;
		if (!rd || !st?.joined) return;
		const key = `${rd.n}:${rd.swap}`;
		if (key !== opened) {
			opened = key;
			openRound(rd.n, rd.swap);
		}
	});

	// the clock follows the server: it starts when the first viewer opens the panorama, and
	// is cut to 45 s after the first guess
	$effect(() => {
		const ms = round?.remainingMs;
		if (!rv || local === 'opening') return;
		if (ms === undefined) {
			if (deadline) rv.startTimer(undefined);
			deadline = 0;
			return;
		}
		const at = Date.now() + ms;
		if (Math.abs(at - deadline) > 1500) {
			deadline = at;
			rv.startTimer(ms);
		}
	});

	$effect(() => {
		if (st?.phase !== 'playing') {
			rv?.stopTimer();
			deadline = 0;
			// between rounds and games: the next round opens fresh, even when it is the same
			// number (round 1 of the next game, "play again")
			opened = '';
			guess = null;
		}
	});

	async function openRound(n: number, swap: number) {
		if (!link || !st?.round) return;
		const rd = st.round;
		local = 'opening';
		blind = false;
		guess = rd.pin ?? null;
		await tick();
		try {
			const { pos } = await rv!.open(rd.view);
			if (opened !== `${n}:${swap}`) return; // swapped meanwhile
			await link.act(() =>
				call(
					api().POST('/v1/rooms/{code}/rounds/{n}/shown', {
						params: { path: { code, n } },
						body: pos ? { pos } : {}
					})
				)
			);
		} catch (e) {
			if (opened !== `${n}:${swap}`) return;
			const notFound =
				(e instanceof PanoError && e.kind === 'not_found') ||
				(e instanceof ApiError && e.code === 'too_far');
			if (notFound || e instanceof PanoError) {
				try {
					// everyone gets another panorama; the state brings it and the round reopens
					await link.act(() =>
						call(
							api().POST('/v1/rooms/{code}/rounds/{n}/fail', {
								params: { path: { code, n } },
								body: { reason: notFound ? 'not_found' : 'error', swap }
							})
						)
					);
					if (link.state?.round?.swap !== swap) return;
				} catch {
					/* others see it already: this page guesses on the map */
				}
				blind = true;
				showToast(t('roomNoPano'), 4000);
			} else if (!(e instanceof ApiError && e.code === 'wrong_phase')) {
				showToast(t('err_network'));
			}
		}
		if (opened !== `${n}:${swap}`) return;
		deadline = 0; // the clock effect starts it with the server's time
		local = link.state?.round?.guessed ? 'waiting' : 'playing';
	}

	let pinTimer: ReturnType<typeof setTimeout> | undefined;
	function pick(p: LatLon) {
		if (local !== 'playing' || !round) return;
		guess = p;
		// the pin counts if the round ends first (time up, the phone locked)
		const n = round.n;
		clearTimeout(pinTimer);
		pinTimer = setTimeout(() => {
			send(
				api().POST('/v1/rooms/{code}/rounds/{n}/pin', {
					params: { path: { code, n } },
					body: { pos: p }
				})
			).catch(() => {});
		}, 500);
	}

	async function submit() {
		if (local !== 'playing' || !link || !round) return;
		const n = round.n;
		clearTimeout(pinTimer);
		local = 'sending';
		try {
			await link.act(() =>
				call(
					api().POST('/v1/rooms/{code}/rounds/{n}/guess', {
						params: { path: { code, n } },
						body: guess ? { pos: guess } : {}
					})
				)
			);
			local = 'waiting';
		} catch (e) {
			if (e instanceof ApiError && e.code === 'wrong_phase') local = 'waiting';
			else {
				local = 'playing';
				showToast(t('err_network'));
			}
		}
	}

	async function useHint(): Promise<boolean> {
		if (!link || !round || round.hintsLeft <= 0) return false;
		const n = round.n;
		try {
			await link.act(() =>
				call(api().POST('/v1/rooms/{code}/rounds/{n}/hint', { params: { path: { code, n } } }))
			);
			return true;
		} catch {
			showToast(t('err_other'));
			return false;
		}
	}

	// my dots: how each round went for me
	const dots = $derived(
		Array.from({ length: st?.rules.rounds ?? 0 }, (_, i) => {
			const sc = st?.results[i]?.scores.find((s) => s.player === st?.you);
			if (sc) return sc.score >= 4000 ? 'hi' : sc.score >= 2000 ? 'mid' : 'lo';
			return round?.n === i + 1 ? 'now' : '';
		})
	);

	// ---------- results ----------
	const last = $derived(st?.phase === 'result' ? st.results.at(-1) : undefined);
	// the real pin is on the map: the result plays (or a moment later without a map)
	let landed = $state(false);
	let landedFor = -1;
	$effect(() => {
		const n = last?.n ?? -1;
		if (n === landedFor) return;
		landedFor = n;
		landed = false;
		if (n >= 0) setTimeout(() => landedFor === n && (landed = true), 2600);
	});
	const myLast = $derived(last?.scores.find((s) => s.player === st?.you));
	const lastRows = $derived(
		last ? [...last.scores].sort((a, b) => b.score - a.score || (a.km ?? 1e9) - (b.km ?? 1e9)) : []
	);
	const lastPairs = $derived<Pair[]>(
		last
			? last.scores.map((s) => ({
					actual: last.actual,
					guess: s.guess,
					guessColor: colorOf(s.player),
					guessLabel: nameOf(s.player)?.avatar
				}))
			: []
	);
	const gameOver = $derived(!!st && st.rules.rounds > 0 && st.results.length >= st.rules.rounds);

	const standings = $derived(
		[...players].sort((a, b) => b.total - a.total || Number(a.left) - Number(b.left))
	);
	const winner = $derived(standings[0]);
	let finalPick = $state<number | null>(null);
	const finalPairs = $derived<Pair[]>(
		(st?.results ?? [])
			.filter((r, i) => finalPick === null || i === finalPick)
			.flatMap((r) =>
				r.scores
					.filter((s) => finalPick !== null || s.player === st?.you)
					.map((s) => ({
						actual: r.actual,
						label: String(r.n),
						guess: s.guess,
						guessColor: colorOf(s.player),
						guessLabel: nameOf(s.player)?.avatar
					}))
			)
	);
	$effect(() => {
		if (st?.phase === 'final') refreshMe().catch(() => {});
		else finalPick = null;
	});

	function where(r: RoomResult): string {
		const p = r.place;
		return tx(p.street ?? p.district ?? p.city ?? p.region) || '—';
	}

	// ---------- the host ----------
	let busy = $state(false);
	async function hostAct(path: '/v1/rooms/{code}/start' | '/v1/rooms/{code}/next', finish = false) {
		if (!link || busy) return;
		busy = true;
		try {
			if (path === '/v1/rooms/{code}/start')
				await link.act(() => call(api().POST(path, { params: { path: { code } } })));
			else
				await link.act(() =>
					call(api().POST(path, { params: { path: { code } }, body: finish ? { finish } : {} }))
				);
		} catch (e) {
			showToast(t(errorKey(e)), 3500);
		} finally {
			busy = false;
		}
	}

	let settingsOpen = $state(false);
	let choice = $state<Choice | null>(null);
	let maps = $state<MapSummary[]>([]);
	const chosenMap = $derived(
		maps.find((m) => m.slug === choice?.map) ?? (st?.map.slug === choice?.map ? st?.map : undefined)
	);
	async function openSettings() {
		if (!st) return;
		choice = choiceFrom(st.rules, st.map.slug);
		settingsOpen = true;
		if (!maps.length) maps = await call(api().GET('/v1/maps')).catch(() => []);
		if (st.map.slug.startsWith('place-') && !maps.some((m) => m.slug === st.map.slug))
			maps = [st.map, ...maps];
	}
	async function saveSettings() {
		if (!link || !choice) return;
		const c = choice;
		busy = true;
		try {
			await link.act(() =>
				call(
					api().POST('/v1/rooms/{code}/rules', {
						params: { path: { code } },
						body: { map: c.map, rules: rulesFor(c, testProviders()) }
					})
				)
			);
			settingsOpen = false;
		} catch (e) {
			showToast(t(errorKey(e)), 3500);
		} finally {
			busy = false;
		}
	}

	// a player's menu: the host's tools
	let target = $state<RoomPlayer | null>(null);
	async function onPlayer(path: '/v1/rooms/{code}/kick' | '/v1/rooms/{code}/host') {
		if (!link || !target) return;
		const player = target.id;
		target = null;
		try {
			await link.act(() =>
				call(api().POST(path, { params: { path: { code } }, body: { player } }))
			);
		} catch (e) {
			showToast(t(errorKey(e)));
		}
	}

	// ---------- me ----------
	let naming = $state(false);
	let newName = $state('');
	let nameError = $state(false);
	function startNaming() {
		newName = me?.name ?? '';
		nameError = false;
		naming = true;
	}
	async function saveName(e: SubmitEvent) {
		e.preventDefault();
		try {
			setMe(await call(api().POST('/v1/me/profile', { body: { name: newName.trim() } })));
			naming = false;
			link?.stop(); // a fresh socket joins with the new name
			link?.connect();
		} catch (err) {
			if (err instanceof ApiError && err.code === 'bad_name') nameError = true;
			else showToast(t('err_other'));
		}
	}

	async function leave() {
		try {
			await send(api().POST('/v1/rooms/{code}/leave', { params: { path: { code } } }));
		} catch {
			/* gone anyway */
		}
		link?.stop();
		goto('/');
	}

	// ---------- inviting ----------
	let qrOpen = $state(false);
	const qr = $derived(
		qrOpen ? renderSVG(roomUrl, { border: 1, blackColor: '#13233f', whiteColor: '#fff' }) : ''
	);
	const inviteText = $derived(st ? t('invite', { map: tx(st.map.name), code }) : '');
	const tgShare = $derived(
		`https://t.me/share/url?url=${encodeURIComponent(roomUrl)}&text=${encodeURIComponent(inviteText)}`
	);
	// the phone's share sheet where there is one (https); our own sheet (copy, Telegram) anywhere else
	let sharing = $state<{ share: Share; title: string } | null>(null);
	async function shareLink() {
		const share = { url: roomUrl, text: inviteText };
		if (!(await nativeShare(share))) sharing = { share, title: t('inviteTitle') };
	}

	// after a game: my game's page on the site, with everyone's table on it
	async function shareResults() {
		if (!st?.yourGame) return;
		const place = standings.findIndex((p) => p.id === st?.you) + 1;
		const squares = st.results
			.map((r) => r.scores.find((x) => x.player === st?.you)?.score ?? 0)
			.map((sc) => ['🟥', '🟥', '🟨', '🟩'][starsFor(sc)])
			.join('');
		const share = {
			url: siteUrl(`/game/${st.yourGame}`),
			text: [
				t('shareRoomText', {
					map: tx(st.map.name),
					place,
					n: players.length,
					score: fmtNum(me?.total ?? 0)
				}),
				squares
			].join('\n')
		};
		if (!(await nativeShare(share))) sharing = { share, title: t('shareTitle') };
	}

	function errorKey(e: unknown): Key {
		if (e instanceof ApiError) {
			const keys: Record<string, Key> = {
				network: 'err_network',
				no_panorama: 'err_no_panorama',
				daily_cap: 'err_daily_cap',
				no_room: 'err_no_room',
				room_full: 'err_full',
				banned: 'bannedText',
				not_host: 'err_not_host'
			};
			return keys[e.code] ?? 'err_other';
		}
		return 'err_other';
	}

	const goneKey: Record<string, Key> = {
		kicked: 'roomKicked',
		closed: 'roomClosed',
		no_room: 'err_no_room',
		room_full: 'err_full'
	};

	function onKey(e: KeyboardEvent) {
		if ((e.target as HTMLElement).closest('input, textarea')) return;
		if (e.key === 'Enter' && isHost && st?.phase === 'result') {
			e.preventDefault();
			hostAct('/v1/rooms/{code}/next');
		}
	}
</script>

<svelte:window onkeydown={onKey} ononline={wake} />
<svelte:document onvisibilitychange={wake} />
<svelte:head><title>{t('room')} {code} — Shafaq Geo</title></svelte:head>

{#if loadError || link?.gone}
	<TopBar />
	<main class="gone">
		<img class="mark" src="/mark.svg" alt="" width="64" height="64" />
		<p>{t(loadError ?? goneKey[link?.gone ?? ''] ?? 'roomClosed')}</p>
		<div class="row">
			{#if loadError === 'err_network'}
				<button class="btn btn-primary" onclick={() => open(code)}>{t('retry')}</button>
			{/if}
			<a class="btn btn-ghost" href="/">{t('menu')}</a>
		</div>
	</main>
{:else if !st}
	<Loader text={t('connecting')} />
{:else if st.phase === 'lobby' || !st.joined}
	<TopBar />
	<main class="lobby">
		<section class="head">
			<p class="kicker">{t('roomCode')}</p>
			<div class="plate" aria-label={`${t('roomCode')}: ${code}`}>
				<b>{code}</b>
				<span class="plate-end" aria-hidden="true">
					<span class="plate-flag"><i></i><i></i><i></i></span>
					<span class="plate-uz">UZ</span>
				</span>
			</div>
			<p class="sub">{t('roomInviteText')}</p>
			<div class="invite">
				<button class="btn btn-sky" onclick={shareLink}>
					<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"
						><path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" /></svg
					>
					{t('copyLink')}
				</button>
				<a class="btn btn-telegram" href={tgShare} target="_blank" rel="noopener">Telegram</a>
				<button
					class="btn btn-ghost qr-btn"
					aria-pressed={qrOpen}
					onclick={() => (qrOpen = !qrOpen)}>QR</button
				>
			</div>
			{#if qrOpen}
				<!-- eslint-disable-next-line svelte/no-at-html-tags -- our own SVG from uqr -->
				<div class="qr">{@html qr}</div>
			{/if}
		</section>

		<section class="setup">
			<div class="setup-map">
				<MapSign
					slug={st.map.slug}
					name={tx(st.map.name)}
					top={tx(st.map.description)}
					outline={st.map.outline}
				/>
			</div>
			<p class="setup-rules">
				<RulesFacts choice={choiceFrom(st.rules, st.map.slug)} />
			</p>
			<p class="setup-more">
				{extras(choiceFrom(st.rules, st.map.slug), st.map.canMove ?? true)}
			</p>
			{#if isHost}
				<button class="btn setup-btn" onclick={openSettings}>
					<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"
						><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle
							cx="10"
							cy="17"
							r="2"
						/></svg
					>
					{t('changeMapRules')}
				</button>
			{:else}
				<p class="setup-host">
					<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"
						><rect x="5" y="10.5" width="14" height="10" rx="2" /><path
							d="M8 10.5V8a4 4 0 0 1 8 0v2.5"
						/></svg
					>
					{t('onlyHostChanges')}
				</p>
			{/if}
		</section>

		<section class="players">
			<h2 class="section-title">
				{t('players')} <span class="count">{players.length} / {st.maxPlayers}</span>
			</h2>
			<ul>
				{#each players as p, i (p.id)}
					<li class:off={!p.online}>
						<span class="avatar ring" style:--ring={playerColor(i)}>{p.avatar}</span>
						<span class="who">
							<b>{p.name}</b>
							<span class="tags">
								{#if p.id === st.host}<span class="tag host">{t('hostTag')}</span>{/if}
								{#if p.id === st.you}<span class="tag">{t('youTag')}</span>{/if}
								{#if !p.online}<span class="tag">{t('offline')}</span>{/if}
							</span>
						</span>
						{#if p.id === st.you && st.joined}
							<button
								class="icon-btn"
								onclick={startNaming}
								aria-label={t('changeName')}
								title={t('changeName')}
							>
								<svg viewBox="0 0 24 24" class="icon"
									><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" /></svg
								>
							</button>
						{:else if isHost}
							<button
								class="icon-btn"
								onclick={() => (target = p)}
								aria-label={t('playerMenu')}
								title={t('playerMenu')}
							>
								<svg viewBox="0 0 24 24" class="icon"
									><circle cx="5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle
										cx="19"
										cy="12"
										r="1.3"
									/></svg
								>
							</button>
						{/if}
					</li>
				{/each}
			</ul>
		</section>

		<div class="go">
			{#if !st.joined}
				<p class="wait">{t('connecting')}</p>
			{:else if isHost}
				<button
					class="btn btn-primary btn-play"
					onclick={() => hostAct('/v1/rooms/{code}/start')}
					disabled={busy}
				>
					<span>{busy ? t('starting') : t('start')}</span>
					<svg viewBox="0 0 24 24"><path d="M7 4.5v15l12-7.5z" /></svg>
				</button>
				{#if players.length < 2}<p class="wait">{t('roomAlone')}</p>{/if}
			{:else}
				<p class="wait">{t('waitHost')}</p>
			{/if}
			<button class="link-btn leave" onclick={leave}>{t('leave')}</button>
		</div>
	</main>
{:else}
	<div class="game">
		<RoundView
			bind:this={rv}
			rules={st.rules}
			bbox={st.map.bbox as BBox}
			n={round?.n ?? st.results.length}
			rounds={st.rules.rounds}
			{dots}
			total={me?.total ?? 0}
			hints={round?.hints ?? []}
			hintsLeft={round?.hintsLeft ?? 0}
			{status}
			{guess}
			guessLabel={local === 'waiting' && round
				? `${t('waitOthers')} · ${round.answered}/${round.players}`
				: undefined}
			onpick={pick}
			onguess={submit}
			onhint={useHint}
			ontimeup={submit}
		>
			{#snippet hud()}
				{#if round}
					<div class="chip players-chip" title={t('players')}>
						<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"
							><circle cx="9" cy="8" r="3.2" /><path d="M3 19c.6-3.3 3-5 6-5s5.4 1.7 6 5" /><circle
								cx="17"
								cy="9"
								r="2.5"
							/><path d="M16.5 14c2.4.2 4 1.7 4.5 4.5" /></svg
						>
						<span class="chip-value">{round.answered}/{round.players}</span>
					</div>
				{/if}
			{/snippet}
		</RoundView>

		{#if st.phase === 'playing' && local === 'opening'}
			<Loader text={t('loading')} />
		{/if}
		{#if blind && st.phase === 'playing'}
			<div class="blind">{t('roomNoPano')}</div>
		{/if}

		{#if st.phase === 'result' && last}
			<ResultLayout legend={false}>
				{#snippet map()}
					<ResultMap
						bbox={st.map.bbox as BBox}
						layer={savedLayer()}
						pairs={lastPairs}
						reveal
						onlanded={() => (landed = true)}
					/>
				{/snippet}
				<RoundReveal
					n={last.n}
					rounds={st.rules.rounds}
					score={myLast?.score ?? 0}
					km={myLast?.km}
					guessed={!!myLast?.guess}
					place={last.place}
					actual={last.actual}
					go={landed}
				>
					<ol class="table">
						{#each lastRows as s, i (s.player)}
							{@const p = nameOf(s.player)}
							<li class:me={s.player === st.you} style:animation-delay={`${700 + i * 80}ms`}>
								<span class="pos">{i + 1}</span>
								<span class="avatar ring" style:--ring={colorOf(s.player)}>{p?.avatar}</span>
								<span class="name">{p?.name ?? '—'}</span>
								<span class="km">{s.km != null ? fmtDistance(s.km) : '—'}</span>
								<b>+{fmtNum(s.score)}</b>
							</li>
						{/each}
					</ol>
				</RoundReveal>
				{#snippet actions()}
					{#if isHost}
						<button
							class="btn btn-primary next"
							onclick={() => hostAct('/v1/rooms/{code}/next')}
							disabled={busy}
						>
							{gameOver ? t('finish') : t('next')}
							<svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6" /></svg>
						</button>
						{#if !st.rules.rounds}
							<button
								class="btn btn-ghost"
								onclick={() => hostAct('/v1/rooms/{code}/next', true)}
								disabled={busy}>{t('finishGame')}</button
							>
						{/if}
					{:else}
						<p class="wait"><span class="spinner"></span>{t('waitHostNext')}</p>
					{/if}
				{/snippet}
			</ResultLayout>
		{/if}

		{#if st.phase === 'final'}
			<ResultLayout tall legend={false}>
				{#snippet map()}
					<ResultMap bbox={st.map.bbox as BBox} layer={savedLayer()} pairs={finalPairs} />
				{/snippet}
				<div class="final">
					<div class="final-head">
						<MapSign slug={st.map.slug} name={tx(st.map.name)} size="small" />
						<h1>
							{#if winner && winner.total > 0}
								{winner.id === st.you ? t('youWin') : t('wins', { name: winner.name })}
							{:else}
								{t('gameOver')}
							{/if}
						</h1>
					</div>
					<ol class="table standings">
						{#each standings as p, i (p.id)}
							<li
								class:me={p.id === st.you}
								class:off={p.left}
								class:first={i === 0 && p.total > 0}
								style:animation-delay={`${200 + i * 90}ms`}
							>
								<span class="medal">{i < 3 && p.total > 0 ? ['🥇', '🥈', '🥉'][i] : i + 1}</span>
								<span class="avatar ring" style:--ring={colorOf(p.id)}>{p.avatar}</span>
								<span class="name">{p.name}</span>
								<b>{fmtNum(p.total)}</b>
							</li>
						{/each}
					</ol>
					<div class="trip">
						<h2 class="section-title">{t('streetsThisGame')}</h2>
						<div class="rounds">
							{#each st.results as r, i (r.n)}
								<button
									aria-pressed={finalPick === i}
									onclick={() => (finalPick = finalPick === i ? null : i)}
								>
									<span class="stop-n">{r.n}</span>
									<StreetPlate place={r.place} size="small" />
								</button>
							{/each}
						</div>
					</div>
				</div>
				{#snippet actions()}
					{#if isHost}
						<button
							class="btn btn-primary"
							onclick={() => hostAct('/v1/rooms/{code}/start')}
							disabled={busy}
						>
							<svg viewBox="0 0 24 24"
								><path d="M3.5 12a8.5 8.5 0 1 0 2.8-6.3L3.5 8.3M3.5 3.5v4.8h4.8" /></svg
							>
							{t('playAgain')}
						</button>
					{:else}
						<p class="wait"><span class="spinner"></span>{t('waitHostNext')}</p>
					{/if}
					{#if st.yourGame}
						<button class="btn btn-sky" onclick={shareResults}>
							<svg viewBox="0 0 24 24"
								><path
									d="M12 15V3.5M7.5 8 12 3.5 16.5 8M5 12.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-6.5"
								/></svg
							>
							{t('shareResults')}
						</button>
					{/if}
					<div class="row">
						{#if isHost}
							<button class="btn btn-ghost" onclick={openSettings}>{t('roomSettings')}</button>
						{/if}
						{#if st.yourGame}
							<a class="btn btn-ghost" href={`/game/${st.yourGame}`}>{t('myGame')}</a>
						{/if}
					</div>
					<button class="link-btn leave" onclick={leave}>{t('leave')}</button>
				{/snippet}
			</ResultLayout>
			{#if winner && winner.id === st.you && winner.total > 0}<Confetti />{/if}
		{/if}
	</div>
{/if}

{#if away}
	<div class="away">{t('connLost')}</div>
{/if}

<ShareSheet
	share={sharing?.share ?? null}
	title={sharing?.title}
	onclose={() => (sharing = null)}
/>

<Sheet open={settingsOpen} onclose={() => (settingsOpen = false)} title={t('changeMapRules')}>
	{#if choice}
		<div class="sheet-body">
			<div class="field-label">{t('map')}</div>
			<div class="map-list">
				{#each maps as m (m.slug)}
					<button
						aria-pressed={choice.map === m.slug}
						onclick={() => choice && (choice.map = m.slug)}
					>
						<MapSign
							slug={m.slug}
							name={tx(m.name)}
							top={tx(m.description)}
							outline={m.outline}
							size="small"
						/>
					</button>
				{/each}
			</div>
			<RulesForm bind:choice canMove={chosenMap?.canMove ?? true} />
			<button class="btn btn-primary" onclick={saveSettings} disabled={busy}>{t('save')}</button>
		</div>
	{/if}
</Sheet>

<Sheet open={!!target} onclose={() => (target = null)} title={target?.name}>
	<div class="sheet-body">
		<button class="btn btn-sky" onclick={() => onPlayer('/v1/rooms/{code}/host')}
			>{t('makeHost')}</button
		>
		<button class="btn btn-danger" onclick={() => onPlayer('/v1/rooms/{code}/kick')}
			>{t('kick')}</button
		>
	</div>
</Sheet>

<Sheet open={naming} onclose={() => (naming = false)} title={t('changeName')}>
	<form class="sheet-body" onsubmit={saveName}>
		<input class="name-input" bind:value={newName} maxlength="24" aria-label={t('changeName')} />
		{#if nameError}<p class="field-note bad">{t('badName')}</p>{/if}
		<button class="btn btn-primary" disabled={newName.trim().length < 2}>{t('save')}</button>
	</form>
</Sheet>

<style>
	/* ---------- the lobby ---------- */
	.lobby {
		max-width: 560px;
		margin: 0 auto;
		padding: 8px 16px 40px;
		display: flex;
		flex-direction: column;
		gap: 22px;
	}
	.head {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: 12px;
	}
	.kicker {
		font-size: 15px;
		font-weight: 600;
		color: var(--muted);
	}
	/* the code as an Uzbek number plate: white, a black rim, the flag and UZ at the right end */
	.plate {
		display: inline-flex;
		align-items: stretch;
		border: 3px solid #13151a;
		border-radius: 10px;
		background: #fff;
		color: #13151a;
		box-shadow:
			0 2px 0 rgba(0, 0, 0, 0.25),
			0 10px 26px rgba(0, 0, 0, 0.12);
		overflow: hidden;
	}
	.plate b {
		padding: 6px 14px 4px 20px;
		font-family: var(--display);
		font-size: clamp(34px, 11vw, 48px);
		font-weight: 800;
		letter-spacing: 0.14em;
		line-height: 1.1;
	}
	.plate-end {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 4px;
		padding: 0 10px;
		border-left: 2px solid #13151a;
	}
	.plate-flag {
		display: flex;
		flex-direction: column;
		width: 24px;
		height: 15px;
		border: 1px solid #13151a;
	}
	.plate-flag i {
		flex: 1;
	}
	.plate-flag i:nth-child(1) {
		background: #0099b5;
	}
	.plate-flag i:nth-child(2) {
		background: #fff;
		border-block: 1px solid #ce1126;
	}
	.plate-flag i:nth-child(3) {
		background: #1eb53a;
	}
	.plate-uz {
		font-size: 13px;
		font-weight: 800;
		letter-spacing: 0.06em;
		line-height: 1;
	}
	.sub {
		color: var(--muted);
		font-size: 14.5px;
		max-width: 380px;
	}
	.invite {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		justify-content: center;
	}
	.invite .btn {
		height: 46px;
	}
	.qr-btn[aria-pressed='true'] {
		background: var(--surface-2);
	}
	.qr {
		width: min(240px, 70vw);
		padding: 10px;
		border-radius: 16px;
		background: #fff;
		box-shadow: var(--shadow);
	}
	.qr :global(svg) {
		display: block;
		width: 100%;
		height: auto;
	}
	.setup {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		padding: 16px;
		border-radius: 18px;
		background: var(--surface);
		border: 1px solid var(--border);
		text-align: center;
	}
	.setup-map {
		width: min(340px, 100%);
	}
	.setup-btn {
		width: 100%;
		margin-top: 8px;
		height: auto;
		min-height: 52px;
		padding: 10px 16px;
		font-size: 14.5px;
		line-height: 1.25;
		text-align: center;
	}
	.setup-host {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 13.5px;
		color: var(--muted);
	}
	.setup-host .icon {
		width: 16px;
		height: 16px;
	}
	.setup-rules {
		font-size: 14px;
		font-weight: 600;
	}
	.players h2 {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
	}
	.setup-more {
		font-size: 13px;
		color: var(--muted);
	}
	.count {
		font-family: var(--body);
		font-size: 13px;
		color: var(--muted);
		font-weight: 500;
	}
	.players ul {
		list-style: none;
		margin-top: 10px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.players li {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 10px;
		border-radius: 14px;
		background: var(--surface);
		border: 1px solid var(--border);
	}
	.players li.off {
		opacity: 0.55;
	}
	.avatar.ring {
		box-shadow: 0 0 0 2.5px var(--ring);
	}
	.players .avatar {
		width: 38px;
		height: 38px;
		font-size: 20px;
		background: var(--bg);
	}
	.who {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.who b {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.tags {
		display: flex;
		gap: 6px;
	}
	.tag {
		font-size: 11px;
		font-weight: 600;
		color: var(--muted);
	}
	.tag.host {
		color: var(--gold-ink, #9a6b00);
	}
	.tag.host::before {
		content: '👑 ';
	}
	.go {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
	}
	.btn-play {
		width: 100%;
		height: 66px;
		justify-content: space-between;
		padding: 0 22px 0 24px;
		font-size: 20px;
		border-radius: 20px;
	}
	.btn-play svg {
		width: 24px;
		height: 24px;
		fill: currentColor;
		stroke: none;
	}
	.wait {
		color: var(--muted);
		font-size: 14.5px;
		text-align: center;
	}
	.leave {
		color: var(--muted);
	}

	/* ---------- the game ---------- */
	.game {
		position: fixed;
		inset: 0;
		overflow: hidden;
		background: #000;
		color: #fff;
	}
	.blind {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		max-width: min(360px, calc(100vw - 32px));
		padding: 14px 18px;
		border-radius: 14px;
		background: var(--hud);
		text-align: center;
		z-index: 500;
	}
	.away {
		position: fixed;
		top: max(12px, env(safe-area-inset-top));
		left: 50%;
		transform: translateX(-50%);
		z-index: 4000;
		padding: 8px 14px;
		border-radius: 999px;
		background: var(--hud);
		color: #fff;
		font-size: 13.5px;
		font-weight: 600;
		box-shadow: var(--shadow);
	}

	.gone {
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
	.gone {
		position: static;
		min-height: 60vh;
		font-family: var(--display);
		font-weight: 700;
		font-size: 17px;
	}
	.gone .row {
		display: flex;
		gap: 10px;
	}
	.mark {
		animation: bob 1.4s ease-in-out infinite;
	}
	@keyframes bob {
		50% {
			transform: translateY(-8px);
		}
	}

	/* results and the final table */
	.next {
		height: 60px;
		font-size: 17px;
	}
	.wait {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
	}
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
	.final h1 {
		font-family: var(--display);
		font-weight: 800;
		font-size: 30px;
		line-height: 1.08;
		letter-spacing: -0.02em;
		animation: pop-in 0.5s var(--pop) both;
	}
	.table {
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin-top: 4px;
	}
	.table li {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px;
		border-radius: 12px;
		font-size: 14px;
		animation: rise 0.35s var(--settle) both;
	}
	.table li.me {
		background: color-mix(in srgb, var(--sky) 12%, transparent);
	}
	.table li.off {
		opacity: 0.5;
	}
	.table .pos {
		width: 18px;
		text-align: center;
		color: var(--muted);
		font-weight: 700;
	}
	.table .avatar {
		width: 30px;
		height: 30px;
		font-size: 17px;
		background: var(--bg);
		flex: none;
	}
	.table .name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-weight: 600;
	}
	.table .km {
		color: var(--muted);
		font-size: 13px;
	}
	.table b {
		font-family: var(--display);
		min-width: 56px;
		text-align: right;
	}
	/* the winner's row stands out like a podium's top step */
	.standings li {
		padding: 10px 10px;
		font-size: 15px;
	}
	.standings li.first {
		background: color-mix(in srgb, var(--star) 20%, var(--surface));
		box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--star) 60%, transparent);
	}
	.standings .medal {
		width: 26px;
		text-align: center;
		font-size: 20px;
		color: var(--muted);
		font-weight: 700;
	}
	.standings .avatar {
		width: 36px;
		height: 36px;
		font-size: 20px;
	}
	.standings b {
		font-size: 18px;
	}
	.trip .rounds {
		margin-top: 10px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.rounds button {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 7px 8px;
		border: none;
		border-radius: 12px;
		background: none;
		color: var(--text);
		text-align: left;
	}
	.rounds button[aria-pressed='true'],
	.rounds button:hover {
		background: color-mix(in srgb, var(--sky) 12%, transparent);
	}
	.stop-n {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		background: var(--surface-2);
		font-weight: 700;
		font-size: 12.5px;
		display: grid;
		place-items: center;
		flex: none;
	}
	.leave {
		align-self: center;
	}
	.game :global(.players-chip .icon) {
		width: 20px;
		height: 20px;
		opacity: 0.8;
	}

	/* the sheets */
	.sheet-body {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.map-list {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
	}
	.map-list button {
		padding: 6px;
		border: 2px solid transparent;
		border-radius: 14px;
		background: var(--bg);
	}
	.map-list button[aria-pressed='true'] {
		border-color: var(--green);
	}
	.name-input {
		height: 48px;
		padding: 0 14px;
		border: 1px solid var(--border);
		border-radius: 12px;
		background: var(--surface);
		color: var(--text);
		font-size: 16px;
	}
	.bad {
		color: var(--red);
	}

	@media (min-width: 900px) {
		.lobby {
			max-width: 980px;
			display: grid;
			grid-template-columns: minmax(0, 1fr) 400px;
			grid-template-areas:
				'head players'
				'setup players'
				'. go';
			align-items: start;
			column-gap: 40px;
			padding-top: 24px;
		}
		.head {
			grid-area: head;
		}
		.setup {
			grid-area: setup;
		}
		.players {
			grid-area: players;
		}
		.go {
			grid-area: go;
		}
	}
	@media (max-width: 760px) {
		/* Start stays under the thumb */
		.go {
			position: sticky;
			bottom: 0;
			margin: 0 -16px;
			padding: 12px 16px max(12px, env(safe-area-inset-bottom));
			background: var(--bg);
		}
	}
</style>
