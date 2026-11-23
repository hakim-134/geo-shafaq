<script lang="ts">
	// The player's Barg (PLAN 9.3): how many, as the screen's big number; how it is earned (by
	// learning and playing well, never by time spent); where it came from and went, as rows on
	// milk. Every entry is a row of the ledger; the number on top is their sum. With no Barg there
	// is no number and nothing to keep: the screen opens on how to earn it. A street's row is a
	// street row of the game (the face of the district it was learned in, the name leaning, the
	// district under it); a district's row wears its face; a thing bought, how it looks.
	import SubPage from '#lib/components/SubPage.svelte';
	import PlaceInParent from '#lib/maps/PlaceInParent.svelte';
	import Coin from '#lib/barg/Coin.svelte';
	import ItemPreview from '#lib/barg/ItemPreview.svelte';
	import { api, call, type Schemas } from '#lib/api/client.js';
	import { ensureSession, session } from '#lib/session.svelte.js';
	import { openSignIn } from '#lib/account.svelte.js';
	import { t, tx, type Key } from '#lib/i18n/index.svelte.js';
	import { fmtDay, fmtNum } from '#lib/format.js';

	type Entry = Schemas['WalletEntry'];

	let data = $state<Schemas['Wallet'] | null>(null);
	let failed = $state(false);

	$effect(() => {
		void session.version;
		load();
	});

	async function load() {
		try {
			await ensureSession();
			data = await call(api().GET('/v1/me/wallet'));
			failed = false;
		} catch {
			failed = true;
		}
	}

	const label = (e: Entry) =>
		e.reason === 'buy' || e.reason === 'refund'
			? t(`full_${e.ref}` as Key)
			: (e.note ?? t('reason_challenge'));
	// under a street, its district (the +5 says why); under the rest, what it was for, unless the
	// name already says it (a challenge won); and when
	const sub = (e: Entry) => {
		const why = e.reason === 'street' && e.place ? tx(e.place) : t(`reason_${e.reason}` as Key);
		return why === label(e) ? fmtDay(e.at) : `${why} · ${fmtDay(e.at)}`;
	};

	// the shop's key darkens the ground under it only while rows scroll beneath it: resting under
	// a short page, a dark band round it would stand out as a box
	let end = $state<HTMLElement>();
	let stuck = $state(false);
	$effect(() => {
		if (!end) return;
		const io = new IntersectionObserver(([e]) => (stuck = !e.isIntersecting));
		io.observe(end);
		return () => io.disconnect();
	});
	// a thing of the shop the game still draws (a refund can be for one that left it)
	const itemOf = (e: Entry) => {
		const kind = e.ref.split('-')[0];
		return ['frame', 'pin', 'trail'].includes(kind) ? { id: e.ref, kind } : null;
	};
</script>

