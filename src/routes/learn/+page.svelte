<script lang="ts">
	import MenuRow from '#lib/components/MenuRow.svelte';
	import SubPage from '#lib/components/SubPage.svelte';
	import { t } from '#lib/i18n/index.svelte.js';
</script>

<SubPage title={t('tabLearn')}>
	<nav class="panel-list" aria-label={t('tabLearn')}>
		<MenuRow href="/me/missed" label={t('missedTitle')} color="var(--red)">
			{#snippet icon()}
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<path d="M12 21s6.5-6.6 6.5-11.5a6.5 6.5 0 0 0-13 0C5.5 14.4 12 21 12 21z" />
					<path d="m10 7.5 4 4m0-4-4 4" />
				</svg>
			{/snippet}
		</MenuRow>
		<MenuRow href="/me/streets" label={t('myStreets')} color="var(--gold)">
			{#snippet icon()}
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<path d="M4 20 9.5 4M20 20 14.5 4M12 6v2.5M12 11v2.5M12 16v2.5" />
				</svg>
			{/snippet}
		</MenuRow>
	</nav>
</SubPage>
