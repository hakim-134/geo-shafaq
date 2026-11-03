<script lang="ts">
	// The player's Barg (PLAN 9.3): how many, how it is earned, where it came from and went. Every
	// entry is a row of the ledger; the number on top is their sum.
	import SubPage from '#lib/components/SubPage.svelte';
	import Coin from '#lib/barg/Coin.svelte';
	import { api, call, type Schemas } from '#lib/api/client.js';
	import { ensureSession, session } from '#lib/session.svelte.js';
	import { openSignIn } from '#lib/account.svelte.js';
	import { t, type Key } from '#lib/i18n/index.svelte.js';
	import { fmtNum } from '#lib/format.js';

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

	const label = (e: Schemas['WalletEntry']) =>
		e.reason === 'buy' || e.reason === 'refund'
			? t(`full_${e.ref}` as Key)
			: (e.note ?? t('reason_challenge'));
	const sub = (e: Schemas['WalletEntry']) => t(`reason_${e.reason}` as Key);
</script>

<SubPage title={t('walletTitle')} back={{ href: '/me', label: t('profile') }}>
	{#if data}
		<section class="top">
			<Coin size={44} />
			<b>{fmtNum(data.balance)}</b>
		</section>

		<h2 class="section-title">{t('earnHow')}</h2>
		<ul class="ways">
			<li><span>{t('earnStreet')}</span><b>+5 <Coin size={16} /></b></li>
			<li><span>{t('earnDistrict')}</span><b>+50 <Coin size={16} /></b></li>
			<li><span>{t('earnChallenge')}</span><b>+20 <Coin size={16} /></b></li>
		</ul>

		{#if session.me?.user.guest}
			<p class="keep">
				<button class="link-btn" onclick={() => openSignIn('save')}>{t('bargKeep')}</button>
			</p>
		{/if}

		{#if data.entries.length}
			<h2 class="section-title">{t('walletHistory')}</h2>
			<ul class="history">
				{#each data.entries as e, i (i)}
					<li>
						<span class="what"><b>{label(e)}</b><small>{sub(e)}</small></span>
						<b class="amount" class:minus={e.amount < 0}>
							{e.amount > 0 ? '+' : '−'}{fmtNum(Math.abs(e.amount))}
						</b>
					</li>
				{/each}
			</ul>
		{/if}
		<div class="under-foot"></div>
		<div class="foot">
			<a class="btn btn-primary go" href="/shop">{t('shopTitle')}</a>
		</div>
	{:else if failed}
		<p class="note">{t('err_network')}</p>
		<button class="btn btn-ghost" onclick={load}>{t('retry')}</button>
	{:else}
		<span class="spinner"></span>
	{/if}
</SubPage>

<style>
	.top {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 16px 20px;
		border-radius: 22px;
		background: var(--surface);
		border: 1px solid var(--border);
		box-shadow: 0 4px 0 var(--edge);
	}
	.top b {
		font-family: var(--display);
		font-weight: 800;
		font-size: 42px;
		line-height: 1;
	}
	.section-title {
		margin-top: 24px;
	}
	.keep {
		margin-top: 16px;
		font-size: 14px;
		color: var(--muted);
	}
	ul {
		list-style: none;
		margin-top: 6px;
	}
	li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		min-height: 48px;
		padding: 6px 0;
		border-bottom: 1px solid var(--border);
	}
	li > b {
		flex: none;
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-variant-numeric: tabular-nums;
	}
	.what {
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.what b {
		font-weight: 600;
	}
	small {
		font-size: 13px;
		color: var(--muted);
	}
	.amount {
		font-family: var(--display);
		font-weight: 800;
		color: var(--green-ink);
	}
	:global(:root[data-theme='dark']) .amount {
		color: var(--green);
	}
	.amount.minus,
	:global(:root[data-theme='dark']) .amount.minus {
		color: var(--muted);
	}
	.note {
		color: var(--muted);
		margin-bottom: 12px;
	}
	.under-foot {
		height: 56px;
	}
	.foot {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 50;
		display: flex;
		justify-content: center;
		padding: 12px 16px max(14px, env(safe-area-inset-bottom));
		background: linear-gradient(to top, var(--bg) 70%, transparent);
	}
	.go {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		max-width: 592px;
		height: 60px;
		font-size: 17px;
	}
</style>
