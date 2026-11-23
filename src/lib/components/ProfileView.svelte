<script lang="ts">
	// Another player's page, kept short: who (the face as a gold coin, the name floating on the
	// ground), the streets of Tashkent learned (why the game exists) on a milk card with
	// Tashkent's face, up to three numbers, the last games; `children` at the end. No zeros (what
	// isn't earned stays out of sight): before the first street learned the card counts the
	// streets seen; before the first street seen there is no card; a number at 0 has no cell.
	// The player's own page is a menu of its own (routes/me).
	import { fitWords } from '#lib/fit.js';
	import type { Snippet } from 'svelte';
	import type { Profile } from '#lib/api/client.js';
	import PlaceInParent from '#lib/maps/PlaceInParent.svelte';
	import Progress from '#lib/maps/Progress.svelte';
	import GameRow from '#lib/game/GameRow.svelte';
	import { i18n, t } from '#lib/i18n/index.svelte.js';
	import { fmtMonth, fmtNum } from '#lib/format.js';

	let { profile, children }: { profile: Profile; children?: Snippet } = $props();

	const u = $derived(profile.user);
	const st = $derived(profile.stats);
	const streets = $derived(profile.streets);
</script>

<section class="who">
	<span class="avatar coin" data-frame={u.frame}>{u.avatar}</span>
	<div class="who-text">
		{#if u.banned}<span class="kick-tag banned">{t('bannedBadge')}</span>
		{:else if u.guest}<span class="kick-tag">{t('guestBadge')}</span>{/if}
		<h1 class="d float" use:fitWords={u.name}>{u.name}</h1>
		<p class="joined">{t('joined', { date: fmtMonth(u.joinedAt, i18n.lang) })}</p>
	</div>
</section>

{#if streets.total > 0 && streets.seen > 0}
	<!-- the streets of Tashkent: Tashkent's face, the number learned (or, before the first, the
	     number seen), the bar -->
	<section class="panel streets">
		<span class="face"><PlaceInParent place="toshkent" on="panel" /></span>
		<div class="known">
			<span class="kind">{t('streetsTitle')}</span>
			{#if streets.learned}
				<p class="learned">
					<b class="d">{fmtNum(streets.learned)}</b>
					<span>{t('streetsLearnedOther', { n: streets.learned })}</span>
				</p>
			{:else}
				<p class="learned">
					<b class="d">{fmtNum(streets.seen)}</b>
					<span>{t('streetsSeenOther', { n: streets.seen })}</span>
				</p>
			{/if}
			<Progress
				progress={{
					unit: 'street',
					total: streets.total,
					seen: streets.seen,
					learned: streets.learned
				}}
				wide
				bare
			/>
			{#if streets.learned}
				<p class="line">{t('streetsLine', { seen: streets.seen, total: streets.total })}</p>
			{/if}
		</div>
	</section>
{/if}

{#if st.games || st.best || st.perfect}
	<div class="stats">
		{#if st.games}<div><b>{fmtNum(st.games)}</b><span>{t('games')}</span></div>{/if}
		{#if st.best}<div><b>{fmtNum(st.best)}</b><span>{t('best')}</span></div>{/if}
		{#if st.perfect}<div><b>{fmtNum(st.perfect)}</b><span>{t('statPerfect')}</span></div>{/if}
	</div>
{/if}

<section class="history">
	<h2 class="section-title">{t('history')}</h2>
	{#if profile.recent.length}
		<div class="panel-list">
			{#each profile.recent as g (g.id)}<GameRow game={g} />{/each}
		</div>
	{:else}
		<div class="empty-state"><p>{t('historyEmpty')}</p></div>
	{/if}
</section>

{@render children?.()}

<style>
	.who {
		display: flex;
		align-items: center;
		gap: 18px;
	}
	.coin {
		width: 92px;
		height: 92px;
		font-size: 50px;
		background: linear-gradient(180deg, var(--gold-hi), var(--gold));
		box-shadow:
			inset 0 3px 0 rgba(255, 255, 255, 0.6),
			inset 0 -3px 0 rgba(0, 0, 0, 0.08),
			0 5px 0 var(--gold-lo),
			0 14px 24px var(--shade);
	}
	.who-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 6px;
	}
	h1 {
		display: block;
		width: 100%;
		font-size: 32px;
		line-height: 1.1;
		color: var(--on-ground);
		transform-origin: 0 75%;
	}
	.joined {
		font-size: 14px;
		font-weight: 600;
		color: var(--on-ground-3);
	}
	/* a player shut out: the tag in red, not gold */
	.kick-tag.banned {
		background: var(--red);
		box-shadow: 0 2px 0 #8e0a1a;
		color: #fff;
	}

	/* the streets of Tashkent: the city's face beside the number learned */
	.streets {
		display: flex;
		align-items: center;
		gap: 16px;
	}
	.face {
		flex: none;
		width: 84px;
		height: 84px;
	}
	.known {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.kind {
		font-size: 12.5px;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--gold-on-panel);
	}
	.learned {
		display: flex;
		align-items: baseline;
		gap: 8px;
		flex-wrap: wrap;
		font-weight: 700;
		font-size: 15px;
		color: var(--ink-2);
	}
	.learned b {
		font-size: 40px;
		line-height: 1;
		color: var(--ink);
	}
	.line {
		font-size: 13px;
		font-weight: 600;
		color: var(--ink-3);
	}

	.stats b {
		font-size: 30px;
	}

	.history {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
</style>
