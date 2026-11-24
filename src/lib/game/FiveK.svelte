<script lang="ts">
	import { onMount } from 'svelte';
	import type { Schemas } from '#lib/api/client.js';
	import { fmtNum } from '#lib/format.js';
	import { tx } from '#lib/i18n/index.svelte.js';
	import PlaceInParent from '#lib/maps/PlaceInParent.svelte';
	import { sfx5k, vibrate } from '#lib/sfx.svelte.js';
	import { fitMoment, type BadgeFrame, type fiveKNames } from './five-k.svelte.js';

	let {
		place,
		frame,
		friend = false,
		names,
		colorOf
	}: {
		place: Schemas['PlaceInfo'];
		frame: BadgeFrame;
		friend?: boolean;
		names?: ReturnType<typeof fiveKNames>;
		colorOf?: (id: string) => string;
	} = $props();

	let width = $state(0);
	let height = $state(0);
	const layout = $derived(fitMoment(frame, width, height));
	const pieces = Array.from({ length: 12 }, (_, i) => {
		const angle = ((i + Math.random()) * Math.PI) / 6;
		const radius = 90 + Math.random() * 80;
		return {
			x: radius * Math.cos(angle),
			y: radius * Math.sin(angle),
			delay: Math.random() * 350,
			spin: Math.random() * 180 - 90
		};
	});
	onMount(() => {
		sfx5k();
		if (!friend) vibrate([30, 40, 30, 40, 90]);
	});
</script>

