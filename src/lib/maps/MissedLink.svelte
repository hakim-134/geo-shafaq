<script lang="ts">
	// The way to "Streets I miss", in my streets: one row of a milk list, like the profile's
	// menu, with a red pin (where the guess went wrong: red is a miss) and how many wait. Shows
	// only when there are any.
	import MenuRow from '#lib/components/MenuRow.svelte';
	import { fmtNum } from '#lib/format.js';
	import { t } from '#lib/i18n/index.svelte.js';

	let { count }: { count: number } = $props();
</script>

{#if count > 0}
	<nav class="panel-list missed">
		<MenuRow href="/me/missed" label={t('missedTitle')} fact={fmtNum(count)} color="var(--red)">
			{#snippet icon()}<svg viewBox="0 0 24 24"
					><path d="M12 21s6.5-6.6 6.5-11.5a6.5 6.5 0 0 0-13 0C5.5 14.4 12 21 12 21z" /><path
						d="m10 7.5 4 4m0-4-4 4"
					/></svg
				>{/snippet}
		</MenuRow>
	</nav>
{/if}

<style>
	/* the count in the miss's red, louder than a menu's quiet fact */
	.missed :global(.fact) {
		font-family: var(--f-disp);
		font-weight: 900;
		font-size: 18px;
		color: var(--red);
	}
</style>
