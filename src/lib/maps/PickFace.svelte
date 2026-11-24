<script lang="ts">
	import PlaceInParent from './PlaceInParent.svelte';
	import { pickColor, pickFace, type Pick } from './picks.js';
	import { shortName } from './progress.js';
	import { tx } from '#lib/i18n/index.svelte.js';

	let {
		pick,
		on = 'ground',
		name
	}: {
		pick: Pick;
		on?: 'ground' | 'panel';
		name?: 'short' | 'full';
	} = $props();
</script>

<span class="pick-face" aria-hidden="true">
	<PlaceInParent {...pickFace(pick)} {on} color={pickColor(pick)} />
</span>
{#if name}<span class="pick-name"
		>{name === 'short' ? shortName(tx(pick.name)) : tx(pick.name)}</span
	>{/if}

<style>
	.pick-face {
		display: block;
		width: var(--pick-face-width, 100%);
		height: var(--pick-face-height, 100%);
		flex: none;
		--pip-tile: var(--tile-a);
	}
	.pick-name {
		font-weight: 700;
	}
</style>
