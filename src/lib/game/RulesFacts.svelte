<script lang="ts">
	// A game's settings as three facts a child can read: how hard (a coloured dot), how many
	// rounds (a flag), how much time (a clock). The home's settings line and a room's lobby.
	import { t } from '#lib/i18n/index.svelte.js';
	import { fmtClock } from '#lib/format.js';
	import type { Choice } from '#lib/rules.js';

	let { choice }: { choice: Choice } = $props();

	const diffColor = { easy: 'var(--green)', normal: 'var(--star)', hard: 'var(--red)' };
</script>

<span class="facts">
	<span class="fact">
		<i class="diff" style:background={diffColor[choice.preset]}></i>
		{t(`diff_${choice.preset}`)}
	</span>
	<span class="fact">
		<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"
			><path d="M5 21V4M5 4h11l-2 4 2 4H5" /></svg
		>
		{choice.rounds ? t('nRounds', { n: choice.rounds }) : t('endlessShort')}
	</span>
	<span class="fact">
		<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"
			><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2M9.5 2.5h5" /></svg
		>
		{choice.timeSec ? fmtClock(choice.timeSec) : t('noTimeLimit')}
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
</style>
