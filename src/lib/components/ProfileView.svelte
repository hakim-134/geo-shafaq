<script lang="ts">
	// Another player's page, kept short: who, the streets of Tashkent learned (why the game
	// exists), three numbers, the last games. `action` goes next to the name, `children` at
	// the end. The player's own page is a menu of its own (routes/me).
	import type { Snippet } from 'svelte';
	import type { Profile } from '#lib/api/client.js';
	import MapSign from '#lib/maps/MapSign.svelte';
	import GameRow from '#lib/game/GameRow.svelte';
	import { i18n, t } from '#lib/i18n/index.svelte.js';
	import { fmtMonth, fmtNum } from '#lib/format.js';

	let {
		profile,
		own = false,
		action,
		children
	}: { profile: Profile; own?: boolean; action?: Snippet; children?: Snippet } = $props();

	const u = $derived(profile.user);
	const st = $derived(profile.stats);
	const streets = $derived(profile.streets);
	const pct = (n: number) => `${(n / Math.max(streets.total, 1)) * 100}%`;
</script>

<section class="who">
	<span class="avatar big">{u.avatar}</span>
	<div class="who-text">
		<h1>{u.name}</h1>
		<p>
			{#if u.guest}<span class="badge">{t('guestBadge')}</span>{/if}
			{#if u.banned}<span class="badge red">{t('bannedBadge')}</span>{/if}
			<span>{t('joined', { date: fmtMonth(u.joinedAt, i18n.lang) })}</span>
		</p>
	</div>
	{#if action}<div class="who-action">{@render action()}</div>{/if}
</section>

{#if streets.total > 0}
	<section class="streets">
		<MapSign slug="tashkent-streets" name={t('streetsTitle')} size="small" />
		<p class="learned">
			<b>{fmtNum(streets.learned)}</b>
			<span>{t(own ? 'streetsLearnedMe' : 'streetsLearnedOther', { n: streets.learned })}</span>
		</p>
		<div
			class="bar"
			role="img"
			aria-label={t('streetsLine', { seen: streets.seen, total: streets.total })}
		>
			<i class="seen" style:width={pct(streets.seen)}></i>
			<i class="got" style:width={pct(streets.learned)}></i>
		</div>
		<p class="line">
			<span class="key got"></span>{fmtNum(streets.learned)}
			<span class="key seen"></span>{t('streetsLine', { seen: streets.seen, total: streets.total })}
		</p>
		{#if own}<p class="hint">{t('streetsHint')}</p>{/if}
	</section>
{/if}

<section class="numbers">
	<div><b>{fmtNum(st.games)}</b><span>{t('games')}</span></div>
	<div><b>{fmtNum(st.best)}</b><span>{t('best')}</span></div>
	<div><b>{fmtNum(st.perfect)}</b><span>{t('statPerfect')}</span></div>
</section>

<section>
	<div class="head">
		<h2 class="section-title">{t('history')}</h2>
	</div>
	<div class="list">
		{#each profile.recent as g (g.id)}
			<GameRow game={g} />
		{:else}
			<p class="empty">{t('historyEmpty')}</p>
		{/each}
	</div>
</section>

{@render children?.()}

<style>
	section + section {
		margin-top: 30px;
	}
	.who {
		display: flex;
		align-items: center;
		gap: 16px;
	}
	.avatar.big {
		width: 84px;
		height: 84px;
		font-size: 46px;
		background: var(--surface);
		border: 1px solid var(--border);
		box-shadow: 0 6px 18px rgba(19, 35, 63, 0.1);
	}
	.who-text {
		flex: 1;
		min-width: 0;
	}
	h1 {
		font-family: var(--display);
		font-weight: 800;
		font-size: 28px;
		line-height: 1.1;
		letter-spacing: -0.02em;
		overflow-wrap: anywhere;
	}
	.who-text p {
		margin-top: 6px;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 8px;
		font-size: 13.5px;
		color: var(--muted);
	}
	.badge {
		font-size: 13px;
		font-weight: 700;
		padding: 2px 10px;
		border-radius: 999px;
		background: var(--surface-2);
		color: var(--text);
	}
	.badge.red {
		background: color-mix(in srgb, var(--red) 18%, transparent);
	}
	.who-action {
		flex: none;
	}

	/* the streets of Tashkent */
	.streets {
		padding: 18px 18px 16px;
		border-radius: 20px;
		background: var(--surface);
		border: 1px solid var(--border);
	}
	.learned {
		margin-top: 12px;
		display: flex;
		align-items: baseline;
		gap: 10px;
		flex-wrap: wrap;
	}
	.learned b {
		font-family: var(--display);
		font-size: 44px;
		line-height: 1;
		color: var(--green-ink);
	}
	:global(:root[data-theme='dark']) .learned b {
		color: var(--green);
	}
	.learned span {
		font-size: 16px;
		font-weight: 600;
	}
	.bar {
		position: relative;
		margin-top: 14px;
		height: 12px;
		border-radius: 6px;
		background: var(--surface-2);
		overflow: hidden;
	}
	.bar i {
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		border-radius: 6px;
	}
	.bar .seen,
	.key.seen {
		background: color-mix(in srgb, var(--gold) 70%, transparent);
	}
	.bar .got,
	.key.got {
		background: var(--green);
	}
	.line {
		margin-top: 10px;
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 6px;
		font-size: 13px;
		color: var(--muted);
	}
	.key {
		width: 10px;
		height: 10px;
		border-radius: 3px;
		display: inline-block;
	}
	.key.seen {
		margin-left: 8px;
	}
	.hint {
		margin-top: 10px;
		font-size: 12.5px;
		color: var(--muted);
	}

	/* the numbers, as a scoreboard */
	.numbers {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		border-radius: 18px;
		background: var(--lapis);
		color: #fff;
		overflow: hidden;
	}
	.numbers div {
		padding: 14px 10px 12px;
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.numbers div + div {
		border-left: 1px solid rgba(255, 255, 255, 0.1);
	}
	.numbers b {
		font-family: var(--display);
		font-size: 20px;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.numbers span {
		font-size: 11.5px;
		line-height: 1.25;
		color: rgba(255, 255, 255, 0.7);
	}

	.head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
	}
	.list {
		margin-top: 6px;
	}
	.list > :global(* + *) {
		border-top: 1px solid var(--border);
	}
	.empty {
		color: var(--muted);
		font-size: 14px;
		padding: 8px 0;
	}
</style>
