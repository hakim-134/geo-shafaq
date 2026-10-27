<script lang="ts">
	// While a game or a panorama gets ready, and when it can't: the mark bobbing on the
	// girih, one line of words, and what to do (retry, home) when something failed.
	import type { Snippet } from 'svelte';

	let {
		text,
		error = false,
		children
	}: { text: string; error?: boolean; children?: Snippet } = $props();
</script>

<div class="loader girih" class:error role="status">
	<img class="mark" src="/mark.svg" alt="" width="72" height="72" />
	<div class="text">{text}</div>
	{#if !error}<div class="dots" aria-hidden="true"><i></i><i></i><i></i></div>{/if}
	{#if children}<div class="actions">{@render children()}</div>{/if}
</div>

<style>
	.loader {
		position: fixed;
		inset: 0;
		z-index: 3000;
		background: var(--bg);
		color: var(--text);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 18px;
		padding: 24px;
		text-align: center;
	}
	.mark {
		animation: bob 1.4s ease-in-out infinite;
		filter: drop-shadow(0 8px 10px rgba(19, 35, 63, 0.2));
	}
	.error .mark {
		animation: none;
		filter: grayscale(0.6);
	}
	@keyframes bob {
		50% {
			transform: translateY(-10px);
		}
	}
	.text {
		font-family: var(--display);
		font-weight: 700;
		font-size: 18px;
		max-width: 420px;
	}
	.dots {
		display: flex;
		gap: 8px;
	}
	.dots i {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--sky);
		animation: dot 1s ease-in-out infinite;
	}
	.dots i:nth-child(2) {
		background: #fff;
		box-shadow: 0 0 0 1px var(--border);
		animation-delay: 0.15s;
	}
	.dots i:nth-child(3) {
		background: var(--green);
		animation-delay: 0.3s;
	}
	@keyframes dot {
		50% {
			transform: translateY(-8px);
		}
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		justify-content: center;
	}
</style>
