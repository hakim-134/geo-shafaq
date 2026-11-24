<script lang="ts">
	import { getContext, onMount, tick, type Snippet } from 'svelte';
	import { goto } from '$app/navigation';
	import { renderSVG } from 'uqr';
	import {
		api,
		call,
		send,
		ApiError,
		type LatLon,
		type MapSummary,
		type RoomPlayer,
		type RoomState
	} from '#lib/api/client.js';
	import { RoomLink } from '#lib/room.svelte.js';
	import {
		forgetRoom,
		readRoomRounds,
		rememberRoom,
		rememberRoomRounds
	} from '#lib/current-room.js';
	import { roomLobbyContext, type SetRoomLobby } from '#lib/tabs.js';
	import RoomPlate from '#lib/components/RoomPlate.svelte';
	import Picker from '#lib/maps/Picker.svelte';
	import MapPicks from '#lib/maps/MapPicks.svelte';
	import RoundView, { type Status } from '#lib/game/RoundView.svelte';
	import ResultMap, { type Pair } from '#lib/map/ResultMap.svelte';
	import { savedLayer, type BBox } from '#lib/map/map.js';
	import GameBar from '#lib/components/GameBar.svelte';
	import Sheet from '#lib/components/Sheet.svelte';
	import RulesForm from '#lib/game/RulesForm.svelte';
	import Loader from '#lib/game/Loader.svelte';
	import ResultLayout from '#lib/game/ResultLayout.svelte';
	import FiveK from '#lib/game/FiveK.svelte';
	import { fiveKVisible, fiveKScorers, fiveKNames } from '#lib/game/five-k.svelte.js';
	import RoundReveal from '#lib/game/RoundReveal.svelte';
	import RenameButton from '#lib/game/RenameButton.svelte';
	import Podium from '#lib/game/Podium.svelte';
	import EndStreets, { type EndRound } from '#lib/game/EndStreets.svelte';
	import NextRing from '#lib/game/NextRing.svelte';
	import { extras } from '#lib/game/summary.js';
	import RulesFacts from '#lib/game/RulesFacts.svelte';
	import ShareSheet from '#lib/components/ShareSheet.svelte';
	import {
		roundMark,
		challengeCode,
		challengeUrl,
		copyText,
		nativeShare,
		type Share
	} from '#lib/game/share.js';
	import { sfxJoin, unlockAudio, vibrate } from '#lib/sfx.svelte.js';
	import { playerColor } from '#lib/game/colors.js';
	import { choiceFrom, loadChoice, rulesFor, testProviders, type Choice } from '#lib/rules.js';
	import { PanoError } from '#lib/pano/index.js';
	import { t, tx, type Key } from '#lib/i18n/index.svelte.js';
	import { ensureSession, refreshMe, setMe } from '#lib/session.svelte.js';
	import { crowdKm, fmtDistance, fmtNum } from '#lib/format.js';
	import { showToast } from '#lib/toast.svelte.js';

	let { roomCode }: { roomCode: string } = $props();
	const setRoomLobby = getContext<SetRoomLobby>(roomLobbyContext);
	let mounted = false;
	let leaving = false;
	let remembered = false;
	let link = $state<RoomLink | null>(null);
	let loadError = $state<Key | null>(null);
	let rv = $state<ReturnType<typeof RoundView>>();

	const st = $derived<RoomState | null>(link?.state ?? null);
	const code = $derived(st?.code ?? roomCode);
	const players = $derived(st?.players ?? []);
	const me = $derived(players.find((p) => p.id === st?.you));
	const isHost = $derived(!!st && st.joined && st.host === st.you);
	const colorOf = (id: string) => playerColor(players.findIndex((p) => p.id === id));
	const nameOf = (id: string) => players.find((p) => p.id === id);
	const roomUrl = $derived(`${location.origin}/room/${code}`);

	// ---------- the room ----------
	onMount(() => {
		mounted = true;
		open(roomCode);
		return () => {
			mounted = false;
			link?.stop();
			clearTimeout(copiedTimer);
			clearTimeout(awayTimer);
			clearTimeout(pinTimer);
		};
	});

	$effect(() => {
		if (st?.phase !== 'lobby' || link?.gone) return;
		setRoomLobby(roomCode);
		return () => setRoomLobby(null);
	});

	$effect(() => {
		if (link?.gone || loadError === 'err_no_room') forgetRoom(roomCode);
		else if (st?.joined && !st.blocked && !leaving && !remembered) {
			rememberRoom(roomCode);
			remembered = true;
		}
	});

	async function open(c: string) {
		link?.stop();
		loadError = null;
		const l = new RoomLink(c);
		link = l;
		try {
			await ensureSession();
			if (!mounted) return;
			const state = await l.load();
			if (!mounted || link !== l) return;
			if (state.blocked) l.gone = state.blocked as typeof l.gone;
			else l.connect();
		} catch (e) {
			if (mounted && link === l)
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
		if (link?.gone === 'left' && !leaving) goto('/');
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
	// is cut to 45 s after the first guess (so a room with no limit shows one then too)
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
		deadline = 0; // open() clears the clock: once it is open, the server's time left starts it again
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
	const scorers = $derived(fiveKScorers(last?.scores ?? [], players));
	let countedRound = $state<string>();
	const perfectRound = $derived(
		st && last && landed && scorers.length ? `room:${code}:${st.games}:${last.n}` : undefined
	);
	const myLast = $derived(last?.scores.find((s) => s.player === st?.you));
	const ownPerfect = $derived(myLast?.score === 5000);
	const showFiveK = fiveKVisible(
		() => (!ownPerfect || countedRound === perfectRound ? perfectRound : undefined),
		() => (ownPerfect ? 0 : 500)
	);
	const lastRows = $derived(
		last ? [...last.scores].sort((a, b) => b.score - a.score || (a.km ?? 1e9) - (b.km ?? 1e9)) : []
	);
	const lastPairs = $derived<Pair[]>(
		last
			? last.scores.map((s) => ({
					actual: last.actual,
					heading: last.heading,
					guess: s.guess,
					guessColor: colorOf(s.player),
					guessLabel: nameOf(s.player)?.avatar,
					trail: nameOf(s.player)?.trail ?? ''
				}))
			: []
	);
	const lastCrowd = $derived(last ? crowdKm(last.scores) : undefined);
	const gameOver = $derived(!!st && st.rules.rounds > 0 && st.results.length >= st.rules.rounds);
	// the points a player's hints took in this game (free hints take none)
	const hintCostOf = (id: string) =>
		(st?.results ?? []).reduce((n, r) => {
			const s = r.scores.find((x) => x.player === id);
			return n + (s?.base ? s.base - s.score : 0);
		}, 0);

	const hostP = $derived(players.find((p) => p.id === st?.host));
	const standings = $derived(
		[...players].sort((a, b) => b.total - a.total || Number(a.left) - Number(b.left))
	);
	let finalPick = $state<number | null>(null);
	const finalPairs = $derived<Pair[]>(
		(st?.results ?? [])
			.filter((r, i) => finalPick === null || i === finalPick)
			.flatMap((r) =>
				r.scores
					.filter((s) => finalPick !== null || s.player === st?.you)
					.map((s) => ({
						actual: r.actual,
						heading: r.heading,
						label: String(r.n),
						guess: s.guess,
						guessColor: colorOf(s.player),
						guessLabel: nameOf(s.player)?.avatar,
						trail: nameOf(s.player)?.trail ?? ''
					}))
			)
	);
	$effect(() => {
		if (st?.phase === 'final') refreshMe().catch(() => {});
		else finalPick = null;
	});

	// the end's list of this game's streets, with my points on each, as a solo game's end
	const endRounds = $derived<EndRound[]>(
		(st?.results ?? []).map((r) => {
			const s = r.scores.find((x) => x.player === st?.you);
			return {
				n: r.n,
				place: r.place,
				score: s?.score ?? 0,
				base: s?.base,
				hintsUsed: s?.hintsUsed
			};
		})
	);

	// ---------- the host ----------
	let busy = $state(false);
	async function hostAct(path: '/v1/rooms/{code}/start' | '/v1/rooms/{code}/next', finish = false) {
		if (!link || busy || changingMap) return;
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

	// the host stops the ring: the room waits for their "Keyingi raund"
	async function hold() {
		if (!link || busy) return;
		try {
			await link.act(() =>
				call(api().POST('/v1/rooms/{code}/hold', { params: { path: { code } } }))
			);
		} catch (e) {
			showToast(t(errorKey(e)));
		}
	}

	let settingsOpen = $state(false);
	let choice = $state<Choice | null>(null);
	let changingMap = $state(false);
	let picked = $state(false);
	const soloRounds = loadChoice().rounds;
	let requestedRounds = $state<number>();
	const desiredRounds = $derived(
		requestedRounds ?? (st ? readRoomRounds(st.code, st.you) : undefined) ?? soloRounds
	);

	async function setMap(map: MapSummary) {
		const room = link;
		if (!room || !mounted || leaving || !st || !isHost || st.phase !== 'lobby') return;
		await room.act(() => {
			if (!mounted || leaving || !st || !isHost || st.phase !== 'lobby')
				throw new ApiError('not_host', 403);
			return call(
				api().POST('/v1/rooms/{code}/rules', {
					params: { path: { code } },
					body: { map: map.slug, rules: { ...st.rules, rounds: desiredRounds } }
				})
			);
		});
		picked = true;
	}

	function openSettings() {
		if (!st || !isHost || changingMap || busy) return;
		choice = choiceFrom(st.rules, st.map.slug);
		choice.rounds = desiredRounds;
		settingsOpen = true;
	}

	async function saveSettings() {
		if (!link || !choice || !st || !isHost || changingMap || busy) return;
		const map = st.map.slug;
		const rules = rulesFor(choice, testProviders());
		const player = st.you;
		busy = true;
		try {
			await link.act(() =>
				call(
					api().POST('/v1/rooms/{code}/rules', {
						params: { path: { code } },
						body: { map, rules }
					})
				)
			);
			requestedRounds = rules.rounds;
			rememberRoomRounds(code, player, rules.rounds);
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
		} catch (err) {
			if (err instanceof ApiError && err.code === 'bad_name') nameError = true;
			else showToast(t('err_other'));
		}
	}

	async function leave() {
		if (leaving) return;
		leaving = true;
		forgetRoom(code);
		try {
			await send(api().POST('/v1/rooms/{code}/leave', { params: { path: { code } } }));
		} catch {
			/* gone anyway */
		}
		link?.stop();
		if (mounted) goto('/');
	}

	// ---------- inviting ----------
	// A phone shares the link through its own sheet (Telegram first on most Uzbek phones); a
	// laptop copies it and shows the QR code for the phones in the same room.
	const phone = matchMedia('(pointer: coarse)').matches;
	let codeOpen = $state(false);
	let qrOpen = $state(false);
	const qr = $derived(renderSVG(roomUrl, { border: 1, blackColor: '#06282f', whiteColor: '#fff' }));
	const inviteText = $derived(st ? t('invite', { map: tx(st.map.name), code }) : '');
	// the phone's share sheet where there is one (https); our own sheet (copy, Telegram) anywhere else
	let sharing = $state<{ share: Share; title: string } | null>(null);
	let copied = $state(false);
	let copiedTimer: ReturnType<typeof setTimeout> | undefined;
	async function invite() {
		const share = { url: roomUrl, text: inviteText };
		if (phone) {
			if (!(await nativeShare(share))) sharing = { share, title: t('inviteTitle') };
		} else if (await copyText(`${inviteText}\n${roomUrl}`)) {
			copied = true;
			clearTimeout(copiedTimer);
			copiedTimer = setTimeout(() => (copied = false), 2500);
		} else sharing = { share, title: t('inviteTitle') };
	}

	function fitPlayerName(el: HTMLElement, _name: string) {
		function fit() {
			if (!el.isConnected) return;
			el.style.fontSize = '';
			let size = 12;
			while ((el.scrollWidth > el.clientWidth || el.scrollHeight > 28) && size > 6) {
				size -= 0.5;
				el.style.fontSize = `${size}px`;
			}
		}
		fit();
		void document.fonts.ready.then(fit);
		return { update: fit };
	}

	// friends pop in with a sound (not the ones already here when the page opened)
	let known: Set<string> | null = null;
	$effect(() => {
		const ids = players.map((p) => p.id);
		if (!st?.joined) return;
		if (known && ids.some((id) => !known!.has(id) && id !== st?.you)) {
			sfxJoin();
			vibrate(30);
		}
		known = new Set(ids);
	});

	// the end: the next step, or the rest under ⋯
	let moreOpen = $state(false);

	// after a game: a challenge's link to its streets, with everyone here on its leaderboard
	let inviting = $state(false);
	async function shareResults() {
		if (!st?.yourGame || inviting) return;
		inviting = true;
		let url = '';
		try {
			url = challengeUrl(await challengeCode(st.yourGame));
		} catch (e) {
			showToast(t(errorKey(e)));
		}
		inviting = false;
		if (!url) return;
		const place = standings.findIndex((p) => p.id === st?.you) + 1;
		const squares = st.results
			.map((r) => r.scores.find((x) => x.player === st?.you)?.score ?? 0)
			.map(roundMark)
			.join('');
		const share = {
			url,
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
		if (!(await nativeShare(share))) sharing = { share, title: t('challengeFriend') };
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
		if (naming || (e.target as HTMLElement).closest('input, textarea, button, a')) return;
		if (e.key === 'Enter' && isHost && st?.phase === 'result') {
			e.preventDefault();
			hostAct('/v1/rooms/{code}/next');
		}
	}
</script>

<svelte:window onkeydown={onKey} ononline={wake} onpointerdown={unlockAudio} />
<svelte:document onvisibilitychange={wake} />
<svelte:head><title>{t('room')} {code} — GeoShafaq</title></svelte:head>

{#if loadError || link?.gone}
	<GameBar standalone />
	<main class="gone">
		<img class="mark" src="/mark.svg" alt="" width="72" height="72" />
		<h1 class="d float">{t(loadError ?? goneKey[link?.gone ?? ''] ?? 'roomClosed')}</h1>
		<div class="row">
			{#if loadError === 'err_network'}
				<button class="btn btn-primary" onclick={() => open(code)}
					><span class="lbl">{t('retry')}</span></button
				>
				<a class="btn btn-chip" href="/friends">{t('tabFriends')}</a>
			{:else}
				<a class="btn btn-primary" href="/friends"><span class="lbl">{t('tabFriends')}</span></a>
			{/if}
		</div>
	</main>
{:else if !st || (!st.joined && st.phase !== 'lobby')}
	<Loader text={t('connecting')} />
{:else if st.phase === 'lobby'}
	<div class="lobby-page">
		<div class="lobby-top"><GameBar /></div>
		<main class="lobby page-with-actions">
			<div class="lobby-content picker-layout page-scroll">
				<section class="players" aria-label={t('players')}>
					{#if players.length}
						<div class="players-count" aria-label={t('players') + ': ' + players.length}>
							<span aria-hidden="true">👥</span> <b class="d">{fmtNum(players.length)}</b>
						</div>
					{/if}
					<ul>
						{#each players as p, i (p.id)}
							<li class:off={!p.online} class:me={p.id === st.you}>
								{#snippet face()}
									<span class="avatar ring" style:--ring={playerColor(i)} data-frame={p.frame}>
										<em class="pc"></em>
										{p.avatar}
										{#if p.id === st?.host}<span class="crown" aria-hidden="true">👑</span>{/if}
									</span>
									<span class="name" use:fitPlayerName={p.name}
										>{#if p.guest && p.id === st?.you}{@const cut =
												p.name.lastIndexOf(' ') + 1}{p.name.slice(0, cut)}<span class="nowrap"
												>{p.name.slice(cut)}&nbsp;<svg
													class="icon pencil"
													viewBox="0 0 24 24"
													aria-hidden="true"><path d="m4 16-1 5 5-1L20 8l-4-4zM14 6l4 4" /></svg
												></span
											>{:else}{p.name}{/if}</span
									>
								{/snippet}
								{#if p.id === st.you || isHost}
									<button
										class="player"
										onclick={() => (p.id === st?.you ? startNaming() : (target = p))}
										aria-label={p.id === st.you ? t('changeName') : p.name + ': ' + t('playerMenu')}
										>{@render face()}</button
									>
								{:else}
									<a class="player" href={'/u/' + p.id}>{@render face()}</a>
								{/if}
							</li>
						{/each}
						{#if players.length < st.maxPlayers}
							<li class="slot">
								<button class="player" onclick={invite} aria-label={t('inviteTitle')}>
									<span class="avatar empty">{@render inviteIcon()}</span>
								</button>
							</li>
						{/if}
					</ul>
				</section>

				<Picker
					current={st.map}
					onchange={setMap}
					readonly={!isHost}
					busy={busy || settingsOpen}
					bind:changing={changingMap}
					defaultPick={!picked && st.map.slug === 'tashkent-streets'}
					shared
				/>

				{#snippet facts()}<RulesFacts choice={choiceFrom(st.rules, st.map.slug)} />{/snippet}
				{#if isHost}
					<button
						class="rules"
						onclick={openSettings}
						disabled={busy || changingMap}
						aria-label={t('changeRules')}
					>
						{@render facts()}
						<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
					</button>
				{:else}
					<div class="rules">{@render facts()}</div>
				{/if}

				<section class="invite">
					<button
						class="btn invite-btn"
						class:btn-sky={isHost && players.length < 2}
						class:btn-chip={!isHost || players.length > 1}
						onclick={invite}
					>
						{#if copied}
							<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"
								><path d="m5 12.5 4.5 4.5L19 7" /></svg
							>
							<span class="lbl">{t('linkCopied')}</span>
						{:else}
							{@render inviteIcon()}
							<span class="lbl">{t('inviteTitle')}</span>
						{/if}
					</button>
					<div class="plate-row">
						<RoomPlate {code} />
						<button
							class="icon-btn qr-btn"
							onclick={() => (qrOpen = true)}
							aria-label={t('qrCode')}
						>
							<svg viewBox="0 0 24 24" class="icon" aria-hidden="true">
								<rect x="3.5" y="3.5" width="7" height="7" rx="1" />
								<rect x="13.5" y="3.5" width="7" height="7" rx="1" />
								<rect x="3.5" y="13.5" width="7" height="7" rx="1" />
								<path d="M14 14h2.5v2.5H14zM18 18h2.5v2.5H18zM18 14h2.5M14 18v2.5" />
							</svg>
						</button>
					</div>
				</section>

				<div class="lobby-links">
					{#if isHost}
						<button class="link-btn" onclick={() => (codeOpen = true)}>{t('haveCode')}</button>
					{/if}
					{#if st.joined}<button class="link-btn leave" onclick={leave}>{t('leave')}</button>{/if}
				</div>
			</div>

			<div class="go">
				{#if !st.joined}
					<p class="wait"><span class="spinner"></span>{t('connecting')}</p>
				{:else if isHost}
					<button
						class="btn btn-play"
						class:btn-primary={players.length > 1}
						class:btn-chip={players.length < 2}
						onclick={() => hostAct('/v1/rooms/{code}/start')}
						disabled={busy || changingMap}
					>
						<span class="lbl">{busy ? t('starting') : t('start')}</span>
						<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" /></svg>
					</button>
				{:else}
					<p class="wait">
						{#if hostP}<span
								class="avatar host-face"
								style:--ring={colorOf(hostP.id)}
								data-frame={hostP.frame}
								><em class="pc"></em>{hostP.avatar}<i aria-hidden="true">👑</i></span
							>{/if}
						{t('waitHost')}
					</p>
				{/if}
			</div>
		</main>
	</div>
{:else}
	<div class="game">
		<RoundView
			bind:this={rv}
			rules={st.rules}
			map={st.map}
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
			onleave={leave}
		>
			{#snippet hud(clock: Snippet | null)}
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
						{@render clock?.()}
					</div>
				{/if}
			{/snippet}
			{#snippet waitingExtra()}
				{#if me?.guest}<span class="waiting-name"
						><RenameButton name={t('yourName', { name: me.name })} onclick={startNaming} /></span
					>{/if}
			{/snippet}
			{#snippet hudDetail()}
				<div class="cap round-map"><MapPicks map={st.map} compact /></div>
			{/snippet}
		</RoundView>

		{#if st.phase === 'playing' && local === 'opening'}
			<Loader text={t('loading')} />
		{/if}
		{#if blind && st.phase === 'playing'}
			<div class="blind cap">{t('roomNoPano')}</div>
		{/if}

		{#if st.phase === 'result' && last}
			<ResultLayout legend="actual">
				{#snippet map()}
					<ResultMap
						bbox={st.map.bbox as BBox}
						layer={savedLayer()}
						pairs={lastPairs}
						reveal
						crowd={lastCrowd}
						onlanded={() => (landed = true)}
					>
						{#snippet overlay(frame)}
							{#if showFiveK()}<FiveK
									{frame}
									place={last!.place}
									names={fiveKNames(scorers, st.you)}
									friend={!ownPerfect}
									{colorOf}
								/>{/if}
						{/snippet}
					</ResultMap>
				{/snippet}
				<div class="result-picks"><MapPicks map={st.map} on="panel" /></div>
				<RoundReveal
					n={last.n}
					rounds={st.rules.rounds}
					score={myLast?.score ?? 0}
					base={myLast?.base}
					hints={myLast?.hintsUsed}
					cost={st.rules.hints.cost}
					km={myLast?.km}
					guessed={!!myLast?.guess}
					place={last.place}
					actual={last.actual}
					heading={last.heading}
					crowd={lastCrowd}
					go={landed}
					ondone={() => (countedRound = perfectRound)}
					fiveK={scorers.length > 0}
					earned={myLast?.earned ?? []}
				>
					<ol class="table">
						{#each lastRows as s, i (s.player)}
							{@const p = nameOf(s.player)}
							<li class:me={s.player === st.you} style:animation-delay={`${700 + i * 80}ms`}>
								<span class="pos">{i + 1}</span>
								<span class="avatar ring" style:--ring={colorOf(s.player)} data-frame={p?.frame}
									><em class="pc"></em>{p?.avatar}</span
								>
								<span class="name"
									>{#if p?.guest && p.id === st.you}<RenameButton
											name={p.name}
											onclick={startNaming}
											row
										/>{:else}{p?.name ?? '—'}{/if}</span
								>
								<span class="km">{s.km != null ? fmtDistance(s.km) : '—'}</span>
								{#if s.base}
									<span class="cut pill" title={t('hintsTaken', { n: s.hintsUsed })}
										>💡 <s>{fmtNum(s.base)}</s></span
									>
								{/if}
								<b>+{fmtNum(s.score)}</b>
							</li>
						{/each}
					</ol>
				</RoundReveal>
				{#snippet actions()}
					{#if st.nextMs != null}
						<div class="row ring-row">
							<NextRing
								ms={st.nextMs}
								label={gameOver ? t('finish') : isHost ? t('nextShort') : t('next')}
							/>
							{#if isHost}
								<button
									class="btn btn-ghost hold-btn"
									onclick={hold}
									aria-label={t('hold')}
									title={t('hold')}
								>
									<svg viewBox="0 0 24 24"><path d="M9 5.5v13M15 5.5v13" /></svg>
								</button>
								<button
									class="btn btn-primary now-btn"
									onclick={() => hostAct('/v1/rooms/{code}/next')}
									disabled={busy}
								>
									<span class="lbl">{t('now')}</span>
									<svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6" /></svg>
								</button>
							{/if}
						</div>
					{:else if isHost}
						<button
							class="btn btn-primary next"
							onclick={() => hostAct('/v1/rooms/{code}/next')}
							disabled={busy}
						>
							<span class="lbl">{gameOver ? t('finish') : t('next')}</span>
							<svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6" /></svg>
						</button>
					{:else}
						<p class="wait"><span class="spinner"></span>{t('waitHostNext')}</p>
					{/if}
					{#if isHost && !st.rules.rounds}
						<button
							class="btn btn-ghost"
							onclick={() => hostAct('/v1/rooms/{code}/next', true)}
							disabled={busy}>{t('finishGame')}</button
						>
					{/if}
				{/snippet}
			</ResultLayout>
		{/if}

		{#if st.phase === 'final'}
			<!-- the end is a stage on the turquoise ground: the podium, this game's streets on a
			     milk card, the map with every round's badge; on a laptop the map stands beside them -->
			<div class="end">
				<div class="end-body">
					<MapPicks map={st.map} />
					<Podium
						{standings}
						you={st.you ?? ''}
						{colorOf}
						costOf={hintCostOf}
						onrename={me?.guest ? startNaming : undefined}
					/>
					<!-- after the podium has risen -->
					<EndStreets rounds={endRounds} bind:pick={finalPick} delay={2300} />
				</div>
				<div class="end-map">
					<ResultMap bbox={st.map.bbox as BBox} layer={savedLayer()} pairs={finalPairs} />
				</div>
				<div class="end-actions">
					{#if isHost}
						<button
							class="btn btn-primary again"
							onclick={() => hostAct('/v1/rooms/{code}/start')}
							disabled={busy}
						>
							<svg viewBox="0 0 24 24"
								><path d="M3.5 12a8.5 8.5 0 1 0 2.8-6.3L3.5 8.3M3.5 3.5v4.8h4.8" /></svg
							>
							<span class="lbl">{busy ? t('starting') : t('playAgain')}</span>
						</button>
					{:else}
						<p class="wait end-wait">
							{#if hostP}<span
									class="avatar host-face"
									style:--ring={colorOf(hostP.id)}
									data-frame={hostP.frame}
									><em class="pc"></em>{hostP.avatar}<i aria-hidden="true">👑</i></span
								>{/if}
							{t('waitHostAgain')}
						</p>
					{/if}
					<div class="row">
						{#if st.yourGame}
							<button class="btn btn-chip share-btn" disabled={inviting} onclick={shareResults}>
								<svg viewBox="0 0 24 24"
									><path
										d="M12 15V3.5M7.5 8 12 3.5 16.5 8M5 12.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-6.5"
									/></svg
								>
								{t('challengeFriend')}
							</button>
						{/if}
						<button
							class="btn btn-chip more-btn"
							onclick={() => (moreOpen = true)}
							aria-label={t('more')}
							title={t('more')}
						>
							<svg viewBox="0 0 24 24"
								><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle
									cx="19"
									cy="12"
									r="1.4"
								/></svg
							>
						</button>
					</div>
				</div>
			</div>
		{/if}
	</div>
{/if}

{#if away}
	<div class="away cap">{t('connLost')}</div>
{/if}

<ShareSheet
	share={sharing?.share ?? null}
	title={sharing?.title}
	onclose={() => (sharing = null)}
/>

<Sheet open={settingsOpen} onclose={() => (settingsOpen = false)} title={t('changeRules')}>
	{#if choice}
		<div class="sheet-body">
			<RulesForm bind:choice canMove={st?.map.canMove ?? true} />
			<button class="btn btn-primary" onclick={saveSettings} disabled={busy}
				><span class="lbl">{t('save')}</span></button
			>
		</div>
	{/if}
</Sheet>

<Sheet open={qrOpen} onclose={() => (qrOpen = false)} title={code}>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- our own SVG from uqr -->
	<div class="qr">{@html qr}</div>
</Sheet>

<Sheet open={codeOpen} onclose={() => (codeOpen = false)} title={t('haveCode')}>
	{#if codeOpen}<RoomPlate
			onjoin={(next) => {
				codeOpen = false;
				goto('/room/' + next);
			}}
		/>{/if}
</Sheet>

<!-- the rest of the end, under ⋯: rows like a menu's, the way out last and red -->
<Sheet open={moreOpen} onclose={() => (moreOpen = false)} title={t('menu')}>
	<div class="menu-list">
		{#if isHost}
			<button
				onclick={() => {
					moreOpen = false;
					openSettings();
				}}
			>
				<span class="tile" aria-hidden="true"
					><svg viewBox="0 0 24 24"
						><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle
							cx="10"
							cy="17"
							r="2"
						/></svg
					></span
				>
				{t('changeRules')}
			</button>
		{/if}
		{#if st?.yourGame}
			<a href={`/game/${st.yourGame}`}>
				<span class="tile gold" aria-hidden="true"
					><svg viewBox="0 0 24 24"><path d="M5 20V10M12 20V4M19 20v-7" /></svg></span
				>
				{t('myGame')}
			</a>
		{/if}
		<button class="out" onclick={leave}>
			<span class="tile red" aria-hidden="true"
				><svg viewBox="0 0 24 24"
					><path
						d="M14 4.5h4a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5h-4M10 8l-4 4 4 4M6 12h9"
					/></svg
				></span
			>
			{t('leave')}
		</button>
	</div>
</Sheet>

<Sheet open={!!target} onclose={() => (target = null)} title={target?.name}>
	<div class="sheet-body">
		{#if target}<a class="btn btn-ghost" href={'/u/' + target.id}>{t('profile')}</a>{/if}
		<button class="btn" onclick={() => onPlayer('/v1/rooms/{code}/host')}
			><span aria-hidden="true">👑</span><span class="lbl">{t('makeHost')}</span></button
		>
		<button class="btn btn-danger" onclick={() => onPlayer('/v1/rooms/{code}/kick')}
			><span class="lbl">{t('kick')}</span></button
		>
	</div>
</Sheet>

<Sheet open={naming} onclose={() => (naming = false)} title={t('changeName')}>
	<form class="sheet-body" onsubmit={saveName}>
		<input class="field" bind:value={newName} maxlength="24" aria-label={t('changeName')} />
		{#if nameError}<p class="field-note bad">{t('badName')}</p>{/if}
		<button class="btn btn-primary" disabled={newName.trim().length < 2}
			><span class="lbl">{t('save')}</span></button
		>
	</form>
</Sheet>

{#snippet inviteIcon()}
	<svg viewBox="0 0 24 24" class="icon" aria-hidden="true">
		<circle cx="9" cy="8" r="3.4" />
		<path d="M2.5 20c.6-3.6 3.2-5.6 6.5-5.6s5.9 2 6.5 5.6M19 8v6M16 11h6" />
	</svg>
{/snippet}

<style>
	.lobby-page {
		max-width: 560px;
		height: 100%;
		margin: 0 auto;
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
	}
	.lobby-top {
		padding-inline: 16px;
	}
	.lobby-content {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		grid-template-rows: var(--picker-band-height) var(--picker-map-height) repeat(4, auto);
		grid-template-areas: 'players' 'map' 'place' 'rules' 'invite' 'links';
		padding: 0 16px 4px;
	}
	.lobby-content > :global(.picker-place) {
		grid-area: place;
	}
	.lobby-content > :global(.picker-map) {
		grid-area: map;
	}
	.players {
		grid-area: players;
		display: flex;
		align-items: flex-start;
		gap: 9px;
	}
	.players-count {
		display: flex;
		align-items: center;
		gap: 4px;
		margin-top: 14px;
		padding: 4px 8px;
		border-radius: var(--r-s);
		background: var(--chip-bg);
		color: var(--on-ground);
		white-space: nowrap;
	}
	.invite {
		grid-area: invite;
		display: grid;
		justify-items: center;
		gap: 7px;
		margin: 6px 0;
	}
	.invite-btn {
		min-height: 42px;
		height: auto;
		padding: 7px 14px;
		font-size: 15px;
	}
	.invite-btn .icon {
		width: 19px;
		height: 19px;
	}
	.plate-row {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.qr-btn {
		width: 44px;
		height: 44px;
	}
	.qr {
		padding: 10px;
		border-radius: var(--r-s);
		background: #fff;
		width: min(300px, 80vw);
		margin: 0 auto 8px;
		box-shadow: inset 0 0 0 2px var(--panel-line);
	}
	.qr :global(svg) {
		display: block;
		width: 100%;
		height: auto;
	}

	/* the players: milk faces with a lip, popping in */
	.players ul {
		list-style: none;
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: 60px;
		justify-content: start;
		min-width: 0;
		flex: 1;
		gap: 5px;
		padding: 8px 8px 0 0;
		overflow-x: auto;
		scrollbar-width: thin;
	}
	.player {
		width: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 5px;
		padding: 4px 0;
		border: none;
		background: none;
		color: var(--on-ground);
		cursor: pointer;
		text-decoration: none;
	}
	.player:active .avatar {
		transform: translateY(3px);
		box-shadow:
			0 1px 0 color-mix(in srgb, var(--tile-b) 70%, var(--stack)),
			0 4px 8px var(--shade);
	}
	.players li {
		animation: pop-in 0.45s var(--spring) both;
	}
	.players li.off {
		opacity: 0.5;
	}
	/* a face on the ground is milk like the map's tiles, by day and by night */
	.players .avatar {
		width: 43px;
		height: 43px;
		font-size: 24px;
		background: var(--tile-a);
		box-shadow:
			0 4px 0 color-mix(in srgb, var(--tile-b) 70%, var(--stack)),
			0 10px 18px var(--shade);
		transition:
			transform 0.1s var(--out),
			box-shadow 0.1s var(--out);
	}
	.crown {
		position: absolute;
		top: -10px;
		right: -6px;
		font-size: 16px;
		transform: rotate(18deg);
		filter: drop-shadow(0 2px 0 var(--stack-2));
	}
	/* The invite seat uses the same icon as the invite key. */
	.avatar.empty {
		border: 2.5px dashed var(--chip-line);
		background: var(--chip-bg);
		box-shadow: none;
		color: var(--on-ground-2);
		transition: border-color 0.15s;
	}
	.avatar.empty .icon {
		width: 24px;
		height: 24px;
	}
	.slot .player:hover .avatar.empty {
		border-color: var(--on-ground);
		color: var(--on-ground);
	}
	/* Keep long words whole and let names wrap at spaces. */
	.players .name {
		width: 100%;
		text-align: center;
		line-height: 1.15;
		font-size: 12px;
		font-weight: 700;
		text-shadow: 0 1px 0 var(--stack-2);
	}
	/* the pencil stays on the name's last word: it never drops to a line of its own */
	.players .nowrap {
		white-space: nowrap;
	}
	.players .pencil {
		width: 13px;
		height: 13px;
		vertical-align: middle;
	}
	.players .me .name {
		color: var(--gold-text);
	}
	.rules {
		grid-area: rules;
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 6px;
		min-height: 40px;
		padding: 0 8px;
		border: 0;
		border-radius: var(--r-s);
		background: none;
		color: var(--on-ground-2);
	}
	button.rules:hover {
		background: var(--chip-bg);
	}
	.rules :global(.facts) {
		justify-content: center;
		gap: 2px 0;
	}
	.rules :global(.fact .icon) {
		display: none;
	}
	.rules :global(.fact + .fact::before) {
		content: '·';
		margin-left: 6px;
	}
	.rules .icon {
		width: 16px;
		height: 16px;
		flex: none;
	}
	.lobby-links {
		grid-area: links;
		display: flex;
		justify-content: center;
		gap: 18px;
	}
	.lobby-links button {
		min-height: 38px;
		font-size: 14px;
	}
	.leave {
		color: var(--red-on-ground);
	}
	.go {
		width: 100%;
	}
	.btn-play {
		width: 100%;
		min-height: 54px;
		padding-inline: 16px;
	}
	.btn-play svg {
		width: 20px;
		height: 20px;
		fill: currentColor;
		stroke: none;
	}
	.wait {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
		min-height: 52px;
		color: var(--fg-2);
		font-size: 15px;
		font-weight: 600;
		text-align: center;
	}

	/* ---------- the game ---------- */
	.game {
		position: fixed;
		inset: 0;
		overflow: hidden;
		background: #000;
		color: #fff;
	}
	.waiting-name :global(button) {
		min-height: 28px;
		max-width: 100%;
	}
	.blind {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		max-width: min(360px, calc(100vw - 32px));
		padding: 14px 18px;
		border-radius: var(--r-s);
		text-align: center;
		font-weight: 600;
		z-index: 500;
	}
	.away {
		position: fixed;
		top: max(12px, env(safe-area-inset-top));
		left: 50%;
		transform: translateX(-50%);
		z-index: 4000;
		padding: 8px 16px;
		border-radius: 999px;
		font-size: 14px;
		font-weight: 700;
		white-space: nowrap;
	}

	/* a room that can't be had (gone, full, kicked, no network): the mark bobbing, the reason
	   in the leaning letters on the ground, one key home */
	.gone {
		min-height: calc(100dvh - 140px);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 22px;
		padding: 24px 24px 64px;
		text-align: center;
	}
	.gone h1 {
		max-width: 22ch;
		text-wrap: balance;
		font-size: 24px;
		line-height: 1.25;
		color: var(--on-ground);
	}
	@media (min-width: 761px) {
		.gone h1 {
			font-size: 32px;
		}
	}
	.gone .row {
		display: flex;
		gap: 12px;
	}
	.gone .btn {
		min-width: 200px;
	}
	.mark {
		filter: drop-shadow(0 4px 0 var(--stack)) drop-shadow(0 12px 18px var(--shade));
		animation: bob 1.4s ease-in-out infinite;
	}
	@keyframes bob {
		50% {
			transform: translateY(-8px);
		}
	}

	/* a round's table: everyone's guess, best first; a row per player on the panel's second
	   tone, the points in display lettering, the hint's cost the same gold chip as the score's
	   "−20% 💡" */
	.table {
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin-top: 4px;
	}
	.table li {
		position: relative;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 7px 10px 7px 8px;
		border-radius: var(--r-s);
		background: var(--panel-2);
		color: var(--ink);
		font-size: 15px;
		animation: rise 0.35s var(--out) both;
	}
	.table li.me {
		box-shadow: inset 0 0 0 2px var(--link);
	}
	.table .pos,
	.table b {
		display: inline-block;
		font-family: var(--f-disp);
		font-weight: 900;
		transform: var(--lean);
		font-variant-numeric: tabular-nums;
	}
	.table .pos {
		width: 18px;
		text-align: center;
		color: var(--ink-3);
	}
	.table .avatar {
		width: 30px;
		height: 30px;
		font-size: 17px;
		background: var(--panel);
		flex: none;
	}
	.table .name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-weight: 700;
	}
	.table .km {
		color: var(--ink-3);
		font-size: 13px;
		font-weight: 600;
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}
	.table .pill {
		padding: 1px 8px;
		border-radius: 8px;
		background: linear-gradient(180deg, var(--gold-hi), var(--gold));
		color: var(--gold-ink);
		box-shadow: 0 2px 0 var(--gold-lo);
		font-size: 13px;
		font-weight: 800;
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}
	.table .pill s {
		text-decoration-thickness: 2px;
	}
	.table b {
		min-width: 56px;
		text-align: right;
		font-size: 17px;
		color: var(--ink);
	}

	/* the ring before the next round; the host's pause a square quiet key, "Hozir" the green
	   one (ResultLayout stretches a row's keys: these keep their own widths) */
	.ring-row {
		align-items: center;
		min-height: 64px;
	}
	.ring-row :global(.next-ring) {
		flex: 1;
	}
	.hold-btn {
		flex: none !important;
		width: 58px !important;
		height: 58px;
		padding: 0 !important;
	}
	.now-btn {
		flex: none !important;
		width: auto !important;
		padding: 0 22px !important;
		height: 60px;
		font-size: 21px;
		white-space: nowrap;
	}
	/* a round result's one key, bigger on a laptop */
	.next {
		height: 64px;
		font-size: clamp(18px, 5.6vw, 22px);
		white-space: nowrap;
	}
	@media (min-width: 761px) {
		.next {
			height: 70px;
			font-size: 25px;
		}
	}
	.host-face {
		position: relative;
		width: 32px;
		height: 32px;
		font-size: 18px;
		background: var(--tile-a);
		box-shadow: 0 2px 0 color-mix(in srgb, var(--tile-b) 70%, var(--stack));
		flex: none;
	}
	.host-face i {
		position: absolute;
		top: -12px;
		right: -8px;
		font-size: 13px;
		font-style: normal;
		transform: rotate(18deg);
	}
	.game :global(.players-chip > .icon) {
		width: 20px;
		height: 20px;
	}

	/* ---------- the end: a stage ----------
	   A phone: one page on the turquoise ground that scrolls (the podium, the streets' card,
	   the map), its keys held at the bottom over a fade of the ground. A laptop: the podium,
	   the streets and the keys in a column at the left, the map as a big card beside them. */
	.round-map {
		align-self: flex-start;
		max-width: 100%;
		border-radius: var(--r-s);
		color: var(--cap-ink);
	}
	.result-picks {
		margin-bottom: 10px;
	}
	.end {
		position: fixed;
		inset: 0;
		z-index: 2000;
		background:
			radial-gradient(120% 60% at 50% 18%, var(--ground-glow), transparent 60%),
			linear-gradient(180deg, var(--ground-top), var(--ground-bot));
		color: var(--on-ground);
		display: grid;
		grid-template-columns: minmax(0, 540px) minmax(0, 1fr);
		grid-template-rows: minmax(0, 1fr) auto;
		grid-template-areas: 'body map' 'actions map';
		column-gap: 28px;
		padding: 0 24px 0 32px;
	}
	/* a long game's streets scroll under the keys: the column's foot fades, so a row cut in
	   half reads as "more below" */
	.end-body {
		grid-area: body;
		min-height: 0;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 22px;
		padding: 26px 6px 22px;
		-webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - 22px), transparent);
		mask-image: linear-gradient(to bottom, #000 calc(100% - 22px), transparent);
	}
	.end-map {
		grid-area: map;
		position: relative;
		min-height: 0;
		margin: 24px 0;
		border-radius: var(--r);
		overflow: hidden;
		background: var(--tile-b);
		box-shadow:
			0 4px 0 var(--stack),
			0 18px 36px var(--shade);
	}
	.end-map > :global(div:first-child) {
		position: absolute;
		inset: 0;
	}
	.end-actions {
		grid-area: actions;
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 6px 6px max(20px, env(safe-area-inset-bottom));
	}
	.end-actions .btn {
		width: 100%;
	}
	.end-actions .row {
		display: flex;
		gap: 10px;
	}
	.end-actions .row .btn {
		flex: 1;
		min-width: 0;
		height: 52px;
		padding: 0 14px;
		font-size: 16px;
	}
	.end-actions .row .more-btn {
		flex: none;
		width: 56px;
		padding: 0;
	}
	/* the host's one key, as big as every screen's green key */
	.again svg {
		width: 26px;
		height: 26px;
	}
	/* a friend's line where the host's key is: solid ground, so it reads over the map too */
	.end-wait {
		min-height: 56px;
		padding: 0 16px;
		border-radius: var(--r-m);
		background: var(--ground-bot);
		box-shadow:
			inset 0 0 0 1.5px var(--chip-line),
			0 8px 18px var(--shade);
		color: var(--on-ground);
	}

	/* ---------- the sheets ---------- */
	.sheet-body {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	/* the maps to choose from: milk tiles, each its place's face and its name; the chosen one
	   a green rim and a tick, like the rules' tiles under it */
	.bad {
		color: var(--red);
	}
	.sheet-body > .btn {
		width: 100%;
	}

	/* ⋯ at the end: menu rows, a small raised tile with an icon, the name; leaving is red */
	.menu-list {
		display: flex;
		flex-direction: column;
		margin: 0 -8px;
	}
	.menu-list > * {
		display: flex;
		align-items: center;
		gap: 14px;
		min-height: 64px;
		padding: 8px;
		border: none;
		background: none;
		color: var(--ink);
		font-size: 16px;
		font-weight: 700;
		text-align: left;
		text-decoration: none;
		transition:
			background 0.15s,
			transform 0.1s var(--out);
	}
	.menu-list > * + * {
		border-top: 1px solid var(--panel-line);
	}
	.menu-list > :hover {
		background: var(--panel-2);
	}
	.menu-list > :active {
		transform: scale(0.98);
	}
	.menu-list .out {
		color: var(--red);
	}
	.menu-list .tile {
		--c: #0f9aa8;
		width: 42px;
		height: 42px;
		flex: none;
		display: grid;
		place-items: center;
		border-radius: 13px;
		background: linear-gradient(
			180deg,
			color-mix(in srgb, var(--c), #fff 18%),
			var(--c) 55%,
			color-mix(in srgb, var(--c), #000 8%)
		);
		color: #fff;
		box-shadow:
			inset 0 1.5px 0 rgba(255, 255, 255, 0.4),
			0 3px 0 color-mix(in srgb, var(--c) 55%, #000);
	}
	.menu-list .tile.gold {
		--c: var(--gold);
		color: var(--gold-ink);
	}
	.menu-list .tile.red {
		--c: var(--red);
	}
	.menu-list .tile svg {
		width: 22px;
		height: 22px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2.4;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	/* ---------- a laptop ---------- */
	@media (min-width: 961px) {
		.lobby-page {
			display: block;
			max-width: 1500px;
			height: auto;
			padding: 0 28px 18px;
		}
		.lobby-top {
			padding-inline: 0;
		}
		.lobby {
			height: auto;
			min-height: max(460px, calc(100dvh - 96px));
			grid-template-columns: minmax(260px, 350px) minmax(0, 1fr);
			grid-template-rows: 1fr auto auto auto auto auto auto 1fr;
			grid-template-areas:
				'. map'
				'players map'
				'place map'
				'rules map'
				'invite map'
				'links map'
				'go map'
				'. map';
			column-gap: 24px;
		}
		.lobby-content {
			display: contents;
		}
		.lobby-content > :global(.picker-map) {
			margin-inline: 0;
		}
		.go {
			grid-area: go;
		}
		.invite {
			justify-items: start;
		}
		.invite-btn {
			width: 100%;
			min-height: 54px;
		}
		.rules,
		.lobby-links {
			justify-content: flex-start;
		}
	}

	@media (max-width: 960px) {
		.go {
			display: flex;
			justify-content: center;
			padding: 6px 16px 8px;
			background: linear-gradient(180deg, transparent, var(--ground-bot) 34%);
		}
	}

	@media (max-width: 760px) {
		/* the end: one page that scrolls, the keys held at the bottom */
		.end {
			display: flex;
			flex-direction: column;
			overflow-y: auto;
			padding: 0;
		}
		/* at rest the first screen is the podium and the list: however short the list, the
		   map begins under the keys' ground (their block is about 165 px tall), so no edge of it
		   floats over the keys; it shows when scrolled to */
		.end-body {
			flex: none;
			min-height: calc(100vh - 160px);
			min-height: calc(100dvh - 160px);
			overflow: visible;
			padding: 26px 16px 8px;
			gap: 24px;
			-webkit-mask-image: none;
			mask-image: none;
		}
		.end-map {
			flex: none;
			height: 52vh;
			height: 52dvh;
			margin: 18px 16px 4px;
		}
		/* the keys stand on the ground itself from 24 px above the green key down (a short fade
		   over it), so the map under the list never peeks out behind them: it shows only when
		   scrolled to */
		.end-actions {
			position: sticky;
			bottom: 0;
			z-index: 2;
			margin-top: auto;
			padding: 34px 16px max(14px, env(safe-area-inset-bottom));
			background: linear-gradient(180deg, transparent, var(--ground-bot) 10px);
		}
	}
</style>
