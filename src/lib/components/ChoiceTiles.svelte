<script lang="ts">
	// The compass and the sound, chosen by their pictures: a milk tile each (the compass turning
	// over a bit of street, the speaker), the chosen one with a gold ring and a gold tick. One
	// component for Sozlamalar and for the round's Pauza and Menyu sheets, so a child sees the
	// same pictures in both places; `small` is the sheet's size. Each choice takes effect at once.
	import { onMount } from 'svelte';
	import Compass from '#lib/components/Compass.svelte';
	import { t } from '#lib/i18n/index.svelte.js';
	import { sound, setSound, sfxStar } from '#lib/sfx.svelte.js';
	import { compass, setCompassStyle, COMPASS_STYLES } from '#lib/compass.svelte.js';

	interface Props {
		kind: 'compass' | 'sound';
		small?: boolean;
		/** compass only: a fourth tile, "Yo‘q", that hides the compass for this game */
		none?: boolean;
		off?: boolean;
	}
	let { kind, small = false, none = false, off = $bindable(false) }: Props = $props();

	// the compasses turn slowly, as if someone looks around
	let heading = $state(0);
	onMount(() => {
		if (kind !== 'compass') return;
		let raf = requestAnimationFrame(function spin(now) {
			heading = Math.sin(now / 2600) * 120;
			raf = requestAnimationFrame(spin);
		});
		return () => cancelAnimationFrame(raf);
	});

	// turned on, it plays the stars' little tune, so the player hears what they chose
	function soundOn(on: boolean) {
		setSound(on);
		if (on) setTimeout(() => [0, 1, 2].forEach((i) => setTimeout(() => sfxStar(i), i * 200)), 50);
	}
</script>

{#if kind === 'sound'}
	<div class="tiles two" class:small>
		<button class="tile" aria-pressed={sound.on} onclick={() => soundOn(true)}>
			<span class="pic speaker on" aria-hidden="true">
				<svg viewBox="0 0 48 48"
					><path class="body" d="M8 19h7l10-8v26l-10-8H8z" /><path
						class="wave w1"
						d="M31 18a8 8 0 0 1 0 12"
					/><path class="wave w2" d="M35 13a15 15 0 0 1 0 22" /></svg
				>
			</span>
			<span class="name">{t('soundOn')}</span>
		</button>
		<button class="tile" aria-pressed={!sound.on} onclick={() => soundOn(false)}>
			<span class="pic speaker" aria-hidden="true">
				<svg viewBox="0 0 48 48"
					><path class="body" d="M8 19h7l10-8v26l-10-8H8z" /><path
						class="cross"
						d="m31 19 10 10M41 19 31 29"
					/></svg
				>
			</span>
			<span class="name">{t('soundOff')}</span>
		</button>
	</div>
{:else}
	<div class="tiles" class:three={!none} class:four={none} class:small>
		{#each COMPASS_STYLES as c (c)}
			<button
				class="tile"
				aria-pressed={!off && compass.style === c}
				onclick={() => {
					off = false;
					setCompassStyle(c);
				}}
			>
				<!-- over a bit of street, as in a round -->
				<span class="pic street" aria-hidden="true">
					<span class="compass {c}"><Compass {heading} style={c} /></span>
				</span>
				<span class="name">{t(`compass_${c}`)}</span>
			</button>
		{/each}
		{#if none}
			<!-- the bare street: no compass over it -->
			<button class="tile" aria-pressed={off} onclick={() => (off = true)}>
				<span class="pic street" aria-hidden="true"></span>
				<span class="name">{t('compassNone')}</span>
			</button>
		{/if}
	</div>
{/if}

<style>
	.tiles {
		display: grid;
		gap: 12px;
	}
	.two {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
	.three {
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}
	.four {
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}
	.tile {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 7px 7px 10px;
		border: none;
		border-radius: 20px;
		background: var(--panel);
		color: var(--ink);
		box-shadow:
			0 3px 0 var(--panel-lip),
			0 10px 20px var(--shade);
		transition:
			transform 0.1s var(--out),
			box-shadow 0.15s;
	}
	.tile:active {
		transform: translateY(2px) scale(0.98);
	}
	.tile[aria-pressed='true'] {
		box-shadow:
			inset 0 0 0 3px var(--gold),
			0 3px 0 var(--gold-lo),
			0 10px 20px var(--shade);
	}
	.tile[aria-pressed='true']::after {
		content: '';
		position: absolute;
		top: -7px;
		right: -7px;
		width: 26px;
		height: 26px;
		border-radius: 50%;
		background:
			url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='m6 12.5 4 4L18 8' fill='none' stroke='%233a2600' stroke-width='3.2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")
				center / 17px no-repeat,
			linear-gradient(180deg, var(--gold-hi), var(--gold));
		box-shadow: 0 2px 0 var(--gold-lo);
		animation: pop-in 0.3s var(--spring);
	}
	.name {
		font-weight: 700;
		font-size: 14.5px;
		text-align: center;
	}
	.pic {
		position: relative;
		display: grid;
		place-items: center;
		height: 78px;
		border-radius: 14px;
		overflow: hidden;
		background: var(--panel-2);
	}

	.speaker svg {
		width: 54px;
		height: 54px;
		fill: none;
		stroke: var(--ink);
		stroke-width: 3;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.speaker .body {
		fill: var(--ink);
	}
	.speaker .cross {
		stroke: var(--red);
	}
	.speaker.on .wave {
		stroke: var(--link);
		animation: wave 1.2s ease-in-out infinite;
	}
	.speaker.on .w2 {
		animation-delay: 0.2s;
	}
	@keyframes wave {
		50% {
			opacity: 0.25;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.speaker.on .wave {
			animation: none;
		}
	}

	/* a bit of street (sky, houses, road) under the compass */
	.street {
		background:
			linear-gradient(to bottom, transparent 58%, #6b6f78 58% 100%),
			linear-gradient(
					to right,
					transparent 8%,
					#d9b38c 8% 30%,
					transparent 30% 38%,
					#c98d7a 38% 62%,
					transparent 62% 70%,
					#e0cfa9 70% 92%,
					transparent 92%
				)
				0 26% / 100% 40% no-repeat,
			linear-gradient(to bottom, #7cc3e8, #bfe3f2);
	}
	.compass {
		display: grid;
		place-items: center;
	}
	.compass.modern {
		position: absolute;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%) scale(0.45);
	}
	.compass.classic,
	.compass.mnemonic {
		transform: scale(0.95);
	}

	/* in a sheet: the same tiles, smaller, so the whole menu fits a phone */
	.small {
		gap: 8px;
	}
	.small .tile {
		gap: 5px;
		padding: 5px 5px 7px;
		border-radius: 16px;
	}
	.small .tile[aria-pressed='true']::after {
		top: -6px;
		right: -6px;
		width: 22px;
		height: 22px;
		background-size: 14px, auto;
	}
	.small .pic {
		height: 54px;
		border-radius: 11px;
	}
	.small .name {
		font-size: 13px;
	}
	.small .speaker svg {
		width: 40px;
		height: 40px;
	}
	.small .compass.modern {
		transform: translate(-50%, -50%) scale(0.3);
	}
	.small .compass.classic {
		transform: scale(0.75);
	}
	.small .compass.mnemonic {
		transform: scale(0.62);
	}
</style>
