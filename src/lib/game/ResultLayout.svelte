<script lang="ts">
	// The screen after a guess and at the end of a game: the map, and a panel with the result
	// and what to do next. On a computer the panel stands on the left; on a phone the map is on
	// top and the panel rises under it, its buttons always under the thumb.
	import type { Snippet } from 'svelte';
	import { t } from '#lib/i18n/index.svelte.js';
	import { flagSvg, pinSvg } from '#lib/map/map.js';
	import { pinColor } from '#lib/barg/skins.js';

	interface Props {
		map: Snippet;
		actions: Snippet;
		children: Snippet;
		legend?: boolean | 'actual'; // 'actual': the flag's key only (a room's pins are its players' faces)
		// the end of a game: its own page on the turquoise ground, not a milk panel (its lists are
		// milk panels on it); on phones one page scrolls, the map on top
		scroll?: boolean;
	}
	let { map, actions, children, legend = true, scroll = false }: Props = $props();
</script>

<div class="result" class:on-panel={!scroll} class:scroll>
	<div class="map-side">
		{@render map()}
		{#if legend}
			<div class="legend" aria-hidden="true">
				<span><img src={flagSvg()} alt="" width="20" height="24" />{t('actual')}</span>
				{#if legend !== 'actual'}
					<span><img src={pinSvg(pinColor())} alt="" width="14" height="18" />{t('yourGuess')}</span
					>
				{/if}
			</div>
		{/if}
	</div>
	<section class="side">
		<div class="body">{@render children()}</div>
		<div class="actions">{@render actions()}</div>
	</section>
</div>

<style>
	/* The panel is a raised milk surface (deep turquoise by night); on a phone it rises over the
	   map's foot with a rounded top, on a laptop it stands at the left and its story sits in the
	   middle of its height, the key right under it. Yandex's map is never filtered. */
	.result {
		position: fixed;
		inset: 0;
		z-index: 2000;
		background: var(--panel);
		color: var(--ink);
		display: grid;
		grid-template-columns: 500px minmax(0, 1fr);
		grid-template-rows: minmax(0, 1fr);
	}
	.map-side {
		position: relative;
		min-height: 0;
		order: 2;
	}
	.map-side > :global(div:first-child) {
		position: absolute;
		inset: 0;
	}
	/* the legend: one small card in the map's corner, clear of Yandex's box (top left) and its
	   logo and terms (bottom right); the markers are the map's own */
	.legend {
		position: absolute;
		left: 12px;
		bottom: 12px;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 4px;
		padding: 8px 12px 8px 10px;
		border-radius: 14px;
		background: #fff9ec;
		box-shadow:
			0 3px 0 rgba(11, 59, 68, 0.18),
			0 6px 14px rgba(0, 0, 0, 0.15);
		pointer-events: none;
	}
	.legend span {
		display: inline-flex;
		align-items: center;
		height: 24px;
		gap: 8px;
		color: #0b3b44; /* on the milk card over Yandex's map, which is light in both themes */
		font-size: 13px;
		font-weight: 700;
		white-space: nowrap;
	}
	.legend img {
		display: block;
		width: 18px;
		height: auto;
		margin: -3px 0 0;
	}
	.side {
		position: relative;
		z-index: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		justify-content: center;
		background: var(--panel);
		box-shadow: 12px 0 30px var(--shade);
		animation: slide-in 0.45s var(--out);
	}
	:global(:root[data-theme='dark']) .side {
		background: linear-gradient(180deg, var(--panel-2), var(--ground-top) 75%);
	}
	.body {
		flex: 0 1 auto;
		min-height: 0;
		overflow-y: auto;
		padding: 32px 36px 8px;
	}
	.actions {
		padding: 22px 36px max(26px, env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.actions :global(.btn) {
		width: 100%;
	}
	.actions :global(.row) {
		display: flex;
		gap: 10px;
	}
	.actions :global(.row .btn) {
		flex: 1;
		min-width: 0;
		padding: 0 14px;
	}
	@keyframes slide-in {
		from {
			transform: translateX(-30px);
			opacity: 0;
		}
	}
	/* the end of a game: the side is the ground, by day and by night; white words on it */
	.scroll {
		background: var(--ground-bot);
		color: var(--on-ground);
	}
	.scroll .side,
	:global(:root[data-theme='dark']) .scroll .side {
		background:
			radial-gradient(120% 50% at 30% 0%, var(--ground-glow), transparent 70%),
			linear-gradient(180deg, var(--ground-top), var(--ground-bot));
	}
	/* a long list scrolls in the column and fades into the ground over the keys, not cut */
	.scroll .body {
		padding-bottom: 28px;
		-webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - 28px), transparent);
		mask-image: linear-gradient(to bottom, #000 calc(100% - 28px), transparent);
	}

	@media (max-width: 760px) {
		.result {
			display: flex;
			flex-direction: column;
		}
		/* the panel's rounded top meets the map's foot: the two small corners beside it take
		   the colour of Yandex's land, so the map seems to run on under the panel, while the
		   map's own box (and its logo and terms) ends where the panel begins */
		.result:not(.scroll) {
			background: #fbf9f3;
		}
		.map-side {
			order: 0;
			flex: 1;
			min-height: 30vh;
			min-height: 30dvh;
		}
		/* over Yandex's terms line, not on it; one row, so it lies under the pins' margin and
		   never on a pin */
		.legend {
			left: 10px;
			bottom: 26px;
			flex-direction: row;
			gap: 14px;
			padding: 5px 10px 5px 8px;
		}
		.legend span {
			height: 22px;
			font-size: 12.5px;
		}
		/* as tall as what it says, up to 72% */
		.side {
			flex: none;
			justify-content: flex-start;
			max-height: 72vh;
			max-height: 72dvh;
			border-radius: 26px 26px 0 0;
			box-shadow: 0 -10px 30px var(--shade);
			animation: rise-up 0.5s var(--out);
		}
		/* on a short phone the story scrolls under the key: its foot fades, so a line cut in
		   half reads as "more below", not as a fault */
		.body {
			flex: 1 1 auto;
			padding: 18px 16px 18px;
			-webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - 18px), transparent);
			mask-image: linear-gradient(to bottom, #000 calc(100% - 18px), transparent);
		}
		.actions {
			padding: 10px 16px max(14px, env(safe-area-inset-bottom));
			gap: 8px;
		}
		/* scroll: one page scrolls, the map first, the story under it, the keys fixed */
		.scroll {
			overflow-y: auto;
		}
		.scroll .side {
			display: contents;
		}
		.scroll .body {
			order: 1;
			flex: none;
			overflow: visible;
		}
		/* the end of a game: the ground rises over the map's foot with a rounded top. The map's
		   box ends where the ground begins (its logo and terms stay in sight); the two small
		   corners beside the rounded top take Yandex's land colour, as on a round's result, and
		   the rest of the page is the ground. The keys stay under the thumb, the list passing
		   under them into the ground. */
		.scroll {
			background: linear-gradient(
					180deg,
					#fbf9f3 calc(38dvh + 26px),
					var(--ground-bot) calc(38dvh + 26px)
				)
				local;
		}
		.scroll .map-side {
			flex: none;
			height: 38vh;
			height: 38dvh;
			min-height: 0;
		}
		.scroll .body {
			flex: 1 0 auto;
			position: relative;
			border-radius: 26px 26px 0 0;
			padding: 22px 16px 24px;
			background:
				radial-gradient(130% 380px at 30% 0%, var(--ground-glow), transparent 70%),
				linear-gradient(180deg, var(--ground-top), var(--ground-bot) 560px);
			box-shadow: 0 -10px 30px var(--shade);
			-webkit-mask-image: none;
			mask-image: none;
			animation: rise 0.45s var(--out) both;
		}
		.scroll .actions {
			order: 3;
			position: sticky;
			bottom: 0;
			z-index: 2;
			padding-top: 18px;
			background: linear-gradient(180deg, transparent, var(--ground-bot) 18px);
		}
		@keyframes rise-up {
			from {
				transform: translateY(60%);
			}
		}
	}
</style>
