<script lang="ts">
	// An address that is not in the game: a lost street, not a stack trace.
	import TopBar from '#lib/components/TopBar.svelte';
	import MapSign from '#lib/maps/MapSign.svelte';
	import { t } from '#lib/i18n/index.svelte.js';
</script>

<TopBar />

<main class="lost">
	<div class="sign-wrap"><MapSign slug="lost" name="404" top={t('notFoundTitle')} /></div>
	<p>{t('notFoundText')}</p>
	<a class="btn btn-primary" href="/">{t('home')}</a>
</main>

<style>
	.lost {
		max-width: 440px;
		margin: 0 auto;
		padding: 48px 24px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 22px;
		text-align: center;
	}
	.sign-wrap {
		width: 100%;
		transform: rotate(-3deg);
	}
	p {
		color: var(--muted);
	}
</style>
