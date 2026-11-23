<script lang="ts">
	// The player's name and picture: what friends see in a room and on the result table. On top,
	// the face as the top bar shows it (a gold coin, with the frame they wear) and the name under
	// it, changing as they type and pick; then the name, the faces to pick from, one key to save.
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
			{#key avatar}
				<span class="avatar face" data-frame={session.me?.user.prefs?.frame}>{avatar}</span>
			{/key}
			<b class="d float">{name || '…'}</b>
		</div>

		<label class="field-label" for="name">{t('nameLabel')}</label>
		<input
			id="name"
			class="field"
			class:bad={nameError}
			bind:value={name}
			maxlength="24"
			autocomplete="nickname"
			spellcheck="false"
		/>
		<p class="field-note" class:bad={nameError}>{nameError ? t('badName') : t('nameHelp')}</p>

		<div class="field-label pick-label">{t('avatarLabel')}</div>
		<div class="avatars panel" role="radiogroup" aria-label={t('avatarLabel')}>
			{#each account.config?.avatars ?? [] as a (a)}
				<button type="button" role="radio" aria-checked={avatar === a} onclick={() => (avatar = a)}
					>{a}</button
				>
			{/each}
		</div>
		<div class="foot">
			<button class="btn btn-primary save" disabled={saving || name.trim().length < 2}
				><span class="lbl">{t('save')}</span></button
			>
		</div>
	</form>
</SubPage>

<style>
	/* the face as friends will see it: the top bar's gold coin, big, the name floating under it */
	.preview {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 14px;
		margin: 0 0 26px;
		text-align: center;
	}
	.face {
		width: 104px;
		height: 104px;
		font-size: 56px;
		background: linear-gradient(180deg, var(--gold-hi), var(--gold));
		box-shadow:
			inset 0 3px 0 rgba(255, 255, 255, 0.6),
			0 6px 0 var(--gold-lo),
			0 16px 26px rgba(0, 0, 0, 0.28);
		animation: pop-in 0.3s var(--spring);
	}
	.preview b {
		max-width: 100%;
		font-size: 30px;
		line-height: 1.15;
		color: var(--on-ground);
		overflow-wrap: anywhere;
	}
	.field.bad {
		box-shadow:
			inset 0 0 0 2.5px var(--red),
			0 3px 0 var(--panel-lip);
	}
	.field-note.bad {
		color: var(--red-on-ground);
		font-weight: 700;
	}
	.pick-label {
		margin-top: 22px;
	}
	/* the faces to pick from: milk tiles on a milk card; the chosen one is a gold coin */
	.avatars {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(52px, 1fr));
		gap: 10px;
		padding: 14px;
	}
	.avatars button {
		aspect-ratio: 1;
		border: none;
		border-radius: 50%;
		background: var(--panel-2);
		font-size: 28px;
		line-height: 1;
		box-shadow: 0 3px 0 var(--panel-lip);
		transition: transform 0.1s var(--out);
	}
	.avatars button:active {
		transform: translateY(2px) scale(0.95);
	}
	.avatars button[aria-checked='true'] {
		background: linear-gradient(180deg, var(--gold-hi), var(--gold));
		box-shadow:
			inset 0 2px 0 rgba(255, 255, 255, 0.6),
			0 3px 0 var(--gold-lo),
			0 0 0 3px color-mix(in srgb, var(--gold) 45%, transparent);
		animation: boing 0.4s var(--out);
	}
	/* the one key stays under the thumb */
	.foot {
		position: sticky;
		bottom: 0;
		z-index: 5;
		margin-top: 18px;
		padding: 14px 0 max(14px, env(safe-area-inset-bottom));
	}
	/* the ground darkens under it, fading out upwards and at the sides, so rows slide away
	   beneath it without a box round the key */
	.foot::before {
		content: '';
		position: absolute;
		inset: -24px -16px 0;
		z-index: -1;
		background: linear-gradient(to top, var(--ground-bot) 50%, transparent);
		pointer-events: none;
	}
	@media (min-width: 961px) {
		.foot::before {
			inset: -24px -40px 0;
			-webkit-mask: linear-gradient(to right, transparent, #000 40px calc(100% - 40px), transparent);
			mask: linear-gradient(to right, transparent, #000 40px calc(100% - 40px), transparent);
		}
	}
	.save {
		width: 100%;
	}
</style>
