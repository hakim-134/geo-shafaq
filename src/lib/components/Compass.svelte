<script lang="ts">
	// The three compasses, all fed by where the player looks (degrees from north):
	// classic, a dial whose red end points north; modern, a strip of directions sliding under
	// a fixed mark; mnemonic, a dial with a picture on each side (MNEMONIC).
	import { MNEMONIC, type CompassStyle } from '#lib/compass.svelte.js';
	import { t } from '#lib/i18n/index.svelte.js';

	let { heading, style = 'classic' }: { heading: number; style?: CompassStyle } = $props();

	// the strip: 180° across, a tick every 15°
	const STRIP_W = 240;
	const PPD = STRIP_W / 180;
	const ticks = Array.from({ length: 49 }, (_, i) => -180 + i * 15);
	const cardinal: Record<number, 'dirN' | 'dirE' | 'dirS' | 'dirW'> = {
		0: 'dirN',
		90: 'dirE',
		180: 'dirS',
		270: 'dirW'
	};
	const norm = (d: number) => ((d % 360) + 360) % 360;
	const h = $derived(norm(heading));

	const animals = [
		{ at: 0, icon: MNEMONIC.n },
		{ at: 90, icon: MNEMONIC.e },
		{ at: 180, icon: MNEMONIC.s },
		{ at: 270, icon: MNEMONIC.w }
	];
</script>

{#if style === 'modern'}
	<div class="strip" role="img" aria-label={`${Math.round(h)}°`} style:width={`${STRIP_W}px`}>
		<div class="track" style:transform={`translateX(${STRIP_W / 2 - (h + 180) * PPD}px)`}>
			{#each ticks as d (d)}
				{@const n = norm(d)}
				<span
					class="tick"
					class:major={n % 90 === 0}
					class:mid={n % 45 === 0 && n % 90 !== 0}
					style:left={`${(d + 180) * PPD}px`}
				>
					{#if cardinal[n]}<b class:north={n === 0}>{t(cardinal[n])}</b>{/if}
				</span>
			{/each}
		</div>
		<i class="mark" aria-hidden="true"></i>
	</div>
{:else if style === 'mnemonic'}
	<div class="dial big" role="img" aria-label={`${Math.round(h)}°`}>
		<i class="look" aria-hidden="true"></i>
		<div class="ring" style:transform={`rotate(${-h}deg)`}>
			{#each animals as a (a.at)}
				<span
					class="animal"
					style:transform={`rotate(${a.at}deg) translateY(-23px) rotate(${-a.at + h}deg)`}
					>{a.icon}</span
				>
			{/each}
		</div>
	</div>
{:else}
	<div class="dial" role="img" aria-label={`${Math.round(h)}°`}>
		<svg viewBox="0 0 48 48" style:transform={`rotate(${-h}deg)`}>
			<circle cx="24" cy="24" r="22" class="ring-line" />
			<path d="M24 6 29 24H19z" class="north" />
			<path d="M24 42 19 24h10z" class="south" />
			<circle cx="24" cy="24" r="2.6" class="hub" />
		</svg>
	</div>
{/if}

<style>
	.dial,
	.strip {
		background: var(--hud);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3);
		color: #fff;
	}
	.dial {
		position: relative;
		width: 52px;
		height: 52px;
		border-radius: 50%;
		display: grid;
		place-items: center;
	}
	.dial.big {
		width: 70px;
		height: 70px;
	}
	svg {
		width: 46px;
		height: 46px;
		transition: transform 0.08s linear;
	}
	.ring-line {
		fill: none;
		stroke: rgba(255, 255, 255, 0.25);
		stroke-width: 1.5;
	}
	.north {
		fill: #ce1126;
	}
	.south {
		fill: #fff;
	}
	.hub {
		fill: #13233f;
		stroke: #fff;
		stroke-width: 1;
	}

	/* mnemonic: the animals ride the ring, standing upright; the notch marks where you look */
	.ring {
		position: absolute;
		inset: 0;
		border-radius: 50%;
		border: 1.5px solid rgba(255, 255, 255, 0.22);
		transition: transform 0.08s linear;
	}
	.animal {
		position: absolute;
		left: 50%;
		top: 50%;
		width: 22px;
		height: 22px;
		margin: -11px 0 0 -11px;
		display: grid;
		place-items: center;
		font-size: 17px;
		line-height: 1;
		transition: transform 0.08s linear;
	}
	.look {
		position: absolute;
		top: -6px;
		left: 50%;
		margin-left: -6px;
		border: 6px solid transparent;
		border-bottom: 8px solid #ffc94d;
		border-top: 0;
		z-index: 1;
	}

	/* modern: a strip of directions */
	.strip {
		position: relative;
		height: 34px;
		border-radius: 10px;
		overflow: hidden;
		-webkit-mask-image: linear-gradient(to right, transparent, #000 18%, #000 82%, transparent);
		mask-image: linear-gradient(to right, transparent, #000 18%, #000 82%, transparent);
	}
	.track {
		position: absolute;
		inset: 0;
		transition: transform 0.08s linear;
	}
	.tick {
		position: absolute;
		bottom: 0;
		width: 2px;
		margin-left: -1px;
		height: 6px;
		background: rgba(255, 255, 255, 0.45);
		border-radius: 1px;
	}
	.tick.mid {
		height: 9px;
	}
	.tick.major {
		height: 11px;
		background: #fff;
	}
	.tick b {
		position: absolute;
		bottom: 12px;
		left: 50%;
		transform: translateX(-50%);
		font-family: var(--display);
		font-size: 13px;
		font-weight: 700;
		white-space: nowrap;
	}
	.tick b.north {
		color: #ff6b7d;
	}
	.mark {
		position: absolute;
		top: 0;
		left: 50%;
		margin-left: -5px;
		border: 5px solid transparent;
		border-top: 7px solid #ffc94d;
		border-bottom: 0;
	}
</style>
