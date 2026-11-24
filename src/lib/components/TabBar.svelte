<script lang="ts">
	import { onMount } from 'svelte';
	import { activeTab } from '#lib/tabs.js';
	import { t } from '#lib/i18n/index.svelte.js';
	import { ensureSession, session } from '#lib/session.svelte.js';
	import { unlockAudio } from '#lib/sfx.svelte.js';
	import { api, call, ApiError } from '#lib/api/client.js';
	import {
		forgetRoom,
		isCurrentRoom,
		readCurrentRoom,
		watchCurrentRoom
	} from '#lib/current-room.js';
	import { fmtNum } from '#lib/format.js';

	let { active }: { active: ReturnType<typeof activeTab> } = $props();

	const tabs = [
		{ id: 'play', href: '/', label: 'tabPlay' },
		{ id: 'friends', href: '/friends', label: 'tabFriends' },
		{ id: 'learn', href: '/learn', label: 'tabLearn' },
		{ id: 'profile', href: '/me', label: 'profile' }
	] as const;

	let roomCount = $state(0);
	let lastCode: string | null = null;
	let lastVersion: number | undefined;
	let checking: object | undefined;

	async function checkRoom() {
		const code = readCurrentRoom();
		const version = session.version;
		if (code !== lastCode || version !== lastVersion) {
			lastCode = code;
			lastVersion = version;
			roomCount = 0;
			checking = undefined;
		}
		if (!code || checking) return;
		const request = (checking = {});
		const current = () =>
			checking === request && version === session.version && code === readCurrentRoom();
		try {
			await ensureSession();
			if (!current()) return;
			const state = await call(api().GET('/v1/rooms/{code}', { params: { path: { code } } }));
			if (!current()) return;
			if (isCurrentRoom(code, state)) roomCount = state.players.filter((p) => !p.left).length;
			else forgetRoom(code);
		} catch (e) {
			if (current() && e instanceof ApiError && (e.code === 'no_room' || e.status === 404))
				forgetRoom(code);
		} finally {
			if (checking === request) checking = undefined;
		}
	}

	$effect(() => {
		void active;
		void checkRoom();
	});

	onMount(() => {
		const unwatch = watchCurrentRoom(checkRoom);
		function visible() {
			if (document.visibilityState === 'visible') void checkRoom();
		}
		document.addEventListener('visibilitychange', visible);
		const timer = setInterval(visible, 30_000);
		return () => {
			checking = undefined;
			unwatch();
			document.removeEventListener('visibilitychange', visible);
			clearInterval(timer);
		};
	});
</script>

<nav aria-label={t('menu')}>
	{#each tabs as tab (tab.id)}
		<a
			href={tab.href}
			aria-current={active === tab.id ? 'page' : undefined}
			onclick={tab.id === 'friends' ? unlockAudio : undefined}
		>
			{#if tab.id === 'profile'}
				<span class="avatar coin" aria-hidden="true" data-frame={session.me?.user.prefs?.frame}>
					{session.me?.user.avatar ?? '👤'}
				</span>
			{:else}
				<span class="tab-icon">
					<svg viewBox="0 0 24 24" class="icon" aria-hidden="true">
						{#if tab.id === 'play'}
							<path d="M12 21s6.5-6.5 6.5-11a6.5 6.5 0 1 0-13 0C5.5 14.5 12 21 12 21z" />
							<path d="m11 7.5 4 2.5-4 2.5z" />
						{:else if tab.id === 'friends'}
							<circle cx="9" cy="8" r="3.5" />
							<path d="M2.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5" />
							<path d="M16 5.5a3 3 0 0 1 0 6M17 14.5c2.4 0 4.1 1.5 4.6 4" />
						{:else}
							<path d="M12 6C9 4 6 4 3 5v13c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1v13" />
						{/if}
					</svg>
					{#if tab.id === 'friends' && roomCount}
						<span class="room-count" aria-label={t('players') + ' ' + fmtNum(roomCount)}
							>{fmtNum(roomCount)}</span
						>
					{/if}
				</span>
			{/if}
			<span>{t(tab.label)}</span>
		</a>
	{/each}
</nav>

<style>
	nav {
		grid-area: tabs;
		z-index: 100;
		min-height: calc(62px + env(safe-area-inset-bottom));
		padding: 0 env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		background: var(--ground-bot);
		box-shadow:
			inset 0 1px 0 var(--ground-line),
			0 -4px 18px var(--shade);
	}
	a {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 4px;
		border-radius: var(--r-s);
		color: var(--on-ground-2);
		font-size: clamp(11px, 3.5vw, 14px);
		font-weight: 700;
		text-decoration: none;
	}
	a:hover,
	a[aria-current] {
		background: var(--chip-bg);
		color: var(--gold-text);
	}
	.icon,
	.coin,
	.tab-icon {
		width: 27px;
		height: 27px;
	}
	.tab-icon {
		position: relative;
	}
	.room-count {
		position: absolute;
		top: -3px;
		right: -7px;
		min-width: 17px;
		height: 17px;
		padding-inline: 3px;
		display: grid;
		place-items: center;
		border-radius: 999px;
		background: var(--key-hi);
		color: var(--gold-ink);
		box-shadow: 0 0 0 2px var(--ground-bot);
		font: 900 11px/1 var(--f-disp);
	}
	.coin {
		font-size: 17px;
		background: linear-gradient(180deg, var(--gold-hi), var(--gold));
		box-shadow:
			inset 0 2px 0 var(--gold-hi),
			0 2px 0 var(--gold-lo);
	}
	@media (min-width: 961px) {
		nav {
			width: calc(94px + env(safe-area-inset-left));
			min-height: 0;
			grid-template-columns: 1fr;
			grid-auto-rows: 72px;
			align-content: center;
			gap: 6px;
			padding: max(6px, env(safe-area-inset-top)) 6px max(6px, env(safe-area-inset-bottom))
				calc(6px + env(safe-area-inset-left));
			box-shadow:
				inset -1px 0 0 var(--ground-line),
				4px 0 18px var(--shade);
		}
	}
</style>
