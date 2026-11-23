<script lang="ts">
	// The player's own preferences, each choice shown as what it looks like: the words in each
	// language, a small screen in light and dark, the three compasses turning over a street,
	// the three map looks, the sound (it plays when turned on), the first game's finger. Each
	// takes effect at once.
	import SubPage from '#lib/components/SubPage.svelte';
	import ChoiceTiles from '#lib/components/ChoiceTiles.svelte';
	import { i18n, langs, setLang, t, type Lang } from '#lib/i18n/index.svelte.js';
	import { theme, setTheme } from '#lib/theme.svelte.js';
	import { compass, MNEMONIC } from '#lib/compass.svelte.js';
	import { LAYERS, savedLayer, saveLayer, type Layer } from '#lib/map/map.js';
	import { load, save } from '#lib/storage.js';
	import { showToast } from '#lib/toast.svelte.js';

	const names: Record<Lang, string> = { uz: 'O‘zbekcha', en: 'English', ru: 'Русский' };
	const sample: Record<Lang, string> = { uz: 'Qayerdasiz?', en: 'Where are you?', ru: 'Где вы?' };

	let layer = $state<Layer>(savedLayer());
	let tipsDone = $state(!!load('coach_done', ''));

	function pickLayer(l: Layer) {
		layer = l;
		saveLayer(l);
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
			<h2 class="section-title">{t('langLabel')}</h2>
			<div class="tiles three">
				{#each langs as l (l)}
					<button class="tile" aria-pressed={i18n.lang === l} onclick={() => setLang(l)}>
						<span class="pic words"><b class="d">{sample[l]}</b></span>
						<span class="name">{names[l]}</span>
					</button>
				{/each}
			</div>
		</section>

		<section>
			<h2 class="section-title">{t('theme')}</h2>
			<div class="tiles two">
				{#each ['light', 'dark'] as const as th (th)}
					<button class="tile" aria-pressed={theme.value === th} onclick={() => setTheme(th)}>
						<!-- a tiny home in its own colours: the gold tag, the title, the map, the green key -->
						<span class="pic screen {th}" aria-hidden="true">
							<svg viewBox="0 0 120 84">
								<defs>
									<linearGradient id="ground-{th}" x1="0" y1="0" x2="0" y2="1">
										<stop offset="0" stop-color={th === 'light' ? '#0d808d' : '#0c3b43'} />
										<stop offset="1" stop-color={th === 'light' ? '#08606c' : '#062830'} />
									</linearGradient>
								</defs>
								<rect width="120" height="84" fill="url(#ground-{th})" />
								<circle cx="12" cy="9" r="3.2" fill="#f4b92e" />
								<rect x="18" y="7" width="26" height="4.5" rx="2" fill="#fff" />
								<rect x="28" y="17" width="30" height="6" rx="2" fill="#f4b92e" />
								<rect x="28" y="25.5" width="64" height="7" rx="2.5" fill="#fff" />
								<path
									d="M20 39 36 37l9 6 13 2 9 4 10-2 6 4 13-3-3 6-11 1-6 6-6-3-6 5-9-5-11-4-7-4-8 2-6-3z"
									fill={th === 'light' ? '#fff9ec' : '#efe5cf'}
									stroke={th === 'light' ? '#0a606c' : '#0a3a42'}
									stroke-width="0.8"
									stroke-linejoin="round"
								/>
								<circle cx="86" cy="51" r="3.2" fill="#f4b92e" stroke="#fff" stroke-width="1.2" />
								<rect x="10" y="70.5" width="100" height="10" rx="4" fill="#0b6a2e" />
								<rect x="10" y="67" width="100" height="11" rx="4" fill="#18a84c" />
							</svg>
						</span>
						<span class="name">{th === 'light' ? t('themeLight') : t('themeDark')}</span>
					</button>
				{/each}
			</div>
		</section>

		<section>
			<h2 class="section-title">{t('sound')}</h2>
			<ChoiceTiles kind="sound" />
			<p class="note">{t('soundNote')}</p>
		</section>

		<section>
			<h2 class="section-title">{t('compass')}</h2>
			<ChoiceTiles kind="compass" />
			<p class="note">{t(`compassNote_${compass.style}`, MNEMONIC)}</p>
		</section>

		<section>
			<h2 class="section-title">{t('mapLook')}</h2>
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
			<h2 class="section-title">{t('tipsLabel')}</h2>
			<div class="tips panel">
				<span class="pic street finger-pic" aria-hidden="true"><span class="finger">👆</span></span>
				<div>
					<p>{t('tipsNote')}</p>
					<!-- once asked for, a word that it's on, not a key that does nothing -->
					{#if tipsDone}
						<button class="btn btn-ghost" onclick={tipsAgain}>{t('tipsAgain')}</button>
					{:else}
						<p class="on">
							<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"
								><path d="m5 12.5 4.5 4.5L19 7.5" /></svg
							>{t('tipsOn')}
						</p>
					{/if}
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
	.section-title {
		margin-bottom: 12px;
	}
	.note {
		margin-top: 12px;
		font-size: 14px;
		font-weight: 500;
		color: var(--on-ground-3);
	}

	/* every choice is a milk tile: a picture of it in a soft well, its name; the chosen one wears
	   a gold ring and a gold tick, gold being what is the player's own */
	.tiles {
		display: grid;
		gap: 12px;
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
		padding: 7px 7px 10px;
		border: none;
		border-radius: 20px;
		background: var(--panel);
		color: var(--ink);
		box-shadow:
			0 3px 0 var(--panel-lip),
			0 10px 20px var(--shade);
		transition:
			transform 0.1s var(--out),
			box-shadow 0.15s;
	}
	.tile:active {
		transform: translateY(2px) scale(0.98);
	}
	.tile[aria-pressed='true'] {
		box-shadow:
			inset 0 0 0 3px var(--gold),
			0 3px 0 var(--gold-lo),
			0 10px 20px var(--shade);
	}
	.tile[aria-pressed='true']::after {
		content: '';
		position: absolute;
		top: -7px;
		right: -7px;
		width: 26px;
		height: 26px;
		border-radius: 50%;
		background:
			url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='m6 12.5 4 4L18 8' fill='none' stroke='%233a2600' stroke-width='3.2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")
				center / 17px no-repeat,
			linear-gradient(180deg, var(--gold-hi), var(--gold));
		box-shadow: 0 2px 0 var(--gold-lo);
		animation: pop-in 0.3s var(--spring);
	}
	.name {
		font-weight: 700;
		font-size: 14.5px;
		text-align: center;
	}
	.pic {
		position: relative;
		display: grid;
		place-items: center;
		height: 78px;
		border-radius: 14px;
		overflow: hidden;
		background: var(--panel-2);
	}

	.words b {
		font-size: 13px;
		line-height: 1.15;
		padding: 0 6px;
		text-align: center;
		color: var(--ink);
	}

	/* the whole tiny home always shows; a wide tile (a laptop) shows more ground round it */
	.screen {
		height: 96px;
	}
	.screen.light {
		background: linear-gradient(180deg, #0d808d, #08606c);
	}
	.screen.dark {
		background: linear-gradient(180deg, #0c3b43, #062830);
	}
	.screen svg {
		width: 100%;
		height: 100%;
	}

	/* a bit of street (sky, houses, road) under the first game's finger */
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
	.mapthumb {
		width: 100%;
		height: 100%;
	}

	.tips {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 12px;
	}
	.finger-pic {
		width: 108px;
		height: 96px;
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
	.tips p {
		margin-bottom: 10px;
		font-size: 14px;
		line-height: 1.4;
		color: var(--ink-2);
	}
	.tips .btn {
		height: 46px;
		padding: 0 16px;
		font-size: 14px;
	}
	.tips .on {
		display: flex;
		align-items: center;
		gap: 6px;
		margin: 0;
		font-weight: 700;
		color: var(--gold-on-panel);
	}
	.tips .on .icon {
		width: 18px;
		height: 18px;
		stroke-width: 3;
	}
</style>
