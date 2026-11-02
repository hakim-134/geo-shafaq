<script lang="ts">
	// A tap on a district of "my map": what the player knows there. Its streets, learned ones
	// first, how many still wait, and one green button to go and play there: the way to colour it in.
	import { goto } from '$app/navigation';
	import { api, call, ApiError, type Schemas } from '#lib/api/client.js';
	import Sheet from '#lib/components/Sheet.svelte';
	import { t, tx } from '#lib/i18n/index.svelte.js';
	import { loadChoice, rulesFor, saveChoice, testProviders } from '#lib/rules.js';
	import { showToast } from '#lib/toast.svelte.js';
	import Progress from './Progress.svelte';
	import StreetRow from './StreetRow.svelte';

	type Card = Schemas['PlaceCard'];
	let { place, onclose }: { place: Card | null; onclose: () => void } = $props();

	let streets = $state<Schemas['MyStreet'][] | null>(null);
	let failed = $state(false);
	let busy = $state(false);

	$effect(() => {
		if (place) load(place.slug);
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
			saveChoice(choice); // the home's sign: the last place played
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
		<div class="top"><Progress progress={place.progress} wide /></div>
		{#if streets?.length}
			<ul>
				{#each streets as s, i (i)}
					<li><StreetRow street={s} district={place.name} /></li>
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
				{#if busy}<span class="spinner"></span>{:else}<svg viewBox="0 0 24 24" aria-hidden="true"
						><path d="M7 4.5v15l12-7.5z" /></svg
					>{/if}
				{t('playHere')}
			</button>
		</div>
	{/if}
</Sheet>

<style>
	.top {
		margin-bottom: 8px;
		font-size: 14px;
		color: var(--muted);
	}
	ul {
		list-style: none;
	}
	li {
		border-bottom: 1px solid var(--border);
	}
	.note {
		margin-top: 12px;
		font-size: 14px;
		color: var(--muted);
	}
	.wait {
		display: grid;
		place-items: center;
		min-height: 80px;
	}
	/* the green button stays under the thumb over a long list, to the sheet's very edge */
	.foot {
		position: sticky;
		bottom: -24px;
		margin: 4px 0 -24px;
		padding: 12px 0 24px;
		background: var(--surface);
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
		height: 60px;
		font-size: 17px;
	}
	.go svg {
		width: 20px;
		height: 20px;
		fill: currentColor;
		stroke: none;
	}
</style>
