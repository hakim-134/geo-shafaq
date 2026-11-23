<script lang="ts">
	// How the player gets back in: Telegram, Google. A guest is offered to sign in (and keep
	// everything played so far) with Telegram's own blue key; a signed-in player sees their ways
	// in as rows on milk, can add another way, unlink one, sign out.
	import SubPage from '#lib/components/SubPage.svelte';
	import { ensureSession, session } from '#lib/session.svelte.js';
	import { account, loadConfig, openSignIn, signOut, unlink } from '#lib/account.svelte.js';
	import { i18n, t } from '#lib/i18n/index.svelte.js';
	import { fmtMonth } from '#lib/format.js';

	ensureSession();
	loadConfig();

	const me = $derived(session.me);
	const ids = $derived(me?.identities ?? []);
	const providerName = { telegram: 'Telegram', google: 'Google' } as const;
	// another way in is offered only if the server has one the player hasn't linked yet
	const canAdd = $derived(
		(!!account.config?.telegramBot && !ids.some((i) => i.provider === 'telegram')) ||
			(!!account.config?.googleClientId && !ids.some((i) => i.provider === 'google'))
	);
</script>

{#snippet plane()}
	<svg viewBox="0 0 24 24" aria-hidden="true"
		><path
			d="M21.4 4.3 2.9 11.4c-1.2.5-1.2 1.2-.2 1.5l4.7 1.5 1.8 5.6c.2.6.4.8.9.8.4 0 .6-.2.9-.5l2.3-2.2 4.8 3.5c.9.5 1.5.2 1.7-.8l3.1-14.7c.3-1.3-.5-1.9-1.5-1.5z"
		/></svg
	>
{/snippet}

<SubPage title={t('accountsTitle')} back={{ href: '/me', label: t('profile') }}>
	{#if me?.user.guest}
		<div class="guest panel">
			<span class="prov telegram big" aria-hidden="true">{@render plane()}</span>
			<p>{t('accountsGuest')}</p>
			<button class="btn btn-telegram" onclick={() => openSignIn('save')}>{t('signIn')}</button>
		</div>
	{:else if me}
		<ul class="panel-list ids">
			{#each ids as id (id.id)}
				<li>
					<span class="prov {id.provider}" aria-hidden="true">
						{#if id.provider === 'telegram'}
							{@render plane()}
						{:else}
							<b>G</b>
						{/if}
					</span>
					<span class="id-text">
						<b>{providerName[id.provider]}{id.username ? ` · ${id.username}` : ''}</b>
						<span
							>{id.name || '—'} · {t('linkedSince', {
								date: fmtMonth(id.createdAt, i18n.lang)
							})}</span
						>
					</span>
					{#if ids.length > 1}
						<button class="link-btn" onclick={() => unlink(id.id)}>{t('unlinkBtn')}</button>
					{/if}
				</li>
			{/each}
			{#if canAdd}
				<li class="add-row">
					<button class="add" onclick={() => openSignIn('link')}>
						<span class="prov plus" aria-hidden="true">
							<svg viewBox="0 0 24 24" class="icon"><path d="M12 5v14M5 12h14" /></svg>
						</span>
						<span class="id-text"><b>{t('addWay')}</b></span>
					</button>
				</li>
			{/if}
		</ul>
		{#if ids.length === 1}<p class="note">{t('lastIdentity')}</p>{/if}

		<section class="out">
			<p class="note">{t('signOutNote')}</p>
			<div class="out-btns">
				<button class="btn btn-danger" onclick={() => signOut(false)}>{t('signOut')}</button>
				<button class="link-btn all" onclick={() => signOut(true)}>{t('signOutAll')}</button>
			</div>
		</section>
	{:else}
		<span class="spinner"></span>
	{/if}
	<p class="privacy">{t('signInPrivacy')}</p>
</SubPage>

<style>
	.guest {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
		padding: 24px 20px 20px;
		text-align: center;
	}
	.guest p {
		font-size: 16px;
		font-weight: 500;
		line-height: 1.45;
		color: var(--ink-2);
	}
	.guest .btn {
		width: 100%;
	}
	.ids li {
		gap: 14px;
	}
	/* adding a way in: the last row, a button as wide as the card */
	.ids .add-row {
		padding: 0;
	}
	.add {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 14px;
		min-height: 64px;
		padding: 10px 16px;
		border: none;
		background: none;
		text-align: left;
		color: inherit;
	}
	.add:hover {
		background: var(--panel-2);
	}
	/* the provider's own mark: Telegram's blue plane, Google's G */
	.prov {
		width: 44px;
		height: 44px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		flex: none;
		color: #fff;
	}
	.prov.big {
		width: 64px;
		height: 64px;
		box-shadow: 0 4px 0 var(--telegram-lip);
	}
	.prov.telegram {
		background: var(--telegram);
	}
	.prov svg {
		width: 22px;
		height: 22px;
		fill: currentColor;
	}
	.prov.big svg {
		width: 32px;
		height: 32px;
		margin-left: -3px;
	}
	.prov.google {
		background: #fff;
		box-shadow: inset 0 0 0 1.5px var(--panel-line);
		color: #4285f4;
		font-size: 19px;
		font-weight: 800;
	}
	.prov.plus {
		background: var(--panel-2);
		color: var(--link);
	}
	.prov.plus svg {
		fill: none;
		stroke-width: 2.8;
	}
	.add .id-text b {
		color: var(--link);
	}
	.id-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.id-text b {
		font-weight: 700;
		font-size: 16px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.id-text span {
		font-size: 13.5px;
		color: var(--ink-3);
	}
	.note {
		margin-top: 12px;
		font-size: 14px;
		font-weight: 500;
		color: var(--on-ground-3);
	}
	.out {
		margin-top: 36px;
	}
	.out .note {
		margin: 0 0 14px;
	}
	/* leaving: a quiet red key, and the stronger "everywhere" as a red word beside it */
	.out-btns {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px 20px;
	}
	.out .btn {
		min-width: 150px;
	}
	.all {
		color: var(--red-on-ground);
	}
	.privacy {
		margin-top: 32px;
		font-size: 13px;
		color: var(--on-ground-3);
	}
</style>
