<script lang="ts">
	import '../app.css';
	import type { LayoutProps } from './$types';
	import { toast } from '#lib/toast.svelte.js';
	import { i18n } from '#lib/i18n/index.svelte.js';
	import { watchErrors } from '#lib/errors.js';
	import SignInSheet from '#lib/components/SignInSheet.svelte';
	import { signInFromTelegramApp } from '#lib/account.svelte.js';

	let { children }: LayoutProps = $props();

	watchErrors();
	// opened inside Telegram (the bot's Mini App button): signs in by itself
	signInFromTelegramApp();

	$effect(() => {
		document.documentElement.lang = i18n.lang;
	});
</script>

{@render children()}

<SignInSheet />

<div class="toast" class:show={toast.shown} role="status" aria-live="polite">{toast.text}</div>
