<script lang="ts">
	import type { MapSummary } from '#lib/api/client.js';
	import { tx } from '#lib/i18n/index.svelte.js';
	import PickFace from './PickFace.svelte';
	import { listOf } from './picks.js';

	let {
		map,
		on = 'ground',
		compact = false
	}: {
		map: MapSummary;
		on?: 'ground' | 'panel';
		compact?: boolean;
	} = $props();
</script>

<ul class:compact>
	{#each listOf(map) as pick (pick.map)}
		<li aria-label={tx(pick.name)} title={tx(pick.name)}>
			<PickFace {pick} {on} name="short" />
		</li>
	{/each}
</ul>

<style>
	ul {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px 12px;
		list-style: none;
		--pick-face-width: 38px;
		--pick-face-height: 32px;
	}
	li {
		display: flex;
		align-items: center;
		gap: 5px;
		font-size: 14px;
	}
	.compact {
		gap: 0 7px;
		padding: 4px 8px;
		--pick-face-width: 32px;
		--pick-face-height: 28px;
	}
	.compact li {
		font-size: 12px;
	}
	.compact li + li::before {
		content: '·';
		color: var(--cap-ink-2);
	}
</style>
