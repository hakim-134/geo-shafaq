<script lang="ts">
	// The place picker: a place as its entry sign, how much there is to play and how much the
	// player has seen and learned, and the places inside it. "Choose" makes it the home's map.
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import TopBar from '#lib/components/TopBar.svelte';
	import MapSign from '#lib/maps/MapSign.svelte';
	import Progress from '#lib/maps/Progress.svelte';
	import { api, call, ApiError, type Schemas } from '#lib/api/client.js';
	import { ensureSession, session } from '#lib/session.svelte.js';
	import { t, tx, type Key } from '#lib/i18n/index.svelte.js';
	import { fmtNum } from '#lib/format.js';
	import { loadChoice, saveChoice } from '#lib/rules.js';

	type Detail = Schemas['PlaceDetail'];

	let detail = $state<Detail | null>(null);
	let failed = $state<'' | 'network' | 'not_found'>('');

	$effect(() => {
		const slug = page.params.slug;
		void session.version;
		if (slug) open(slug);
	});

	async function open(slug: string) {
		failed = '';
		try {
			await ensureSession();
			detail = await call(api().GET('/v1/places/{slug}', { params: { path: { slug } } }));
		} catch (e) {
			failed = e instanceof ApiError && e.code === 'not_found' ? 'not_found' : 'network';
		}
	}

	const place = $derived(detail?.place);
	const parent = $derived(detail?.path.at(-1));
	const playable = $derived(detail?.children.filter((c) => c.panoramas > 0) ?? []);
	const empty = $derived(detail?.children.filter((c) => c.panoramas === 0) ?? []);
	const insideKey = $derived(
		(place ? `placesInside_${place.kind}` : 'placesInside_district') as Key
	);

	function choose() {
		if (!place) return;
		saveChoice({ ...loadChoice(), map: place.map });
		goto('/');
	}
</script>

<svelte:head><title>{place ? tx(place.name) : t('placesTitle')} — Shafaq Geo</title></svelte:head>

<TopBar />

