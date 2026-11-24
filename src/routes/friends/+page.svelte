<script lang="ts">
	import { goto } from '$app/navigation';
	import GameBar from '#lib/components/GameBar.svelte';
	import RoomPlate from '#lib/components/RoomPlate.svelte';
	import Sheet from '#lib/components/Sheet.svelte';
	import { ApiError } from '#lib/api/client.js';
	import { openFriendsRoom, takeFriendsMap } from '#lib/friends-room.js';
	import { t, type Key } from '#lib/i18n/index.svelte.js';
	import { session } from '#lib/session.svelte.js';

	const errors: Record<string, Key> = {
		network: 'err_network',
		too_many_rooms: 'err_too_many_rooms',
		banned: 'bannedText',
		rate_limited: 'waitABit',
		no_panorama: 'err_no_panorama'
	};

	let error = $state<Key>();
	let attempt = $state(0);
	let codeOpen = $state(false);
	const map = takeFriendsMap();

	$effect(() => {
		void attempt;
		void session.version;
		let active = true;
		error = undefined;
		openFriendsRoom(map)
			.then((code) => {
				if (active) return goto('/room/' + code, { replaceState: true });
			})
			.catch((e) => {
				if (!active) return;
				error = e instanceof ApiError ? (errors[e.code] ?? 'err_other') : 'err_other';
			});
		return () => {
			active = false;
		};
	});

	$effect(() => {
		if (error !== 'waitABit' || codeOpen) return;
		const timer = setTimeout(() => attempt++, 20_000);
		return () => clearTimeout(timer);
	});
</script>

<svelte:head><title>{t('tabFriends')} — GeoShafaq</title></svelte:head>

<GameBar standalone />
<main class="empty-state">
	{#if error}
		{#if error === 'bannedText'}<h1 class="d float">{t('bannedTitle')}</h1>{/if}
		<p role="status">{t(error)}</p>
		{#if error !== 'bannedText'}
			<div class="actions">
				<button class="btn btn-chip" onclick={() => attempt++}>{t('retry')}</button>
				<button class="btn btn-chip" onclick={() => (codeOpen = true)}>{t('haveCode')}</button>
			</div>
		{/if}
	{:else}
		<p role="status">{t('connecting')}</p>
	{/if}
	{#if !error || error === 'waitABit'}<span class="spinner" aria-hidden="true"></span>{/if}
</main>

<Sheet open={codeOpen} onclose={() => (codeOpen = false)} title={t('haveCode')}>
	{#if codeOpen}
		<RoomPlate onjoin={(code) => goto('/room/' + code, { replaceState: true })} />
	{/if}
</Sheet>

<style>
	main {
		max-width: 560px;
		margin: 12vh auto 0;
		padding-inline: 16px;
	}
	.actions {
		display: flex;
		justify-content: center;
		flex-wrap: wrap;
		gap: 8px;
	}
</style>
