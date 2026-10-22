<script lang="ts">
	// The score, counted up, with a bar that fills: a small reward every round.
	import { fmtDistance, fmtNum } from '#lib/format.js';
	import { t } from '#lib/i18n/index.svelte.js';

	let { label, score, max, km }: { label: string; score: number; max: number; km: number | null } =
		$props();

	let shown = $state(0);
	let bar = $state(0);

	$effect(() => {
		const target = score;
		shown = 0;
		bar = 0;
		const start = performance.now();
		let raf = requestAnimationFrame(function step(now) {
			const k = Math.min((now - start) / 900, 1);
			shown = target * (1 - Math.pow(1 - k, 3));
			if (k < 1) raf = requestAnimationFrame(step);
		});
		const fill = requestAnimationFrame(() => (bar = max ? (target / max) * 100 : 0));
		return () => {
			cancelAnimationFrame(raf);
			cancelAnimationFrame(fill);
		};
	});
</script>

<div class="score-card">
	<div class="top"><span>{label}</span><span>/ {fmtNum(max)}</span></div>
	<div class="value">{fmtNum(shown)}</div>
	<div class="bar"><div style:width={`${bar}%`}></div></div>
	<div class="meta"><span>{t('distance')}</span><b>{km == null ? '—' : fmtDistance(km)}</b></div>
</div>

<style>
	.score-card {
		border-radius: var(--radius);
		padding: 18px 20px;
		color: #fff;
		background:
			radial-gradient(100% 120% at 100% 0%, rgba(43, 183, 211, 0.3), transparent 60%),
			linear-gradient(135deg, var(--lapis), var(--lapis-2));
	}
	.top {
		display: flex;
		justify-content: space-between;
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		opacity: 0.75;
	}
	.value {
		font-family: var(--display);
		font-weight: 800;
		font-size: 54px;
		line-height: 1.1;
		letter-spacing: -0.02em;
		font-variant-numeric: tabular-nums;
	}
	.bar {
		height: 8px;
		border-radius: 4px;
		background: rgba(255, 255, 255, 0.16);
		margin-top: 10px;
		overflow: hidden;
	}
	.bar > div {
		height: 100%;
		border-radius: inherit;
		background: linear-gradient(to right, #2bb7d3, #36c853);
		transition: width 0.9s cubic-bezier(0.2, 0.7, 0.2, 1);
	}
	.meta {
		margin-top: 14px;
		display: flex;
		justify-content: space-between;
		font-size: 14px;
		color: rgba(255, 255, 255, 0.75);
	}
	.meta b {
		color: #fff;
		font-weight: 600;
	}
	@media (max-width: 760px) {
		.value {
			font-size: 44px;
		}
	}
</style>
