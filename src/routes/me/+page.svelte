<script lang="ts">
	// The player's own page, kept short: who (the face as a big gold coin, a tap changes it), the
	// player's own Tashkent (why the game exists: a tap on a district shows its streets), up to
	// three numbers on a milk strip (never a 0), and a menu to the rest, each a simple page of its own. A guest is
	// asked, once, at the end, to keep the games with Telegram. On a laptop the map stands large
	// at the right and the rest beside it, as the home's map does.
	import GameBar from '#lib/components/GameBar.svelte';
	import MenuRow from '#lib/components/MenuRow.svelte';
	import Coin from '#lib/barg/Coin.svelte';
	import CityMap from '#lib/maps/CityMap.svelte';
	import DistrictSheet from '#lib/maps/DistrictSheet.svelte';
	import { api, call, type Profile, type Schemas } from '#lib/api/client.js';
	import { ensureSession, session } from '#lib/session.svelte.js';
	import { openSignIn } from '#lib/account.svelte.js';
	import { i18n, t } from '#lib/i18n/index.svelte.js';
	import { fmtMonth, fmtNum } from '#lib/format.js';
	import { fitWords } from '#lib/fit.js';

	let profile = $state<Profile | null>(null);
	let failed = $state(false);
	let district = $state<Schemas['PlaceCard'] | null>(null); // tapped on the map

	$effect(() => {
		void session.version;
		load();
	});

	async function load() {
		try {
			await ensureSession();
			profile = await call(api().GET('/v1/me/profile'));
			failed = false;
		} catch {
			failed = true;
		}
	}

	const me = $derived(session.me);
	const ids = $derived(me?.identities ?? []);
	const providerName = { telegram: 'Telegram', google: 'Google' } as const;
	const waysFact = $derived(
		ids.length ? ids.map((i) => providerName[i.provider]).join(', ') : t('notLinked')
	);
</script>

<svelte:head><title>{me?.user.name ?? t('profile')} — GeoShafaq</title></svelte:head>

<GameBar standalone />

