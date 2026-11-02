<script lang="ts">
	// One street the player has been on: its plate, a green tick when learned, else the closest
	// guess. The whole row is the street's panorama on Yandex Maps, its 🏁 badge first.
	import type { Schemas } from '#lib/api/client.js';
	import StreetPlate from '#lib/game/StreetPlate.svelte';
	import { fmtDistance } from '#lib/format.js';
	import { t } from '#lib/i18n/index.svelte.js';
	import { flagSvg, openPanorama, panoramaUrl } from '#lib/map/map.js';

	// district: the plate's small line, when the page knows it better than the street does
	let { street: s, district }: { street: Schemas['MyStreet']; district?: Schemas['Text'] } =
		$props();
</script>

<svelte:element
	this={s.at ? 'a' : 'div'}
	class="row"
	href={s.at ? panoramaUrl(s.at, s.heading) : undefined}
	target={s.at ? '_blank' : undefined}
	rel={s.at ? 'noopener' : undefined}
	title={s.at ? t('seePanorama') : undefined}
	role={s.at ? 'link' : 'presentation'}
	onclick={(e: MouseEvent) => {
		if (!s.at) return;
		e.preventDefault();
		openPanorama(s.at, s.heading);
	}}
>
	{#if s.at}
		<span class="pano"><img src={flagSvg()} alt="" width="34" height="40" /></span>
	{/if}
	<span class="plate"
		><StreetPlate place={{ street: s.name, district: district ?? s.place }} size="small" /></span
	>
	<span class="how">
		{#if s.learned}
			<span class="tick" title={t('learnedLabel')}>
				<svg viewBox="0 0 24 24" class="icon"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
			</span>
		{:else if s.bestKm != null}
			<b>{fmtDistance(s.bestKm)}</b>
		{:else}
			<b>—</b>
		{/if}
		<span>{s.learned ? t('nRounds', { n: s.rounds }) : t('learnAt')}</span>
	</span>
</svelte:element>

<style>
	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 0;
		color: inherit;
		text-decoration: none;
		transition: transform 0.12s;
	}
	a.row:active {
		transform: scale(0.98);
	}
	.pano {
		flex: none;
		display: grid;
		place-items: center;
		width: 40px;
		height: 44px;
	}
	.plate {
		flex: 1;
		min-width: 0;
		display: flex;
	}
	.how {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 2px;
		flex: none;
		font-size: 12.5px;
		color: var(--muted);
	}
	.how b {
		font-family: var(--display);
		font-size: 14px;
		color: var(--text);
	}
	.tick {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: var(--green);
		color: #fff;
		display: grid;
		place-items: center;
		box-shadow: 0 2px 0 var(--green-edge);
	}
	.tick .icon {
		width: 16px;
		height: 16px;
		stroke-width: 3;
	}
</style>
