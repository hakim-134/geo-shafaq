<script lang="ts">
	// A short shower of eight-point stars (the girih's star) and paper bits in the flag's
	// colours: a perfect round, a new best. Gone after two seconds; nothing with reduced motion.
	const colors = ['#0099b5', '#1eb53a', '#ce1126', '#f5b81c', '#ffffff'];
	const bits = Array.from({ length: 34 }, (_, i) => ({
		x: Math.random() * 100,
		d: Math.random() * 0.5,
		t: 1.4 + Math.random() * 1.1,
		r: Math.random() * 720 - 360,
		s: 8 + Math.random() * 10,
		c: colors[i % colors.length],
		star: i % 3 === 0,
		drift: Math.random() * 120 - 60
	}));
</script>

<div class="confetti" aria-hidden="true">
	{#each bits as b, i (i)}
		<i
			class:star={b.star}
			style:left={`${b.x}%`}
			style:width={`${b.s}px`}
			style:height={`${b.star ? b.s : b.s * 0.45}px`}
			style:background={b.c}
			style:animation-delay={`${b.d}s`}
			style:animation-duration={`${b.t}s`}
			style:--r={`${b.r}deg`}
			style:--dx={`${b.drift}px`}
		></i>
	{/each}
</div>

<style>
	.confetti {
		position: fixed;
		inset: 0;
		z-index: 4500;
		pointer-events: none;
		overflow: hidden;
	}
	i {
		position: absolute;
		top: -24px;
		border-radius: 2px;
		animation: fall linear both;
		box-shadow: 0 1px 0 rgba(0, 0, 0, 0.15);
	}
	i.star {
		border-radius: 0;
		clip-path: polygon(
			50% 0,
			61% 26%,
			85% 15%,
			74% 39%,
			100% 50%,
			74% 61%,
			85% 85%,
			61% 74%,
			50% 100%,
			39% 74%,
			15% 85%,
			26% 61%,
			0 50%,
			26% 39%,
			15% 15%,
			39% 26%
		);
	}
	@keyframes fall {
		to {
			transform: translate(var(--dx), 110vh) rotate(var(--r));
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.confetti {
			display: none;
		}
	}
</style>
