<script lang="ts">
	// The score, counted up with soft ticks, and a bar that fills towards the most there is.
	import { fmtNum } from '#lib/format.js';
	import { t } from '#lib/i18n/index.svelte.js';
	import { sfxTick } from '#lib/sfx.svelte.js';

	interface Props {
		score: number;
		max: number;
		go?: boolean;
		delay?: number;
		big?: boolean;
	}
	let { score, max, go = true, delay = 0, big = false }: Props = $props();

	let shown = $state(0);
	let bar = $state(0);

	$effect(() => {
		const target = score;
		shown = 0;
		bar = 0;
		if (!go) return;
		let raf = 0;
		let lastTick = 0;
		const ms = Math.min(500 + target / 8, big ? 1600 : 1100);
		const timer = setTimeout(() => {
			bar = max ? Math.min((target / max) * 100, 100) : 0;
			const start = performance.now();
			raf = requestAnimationFrame(function step(now) {
				const k = Math.min((now - start) / ms, 1);
				shown = target * (1 - Math.pow(1 - k, 3));
				if (now - lastTick > 75 && k < 1 && target > 0) {
					lastTick = now;
					sfxTick(k);
				}
				if (k < 1) raf = requestAnimationFrame(step);
			});
		}, delay);
		return () => {
			clearTimeout(timer);
			cancelAnimationFrame(raf);
		};
	});
</script>

<div class="score" class:big>
	<div class="line">
		<span class="value">{fmtNum(shown)}</span>
		<span class="of">/ {fmtNum(max)} {t('points')}</span>
	</div>
	<div class="bar"><div style:width={`${bar}%`}></div></div>
</div>

<style>
	.line {
		display: flex;
		align-items: baseline;
		gap: 8px;
		flex-wrap: wrap;
	}
	.value {
		font-family: var(--display);
		font-weight: 800;
		font-size: 40px;
		line-height: 1.05;
		letter-spacing: -0.02em;
		font-variant-numeric: tabular-nums;
	}
	.big .value {
		font-size: 56px;
	}
	.of {
		font-size: 14px;
		font-weight: 600;
		color: var(--muted);
	}
	.bar {
		height: 12px;
		border-radius: 6px;
		background: var(--surface-2);
		margin-top: 10px;
		overflow: hidden;
		box-shadow: inset 0 2px 0 rgba(0, 0, 0, 0.06);
	}
	.bar > div {
		height: 100%;
		border-radius: inherit;
		background: linear-gradient(to right, var(--sky), var(--green));
		transition: width 1s var(--settle);
		box-shadow: inset 0 -3px 0 rgba(0, 0, 0, 0.12);
	}
	@media (max-width: 760px) {
		.value {
			font-size: 34px;
		}
		.big .value {
			font-size: 46px;
		}
	}
</style>
