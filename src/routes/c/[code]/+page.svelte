<script lang="ts">
	// A challenge's link (PLAN 8.3): everyone who opens it plays the same streets, guests too, and
	// lands on one leaderboard. A friend meets who sent it, the place and one green button; after
	// their game, their place on the board and the way to send it on. The board's games open only
	// after one's own: they show where the streets are.
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { api, call, ApiError, type Schemas } from '#lib/api/client.js';
	import TopBar from '#lib/components/TopBar.svelte';
	import ShareSheet from '#lib/components/ShareSheet.svelte';
	import MapSign from '#lib/maps/MapSign.svelte';
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
	><title>{ch ? t('challengedBy', { name: ch.by.name }) : ''} — Shafaq Geo</title></svelte:head
>

<TopBar />

<main class="challenge">
	{#if ch}
		{#if done && you?.place}
			<h1>{t('yourPlace', { n: you.place })}</h1>
		{:else if mine}
			<h1>{t('challengeFriend')}</h1>
		{:else}
			<div class="who">
				<span class="avatar face" data-frame={ch.by.frame}>{ch.by.avatar}</span>
				<h1 use:fitWords={ch.by.name}>{t('challengedBy', { name: ch.by.name })}</h1>
			</div>
			<!-- the card's promise: the score to beat, big -->
			<p class="beat"><b>{fmtNum(toBeat)}</b> {t('pointsWord')}</p>
			<p class="can">{t('canYouBeat')}</p>
		{/if}

		<MapSign
			slug={ch.map.slug}
			name={tx(ch.map.name)}
			top={tx(ch.map.description)}
			outline={ch.map.outline}
		/>
		<p class="rules"><RulesFacts choice={choiceFrom(ch.rules, ch.map.slug)} /></p>

		{#if done}
			<button class="btn btn-primary go" onclick={invite}>
				<svg viewBox="0 0 24 24" class="stroke"
					><path
						d="M12 15V3.5M7.5 8 12 3.5 16.5 8M5 12.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-6.5"
					/></svg
				>
				{t('challengeFriend')}
			</button>
			{#if you}<a class="link-btn own" href={`/game/${you.game}`}>{t('myGame')}</a>{/if}
		{:else}
			<button
				class="btn btn-primary go"
				class:breathe={!busy}
				disabled={busy || banned}
				onclick={play}
			>
				{#if busy}<span class="spinner"></span>{:else}<svg viewBox="0 0 24 24" aria-hidden="true"
						><path d="M7 4.5v15l12-7.5z" /></svg
					>{/if}
				{you ? t('resume') : t('play')}
			</button>
		{/if}

		{#if done || ch.players > 1}
			<ChallengeBoard board={ch.board} players={ch.players} open={done} />
		{/if}
	{:else if error}
		<div class="center">
			<p>{t(error)}</p>
			<a class="btn btn-primary" href="/">{t('home')}</a>
		</div>
	{:else}
		<div class="center"><span class="spinner"></span></div>
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
		gap: 18px;
	}
	.who {
		display: flex;
		align-items: center;
		gap: 14px;
	}
	.face {
		width: 64px;
		height: 64px;
		font-size: 36px;
		background: var(--surface);
		border: 1px solid var(--border);
		box-shadow: 0 3px 0 var(--edge);
	}
	h1 {
		font-family: var(--display);
		font-weight: 800;
		font-size: 28px;
		line-height: 1.1;
		letter-spacing: -0.02em;
		flex: 1;
		min-width: 0;
	}
	.beat {
		margin-bottom: -14px;
		font-size: 22px;
		font-weight: 700;
		color: var(--muted);
	}
	.beat b {
		font-family: var(--display);
		font-weight: 800;
		font-size: 52px;
		line-height: 1.1;
		font-variant-numeric: tabular-nums;
		color: var(--gold);
	}
	:global(:root[data-theme='dark']) .beat b {
		color: var(--star);
	}
	.can {
		font-weight: 600;
	}
	.rules {
		font-size: 14.5px;
		color: var(--text);
	}
	.go {
		width: 100%;
		height: 76px;
		border-radius: 22px;
		font-size: 24px;
		box-shadow: 0 6px 0 var(--b-edge);
		margin-bottom: 6px;
	}
	.go svg {
		width: 24px;
		height: 24px;
		fill: currentColor;
		stroke: none;
	}
	.go svg.stroke {
		fill: none;
		stroke: currentColor;
		stroke-width: 2.4;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.go:active:not(:disabled) {
		transform: translateY(5px);
		box-shadow: 0 1px 0 var(--b-edge);
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
		font-size: 15px;
	}
	.center {
		min-height: 50vh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 16px;
		color: var(--muted);
		text-align: center;
	}
	.spinner {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		border: 3px solid var(--border);
		border-top-color: var(--sky);
		animation: spin 0.9s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(1turn);
		}
	}
	@media (max-width: 640px) {
		.challenge {
			padding: 8px 16px 40px;
		}
	}
</style>
