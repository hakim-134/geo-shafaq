<script lang="ts">
	// One thing from the shop as it will look: a frame on the player's own face (on a milk disc,
	// as rooms and results show faces), a pin, the line to the real place. Three sizes: a row of
	// the wallet's history, a shop tile, the buy sheet.
	import { flagSvg, pinSvg } from '#lib/map/map.js';
	import { session } from '#lib/session.svelte.js';
	import { pinColor, trailOf } from './skins.js';

	let {
		item,
		size = 'tile'
	}: { item: { id: string; kind: string }; size?: 'row' | 'tile' | 'big' } = $props();
	const trail = $derived(trailOf(item.id));
</script>

<span class="preview {size}">
	{#if item.kind === 'frame'}
		<span class="avatar face" data-frame={item.id}>{session.me?.user.avatar ?? '🙂'}</span>
	{:else if item.kind === 'pin'}
		<img src={pinSvg(pinColor(item.id))} alt="" />
	{:else}
		<!-- on map paper in both themes: Yandex's map is always light -->
		<svg class="paper" viewBox="0 0 96 48" aria-hidden="true">
			<path
				d="M12 38C34 34 58 22 84 10"
				fill="none"
				stroke={trail?.color}
				stroke-width="3.5"
				stroke-linecap="round"
				stroke-dasharray={trail?.style === 'dot' ? '0.5 7' : '9 6'}
			/>
			<image href={flagSvg()} x="70" y="0" width="22" height="26" />
		</svg>
	{/if}
</span>

<style>
	.preview {
		--s: 1;
		display: grid;
		place-items: center;
		flex: none;
	}
	.tile {
		height: 76px;
	}
	.big {
		--s: 1.7;
		height: 132px;
	}
	.row {
		--s: 0.62;
		width: 40px;
		height: 40px;
	}
	/* the face on a milk disc with a lip, the frame on its edge */
	.face {
		width: calc(56px * var(--s));
		height: calc(56px * var(--s));
		font-size: calc(30px * var(--s));
		background: var(--panel);
		box-shadow: 0 3px 0 var(--panel-lip);
	}
	.row .face {
		box-shadow: none;
	}
	img {
		width: calc(36px * var(--s));
		height: calc(46px * var(--s));
		filter: drop-shadow(0 3px 2px rgba(0, 0, 0, 0.25));
	}
	.paper {
		width: calc(96px * var(--s));
		height: calc(48px * var(--s));
		border-radius: calc(10px * var(--s));
		background: #f6f3ea;
		box-shadow: inset 0 0 0 1px rgba(11, 59, 68, 0.1);
	}
	.row .paper {
		width: 40px;
		height: 30px;
		border-radius: 8px;
	}
</style>
