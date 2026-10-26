<script lang="ts">
	// A map as a road sign: a plate with a white inner border and two bolts, the small line on
	// top (like the district on a street plate) and the name big.
	import { signKind } from './sign.js';

	let {
		slug,
		name,
		top = '',
		outline = '',
		size = 'big'
	}: {
		slug: string;
		name: string;
		top?: string;
		outline?: string;
		size?: 'big' | 'small';
	} = $props();

	const kind = $derived(signKind(slug));
</script>

<span class="sign {kind} {size}">
	<span class="plate">
		<span class="text">
			{#if top}<span class="top">{top}</span>{/if}
			<span class="name">{name}</span>
		</span>
		{#if outline && size === 'big'}
			<span class="outline" aria-hidden="true">{@html outline}</span>
		{:else if size === 'big' && kind === 'brown'}
			<!-- a gate under a dome, as on the brown signs for sights -->
			<svg class="pict" viewBox="0 0 40 40" aria-hidden="true"
				><path
					d="M8 34h24M10 34V20h20v14M14 34v-8a6 6 0 0 1 12 0v8M12 20c0-5 3.6-9 8-11 4.4 2 8 6 8 11"
				/></svg
			>
		{/if}
	</span>
	<i class="bolt l" aria-hidden="true"></i><i class="bolt r" aria-hidden="true"></i>
</span>

<style>
	.sign {
		--plate: var(--sign-blue);
		--ink: #fff;
		position: relative;
		display: block;
		padding: 4px;
		border-radius: 10px;
		background: var(--plate);
		color: var(--ink);
		box-shadow:
			0 1px 0 rgba(255, 255, 255, 0.25) inset,
			0 2px 0 rgba(0, 0, 0, 0.12),
			0 6px 14px rgba(19, 35, 63, 0.14);
	}
	.white {
		--plate: var(--sign-white);
		--ink: #1b2a44;
	}
	.brown {
		--plate: var(--sign-brown);
	}
	.green {
		--plate: var(--sign-green);
	}
	.plate {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 74px;
		padding: 10px 16px 11px 20px;
		border: 2px solid var(--ink);
		border-radius: 7px;
	}
	.small .plate {
		min-height: 0;
		padding: 3px 9px;
		border-width: 1.5px;
		border-radius: 5px;
	}
	.small {
		display: inline-block;
		padding: 2px;
		border-radius: 7px;
		box-shadow: none;
	}
	.text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.top {
		font-size: 11.5px;
		font-weight: 600;
		letter-spacing: 0.02em;
		opacity: 0.85;
		line-height: 1.3;
	}
	.name {
		font-family: var(--display);
		font-weight: 700;
		font-size: 18px;
		line-height: 1.15;
		letter-spacing: -0.01em;
	}
	.small .name {
		font-size: 12px;
		font-weight: 700;
		white-space: nowrap;
	}
	.outline,
	.pict {
		flex: none;
		width: 52px;
		height: 52px;
		display: grid;
		place-items: center;
	}
	.outline :global(svg) {
		width: 52px;
		height: 52px;
	}
	.outline :global(svg path) {
		fill: color-mix(in srgb, var(--ink) 16%, transparent);
		stroke: var(--ink);
		stroke-width: 2.4;
		stroke-linejoin: round;
	}
	.pict {
		fill: none;
		stroke: var(--ink);
		stroke-width: 2.2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.bolt {
		position: absolute;
		top: 50%;
		width: 5px;
		height: 5px;
		margin-top: -2.5px;
		border-radius: 50%;
		background: color-mix(in srgb, var(--ink) 55%, var(--plate));
		box-shadow: 0 1px 0 rgba(0, 0, 0, 0.25);
	}
	.bolt.l {
		left: 10px;
	}
	.bolt.r {
		right: 10px;
	}
	.small .bolt {
		display: none;
	}
	.big .plate {
		padding-right: 22px;
	}
</style>
