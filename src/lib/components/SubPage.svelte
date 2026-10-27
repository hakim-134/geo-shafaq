<script lang="ts">
	// A simple page around the player: the top bar, the way back, one title, the content.
	// The profile's pages (games, streets, records, settings, sign-in) all look alike.
	import type { Snippet } from 'svelte';
	import TopBar from './TopBar.svelte';
	import { ensureSession } from '#lib/session.svelte.js';

	interface Props {
		title: string;
		back?: { href: string; label: string };
		children: Snippet;
	}
	let { title, back, children }: Props = $props();

	ensureSession().catch(() => {}); // the top bar shows who is playing
</script>

<svelte:head><title>{title} — Shafaq Geo</title></svelte:head>

<TopBar />

<main class="sub">
	{#if back}
		<a class="back" href={back.href}>
			<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>
			{back.label}
		</a>
	{/if}
	<h1>{title}</h1>
	{@render children()}
</main>

<style>
	.sub {
		max-width: 640px;
		margin: 0 auto;
		padding: 8px 24px 64px;
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		height: 40px;
		padding: 0 14px 0 8px;
		margin-left: -8px;
		border-radius: 12px;
		color: var(--muted);
		font-weight: 600;
		text-decoration: none;
	}
	.back:hover {
		background: var(--surface-2);
		color: var(--text);
	}
	h1 {
		margin: 6px 0 22px;
		font-family: var(--display);
		font-weight: 800;
		font-size: clamp(28px, 6vw, 36px);
		line-height: 1.08;
		letter-spacing: -0.025em;
	}
	@media (max-width: 640px) {
		.sub {
			padding: 4px 16px 48px;
		}
	}
</style>
