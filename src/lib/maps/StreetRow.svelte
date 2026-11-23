<script lang="ts">
	// One street the player has been on, as a row of a milk list, built like a row of the end of a
	// game: the face of the district they met it in, the street's name in the leaning letters with
	// that district under it, and how it went: a gold tick once learned (gold is what is learned),
	// else the closest guess in the result's words, a red ↔ and "14.9 km uzoqda". The whole row
	// opens the street's panorama on Yandex Maps (the small arrow says so). Its padding is the
	// list's: in a .panel-list the rows are the list's own; elsewhere (a district's sheet) the page
	// gives them their room.
	import type { Schemas } from '#lib/api/client.js';
	import PlaceInParent from './PlaceInParent.svelte';
	import { fmtDistance } from '#lib/format.js';
	import { t, tx } from '#lib/i18n/index.svelte.js';
	import { openPanorama, panoramaUrl } from '#lib/map/map.js';

	let { street: s }: { street: Schemas['MyStreet'] } = $props();

	// "14.9 km uzoqda" cut round the distance, so the distance stands in the display letters on
	// top and the words go small under it ("uzoqda", "away"; Russian's "Промах:" loses its colon)
	const far = $derived.by(() => {
		if (s.learned || s.bestKm == null) return null;
		const d = fmtDistance(s.bestKm);
		const text = t('kmAway', { d });
		const i = text.indexOf(d);
		const words = i < 0 ? '' : (text.slice(0, i) + text.slice(i + d.length)).replace(/[:\s]+$/, '');
		return { d, words: words.trim() };
	});
</script>

<svelte:element
	this={s.at ? 'a' : 'div'}
	class="row"
	class:learned={s.learned}
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
	<span class="face"><PlaceInParent place={s.face} on="panel" /></span>
	<span class="what">
		<b class="name d">{tx(s.name)}</b>
		<small class="where">{tx(s.place)}</small>
	</span>
	<span class="how">
		{#if s.learned}
			<span class="tick" title={t('learnedLabel')}>
				<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
			</span>
		{:else if far}
			<span class="far">
				<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"
					><path d="M4 12h16M4 12l3.5-3.5M4 12l3.5 3.5M20 12l-3.5-3.5M20 12l-3.5 3.5" /></svg
				>
				<b class="d">{far.d}</b>
			</span>
			{#if far.words}<small>{far.words}</small>{/if}
		{:else}
			<!-- every round there went without a pin: the result's struck circle and its words -->
			<svg viewBox="0 0 24 24" class="icon none" aria-hidden="true"
				><circle cx="12" cy="12" r="8" /><path d="M6.5 17.5l11-11" /></svg
			>
			<small>{t('noPin')}</small>
		{/if}
	</span>
	{#if s.at}
		<svg viewBox="0 0 24 24" class="icon out" aria-hidden="true"><path d="M8 16 16 8M9.5 8H16v6.5" /></svg>
	{/if}
</svelte:element>

<style>
	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 66px;
		color: var(--ink);
		text-decoration: none;
	}
	/* the district in its city: the face, as on the end of a game */
	.face {
		flex: none;
		width: 36px;
		height: 36px;
	}
	.what {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 2px;
	}
	/* the street's name in the game's lettering, leaning; a long one wraps, never a word cut */
	.name {
		font-size: 16.5px;
		line-height: 1.15;
		transform-origin: 0 75%;
		color: var(--ink);
		overflow-wrap: break-word;
		max-width: 100%;
	}
	.where {
		font-size: 13px;
		font-weight: 600;
		color: var(--ink-3);
	}
	.how {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 2px;
		flex: none;
		text-align: right;
	}
	.how small {
		font-size: 12.5px;
		font-weight: 600;
		color: var(--ink-3);
	}
	/* how far: the result's red ↔ (red is a miss) and the distance in the display letters */
	.far {
		display: inline-flex;
		align-items: center;
		gap: 5px;
	}
	.far b {
		font-size: 16px;
		line-height: 1.1;
		color: var(--ink);
	}
	.far .icon {
		width: 17px;
		height: 17px;
		color: var(--red);
		stroke-width: 2.4;
	}
	.icon.none {
		width: 18px;
		height: 18px;
		color: var(--ink-3);
		stroke-width: 2.2;
	}
	/* learned: a small gold coin with a tick */
	.tick {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: linear-gradient(180deg, var(--gold-hi), var(--gold));
		color: var(--gold-ink);
		display: grid;
		place-items: center;
		box-shadow:
			inset 0 1.5px 0 rgba(255, 255, 255, 0.6),
			0 2px 0 var(--gold-lo);
	}
	.tick .icon {
		width: 16px;
		height: 16px;
		stroke-width: 3.2;
	}
	.out {
		flex: none;
		width: 16px;
		height: 16px;
		margin-left: -4px;
		color: var(--ink-3);
		stroke-width: 2.4;
	}
</style>
