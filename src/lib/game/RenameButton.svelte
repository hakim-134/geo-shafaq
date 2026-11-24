<script lang="ts">
	import { t } from '#lib/i18n/index.svelte.js';
	let {
		name,
		onclick,
		row = false
	}: { name: string; onclick: () => void; row?: boolean } = $props();
</script>

<button class:stretched={row} {onclick} aria-label={t('changeName') + ' · ' + name}>
	<span>{name}</span>
	<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"
		><path d="m4 16-1 5 5-1L20 8l-4-4zM14 6l4 4" /></svg
	>
</button>

<style>
	button {
		display: inline-flex;
		max-width: 100%;
		align-items: center;
		gap: 4px;
		color: inherit;
		background: transparent;
		border: 0;
		font: inherit;
		padding: 0;
	}
	span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	svg {
		width: 13px;
		height: 13px;
		flex: none;
	}
	.stretched::after {
		content: '';
		position: absolute;
		z-index: 1;
		inset: 0;
		border-radius: inherit;
	}
	.stretched:focus-visible::after {
		outline: 2px solid var(--link);
	}
</style>
