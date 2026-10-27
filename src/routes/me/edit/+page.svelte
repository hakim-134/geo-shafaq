<script lang="ts">
	// The player's name and picture: what friends see in a room and on the result table.
	import { goto } from '$app/navigation';
	import SubPage from '#lib/components/SubPage.svelte';
	import { api, call, ApiError } from '#lib/api/client.js';
	import { ensureSession, session, setMe } from '#lib/session.svelte.js';
	import { account, loadConfig } from '#lib/account.svelte.js';
	import { t } from '#lib/i18n/index.svelte.js';
	import { showToast } from '#lib/toast.svelte.js';

	let name = $state('');
	let avatar = $state('');
	let nameError = $state(false);
	let saving = $state(false);

	loadConfig();
	ensureSession().then(() => {
		name = session.me?.user.name ?? '';
		avatar = session.me?.user.avatar ?? '';
	});

	async function save(e: SubmitEvent) {
		e.preventDefault();
		if (saving) return;
		saving = true;
		nameError = false;
		try {
			setMe(await call(api().POST('/v1/me/profile', { body: { name: name.trim(), avatar } })));
			showToast(t('saved'));
			goto('/me');
		} catch (err) {
			if (err instanceof ApiError && err.code === 'bad_name') nameError = true;
			else showToast(t('err_other'));
		} finally {
			saving = false;
		}
	}
</script>

<SubPage title={t('editNameAvatar')} back={{ href: '/me', label: t('profile') }}>
	<form onsubmit={save}>
		<div class="preview">
			<span class="avatar">{avatar}</span>
			<b>{name || '…'}</b>
		</div>

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
		<button class="btn btn-primary save" disabled={saving || name.trim().length < 2}
			>{t('save')}</button
		>
	</form>
</SubPage>

<style>
	.preview {
		display: flex;
		align-items: center;
		gap: 14px;
		margin-bottom: 24px;
	}
	.preview .avatar {
		width: 72px;
		height: 72px;
		font-size: 40px;
		background: var(--surface);
		border: 1px solid var(--border);
		box-shadow: 0 4px 0 var(--edge);
		animation: pop-in 0.3s var(--pop);
	}
	.preview b {
		font-family: var(--display);
		font-size: 22px;
		overflow-wrap: anywhere;
	}
	.input {
		width: 100%;
		height: 54px;
		padding: 0 16px;
		border-radius: 14px;
		border: 2px solid var(--border);
		background: var(--surface);
		font-size: 18px;
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
		margin: 8px 0 24px;
		font-size: 13.5px;
		color: var(--muted);
	}
	.help.bad {
		color: var(--red);
		font-weight: 600;
	}
	.avatars {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(52px, 1fr));
		gap: 8px;
	}
	.avatars button {
		aspect-ratio: 1;
		border: none;
		border-radius: 14px;
		background: var(--surface);
		font-size: 28px;
		line-height: 1;
		box-shadow: 0 3px 0 var(--edge);
		transition: transform 0.1s;
	}
	.avatars button:active {
		transform: translateY(2px);
	}
	.avatars button[aria-checked='true'] {
		background: color-mix(in srgb, var(--green) 22%, var(--surface));
		box-shadow:
			0 0 0 3px var(--green),
			0 3px 0 var(--green-edge);
	}
	.save {
		width: 100%;
		margin-top: 28px;
		position: sticky;
		bottom: max(12px, env(safe-area-inset-bottom));
	}
</style>
