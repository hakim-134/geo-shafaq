<script lang="ts">
	// Three stars, the earned ones popping in one after another with a rising note.
	import { onDestroy } from 'svelte';
	import { sfxStar, vibrate } from '#lib/sfx.svelte.js';

	interface Props {
		n: number; // earned, 0–3
		of?: number;
		go?: boolean; // start popping (false: wait)
		delay?: number; // ms after go
		size?: number;
		quiet?: boolean; // no sound
	}
	let { n, of = 3, go = true, delay = 0, size = 34, quiet = false }: Props = $props();

	let lit = $state(0);
	let timers: ReturnType<typeof setTimeout>[] = [];

	$effect(() => {
		const want = n;
		timers.forEach(clearTimeout);
		timers = [];
		lit = 0;
		if (!go) return;
		for (let i = 0; i < want; i++)
			timers.push(
				setTimeout(
					() => {
						lit = i + 1;
						if (!quiet) {
							sfxStar(i);
							vibrate(15);
						}
					},
					delay + i * 260
				)
			);
	});
	onDestroy(() => timers.forEach(clearTimeout));
</script>

<span class="stars" style:--s={`${size}px`} role="img" aria-label={`${n} / ${of}`}>
	{#each { length: of } as _, i (i)}
		<svg viewBox="0 0 24 24" class:on={i < lit} class:mid={i === 1}
			><path
				d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5L2.6 9.4l6.5-.9z"
			/></svg
		>
	{/each}
</span>

<style>
	.stars {
		display: inline-flex;
		align-items: flex-end;
		gap: calc(var(--s) * 0.08);
	}
	svg {
		width: var(--s);
		height: var(--s);
		fill: color-mix(in srgb, currentColor 14%, transparent);
		stroke: color-mix(in srgb, currentColor 22%, transparent);
		stroke-width: 1.4;
		stroke-linejoin: round;
	}
	/* the middle star sits a little higher and bigger, as on a level's result */
	svg.mid {
		width: calc(var(--s) * 1.2);
		height: calc(var(--s) * 1.2);
		margin-bottom: calc(var(--s) * 0.12);
	}
	svg.on {
		fill: var(--star);
		stroke: #c98a00;
		filter: drop-shadow(0 2px 0 rgba(150, 95, 0, 0.45));
		animation: pop-in 0.42s var(--pop) both;
	}
</style>
