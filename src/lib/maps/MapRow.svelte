<script lang="ts">
	// One map in a list: its small sign, how many played and liked it; on the player's own list, who
	// it's open to.
	import type { Schemas } from '#lib/api/client.js';
	import { fmtNum } from '#lib/format.js';
	import { t, tx, type Key } from '#lib/i18n/index.svelte.js';
	import MapSign from './MapSign.svelte';

	let { map: m, own = false }: { map: Schemas['MapCard']; own?: boolean } = $props();

	const status = $derived.by((): Key | null => {
		if (!own) return null;
		if (m.moderation === 'pending') return 'mod_pending';
		if (m.moderation === 'rejected') return 'mod_rejected';
		return `vis_${m.visibility}` as Key;
	});
</script>

<a class="row" href={`/maps/${m.slug}`}>
	<span class="sign"><MapSign slug={m.slug} name={tx(m.name)} size="small" /></span>
	<span class="facts">
		{#if status}<span class="status">{t(status)}</span>{/if}
		<span class="n" title={t('mapPlays', { n: m.plays })}>
			<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" /></svg>
			{fmtNum(m.plays)}
		</span>
		{#if m.likes}
			<span class="n heart">♥ {fmtNum(m.likes)}</span>
		{/if}
	</span>
</a>

<style>
	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		min-height: 64px;
		padding: 8px 0;
		text-decoration: none;
		color: var(--text);
	}
	.sign {
		min-width: 0;
	}
	.facts {
		flex: none;
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 4px 10px;
		font-size: 14px;
		font-weight: 600;
		color: var(--muted);
	}
	.status {
		font-size: 12.5px;
		padding: 2px 8px;
		border-radius: 999px;
		background: var(--surface-2);
		color: var(--text);
	}
	.n {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-variant-numeric: tabular-nums;
	}
	.n svg {
		width: 13px;
		height: 13px;
		fill: currentColor;
	}
	.heart {
		color: var(--red);
	}
</style>
