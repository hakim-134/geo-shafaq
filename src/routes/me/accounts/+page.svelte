<script lang="ts">
	// How the player gets back in: Telegram, Google. A guest is offered to sign in (and keep
	// everything played so far); a signed-in player can add another way, unlink one, sign out.
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

<SubPage title={t('accountsTitle')} back={{ href: '/me', label: t('profile') }}>
	{#if me?.user.guest}
		<div class="guest">
			<p>{t('accountsGuest')}</p>
			<button class="btn btn-telegram" onclick={() => openSignIn('save')}>{t('signIn')}</button>
		</div>
	{:else if me}
		<ul>
			{#each ids as id (id.id)}
				<li>
					<span class="prov {id.provider}" aria-hidden="true">
						{#if id.provider === 'telegram'}
							<svg viewBox="0 0 24 24"
								><path
									d="M21.4 4.3 2.9 11.4c-1.2.5-1.2 1.2-.2 1.5l4.7 1.5 1.8 5.6c.2.6.4.8.9.8.4 0 .6-.2.9-.5l2.3-2.2 4.8 3.5c.9.5 1.5.2 1.7-.8l3.1-14.7c.3-1.3-.5-1.9-1.5-1.5z"
								/></svg
							>
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
		</ul>
		{#if ids.length === 1}<p class="note">{t('lastIdentity')}</p>{/if}
		{#if canAdd}
			<button class="btn btn-ghost wide" onclick={() => openSignIn('link')}>{t('addWay')}</button>
		{/if}

		<section class="out">
			<h2 class="section-title">{t('signOut')}</h2>
			<p class="note">{t('signOutNote')}</p>
			<div class="out-btns">
				<button class="btn btn-ghost" onclick={() => signOut(false)}>{t('signOut')}</button>
				<button class="btn btn-ghost" onclick={() => signOut(true)}>{t('signOutAll')}</button>
			</div>
		</section>
	{:else}
		<span class="spinner"></span>
	{/if}
	<p class="privacy">{t('signInPrivacy')}</p>
</SubPage>

<style>
	.guest {
		padding: 18px;
		border-radius: 22px;
		background: color-mix(in srgb, var(--telegram) 10%, var(--surface));
		border: 1px solid color-mix(in srgb, var(--telegram) 30%, transparent);
	}
	.guest p {
		margin-bottom: 14px;
	}
	.guest .btn,
	.wide {
		width: 100%;
	}
	ul {
		list-style: none;
		margin-bottom: 12px;
	}
	li {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 14px 0;
	}
	li + li {
		border-top: 1px solid var(--border);
	}
	.prov {
		width: 44px;
		height: 44px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		flex: none;
		color: #fff;
	}
	.prov.telegram {
		background: var(--telegram);
	}
	.prov.telegram svg {
		width: 22px;
		height: 22px;
		fill: currentColor;
	}
	.prov.google {
		background: var(--surface);
		border: 1px solid var(--border);
		color: #4285f4;
		font-size: 18px;
	}
	.id-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.id-text b {
		font-weight: 700;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.id-text span {
		font-size: 13px;
		color: var(--muted);
	}
	.note {
		margin: 6px 0 14px;
		font-size: 14px;
		color: var(--muted);
	}
	.out {
		margin-top: 34px;
		padding-top: 22px;
		border-top: 1px solid var(--border);
	}
	.out-btns {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
	}
	.privacy {
		margin-top: 30px;
		font-size: 13px;
		color: var(--muted);
	}
</style>
