<script lang="ts">
	// A round on screen, for solo games and rooms alike: the panorama, the HUD (round, score,
	// clock, hint, back to start), the compass, the hint banner, the red glow when time runs
	// low, and the guess map. The page drives it: it opens each round's panorama through
	// open(), starts the clock with the server's remaining time, and answers the buttons.
	import { onDestroy, type Snippet } from 'svelte';
	import type { Hint, LatLon, PanoView, Rules } from '#lib/api/client.js';
	import { createViewer, type PanoViewer } from '#lib/pano/index.js';
	import GuessMap from '#lib/map/GuessMap.svelte';
	import { LAYERS, savedLayer, saveLayer, type BBox, type Layer } from '#lib/map/map.js';
	import Compass from '#lib/components/Compass.svelte';
	import { compass, nextCompassStyle } from '#lib/compass.svelte.js';
	import { i18n, t, tx } from '#lib/i18n/index.svelte.js';
	import { fmtClock, fmtNum } from '#lib/format.js';
	import { showToast } from '#lib/toast.svelte.js';
	import { beep, unlockAudio, vibrate } from '#lib/sfx.js';

	/** opening: the panorama is loading; playing: look and guess; sending: the guess is on its
	 *  way; waiting: guessed, the others are still looking (rooms); off: a result is on top. */
	export type Status = 'opening' | 'playing' | 'sending' | 'waiting' | 'off';

	interface Props {
		rules: Rules;
		bbox: BBox;
		n: number | null;
		rounds: number; // 0 = endless
		dots: string[]; // a class per round: hi | mid | lo | now | ''
		total: number;
		hints: Hint[];
		hintsLeft: number;
		status: Status;
		guess: LatLon | null;
		guessLabel?: string; // the Guess button's words, when not the usual ones
		hud?: Snippet; // more chips after the clock (a room's players)
		onpick: (p: LatLon) => void;
		onguess: () => void;
		onhint: () => Promise<boolean>;
		ontimeup: () => void;
	}
	let {
		rules,
		bbox,
		n,
		rounds,
		dots,
		total,
		hints,
		hintsLeft,
		status,
		guess,
		guessLabel,
		hud,
		onpick,
		onguess,
		onhint,
		ontimeup
	}: Props = $props();

	let heading = $state(0);

	// the clock
	let deadlineAt = 0;
	let left = $state<number | null>(null); // seconds, null = no limit
	let ticker: ReturnType<typeof setInterval> | undefined;
	let warned = new Set<number>();
	let lastTick = 0;
	const WARN_AT = [15, 10];

	// layout
	let mapOpen = $state(false); // phones: the map is a sheet you open
	let mapPinned = $state(false); // computers: keep the map big
	// the player's map look, remembered on this device; hard rules (no map labels) are satellite only
	let chosenLayer = $state<Layer>(savedLayer());
	const layer = $derived<Layer>(!rules.mapLabels ? 'satellite' : chosenLayer);
	function chooseLayer(l: Layer) {
		chosenLayer = l;
		saveLayer(l);
	}
	let guessMap = $state<ReturnType<typeof GuessMap>>();

	// one viewer per provider, each in its own element; only the round's one is visible
	let panoRoot: HTMLDivElement;
	const viewers = new Map<string, { viewer: PanoViewer; el: HTMLDivElement }>();
	let activeProvider = '';

	const playing = $derived(status === 'playing');
	const hintCost = $derived(rules.hints.cost ?? 0);

	/** Opens a round's panorama; resolves with where a Yandex viewer landed. */
	export async function open(view: PanoView): Promise<{ pos: LatLon | null }> {
		mapOpen = false;
		guessMap?.fitArea();
		const v = await viewerFor(view.provider);
		return v.open(view);
	}

	async function viewerFor(provider: string): Promise<PanoViewer> {
		let v = viewers.get(provider);
		if (!v) {
			const el = document.createElement('div');
			el.className = 'pano-layer';
			panoRoot.appendChild(el);
			const viewer = await createViewer(provider, el, {
				lang: i18n.lang,
				labels: rules.panoLabels,
				movement: rules.movement,
				onHeading: (d) => (heading = d)
			});
			v = { viewer, el };
			viewers.set(provider, v);
		}
		for (const [p, x] of viewers) x.el.hidden = p !== provider;
		activeProvider = provider;
		return v.viewer;
	}

	function backToStart() {
		if (playing) viewers.get(activeProvider)?.viewer.reset();
	}

	export function closeMap() {
		mapOpen = false;
	}

	/** Starts the clock with the server's time left (undefined = no limit). */
	export function startTimer(remainingMs: number | undefined) {
		stopTimer();
		if (!rules.timeSec || remainingMs === undefined) {
			left = null;
			return;
		}
		deadlineAt = Date.now() + remainingMs;
		const startLeft = remainingMs / 1000;
		warned = new Set(WARN_AT.filter((w) => startLeft <= w)); // a reload below a warning skips it
		lastTick = 0;
		tickTimer();
		ticker = setInterval(tickTimer, 250);
	}

	function tickTimer() {
		left = Math.max((deadlineAt - Date.now()) / 1000, 0);
		const s = Math.ceil(left);
		// the warnings are for a player still looking; one who guessed only watches the clock
		if (playing) {
			const due = WARN_AT.filter((w) => s <= w && !warned.has(w));
			if (due.length) {
				due.forEach((w) => warned.add(w));
				showToast(`${t('secondsLeft', { n: s })}${guess ? '' : ` ${t('placePin')}`}`, 2500);
				beep(s <= 10 ? 990 : 740, 0.18);
				if (s <= 10) vibrate(150);
			} else if (s <= 5 && s > 0 && s !== lastTick) {
				beep(1200, 0.06);
			}
		}
		lastTick = s;
		if (left <= 0) {
			stopTimer();
			if (playing) {
				showToast(t('timeUp'));
				ontimeup(); // the pin placed so far counts
			}
		}
	}

	export function stopTimer() {
		clearInterval(ticker);
		ticker = undefined;
	}

	const danger = $derived(left !== null && playing && left <= WARN_AT[0]);
	const dangerLevel = $derived(left === null ? 0 : Math.min(Math.max(1 - left / WARN_AT[0], 0), 1));

	async function hint() {
		if (!playing || hintsLeft <= 0) return;
		if ((await onhint()) && window.innerWidth <= 700) mapOpen = true;
	}

	function guessNow() {
		if (!playing || !guess) return;
		mapOpen = false;
		onguess();
	}

	function cycleCompass() {
		const s = nextCompassStyle();
		showToast(t('compassTap', { name: t(`compass_${s}`) }), 1500);
	}

	function onKey(e: KeyboardEvent) {
		if ((e.target as HTMLElement).closest('input, textarea') || !playing) return;
		const k = e.key.toLowerCase();
		if (e.key === ' ' && guess) {
			e.preventDefault();
			guessNow();
		} else if (k === 'h') hint();
		else if (k === 'r') backToStart();
		else if (k === 'm') {
			if (window.innerWidth <= 700) mapOpen = !mapOpen;
			else mapPinned = !mapPinned;
		}
	}

	onDestroy(() => {
		stopTimer();
		for (const { viewer } of viewers.values()) viewer.destroy();
	});
