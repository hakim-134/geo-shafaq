<script lang="ts">
	import '../app.css';
	import type { LayoutProps } from './$types';
	import { toast } from '#lib/toast.svelte.js';
	import { i18n } from '#lib/i18n/index.svelte.js';

	let { children }: LayoutProps = $props();

	$effect(() => {
		document.documentElement.lang = i18n.lang;
	});
</script>

{@render children()}

<div class="toast" class:show={toast.shown} role="status" aria-live="polite">{toast.text}</div>
