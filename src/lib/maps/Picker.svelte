<script lang="ts">
	import HomeMap, { placeDetail } from './HomeMap.svelte';
	import PlaceInParent from './PlaceInParent.svelte';
	import PickFace from './PickFace.svelte';
	import Sheet from '#lib/components/Sheet.svelte';
	import { api, call, ApiError, type MapSummary } from '#lib/api/client.js';
	import { t, tx, type Key } from '#lib/i18n/index.svelte.js';
	import { showToast } from '#lib/toast.svelte.js';
	import { shortName } from './progress.js';
	import {
		addPick,
		COUNTRY,
		listOf,
		pickColor,
		pickFace,
		pickOfMap,
		removePick,
		type NewPick,
		type Pick
	} from './picks.js';

	let {
		current,
		maps,
		onchange,
		readonly = false,
		busy = false,
		defaultPick = false,
		shared = false,
		changing = $bindable(false),
		shownPlace = $bindable(),
		selected = $bindable([])
	}: {
		current?: MapSummary;
		maps?: MapSummary[];
		onchange: (map: MapSummary) => void | Promise<void>;
		readonly?: boolean;
		busy?: boolean;
		defaultPick?: boolean;
		shared?: boolean;
		changing?: boolean;
		shownPlace?: NewPick;
		selected?: Pick[];
	} = $props();

	let remembered = $state<Pick[]>([]);
	let draft = $state<Pick[] | null>(null);
	let paths = $state<Record<string, string[]>>({});
	const requested = new Set<string>();
	const picks = $derived(
		(draft ?? (current ? listOf(current, shared ? [] : remembered) : [])).map((p) =>
			p.place && !p.path && paths[p.place] ? { ...p, path: paths[p.place] } : p
		)
	);
	const ownList = $derived(!defaultPick || draft !== null);
	const locked = $derived(busy || (shared && changing));
	let readyOpen = $state(false);
	let loadingReady = $state(false);
	let roomMaps = $state<MapSummary[]>([]);
	const ready = $derived(
		[...(maps ?? roomMaps)].sort((a, b) => +(b.slug === COUNTRY) - +(a.slug === COUNTRY))
	);
	let homeMap = $state<ReturnType<typeof HomeMap>>();
	let pending: Promise<boolean> | undefined;
	let revision = 0;

	$effect(() => {
		selected = picks;
		for (const pick of picks) {
			const place = pick.place;
			if (!place || pick.path || requested.has(place)) continue;
			requested.add(place);
			placeDetail(place).then(
				(detail) => (paths[place] = detail.path.map((item) => item.slug)),
				() => requested.delete(place)
			);
		}
	});

	export async function flyTo(place: string) {
		return homeMap?.flyTo(place);
	}

	export async function waitForPicks() {
		while (pending) {
			const attempt = revision;
			const result = await pending;
			if (attempt === revision) return result;
		}
		return true;
	}

	function setList(next: Pick[]) {
		draft = next;
		changing = true;
		const attempt = ++revision;
		pending = (async () => {
			try {
				const m =
					next.length === 1
						? (ready.find((m) => m.slug === next[0].map) ??
							(await call(
								api().GET('/v1/maps/{slug}', { params: { path: { slug: next[0].map } } })
							)))
						: await call(api().POST('/v1/maps/mix', { body: { parts: next.map((p) => p.map) } }));
				if (attempt !== revision) return false;
				await onchange(m);
				if (!shared && attempt === revision) remembered = listOf(m, picks);
				return true;
			} catch (e) {
				if (attempt === revision) {
					const keys: Record<string, Key> = {
						network: 'err_network',
						no_panorama: 'err_no_panorama',
						daily_cap: 'err_daily_cap',
						banned: 'bannedText',
						not_host: 'err_not_host'
					};
					showToast(t(e instanceof ApiError ? (keys[e.code] ?? 'err_other') : 'err_other'), 3000);
				}
				return false;
			} finally {
				if (attempt === revision) {
					draft = null;
					pending = undefined;
					changing = false;
				}
			}
		})();
	}

	function add(pick: NewPick) {
		if (locked || readonly) return false;
		const map = ready.find((m) => m.slug === pick.map);
		const { list, outcome } = addPick(picks, map ? { ...pick, ...pickOfMap(map) } : pick, !ownList);
		if (outcome === 'full') showToast(t('pickLimit'), 2500);
		if (outcome === 'added') setList(list);
		return outcome !== 'full';
	}

	function remove(map: string) {
		if (locked || readonly) return;
		const next = removePick(picks, map);
		if (next !== picks) setList(next);
	}

	async function openReady() {
		readyOpen = true;
		if (maps || roomMaps.length || loadingReady) return;
		loadingReady = true;
		try {
			roomMaps = await call(api().GET('/v1/maps'));
		} catch {
			readyOpen = false;
			showToast(t('err_network'));
		} finally {
			loadingReady = false;
		}
	}

	function pickTag(p?: Pick): string {
		if (p?.map !== 'historic') return tx(p?.top);
		const description = p.top ?? ready.find((m) => m.slug === p.map)?.description;
		const cities = description?.uz.split(',').filter((name) => name.trim()).length;
		return cities ? t('nCities', { n: cities }) : '';
	}

	/** Runs `fit` now, when the lettering's font arrives (it swaps in after the first paint and
	 * is wider than the stand-in), and when the box gets wider or narrower. */
	function refit(el: HTMLElement, fit: () => void) {
		// a size is measured right after it is set: no transition may hold the old one (with
		// reduced motion, app.css gives every property of every element a 0.01 ms transition)
		el.style.transitionProperty = 'none';
		const box = el.parentElement!;
		let width = box.clientWidth;
		fit();
		document.fonts?.ready.then(fit);
		document.fonts?.addEventListener('loadingdone', fit);
		const seen = new ResizeObserver(() => {
			if (box.clientWidth !== width) fit();
			width = box.clientWidth;
		});
		seen.observe(box);
		return {
			update: fit,
			destroy() {
				seen.disconnect();
				document.fonts?.removeEventListener('loadingdone', fit);
			}
		};
	}

	/** The place's name fits one line in the shared picker and on phones. */
	function fitName(el: HTMLElement, _text?: string) {
		const box = el.parentElement!;
		return refit(el, () => {
			el.style.fontSize = '';
			const cs = getComputedStyle(el);
			let size = parseFloat(cs.fontSize);
			const lines = cs.whiteSpace === 'nowrap' ? 1 : 2;
			const lh = parseFloat(cs.lineHeight) / size || 1.05;
			const fits = () =>
				lines === 1
					? el.offsetWidth <= box.clientWidth - 8
					: el.offsetHeight <= size * lh * lines + 2 && el.offsetWidth <= box.clientWidth;
			while (!fits() && size > 16) {
				size -= 1;
				el.style.fontSize = `${size}px`;
			}
		});
	}

	/** Keep the small gold tag on one line. */
	function fitTag(el: HTMLElement, _text?: string) {
		return refit(el, () => {
			el.style.fontSize = '';
			el.style.letterSpacing = '';
			if (el.scrollWidth > el.clientWidth) el.style.letterSpacing = '0.04em';
			let size = parseFloat(getComputedStyle(el).fontSize);
			while (el.scrollWidth > el.clientWidth && size > 10) {
				size -= 0.5;
				el.style.fontSize = `${size}px`;
			}
		});
	}
