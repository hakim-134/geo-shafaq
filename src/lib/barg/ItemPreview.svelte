<script lang="ts">
	// One thing from the shop as it will look: a frame on the player's own face, a pin, the line to
	// the real place.
	import type { Schemas } from '#lib/api/client.js';
	import { flagSvg, pinSvg } from '#lib/map/map.js';
	import { session } from '#lib/session.svelte.js';
	import { pinColor, trailOf } from './skins.js';

	let { item, big = false }: { item: Schemas['ShopItem']; big?: boolean } = $props();
	const trail = $derived(trailOf(item.id));
</script>

<span class="preview" class:big>
	{#if item.kind === 'frame'}
		<span class="avatar" data-frame={item.id}>{session.me?.user.avatar ?? '🙂'}</span>
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
		display: grid;
		place-items: center;
		height: 72px;
	}
	.big {
		height: 110px;
		zoom: 1.3;
	}
	.avatar {
		width: 52px;
		height: 52px;
		font-size: 28px;
	}
	img {
		width: 34px;
		height: 44px;
	}
	svg {
		width: 92px;
		height: 46px;
	}
	.paper {
		border-radius: 8px;
		background: #f6f3ea;
	}
</style>
