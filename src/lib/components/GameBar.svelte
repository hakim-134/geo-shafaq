<script lang="ts">
	import { i18n, langs, setLang, t, type Lang } from '#lib/i18n/index.svelte.js';
	import { theme, toggleTheme } from '#lib/theme.svelte.js';

	let { standalone = false }: { standalone?: boolean } = $props();

	const names: Record<Lang, string> = { uz: 'O‘zbekcha', en: 'English', ru: 'Русский' };
	const short: Record<Lang, string> = { uz: 'O‘z', en: 'En', ru: 'Ru' };
	let langOpen = $state(false);

	function pick(l: Lang) {
		setLang(l);
		langOpen = false;
	}
</script>

<svelte:window onclick={() => (langOpen = false)} />

<header class="bar" class:standalone>
	<div class="brand">
		<!-- the eight-point star: the mark of the new look -->
		<svg viewBox="0 0 32 32" aria-hidden="true">
			<path
				d="M16 1l3.9 5.6 6.7-1.2-1.2 6.7L31 16l-5.6 3.9 1.2 6.7-6.7-1.2L16 31l-3.9-5.6-6.7 1.2 1.2-6.7L1 16l5.6-3.9-1.2-6.7 6.7 1.2z"
				class="ray"
			/>
			<path
				d="M16 8l2.3 3.3 3.9-.7-.7 3.9L24.8 16l-3.3 2.3.7 3.9-3.9-.7L16 24.8l-2.3-3.3-3.9.7.7-3.9L7.2 16l3.3-2.3-.7-3.9 3.9.7z"
				class="core"
			/>
			<circle cx="16" cy="16" r="3.2" class="eye" />
		</svg>
		<span class="d float">Geo<b>Shafaq</b></span>
	</div>
	<div class="right">
		<div class="lang">
			<button
				class="tool"
				aria-haspopup="menu"
				aria-expanded={langOpen}
				aria-label="Til / Language / Язык"
				onclick={(e) => {
					e.stopPropagation();
					langOpen = !langOpen;
				}}
			>
				{short[i18n.lang]}
			</button>
			{#if langOpen}
				<div class="menu" role="menu">
					{#each langs as l (l)}
						<button role="menuitemradio" aria-checked={i18n.lang === l} onclick={() => pick(l)}
							>{names[l]}</button
						>
					{/each}
				</div>
			{/if}
		</div>
		<button class="tool" onclick={toggleTheme} title={t('theme')} aria-label={t('theme')}>
			<!-- what a tap brings: the moon by day, the sun by night -->
			{#if theme.value === 'dark'}
				<svg viewBox="0 0 24 24" aria-hidden="true"
					><circle cx="12" cy="12" r="4.2" /><path
						d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"
					/></svg
				>
			{:else}
				<svg viewBox="0 0 24 24" aria-hidden="true"
					><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" /></svg
				>
			{/if}
		</button>
	</div>
</header>

<style>
	.bar {
		/* the star's heart: the plaque's deep turquoise (the look lab's star-in) */
		--star-in: #0a4753;
		height: 60px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		flex: none;
	}
	.standalone {
		padding: 0 16px;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-right: auto;
		font-size: 23px;
		letter-spacing: -0.015em;
		color: var(--on-ground);
		text-decoration: none;
		white-space: nowrap;
		flex: none;
	}
	.brand b {
		font-weight: inherit;
		color: var(--gold-text);
	}
	.brand svg {
		width: 28px;
		height: 28px;
		flex: none;
		filter: drop-shadow(0 2px 0 var(--stack));
	}
	.ray {
		fill: var(--gold);
	}
	.core {
		fill: var(--star-in);
		opacity: 0.92;
	}
	.eye {
		fill: var(--gold-hi);
	}
	:global(:root[data-theme='dark']) .bar {
		--star-in: #0b4e5a;
	}
	.right {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
	}
	.lang {
		position: relative;
	}
	.tool {
		height: 40px;
		min-width: 40px;
		padding: 0 10px;
		border: none;
		border-radius: var(--r-s);
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--chip-bg);
		box-shadow: inset 0 0 0 1.5px var(--chip-line);
		color: var(--on-ground);
		font-weight: 700;
		font-size: 14px;
		transition: background 0.15s;
	}
	.tool:hover {
		background: color-mix(in srgb, var(--chip-bg), #fff 10%);
	}
	.tool svg {
		width: 20px;
		height: 20px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2.2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.menu {
		position: absolute;
		right: 0;
		top: calc(100% + 8px);
		z-index: 50;
		min-width: 160px;
		padding: 6px;
		border-radius: var(--r-m);
		background: var(--panel);
		color: var(--ink);
		box-shadow:
			inset 0 0 0 1px var(--panel-line),
			0 4px 0 var(--stack-2),
			0 18px 40px var(--shade);
		display: flex;
		flex-direction: column;
		animation: drop 0.25s var(--spring);
	}
	@keyframes drop {
		from {
			opacity: 0;
			transform: translateY(-6px) scale(0.96);
		}
	}
	.menu button {
		border: none;
		background: none;
		color: inherit;
		text-align: left;
		padding: 11px 12px;
		border-radius: 10px;
		font-size: 15px;
		font-weight: 600;
	}
	.menu button:hover {
		background: var(--panel-2);
	}
	.menu button[aria-checked='true'] {
		font-weight: 800;
		color: var(--gold-on-panel);
	}
	@media (min-width: 961px) {
		.bar {
			height: 78px;
		}
		.standalone {
			padding: 0 40px;
		}
		.brand {
			font-size: 27px;
		}
		.brand svg {
			width: 32px;
			height: 32px;
		}
	}
</style>
