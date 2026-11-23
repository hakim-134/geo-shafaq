<script lang="ts">
	// One row of a menu: a small raised tile in a meaning colour with an icon, the name, a quiet
	// fact on the right (how many games, "not linked yet"), a chevron. The whole row is the link.
	// Put the rows in a .panel-list (ink on milk); on the ground they read white.
	import type { Snippet } from 'svelte';

	interface Props {
		href: string;
		label: string;
		fact?: string;
		color?: string; // the tile's colour: var(--key), var(--gold), var(--picked), '#0f9aa8' (turquoise, the default)…
		icon: Snippet;
	}
	let { href, label, fact = '', color = '#0f9aa8', icon }: Props = $props();
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
		padding: 10px 14px;
		text-decoration: none;
		color: var(--fg);
		transition:
			background 0.15s,
			transform 0.1s var(--out);
	}
	.row:hover {
		background: color-mix(in srgb, var(--fg) 6%, transparent);
	}
	.row:active {
		transform: scale(0.98);
	}
	/* the tile: a small raised tile, a light line on top and a lip under it, like a key */
	.tile {
		width: 42px;
		height: 42px;
		border-radius: 13px;
		background: linear-gradient(
			180deg,
			color-mix(in srgb, var(--c), #fff 18%),
			var(--c) 55%,
			color-mix(in srgb, var(--c), #000 8%)
		);
		color: #fff;
		display: grid;
		place-items: center;
		flex: none;
		box-shadow:
			inset 0 1.5px 0 rgba(255, 255, 255, 0.4),
			0 3px 0 color-mix(in srgb, var(--c) 55%, #000);
	}
	.tile :global(svg) {
		width: 22px;
		height: 22px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2.4;
		stroke-linecap: round;
		stroke-linejoin: round;
		filter: drop-shadow(0 1px 0 rgba(0, 0, 0, 0.25));
	}
	.label {
		flex: 1;
		min-width: 0;
		font-weight: 700;
		font-size: 16px;
	}
	.fact {
		font-size: 14px;
		font-weight: 600;
		color: var(--fg-3);
		white-space: nowrap;
	}
	.chev {
		color: var(--fg-3);
		width: 18px;
		height: 18px;
		stroke-width: 2.6;
	}
</style>
