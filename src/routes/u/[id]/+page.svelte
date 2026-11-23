<script lang="ts">
	// Another player's page (ProfileView), with a quiet way to report them at the end.
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import GameBar from '#lib/components/GameBar.svelte';
	import ProfileView from '#lib/components/ProfileView.svelte';
	import Sheet from '#lib/components/Sheet.svelte';
	import { api, call, send, ApiError, type Profile } from '#lib/api/client.js';
	import { ensureSession } from '#lib/session.svelte.js';
	import { t } from '#lib/i18n/index.svelte.js';
	import { showToast } from '#lib/toast.svelte.js';

	let profile = $state<Profile | null>(null);
	let missing = $state(false);
	let failed = $state(false);
	let reporting = $state(false);

	$effect(() => {
		load(page.params.id ?? '');
	});

	async function load(id: string) {
		profile = null;
		try {
			const me = await ensureSession();
			if (me.user.id === id) return goto('/me', { replaceState: true });
			profile = await call(api().GET('/v1/users/{userId}', { params: { path: { userId: id } } }));
		} catch (e) {
			if (e instanceof ApiError && (e.code === 'not_found' || e.code === 'bad_input'))
				missing = true;
			else failed = true;
		}
	}

	const reasons = ['name', 'cheating', 'other'] as const;

	async function report(reason: (typeof reasons)[number]) {
		if (!profile) return;
		reporting = false;
		try {
			await send(
				api().POST('/v1/users/{userId}/report', {
					params: { path: { userId: profile.user.id } },
					body: { reason }
				})
			);
			showToast(t('reportSent'), 3000);
		} catch {
			showToast(t('err_other'));
		}
	}
</script>

<svelte:head><title>{profile?.user.name ?? ''} — GeoShafaq</title></svelte:head>

<GameBar standalone />

<main class="page">
	{#if profile}
		<ProfileView {profile}>
			<div class="report">
				<button class="link-btn" onclick={() => (reporting = true)}>
					<svg viewBox="0 0 24 24" class="icon"><path d="M5 21V4M5 4h11l-2 4 2 4H5" /></svg>
					{t('report')}
				</button>
			</div>
		</ProfileView>
	{:else if missing}
		<div class="empty-state center">
			<p>{t('playerNotFound')}</p>
			<a class="btn btn-primary" href="/"><span class="lbl">{t('home')}</span></a>
		</div>
	{:else if failed}
		<div class="empty-state center">
			<p>{t('err_network')}</p>
			<button class="btn btn-primary" onclick={() => load(page.params.id ?? '')}
				><span class="lbl">{t('retry')}</span></button
			>
		</div>
	{:else}
		<div class="center"><span class="spinner"></span></div>
	{/if}
</main>

<Sheet open={reporting} onclose={() => (reporting = false)} title={t('reportTitle')}>
	<p class="note">{t('reportText')}</p>
	<div class="reasons">
		{#each reasons as r (r)}
			<button class="btn btn-ghost" onclick={() => report(r)}>{t(`reason_${r}`)}</button>
		{/each}
	</div>
</Sheet>

<style>
	.page {
		max-width: 640px;
		margin: 0 auto;
		padding: 8px 16px calc(48px + env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
		gap: 24px;
	}
	.center {
		min-height: 50vh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
	}
	.report {
		margin-top: 12px;
		display: flex;
		justify-content: center;
	}
	.report .link-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 40px;
		color: var(--on-ground-3);
		font-weight: 600;
		font-size: 14px;
	}
	.report .icon {
		width: 16px;
		height: 16px;
	}
	.note {
		color: var(--ink-2);
		font-size: 14.5px;
		margin-bottom: 16px;
	}
	.reasons {
		display: grid;
		gap: 10px;
	}
	/* a reason is a sentence, not a key's word: no capitals, no lean */
	.reasons .btn {
		height: 52px;
		justify-content: flex-start;
		font-family: var(--f-text);
		font-weight: 700;
		font-size: 16px;
		letter-spacing: 0;
		text-transform: none;
	}
	@media (min-width: 961px) {
		.page {
			padding: 18px 40px 64px;
		}
	}
</style>
