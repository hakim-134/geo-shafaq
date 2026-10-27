<script lang="ts">
	// The player's own preferences, each choice shown as what it looks like: the words in each
	// language, a small screen in light and dark, the three compasses turning over a street,
	// the three map looks, the sound (it plays when turned on), the first game's finger. Each
	// takes effect at once.
	import { onDestroy } from 'svelte';
	import SubPage from '#lib/components/SubPage.svelte';
	import Compass from '#lib/components/Compass.svelte';
	import { i18n, langs, setLang, t, type Lang } from '#lib/i18n/index.svelte.js';
	import { theme, setTheme } from '#lib/theme.svelte.js';
	import { sound, setSound, sfxStar } from '#lib/sfx.svelte.js';
	import { compass, setCompassStyle, COMPASS_STYLES, MNEMONIC } from '#lib/compass.svelte.js';
	import { LAYERS, savedLayer, saveLayer, type Layer } from '#lib/map/map.js';
	import { load, save } from '#lib/storage.js';
	import { showToast } from '#lib/toast.svelte.js';

	const names: Record<Lang, string> = { uz: 'O‘zbekcha', en: 'English', ru: 'Русский' };
	const sample: Record<Lang, string> = { uz: 'Qayerdasiz?', en: 'Where are you?', ru: 'Где вы?' };

	let layer = $state<Layer>(savedLayer());
	let tipsDone = $state(!!load('coach_done', ''));

	// the compasses turn slowly, as if someone looks around
	let heading = $state(0);
	let raf = requestAnimationFrame(function spin(now) {
		heading = Math.sin(now / 2600) * 120;
		raf = requestAnimationFrame(spin);
	});
	onDestroy(() => cancelAnimationFrame(raf));

	function pickLayer(l: Layer) {
		layer = l;
		saveLayer(l);
	}
	function soundOn(on: boolean) {
		setSound(on);
		if (on) setTimeout(() => [0, 1, 2].forEach((i) => setTimeout(() => sfxStar(i), i * 200)), 50);
	}
	function tipsAgain() {
		save('coach_done', '');
		tipsDone = false;
		showToast(t('tipsReset'));
	}
</script>