</script>

<svelte:window onkeydown={onKey} onpointerdown={unlockAudio} />

<div class="pano" bind:this={panoRoot}></div>
{#if rules.movement === 'nmpz' && playing}
	<div class="freeze" aria-hidden="true"></div>
{/if}
<div
	class="danger"
	class:on={danger}
	class:fast={danger && (left ?? 99) <= 10}
	style:--danger={dangerLevel}
></div>

<div class="hud">
	<div class="group">
		<a class="logo" href="/" title={t('menu')}
			><img src="/mark.svg" alt="Shafaq Geo" width="30" height="30" /></a
		>
		<div class="chip">
			<span class="chip-label">{t('round')}</span>
			<span class="chip-value"
				>{n ?? 0}{#if rounds}&nbsp;/ {rounds}{/if}</span
			>
			{#if rounds}
				<span class="dots">
					{#each dots as d, i (i)}<i class={d}></i>{/each}
				</span>
			{/if}
		</div>
		<div class="chip">
			<span class="chip-label">{t('score')}</span>
			<span class="chip-value">{fmtNum(total)}</span>
		</div>
		{#if left !== null && status !== 'off'}
			<div
				class="chip timer"
				class:warn={playing && left <= 15 && left > 10}
				class:low={playing && left <= 10}
			>
				<span class="chip-label">{t('time')}</span>
				<span class="chip-value">{fmtClock(left)}</span>
			</div>
		{/if}
		{@render hud?.()}
	</div>
	<div class="group">
		{#if rules.hints.count > 0}
			<button
				class="hud-btn"
				onclick={hint}
				disabled={!playing || hintsLeft <= 0}
				title={t('hint')}
			>
				<svg class="icon" viewBox="0 0 24 24"
					><path
						d="M9 18h6M10 21.5h4M12 2.5a6.5 6.5 0 0 0-3.8 11.8V16.5h7.6v-2.2A6.5 6.5 0 0 0 12 2.5z"
					/></svg
				>
				<span class="label">{t('hint')}</span>
				{#if hintsLeft > 1}<span class="left">{hintsLeft}</span>{/if}
				<span class="tag" class:cost={hintCost > 0}
					>{hintCost > 0 ? `−${Math.round(hintCost * 100)}%` : t('hintFree')}</span
				>
			</button>
		{/if}
		{#if rules.movement !== 'nmpz'}
			<button class="hud-btn" onclick={backToStart} title={t('backToStart')}>
				<svg class="icon" viewBox="0 0 24 24"
					><path d="M3.5 12a8.5 8.5 0 1 0 2.8-6.3L3.5 8.3" /><path d="M3.5 3.5v4.8h4.8" /></svg
				>
				<span class="label">{t('backToStart')}</span>
			</button>
		{/if}
		<a class="hud-btn" href="/" title={t('menu')}>
			<svg class="icon" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
			<span class="label">{t('menu')}</span>
		</a>
	</div>
</div>

{#if hints.length && playing}
	{@const h = hints.at(-1)!}
	<div class="hint-banner" class:low={rules.compass && compass.style === 'modern'}>
		{h.kind === 'circle' ? t('hintCircle') : `${t(h.kind)}: ${tx(h.text)}`}
	</div>
{/if}

{#if rules.compass && (playing || status === 'waiting')}
	<button
		class="compass-spot {compass.style}"
		onclick={cycleCompass}
		title={t(`compass_${compass.style}`)}
		aria-label={t('compass')}
	>
		<Compass {heading} style={compass.style} />
	</button>
{/if}

<div class="minimap" class:open={mapOpen} class:pinned={mapPinned} class:hidden={status === 'off'}>
	<div class="map-toolbar">
		{#if rules.mapLabels}
			{#each LAYERS as l (l)}
				<button aria-pressed={layer === l} onclick={() => chooseLayer(l)}>{t(l)}</button>
			{/each}
		{:else}
			<span class="toolbar-note">{t('satellite')}</span>
		{/if}
		<button
			class="size-btn"
			aria-pressed={mapPinned}
			aria-label={t('bigMap')}
			title={t('bigMap')}
			onclick={() => (mapPinned = !mapPinned)}
		>
			<svg viewBox="0 0 24 24"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" /></svg>
		</button>
	</div>
	<div class="map-box">
		<GuessMap bind:this={guessMap} {bbox} {layer} {hints} {guess} active={playing} {onpick} />
	</div>
	<button class="btn btn-guess" disabled={!guess || !playing} onclick={guessNow}>
		{guessLabel ?? (guess ? t('guess') : t('placePin'))}
	</button>
</div>
{#if playing || status === 'waiting'}
	<button class="btn map-fab" onclick={() => (mapOpen = !mapOpen)}
		>{mapOpen ? '✕' : t('map')}</button
	>
{/if}

<style>
	.pano,
	.pano :global(.pano-layer) {
		position: absolute;
		inset: 0;
	}
	/* hide the Yandex address line and "open in Yandex Maps": they give the answer away */
	.pano :global([class*='panorama-gotoymaps']),
	.pano :global([class*='panorama-control__name']),
	.pano :global([class*='panorama-control__close']),
	.pano :global([class*='panorama-control__fullscreen']) {
		display: none !important;
	}
	.freeze {
		position: absolute;
		inset: 0;
		z-index: 10;
	}

	/* low time: red creeps in from the edges, like low health in a game */
	.danger {
		position: fixed;
		inset: 0;
		z-index: 999;
		pointer-events: none;
		opacity: 0;
		transition: opacity 0.5s;
	}
	.danger::after {
		content: '';
		position: absolute;
		inset: 0;
		background: radial-gradient(
			ellipse at center,
			transparent 50%,
			rgba(206, 17, 38, 0.35) 78%,
			rgba(150, 0, 20, 0.75) 100%
		);
		box-shadow: inset 0 0 140px rgba(206, 17, 38, 0.55);
		animation: heartbeat 1.1s ease-in-out infinite;
	}
	.danger.on {
		opacity: calc(0.45 + 0.55 * var(--danger, 0));
	}
	.danger.fast::after {
		animation-duration: 0.6s;
	}
	@keyframes heartbeat {
		0%,
		100% {
			opacity: 0.55;
		}
		50% {
			opacity: 1;
		}
	}

	/* HUD */
	.hud {
		position: fixed;
		top: max(14px, env(safe-area-inset-top));
		left: 14px;
		right: 14px;
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 10px;
		pointer-events: none;
		z-index: 1000;
	}
	.group {
		display: flex;
		gap: 8px;
		align-items: stretch;
		flex-wrap: wrap;
		pointer-events: auto;
	}
	.logo,
	.chip,
	.hud-btn,
	.group :global(.chip) {
		background: var(--hud);
		color: #fff;
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		border-radius: 14px;
	}
	.logo {
		display: grid;
		place-items: center;
		width: 52px;
	}
	.chip,
	.group :global(.chip) {
		padding: 7px 14px;
		display: flex;
		flex-direction: column;
		justify-content: center;
		min-width: 74px;
	}
	.chip-label,
	.group :global(.chip-label) {
		font-size: 10.5px;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		opacity: 0.65;
	}
	.chip-value,
	.group :global(.chip-value) {
		font-family: var(--display);
		font-weight: 700;
		font-size: 18px;
		line-height: 1.25;
		font-variant-numeric: tabular-nums;
	}
	.timer.warn .chip-value {
		color: #ffc94d;
	}
	.timer.low .chip-value {
		color: #ff7a8a;
	}
	.timer.warn {
		animation: pulse 1s ease-in-out infinite;
	}
	.timer.low {
		animation: pulse 0.5s ease-in-out infinite alternate;
		box-shadow: 0 0 0 2px rgba(206, 17, 38, 0.6);
	}
	@keyframes pulse {
		50% {
			transform: scale(1.08);
		}
	}
	.dots {
		display: flex;
		gap: 4px;
		margin-top: 4px;
	}
	.dots i {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.22);
	}
	.dots i.now {
		background: #fff;
	}
	.dots i.hi {
		background: #36c853;
	}
	.dots i.mid {
		background: #e0b44e;
	}
	.dots i.lo {
		background: #f04157;
	}
	.hud-btn {
		height: 48px;
		border: none;
		padding: 0 15px;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		font-size: 14px;
		font-weight: 500;
		text-decoration: none;
		align-self: flex-start;
	}
	.hud-btn:hover:not(:disabled) {
		background: rgba(12, 20, 36, 0.95);
	}
	.hud-btn:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.hud-btn .tag {
		font-size: 11px;
		font-weight: 600;
		padding: 2px 7px;
		border-radius: 7px;
		background: #1eb53a;
	}
	.hud-btn .tag.cost {
		background: #ce1126;
	}
	.hud-btn .left {
		font-family: var(--display);
		font-size: 13px;
		opacity: 0.8;
	}
	.hint-banner {
		position: fixed;
		top: 84px;
		left: 50%;
		transform: translateX(-50%);
		background: var(--sky);
		color: #fff;
		padding: 10px 18px;
		border-radius: 12px;
		font-weight: 600;
		box-shadow: var(--shadow);
		z-index: 1000;
		white-space: nowrap;
	}
	/* under the HUD: the bottom corners belong to the viewers' own controls. The strip sits
	   in the middle, where the eye already is; the hint goes under it. */
	.compass-spot {
		position: fixed;
		left: 14px;
		top: 92px;
		z-index: 1000;
		padding: 0;
		border: none;
		background: none;
		border-radius: 50%;
	}
	.compass-spot.modern {
		left: 50%;
		top: 84px;
		transform: translateX(-50%);
		border-radius: 10px;
	}
	.hint-banner.low {
		top: 128px;
	}

	/* the guess map */
	.minimap {
		position: fixed;
		right: 16px;
		bottom: 16px;
		z-index: 1000;
		width: 340px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		transition: width 0.25s;
	}
	.minimap.hidden {
		visibility: hidden;
	}
	.minimap:not(.pinned) {
		opacity: 0.88;
	}
	.minimap:hover,
	.minimap.pinned {
		opacity: 1;
		width: min(580px, calc(100vw - 32px));
	}
	/* v0's toolbar: the map's look, and keep it big */
	.map-toolbar {
		display: flex;
		gap: 6px;
	}
	.map-toolbar button,
	.toolbar-note {
		flex: 1;
		height: 34px;
		border: none;
		border-radius: 10px;
		background: var(--hud);
		color: #fff;
		font-size: 13px;
		font-weight: 500;
		display: grid;
		place-items: center;
	}
	.map-toolbar button[aria-pressed='true'] {
		background: var(--sky);
	}
	.map-toolbar .size-btn {
		flex: 0 0 34px;
	}
	.size-btn svg {
		width: 15px;
		height: 15px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2.2;
		stroke-linecap: round;
	}
	.map-box {
		height: 250px;
		border-radius: 14px;
		overflow: hidden;
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
		transition: height 0.25s;
		background: #dfe3e0;
	}
	.minimap:hover .map-box,
	.minimap.pinned .map-box {
		height: min(430px, calc(100vh - 230px));
	}
	.btn-guess {
		width: 100%;
		background: var(--green);
		color: #fff;
	}
	.btn-guess:hover:not(:disabled) {
		background: var(--green-ink);
	}
	.btn-guess:disabled {
		background: var(--hud);
		opacity: 1;
		color: rgba(255, 255, 255, 0.75);
		font-family: var(--body);
		font-weight: 500;
	}
	.map-fab {
		display: none;
	}

	@media (max-width: 700px) {
		.hud {
			top: max(10px, env(safe-area-inset-top));
			left: 10px;
			right: 10px;
		}
		.logo {
			display: none;
		}
		.chip,
		.group :global(.chip) {
			padding: 6px 10px;
			min-width: 0;
		}
		.chip-value,
		.group :global(.chip-value) {
			font-size: 16px;
		}
		.hud-btn {
			height: 44px;
			padding: 0 12px;
		}
		.hud-btn .label {
			display: none;
		}
		.hint-banner {
			top: 76px;
			white-space: normal;
			max-width: calc(100vw - 32px);
		}
		.compass-spot {
			top: 140px;
			left: 10px;
		}
		.compass-spot.modern {
			left: 50%;
			top: 72px;
			transform: translateX(-50%) scale(0.82); /* clear of the map's close button */
		}
		.hint-banner.low {
			top: 116px;
		}
		.minimap {
			left: 10px;
			right: 10px;
			bottom: 10px;
			width: auto;
			opacity: 1;
			visibility: hidden;
		}
		.minimap.open {
			visibility: visible;
		}
		.minimap:hover,
		.minimap.pinned {
			width: auto;
		}
		.map-box,
		.minimap:hover .map-box,
		.minimap.pinned .map-box {
			height: 55vh;
		}
		.map-toolbar .size-btn {
			display: none;
		}
		.map-fab {
			display: inline-flex;
			position: fixed;
			right: 14px;
			bottom: max(14px, env(safe-area-inset-bottom));
			z-index: 1001;
			height: 56px;
			background: var(--sky);
			color: #fff;
			box-shadow: var(--shadow);
		}
		.minimap.open ~ .map-fab {
			bottom: auto;
			top: 70px;
		}
	}
</style>
