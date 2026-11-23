<script lang="ts">
	// A tap on a district of "my map": what the player knows there. The district's face (where it
	// is in Tashkent) and how much of it is learned, its streets (learned ones first), how many
	// still wait, and one green key to go and play there: the way to colour it in. Before its
	// first street only "Bu yerda hali o‘ynamagansiz" beside the face: no "0 / 25", no empty bar.
	import { goto } from '$app/navigation';
	import { api, call, ApiError, type Schemas } from '#lib/api/client.js';
	import Sheet from '#lib/components/Sheet.svelte';
	import { t, tx } from '#lib/i18n/index.svelte.js';
	import { loadChoice, rulesFor, saveChoice, testProviders } from '#lib/rules.js';
	import { showToast } from '#lib/toast.svelte.js';
	import PlaceInParent from './PlaceInParent.svelte';
	import Progress from './Progress.svelte';
	import StreetRow from './StreetRow.svelte';

	type Card = Schemas['PlaceCard'];
	let { place, onclose }: { place: Card | null; onclose: () => void } = $props();

	let streets = $state<Schemas['MyStreet'][] | null>(null);
	let failed = $state(false);
	let busy = $state(false);

	// not played here yet: nothing to list, nothing to ask the server
	const fresh = $derived(!!place && !place.progress.seen);

	$effect(() => {
		if (place && !fresh) load(place.slug);
	});

	async function load(slug: string) {
		streets = null;
		failed = false;
		try {
			const out = await call(api().GET('/v1/me/streets', { params: { query: { place: slug } } }));
			if (place?.slug === slug) streets = out.streets;
		} catch {
			failed = true;
		}
	}

	const waiting = $derived(place ? Math.max(place.progress.total - place.progress.seen, 0) : 0);

	async function play() {
		if (!place || busy) return;
		busy = true;
		const choice = { ...loadChoice(), map: place.map };
		try {
			const game = await call(
				api().POST('/v1/games', {
					body: { map: place.map, rules: rulesFor(choice, testProviders()) }
				})
			);
			saveChoice(choice); // the home's map: the last place played
			goto(`/game/${game.id}`);
		} catch (e) {
			busy = false;
			const banned = e instanceof ApiError && e.code === 'banned';
			showToast(t(banned ? 'bannedText' : 'err_other'), 3500);
		}
	}
</script>

<Sheet open={!!place} {onclose} title={place ? tx(place.name) : ''}>
	{#if place}
		<div class="top">
			<span class="face"><PlaceInParent place={place.slug} on="panel" /></span>
			{#if fresh}
				<p class="first">{t('districtEmpty')}</p>
			{:else}
				<Progress progress={place.progress} wide />
			{/if}
		</div>
		{#if fresh}
			<!-- the face and the sentence say it all: the green key is the way in -->
		{:else if streets?.length}
			<ul>
				{#each streets as s, i (i)}
					<li><StreetRow street={s} /></li>
				{/each}
			</ul>
		{:else if streets}
			<p class="note">{t('districtEmpty')}</p>
		{:else if failed}
			<p class="note">{t('err_network')}</p>
		{:else}
			<div class="wait"><span class="spinner" aria-hidden="true"></span></div>
		{/if}
		{#if streets?.length && waiting}
			<p class="note">{t('streetsWaiting', { n: waiting })}</p>
		{/if}
		<div class="foot">
			<button class="btn btn-primary go" disabled={busy} onclick={play}>
				{#if busy}<span class="spinner"></span>{:else}<span class="lbl">{t('playHere')}</span>{/if}
			</button>
		</div>
	{/if}
</Sheet>

<style>
	/* the district in its city, beside how much of it is learned */
	.top {
		display: flex;
		align-items: center;
		gap: 14px;
		margin-bottom: 6px;
		font-size: 14px;
	}
	.face {
		flex: none;
		width: 64px;
		height: 64px;
	}
	.top :global(.progress) {
		flex: 1;
	}
	ul {
		list-style: none;
	}
	li {
		border-bottom: 1px solid var(--panel-line);
	}
	.first {
		flex: 1;
		font-size: 16px;
		font-weight: 700;
		color: var(--ink-2);
	}
	.note {
		margin-top: 12px;
		font-size: 14px;
		color: var(--ink-3);
	}
	.wait {
		display: grid;
		place-items: center;
		min-height: 80px;
	}
	/* the green key stays under the thumb over a long list, to the sheet's very edge */
	.foot {
		position: sticky;
		bottom: -24px;
		margin: 4px 0 -24px;
		padding: 14px 0 24px;
		background: var(--panel);
	}
	@media (max-width: 640px) {
		.foot {
			bottom: -20px;
			margin-bottom: -20px;
			padding-bottom: 20px;
		}
	}
	.go {
		width: 100%;
	}
</style>
