<script lang="ts">
	import TopBar from '#lib/components/TopBar.svelte';
	import ProfileView from '#lib/components/ProfileView.svelte';
	import Sheet from '#lib/components/Sheet.svelte';
	import { api, call, ApiError, type Profile } from '#lib/api/client.js';
	import { ensureSession, session, setMe } from '#lib/session.svelte.js';
	import { account, loadConfig, openSignIn, signOut, unlink } from '#lib/account.svelte.js';
	import { i18n, t } from '#lib/i18n/index.svelte.js';
	import { fmtMonth } from '#lib/format.js';
	import { showToast } from '#lib/toast.svelte.js';

	let profile = $state<Profile | null>(null);
	let failed = $state(false);

	$effect(() => {
		void session.version;
		load();
	});

	async function load() {
		try {
			await ensureSession();
			profile = await call(api().GET('/v1/me/profile'));
			failed = false;
		} catch {
			failed = true;
		}
	}

	// ---------- name and avatar ----------
	let editing = $state(false);
	let name = $state('');
	let avatar = $state('');
	let nameError = $state(false);
	let saving = $state(false);

	function edit() {
		name = session.me?.user.name ?? '';
		avatar = session.me?.user.avatar ?? '';
		nameError = false;
		editing = true;
		loadConfig();
	}

	async function saveProfile(e: SubmitEvent) {
		e.preventDefault();
		if (saving) return;
		saving = true;
		nameError = false;
		try {
			const me = await call(api().POST('/v1/me/profile', { body: { name, avatar } }));
			setMe(me);
			editing = false;
			showToast(t('saved'));
		} catch (err) {
			if (err instanceof ApiError && err.code === 'bad_name') nameError = true;
			else showToast(t('err_other'));
		} finally {
			saving = false;
		}
	}

	const me = $derived(session.me);
	const ids = $derived(me?.identities ?? []);
	const providerName = { telegram: 'Telegram', google: 'Google' } as const;
	// another way in is offered only if the server has one the player hasn't linked yet
	const canAdd = $derived(
		(!!account.config?.telegramBot && !ids.some((i) => i.provider === 'telegram')) ||
			(!!account.config?.googleClientId && !ids.some((i) => i.provider === 'google'))
	);
	loadConfig();
</script>

<svelte:head><title>{me?.user.name ?? t('profile')} — Shafaq Geo</title></svelte:head>

<TopBar />

<main class="page">
	{#if profile && me}
		<ProfileView {profile} own>
			{#snippet action()}
				<button class="btn btn-ghost edit" onclick={edit}>
					<svg viewBox="0 0 24 24" class="icon"
						><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" /></svg
					>
					<span>{t('editProfile')}</span>
				</button>
			{/snippet}

			<section class="accounts">
				<h2 class="section-title">{t('accountsTitle')}</h2>
				{#if me.user.guest}
					<p class="note">{t('accountsGuest')}</p>
					<button class="btn btn-telegram wide" onclick={() => openSignIn('save')}
						>{t('signIn')}</button
					>
				{:else}
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
					{#if canAdd}
						<button class="btn btn-ghost wide" onclick={() => openSignIn('link')}
							>{t('addWay')}</button
						>
					{/if}
					<div class="out">
						<p class="note">{t('signOutNote')}</p>
						<div class="out-btns">
							<button class="btn btn-ghost" onclick={() => signOut(false)}>{t('signOut')}</button>
							<button class="btn btn-ghost" onclick={() => signOut(true)}>{t('signOutAll')}</button>
						</div>
					</div>
				{/if}
			</section>
		</ProfileView>
	{:else if failed}
		<div class="center">
			<p>{t('err_network')}</p>
			<button class="btn btn-primary" onclick={load}>{t('retry')}</button>
		</div>
	{:else}
		<div class="center"><span class="spinner"></span></div>
	{/if}
</main>

<Sheet open={editing} onclose={() => (editing = false)} title={t('profile')}>
	<form onsubmit={saveProfile}>
		<label class="field-label" for="name">{t('nameLabel')}</label>
		<input
			id="name"
			class="input"
			class:bad={nameError}
			bind:value={name}
			maxlength="24"
			autocomplete="nickname"
			spellcheck="false"
		/>
		<p class="help" class:bad={nameError}>{nameError ? t('badName') : t('nameHelp')}</p>

		<div class="field-label">{t('avatarLabel')}</div>
		<div class="avatars" role="radiogroup" aria-label={t('avatarLabel')}>
			{#each account.config?.avatars ?? [] as a (a)}
				<button type="button" role="radio" aria-checked={avatar === a} onclick={() => (avatar = a)}
					>{a}</button
				>
			{/each}
		</div>
		<button class="btn btn-primary wide save" disabled={saving}>{t('save')}</button>
	</form>
</Sheet>

<style>
	.page {
		max-width: 720px;
		margin: 0 auto;
		padding: 16px 24px 64px;
	}
	.center {
		min-height: 50vh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 16px;
		color: var(--muted);
	}
	.edit {
		height: 42px;
		padding: 0 14px;
		font-family: var(--body);
		font-weight: 600;
		font-size: 14px;
		letter-spacing: 0;
	}
	.edit .icon {
		width: 17px;
		height: 17px;
	}
	.accounts {
		margin-top: 34px;
		padding-top: 26px;
		border-top: 1px dashed var(--border);
	}
	.note {
		margin: 8px 0 14px;
		font-size: 14px;
		color: var(--muted);
	}
	.wide {
		width: 100%;
	}
	ul {
		list-style: none;
		margin: 10px 0 14px;
	}
	li {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 0;
	}
	li + li {
		border-top: 1px solid var(--border);
	}
	.prov {
		width: 40px;
		height: 40px;
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
		width: 20px;
		height: 20px;
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
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.id-text span {
		font-size: 12.5px;
		color: var(--muted);
	}
	.out {
		margin-top: 22px;
	}
	.out-btns {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
	}
	.out-btns .btn {
		height: 44px;
		font-family: var(--body);
		font-weight: 600;
		font-size: 14px;
		letter-spacing: 0;
	}

	/* the edit sheet */
	.input {
		width: 100%;
		height: 50px;
		padding: 0 14px;
		border-radius: 12px;
		border: 1.5px solid var(--border);
		background: var(--bg);
		font-size: 17px;
		font-weight: 600;
	}
	.input:focus {
		outline: none;
		border-color: var(--sky);
	}
	.input.bad {
		border-color: var(--red);
	}
	.help {
		margin: 6px 0 18px;
		font-size: 12.5px;
		color: var(--muted);
	}
	.help.bad {
		color: var(--red);
		font-weight: 600;
	}
	.avatars {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(44px, 1fr));
		gap: 6px;
		max-height: 220px;
		overflow-y: auto;
		padding: 2px;
	}
	.avatars button {
		aspect-ratio: 1;
		border: none;
		border-radius: 12px;
		background: var(--bg);
		font-size: 24px;
		line-height: 1;
	}
	.avatars button[aria-checked='true'] {
		background: color-mix(in srgb, var(--green) 22%, var(--surface));
		box-shadow: 0 0 0 2px var(--green);
	}
	.save {
		margin-top: 18px;
	}
	@media (max-width: 640px) {
		.page {
			padding: 12px 16px 48px;
		}
		.edit span {
			display: none;
		}
		.edit {
			width: 42px;
			padding: 0;
		}
	}
</style>
