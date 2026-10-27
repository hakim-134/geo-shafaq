<script lang="ts">
	// One row of the profile's menu: an icon on a coloured tile, the name, a short fact on the
	// right (how many games, "not linked yet"), a chevron. The whole row is the link.
	import type { Snippet } from 'svelte';

	interface Props {
		href: string;
		label: string;
		fact?: string;
		color?: string;
		icon: Snippet;
	}
	let { href, label, fact = '', color = 'var(--sky)', icon }: Props = $props();
</script>

<a class="row" {href}>
	<span class="tile" style:--c={color} aria-hidden="true">{@render icon()}</span>
	<span class="label">{label}</span>
	{#if fact}<span class="fact">{fact}</span>{/if}
	<svg viewBox="0 0 24 24" class="icon chev" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
</a>

<style>
	.row {
		display: flex;
		align-items: center;
		gap: 14px;
		min-height: 64px;
		padding: 10px 12px;
		border-radius: 16px;
		text-decoration: none;
		color: var(--text);
		transition:
			background 0.15s,
			transform 0.1s;
	}
	.row:hover {
		background: var(--surface-2);
	}
	.row:active {
		transform: scale(0.98);
	}
	.tile {
		width: 42px;
		height: 42px;
		border-radius: 13px;
		background: var(--c);
		color: #fff;
		display: grid;
		place-items: center;
		flex: none;
		box-shadow: 0 3px 0 color-mix(in srgb, var(--c) 60%, #000);
	}
	.tile :global(svg) {
		width: 22px;
		height: 22px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2.2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.label {
		flex: 1;
		min-width: 0;
		font-weight: 700;
		font-size: 16px;
	}
	.fact {
		font-size: 14px;
		color: var(--muted);
		white-space: nowrap;
	}
	.chev {
		color: var(--muted);
		width: 18px;
		height: 18px;
	}
</style>