<SubPage title={t('settings')} back={{ href: '/me', label: t('profile') }}>
	<div class="list">
		<section>
			<h2>{t('langLabel')}</h2>
			<div class="tiles three">
				{#each langs as l (l)}
					<button class="tile" aria-pressed={i18n.lang === l} onclick={() => setLang(l)}>
						<span class="pic words"><b>{sample[l]}</b></span>
						<span class="name">{names[l]}</span>
					</button>
				{/each}
			</div>
		</section>

		<section>
			<h2>{t('theme')}</h2>
			<div class="tiles two">
				{#each ['light', 'dark'] as const as th (th)}
					<button class="tile" aria-pressed={theme.value === th} onclick={() => setTheme(th)}>
						<!-- a tiny home: the greeting, a blue sign, the green button -->
						<span class="pic screen {th}" aria-hidden="true">
							<i class="s-line"></i>
							<i class="s-title"></i>
							<i class="s-sign"></i>
							<i class="s-sign white"></i>
							<i class="s-play"></i>
						</span>
						<span class="name">{th === 'light' ? t('themeLight') : t('themeDark')}</span>
					</button>
				{/each}
			</div>
		</section>

		<section>
			<h2>{t('sound')}</h2>
			<div class="tiles two">
				<button class="tile" aria-pressed={sound.on} onclick={() => soundOn(true)}>
					<span class="pic speaker on" aria-hidden="true">
						<svg viewBox="0 0 48 48"
							><path class="body" d="M8 19h7l10-8v26l-10-8H8z" /><path
								class="wave w1"
								d="M31 18a8 8 0 0 1 0 12"
							/><path class="wave w2" d="M35 13a15 15 0 0 1 0 22" /></svg
						>
					</span>
					<span class="name">{t('soundOn')}</span>
				</button>
				<button class="tile" aria-pressed={!sound.on} onclick={() => soundOn(false)}>
					<span class="pic speaker" aria-hidden="true">
						<svg viewBox="0 0 48 48"
							><path class="body" d="M8 19h7l10-8v26l-10-8H8z" /><path
								class="cross"
								d="m31 19 10 10M41 19 31 29"
							/></svg
						>
					</span>
					<span class="name">{t('soundOff')}</span>
				</button>
			</div>
			<p class="note">{t('soundNote')}</p>
		</section>

		<section>
			<h2>{t('compass')}</h2>
			<div class="tiles three">
				{#each COMPASS_STYLES as c (c)}
					<button
						class="tile"
						aria-pressed={compass.style === c}
						onclick={() => setCompassStyle(c)}
					>
						<!-- over a bit of street, as in a round -->
						<span class="pic street" aria-hidden="true">
							<span class="compass {c}"><Compass {heading} style={c} /></span>
						</span>
						<span class="name">{t(`compass_${c}`)}</span>
					</button>
				{/each}
			</div>
			<p class="note">{t(`compassNote_${compass.style}`, MNEMONIC)}</p>
		</section>

		<section>
			<h2>{t('mapLook')}</h2>
			<div class="tiles three">
				{#each LAYERS as l (l)}
					<button class="tile" aria-pressed={layer === l} onclick={() => pickLayer(l)}>
						<span class="pic" aria-hidden="true">
							<svg class="mapthumb" viewBox="0 0 120 80" preserveAspectRatio="xMidYMid slice">
								{#if l === 'map'}
									<rect width="120" height="80" fill="#f7f3e8" />
									<path
										d="M0 62c30-8 50 4 80-6s30-4 40-6"
										stroke="#9fd0ec"
										stroke-width="6"
										fill="none"
									/>
									<rect x="66" y="10" width="20" height="14" rx="2" fill="#d8ecc9" />
								{:else}
									<rect width="120" height="80" fill="#4d5a3a" />
									<rect x="0" y="0" width="45" height="30" fill="#6b7448" />
									<rect x="70" y="40" width="50" height="40" fill="#5d6a46" />
									<rect x="50" y="8" width="16" height="12" fill="#8c8a7d" />
									<rect x="20" y="44" width="22" height="14" fill="#9a9686" />
									<path
										d="M0 62c30-8 50 4 80-6s30-4 40-6"
										stroke="#2d4f5f"
										stroke-width="6"
										fill="none"
									/>
								{/if}
								{#if l !== 'satellite'}
									<path
										d="M0 30h120M44 0v80M0 8l120 52"
										stroke={l === 'map' ? '#f5c36b' : '#f5c36bcc'}
										stroke-width="4"
										fill="none"
									/>
									<path
										d="M90 0v80M0 48h120"
										stroke="#fff"
										stroke-width="2"
										fill="none"
										opacity=".85"
									/>
									<text
										x="50"
										y="25"
										font-size="9"
										font-weight="700"
										fill={l === 'map' ? '#333' : '#fff'}>Chilonzor</text
									>
								{:else}
									<path
										d="M0 30h120M44 0v80M0 8l120 52"
										stroke="#a9a596"
										stroke-width="2.5"
										fill="none"
									/>
								{/if}
							</svg>
						</span>
						<span class="name">{t(l)}</span>
					</button>
				{/each}
			</div>
		</section>

		<section>
			<h2>{t('tipsLabel')}</h2>
			<div class="tips">
				<span class="pic street finger-pic" aria-hidden="true"><span class="finger">👆</span></span>
				<div>
					<p class="note">{t('tipsNote')}</p>
					<button class="btn btn-ghost" onclick={tipsAgain} disabled={!tipsDone}>
						{tipsDone ? t('tipsAgain') : t('tipsOn')}
					</button>
				</div>
			</div>
		</section>
	</div>
</SubPage>

<style>
	.list {
		display: flex;
		flex-direction: column;
		gap: 30px;
	}
	h2 {
		font-size: 15px;
		font-weight: 700;
		margin-bottom: 10px;
	}
	.note {
		margin-top: 10px;
		font-size: 13.5px;
		color: var(--muted);
	}

	/* every choice is a tile: a picture of it, its name; the chosen one has a green rim */
	.tiles {
		display: grid;
		gap: 10px;
	}
	.tiles.two {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
	.tiles.three {
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}
	.tile {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 8px 8px 10px;
		border: none;
		border-radius: 18px;
		background: var(--surface);
		color: var(--text);
		box-shadow:
			inset 0 0 0 2px var(--border),
			0 3px 0 var(--edge);
		transition:
			transform 0.08s,
			box-shadow 0.12s;
	}
	.tile:active {
		transform: translateY(2px);
	}
	.tile[aria-pressed='true'] {
		box-shadow:
			inset 0 0 0 3px var(--green),
			0 3px 0 var(--green-edge);
	}
	.tile[aria-pressed='true']::after {
		content: '';
		position: absolute;
		top: -6px;
		right: -6px;
		width: 24px;
		height: 24px;
		border-radius: 50%;
		background: var(--green)
			url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='m6 12.5 4 4L18 8' fill='none' stroke='white' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")
			center / 16px no-repeat;
		box-shadow: 0 2px 0 var(--green-edge);
		animation: pop-in 0.3s var(--pop);
	}
	.name {
		font-weight: 700;
		font-size: 14px;
		text-align: center;
	}
	.pic {
		position: relative;
		display: grid;
		place-items: center;
		height: 78px;
		border-radius: 12px;
		overflow: hidden;
		background: var(--bg);
	}

	.words b {
		font-family: var(--display);
		font-weight: 800;
		font-size: 12.5px;
		overflow-wrap: anywhere;
		line-height: 1.15;
		padding: 0 6px;
		text-align: center;
	}

	/* a tiny home screen, in its own colours whatever the page's theme */
	.screen {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		justify-content: flex-start;
		gap: 4px;
		padding: 9px 10px;
		height: 96px;
	}
	.screen.light {
		background: #f4efe4;
		--ink: #13233f;
		--plate: #fbfaf6;
	}
	.screen.dark {
		background: #0c1424;
		--ink: #edf1f8;
		--plate: #e9edf4;
	}
	.screen i {
		display: block;
		border-radius: 3px;
	}
	.s-line {
		width: 40%;
		height: 4px;
		background: var(--ink);
		opacity: 0.4;
	}
	.s-title {
		width: 70%;
		height: 9px;
		background: var(--ink);
	}
	.s-sign {
		width: 100%;
		height: 15px;
		background: #1d4f9a;
		box-shadow:
			inset 0 0 0 2px #1d4f9a,
			inset 0 0 0 3px #fff;
	}
	.s-sign.white {
		background: var(--plate);
		box-shadow: inset 0 0 0 2px #1b2a44;
	}
	.s-play {
		margin-top: auto;
		width: 100%;
		height: 11px;
		background: #1eb53a;
		box-shadow: 0 2px 0 #0f7a24;
	}

	.speaker svg {
		width: 54px;
		height: 54px;
		fill: none;
		stroke: var(--text);
		stroke-width: 3;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.speaker .body {
		fill: var(--text);
	}
	.speaker .cross {
		stroke: var(--red);
	}
	.speaker.on .wave {
		stroke: var(--sky);
		animation: wave 1.2s ease-in-out infinite;
	}
	.speaker.on .w2 {
		animation-delay: 0.2s;
	}
	@keyframes wave {
		50% {
			opacity: 0.25;
		}
	}

	/* a bit of street (sky, houses, road) under the compass and the finger */
	.street {
		background:
			linear-gradient(to bottom, transparent 58%, #6b6f78 58% 100%),
			linear-gradient(
					to right,
					transparent 8%,
					#d9b38c 8% 30%,
					transparent 30% 38%,
					#c98d7a 38% 62%,
					transparent 62% 70%,
					#e0cfa9 70% 92%,
					transparent 92%
				)
				0 26% / 100% 40% no-repeat,
			linear-gradient(to bottom, #7cc3e8, #bfe3f2);
	}
	.compass {
		display: grid;
		place-items: center;
	}
	.compass.modern {
		position: absolute;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%) scale(0.45);
	}
	.compass.classic,
	.compass.mnemonic {
		transform: scale(0.95);
	}

	.mapthumb {
		width: 100%;
		height: 100%;
	}

	.tips {
		display: flex;
		align-items: center;
		gap: 14px;
	}
	.finger-pic {
		width: 110px;
		flex: none;
	}
	.finger {
		font-size: 32px;
		filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.4));
		animation: swipe 1.8s ease-in-out infinite;
	}
	@keyframes swipe {
		0%,
		100% {
			transform: translateX(-26px) rotate(-12deg);
		}
		50% {
			transform: translateX(26px) rotate(12deg);
		}
	}
	.tips .note {
		margin: 0 0 10px;
	}
	.tips .btn {
		height: 46px;
		font-size: 14px;
	}
</style>