<main class="page places">
	<nav class="crumbs">
		<a href="/" class="link-btn">← {t('home')}</a>
		{#each detail?.path ?? [] as p (p.slug)}
			<span aria-hidden="true">›</span>
			<a href={`/places/${p.slug}`}>{tx(p.name)}</a>
		{/each}
	</nav>

	{#if failed}
		<div class="failed">
			<p>{failed === 'not_found' ? t('notFoundTitle') : t('err_network')}</p>
			{#if failed === 'network'}
				<button class="btn btn-ghost" onclick={() => open(page.params.slug ?? 'uzbekistan')}
					>{t('retry')}</button
				>
			{/if}
		</div>
	{:else if !place}
		<div class="hero skeleton"></div>
	{:else}
		{#if place.kind === 'country'}<h1>{t('placesTitle')}</h1>{/if}
		<section class="hero">
			<div class="hero-sign">
				<MapSign
					slug={place.map}
					name={tx(place.name)}
					top={parent ? tx(parent.name) : ''}
					outline={place.outline}
				/>
			</div>
			<div class="facts">
				<p class="count">{t('nPanoramas', { n: place.panoramas })}</p>
				{#if place.panoramas > 0}
					<Progress progress={place.progress} wide />
					<p class="legend">
						<span class="seen">{t('seenLabel')} {fmtNum(place.progress.seen)}</span>
						<span class="learned">{t('learnedLabel')} {fmtNum(place.progress.learned)}</span>
					</p>
					<p class="note">{t('learnedNote')}</p>
				{:else}
					<p class="note">{t('placeEmpty')}</p>
				{/if}
			</div>
			<button class="btn btn-play" onclick={choose} disabled={place.panoramas === 0}>
				<span>{t('choosePlace')}</span>
				<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
			</button>
		</section>

		{#if playable.length}
			<section class="inside">
				<h2 class="section-title">{t(insideKey)}</h2>
				<div class="grid">
					{#each playable as c (c.slug)}
						<a class="place" href={`/places/${c.slug}`}>
							<MapSign slug={c.map} name={tx(c.name)} outline={c.outline} />
							<span class="meta">
								<span>{t('nPanoramas', { n: c.panoramas })}</span>
								{#if c.progress.seen > 0 || c.progress.unit !== 'spot'}
									<Progress progress={c.progress} />
								{/if}
							</span>
						</a>
					{/each}
				</div>
			</section>
		{/if}

		{#if empty.length}
			<details class="empty">
				<summary>{t('placesEmpty', { n: empty.length })}</summary>
				<div class="empty-list">
					{#each empty as c (c.slug)}
						<a href={`/places/${c.slug}`}>{tx(c.name)}</a>
					{/each}
				</div>
			</details>
		{/if}
	{/if}
</main>

<style>
	.places {
		max-width: 1080px;
		margin: 0 auto;
		padding: 12px 24px 120px;
		display: flex;
		flex-direction: column;
		gap: 22px;
	}
	.crumbs {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 8px;
		font-size: 14px;
		color: var(--muted);
	}
	.crumbs a:not(.link-btn) {
		color: var(--text);
		font-weight: 600;
		text-decoration: none;
	}
	.crumbs a:not(.link-btn):hover {
		text-decoration: underline;
	}
	h1 {
		font-family: var(--display);
		font-weight: 800;
		font-size: clamp(28px, 4vw, 40px);
		letter-spacing: -0.03em;
		line-height: 1.05;
	}

	.hero {
		display: grid;
		grid-template-columns: minmax(0, 420px) minmax(0, 1fr);
		grid-template-areas: 'sign facts' 'sign go';
		gap: 14px 28px;
		align-items: start;
	}
	.hero.skeleton {
		height: 140px;
		border-radius: 14px;
		background: var(--surface-2);
	}
	.hero-sign {
		grid-area: sign;
	}
	.hero-sign :global(.plate) {
		min-height: 110px;
	}
	.hero-sign :global(.name) {
		font-size: 24px;
	}
	.hero-sign :global(.outline),
	.hero-sign :global(.outline svg) {
		width: 84px;
		height: 84px;
	}
	.facts {
		grid-area: facts;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.count {
		font-family: var(--display);
		font-weight: 700;
		font-size: 20px;
	}
	.legend {
		display: flex;
		gap: 16px;
		font-size: 13.5px;
	}
	.legend span::before {
		content: '';
		display: inline-block;
		width: 10px;
		height: 10px;
		border-radius: 3px;
		margin-right: 6px;
		vertical-align: -1px;
	}
	.legend .seen::before {
		background: color-mix(in srgb, var(--gold) 45%, transparent);
	}
	.legend .learned::before {
		background: var(--gold);
	}
	.note {
		font-size: 13px;
		color: var(--muted);
		max-width: 520px;
	}
	.btn-play {
		grid-area: go;
		justify-self: start;
		height: 58px;
		padding: 0 22px 0 24px;
		gap: 14px;
		background: var(--green);
		color: #fff;
		border-radius: 16px;
		font-size: 17px;
		box-shadow: 0 4px 0 var(--green-ink);
	}
	.btn-play:active:not(:disabled) {
		transform: translateY(3px);
		box-shadow: 0 1px 0 var(--green-ink);
	}
	.btn-play svg {
		width: 22px;
		height: 22px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2.6;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.grid {
		margin-top: 14px;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: 18px 16px;
	}
	.place {
		display: flex;
		flex-direction: column;
		gap: 9px;
		text-decoration: none;
		color: var(--text);
	}
	.place :global(.sign) {
		transition: transform 0.15s;
	}
	.place:hover :global(.sign) {
		transform: translateY(-2px);
	}
	.place:focus-visible {
		outline: none;
	}
	.place:focus-visible :global(.sign) {
		outline: 3px solid var(--sky);
		outline-offset: 3px;
	}
	.meta {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 0 4px;
		font-size: 13px;
		color: var(--muted);
	}

	.empty summary {
		cursor: pointer;
		font-size: 14px;
		font-weight: 600;
		color: var(--muted);
	}
	.empty-list {
		margin-top: 10px;
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.empty-list a {
		padding: 6px 12px;
		border-radius: 999px;
		background: var(--surface-2);
		color: var(--muted);
		font-size: 13.5px;
		text-decoration: none;
	}
	.failed {
		display: flex;
		align-items: center;
		gap: 14px;
	}

	@media (max-width: 760px) {
		.places {
			padding: 10px 16px 110px;
		}
		.hero {
			grid-template-columns: minmax(0, 1fr);
			grid-template-areas: 'sign' 'facts' 'go';
		}
		.hero-sign :global(.name) {
			font-size: 21px;
			overflow-wrap: anywhere;
		}
		.hero-sign :global(.outline),
		.hero-sign :global(.outline svg) {
			width: 64px;
			height: 64px;
		}
		/* "choose" stays under the thumb, as Play on the home */
		.btn-play {
			position: fixed;
			left: 16px;
			width: calc(100% - 32px);
			bottom: max(14px, env(safe-area-inset-bottom));
			justify-content: space-between;
			z-index: 100;
		}
		.grid {
			grid-template-columns: minmax(0, 1fr);
			gap: 14px;
		}
	}
</style>
