<script lang="ts">
	// Progress in a place: a bar with what was learned (gold) over what was seen (pale gold),
	// and "12 / 185 ko‘cha" seen.
	import type { Schemas } from '#lib/api/client.js';
	import { t } from '#lib/i18n/index.svelte.js';

	let { progress, wide = false }: { progress: Schemas['Progress']; wide?: boolean } = $props();
	const pct = (n: number) => `${(n / Math.max(progress.total, 1)) * 100}%`;
</script>

<span class="progress" class:wide>
	<i style:--seen={pct(progress.seen)} style:--learned={pct(progress.learned)}></i>
	<span>{t(`unit_${progress.unit}`, { n: progress.seen, m: progress.total })}</span>
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
			linear-gradient(to right, var(--gold) var(--learned), transparent var(--learned)),
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
