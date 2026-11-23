<script lang="ts">
	// A milk sheet that rises from the bottom on phones (thumb's reach) and sits in the middle
	// on a laptop, its title in the leaning display letters. Closes on the backdrop, Escape, or
	// the ✕. Inside it the "where you are" tokens say ink on milk (.on-panel).
	import type { Snippet } from 'svelte';
	import { t } from '#lib/i18n/index.svelte.js';

	let {
		open,
		onclose,
		title,
		children
	}: { open: boolean; onclose: () => void; title?: string; children: Snippet } = $props();

	let box = $state<HTMLDivElement>();

	// the element shows the keyboard's ring now (a browser without :focus-visible: say yes, and
	// the focus goes back as it always did)
	function byKeyboard(el: Element | null): boolean {
		if (!el || el === document.body) return false;
		try {
			return el.matches(':focus-visible');
		} catch {
			return true;
		}
	}

	$effect(() => {
		if (!open) return;
		const prev = document.activeElement as HTMLElement | null;
		// a key reached by the keyboard gets the focus back when the sheet closes, ring and all;
		// one a finger or the mouse pressed doesn't: given focus back (even by Escape) Chrome
		// lights its ring, and a quiet key with a gold ring beside the green one looks chosen
		const giveBack = byKeyboard(prev);
		box?.focus();
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onclose();
		};
		window.addEventListener('keydown', onKey);
		document.body.style.overflow = 'hidden';
		return () => {
			window.removeEventListener('keydown', onKey);
			document.body.style.overflow = '';
			if (giveBack) prev?.focus?.();
			else if (box?.contains(document.activeElement))
				(document.activeElement as HTMLElement).blur();
		};
	});
</script>

{#if open}
	<div class="backdrop" onclick={onclose} role="presentation"></div>
	<div
		class="sheet on-panel"
		role="dialog"
		aria-modal="true"
		aria-label={title}
		tabindex="-1"
		bind:this={box}
	>
		<div class="grip" aria-hidden="true"></div>
		<button class="close" onclick={onclose} aria-label={t('close')}>
			<svg viewBox="0 0 24 24" class="icon"><path d="M6 6l12 12M18 6 6 18" /></svg>
		</button>
		{#if title}<h2 class="title"><span class="d">{title}</span></h2>{/if}
		{@render children()}
	</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 4000;
		background: rgba(2, 24, 29, 0.55);
		animation: fade 0.2s ease-out;
	}
	.sheet {
		position: fixed;
		z-index: 4001;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		width: min(460px, calc(100vw - 32px));
		max-height: calc(100vh - 48px);
		overflow-y: auto;
		background: var(--panel);
		color: var(--ink);
		border-radius: var(--r-l);
		padding: 26px 24px 24px;
		box-shadow:
			0 4px 0 var(--panel-lip),
			0 24px 60px rgba(0, 0, 0, 0.35);
		animation: pop 0.3s var(--spring);
		outline: none;
	}
	.grip {
		display: none;
	}
	.close {
		position: absolute;
		top: 14px;
		right: 14px;
		width: 40px;
		height: 40px;
		border: none;
		border-radius: 50%;
		background: var(--panel-2);
		color: var(--ink-2);
		display: grid;
		place-items: center;
		transition: transform 0.1s;
	}
	.close:active {
		transform: scale(0.92);
	}
	.close .icon {
		width: 16px;
		height: 16px;
		stroke-width: 2.6;
	}
	.title {
		font-family: var(--f-disp);
		font-weight: 900;
		font-size: 24px;
		line-height: 1.15;
		letter-spacing: -0.01em;
		padding-right: 44px;
		margin-bottom: 14px;
		color: var(--ink);
	}
	@keyframes fade {
		from {
			opacity: 0;
		}
	}
	@keyframes pop {
		from {
			opacity: 0;
			transform: translate(-50%, -46%) scale(0.96);
		}
	}
	@keyframes up {
		from {
			transform: translateY(100%);
		}
	}
	@media (max-width: 640px) {
		.sheet {
			left: 0;
			right: 0;
			top: auto;
			bottom: 0;
			transform: none;
			width: auto;
			max-height: 88vh;
			max-height: 88dvh;
			border-radius: var(--r-l) var(--r-l) 0 0;
			padding: 12px 18px max(20px, env(safe-area-inset-bottom));
			box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.3);
			animation: up 0.35s var(--out);
		}
		.grip {
			display: block;
			width: 40px;
			height: 5px;
			border-radius: 3px;
			background: var(--panel-line);
			margin: 0 auto 14px;
		}
		.close {
			top: 10px;
			right: 10px;
		}
	}
</style>