<div class="moment" class:friend role="status">
	<div
		class="stack"
		style:left={layout.x + 'px'}
		style:top={layout.y + 'px'}
		style:--scale={layout.scale}
		style:--line-width={Math.max(1, frame.width - 20) + 'px'}
		bind:offsetWidth={width}
		bind:offsetHeight={height}
	>
		<div class="glow"></div>
		{#each pieces as piece, i (i)}
			<span
				class="piece"
				class:far={i % 4 === 1}
				aria-hidden="true"
				style:--x={piece.x + 'px'}
				style:--y={piece.y + 'px'}
				style:--spin={piece.spin + 'deg'}
				style:animation-delay={piece.delay + 'ms'}
			>
				{#if i % 3 === 0}
					<svg viewBox="0 0 24 24" width="22" height="22">
						<circle cx="12" cy="12" r="11" fill="var(--gold)" stroke="white" />
						<path fill="white" d="M6.5 5h2v14h-2zM9 5.5h9v7.5H9z" />
						<path
							fill="var(--gold-lo)"
							d="M9 5.5h3v2.5H9zm6 0h3v2.5h-3zm-3 2.5h3v2.5h-3zm-3 2.5h3V13H9zm6 0h3V13h-3z"
						/>
					</svg>
				{:else}<i></i>{/if}
			</span>
		{/each}
		{#if friend}
			<div class="coins">
				{#each names ?? [] as part}
					{#if typeof part !== 'string'}
						<span class="avatar coin" style:--ring={colorOf?.(part.id)} aria-hidden="true"
							>{part.avatar}</span
						>
					{/if}
				{/each}
			</div>
		{:else}
			{#if place.slug}<div class="face"><PlaceInParent place={place.slug} /></div>{/if}
			<b class="number d">{fmtNum(5000)}</b>
		{/if}
		<div class="line cap">
			{#if names}
				{#each names as part}
					{#if typeof part === 'string'}<span>{part}</span>
					{:else}
						<span class="scorer">
							{#if !friend}<span
									class="avatar ring"
									style:--ring={colorOf?.(part.id)}
									aria-hidden="true">{part.avatar}</span
								>{/if}
							{part.name}
						</span>
					{/if}
				{/each}
			{:else}{tx(place.street ?? place.district ?? place.city ?? place.region) || '—'}{/if}
		</div>
		{#if friend}<b class="number d">{fmtNum(5000)}</b>{/if}
	</div>
</div>

<style>
	.moment,
	.moment :global(*) {
		pointer-events: none;
	}
	.moment {
		position: absolute;
		inset: 0;
		z-index: 2;
		overflow: hidden;
		animation: leave 500ms ease-in 1500ms both;
	}
	.moment:not(.friend)::before {
		content: '';
		position: absolute;
		inset: 0;
		background: white;
		animation: flash 120ms both;
	}
	.stack {
		position: absolute;
		width: max-content;
		display: grid;
		justify-items: center;
		gap: 8px;
		transform: translate(-50%, -50%) scale(var(--scale));
		isolation: isolate;
	}
	.glow {
		position: absolute;
		z-index: -1;
		inset: -30% -35%;
		background: radial-gradient(
			ellipse closest-side,
			var(--gold-hi),
			color-mix(in srgb, var(--gold) 64%, transparent) 50%,
			transparent
		);
		animation: light 200ms ease-out both;
	}
	.face {
		width: clamp(100px, 20vw, 130px);
		aspect-ratio: 1;
		animation: light-face 280ms var(--out) both;
	}
	.coins {
		display: flex;
		gap: 8px;
	}
	.avatar.coin {
		width: 72px;
		height: 72px;
		font-size: 46px;
		background: linear-gradient(var(--gold-hi), var(--gold));
		border: 4px solid var(--gold);
		box-shadow:
			0 0 0 2px var(--ring),
			0 4px 0 var(--gold-lo);
	}
	.friend .number {
		font-size: clamp(26px, 7.3vw, 42px);
	}
	.number {
		font-size: min(22vw, 128px);
		line-height: 1;
		color: var(--gold);
		text-shadow:
			0 2px 0 var(--gold-lo),
			0 5px 0 var(--stack),
			0 8px 14px var(--stack-2);
		animation: hit 380ms cubic-bezier(0.2, 1.6, 0.4, 1) both;
	}
	.line {
		display: flex;
		align-items: center;
		gap: 0.25em;
		max-width: var(--line-width);
		min-width: 0;
		padding: 4px 12px;
		border-radius: 999px;
		font-weight: 800;
		text-align: center;
		justify-content: center;
		overflow-wrap: normal;
		animation: light 200ms both;
	}
	.scorer {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		text-shadow: 0 1px 1px var(--cap-lip);
	}
	.scorer .avatar {
		width: 1.5em;
		height: 1.5em;
		border: 2px solid var(--ring);
		vertical-align: middle;
	}
	.piece {
		position: absolute;
		z-index: -1;
		inset: 0;
		display: grid;
		place-items: center;
		animation: burst 900ms var(--out) both;
	}
	.piece.far {
		scale: 0.75;
		filter: blur(0.7px);
	}
	.piece i {
		width: 16px;
		height: 16px;
		background: var(--gold-hi);
		clip-path: polygon(50% 0, 61% 38%, 100% 50%, 61% 62%, 50% 100%, 39% 62%, 0 50%, 39% 38%);
	}
	@keyframes flash {
		0%,
		100% {
			opacity: 0;
		}
		45% {
			opacity: 0.35;
		}
	}
	@keyframes light {
		from {
			opacity: 0;
		}
	}
	@keyframes light-face {
		from {
			opacity: 0;
			transform: scale(0.7);
		}
	}
	@keyframes hit {
		0% {
			transform: var(--lean) scale(0.2);
		}
		70% {
			transform: var(--lean) scale(1.08);
		}
		100% {
			transform: var(--lean);
		}
	}
	@keyframes burst {
		0% {
			opacity: 0;
			transform: scale(0.4);
		}
		12%,
		65% {
			opacity: 1;
		}
		100% {
			opacity: 0;
			transform: translate(var(--x), var(--y)) rotate(var(--spin));
		}
	}
	@keyframes leave {
		to {
			opacity: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.moment {
			animation: quiet 1.8s ease both;
			animation-duration: 1.8s !important;
		}
		.moment:not(.friend)::before,
		.piece {
			display: none;
		}
		.glow,
		.face,
		.number,
		.line {
			animation: none;
		}
	}
	@keyframes quiet {
		0%,
		100% {
			opacity: 0;
		}
		18%,
		80% {
			opacity: 1;
		}
	}
</style>
