<script lang="ts">
	import { i18n, langs, setLang, t } from '#lib/i18n/index.svelte.js';
	import { theme, toggleTheme } from '#lib/theme.svelte.js';

	const labels = { uz: 'O‘z', en: 'En', ru: 'Ru' };
</script>

<div class="flag-band" aria-hidden="true"></div>
<header class="topbar">
	<a class="brand" href="/">
		<img src="/mark.svg" alt="" width="34" height="34" />
		<span>Shafaq<b>Geo</b></span>
	</a>
	<div class="right">
		<div class="lang-switch" role="group" aria-label="Til / Language">
			{#each langs as l (l)}
				<button aria-pressed={i18n.lang === l} onclick={() => setLang(l)}>{labels[l]}</button>
			{/each}
		</div>
		<button class="icon-btn" onclick={toggleTheme} title={t('theme')} aria-label={t('theme')}>
			{#if theme.value === 'dark'}
				<svg class="icon" viewBox="0 0 24 24"
					><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg
				>
			{:else}
				<svg class="icon" viewBox="0 0 24 24">
					<circle cx="12" cy="12" r="4.5" />
					<path
						d="M12 2v2.5M12 19.5V22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M2 12h2.5M19.5 12H22M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"
					/>
				</svg>
			{/if}
		</button>
	</div>
</header>

<style>
	.topbar {
		max-width: 1200px;
		margin: 0 auto;
		height: 72px;
		padding: 0 24px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 10px;
		text-decoration: none;
		font-family: var(--display);
		font-weight: 800;
		font-size: 21px;
		letter-spacing: -0.01em;
	}
	.brand b {
		color: var(--sky);
		font-weight: 800;
	}
	.right {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.lang-switch {
		display: flex;
		padding: 3px;
		border-radius: 12px;
		background: var(--surface-2);
	}
	.lang-switch button {
		border: none;
		background: transparent;
		height: 34px;
		padding: 0 11px;
		border-radius: 9px;
		font-size: 13px;
		font-weight: 600;
		color: var(--muted);
	}
	.lang-switch button[aria-pressed='true'] {
		background: var(--surface);
		color: var(--text);
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
	}
	@media (max-width: 640px) {
		.topbar {
			height: 64px;
			padding: 0 16px;
		}
		.brand {
			font-size: 18px;
		}
	}
</style>
