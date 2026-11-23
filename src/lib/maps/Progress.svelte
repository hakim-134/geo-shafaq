<script lang="ts">
	// Progress in a place: a bar with what was learned (solid gold) over what was only seen (a
	// quiet tint of the words' colour, never gold: gold is what is learned, everywhere in the
	// game), and "12 / 177 o‘rganildi". Nothing is shown before the first street is seen, and no
	// words before the first one is learned: what isn't earned stays out of sight, never a "0 /
	// 177". Its words and its track follow the colour around it (white on the ground, ink on a
	// panel). The bar always says what it counts to a screen reader and under the mouse.
	import type { Schemas } from '#lib/api/client.js';
	import { t } from '#lib/i18n/index.svelte.js';
	import { fmtNum } from '#lib/format.js';

	// short: "12 / 177" without the word, where room is tight (the card beside its green key);
	// bare: the bar alone always (the page says the numbers bigger)
	let {
		progress,
		wide = false,
		short = false,
		bare = false
	}: { progress: Schemas['Progress']; wide?: boolean; short?: boolean; bare?: boolean } = $props();
	// the first street shows, however long the list: never an empty bar after a game
	const pct = (n: number) =>
		n ? `${Math.max((n / Math.max(progress.total, 1)) * 100, 8)}%` : '0%';
	const said = $derived(t('learnedOf', { n: progress.learned, m: progress.total }));
</script>

{#if progress.seen || progress.learned}
	<span class="progress" class:wide>
		<i
			style:--seen={pct(progress.seen)}
			style:--learned={pct(progress.learned)}
			role="img"
			aria-label={said}
			title={said}
		></i>
		{#if !bare && progress.learned}
			<span>{short ? `${fmtNum(progress.learned)} / ${fmtNum(progress.total)}` : said}</span>
		{/if}
	</span>
{/if}

<style>
	.progress {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
		color: var(--fg-2);
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
				color-mix(in srgb, var(--fg-3) 45%, transparent) var(--seen),
				var(--quiet-bg) var(--seen)
			);
		box-shadow: inset 0 0 0 1px var(--quiet-line);
	}
	.wide i {
		flex: 1;
		height: 10px;
		border-radius: 5px;
	}
	span span {
		white-space: nowrap;
		font-weight: 600;
	}
</style>
