<script lang="ts">
	// A round on screen, for solo games and rooms alike. The panorama is the playfield; on top
	// of it only: one status pill (round and score), the clock when there is one (a room's
	// rides in its players' chip), a pause button (a menu in a room: a room never pauses), the
	// hint and "back to start" under the right thumb, and one big button at the bottom that
	// opens the guess map. On a phone the map slides up as a sheet; on a computer
	// it sits small in the corner and grows under the mouse. A first-time player is shown
	// what to do (look around, open the map, tap it) instead of being told.
	// The page drives it: it opens each round's panorama through open(), starts the clock
	// with the server's remaining time, and answers the buttons.
	import { onDestroy, type Snippet } from 'svelte';
	import type { Hint, LatLon, PanoView, Rules } from '#lib/api/client.js';
	import { createViewer, type PanoViewer } from '#lib/pano/index.js';
	import GuessMap from '#lib/map/GuessMap.svelte';
	import { LAYERS, savedLayer, saveLayer, type BBox, type Layer } from '#lib/map/map.js';
	import Compass from '#lib/components/Compass.svelte';
	import ChoiceTiles from '#lib/components/ChoiceTiles.svelte';
	import PlaceInParent from '#lib/maps/PlaceInParent.svelte';
	import Sheet from '#lib/components/Sheet.svelte';
	import { compass } from '#lib/compass.svelte.js';
	import { i18n, t, tx, type Key } from '#lib/i18n/index.svelte.js';
	import { fmtClock, fmtNum } from '#lib/format.js';
	import { showToast } from '#lib/toast.svelte.js';
	import { load, save } from '#lib/storage.js';
	import { beep, sfxGuess, sfxPin, unlockAudio, vibrate } from '#lib/sfx.svelte.js';

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
		hud?: Snippet<[Snippet | null]>; // more chips next to the status pill (a room's players), given the clock to carry
		onpick: (p: LatLon) => void;
		onguess: () => void;
		onhint: () => Promise<boolean>;
		ontimeup: () => void;
		onleave?: () => void; // a room: the menu's way out, and no "pause" (a room never pauses)
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
		ontimeup,
		onleave
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
	let menuOpen = $state(false);
	let chosenLayer = $state<Layer>(savedLayer());
	// hard rules (no map labels) are satellite only
	const layer = $derived<Layer>(!rules.mapLabels ? 'satellite' : chosenLayer);
	function nextLayer() {
		chosenLayer = LAYERS[(LAYERS.indexOf(chosenLayer) + 1) % LAYERS.length];
		saveLayer(chosenLayer);
	}
	let guessMap = $state<ReturnType<typeof GuessMap>>();

	// one viewer per provider, each in its own element; only the round's one is visible
	let panoRoot: HTMLDivElement;
	const viewers = new Map<string, { viewer: PanoViewer; el: HTMLDivElement }>();
	let activeProvider = '';

	const playing = $derived(status === 'playing');
	const hintCost = $derived(rules.hints.cost ?? 0);
	// the game has a compass; the player may still hide it for this game from the menu
	let compassOff = $state(false);
	const showCompass = $derived(rules.compass && !compassOff);
	const guessed = $derived(status === 'sending' || status === 'waiting');

	// ---------- the first game: show, don't tell ----------
	// look: a finger swipes over the street; map: the big button breathes; pin: the map
	// shows where to tap. Once the first guess is in, never again on this device.
	type Coach = 'look' | 'map' | 'pin' | '';
	let coach = $state<Coach>(load('coach_done', '') ? '' : 'look');
	let lookFrom: number | null = null;
	let coachTimer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		if (coach !== 'look' || !playing) return;
		lookFrom = null;
		coachTimer = setTimeout(() => coach === 'look' && toMapStep(), 7000);
		return () => clearTimeout(coachTimer);
	});
	function looked(d: number) {
		if (coach !== 'look' || !playing) return;
		lookFrom ??= d;
		const turn = Math.abs(((d - lookFrom + 540) % 360) - 180);
		if (turn > 25) toMapStep();
	}
	// on a phone the next step is the big button; on a computer the map is already in sight
	const toMapStep = () => (coach = window.innerWidth <= 760 ? 'map' : 'pin');
	function coachDone() {
		if (!coach) return;
		coach = '';
		save('coach_done', '1');
	}

	// ---------- each round opens with its number ----------
	// a plaque that pops in and leaves by itself: a beat, not a wall in front of the street
	const INTRO_MS = 1300;
	let intro = $state<number | null>(null);
	let introFor = -1;
	let introTimer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		if (!playing || n == null || n === introFor) return;
		introFor = n;
		intro = n;
		clearTimeout(introTimer);
		introTimer = setTimeout(() => (intro = null), INTRO_MS);
	});

	/** Opens a round's panorama; resolves with where a Yandex viewer landed. */
	export async function open(view: PanoView): Promise<{ pos: LatLon | null }> {
		mapOpen = false;
		menuOpen = false;
		startTimer(undefined); // the last round's clock goes; the page starts this one's
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
				onHeading: (d) => {
					heading = d;
					looked(d);
				}
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

	// the phone's sheet has finished sliding up: the map measures its box again and frames the
	// area (its own box's growing on a laptop is the map's own ResizeObserver's)
	function sheetUp(e: TransitionEvent) {
		if (e.target === e.currentTarget && e.propertyName === 'transform' && mapOpen)
			guessMap?.refit();
	}

	function openMap() {
		mapOpen = true;
		if (!guess && !hints.length) guessMap?.fitArea(); // the whole area, sized to the sheet
		if (coach === 'look' || coach === 'map') coach = 'pin';
	}

	/** Starts the clock with the server's time left (undefined = no limit). A room with no
	 *  limit still sends one after the first guess: the others' 45 s. */
	export function startTimer(remainingMs: number | undefined) {
		stopTimer();
		if (remainingMs === undefined) {
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

	const clockOn = $derived(left !== null && status !== 'off');
	// a room's phone has no space for ten dots beside the players' chip: "3/10 raund" instead
	const many = $derived(!!hud && rounds > 5 && rounds <= 20);
	const danger = $derived(left !== null && playing && left <= WARN_AT[0]);
	const dangerLevel = $derived(left === null ? 0 : Math.min(Math.max(1 - left / WARN_AT[0], 0), 1));

	async function hint() {
		if (!playing || hintsLeft <= 0) return;
		if ((await onhint()) && window.innerWidth <= 760) mapOpen = true;
	}

	function pick(p: LatLon) {
		if (!playing) return;
		if (!guess) vibrate(12);
		sfxPin();
		onpick(p);
		if (coach) coach = 'pin';
	}

	function guessNow() {
		if (!playing || !guess) return;
		mapOpen = false;
		sfxGuess();
		coachDone();
		onguess();
	}

	function onKey(e: KeyboardEvent) {
		if ((e.target as HTMLElement).closest('input, textarea') || !playing || menuOpen) return;
		const k = e.key.toLowerCase();
		if (e.key === ' ' && guess) {
			e.preventDefault();
			guessNow();
		} else if (k === 'h') hint();
		else if (k === 'r') backToStart();
		else if (k === 'm') {
			if (window.innerWidth <= 760) mapOpen = !mapOpen;
			else mapPinned = !mapPinned;
		} else if (e.key === 'Escape' && mapOpen) mapOpen = false;
	}

	const layerKey = (l: Layer): Key => l;

	// the big key's words, by length: "Отметить на карте" shrinks a little to stay on one line
	// at 360 px instead of wrapping (the CSS turns the length into a size)
	const openLabel = $derived(guessed ? (guessLabel ?? t('sending')) : t('openMapGuess'));

	onDestroy(() => {
		stopTimer();
		clearTimeout(introTimer);
		clearTimeout(coachTimer);
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

<!-- top: status on the left, the clock (a room's rides in its players' chip), pause (a room's
     menu) on the right; all of them small dark capsules, so the street keeps the screen -->
<div class="hud" class:hide={status === 'off'}>
	<div class="hud-left">
		<div class="status cap" class:many>
			<div class="st-round">
				<span class="st-n d"
					>{n ?? 0}{#if rounds}<small>/{rounds}</small>{/if}</span
				>
				{#if rounds && rounds <= 20}
					<span class="dots" aria-hidden="true">
						{#each dots as d, i (i)}<i class={d}></i>{/each}
					</span>
				{/if}
				{#if !rounds || rounds > 20 || many}
					<span class="st-label round-word">{t('round').toLowerCase()}</span>
				{/if}
			</div>
			<div class="st-score">
				<span class="st-n d">{fmtNum(total)}</span>
				<span class="st-label">{t('points')}</span>
			</div>
		</div>
		{@render hud?.(clockOn ? chipClock : null)}
	</div>

	{#if clockOn && left !== null && !hud}
		<div class="clock-spot">
			<div
				class="clock cap"
				class:warn={playing && left <= 15 && left > 10}
				class:low={playing && left <= 10}
				role="timer"
			>
				<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"
					><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2M9.5 2.5h5" /></svg
				>
				<span class="d">{fmtClock(left)}</span>
			</div>
		</div>
	{/if}

	<button
		class="round-btn pause cap"
		onclick={() => (menuOpen = true)}
		aria-label={onleave ? t('menu') : t('pause')}
	>
		<svg viewBox="0 0 24 24" class="icon"
			>{#if onleave}<path d="M4.5 7h15M4.5 12h15M4.5 17h15" />{:else}<path
					d="M9 6v12M15 6v12"
				/>{/if}</svg
		>
	</button>
</div>

<!-- a room's clock, carried in its players' chip: "👥 1/2 · 0:45" -->
{#snippet chipClock()}
	{#if left !== null}
		<span
			class="chip-clock"
			class:warn={playing && left <= 15 && left > 10}
			class:low={playing && left <= 10}
			role="timer"
		>
			<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"
				><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2M9.5 2.5h5" /></svg
			><span class="d">{fmtClock(left)}</span>
		</span>
	{/if}
{/snippet}

<!-- the round's opener: a leaning plaque with a gold line -->
{#if intro !== null}
	<div class="intro" aria-live="polite" style:--intro-ms={`${INTRO_MS}ms`}>
		<div class="plaque">
			<span class="intro-n d">{t('roundN', { n: intro })}</span>
			<span class="intro-q d">{t('whereAreYou')}</span>
		</div>
	</div>
{/if}

{#if hints.length && playing}
	{@const h = hints.at(-1)!}
	<div class="hint-cap cap" class:low={showCompass && compass.style === 'modern'}>
		<!-- a named place shows its face (the gold rim already says it's the hint); a circle,
		     which names nothing, keeps the bulb -->
		{#if h.place}
			<span class="hint-face"><PlaceInParent place={h.place} /></span>
		{:else}
			<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"
				><path
					d="M9 18h6M10 21.5h4M12 2.5a6.5 6.5 0 0 0-3.8 11.8V16.5h7.6v-2.2A6.5 6.5 0 0 0 12 2.5z"
				/></svg
			>
		{/if}
		<!-- the place's own name says what it is: "Yashnobod tumani", not "Tuman: Yashnobod tumani" -->
		<span>{h.kind === 'circle' ? t('hintCircle') : tx(h.text)}</span>
	</div>
{/if}

{#if showCompass && (playing || status === 'waiting')}
	<div class="compass-spot {compass.style}" aria-label={t('compass')}>
		<Compass {heading} style={compass.style} />
	</div>
{/if}

<!-- the first game: a finger shows how to look around -->
{#if coach === 'look' && playing && intro === null}
	<div class="coach-look" aria-live="polite">
		<span class="finger" aria-hidden="true">👆</span>
		<span class="coach-text cap">{t('coachLook')}</span>
	</div>
{/if}

<!-- under the right thumb: the hint and back to start -->
{#if playing || status === 'waiting'}
	<div class="rail" class:lifted={mapOpen}>
		{#if rules.hints.count > 0}
			<button
				class="round-btn hint cap"
				onclick={hint}
				disabled={!playing || hintsLeft <= 0}
				aria-label={t('hint')}
				title={`${t('hint')} (H)`}
			>
				<svg class="icon" viewBox="0 0 24 24"
					><path
						d="M9 18h6M10 21.5h4M12 2.5a6.5 6.5 0 0 0-3.8 11.8V16.5h7.6v-2.2A6.5 6.5 0 0 0 12 2.5z"
					/></svg
				>
				{#if hintsLeft > 0}<span class="badge d">{hintsLeft}</span>{/if}
				{#if hintCost > 0 && hintsLeft > 0}<span class="cost d">−{Math.round(hintCost * 100)}%</span
					>{/if}
			</button>
		{/if}
		{#if rules.movement !== 'nmpz'}
			<button
				class="round-btn cap"
				onclick={backToStart}
				disabled={!playing}
				aria-label={t('backToStart')}
				title={`${t('backToStart')} (R)`}
			>
				<svg class="icon" viewBox="0 0 24 24"
					><path d="M3.5 12a8.5 8.5 0 1 0 2.8-6.3L3.5 8.3" /><path d="M3.5 3.5v4.8h4.8" /></svg
				>
			</button>
		{/if}
	</div>
{/if}

<!-- phones: the one key at the bottom; the map comes up from it -->
{#if (playing || guessed) && !mapOpen}
	<div class="bottom">
		{#if guess && playing}
			<button class="btn reopen" onclick={openMap} aria-label={t('map')}>
				<svg viewBox="0 0 24 24"
					><path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20z" /><path
						d="M9 4v13.5M15 6.5V20"
					/></svg
				>
			</button>
			<button class="btn btn-primary go" onclick={guessNow} style:--n={t('guess').length}>
				<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
				<span class="label">{t('guess')}</span>
			</button>
		{:else}
			<button
				class="btn btn-primary go open-map"
				class:breathe={coach === 'map'}
				class:waiting={guessed}
				onclick={openMap}
				disabled={!playing && !guessed}
				style:--n={openLabel.length}
			>
				{#if guessed}
					{#if status === 'sending'}<span class="spinner"></span>{/if}
				{:else}
					<svg viewBox="0 0 24 24"
						><path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z" /><circle
							cx="12"
							cy="10"
							r="2.3"
						/></svg
					>
				{/if}
				<span class="label">{openLabel}</span>
			</button>
		{/if}
	</div>
	{#if coach === 'map' && playing}
		<div class="coach-map" aria-live="polite">{t('coachMap')}</div>
	{/if}
{/if}

{#if mapOpen}
	<button class="scrim" aria-label={t('close')} onclick={() => (mapOpen = false)}></button>
{/if}

<!-- the guess map: a sheet from the bottom on a phone, a small map in the corner on a computer -->
<div
	class="minimap"
	class:open={mapOpen}
	class:pinned={mapPinned}
	class:hidden={status === 'off'}
	role="region"
	aria-label={t('map')}
	ontransitionend={sheetUp}
>
	<i class="grab-bar" aria-hidden="true"></i>
	<div class="map-head">
		<button class="grab" onclick={() => (mapOpen = false)} aria-label={t('close')}>
			<svg viewBox="0 0 24 24" class="icon"><path d="m6 9 6 6 6-6" /></svg>
		</button>
		<span class="map-title d">{t('whereAreYou')}</span>
		{#if rules.mapLabels}
			<button class="layer-btn" onclick={nextLayer} title={t('mapLook')}>
				<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"
					><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 13 9 5 9-5" /></svg
				>
				<span>{t(layerKey(layer))}</span>
			</button>
		{:else}
			<span class="layer-btn static">{t('satellite')}</span>
		{/if}
		<button
			class="size-btn"
			aria-pressed={mapPinned}
			aria-label={t('bigMap')}
			title={`${t('bigMap')} (M)`}
			onclick={() => (mapPinned = !mapPinned)}
		>
			<svg viewBox="0 0 24 24" class="icon"
				>{#if mapPinned}<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" />{:else}<path
						d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"
					/>{/if}</svg
			>
		</button>
	</div>
	<div class="map-box">
		<GuessMap bind:this={guessMap} {bbox} {layer} {hints} {guess} active={playing} onpick={pick} />
		{#if coach === 'pin' && !guess && playing}
			<div class="coach-pin" aria-hidden="true"><i></i><span>{t('coachPin')}</span></div>
		{/if}
	</div>
	<button class="btn btn-primary btn-guess" disabled={!guess || !playing} onclick={guessNow}>
		{#if guessLabel && !playing}
			<span class="label">{guessLabel}</span>
		{:else if guess}
			<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
			<span class="label">{t('guess')}</span>
		{:else}
			<svg viewBox="0 0 24 24" class="tap"
				><path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z" /><circle
					cx="12"
					cy="10"
					r="2.3"
				/></svg
			>
			<span class="label">{t('tapTheMap')}</span>
		{/if}
	</button>
</div>

<Sheet open={menuOpen} onclose={() => (menuOpen = false)} title={onleave ? t('menu') : t('pause')}>
	<div class="menu">
		{#if !onleave}
			<button class="btn btn-primary" onclick={() => (menuOpen = false)}>
				<svg viewBox="0 0 24 24"><path d="M7 4.5v15l12-7.5z" /></svg>
				<span class="lbl">{t('resume')}</span>
			</button>
		{/if}
		{#if rules.compass}
			<div class="menu-row">
				<span class="field-label">{t('compass')}</span>
				<!-- the same pictures as Sozlamalar; "Yo‘q" hides it for this game -->
				<ChoiceTiles kind="compass" small none bind:off={compassOff} />
			</div>
		{/if}
		<div class="menu-row">
			<span class="field-label">{t('sound')}</span>
			<ChoiceTiles kind="sound" small />
		</div>
		{#if onleave}
			<button class="btn btn-ghost" onclick={onleave}><span class="lbl">{t('leave')}</span></button>
		{:else}
			<p class="keys">{t('keys')}</p>
			<a class="btn btn-ghost" href="/"><span class="lbl">{t('leaveGame')}</span></a>
		{/if}
	</div>
</Sheet>

<style>
	/* The round in the new look (P1111 1.1). The capsules carry no backdrop blur: the panorama
	   is a live canvas and blur costs frames on cheap phones, so their solid lapis does the work. */
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
	/* the test panoramas' viewer (demo, never a player's) without its toolbar strip: the round
	   looks as it does on Yandex */
	.pano :global(.psv-navbar) {
		display: none !important;
	}
	.freeze {
		position: absolute;
		inset: 0;
		z-index: 10;
	}

	/* ---------- low time: the screen's edges glow red and beat, like low health ---------- */
	.danger {
		position: fixed;
		inset: 0;
		z-index: 999; /* under the HUD and the keys: the glow frames them, never muddies them */
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
			transparent 64%,
			color-mix(in srgb, var(--red) 22%, transparent) 86%,
			color-mix(in srgb, var(--red) 55%, transparent) 100%
		);
		box-shadow:
			inset 0 0 90px 18px var(--red-glow),
			inset 0 0 0 3px color-mix(in srgb, var(--red) 55%, transparent);
		animation: breath 1.2s ease-in-out infinite;
	}
	.danger.on {
		opacity: calc(0.45 + 0.55 * var(--danger, 0));
	}
	/* ten seconds and under: a heartbeat, two quick beats and a rest */
	.danger.fast::after {
		animation: heart 1s ease-out infinite;
	}
	@keyframes breath {
		0%,
		100% {
			opacity: 0.55;
		}
		50% {
			opacity: 1;
		}
	}
	@keyframes heart {
		0%,
		45%,
		100% {
			opacity: 0.5;
		}
		10% {
			opacity: 1;
		}
		22% {
			opacity: 0.7;
		}
		32% {
			opacity: 1;
		}
	}

	/* ---------- the HUD ---------- */
	.hud {
		position: fixed;
		top: max(12px, env(safe-area-inset-top));
		left: 12px;
		right: 12px;
		display: flex;
		align-items: flex-start;
		gap: 10px;
		pointer-events: none;
		z-index: 1000;
		transition: opacity 0.2s;
	}
	.hud.hide {
		opacity: 0;
	}
	.hud > * {
		pointer-events: auto;
	}
	.hud-left {
		display: flex;
		gap: 8px;
		align-items: stretch;
		flex-wrap: wrap;
		min-width: 0;
		pointer-events: none;
	}
	.hud-left > :global(*) {
		pointer-events: auto;
	}

	/* the status: the round with its dots | the score */
	.status {
		display: flex;
		align-items: stretch;
		border-radius: var(--r-m);
		padding: 8px 2px 9px;
	}
	.status > div {
		display: flex;
		flex-direction: column;
		justify-content: center;
		padding: 0 12px;
		min-width: 0;
	}
	.st-round {
		border-right: 1px solid var(--cap-line);
		box-shadow: 1px 0 0 var(--cap-line);
	}
	.st-n {
		font-size: 26px;
		line-height: 1;
		color: var(--cap-ink);
		text-shadow: 0 2px 0 var(--cap-lip);
		white-space: nowrap;
	}
	.st-n small {
		font-size: 16px;
		color: var(--cap-ink-2);
		margin-left: 1px;
	}
	.st-label {
		margin-top: 4px;
		font-size: 12px;
		font-weight: 600;
		line-height: 1;
		color: var(--cap-ink-2);
	}
	.dots {
		display: flex;
		gap: 4px;
		margin-top: 7px;
		flex-wrap: wrap;
		max-width: 116px; /* ten dots a row: twenty rounds stay two rows, clear of the compass */
	}
	.dots i {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.22);
	}
	/* the round being played: gold, with a soft ring that breathes */
	.dots i.now {
		background: var(--gold);
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--gold) 35%, transparent);
		animation: now 1.6s ease-in-out infinite;
	}
	@keyframes now {
		50% {
			box-shadow: 0 0 0 3.5px color-mix(in srgb, var(--gold) 25%, transparent);
		}
	}
	/* a round played, by how it went: the result's own colours */
	.dots i.hi {
		background: var(--key-hi);
	}
	.dots i.mid {
		background: var(--gold-lo);
	}
	.dots i.lo {
		background: var(--red);
	}
	.many .round-word {
		display: none;
	}

	/* a room's players' chip, given through the hud snippet: a capsule like the status (the
	   room page gives it .chip, which the new look draws as glass on the ground: this wins) */
	.hud .hud-left :global(.chip) {
		border-radius: var(--r-m);
		padding: 0 14px;
		display: flex;
		align-items: center;
		gap: 8px;
		background: var(--cap-bg);
		color: var(--cap-ink);
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.16),
			inset 0 0 0 1px var(--cap-line),
			0 3px 0 var(--cap-lip),
			0 10px 20px rgba(0, 0, 0, 0.25);
		overflow: hidden;
	}
	.hud .hud-left :global(.chip > .icon) {
		color: var(--cap-ink-2);
		opacity: 1;
	}
	.hud .hud-left :global(.chip-value) {
		display: inline-block;
		font-family: var(--f-disp);
		font-weight: 900;
		transform: var(--lean);
		font-size: 22px;
		font-variant-numeric: tabular-nums;
		text-shadow: 0 2px 0 var(--cap-lip);
	}

	/* in a room's chip the clock fills the chip's right end, so its gold and red are the clock's */
	.chip-clock {
		align-self: stretch;
		display: flex;
		align-items: center;
		gap: 6px;
		margin: 0 -14px 0 2px;
		padding: 0 14px 0 12px;
		border-left: 1px solid var(--cap-line);
		font-size: 22px;
		text-shadow: 0 2px 0 var(--cap-lip);
		transition: background 0.3s;
	}
	.chip-clock .icon {
		width: 18px;
		height: 18px;
		stroke-width: 2.6;
		color: var(--cap-ink-2);
	}

	/* the clock: white, then gold at 15 s, then red and beating at 10 s */
	.clock-spot {
		position: absolute;
		left: 50%;
		top: 0;
		transform: translateX(-50%);
	}
	.clock {
		display: flex;
		align-items: center;
		gap: 8px;
		height: 52px;
		padding: 0 20px 0 16px;
		border-radius: 999px;
		font-size: 30px;
		text-shadow: 0 2px 0 var(--cap-lip);
		transition: background 0.3s;
	}
	.clock .icon {
		width: 20px;
		height: 20px;
		stroke-width: 2.6;
		color: var(--cap-ink-2);
	}
	.clock.warn,
	.chip-clock.warn {
		background: linear-gradient(180deg, var(--gold-hi), var(--gold));
		color: var(--gold-ink);
		text-shadow: 0 1px 0 rgba(255, 255, 255, 0.4);
	}
	.clock.warn {
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.6),
			0 3px 0 var(--gold-lo),
			0 10px 20px rgba(0, 0, 0, 0.25);
	}
	.clock.warn .icon,
	.chip-clock.warn .icon {
		color: var(--gold-ink);
	}
	.clock.low,
	.chip-clock.low {
		background: linear-gradient(180deg, #f2384a, #b5101f);
		color: #fff;
		text-shadow: 0 2px 0 rgba(70, 0, 10, 0.6);
	}
	.clock.low {
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.3),
			0 3px 0 #6e0612,
			0 0 30px var(--red-glow);
		animation: beat 1s var(--spring) infinite;
	}
	.clock.low .icon,
	.chip-clock.low .icon {
		color: #fff;
	}
	.chip-clock.low {
		animation: flash 1s ease-out infinite;
	}
	@keyframes beat {
		0%,
		45%,
		100% {
			transform: scale(1);
		}
		10% {
			transform: scale(1.1);
		}
		22% {
			transform: scale(1.02);
		}
		32% {
			transform: scale(1.08);
		}
	}
	@keyframes flash {
		10%,
		32% {
			filter: brightness(1.35);
		}
	}

	/* the HUD's square and round keys: capsules with a lip that go down when pressed */
	.round-btn {
		position: relative;
		width: 56px;
		height: 56px;
		border: none;
		border-radius: var(--r-m);
		display: grid;
		place-items: center;
		transition:
			transform 0.1s var(--out),
			box-shadow 0.1s var(--out),
			opacity 0.15s;
	}
	.round-btn .icon {
		width: 26px;
		height: 26px;
		stroke-width: 2.5;
	}
	.round-btn:active:not(:disabled) {
		transform: translateY(3px);
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.16),
			inset 0 0 0 1px var(--cap-line),
			0 0 0 var(--cap-lip),
			0 4px 10px rgba(0, 0, 0, 0.25);
	}
	.round-btn:disabled {
		cursor: default;
	}
	.round-btn:disabled .icon {
		opacity: 0.4;
	}
	.pause {
		margin-left: auto;
		width: 52px;
		height: 52px;
		border-radius: 50%;
	}
	.pause .icon {
		width: 22px;
		height: 22px;
		stroke-width: 3;
	}
	/* the hint: a gold bulb, how many are left on a gold badge, its price under it */
	.round-btn.hint .icon {
		color: var(--gold);
		fill: color-mix(in srgb, var(--gold) 22%, transparent);
	}
	.round-btn.hint:disabled {
		opacity: 0.6;
	}
	.round-btn.hint:disabled .icon {
		color: var(--cap-ink-2);
		fill: none;
	}
	.badge,
	.cost {
		position: absolute;
		display: grid;
		place-items: center;
		color: var(--gold-ink);
		background: linear-gradient(180deg, var(--gold-hi), var(--gold));
		box-shadow:
			0 2px 0 var(--gold-lo),
			0 0 0 2px var(--ring-deep);
		white-space: nowrap;
	}
	.badge {
		transform: none; /* a round badge stays round */
		top: -7px;
		right: -7px;
		min-width: 24px;
		height: 24px;
		padding: 0 6px;
		border-radius: 12px;
		font-size: 14px;
	}
	.cost {
		bottom: -9px;
		left: 50%;
		transform: translateX(-50%);
		height: 20px;
		padding: 0 6px;
		border-radius: 8px;
		font-size: 12px;
	}

	/* ---------- the round's opener: a slanted plaque that pops in and goes by itself ---------- */
	.intro {
		position: fixed;
		left: 0;
		right: 0;
		top: 34%;
		z-index: 1001;
		display: flex;
		justify-content: center;
		pointer-events: none;
		animation: intro var(--intro-ms, 1.3s) linear both;
	}
	.plaque {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		padding: 14px 34px 16px;
		border-radius: 12px;
		transform: var(--lean); /* its words lean with it */
		background: linear-gradient(180deg, var(--plaque-a), var(--plaque-b));
		box-shadow:
			inset 0 2px 0 rgba(255, 255, 255, 0.18),
			inset 0 -3px 0 rgba(0, 0, 0, 0.25),
			0 0 0 2px var(--gold),
			0 0 0 5px var(--cap-bg),
			0 6px 0 3px var(--plaque-lip),
			0 18px 40px rgba(0, 0, 0, 0.45);
	}
	.plaque > span {
		transform: none;
		white-space: nowrap;
	}
	.intro-n {
		font-size: 46px;
		line-height: 1;
		color: #fff;
		text-shadow: 0 3px 0 var(--stack);
	}
	.intro-q {
		font-size: 20px;
		line-height: 1.1;
		color: var(--gold);
		text-shadow: 0 2px 0 var(--stack);
	}
	/* in with a spring (an overshoot), a beat to read it, then up and away */
	@keyframes intro {
		0% {
			opacity: 0;
			transform: scale(0.4);
		}
		14% {
			opacity: 1;
			transform: scale(1.08);
		}
		24% {
			transform: scale(0.98);
		}
		32% {
			transform: scale(1);
		}
		78% {
			opacity: 1;
			transform: none;
		}
		100% {
			opacity: 0;
			transform: translateY(-28px) scale(0.92);
		}
	}

	/* ---------- a hint taken: a capsule with a gold ring naming it ---------- */
	.hint-cap {
		position: fixed;
		top: calc(max(12px, env(safe-area-inset-top)) + 70px);
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 44px;
		padding: 8px 18px 8px 12px;
		border-radius: 22px;
		font-weight: 700;
		font-size: 16px;
		line-height: 1.2;
		white-space: nowrap;
		z-index: 1001; /* over the phone's scrim: the open guess map doesn't dim it */
		box-shadow:
			inset 0 0 0 2px var(--gold),
			0 3px 0 var(--cap-lip),
			0 10px 20px rgba(0, 0, 0, 0.25);
		animation: pop-in 0.35s var(--spring);
	}
	.hint-cap .icon {
		width: 20px;
		height: 20px;
		color: var(--gold);
		fill: color-mix(in srgb, var(--gold) 22%, transparent);
	}
	/* the hinted place's face: milk tiles, the place gold, as on the ground; the pill's full
	   height, so the district can be seen at a glance */
	.hint-face {
		width: 40px;
		height: 40px;
		flex: none;
		margin: -6px 0 -6px -8px;
	}
	.hint-cap.low {
		top: calc(max(12px, env(safe-area-inset-top)) + 112px);
	}

	/* the compass sits in a capsule's place under the status (its drawings are its own) */
	.compass-spot {
		position: fixed;
		left: 12px;
		top: calc(max(12px, env(safe-area-inset-top)) + 82px);
		z-index: 999;
		pointer-events: none;
	}
	.compass-spot :global(.dial),
	.compass-spot :global(.strip) {
		background: var(--cap-bg);
		backdrop-filter: none;
		-webkit-backdrop-filter: none;
	}
	.compass-spot :global(.dial) {
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.16),
			inset 0 0 0 1px var(--cap-line),
			0 3px 0 var(--cap-lip),
			0 10px 20px rgba(0, 0, 0, 0.25);
	}
	.compass-spot.modern {
		left: 50%;
		top: calc(max(12px, env(safe-area-inset-top)) + 68px);
		transform: translateX(-50%);
	}

	/* ---------- the first game ---------- */
	.coach-look {
		position: fixed;
		left: 0;
		right: 0;
		top: 50%;
		transform: translateY(-50%);
		z-index: 1001;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
		pointer-events: none;
		animation: rise 0.4s var(--out);
	}
	.finger {
		font-size: 56px;
		filter: drop-shadow(0 4px 0 var(--stack-2)) drop-shadow(0 8px 12px rgba(0, 0, 0, 0.35));
		animation: swipe 1.8s ease-in-out infinite;
	}
	@keyframes swipe {
		0%,
		100% {
			transform: translateX(-60px) rotate(-12deg);
		}
		50% {
			transform: translateX(60px) rotate(12deg);
		}
	}
	.coach-text,
	.coach-map {
		padding: 10px 18px;
		border-radius: 999px;
		font-family: var(--f-disp);
		font-weight: 800;
		font-size: 17px;
		text-align: center;
	}
	.coach-text {
		max-width: calc(100vw - 40px);
	}
	/* the step after: a gold tip pointing at the key */
	/* left of the rail, so the thumb's keys stay free */
	.coach-map {
		position: fixed;
		left: 12px;
		bottom: calc(max(12px, env(safe-area-inset-bottom)) + 92px);
		z-index: 1001;
		max-width: calc(100vw - 92px);
		pointer-events: none;
		color: var(--gold-ink);
		background: linear-gradient(180deg, var(--gold-hi), var(--gold));
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.6),
			0 3px 0 var(--gold-lo),
			0 10px 20px rgba(0, 0, 0, 0.25);
		animation: rise 0.4s var(--out);
	}
	.coach-map::after {
		content: '';
		position: absolute;
		left: 36px;
		bottom: -9px;
		margin-left: -8px;
		border: 8px solid transparent;
		border-bottom: 0;
		border-top-color: var(--gold-lo);
	}
	@media (min-width: 761px) {
		.coach-map {
			display: none;
		}
	}
	.breathe {
		animation: breathe 1.3s ease-in-out infinite;
	}
	@keyframes breathe {
		50% {
			transform: scale(1.04);
			filter: brightness(1.12);
		}
	}
	/* on the map: a gold ripple where to tap */
	.coach-pin {
		position: absolute;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		pointer-events: none;
	}
	.coach-pin i {
		width: 48px;
		height: 48px;
		border-radius: 50%;
		border: 4px solid var(--gold);
		box-shadow: 0 0 0 2px var(--ring-deep);
		animation: ripple 1.4s ease-out infinite;
	}
	@keyframes ripple {
		0% {
			transform: scale(0.4);
			opacity: 1;
		}
		100% {
			transform: scale(1.6);
			opacity: 0;
		}
	}
	.coach-pin span {
		padding: 8px 14px;
		border-radius: 999px;
		background: var(--cap-bg);
		color: #fff;
		font-family: var(--f-disp);
		font-weight: 800;
		font-size: 15px;
		white-space: nowrap;
		box-shadow: 0 3px 0 var(--cap-lip);
	}

	/* ---------- the thumb's keys: bottom left on a computer (the map is on the right),
	   above the big key on the right on a phone ---------- */
	.rail {
		position: fixed;
		left: 16px;
		bottom: 140px; /* above Yandex's own + and − (bottom left, 16–116px up) */
		z-index: 1000;
		display: flex;
		flex-direction: column;
		gap: 18px; /* room for the hint's price tag between the two */
	}

	/* ---------- the keys' words: one line, slanted capitals; a long label shrinks to fit ---------- */
	.label {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		padding-right: 0.12em; /* the slant leans past the box */
	}

	/* ---------- the bottom key (phones) ---------- */
	.bottom {
		position: fixed;
		left: 12px;
		right: 12px;
		bottom: max(12px, env(safe-area-inset-bottom));
		z-index: 1000;
		display: none;
		gap: 10px;
	}
	.bottom .btn {
		height: 64px;
		border-radius: var(--r-m);
	}
	.bottom .go {
		flex: 1;
		min-width: 0;
		gap: 10px;
		padding: 0 16px;
		/* 22 px, or smaller when the words are long: about 0.72 em a letter fits the key */
		font-size: clamp(15px, calc((100vw - 96px) / (var(--n, 16) * 0.74)), 22px);
	}
	.bottom .reopen + .go {
		font-size: clamp(15px, calc((100vw - 170px) / (var(--n, 16) * 0.74)), 22px);
	}
	.bottom .btn svg {
		width: 26px;
		height: 26px;
		stroke-width: 2.6;
	}
	/* the small map key beside "guess": a lapis capsule square, not a second main key */
	.bottom .reopen {
		--b-a: #13778a;
		--b-b: var(--plaque-a);
		--b-c: var(--plaque-b);
		--b-ink: #fff;
		--b-lip: var(--plaque-lip);
		width: 64px;
		padding: 0;
	}
	/* sending, or waiting for the others: a quiet lapis strip with the words, not a green key
	   (a tap still opens the map, to look at one's own pin) */
	.bottom .open-map.waiting,
	.bottom .open-map:disabled {
		font-family: var(--f-text);
		font-weight: 700;
		font-variation-settings: normal;
		text-transform: none;
		letter-spacing: 0;
		font-size: 17px;
		--b-a: var(--cap-bg);
		--b-b: var(--cap-bg);
		--b-c: var(--cap-bg);
		--b-ink: #fff;
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.12),
			inset 0 0 0 1px var(--cap-line),
			0 10px 20px rgba(0, 0, 0, 0.25);
		margin-bottom: 0;
		transform: translateY(6px);
		text-shadow: none;
	}
	.bottom .open-map:disabled {
		cursor: default;
	}
	.spinner {
		width: 18px;
		height: 18px;
		border-radius: 50%;
		border: 3px solid rgba(255, 255, 255, 0.3);
		border-top-color: #fff;
		animation: spin 0.8s linear infinite;
		flex: none;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* ---------- the guess map: a small map in the corner (computers) ---------- */
	.scrim {
		display: none;
	}
	.grab-bar,
	.grab,
	.map-title {
		display: none;
	}
	.minimap {
		position: fixed;
		right: 16px;
		bottom: 18px;
		z-index: 1000;
		width: 362px;
		display: flex;
		flex-direction: column;
		gap: 10px;
		transition: width 0.3s var(--out);
	}
	.minimap.hidden {
		visibility: hidden;
	}
	.minimap:hover,
	.minimap.pinned {
		width: min(625px, calc(100vw - 32px));
	}
	.map-head {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 8px;
	}
	.layer-btn,
	.size-btn {
		height: 38px;
		border: none;
		border-radius: var(--r-s);
		background: var(--cap-bg);
		color: var(--cap-ink);
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.16),
			inset 0 0 0 1px var(--cap-line),
			0 3px 0 var(--cap-lip),
			0 6px 14px rgba(0, 0, 0, 0.2);
		font-size: 14px;
		font-weight: 700;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 0 12px;
		transition: transform 0.1s var(--out);
	}
	.layer-btn:active:not(.static),
	.size-btn:active {
		transform: translateY(2px);
	}
	.layer-btn.static {
		cursor: default;
	}
	.layer-btn .icon,
	.size-btn .icon {
		width: 18px;
		height: 18px;
	}
	.size-btn {
		width: 38px;
		padding: 0;
		justify-content: center;
	}
	.size-btn[aria-pressed='true'] {
		color: var(--gold);
	}
	/* the map in a lapis frame with a lip; Yandex's map stays light by night, never filtered */
	.map-box {
		position: relative;
		height: 260px;
		border-radius: var(--r-m);
		overflow: hidden;
		background: #eef0ee;
		box-shadow:
			0 0 0 3px var(--ring-deep),
			0 0 0 5px rgba(190, 240, 240, 0.35),
			0 8px 0 3px var(--cap-lip),
			0 18px 36px rgba(0, 0, 0, 0.35);
		transition: height 0.3s var(--out);
	}
	.minimap:hover .map-box,
	.minimap.pinned .map-box {
		height: min(464px, calc(100vh - 230px));
	}
	.minimap .btn-guess {
		width: 100%;
		height: 58px;
		margin-top: 6px;
		gap: 12px;
		font-size: 21px;
	}
	.minimap .btn-guess svg {
		width: 24px;
		height: 24px;
		stroke-width: 2.8;
	}
	/* before a pin: not a key at all yet, a flat lapis strip that says what to do */
	.minimap .btn-guess:disabled {
		--b-a: var(--cap-bg);
		--b-b: var(--cap-bg);
		--b-c: var(--cap-bg);
		--b-ink: var(--cap-ink-2);
		cursor: default;
		font-family: var(--f-text);
		font-weight: 700;
		font-variation-settings: normal;
		text-transform: none;
		letter-spacing: 0;
		font-size: 16px;
		box-shadow:
			inset 0 0 0 1px var(--cap-line),
			0 8px 18px rgba(0, 0, 0, 0.2);
		margin-bottom: 0;
		transform: translateY(5px);
	}
	.minimap .btn-guess:disabled svg {
		width: 20px;
		height: 20px;
		stroke-width: 2.2;
	}

	/* ---------- the pause menu (inside the shared sheet, which follows the look's tokens) ---------- */
	.menu {
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	.menu > .btn {
		width: 100%;
	}
	.menu-row .field-label {
		margin-bottom: 8px;
		color: var(--ink-2);
	}
	.keys {
		font-size: 13px;
		color: var(--ink-3);
	}

	/* ---------- phones ---------- */
	@media (max-width: 760px) {
		/* pinch to zoom; Yandex's own zoom buttons would sit under the big key */
		.pano :global([class*='panorama-control__zoom']) {
			display: none !important;
		}
		.hud {
			left: 10px;
			right: 10px;
			top: max(10px, env(safe-area-inset-top));
			gap: 8px;
		}
		/* the clock between the status and pause, near the right: there's no room to centre it */
		.clock-spot {
			position: static;
			transform: none;
			margin-left: auto;
		}
		.clock-spot + .pause {
			margin-left: 0;
		}
		.clock {
			height: 48px;
			padding: 0 14px 0 12px;
			font-size: 25px;
			gap: 6px;
		}
		.clock .icon {
			width: 17px;
			height: 17px;
		}
		.status {
			padding: 7px 0 8px;
		}
		.status > div {
			padding: 0 10px;
		}
		.st-n {
			font-size: 23px;
		}
		.st-n small {
			font-size: 15px;
		}
		.dots {
			gap: 3px;
			margin-top: 6px;
		}
		.dots i {
			width: 7px;
			height: 7px;
		}
		.many .dots {
			display: none;
		}
		.many .round-word {
			display: block;
		}
		/* never a second row (it would cover the compass): a crowded room's chip lets its
		   icon go first */
		.hud-left {
			gap: 6px;
			flex-wrap: nowrap;
		}
		.status,
		.pause {
			flex-shrink: 0;
		}
		.hud .hud-left :global(.chip) {
			min-width: 0;
			padding: 0 10px;
			gap: 6px;
		}
		.hud .hud-left :global(.chip-value) {
			font-size: 20px;
		}
		.hud .hud-left :global(.chip > *) {
			flex-shrink: 0;
		}
		.hud .hud-left :global(.chip > svg) {
			flex-shrink: 1;
			min-width: 0;
		}
		.chip-clock {
			margin-right: -10px;
			padding: 0 10px 0 9px;
			font-size: 20px;
		}
		.chip-clock .icon {
			display: none;
		}
		.pause {
			width: 48px;
			height: 48px;
		}
		.round-btn:not(.pause) {
			width: 54px;
			height: 54px;
		}
		.compass-spot {
			left: 10px;
			top: calc(max(10px, env(safe-area-inset-top)) + 66px);
		}
		.compass-spot.modern {
			left: 50%;
			top: calc(max(10px, env(safe-area-inset-top)) + 60px);
			transform: translateX(-50%) scale(0.85);
		}
		/* beside the compass, under the status: centred in what's left of the width */
		.hint-cap {
			top: calc(max(10px, env(safe-area-inset-top)) + 70px);
			left: 72px;
			right: 10px;
			transform: none;
			width: max-content;
			max-width: calc(100vw - 82px);
			margin: 0 auto;
			white-space: normal;
			font-size: 15px;
		}
		.hint-cap.low {
			left: 10px;
			top: calc(max(10px, env(safe-area-inset-top)) + 108px);
			max-width: calc(100vw - 20px);
		}
		.intro-n {
			font-size: 42px;
		}
		.keys {
			display: none;
		}
		.bottom {
			display: flex;
		}
		.rail {
			left: auto;
			right: 10px;
			bottom: calc(max(12px, env(safe-area-inset-bottom)) + 92px);
		}
		.rail.lifted {
			display: none;
		}

		/* the map is a sheet that springs up from the bottom; the street stays in sight above it */
		.scrim {
			display: block;
			position: fixed;
			inset: 0;
			z-index: 1000;
			border: none;
			background: rgba(2, 30, 36, 0.42);
			animation: fade 0.2s;
		}
		@keyframes fade {
			from {
				opacity: 0;
			}
		}
		.minimap,
		.minimap:hover,
		.minimap.pinned {
			left: 0;
			right: 0;
			bottom: 0;
			width: auto;
			height: 76vh;
			height: 76dvh;
			z-index: 1001;
			gap: 0;
			padding: 8px 12px max(14px, env(safe-area-inset-bottom));
			border-radius: 28px 28px 0 0;
			background: var(--panel);
			color: var(--ink);
			box-shadow:
				0 -1px 0 var(--panel-line),
				0 -18px 40px rgba(0, 0, 0, 0.35);
			transform: translateY(105%);
			visibility: hidden;
			transition:
				transform 0.32s var(--out),
				visibility 0s 0.32s;
		}
		:global(:root[data-theme='dark']) .minimap {
			background: linear-gradient(180deg, var(--panel-2), var(--ground-top) 70%);
		}
		.minimap.open {
			transform: none;
			visibility: visible;
			transition:
				transform 0.5s var(--spring),
				visibility 0s;
		}
		.grab-bar {
			display: block;
			flex: none;
			width: 44px;
			height: 5px;
			border-radius: 3px;
			margin: 0 auto 8px;
			background: color-mix(in srgb, var(--ink) 20%, transparent);
		}
		.map-head {
			justify-content: flex-start;
			gap: 10px;
			height: 48px;
			margin-bottom: 10px;
		}
		.grab {
			display: grid;
			place-items: center;
			flex: none;
			width: 44px;
			height: 44px;
			border: none;
			border-radius: 14px;
			background: var(--panel-2);
			color: var(--ink);
			box-shadow:
				inset 0 0 0 1px var(--panel-line),
				0 2px 0 var(--panel-line);
		}
		.grab .icon {
			width: 22px;
			height: 22px;
			stroke-width: 2.6;
		}
		.grab:active {
			transform: translateY(2px);
		}
		.map-title {
			display: block;
			flex: 1;
			min-width: 0;
			font-size: 27px;
			line-height: 1.1;
			color: var(--ink);
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
			padding-right: 0.15em;
		}
		.layer-btn {
			flex: none;
			height: 44px;
			border-radius: 14px;
			padding: 0 14px 0 12px;
			font-size: 15px;
			background: var(--panel-2);
			color: var(--ink);
			box-shadow:
				inset 0 0 0 1px var(--panel-line),
				0 2px 0 var(--panel-line);
		}
		.layer-btn .icon {
			width: 20px;
			height: 20px;
		}
		.size-btn {
			display: none;
		}
		.map-box,
		.minimap:hover .map-box,
		.minimap.pinned .map-box {
			flex: 1;
			height: auto;
			min-height: 0;
			margin-bottom: 16px;
			box-shadow:
				0 0 0 1px var(--panel-line),
				0 4px 0 color-mix(in srgb, var(--ink) 12%, transparent);
		}
		.minimap .btn-guess {
			flex: none;
			height: 64px;
			margin-top: 0;
			font-size: 22px;
		}
		.minimap .btn-guess svg {
			width: 26px;
			height: 26px;
		}
		/* before a pin, on the sheet: an empty slot where the key will land, with the words that
		   say how to get it; nothing here looks pressable */
		.minimap .btn-guess:disabled {
			background: transparent;
			--b-ink: var(--ink-3);
			font-size: 17px;
			box-shadow: inset 0 0 0 2px var(--panel-line);
			transform: translateY(6px);
		}
	}
</style>
