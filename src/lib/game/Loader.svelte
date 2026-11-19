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

	/* the new look (P1111 1.1): the lapis ground, no girih, the words in the game's lettering.
	   A room still shows this loader in the old look while it connects, so only under look2. */
	:global(:root.look2) .loader {
		background:
			radial-gradient(120% 70% at 50% 45%, var(--ground-glow), transparent 60%),
			linear-gradient(180deg, var(--ground-top), var(--ground-bot));
		color: var(--on-ground);
	}
	:global(:root.look2) .loader::before {
		display: none;
	}
	:global(:root.look2) .mark {
		filter: drop-shadow(0 6px 0 var(--stack-2)) drop-shadow(0 14px 18px rgba(0, 0, 0, 0.3));
		animation-timing-function: var(--out);
	}
	:global(:root.look2) .text {
		font-family: var(--f-disp);
		font-weight: 900;
		transform: var(--lean);
		font-size: 22px;
		line-height: 1.2;
		text-shadow:
			0 2px 0 var(--stack),
			0 5px 0 var(--stack-2);
	}
	:global(:root.look2) .dots i {
		width: 12px;
		height: 12px;
		background: var(--gold);
		box-shadow: 0 2px 0 var(--gold-lo);
	}
	:global(:root.look2) .dots i:nth-child(2) {
		background: #fff;
		box-shadow: 0 2px 0 var(--stack-2);
	}
	:global(:root.look2) .dots i:nth-child(3) {
		background: var(--key);
		box-shadow: 0 2px 0 var(--key-lip);
	}
</style>
