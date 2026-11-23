<script lang="ts">
	// A simple page around the player: the top bar, then the page's head on the ground (a quiet
	// round back key, a small gold kicker, the title in the leaning display letters, white and
	// floating, and room at the right for a count), then the content in a centred column.
	// The profile's pages (games, streets, records, wallet, accounts, edit, missed, settings,
	// shop) all look alike.
	import type { Snippet } from 'svelte';
	import GameBar from './GameBar.svelte';
	import { ensureSession } from '#lib/session.svelte.js';

	interface Props {
		title: string;
		back?: { href: string; label: string };
		kicker?: string; // the small gold tag over the title: a kind or a level
		aside?: Snippet; // at the head's right: a count, a small key
		wide?: boolean; // a grid of things (the shop): a wider column on a laptop
		children: Snippet;
	}
	let { title, back, kicker, aside, wide = false, children }: Props = $props();

	ensureSession().catch(() => {}); // the top bar shows who is playing
</script>

<svelte:head><title>{title} — GeoShafaq</title></svelte:head>

<GameBar standalone />

<main class="sub" class:wide>
	<header class="head" class:has-back={!!back}>
		{#if back}
			<a class="back chip" href={back.href} aria-label={back.label} title={back.label}>
				<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>
			</a>
		{/if}
		<div class="words">
			{#if kicker}<span class="kick-tag">{kicker}</span>{/if}
			<h1 class="d float">{title}</h1>
		</div>
		{#if aside}<div class="aside">{@render aside()}</div>{/if}
	</header>
	{@render children()}
</main>

<style>
	.sub {
		max-width: 640px;
		margin: 0 auto;
		padding: 6px 16px calc(48px + env(safe-area-inset-bottom));
	}
	.wide {
		max-width: 1040px;
	}
	.head {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 22px;
		min-height: 48px;
	}
	/* the quiet round back key: glass on the ground */
	.back {
		width: 44px;
		height: 44px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		flex: none;
		transition: transform 0.1s var(--out);
	}
	.back:hover {
		background: color-mix(in srgb, var(--chip-bg), #fff 10%);
	}
	.back:active {
		transform: scale(0.92);
	}
	.back .icon {
		width: 22px;
		height: 22px;
		stroke-width: 2.8;
	}
	.words {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 6px;
	}
	h1 {
		max-width: 100%;
		font-size: clamp(28px, 7.4vw, 38px);
		line-height: 1.08;
		color: var(--on-ground);
		overflow-wrap: anywhere;
	}
	.aside {
		flex: none;
		color: var(--on-ground-2);
		font-weight: 700;
	}
	@media (min-width: 961px) {
		.sub {
			padding: 18px 40px 64px;
		}
		.wide {
			max-width: 1120px;
		}
		.head {
			margin-bottom: 28px;
		}
		h1 {
			font-size: 42px;
		}
	}
</style>
