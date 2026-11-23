<script lang="ts">
	// Page numbers: ‹ 1 … 4 5 6 … 12 ›, each a link (?page=N), so the back button and a shared
	// address land on the same page.
	import { t } from '#lib/i18n/index.svelte.js';

	let { page, pages, href }: { page: number; pages: number; href: (p: number) => string } =
		$props();

	// the first, the last, and two around the current one; gaps become "…"
	const items = $derived.by(() => {
		const keep = new Set([1, pages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages));
		const out: (number | null)[] = [];
		let last = 0;
		for (const p of [...keep].sort((a, b) => a - b)) {
			if (p - last > 1) out.push(p - last === 2 ? p - 1 : null);
			out.push(p);
			last = p;
		}
		return out;
	});
</script>

{#if pages > 1}
	<nav class="pager" aria-label={t('pages')}>
		<a
			class="step"
			class:off={page <= 1}
			href={href(Math.max(page - 1, 1))}
			aria-label={t('prevPage')}
		>
			<svg viewBox="0 0 24 24" class="icon"><path d="m15 6-6 6 6 6" /></svg>
		</a>
		{#each items as p, i (i)}
			{#if p === null}
				<span class="gap">…</span>
			{:else}
				<a
					class="num"
					class:on={p === page}
					aria-current={p === page ? 'page' : undefined}
					href={href(p)}><span class="d">{p}</span></a
				>
			{/if}
		{/each}
		<a
			class="step"
			class:off={page >= pages}
			href={href(Math.min(page + 1, pages))}
			aria-label={t('nextPage')}
		>
			<svg viewBox="0 0 24 24" class="icon"><path d="m9 6 6 6-6 6" /></svg>
		</a>
	</nav>
{/if}

<style>
	/* on the ground: milk tiles with a lip, the page you are on a gold one */
	.pager {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		flex-wrap: wrap;
	}
	.num,
	.step {
		min-width: 46px;
		height: 46px;
		padding: 0 10px;
		border-radius: 14px;
		display: grid;
		place-items: center;
		background: var(--panel);
		color: var(--ink);
		font-family: var(--f-disp);
		font-weight: 900;
		font-size: 17px;
		font-variant-numeric: tabular-nums;
		text-decoration: none;
		box-shadow:
			0 3px 0 var(--panel-lip),
			0 8px 16px var(--shade);
		transition:
			transform 0.1s var(--out),
			box-shadow 0.1s var(--out);
	}
	.num:active,
	.step:active {
		transform: translateY(2px);
		box-shadow: 0 1px 0 var(--panel-lip);
	}
	.num.on {
		background: linear-gradient(180deg, var(--gold-hi), var(--gold));
		color: var(--gold-ink);
		box-shadow:
			0 3px 0 var(--gold-lo),
			0 8px 16px var(--shade);
	}
	.step .icon {
		stroke-width: 2.6;
	}
	.step.off {
		opacity: 0.4;
		pointer-events: none;
	}
	.gap {
		width: 22px;
		text-align: center;
		color: var(--on-ground-2);
		font-weight: 800;
	}
</style>
