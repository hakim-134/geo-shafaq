<script lang="ts">
	// A challenge's link (PLAN 8.3): everyone who opens it plays the same streets, guests too, and
	// lands on one leaderboard. A friend meets who sent it and the score to beat, on the ground;
	// the map as a milk card (its face, its kind, its name, the rules); and one green key. After
	// their game: their place and total, the way to send it on, and the board. The board's games
	// open only after one's own: they show where the streets are.
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { api, call, ApiError, type Schemas } from '#lib/api/client.js';
	import GameBar from '#lib/components/GameBar.svelte';
	import ShareSheet from '#lib/components/ShareSheet.svelte';
	import PlaceInParent from '#lib/maps/PlaceInParent.svelte';
	import RulesFacts from '#lib/game/RulesFacts.svelte';
	import ChallengeBoard from '#lib/game/ChallengeBoard.svelte';
	import { challengeUrl, nativeShare, type Share } from '#lib/game/share.js';
	import { fitWords } from '#lib/fit.js';
	import { fmtNum } from '#lib/format.js';
	import { t, tx, type Key } from '#lib/i18n/index.svelte.js';
	import { choiceFrom } from '#lib/rules.js';
	import { ensureSession, session } from '#lib/session.svelte.js';
	import { showToast } from '#lib/toast.svelte.js';

	let ch = $state<Schemas['Challenge'] | null>(null);
	let error = $state<Key | null>(null);
	let busy = $state(false);
	let sharing = $state<Share | null>(null);

	const code = $derived(page.params.code ?? '');
	const you = $derived(ch?.you);
	const done = $derived(you?.status === 'finished');
	const mine = $derived(!!ch && ch.by.id === session.me?.user.id);
	const banned = $derived(!!session.me?.user.banned);
	const best = $derived(ch?.board[0]?.total ?? 0);
	const toBeat = $derived(ch?.board.find((b) => b.player.id === ch?.by.id)?.total ?? best);

	$effect(() => {
		void session.version;
		load(code);
	});

	async function load(c: string) {
		try {
			await ensureSession();
			ch = await call(api().GET('/v1/challenges/{code}', { params: { path: { code: c } } }));
			error = null;
		} catch (e) {
			error = e instanceof ApiError && e.code === 'not_found' ? 'challengeGone' : 'err_network';
		}
	}

	async function play() {
		if (busy) return;
		busy = true;
		try {
			const g = await call(
				api().POST('/v1/challenges/{code}/play', { params: { path: { code } } })
			);
			goto(`/game/${g.id}`);
		} catch (e) {
			busy = false;
			const keys: Record<string, Key> = {
				daily_cap: 'err_daily_cap',
				no_panorama: 'err_no_panorama',
				banned: 'bannedText',
				network: 'err_network'
			};
			showToast(t(keys[e instanceof ApiError ? e.code : ''] ?? 'err_other'), 3500);
		}
	}

	async function invite() {
		if (!ch) return;
		const share = {
			url: challengeUrl(ch.code),
			text: t('shareText', { map: tx(ch.map.name), score: fmtNum(you?.total ?? best) })
		};
		if (!(await nativeShare(share))) sharing = share;
	}
</script>

<svelte:head
	><title>{ch ? t('challengedBy', { name: ch.by.name }) : ''} — GeoShafaq</title></svelte:head
>

<GameBar standalone />

