<script lang="ts">
	// A player's profile: who, the streets of Tashkent learned (why the game exists), the
	// numbers, the best game on each map, the last games. The player's own page and other
	// players' pages both show it; `action` goes next to the name, `children` at the end.
	import type { Snippet } from 'svelte';
	import type { Profile } from '#lib/api/client.js';
	import MapSign from '#lib/maps/MapSign.svelte';
	import GameRow from '#lib/game/GameRow.svelte';
	import { i18n, t, tx } from '#lib/i18n/index.svelte.js';
	import { fmtDistance, fmtMonth, fmtNum } from '#lib/format.js';

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
	<div><b>{fmtNum(st.rounds)}</b><span>{t('statRounds')}</span></div>
	<div><b>{fmtNum(st.best)}</b><span>{t('best')}</span></div>
	<div><b>{fmtNum(st.avgRound)}</b><span>{t('avgRound')}</span></div>
	<div><b>{fmtNum(st.perfect)}</b><span>{t('statPerfect')}</span></div>
</section>
{#if st.km > 0}<p class="missed">{t('missedKm', { km: fmtDistance(st.km) })}</p>{/if}

{#if profile.maps.length}
	<section>
		<h2 class="section-title">{t('mapsTitle')}</h2>
		<div class="list">
			{#each profile.maps as m (m.map.slug)}
				<a class="best" href={`/game/${m.gameId}`}>
					<MapSign slug={m.map.slug} name={tx(m.map.name)} size="small" />
					<span class="best-score">
						<b>{fmtNum(m.best)}</b>
						<span>{t('nRounds', { n: m.rounds })} · {t('nGames', { n: m.games })}</span>
					</span>
				</a>
			{/each}
		</div>
	</section>
{/if}

<section>
	<div class="head">
		<h2 class="section-title">{t('history')}</h2>
		{#if own && profile.recent.length}<a class="link-btn" href="/games">{t('allGames')}</a>{/if}
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
	section + section,
	section + .missed,
	.missed + section {
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
		font-size: 11.5px;
		font-weight: 700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		padding: 2px 8px;
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
		grid-template-columns: repeat(5, minmax(0, 1fr));
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
	.missed {
		margin-top: 10px;
		font-size: 13px;
		color: var(--muted);
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
	.best {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 12px 0;
		text-decoration: none;
	}
	.best-score {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		flex: none;
	}
	.best-score b {
		font-family: var(--display);
		font-size: 16px;
	}
	.best-score span {
		font-size: 12px;
		color: var(--muted);
	}
	.best:hover b {
		color: var(--sky-ink);
	}
	.empty {
		color: var(--muted);
		font-size: 14px;
		padding: 8px 0;
	}
	@media (max-width: 640px) {
		/* games and best big on top, the other three below */
		.numbers {
			grid-template-columns: repeat(6, minmax(0, 1fr));
		}
		.numbers div {
			grid-column: span 2;
		}
		.numbers div:nth-child(1),
		.numbers div:nth-child(3) {
			grid-column: span 3;
			order: -1;
		}
		.numbers div:nth-child(1) b,
		.numbers div:nth-child(3) b {
			font-size: 26px;
		}
		.numbers div:nth-child(3) {
			border-left: 1px solid rgba(255, 255, 255, 0.1);
		}
		.numbers div:nth-child(2) {
			border-left: none;
		}
		.numbers div:nth-child(2),
		.numbers div:nth-child(4),
		.numbers div:nth-child(5) {
			border-top: 1px solid rgba(255, 255, 255, 0.1);
		}
		.avatar.big {
			width: 72px;
			height: 72px;
			font-size: 40px;
		}
		h1 {
			font-size: 24px;
		}
	}
</style>
