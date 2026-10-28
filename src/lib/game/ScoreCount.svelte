<script lang="ts">
	// The score, counted up with soft ticks, and a bar that fills towards the most there is.
	// With a hint that cost points (base: the score before it), it counts up to the score the
	// guess earned, the struck score and the hint's chip drop in beside it ("−20% 💡", one per hint), and the number ticks
	// down to what the player got, with a soft note: the player sees why.
	import { fmtNum } from '#lib/format.js';
	import { t } from '#lib/i18n/index.svelte.js';
	import { sfxCost, sfxTick } from '#lib/sfx.svelte.js';

	interface Props {
		score: number;
		max: number;
		go?: boolean;
		delay?: number;
		big?: boolean;
		base?: number; // the score before hints, when they took points
		hints?: number;
		cost?: number; // each hint's share, 0.2
	}
	let {
		score,
		max,
		go = true,
		delay = 0,
		big = false,
		base,
		hints = 0,
		cost = 0
	}: Props = $props();

	const costly = $derived(!!base && base > score && hints > 0 && cost > 0);
	const pct = $derived(Math.round(cost * 100));

	let shown = $state(0);
	let bar = $state(0);
	let cut = $state(false); // the hint's chip is in

	$effect(() => {
		const target = score;
		const from = costly ? base! : target;
		shown = 0;
		bar = 0;
		cut = false;
		if (!go) return;
		let raf = 0;
		let lastTick = 0;
		const timers: ReturnType<typeof setTimeout>[] = [];
		const ms = Math.min(500 + from / 8, big ? 1600 : 1100);
		const run = (a: number, b: number, ms: number, ease: (k: number) => number, tick: boolean) => {
			const start = performance.now();
			raf = requestAnimationFrame(function step(now) {
				const k = Math.min((now - start) / ms, 1);
				shown = a + (b - a) * ease(k);
				if (tick && now - lastTick > 75 && k < 1 && b > 0) {
					lastTick = now;
					sfxTick(k);
				}
				if (k < 1) raf = requestAnimationFrame(step);
			});
		};
		timers.push(
			setTimeout(() => {
				bar = max ? Math.min((from / max) * 100, 100) : 0;
				run(0, from, ms, (k) => 1 - Math.pow(1 - k, 3), true);
				if (!costly) return;
				// the count lands, a beat, the chip drops in, then down to what the player got
				timers.push(
					setTimeout(() => {
						cut = true;
						sfxCost();
					}, ms + 250),
					setTimeout(() => {
						bar = max ? Math.min((target / max) * 100, 100) : 0;
						run(from, target, 650, (k) => k * (2 - k), false);
					}, ms + 550)
				);
			}, delay)
		);
		return () => {
			timers.forEach(clearTimeout);
			cancelAnimationFrame(raf);
		};
	});
</script>

<div class="score" class:big>
	<div class="line">
		<span class="value">{fmtNum(shown)}</span>
		<span class="of">/ {fmtNum(max)} {t('points')}</span>
		{#if costly}
			<div
				class="cost"
				class:cut
				aria-label={t('hintCostShown', { base: fmtNum(base!), n: hints })}
			>
				<s>{fmtNum(base!)}</s>
				{#each { length: hints }, i (i)}
					<span class="chip" style:animation-delay={`${i * 120}ms`}>−{pct}% <i>💡</i></span>
				{/each}
			</div>
		{/if}
	</div>
	<div class="bar"><div style:width={`${bar}%`}></div></div>
</div>

<style>
	/* small and grey at the end of the score's line: what the guess earned, and what the
	   hints took */
	.cost {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 6px;
		margin-left: auto;
		font-size: 15px;
		font-weight: 700;
		color: var(--muted);
		font-variant-numeric: tabular-nums;
		visibility: hidden;
	}
	.cost.cut {
		visibility: visible;
	}
	.cost s {
		text-decoration-thickness: 2px;
		text-decoration-color: color-mix(in srgb, var(--muted) 80%, transparent);
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		padding: 2px 8px 2px 9px;
		border-radius: 999px;
		background: color-mix(in srgb, var(--gold) 24%, transparent);
		color: var(--text);
		font-size: 13.5px;
	}
	.chip i {
		font-style: normal;
	}
	.cut s {
		animation: rise 0.3s var(--settle) both;
	}
	.cut .chip {
		animation: chip-drop 0.45s var(--pop) both;
	}
	@keyframes chip-drop {
		from {
			transform: translateY(-14px) scale(0.6);
			opacity: 0;
		}
	}
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
