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
	import Sheet from '#lib/components/Sheet.svelte';
	import { compass, setCompassStyle, COMPASS_STYLES } from '#lib/compass.svelte.js';
	import { i18n, t, tx, type Key } from '#lib/i18n/index.svelte.js';
	import { fmtClock, fmtNum } from '#lib/format.js';
	import { showToast } from '#lib/toast.svelte.js';
	import { load, save } from '#lib/storage.js';
	import {
		beep,
		setSound,
		sfxGuess,
		sfxPin,
		sound,
		unlockAudio,
		vibrate
	} from '#lib/sfx.svelte.js';

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
	let intro = $state<number | null>(null);
	let introFor = -1;
	let introTimer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		if (!playing || n == null || n === introFor) return;
		introFor = n;
		intro = n;
		clearTimeout(introTimer);
		introTimer = setTimeout(() => (intro = null), 1500);
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

<!-- top: status on the left, the clock in the middle (a room's in its players' chip), pause
     (a room's menu) on the right -->
<div class="hud" class:hide={status === 'off'}>
	<div class="hud-left">
		<div class="status" class:many>
			<div class="st-round">
				<span class="st-n"
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
				<span class="st-n">{fmtNum(total)}</span>
				<span class="st-label">{t('points')}</span>
			</div>
		</div>
		{@render hud?.(clockOn ? chipClock : null)}
	</div>

	{#if clockOn && left !== null && !hud}
		<div
			class="clock"
			class:warn={playing && left <= 15 && left > 10}
			class:low={playing && left <= 10}
			role="timer"
		>
			<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"
				><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2M9.5 2.5h5" /></svg
			>
			<span>{fmtClock(left)}</span>
		</div>
	{/if}

	<button
		class="round-btn pause"
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
			>{fmtClock(left)}
		</span>
	{/if}
{/snippet}

{#if intro !== null}
	<div class="intro" aria-live="polite">
		<span class="intro-n"
			>{t('roundN', { n: intro })}{#if rounds}<small> / {rounds}</small>{/if}</span
		>
		<span class="intro-q">{t('whereAreYou')}</span>
	</div>
{/if}

{#if hints.length && playing}
	{@const h = hints.at(-1)!}
	<div class="hint-banner" class:low={showCompass && compass.style === 'modern'}>
		<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"
			><path
				d="M9 18h6M10 21.5h4M12 2.5a6.5 6.5 0 0 0-3.8 11.8V16.5h7.6v-2.2A6.5 6.5 0 0 0 12 2.5z"
			/></svg
		>
		<!-- the place's own name says what it is: "Yashnobod tumani", not "Tuman: Yashnobod tumani" -->
		{h.kind === 'circle' ? t('hintCircle') : tx(h.text)}
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
		<span class="coach-text">{t('coachLook')}</span>
	</div>
{/if}

<!-- under the right thumb: the hint and back to start -->
{#if playing || status === 'waiting'}
	<div class="rail" class:lifted={mapOpen}>
		{#if rules.hints.count > 0}
			<button
				class="round-btn hint"
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
				{#if hintsLeft > 0}<span class="badge">{hintsLeft}</span>{/if}
				{#if hintCost > 0 && hintsLeft > 0}<span class="cost">−{Math.round(hintCost * 100)}%</span
					>{/if}
			</button>
		{/if}
		{#if rules.movement !== 'nmpz'}
			<button
				class="round-btn"
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

<!-- phones: the big button at the bottom; the map comes up from it -->
{#if (playing || guessed) && !mapOpen}
	<div class="bottom">
		{#if guess && playing}
			<button class="btn btn-sky reopen" onclick={openMap} aria-label={t('map')}>
				<svg viewBox="0 0 24 24"
					><path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20z" /><path
						d="M9 4v13.5M15 6.5V20"
					/></svg
				>
			</button>
			<button class="btn btn-primary go" onclick={guessNow}>
				<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
				{t('guess')}
			</button>
		{:else}
			<button
				class="btn btn-sky go open-map"
				class:breathe={coach === 'map'}
				onclick={openMap}
				disabled={!playing && !guessed}
			>
				{#if guessed}
					{#if status === 'sending'}<span class="spinner"></span>{/if}
					{guessLabel ?? t('sending')}
				{:else}
					<svg viewBox="0 0 24 24"
						><path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z" /><circle
							cx="12"
							cy="10"
							r="2.3"
						/></svg
					>
					{t('openMapGuess')}
				{/if}
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

<div
	class="minimap"
	class:open={mapOpen}
	class:pinned={mapPinned}
	class:hidden={status === 'off'}
	role="region"
	aria-label={t('map')}
>
	<div class="map-head">
		<button class="grab" onclick={() => (mapOpen = false)} aria-label={t('close')}>
			<svg viewBox="0 0 24 24" class="icon"><path d="m6 9 6 6 6-6" /></svg>
		</button>
		<span class="map-title">{t('whereAreYou')}</span>
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
			{guessLabel}
		{:else if guess}
			<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
			{t('guess')}
		{:else}
			{t('tapTheMap')}
		{/if}
	</button>
</div>

<Sheet open={menuOpen} onclose={() => (menuOpen = false)} title={onleave ? t('menu') : t('pause')}>
	<div class="menu">
		{#if !onleave}
			<button class="btn btn-primary" onclick={() => (menuOpen = false)}>
				<svg viewBox="0 0 24 24"><path d="M7 4.5v15l12-7.5z" /></svg>
				{t('resume')}
			</button>
		{/if}
		{#if rules.compass}
			<div class="menu-row">
				<span class="field-label">{t('compass')}</span>
				<div class="segmented">
					{#each COMPASS_STYLES as c (c)}
						<button
							aria-pressed={!compassOff && compass.style === c}
							onclick={() => {
								compassOff = false;
								setCompassStyle(c);
							}}>{t(`compass_${c}`)}</button
						>
					{/each}
					<!-- the same four as the settings: "Yo‘q" hides it for this game -->
					<button aria-pressed={compassOff} onclick={() => (compassOff = true)}
						>{t('compassNone')}</button
					>
				</div>
			</div>
		{/if}
		<div class="menu-row">
			<span class="field-label">{t('sound')}</span>
			<div class="segmented">
				<button aria-pressed={sound.on} onclick={() => setSound(true)}>{t('soundOn')}</button>
				<button aria-pressed={!sound.on} onclick={() => setSound(false)}>{t('soundOff')}</button>
			</div>
		</div>
		{#if onleave}
			<button class="btn btn-ghost" onclick={onleave}>{t('leave')}</button>
		{:else}
			<p class="keys">{t('keys')}</p>
			<a class="btn btn-ghost" href="/">{t('leaveGame')}</a>
		{/if}
	</div>
</Sheet>

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

	/* ---------- the HUD: dark glass over the street, white text, no labels in capitals ---------- */
	.hud {
		position: fixed;
		top: max(12px, env(safe-area-inset-top));
		left: 12px;
		right: 12px;
		display: flex;
		justify-content: space-between;
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
		pointer-events: none;
	}
	.hud-left > :global(*) {
		pointer-events: auto;
	}
	.status,
	.round-btn,
	.clock,
	.hud-left :global(.chip) {
		background: var(--hud);
		color: #fff;
		backdrop-filter: blur(10px);
		-webkit-backdrop-filter: blur(10px);
		box-shadow: 0 3px 0 var(--hud-edge);
	}
	.status {
		display: flex;
		align-items: stretch;
		border-radius: 18px;
		padding: 6px 4px;
	}
	.status > div {
		display: flex;
		flex-direction: column;
		justify-content: center;
		padding: 0 12px;
		min-width: 0;
	}
	.st-round {
		border-right: 1px solid rgba(255, 255, 255, 0.16);
	}
	.st-n {
		font-family: var(--display);
		font-weight: 800;
		font-size: 19px;
		line-height: 1.15;
		font-variant-numeric: tabular-nums;
		letter-spacing: -0.01em;
	}
	.st-n small {
		font-size: 13px;
		font-weight: 700;
		opacity: 0.6;
		margin-left: 1px;
	}
	.st-label {
		font-size: 12px;
		font-weight: 500;
		opacity: 0.7;
		line-height: 1.2;
	}
	.dots {
		display: flex;
		gap: 4px;
		margin-top: 4px;
		flex-wrap: wrap;
		max-width: 110px;
	}
	.dots i {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.22);
	}
	.dots i.now {
		background: #fff;
		animation: now 1.6s ease-in-out infinite;
	}
	@keyframes now {
		50% {
			box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.25);
		}
	}
	.dots i.hi {
		background: #36c853;
	}
	.dots i.mid {
		background: #f5b81c;
	}
	.dots i.lo {
		background: #f04157;
	}
	.many .round-word {
		display: none;
	}
	/* a room's chip, given through the hud snippet */
	.hud-left :global(.chip) {
		border-radius: 18px;
		padding: 6px 14px;
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.hud-left :global(.chip-value) {
		font-family: var(--display);
		font-weight: 800;
		font-size: 17px;
		font-variant-numeric: tabular-nums;
	}

	/* in a room's chip the clock fills the chip's right end, so its gold and red are the clock's */
	.chip-clock {
		align-self: stretch;
		display: flex;
		align-items: center;
		gap: 5px;
		margin: -6px -14px -6px 0;
		padding: 0 14px 0 10px;
		border-left: 1px solid rgba(255, 255, 255, 0.16);
		border-radius: 0 18px 18px 0;
		font-family: var(--display);
		font-weight: 800;
		font-size: 17px;
		font-variant-numeric: tabular-nums;
		transition: background 0.3s;
	}
	.chip-clock .icon {
		width: 18px;
		height: 18px;
		opacity: 0.8;
	}
	.chip-clock.warn {
		background: #b07a00;
		border-color: transparent;
	}
	.chip-clock.low {
		background: var(--red);
		border-color: transparent;
		animation: flash 0.5s ease-in-out infinite alternate;
	}
	@keyframes flash {
		to {
			filter: brightness(1.3);
		}
	}

	.clock {
		position: absolute;
		left: 50%;
		top: 0;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: 8px;
		height: 52px;
		padding: 0 18px 0 14px;
		border-radius: 26px;
		font-family: var(--display);
		font-weight: 800;
		font-size: 22px;
		font-variant-numeric: tabular-nums;
	}
	.clock .icon {
		opacity: 0.8;
	}
	.clock.warn {
		background: #b07a00;
		animation: tick 1s ease-in-out infinite;
	}
	.clock.low {
		background: var(--red);
		animation: tick 0.5s ease-in-out infinite alternate;
	}
	@keyframes tick {
		50% {
			transform: translateX(-50%) scale(1.1);
		}
	}

	.round-btn {
		position: relative;
		width: 52px;
		height: 52px;
		border: none;
		border-radius: 18px;
		display: grid;
		place-items: center;
		transition:
			transform 0.08s,
			box-shadow 0.08s;
	}
	.round-btn .icon {
		width: 24px;
		height: 24px;
	}
	.round-btn:active:not(:disabled) {
		transform: translateY(2px);
		box-shadow: 0 1px 0 var(--hud-edge);
	}
	.round-btn:disabled {
		opacity: 0.45;
		cursor: default;
	}
	.round-btn .badge {
		position: absolute;
		top: -6px;
		right: -6px;
		min-width: 22px;
		height: 22px;
		padding: 0 6px;
		border-radius: 11px;
		background: var(--star);
		color: #3a2600;
		font-family: var(--display);
		font-weight: 800;
		font-size: 12px;
		display: grid;
		place-items: center;
		box-shadow: 0 2px 0 rgba(0, 0, 0, 0.3);
	}
	/* the hint's price: the gold of the result's "−20% 💡", not red ("wrong") */
	.round-btn .cost {
		position: absolute;
		bottom: -7px;
		left: 50%;
		transform: translateX(-50%);
		padding: 1px 6px;
		border-radius: 8px;
		background: var(--star);
		color: #3a2600;
		font-size: 11px;
		font-weight: 800;
		white-space: nowrap;
		box-shadow: 0 2px 0 rgba(0, 0, 0, 0.3);
	}
	.round-btn.hint:not(:disabled) .icon {
		color: #ffd75e;
	}

	/* ---------- each round's number ---------- */
	.intro {
		position: fixed;
		left: 50%;
		top: 38%;
		z-index: 1001;
		transform: translate(-50%, -50%);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		pointer-events: none;
		color: #fff;
		text-align: center;
		animation: intro 1.5s var(--settle) both;
	}
	.intro-n {
		font-family: var(--display);
		font-weight: 800;
		font-size: 44px;
		line-height: 1;
		letter-spacing: -0.02em;
		padding: 14px 26px 16px;
		border-radius: 20px;
		background: var(--sign-blue);
		box-shadow:
			inset 0 0 0 3px var(--sign-blue),
			inset 0 0 0 5px #fff,
			0 6px 0 rgba(0, 0, 0, 0.3);
	}
	.intro-n small {
		font-size: 24px;
		opacity: 0.7;
	}
	.intro-q {
		font-family: var(--display);
		font-weight: 700;
		font-size: 20px;
		text-shadow: 0 2px 10px rgba(0, 0, 0, 0.6);
	}
	@keyframes intro {
		0% {
			opacity: 0;
			transform: translate(-50%, -50%) scale(0.5);
		}
		18% {
			opacity: 1;
			transform: translate(-50%, -50%) scale(1.08);
		}
		28% {
			transform: translate(-50%, -50%) scale(1);
		}
		78% {
			opacity: 1;
			transform: translate(-50%, -50%) scale(1);
		}
		100% {
			opacity: 0;
			transform: translate(-50%, -80%) scale(0.9);
		}
	}

	.hint-banner {
		position: fixed;
		top: calc(max(12px, env(safe-area-inset-top)) + 64px);
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: 8px;
		background: var(--sky);
		color: #fff;
		padding: 10px 16px;
		border-radius: 14px;
		font-weight: 700;
		box-shadow: 0 3px 0 var(--sky-edge);
		z-index: 1001; /* over the phone's scrim: the open guess map doesn't dim it */
		white-space: nowrap;
		animation: pop-in 0.35s var(--pop);
	}
	.hint-banner.low {
		top: calc(max(12px, env(safe-area-inset-top)) + 108px);
	}
	.compass-spot {
		position: fixed;
		left: 12px;
		top: calc(max(12px, env(safe-area-inset-top)) + 72px);
		z-index: 999;
		pointer-events: none;
	}
	.compass-spot.modern {
		left: 50%;
		top: calc(max(12px, env(safe-area-inset-top)) + 64px);
		transform: translateX(-50%);
	}

	/* ---------- first game ---------- */
	.coach-look {
		position: fixed;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		z-index: 1001;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 14px;
		pointer-events: none;
		animation: rise 0.4s var(--settle);
	}
	.finger {
		font-size: 54px;
		filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.45));
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
	.coach-text {
		max-width: calc(100vw - 40px);
	}
	.coach-text,
	.coach-map {
		padding: 10px 18px;
		border-radius: 14px;
		background: var(--hud);
		color: #fff;
		font-weight: 700;
		font-size: 16px;
		text-align: center;
		backdrop-filter: blur(10px);
		-webkit-backdrop-filter: blur(10px);
	}
	.coach-map {
		position: fixed;
		left: 50%;
		bottom: calc(max(14px, env(safe-area-inset-bottom)) + 76px);
		transform: translateX(-50%);
		z-index: 1001;
		white-space: nowrap;
		pointer-events: none;
		animation: rise 0.4s var(--settle);
	}
	.coach-map::after {
		content: '';
		position: absolute;
		left: 50%;
		bottom: -7px;
		margin-left: -7px;
		border: 7px solid transparent;
		border-bottom: 0;
		border-top-color: var(--hud);
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
			transform: scale(1.05);
			filter: brightness(1.12);
		}
	}
	.coach-pin {
		position: absolute;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		pointer-events: none;
	}
	.coach-pin i {
		width: 46px;
		height: 46px;
		border-radius: 50%;
		border: 4px solid var(--sky);
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
		border-radius: 12px;
		background: var(--lapis);
		color: #fff;
		font-weight: 700;
		font-size: 14px;
		white-space: nowrap;
	}

	/* ---------- the thumb's buttons: bottom left on a computer (the map is on the right),
	   above the big button on the right on a phone ---------- */
	.rail {
		position: fixed;
		left: 16px;
		bottom: 140px; /* above Yandex's own + and − (bottom left, 16–116px up) */
		z-index: 1000;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	/* ---------- the bottom button (phones) ---------- */
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
		height: 60px;
		font-size: 17px;
		border-radius: 18px;
	}
	.bottom .go {
		flex: 1;
		min-width: 0;
	}
	.bottom .reopen {
		width: 64px;
		padding: 0;
	}
	.bottom .btn svg {
		width: 24px;
		height: 24px;
	}
	.open-map:disabled {
		--b-bg: var(--hud);
		--b-edge: var(--hud-edge);
		opacity: 1;
		font-family: var(--body);
		font-weight: 600;
		cursor: default;
	}

	/* ---------- the guess map ---------- */
	.scrim {
		display: none;
	}
	.minimap {
		position: fixed;
		right: 16px;
		bottom: 16px;
		z-index: 1000;
		width: 360px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		transition: width 0.25s var(--settle);
	}
	.minimap.hidden {
		visibility: hidden;
	}
	.minimap:not(.pinned):not(:hover) {
		opacity: 0.9;
	}
	.minimap:hover,
	.minimap.pinned {
		width: min(620px, calc(100vw - 32px));
	}
	.map-head {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.grab,
	.map-title {
		display: none;
	}
	.layer-btn,
	.size-btn {
		height: 36px;
		border: none;
		border-radius: 12px;
		background: var(--hud);
		color: #fff;
		font-size: 13px;
		font-weight: 600;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 0 12px;
		backdrop-filter: blur(10px);
		-webkit-backdrop-filter: blur(10px);
	}
	.layer-btn {
		margin-left: auto;
	}
	.layer-btn.static {
		cursor: default;
	}
	.layer-btn .icon,
	.size-btn .icon {
		width: 17px;
		height: 17px;
	}
	.size-btn {
		width: 36px;
		padding: 0;
		justify-content: center;
	}
	.map-box {
		position: relative;
		height: 260px;
		border-radius: 18px;
		overflow: hidden;
		box-shadow:
			0 0 0 3px rgba(255, 255, 255, 0.9),
			0 12px 30px rgba(0, 0, 0, 0.4);
		transition: height 0.25s var(--settle);
		background: #dfe3e0;
	}
	.minimap:hover .map-box,
	.minimap.pinned .map-box {
		height: min(460px, calc(100vh - 220px));
	}
	.btn-guess {
		width: 100%;
		height: 56px;
		font-size: 16px;
	}
	.btn-guess:disabled {
		--b-bg: var(--hud);
		--b-edge: var(--hud-edge);
		opacity: 1;
		color: rgba(255, 255, 255, 0.85);
		font-family: var(--body);
		font-weight: 600;
		cursor: default;
	}

	/* ---------- the pause menu ---------- */
	.menu {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.menu > .btn {
		width: 100%;
	}
	.menu-row .field-label {
		margin-bottom: 8px;
	}
	.keys {
		font-size: 13px;
		color: var(--muted);
	}

	/* ---------- phones ---------- */
	@media (max-width: 760px) {
		/* pinch to zoom; Yandex's own zoom buttons would sit under the big button */
		.pano :global([class*='panorama-control__zoom']) {
			display: none !important;
		}
		.hud {
			left: 10px;
			right: 10px;
			top: max(10px, env(safe-area-inset-top));
		}
		/* a room's row holds the pill, the players' chip with the clock and the menu: snug */
		.status > div {
			padding: 0 8px;
		}
		.st-n {
			font-size: 17px;
		}
		.dots {
			gap: 3px;
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
			min-width: 0;
		}
		.status,
		.pause {
			flex-shrink: 0;
		}
		.hud-left :global(.chip) {
			min-width: 0;
			padding: 6px 10px;
			gap: 6px;
		}
		.hud-left :global(.chip > *) {
			flex-shrink: 0;
		}
		.hud-left :global(.chip > svg) {
			flex-shrink: 1;
			min-width: 0;
		}
		.chip-clock {
			margin-right: -10px;
			padding: 0 10px 0 8px;
		}
		.chip-clock .icon {
			display: none;
		}
		.clock {
			height: 46px;
			font-size: 19px;
			padding: 0 14px 0 12px;
		}
		.round-btn {
			width: 48px;
			height: 48px;
		}
		.compass-spot {
			left: 10px;
			top: calc(max(10px, env(safe-area-inset-top)) + 68px);
		}
		.compass-spot.modern {
			top: calc(max(10px, env(safe-area-inset-top)) + 60px);
			transform: translateX(-50%) scale(0.85);
		}
		.hint-banner {
			white-space: normal;
			max-width: calc(100vw - 32px);
			top: calc(max(10px, env(safe-area-inset-top)) + 62px);
		}
		.hint-banner.low {
			top: calc(max(10px, env(safe-area-inset-top)) + 104px);
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
			bottom: calc(max(14px, env(safe-area-inset-bottom)) + 80px);
		}
		.rail.lifted {
			display: none;
		}
		/* the map is a sheet from the bottom; the street stays in sight above it */
		.scrim {
			display: block;
			position: fixed;
			inset: 0;
			z-index: 1000;
			border: none;
			background: rgba(8, 14, 26, 0.35);
			animation: fade 0.2s;
		}
		@keyframes fade {
			from {
				opacity: 0;
			}
		}
		.minimap:not(.pinned):not(:hover) {
			opacity: 1;
		}
		.minimap,
		.minimap:hover,
		.minimap.pinned {
			left: 0;
			right: 0;
			bottom: 0;
			width: auto;
			height: 74vh;
			height: 74dvh;
			opacity: 1;
			z-index: 1001;
			padding: 6px 12px max(12px, env(safe-area-inset-bottom));
			border-radius: 26px 26px 0 0;
			background: var(--surface);
			color: var(--text);
			box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.35);
			transform: translateY(105%);
			visibility: hidden;
			transition:
				transform 0.32s var(--settle),
				visibility 0s 0.32s;
		}
		.minimap.open {
			transform: none;
			visibility: visible;
			transition:
				transform 0.32s var(--settle),
				visibility 0s;
		}
		.map-head {
			gap: 8px;
			padding: 0 0 8px;
		}
		.grab {
			display: grid;
			place-items: center;
			width: 44px;
			height: 40px;
			border: none;
			border-radius: 12px;
			background: var(--surface-2);
			color: var(--text);
		}
		.map-title {
			display: block;
			flex: 1;
			font-family: var(--display);
			font-weight: 700;
			font-size: 16px;
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}
		.layer-btn {
			margin-left: 0;
			height: 40px;
			background: var(--surface-2);
			color: var(--text);
		}
		.size-btn {
			display: none;
		}
		.map-box,
		.minimap:hover .map-box,
		.minimap.pinned .map-box {
			flex: 1;
			height: auto;
			box-shadow: inset 0 0 0 1px var(--border);
		}
		.btn-guess {
			height: 60px;
			font-size: 17px;
			border-radius: 18px;
			margin-top: 4px;
		}
		.btn-guess:disabled {
			--b-bg: var(--surface-2);
			--b-edge: var(--edge);
			color: var(--muted);
		}
	}
</style>
