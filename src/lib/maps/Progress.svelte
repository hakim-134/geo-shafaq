<script lang="ts">
	// Progress in a place: a bar with what was learned (green) over what was seen (gold), and
	// "12 / 177 o‘rganildi". Every count in the game counts the same thing, the learned ones.
	import type { Schemas } from '#lib/api/client.js';
	import { t } from '#lib/i18n/index.svelte.js';

	// quiet: no "0 / 177" before the first one is learned, the bar alone
	let {
		progress,
		wide = false,
		quiet = false
	}: { progress: Schemas['Progress']; wide?: boolean; quiet?: boolean } = $props();
	// the first street shows, however long the list: never an empty bar after a game
	const pct = (n: number) =>
		n ? `${Math.max((n / Math.max(progress.total, 1)) * 100, 8)}%` : '0%';
</script>

<span class="progress" class:wide>
	<i style:--seen={pct(progress.seen)} style:--learned={pct(progress.learned)}></i>
	{#if !quiet || progress.learned}
		<span>{t('learnedOf', { n: progress.learned, m: progress.total })}</span>
	{/if}
</span>

<style>
	.progress {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
	}
	i {
		width: 64px;
		height: 6px;
		border-radius: 3px;
		flex: none;
		background:
			linear-gradient(to right, var(--green) var(--learned), transparent var(--learned)),
			linear-gradient(
				to right,
				color-mix(in srgb, var(--gold) 45%, transparent) var(--seen),
				var(--surface-2) var(--seen)
			);
	}
	.wide i {
		flex: 1;
		height: 8px;
		border-radius: 4px;
	}
	span span {
		white-space: nowrap;
	}
</style>
