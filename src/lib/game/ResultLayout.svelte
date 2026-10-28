<script lang="ts">
	// The screen after a guess and at the end of a game: the map, and a panel with the result
	// and what to do next. On a computer the panel stands on the left; on a phone the map is on
	// top and the panel rises under it, its buttons always under the thumb.
	import type { Snippet } from 'svelte';
	import { t } from '#lib/i18n/index.svelte.js';
	import { COLORS, flagSvg } from '#lib/map/map.js';

	interface Props {
		map: Snippet;
		actions: Snippet;
		children: Snippet;
		legend?: boolean;
		tall?: boolean; // more to read than to see (the final table): a smaller map on phones
		stage?: boolean; // the panel is the show (a room's podium): on phones it comes first, the map under it
	}
	let { map, actions, children, legend = true, tall = false, stage = false }: Props = $props();
</script>

<div class="result" class:tall class:stage>
	<div class="map-side">
		{@render map()}
		{#if legend}
			<div class="legend" aria-hidden="true">
				<span><img src={flagSvg()} alt="" width="16" height="20" />{t('actual')}</span>
				<span><i style:background={COLORS.guess}></i>{t('yourGuess')}</span>
			</div>
		{/if}
	</div>
	<section class="panel">
		<div class="body">{@render children()}</div>
		<div class="actions">{@render actions()}</div>
	</section>
</div>

<style>
	.result {
		position: fixed;
		inset: 0;
		z-index: 2000;
		background: var(--bg);
		color: var(--text);
		display: grid;
		grid-template-columns: 420px minmax(0, 1fr);
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
	.legend {
		position: absolute;
		left: 12px;
		top: 12px;
		display: flex;
		gap: 6px;
		pointer-events: none;
	}
	.legend span {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 5px 10px;
		border-radius: 10px;
		background: rgba(255, 255, 255, 0.92);
		color: #13233f;
		font-size: 12.5px;
		font-weight: 600;
		box-shadow: 0 2px 0 rgba(0, 0, 0, 0.12);
	}
	.legend img {
		display: block;
		margin: -4px -2px -2px -4px;
	}
	.legend i {
		width: 10px;
		height: 10px;
		border-radius: 50%;
	}
	.panel {
		min-height: 0;
		display: flex;
		flex-direction: column;
		background: var(--surface);
		border-right: 1px solid var(--border);
		animation: slide-in 0.4s var(--settle);
	}
	.body {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 28px 26px 16px;
	}
	/* a room's podium is the show: a wider panel on a laptop */
	.stage {
		grid-template-columns: min(540px, 40vw) minmax(0, 1fr);
	}
	.actions {
		padding: 12px 26px max(18px, env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
		gap: 10px;
		border-top: 1px solid var(--border);
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

	@media (max-width: 760px) {
		.result {
			display: flex;
			flex-direction: column;
		}
		.map-side {
			order: 0;
			flex: 1;
			min-height: 30vh;
		}
		.panel {
			flex: none;
			max-height: 66vh;
			max-height: 66dvh;
			z-index: 1;
			border-right: none;
			box-shadow: 0 -8px 30px rgba(0, 0, 0, 0.18);
			animation: rise-up 0.45s var(--settle);
		}
		/* the flag's thin band where the panel meets the map */
		.panel::before {
			content: '';
			flex: none;
			height: 7px;
			background: linear-gradient(
				to bottom,
				var(--sky) 0 2px,
				var(--red) 2px 3px,
				#fff 3px 4px,
				var(--red) 4px 5px,
				var(--green) 5px 7px
			);
		}
		.tall .panel {
			max-height: 72vh;
			max-height: 72dvh;
		}
		.body {
			padding: 20px 16px 12px;
		}
		.actions {
			padding: 10px 16px max(12px, env(safe-area-inset-bottom));
			gap: 8px;
		}
		/* the stage: one scroll, the panel's story first, the map under it, the buttons fixed */
		.stage {
			overflow-y: auto;
		}
		.stage .panel {
			display: contents;
		}
		.stage .body {
			order: 1;
			flex: none;
			overflow: visible;
		}
		.stage .map-side {
			order: 2;
			flex: none;
			height: 55vh;
			min-height: 0;
		}
		.stage .actions {
			order: 3;
			position: sticky;
			bottom: 0;
			z-index: 2;
			background: var(--surface);
		}
		.stage .body,
		.stage .map-side {
			background: var(--surface);
		}
		@keyframes rise-up {
			from {
				transform: translateY(60%);
			}
		}
	}
</style>