<main class="challenge">
	{#if ch}
		<header class="head">
			{#if done && you?.place}
				<h1 class="d float" class:first={you.place === 1}>{t('yourPlace', { n: you.place })}</h1>
				<p class="score"><b class="d float">{fmtNum(you.total)}</b> {t('pointsWord')}</p>
			{:else if mine}
				<h1 class="d float">{t('challengeFriend')}</h1>
			{:else}
				<div class="who">
					<span class="avatar face" data-frame={ch.by.frame}>{ch.by.avatar}</span>
					<h1 class="d float" use:fitWords={ch.by.name}>
						{t('challengedBy', { name: ch.by.name })}
					</h1>
				</div>
				<!-- the card's promise: the score to beat, big and gold -->
				<p class="score beat"><b class="d float">{fmtNum(toBeat)}</b> {t('pointsWord')}</p>
				<p class="can">{t('canYouBeat')}</p>
			{/if}
		</header>

		<!-- the streets they will play: the map's face, its kind and name, the rules -->
		<section class="map-card panel">
			<div class="map-head">
				{#if ch.map.face}
					<span class="pic"><PlaceInParent place={ch.map.face} on="panel" /></span>
				{/if}
				<div class="words">
					{#if tx(ch.map.description)}<span class="kick-tag">{tx(ch.map.description)}</span>{/if}
					<b class="name d">{tx(ch.map.name)}</b>
				</div>
			</div>
			<p class="rules"><RulesFacts choice={choiceFrom(ch.rules, ch.map.slug)} /></p>
		</section>

		{#if done}
			<button class="btn btn-primary go" onclick={invite}>
				<svg viewBox="0 0 24 24"
					><path
						d="M12 15V3.5M7.5 8 12 3.5 16.5 8M5 12.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-6.5"
					/></svg
				>
				<span class="lbl">{t('challengeFriend')}</span>
			</button>
			{#if you}<a class="link-btn own" href={`/game/${you.game}`}>{t('myGame')}</a>{/if}
		{:else}
			<button
				class="btn btn-primary go"
				class:breathe={!busy}
				disabled={busy || banned}
				onclick={play}
			>
				{#if busy}<span class="spinner"></span>{:else}<svg
						viewBox="0 0 24 24"
						class="fill"
						aria-hidden="true"><path d="M7 4.5v15l12-7.5z" /></svg
					>{/if}
				<span class="lbl">{you ? t('resume') : t('play')}</span>
			</button>
		{/if}

		{#if done || ch.players > 1}
			<ChallengeBoard board={ch.board} players={ch.players} open={done} />
		{/if}
	{:else if error}
		<div class="empty-state">
			<p>{t(error)}</p>
			<a class="btn btn-primary" href="/"><span class="lbl">{t('home')}</span></a>
		</div>
	{:else}
		<div class="loading"><span class="spinner"></span></div>
	{/if}
</main>

<ShareSheet share={sharing} title={t('challengeFriend')} onclose={() => (sharing = null)} />

<style>
	.challenge {
		max-width: 520px;
		margin: 0 auto;
		padding: 12px 24px 56px;
		display: flex;
		flex-direction: column;
		gap: 20px;
	}
	.head {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 6px;
	}
	.who {
		display: flex;
		align-items: center;
		gap: 14px;
		width: 100%;
	}
	/* who sent it: their face on a milk coin with a lip */
	.face {
		width: 64px;
		height: 64px;
		font-size: 36px;
		box-shadow:
			0 3px 0 var(--panel-lip),
			0 8px 18px var(--shade);
	}
	h1 {
		flex: 1;
		min-width: 0;
		max-width: 100%;
		font-size: clamp(28px, 8vw, 34px);
		line-height: 1.08;
		color: var(--on-ground);
	}
	h1.first {
		color: var(--gold-text);
	}
	/* a score on the ground: big leaning digits, the word small beside them */
	.score {
		margin-top: 4px;
		font-size: 20px;
		font-weight: 700;
		color: var(--on-ground-2);
	}
	.score b {
		font-size: 44px;
		line-height: 1.05;
		color: var(--on-ground);
	}
	.beat b {
		font-size: 60px;
		color: var(--gold-text);
	}
	.can {
		font-size: 17px;
		font-weight: 700;
		color: var(--on-ground);
	}

	/* the map: a milk card, its face beside the gold tag and the name, the rules under them */
	.map-card {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.map-head {
		display: flex;
		align-items: center;
		gap: 14px;
	}
	.pic {
		width: 72px;
		height: 64px;
		flex: none;
	}
	.words {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 6px;
	}
	.name {
		max-width: 100%;
		font-size: 23px;
		line-height: 1.1;
		color: var(--ink);
	}
	.rules {
		padding-top: 12px;
		border-top: 1px solid var(--panel-line);
		font-size: 15px;
	}

	/* the one key, full width */
	.go {
		width: 100%;
		height: 72px;
	}
	.go svg.fill {
		fill: currentColor;
		stroke: none;
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
	.own {
		align-self: center;
		min-height: 44px;
		margin-top: -8px;
		font-size: 15px;
	}
	.loading {
		min-height: 50vh;
		display: grid;
		place-items: center;
		color: var(--on-ground-2);
	}
	.loading .spinner {
		width: 26px;
		height: 26px;
		border-width: 3px;
	}
	@media (max-width: 640px) {
		.challenge {
			padding: 8px 16px 40px;
		}
	}
</style>
