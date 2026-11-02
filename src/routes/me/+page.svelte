<script lang="ts">
	// The player's own page, kept short: who, the streets learned (why the game exists), three
	// numbers, and a menu to the rest, each a simple page of its own: games, streets, records,
	// settings, ways to sign in, name and picture.
	import TopBar from '#lib/components/TopBar.svelte';
	import MenuRow from '#lib/components/MenuRow.svelte';
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
	const streets = $derived(profile?.streets);
</script>

<svelte:head><title>{me?.user.name ?? t('profile')} — Shafaq Geo</title></svelte:head>

<TopBar />

<main class="me">
	{#if profile && me}
		<section class="who">
			<a class="avatar big" href="/me/edit" aria-label={t('editNameAvatar')}>{me.user.avatar}</a>
			<div class="who-text">
				<h1 use:fitWords={me.user.name}>{me.user.name}</h1>
				<p>
					{#if me.user.guest}<span class="badge">{t('guestBadge')}</span>{/if}
					<span>{t('joined', { date: fmtMonth(profile.user.joinedAt, i18n.lang) })}</span>
				</p>
			</div>
			<a class="icon-btn" href="/me/edit" aria-label={t('editNameAvatar')}>
				<svg viewBox="0 0 24 24" class="icon"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" /></svg
				>
			</a>
		</section>

		<!-- the big picture: the player's own Tashkent; a tap on a district shows its streets -->
		<section class="my-map">
			<CityMap glow={profile.stats.games === 0} onpick={(c) => (district = c)} />
		</section>

		<section class="numbers">
			<div><b>{fmtNum(profile.stats.games)}</b><span>{t('games')}</span></div>
			<div><b>{fmtNum(profile.stats.best)}</b><span>{t('best')}</span></div>
			<div><b>{fmtNum(profile.stats.perfect)}</b><span>{t('statPerfect')}</span></div>
		</section>

		<nav class="menu">
			<MenuRow
				href="/games"
				label={t('myGames')}
				fact={t('nGames', { n: profile.stats.games })}
				color="var(--sign-blue)"
			>
				{#snippet icon()}<svg viewBox="0 0 24 24"
						><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg
					>{/snippet}
			</MenuRow>
			<MenuRow
				href="/me/streets"
				label={t('myStreets')}
				fact={streets?.learned ? `${fmtNum(streets.learned)} / ${fmtNum(streets.total)}` : ''}
				color="var(--green)"
			>
				{#snippet icon()}<svg viewBox="0 0 24 24"
						><rect x="3" y="7" width="18" height="10" rx="2" /><path d="M7 12h10" /></svg
					>{/snippet}
			</MenuRow>
			<MenuRow
				href="/me/records"
				label={t('myRecords')}
				fact={profile.maps.length ? t('nMaps', { n: profile.maps.length }) : ''}
				color="var(--gold)"
			>
				{#snippet icon()}<svg viewBox="0 0 24 24"
						><path
							d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7"
						/></svg
					>{/snippet}
			</MenuRow>
			<MenuRow href="/settings" label={t('settings')} color="var(--lapis-2)">
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
			<section class="save">
				<b>{t('nudgeTitle')}</b>
				<p>{t('nudgeText')}</p>
				<button class="btn btn-telegram" onclick={() => openSignIn('save')}>{t('signIn')}</button>
			</section>
		{/if}
	{:else if failed}
		<div class="center">
			<p>{t('err_network')}</p>
			<button class="btn btn-primary" onclick={load}>{t('retry')}</button>
		</div>
	{:else}
		<div class="center"><span class="spinner"></span></div>
	{/if}
</main>

<DistrictSheet place={district} onclose={() => (district = null)} />

<style>
	.me {
		max-width: 640px;
		margin: 0 auto;
		padding: 12px 24px 64px;
		display: flex;
		flex-direction: column;
		gap: 22px;
	}
	.center {
		min-height: 50vh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 16px;
		color: var(--muted);
	}
	.who {
		display: flex;
		align-items: center;
		gap: 16px;
	}
	.avatar.big {
		width: 80px;
		height: 80px;
		font-size: 44px;
		background: var(--surface);
		border: 1px solid var(--border);
		box-shadow: 0 4px 0 var(--edge);
		text-decoration: none;
	}
	.who-text {
		flex: 1;
		min-width: 0;
	}
	h1 {
		font-family: var(--display);
		font-weight: 800;
		font-size: 26px;
		line-height: 1.1;
		letter-spacing: -0.02em;
	}
	.who-text p {
		margin-top: 6px;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 8px;
		font-size: 14px;
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

	/* the big picture: my map (its empty caption takes no room under it) */
	.my-map :global(.caption:not(:has(b))) {
		display: none;
	}
	.my-map {
		padding: 18px 20px 14px;
		border-radius: 22px;
		background: var(--surface);
		border: 1px solid var(--border);
		box-shadow: 0 4px 0 var(--edge);
	}

	.numbers {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		border-radius: 20px;
		overflow: hidden;
		background: var(--lapis);
		color: #fff;
	}
	.numbers div {
		padding: 14px 14px 12px;
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.numbers div + div {
		border-left: 1px solid rgba(255, 255, 255, 0.12);
	}
	.numbers b {
		font-family: var(--display);
		font-weight: 800;
		font-size: 22px;
		font-variant-numeric: tabular-nums;
	}
	.numbers span {
		font-size: 13px;
		opacity: 0.75;
	}

	.save {
		padding: 18px;
		border-radius: 22px;
		background: color-mix(in srgb, var(--telegram) 10%, var(--surface));
		border: 1px solid color-mix(in srgb, var(--telegram) 30%, transparent);
	}
	.save b {
		font-family: var(--display);
		font-size: 15px;
	}
	.save p {
		margin: 6px 0 14px;
		font-size: 14px;
		color: var(--muted);
	}
	.save .btn {
		width: 100%;
		height: 50px;
	}

	.menu {
		display: flex;
		flex-direction: column;
		margin: 0 -12px;
	}
	@media (max-width: 640px) {
		.me {
			padding: 8px 16px 48px;
		}
		/* the map from edge to edge of the card, its names as big as a phone allows */
		.my-map {
			padding: 14px 0 6px;
		}
		.my-map :global(.head) {
			padding: 0 16px;
		}
	}
</style>