<main class="me">
	{#if profile && me}
		<section class="who">
			<a class="face" href="/me/edit" aria-label={t('editNameAvatar')} title={t('editNameAvatar')}>
				<span class="avatar coin" data-frame={me.user.prefs?.frame}>{me.user.avatar}</span>
				<span class="pen" aria-hidden="true"
					><svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" /></svg></span
				>
			</a>
			<div class="who-text">
				{#if me.user.guest}<span class="kick-tag">{t('guestBadge')}</span>{/if}
				<h1 class="d float" use:fitWords={me.user.name}>{me.user.name}</h1>
				<p class="joined">{t('joined', { date: fmtMonth(profile.user.joinedAt, i18n.lang) })}</p>
				{#if me.barg}
					<a class="barg chip" href="/me/wallet" aria-label={t('walletTitle')}>
						<Coin size={22} />
						<b class="d">{fmtNum(me.barg)}</b>
						<svg viewBox="0 0 24 24" class="icon chev" aria-hidden="true"
							><path d="m9 6 6 6-6 6" /></svg
						>
					</a>
				{/if}
			</div>
		</section>

		<!-- the big picture: the player's own Tashkent; a tap on a district shows its streets -->
		<section class="my-map">
			<CityMap glow={profile.stats.games === 0} onpick={(c) => (district = c)} />
		</section>

		<!-- up to three numbers: one at 0 has no cell, none at all before the first game -->
		{#if profile.stats.games || profile.stats.best || profile.stats.perfect}
			<div class="stats">
				{#if profile.stats.games}
					<div><b>{fmtNum(profile.stats.games)}</b><span>{t('games')}</span></div>
				{/if}
				{#if profile.stats.best}
					<div><b>{fmtNum(profile.stats.best)}</b><span>{t('best')}</span></div>
				{/if}
				{#if profile.stats.perfect}
					<div><b>{fmtNum(profile.stats.perfect)}</b><span>{t('statPerfect')}</span></div>
				{/if}
			</div>
		{/if}

		<nav class="panel-list menu">
			<MenuRow
				href="/games"
				label={t('myGames')}
				fact={profile.stats.games ? t('nGames', { n: profile.stats.games }) : ''}
			>
				{#snippet icon()}<svg viewBox="0 0 24 24"
						><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg
					>{/snippet}
			</MenuRow>
			<MenuRow
				href="/me/records"
				label={t('myRecords')}
				fact={profile.maps.length ? t('nMaps', { n: profile.maps.length }) : ''}
				color="var(--gold-lo)"
			>
				{#snippet icon()}<svg viewBox="0 0 24 24"
						><path
							d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7"
						/></svg
					>{/snippet}
			</MenuRow>
			{#if !me.barg}
				<MenuRow href="/me/wallet" label={t('walletTitle')} color="var(--gold-lo)">
					{#snippet icon()}<Coin size={24} />{/snippet}
				</MenuRow>
			{/if}
			<MenuRow href="/shop" label={t('shopTitle')} color="var(--key)">
				{#snippet icon()}<svg viewBox="0 0 24 24"
						><path d="M4 9.5 5.5 4h13L20 9.5M4 9.5V20h16V9.5M4 9.5h16M9.5 20v-6h5v6" /></svg
					>{/snippet}
			</MenuRow>
			<MenuRow href="/settings" label={t('settings')} color="#4f6f76">
				{#snippet icon()}<svg viewBox="0 0 24 24"
						><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle
							cx="10"
							cy="17"
							r="2"
						/></svg
					>{/snippet}
			</MenuRow>
			<MenuRow
				href="/me/accounts"
				label={t('accountsTitle')}
				fact={waysFact}
				color="var(--telegram)"
			>
				{#snippet icon()}<svg viewBox="0 0 24 24"
						><rect x="5" y="10.5" width="14" height="10" rx="2" /><path
							d="M8 10.5V8a4 4 0 0 1 8 0v2.5"
						/></svg
					>{/snippet}
			</MenuRow>
		</nav>

		{#if me.user.guest}
			<section class="panel save">
				<h2 class="section-title">{t('nudgeTitle')}</h2>
				<p>{t('nudgeText')}</p>
				<button class="btn btn-telegram" onclick={() => openSignIn('save')}>
					<svg viewBox="0 0 24 24" aria-hidden="true"
						><path d="m21 4.5-3 15-5.5-4.5-3 3v-5l8-7.5-10 6L3 10z" /></svg
					>
					{t('signIn')}
				</button>
			</section>
		{/if}
	{:else if failed}
		<div class="empty-state center">
			<p>{t('err_network')}</p>
			<button class="btn btn-primary" onclick={load}><span class="lbl">{t('retry')}</span></button>
		</div>
	{:else}
		<div class="center"><span class="spinner"></span></div>
	{/if}
</main>

<DistrictSheet place={district} onclose={() => (district = null)} />

<style>
	/* one column on a phone; on a laptop the map at the right, the rest at the left */
	.me {
		max-width: 640px;
		margin: 0 auto;
		padding: 8px 16px 48px;
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 24px;
	}
	.center {
		grid-column: 1 / -1;
		min-height: 50vh;
		display: grid;
		place-content: center;
		justify-items: center;
	}

	/* who: the face as a big gold coin (a tap changes it: the small pen says so), the name
	   floating on the ground, "mehmon" as the gold tag over it */
	.who {
		display: flex;
		align-items: center;
		gap: 18px;
	}
	.face {
		position: relative;
		flex: none;
		text-decoration: none;
		transition: transform 0.15s var(--spring);
	}
	.face:hover {
		transform: translateY(-1px) rotate(-4deg);
	}
	.face:active {
		transform: translateY(3px);
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
	.pen {
		position: absolute;
		right: -2px;
		bottom: 0;
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background: var(--panel);
		color: var(--ink);
		display: grid;
		place-items: center;
		box-shadow:
			0 2px 0 var(--panel-lip),
			0 4px 10px var(--shade);
	}
	.pen svg {
		width: 16px;
		height: 16px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2.4;
		stroke-linecap: round;
		stroke-linejoin: round;
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
	/* the Barg: a quiet chip on the ground, the coin and the sum; a tap opens the wallet */
	.barg {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		height: 38px;
		padding: 0 8px 0 7px;
		border-radius: 999px;
		transition: transform 0.1s var(--out);
	}
	.barg:active {
		transform: scale(0.96);
	}
	.barg b {
		font-size: 18px;
		line-height: 1;
	}
	.barg .chev {
		width: 16px;
		height: 16px;
		color: var(--on-ground-3);
		stroke-width: 2.6;
	}

	/* the map lies on the ground; its empty caption takes no room under it */
	.my-map :global(.caption:not(:has(b))) {
		display: none;
	}

	.stats b {
		font-size: 30px;
	}

	.save {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.save p {
		font-size: 14.5px;
		line-height: 1.45;
		color: var(--ink-2);
		margin-bottom: 8px;
	}
	.save .btn {
		width: 100%;
	}
	.save .btn svg {
		width: 20px;
		height: 20px;
		stroke-width: 2;
	}

	@media (min-width: 961px) {
		.me {
			max-width: 1180px;
			padding: 18px 40px 64px;
			grid-template-columns: minmax(0, 420px) minmax(0, 1fr);
			grid-template-areas:
				'who map'
				'stats map'
				'menu map'
				'save map'
				'. map';
			grid-template-rows: auto auto auto auto 1fr;
			column-gap: 56px;
			align-items: start;
		}
		.who {
			grid-area: who;
		}
		.stats {
			grid-area: stats;
		}
		.menu {
			grid-area: menu;
		}
		.save {
			grid-area: save;
		}
		.my-map {
			grid-area: map;
			position: sticky;
			top: 18px;
		}
		.my-map :global(.title) {
			font-size: 34px;
		}
	}
</style>