<!-- the small raised tiles the earning rows and the history share: a street, a district, a win,
     a purchase -->
{#snippet icon(kind: 'street' | 'district' | 'challenge' | 'buy')}
	<span class="tile {kind}" aria-hidden="true">
		<svg viewBox="0 0 24 24">
			{#if kind === 'street'}
				<path d="M8 3 4.5 21M16 3l3.5 18M12 4v3M12 10.5v3M12 17v3" />
			{:else if kind === 'district'}
				<path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20zM9 4v13.5M15 6.5V20" />
			{:else if kind === 'challenge'}
				<path
					d="M8 21h8M12 16.5V21M7 4h10v5a5 5 0 0 1-10 0zM17 5.5h3V7a3 3 0 0 1-3 3M7 5.5H4V7a3 3 0 0 0 3 3"
				/>
			{:else}
				<path d="M5 8h14l-1.2 12H6.2zM9 8V6.5a3 3 0 0 1 6 0V8" />
			{/if}
		</svg>
	</span>
{/snippet}

<SubPage title={t('walletTitle')} back={{ href: '/me', label: t('profile') }}>
	{#if data}
		<!-- no "0", no coin, no "keep it" with nothing to keep: what isn't earned stays out of sight -->
		{#if data.balance}
			<section class="hero" aria-label={t('walletTitle')}>
				<span class="big-coin"><Coin size={76} /></span>
				<b class="d float">{fmtNum(data.balance)}</b>
			</section>
			{#if session.me?.user.guest}
				<p class="keep">
					<button class="link-btn" onclick={() => openSignIn('save')}>{t('bargKeep')}</button>
				</p>
			{/if}
		{/if}

		<h2 class="section-title" class:first={!data.balance}>{t('earnHow')}</h2>
		<ul class="panel-list ways">
			<li>
				{@render icon('street')}<span class="what">{t('earnStreet')}</span>
				<b class="amount d">+5 <Coin size={18} /></b>
			</li>
			<li>
				{@render icon('district')}<span class="what">{t('earnDistrict')}</span>
				<b class="amount d">+50 <Coin size={18} /></b>
			</li>
			<li>
				{@render icon('challenge')}<span class="what">{t('earnChallenge')}</span>
				<b class="amount d">+20 <Coin size={18} /></b>
			</li>
		</ul>

		{#if data.entries.length}
			<h2 class="section-title">{t('walletHistory')}</h2>
			<ul class="panel-list history">
				{#each data.entries as e, i (i)}
					{@const item = itemOf(e)}
					<li>
						{#if e.face}
							<span class="face"><PlaceInParent place={e.face} on="panel" /></span>
						{:else if item}
							<span class="thing"><ItemPreview {item} size="row" /></span>
						{:else}
							{@render icon(e.reason === 'refund' ? 'buy' : e.reason)}
						{/if}
						<span class="what"><b class="d">{label(e)}</b><small>{sub(e)}</small></span>
						<b class="amount d" class:minus={e.amount < 0}>
							{e.amount > 0 ? '+' : '−'}{fmtNum(Math.abs(e.amount))}
						</b>
					</li>
				{/each}
			</ul>
		{/if}
		<div class="foot" class:stuck>
			<a class="btn btn-primary go" href="/shop"><span class="lbl">{t('shopTitle')}</span></a>
		</div>
		<i class="end" bind:this={end} aria-hidden="true"></i>
	{:else if failed}
		<div class="empty-state">
			<p>{t('err_network')}</p>
			<button class="btn btn-chip" onclick={load}>{t('retry')}</button>
		</div>
	{:else}
		<span class="spinner"></span>
	{/if}
</SubPage>

<style>
	/* the balance: the screen's hero, the leaf coin and a big leaning number floating on the ground */
	.hero {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 14px;
		margin: 4px 0 6px;
	}
	.big-coin {
		display: grid;
		filter: drop-shadow(0 5px 0 var(--stack)) drop-shadow(0 12px 18px rgba(0, 0, 0, 0.25));
		animation: pop-in 0.45s var(--spring) both;
	}
	.hero b {
		font-size: 76px;
		line-height: 1;
		color: var(--on-ground);
	}
	.keep {
		text-align: center;
		font-size: 14.5px;
	}
	.section-title {
		margin: 30px 0 12px;
	}
	/* with no Barg it is the screen's head */
	.section-title.first {
		margin-top: 2px;
	}
	.panel-list li {
		gap: 14px;
	}
	.what {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		font-weight: 600;
		line-height: 1.3;
	}
	/* what it was for in the leaning letters, as a street is named everywhere in the game */
	.what b {
		max-width: 100%;
		font-size: 16px;
		line-height: 1.2;
		color: var(--ink);
		transform-origin: 0 75%;
		overflow-wrap: break-word;
	}
	small {
		font-size: 13px;
		font-weight: 500;
		color: var(--ink-3);
	}
	.amount {
		flex: none;
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 19px;
		color: var(--ink);
	}
	.amount.minus {
		color: var(--ink-3);
	}
	/* a small raised tile in a meaning colour, like a menu row's */
	.tile {
		--c: #0f9aa8;
		width: 40px;
		height: 40px;
		border-radius: 12px;
		flex: none;
		display: grid;
		place-items: center;
		color: #fff;
		background: linear-gradient(
			180deg,
			color-mix(in srgb, var(--c), #fff 18%),
			var(--c) 55%,
			color-mix(in srgb, var(--c), #000 8%)
		);
		box-shadow:
			inset 0 1.5px 0 rgba(255, 255, 255, 0.4),
			0 3px 0 color-mix(in srgb, var(--c) 55%, #000);
	}
	.tile.district {
		--c: var(--gold);
		color: var(--gold-ink);
	}
	.tile.challenge {
		--c: var(--picked);
	}
	.tile.buy {
		--c: var(--ink-3);
	}
	.tile svg {
		width: 22px;
		height: 22px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2.3;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.face,
	.thing {
		width: 40px;
		height: 40px;
		flex: none;
		display: grid;
		place-items: center;
	}
	/* a place's face at a street row's size, in the tiles' slot so the names line up */
	.face :global(.pip) {
		width: 36px;
		height: 36px;
	}
	/* the shop's key stays under the thumb while the history scrolls */
	.foot {
		position: sticky;
		bottom: 0;
		z-index: 5;
		margin-top: 24px;
		padding: 14px 0 max(14px, env(safe-area-inset-bottom));
	}
	/* while rows go beneath it, the ground darkens under it, fading out upwards and at the
	   sides, so they slide away without a box round the key */
	.foot::before {
		content: '';
		position: absolute;
		inset: -24px -16px 0;
		z-index: -1;
		background: linear-gradient(to top, var(--ground-bot) 50%, transparent);
		pointer-events: none;
		opacity: 0;
		transition: opacity 0.2s;
	}
	.foot.stuck::before {
		opacity: 1;
	}
	/* the page's end: out of sight, the key is held over the rows */
	.end {
		display: block;
		height: 1px;
	}
	@media (min-width: 961px) {
		.foot::before {
			inset: -24px -40px 0;
			-webkit-mask: linear-gradient(to right, transparent, #000 40px calc(100% - 40px), transparent);
			mask: linear-gradient(to right, transparent, #000 40px calc(100% - 40px), transparent);
		}
	}
	.go {
		width: 100%;
	}
</style>
