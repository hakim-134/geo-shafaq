<script lang="ts">
	import { i18n, langs, setLang, t, type Lang } from '#lib/i18n/index.svelte.js';
	import { theme, toggleTheme } from '#lib/theme.svelte.js';
	import { session } from '#lib/session.svelte.js';

	const names: Record<Lang, string> = { uz: 'O‘zbekcha', en: 'English', ru: 'Русский' };
	const short: Record<Lang, string> = { uz: 'O‘z', en: 'En', ru: 'Ru' };
	let langOpen = $state(false);

	function pick(l: Lang) {
		setLang(l);
		langOpen = false;
	}
</script>

<svelte:window onclick={() => (langOpen = false)} />

<div class="flag-band" aria-hidden="true"></div>
<header class="topbar">
	<a class="brand" href="/">
		<img src="/mark.svg" alt="" width="32" height="32" />
		<span>Shafaq<b>Geo</b></span>
	</a>
	<div class="right">
		<div class="lang">
			<button
				class="icon-btn lang-btn"
				aria-haspopup="menu"
				aria-expanded={langOpen}
				aria-label="Til / Language / Язык"
				onclick={(e) => {
					e.stopPropagation();
					langOpen = !langOpen;
				}}
			>
				<svg class="icon" viewBox="0 0 24 24"
					><circle cx="12" cy="12" r="9" /><path
						d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"
					/></svg
				>
				<span>{short[i18n.lang]}</span>
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
		{#if session.me}
			<a class="me" href="/me" title={t('profile')}>
				<span class="avatar">{session.me.user.avatar}</span>
				<!-- the name the greeting says, a guest's too ("Ukki 42") -->
				<span class="me-name">{session.me.user.name}</span>
			</a>
		{/if}
	</div>
</header>

<style>
	.topbar {
		max-width: 1200px;
		margin: 0 auto;
		height: 68px;
		padding: 0 24px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 9px;
		text-decoration: none;
		font-family: var(--display);
		font-weight: 800;
		font-size: 20px;
		letter-spacing: -0.01em;
		flex: none;
	}
	.brand b {
		color: var(--sky);
		font-weight: 800;
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
	.lang-btn {
		width: auto;
		padding: 0 11px 0 9px;
		gap: 6px;
		display: flex;
		font-size: 13px;
		font-weight: 600;
	}
	.lang-btn .icon {
		width: 18px;
		height: 18px;
		stroke-width: 1.8;
	}
	.menu {
		position: absolute;
		right: 0;
		top: calc(100% + 6px);
		z-index: 50;
		min-width: 150px;
		padding: 6px;
		border-radius: 14px;
		background: var(--surface);
		border: 1px solid var(--border);
		box-shadow: var(--shadow);
		display: flex;
		flex-direction: column;
	}
	.menu button {
		border: none;
		background: none;
		text-align: left;
		padding: 10px 12px;
		border-radius: 9px;
		font-size: 14.5px;
	}
	.menu button:hover {
		background: var(--surface-2);
	}
	.menu button[aria-checked='true'] {
		font-weight: 700;
		color: var(--sky-ink);
	}
	.me {
		display: flex;
		align-items: center;
		gap: 8px;
		height: 40px;
		padding: 0 14px 0 4px;
		border-radius: 999px;
		background: var(--surface);
		border: 1px solid var(--border);
		text-decoration: none;
		min-width: 0;
		transition: border-color 0.15s;
	}
	.me:hover {
		border-color: var(--sky);
	}
	.me .avatar {
		width: 32px;
		height: 32px;
		font-size: 18px;
		background: var(--bg);
	}
	.me-name {
		font-weight: 600;
		font-size: 14px;
		max-width: 150px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	@media (max-width: 640px) {
		.topbar {
			height: 60px;
			padding: 0 16px;
		}
		.brand {
			font-size: 17px;
		}
		.brand img {
			width: 28px;
			height: 28px;
		}
		.me {
			padding: 0 4px;
		}
		.me-name {
			display: none;
		}
	}
</style>
