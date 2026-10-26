<script lang="ts">
	// "Keep your games": sign in with Telegram (the bot's link, or its QR code on a laptop) or
	// Google. Also the question that follows when the account belongs to someone else's games:
	// join the two? Lives in the layout, opened from anywhere with openSignIn().
	import { renderSVG } from 'uqr';
	import Sheet from './Sheet.svelte';
	import { account, acceptMerge, closeSignIn, googleButton } from '#lib/account.svelte.js';
	import { i18n, t } from '#lib/i18n/index.svelte.js';
	import { theme } from '#lib/theme.svelte.js';
	import { session } from '#lib/session.svelte.js';
	import { fmtNum } from '#lib/format.js';

	let tapped = $state(false); // the player went to Telegram: say what happens next
	let googleEl = $state<HTMLDivElement>();

	const qr = $derived(
		account.tg
			? renderSVG(account.tg.url, { border: 1, blackColor: '#13233f', whiteColor: '#fff' })
			: ''
	);
	const hasGoogle = $derived(!!account.config?.googleClientId);
	const linked = $derived(new Set(session.me?.identities.map((i) => i.provider) ?? []));

	$effect(() => {
		if (account.open && googleEl && hasGoogle && !linked.has('google')) {
			googleButton(googleEl, { dark: theme.value === 'dark', lang: i18n.lang }).catch(() => {});
		}
	});
	$effect(() => {
		if (!account.open) tapped = false;
	});
</script>

<Sheet
	open={account.open}
	onclose={closeSignIn}
	title={account.reason === 'link' ? t('signInLinkTitle') : t('signInTitle')}
>
	<p class="lead">{account.reason === 'link' ? t('signInLinkText') : t('signInText')}</p>

	{#if !linked.has('telegram')}
		<div class="way">
			{#if account.tg}
				<a
					class="btn btn-telegram wide"
					href={account.tg.url}
					target="_blank"
					rel="noopener"
					onclick={() => (tapped = true)}
				>
					<svg viewBox="0 0 24 24" class="tg-icon" aria-hidden="true"
						><path
							d="M21.4 4.3 2.9 11.4c-1.2.5-1.2 1.2-.2 1.5l4.7 1.5 1.8 5.6c.2.6.4.8.9.8.4 0 .6-.2.9-.5l2.3-2.2 4.8 3.5c.9.5 1.5.2 1.7-.8l3.1-14.7c.3-1.3-.5-1.9-1.5-1.5zM8.8 14.1l9.1-5.7c.4-.3.8-.1.5.2l-7.8 7-.3 3.3-1.5-4.8z"
						/></svg
					>
					{t('signInTelegram')}
				</a>
				<div class="waiting" class:on={tapped}>
					<span class="spinner"></span>
					<span>{t('tgWaiting')}</span>
				</div>
				<div class="qr">
					<div class="qr-code" aria-hidden="true">{@html qr}</div>
					<p>{t('tgScan')}</p>
				</div>
			{:else if account.tgError}
				<p class="muted">{t('tgUnavailable')}</p>
			{:else}
				<button class="btn btn-telegram wide" disabled aria-label={t('signInTelegram')}
					><span class="spinner"></span></button
				>
			{/if}
		</div>
	{/if}

	{#if hasGoogle && !linked.has('google')}
		<div class="or"><span>{t('or')}</span></div>
		<div class="google" bind:this={googleEl}></div>
	{/if}

	<p class="fine">{t('signInPrivacy')}</p>
</Sheet>

<Sheet open={!!account.merge} onclose={() => (account.merge = null)} title={t('mergeTitle')}>
	{#if account.merge}
		{@const o = account.merge.other}
		<p class="lead">{t('mergeText')}</p>
		<div class="pair">
			<div class="who">
				<span class="avatar">{o.user.avatar}</span>
				<b>{o.user.name}</b>
				<span
					>{t('nGames', { n: o.stats.games })} · {t('best').toLowerCase()}
					{fmtNum(o.stats.best)}</span
				>
			</div>
			<svg viewBox="0 0 24 24" class="icon arrow" aria-hidden="true"
				><path d="M5 12h14M13 6l6 6-6 6" /></svg
			>
			<div class="who">
				<span class="avatar">{session.me?.user.avatar}</span>
				<b>{session.me?.user.name}</b>
				<span>{t('thisAccount')}</span>
			</div>
		</div>
		<p class="fine">{t('mergeNote')}</p>
		<div class="actions">
			<button class="btn btn-primary" onclick={acceptMerge} disabled={account.busy}
				>{t('mergeYes')}</button
			>
			<button class="btn btn-ghost" onclick={() => (account.merge = null)}>{t('cancel')}</button>
		</div>
	{/if}
</Sheet>

<style>
	.lead {
		color: var(--muted);
		font-size: 15px;
		margin-bottom: 20px;
	}
	.wide {
		width: 100%;
		height: 56px;
	}
	.tg-icon {
		width: 22px;
		height: 22px;
		fill: currentColor;
		stroke: none;
	}
	.waiting {
		display: none;
		align-items: center;
		gap: 10px;
		margin-top: 12px;
		font-size: 14px;
		color: var(--muted);
	}
	.waiting.on {
		display: flex;
	}
	.waiting .spinner {
		color: var(--telegram);
	}
	.qr {
		display: flex;
		align-items: center;
		gap: 16px;
		margin-top: 16px;
		padding: 12px;
		border-radius: 14px;
		border: 1.5px dashed var(--border);
	}
	.qr-code {
		width: 104px;
		height: 104px;
		flex: none;
		border-radius: 8px;
		overflow: hidden;
		background: #fff;
	}
	.qr-code :global(svg) {
		display: block;
		width: 100%;
		height: 100%;
	}
	.qr p {
		font-size: 13.5px;
		color: var(--muted);
	}
	.muted {
		color: var(--muted);
	}
	.or {
		display: flex;
		align-items: center;
		gap: 12px;
		margin: 18px 0;
		color: var(--muted);
		font-size: 13px;
	}
	.or::before,
	.or::after {
		content: '';
		flex: 1;
		height: 1px;
		background: var(--border);
	}
	.google {
		display: flex;
		justify-content: center;
		min-height: 44px;
	}
	.fine {
		margin-top: 18px;
		font-size: 12.5px;
		color: var(--muted);
		line-height: 1.45;
	}
	.pair {
		display: flex;
		align-items: center;
		gap: 10px;
		margin: 6px 0 4px;
	}
	.who {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: 4px;
		padding: 14px 8px;
		border-radius: 16px;
		background: var(--bg);
	}
	.who .avatar {
		width: 52px;
		height: 52px;
		font-size: 28px;
		background: var(--surface);
	}
	.who b {
		font-family: var(--display);
		font-size: 14px;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.who span:last-child {
		font-size: 12px;
		color: var(--muted);
	}
	.arrow {
		color: var(--green);
	}
	.actions {
		margin-top: 20px;
		display: grid;
		gap: 10px;
	}
	/* a phone opens the link itself; the QR code is for a laptop and a phone's camera */
	@media (max-width: 640px), (pointer: coarse) {
		.qr {
			display: none;
		}
	}
</style>
