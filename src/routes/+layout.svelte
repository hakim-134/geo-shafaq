<script lang="ts">
	import '../app.css';
	import { snapshot } from '$app/navigation';
	import { page } from '$app/state';
	import { setContext } from 'svelte';
	import TabBar from '#lib/components/TabBar.svelte';
	import { activeTab, roomLobbyContext, type SetRoomLobby } from '#lib/tabs.js';
	import type { LayoutProps } from './$types';
	import { toast } from '#lib/toast.svelte.js';
	import { i18n } from '#lib/i18n/index.svelte.js';
	import { watchErrors } from '#lib/errors.js';
	import SignInSheet from '#lib/components/SignInSheet.svelte';
	import { signInFromTelegramApp } from '#lib/account.svelte.js';

	let { children }: LayoutProps = $props();

	let lobby = $state<string | null>(null);
	setContext<SetRoomLobby>(roomLobbyContext, (code) => (lobby = code));

	const path = $derived(page.url.pathname);
	const showTabs = $derived(
		!path.startsWith('/game/') &&
			(!path.startsWith('/room/') || lobby === page.params.code?.toUpperCase())
	);
	let content: HTMLDivElement;
	const scrollArea = () => {
		const pageScroll = content?.querySelector<HTMLElement>('.page-scroll');
		return pageScroll?.getClientRects().length ? pageScroll : content;
	};
	snapshot({
		capture: () => scrollArea()?.scrollTop ?? 0,
		restore: (top) => scrollArea()?.scrollTo(0, top),
		reset: () => scrollArea()?.scrollTo(0, 0)
	});

	watchErrors();
	// opened inside Telegram (the bot's Mini App button): signs in by itself
	signInFromTelegramApp();

	$effect(() => {
		document.documentElement.lang = i18n.lang;
	});
</script>

<div class="app" class:with-tabs={showTabs}>
	<div class="content" class:page-scroll={showTabs} bind:this={content}>
		{@render children()}
	</div>
	{#if showTabs}<TabBar active={activeTab(path)} />{/if}
</div>

<SignInSheet />

<div class="toast" class:show={toast.shown} role="status" aria-live="polite">{toast.text}</div>

<style>
	.with-tabs {
		display: grid;
		height: 100dvh;
		grid-template: minmax(0, 1fr) auto / minmax(0, 1fr);
		grid-template-areas: 'page' 'tabs';
	}
	.with-tabs > .content {
		grid-area: page;
	}
	@media (max-width: 960px) {
		.content:has(:global(.picker-layout)) {
			scrollbar-width: none;
		}
	}
	@media (min-width: 961px) {
		.with-tabs {
			grid-template: minmax(0, 1fr) / auto minmax(0, 1fr);
			grid-template-areas: 'tabs page';
		}
	}
</style>
