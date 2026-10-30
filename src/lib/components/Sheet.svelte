<script lang="ts">
	// A sheet that slides up from the bottom on phones (thumb's reach) and sits in the middle
	// on a laptop. Closes on the backdrop, Escape, or the ✕.
	import type { Snippet } from 'svelte';
	import { t } from '#lib/i18n/index.svelte.js';

	let {
		open,
		onclose,
		title,
		children
	}: { open: boolean; onclose: () => void; title?: string; children: Snippet } = $props();

	let box = $state<HTMLDivElement>();

	$effect(() => {
		if (!open) return;
		const prev = document.activeElement as HTMLElement | null;
		box?.focus();
		let byKey = false;
		const onKey = (e: KeyboardEvent) => {
			byKey = true;
			if (e.key === 'Escape') onclose();
		};
		window.addEventListener('keydown', onKey);
		document.body.style.overflow = 'hidden';
		return () => {
			window.removeEventListener('keydown', onKey);
			document.body.style.overflow = '';
			// focus goes back where it was; its ring only for the keyboard, or the button a
			// finger tapped looks stuck "on"
			prev?.focus?.({ focusVisible: byKey } as FocusOptions);
		};
	});
</script>

{#if open}
	<div class="backdrop" onclick={onclose} role="presentation"></div>
	<div
		class="sheet"
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
		{#if title}<h2 class="title">{title}</h2>{/if}
		{@render children()}
	</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 4000;
		background: rgba(8, 14, 26, 0.5);
		animation: fade 0.2s ease-out;
	}
	.sheet {
		position: fixed;
		z-index: 4001;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		width: min(440px, calc(100vw - 32px));
		max-height: calc(100vh - 48px);
		overflow-y: auto;
		background: var(--surface);
		color: var(--text);
		border-radius: 22px;
		padding: 26px 24px 24px;
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
		animation: pop 0.22s cubic-bezier(0.2, 0.9, 0.3, 1.2);
		outline: none;
	}
	.grip {
		display: none;
	}
	.close {
		position: absolute;
		top: 14px;
		right: 14px;
		width: 36px;
		height: 36px;
		border: none;
		border-radius: 50%;
		background: var(--surface-2);
		display: grid;
		place-items: center;
	}
	.close .icon {
		width: 16px;
		height: 16px;
	}
	.title {
		font-family: var(--display);
		font-weight: 800;
		font-size: 22px;
		line-height: 1.15;
		letter-spacing: -0.02em;
		padding-right: 40px;
		margin-bottom: 10px;
	}
	@keyframes fade {
		from {
			opacity: 0;
		}
	}
	@keyframes pop {
		from {
			opacity: 0;
			transform: translate(-50%, -46%) scale(0.97);
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
			border-radius: 22px 22px 0 0;
			padding: 12px 18px max(20px, env(safe-area-inset-bottom));
			animation: up 0.28s cubic-bezier(0.2, 0.9, 0.3, 1);
		}
		.grip {
			display: block;
			width: 40px;
			height: 4px;
			border-radius: 2px;
			background: var(--border);
			margin: 0 auto 14px;
		}
		.close {
			top: 10px;
			right: 10px;
		}
	}
</style>