</script>

<div class="picker-map">
	<HomeMap
		bind:this={homeMap}
		bind:shownPlace
		{picks}
		{ownList}
		{locked}
		{readonly}
		onpick={add}
		onunpick={remove}
	/>
</div>

<header class="picker-place" class:shared>
	{#if picks.length > 1}
		<ul class="picks">
			{#each picks as p (p.map)}
				<li class="pk" style:--pc={pickColor(p)}>
					<button class="pk-go" aria-label={tx(p.name)} onclick={() => homeMap?.flyTo(p.place)}>
						<PickFace pick={p} name="short" />
					</button>
					{#if !readonly}<button
							class="pk-x"
							aria-label={t('removePick', { name: tx(p.name) })}
							disabled={locked}
							onclick={() => remove(p.map)}
						>
							<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" /></svg>
						</button>{/if}
				</li>
			{/each}
		</ul>
	{:else}
		{@const one = picks[0]}
		{@const tag = pickTag(one)}
		{@const name = shortName(tx(one?.name))}
		{#key one?.map}
			{#if one}
				<!-- the map's face, the one it wears on every screen (P1111 §5), in its pick
						     colour: Tashkent's streets are Tashkent in its region -->
				<button
					class="pic pop-pic"
					aria-label={tx(one.name)}
					onclick={() => homeMap?.flyTo(one.place)}
				>
					<PickFace pick={one} />
				</button>
				<div class="words">
					{#if tag}
						<span class="kick d pop" use:fitTag={tag}>{tag}</span>
					{/if}
					<div class="tw">
						<h1 class="title d float pop" use:fitName={name}>{name}</h1>
					</div>
				</div>
			{:else}
				<!-- the same height while it loads: nothing jumps -->
				<span class="pic" aria-hidden="true"></span>
			{/if}
		{/key}
	{/if}
	{#if !readonly && picks.length}
		<button class="more chip" aria-label={t('addMaps')} disabled={locked} onclick={openReady}>
			<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
			<span class="more-l">{t('addMaps')}</span>
		</button>
	{/if}
</header>

<!-- the ready maps, each with its face: a tap adds it to the list -->
<Sheet open={readyOpen} onclose={() => (readyOpen = false)} title={t('addMaps')}>
	<div class="ready">
		{#if loadingReady}<span class="spinner" aria-hidden="true"></span>{/if}
		{#each ready as m (m.slug)}
			{@const inList = ownList ? picks.find((p) => p.map === m.slug) : undefined}
			<button
				class="rrow"
				class:on={!!inList}
				disabled={locked || !!inList}
				style:--pc={inList ? pickColor(inList) : undefined}
				onclick={() => {
					if (add(pickOfMap(m))) readyOpen = false;
				}}
			>
				<span class="rpic" aria-hidden="true"
					><PlaceInParent
						{...pickFace(pickOfMap(m))}
						on="panel"
						color={inList ? pickColor(inList) : undefined}
					/></span
				>
				<span class="rtext">
					<b>{tx(m.name)}</b>
					<span>{tx(m.description)}</span>
				</span>
				{#if inList}
					<svg class="tick" viewBox="0 0 24 24" aria-hidden="true"
						><path d="M5 12.5l4.5 4.5L19 7.5" /></svg
					>
				{/if}
			</button>
		{/each}
	</div>
</Sheet>

<style>
	.picker-map {
		display: grid;
		min-height: 0;
		min-width: 0;
	}
	/* what you'll play: one place's picture beside a gold tag over its name, which floats on the
	   stacked shadow; several places, a row of pictures. The block keeps one height whatever the
	   list: nothing round it moves */
	.picker-place {
		display: flex;
		align-items: center;
		gap: 12px;
		height: 86px;
		margin-top: 6px;
		min-width: 0;
	}
	.pic {
		width: 84px;
		height: 72px;
		flex: none;
		padding: 0;
		border: none;
		background: none;
		/* milk tiles on the ground, the place in its pick colour, like the map */
		--pip-tile: var(--tile-a);
		filter: drop-shadow(0 3px 0 var(--map-shadow)) drop-shadow(0 0 8px var(--map-glow));
	}
	button.pic:active {
		transform: scale(0.95);
	}
	/* the picked places, a row of their pictures; each × a small milk coin on its corner (a
	   finger's 34 px round it) */
	.picks {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 8px;
		list-style: none;
	}
	.pk {
		position: relative;
		flex: 0 1 62px;
		min-width: 0;
		--pip-tile: var(--tile-a);
	}
	.pk-go {
		display: block;
		width: 100%;
		padding: 0;
		border: none;
		background: none;
		color: inherit;
		transition: transform 0.12s var(--out);
	}
	.pk-go:active {
		transform: scale(0.94);
	}
	.pk-go :global(.pick-face) {
		display: block;
		height: 54px;
		filter: drop-shadow(0 3px 0 var(--map-shadow)) drop-shadow(0 0 6px var(--map-glow));
		animation: pop-pic 0.45s var(--spring);
	}
	.pk-go :global(.pick-name) {
		display: block;
		color: var(--on-ground);
		font: 700 12px/1.15 var(--f-text);
		white-space: nowrap;
	}
	@media (max-width: 960px) {
		.picks {
			padding: 8px 8px 4px 0;
			overflow-x: auto;
			scrollbar-width: thin;
		}
		.pk {
			flex: none;
			min-width: 62px;
		}
		.pk-go :global(.pick-face) {
			width: 54px;
			height: 48px;
			margin-inline: auto;
		}
	}
	.pk-x {
		position: absolute;
		top: -8px;
		right: -6px;
		width: 22px;
		height: 22px;
		padding: 0;
		border: none;
		border-radius: 50%;
		background: var(--panel);
		color: var(--ink);
		display: grid;
		place-items: center;
		box-shadow:
			0 0 0 1.5px color-mix(in srgb, var(--pc) 70%, transparent),
			0 2px 0 var(--stack-2);
	}
	.pk-x::before {
		content: '';
		position: absolute;
		inset: -6px;
		border-radius: 50%;
	}
	.pk-x svg,
	.more svg {
		width: 13px;
		height: 13px;
		fill: none;
		stroke: currentColor;
		stroke-width: 3.2;
		stroke-linecap: round;
	}
	.pk-x:active {
		transform: scale(0.9);
	}
	/* "+": the ready maps; a round glass key at the end of the row */
	.more {
		flex: none;
		width: 40px;
		height: 40px;
		margin-left: auto;
		border-radius: 50%;
		display: grid;
		place-items: center;
		transition: transform 0.12s var(--out);
	}
	.more:active {
		transform: scale(0.92);
	}
	.more svg {
		width: 18px;
		height: 18px;
		stroke-width: 2.8;
	}
	.more-l {
		display: none;
	}
	.words {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 6px;
	}
	/* .words: past the lettering's own spacing (.d) */
	.words .kick {
		max-width: 100%;
		height: 24px;
		padding: 0 10px;
		border-radius: 7px;
		background: linear-gradient(180deg, var(--kick-a), var(--kick-b));
		box-shadow: 0 2px 0 var(--gold-lo);
		color: var(--kick-ink);
		font-size: 12.5px;
		line-height: 24px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.tw {
		width: 100%;
		min-width: 0;
		white-space: nowrap;
	}
	.title {
		margin: 0;
		font-size: 34px;
		line-height: 1.05;
		color: var(--on-ground);
	}
	/* a new place pops in (the lean stays in the keyframes: it is the lettering's transform) */
	.pop {
		animation: pop 0.5s var(--spring);
	}
	@keyframes pop {
		0% {
			transform: var(--lean) scale(0.86);
			opacity: 0.4;
		}
		100% {
			transform: var(--lean) scale(1);
			opacity: 1;
		}
	}
	.pop-pic {
		animation: pop-pic 0.5s var(--spring);
	}
	@keyframes pop-pic {
		0% {
			transform: scale(0.7);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.pop,
		.pop-pic {
			animation: none;
		}
	}
	/* the ready maps, in the sheet: milk-2 rows, each its face, name and what it is */
	.ready {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.rrow {
		display: flex;
		align-items: center;
		gap: 14px;
		min-height: 64px;
		padding: 8px 14px 8px 10px;
		border: none;
		border-radius: var(--r-s);
		background: var(--panel-2);
		color: var(--ink);
		text-align: left;
		box-shadow: inset 0 0 0 1.5px var(--panel-line);
		transition: transform 0.12s var(--out);
	}
	.rrow:active:not(:disabled) {
		transform: scale(0.98);
	}
	.rrow.on {
		box-shadow: inset 0 0 0 2.5px var(--pc);
	}
	.rpic {
		width: 58px;
		height: 50px;
		flex: none;
	}
	.rtext {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.rtext b {
		font-size: 17px;
		line-height: 1.25;
	}
	.rtext span {
		font-size: 13.5px;
		color: var(--ink-2);
	}
	.tick {
		width: 24px;
		height: 24px;
		flex: none;
		fill: none;
		stroke: var(--pc);
		stroke-width: 3.2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	@media (max-height: 700px) and (max-width: 960px) {
		.picker-place {
			height: 76px;
			margin-top: 2px;
		}
		.pic {
			width: 74px;
			height: 64px;
		}
		.title {
			font-size: 30px;
		}
	}
	@media (min-width: 961px) {
		.picker-place {
			height: auto;
			min-height: 128px;
			margin-top: 14px;
			display: grid;
			grid-template-columns: auto minmax(0, 1fr);
			column-gap: 14px;
			row-gap: 6px;
		}
		.pic {
			width: 96px;
			height: 96px;
		}
		/* several places: a column of rows, picture, name, × */
		.picks {
			grid-column: 1 / -1;
			flex-direction: column;
			align-items: stretch;
			gap: 2px;
			max-height: min(400px, 46vh);
			overflow-y: auto;
			margin: 0 -8px;
			padding: 2px 0;
		}
		.pk {
			flex: none;
			display: flex;
			align-items: center;
			gap: 6px;
		}
		.pk-go {
			flex: 1;
			min-width: 0;
			display: flex;
			align-items: center;
			gap: 12px;
			padding: 5px 8px;
			border-radius: var(--r-s);
			text-align: left;
			transition: background 0.15s;
		}
		.pk-go:hover {
			background: var(--chip-bg);
		}
		.pk-go:active {
			transform: none;
		}
		.pk-go :global(.pick-face) {
			width: 46px;
			height: 40px;
		}
		.pk-go :global(.pick-name) {
			display: block;
			min-width: 0;
			color: var(--on-ground);
			font-family: var(--f-disp);
			font-weight: 900;
			font-size: 19px;
		}
		.pk-x {
			position: relative;
			top: auto;
			right: auto;
			width: 34px;
			height: 34px;
			flex: none;
			background: var(--chip-bg);
			color: var(--on-ground);
			box-shadow: inset 0 0 0 1.5px var(--chip-line);
		}
		.pk-x::before {
			display: none;
		}
		/* "+ Tayyor xaritalar": a quiet row under the list */
		.more {
			grid-column: 1 / -1;
			justify-self: start;
			width: auto;
			height: 40px;
			margin: 4px 0 0 -6px;
			padding: 0 14px 0 10px;
			border-radius: var(--r-s);
			display: inline-flex;
			gap: 8px;
			background: none;
			box-shadow: none;
			color: var(--on-ground-2);
			font-weight: 700;
			font-size: 15px;
		}
		.more:hover {
			background: var(--chip-bg);
		}
		.more-l {
			display: inline;
		}
		.more svg {
			width: 16px;
			height: 16px;
		}
		.picker-place:not(.shared) .tw {
			white-space: normal;
		}
		.picker-place:not(.shared) .title {
			font-size: 50px;
			line-height: 1.02;
		}
	}
</style>
