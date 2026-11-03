<script lang="ts">
	// The way to "Streets I miss", in my streets: a red pin (where the guess went wrong), the name,
	// how many wait. Shows only when there are any.
	import { fmtNum } from '#lib/format.js';
	import { t } from '#lib/i18n/index.svelte.js';

	let { count }: { count: number } = $props();
</script>

{#if count > 0}
	<a class="missed" href="/me/missed">
		<svg viewBox="0 0 24 24" aria-hidden="true"
			><path d="M12 22s7-7.2 7-12.5A7 7 0 0 0 5 9.5C5 14.8 12 22 12 22z" /><path
				class="x"
				d="m9.5 7 5 5m0-5-5 5"
			/></svg
		>
		<span class="name">{t('missedTitle')}</span>
		<b>{fmtNum(count)}</b>
		<svg viewBox="0 0 24 24" class="icon chev" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
	</a>
{/if}

<style>
	.missed {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 54px;
		padding: 8px 12px;
		border-radius: 16px;
		background: color-mix(in srgb, var(--red) 9%, var(--surface));
		border: 1px solid color-mix(in srgb, var(--red) 28%, transparent);
		color: var(--text);
		font-weight: 700;
		font-size: 15.5px;
		text-decoration: none;
		transition: transform 0.1s;
	}
	.missed:active {
		transform: scale(0.98);
	}
	.missed svg:first-child {
		flex: none;
		width: 28px;
		height: 28px;
		fill: var(--red);
		stroke: none;
	}
	.x {
		fill: none;
		stroke: #fff;
		stroke-width: 2.2;
		stroke-linecap: round;
	}
	.name {
		flex: 1;
		min-width: 0;
	}
	b {
		font-family: var(--display);
		font-weight: 800;
		font-size: 17px;
		color: var(--red);
	}
	.chev {
		flex: none;
		color: var(--muted);
	}
</style>
