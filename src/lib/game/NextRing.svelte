<script lang="ts">
	// The ring before a room's next round: the same ten seconds on every phone, from the
	// server's clock. The result's reveal takes the first three; the ring stays full until it
	// is done, then empties, with a soft tick on the last three seconds.
	import { sfxTick } from '#lib/sfx.svelte.js';

	interface Props {
		ms: number; // until the room goes on, as the server last said
		label: string;
	}
	let { ms, label }: Props = $props();

	const RING = 10_000;
	const R = 17;
	const C = 2 * Math.PI * R;

	let until = 0;
	let left = $state(RING);

	$effect(() => {
		// a new state from the server: follow its clock when it differs from ours
		const at = Date.now() + ms;
		if (Math.abs(at - until) > 600) until = at;
		let raf = 0;
		let lastSec = -1;
		raf = requestAnimationFrame(function step() {
			left = Math.max(until - Date.now(), 0);
			const sec = Math.ceil(left / 1000);
			if (sec !== lastSec) {
				if (lastSec !== -1 && sec >= 1 && sec <= 3) sfxTick(0.4 - sec * 0.1);
				lastSec = sec;
			}
			if (left > 0) raf = requestAnimationFrame(step);
		});
		return () => cancelAnimationFrame(raf);
	});

	const k = $derived(Math.min(left / RING, 1));
	const sec = $derived(Math.min(Math.ceil(left / 1000), RING / 1000));
</script>

<div class="next-ring" class:soon={sec <= 3} role="timer" aria-label={`${label}: ${sec}`}>
	<span class="ring">
		<svg viewBox="0 0 40 40" aria-hidden="true">
			<circle class="track" cx="20" cy="20" r={R} />
			<circle
				class="fill"
				cx="20"
				cy="20"
				r={R}
				stroke-dasharray={C}
				stroke-dashoffset={C * (1 - k)}
			/>
		</svg>
		{#key sec}<b>{sec}</b>{/key}
	</span>
	<span class="label">{label}</span>
</div>

<style>
	.next-ring {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
		font-weight: 700;
		font-size: 16px;
	}
	.ring {
		position: relative;
		width: 48px;
		height: 48px;
		flex: none;
		display: grid;
		place-items: center;
	}
	svg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		transform: rotate(-90deg);
	}
	circle {
		fill: none;
		stroke-width: 4;
	}
	.track {
		stroke: var(--surface-2);
	}
	.fill {
		stroke: var(--green);
		stroke-linecap: round;
	}
	.soon .fill {
		stroke: var(--gold);
	}
	.ring b {
		font-family: var(--display);
		font-size: 19px;
		font-variant-numeric: tabular-nums;
	}
	.soon .ring b {
		animation: pop-in 0.3s var(--pop);
	}
	/* two short lines rather than a cut word, beside the host's buttons on a phone */
	.label {
		min-width: 0;
		line-height: 1.15;
	}
</style>
