<script lang="ts">
	// A game's settings as three facts a child can read: how hard (a coloured dot), how many
	// rounds (a flag), how much time (a clock). The home's settings line and a room's lobby.
	// compact: on a phone the facts share one line with the place's sign (a room's lobby), so
	// the rounds are a number by the flag and the clock shows only when there is a limit.
	import { t } from '#lib/i18n/index.svelte.js';
	import { fmtClock } from '#lib/format.js';
	import type { Choice } from '#lib/rules.js';

	let { choice, compact = false }: { choice: Choice; compact?: boolean } = $props();

	const diffColor = { easy: 'var(--green)', normal: 'var(--star)', hard: 'var(--red)' };
	const rounds = $derived(choice.rounds ? t('nRounds', { n: choice.rounds }) : t('endlessShort'));
	const time = $derived(choice.timeSec ? fmtClock(choice.timeSec) : t('noTimeLimit'));
</script>

<span class="facts" class:compact>
	<span class="fact">
		<i class="diff" style:background={diffColor[choice.preset]}></i>
		{t(`diff_${choice.preset}`)}
	</span>
	<span class="fact" title={rounds}>
		<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"
			><path d="M5 21V4M5 4h11l-2 4 2 4H5" /></svg
		>
		{#if compact}
			<span class="long">{rounds}</span><span class="short" aria-hidden="true"
				>{choice.rounds || '∞'}</span
			>
		{:else}
			{rounds}
		{/if}
	</span>
	<span class="fact" class:none={!choice.timeSec}>
		<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"
			><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2M9.5 2.5h5" /></svg
		>
		{time}
	</span>
</span>

<style>
	.facts {
		display: inline-flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 6px 14px;
		font-weight: 600;
	}
	.fact {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		white-space: nowrap;
	}
	.fact .icon {
		width: 17px;
		height: 17px;
		color: var(--muted);
	}
	.diff {
		width: 12px;
		height: 12px;
		border-radius: 50%;
	}
	.short {
		display: none;
	}
	@media (max-width: 640px) {
		.compact {
			gap: 6px 12px;
		}
		.compact .none {
			display: none;
		}
		/* the words stay for screen readers */
		.compact .long {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip-path: inset(50%);
		}
		.compact .short {
			display: inline;
		}
	}
</style>
