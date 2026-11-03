<script lang="ts">
	// A map's own page (PLAN 8.2): its sign, who made it, how many played and liked it, its tags, its
	// best scores. One green button plays it; quietly, a room with friends and its link. The owner
	// also changes its name, who sees it, its tags, or deletes it.
	import { goto } from '$app/navigation';
	import { page as route } from '$app/state';
	import { onMount } from 'svelte';
	import SubPage from '#lib/components/SubPage.svelte';
	import ShareSheet from '#lib/components/ShareSheet.svelte';
	import Sheet from '#lib/components/Sheet.svelte';
	import MapSign from '#lib/maps/MapSign.svelte';
	import MapForm from '#lib/maps/MapForm.svelte';
	import { api, call, ApiError, type Schemas } from '#lib/api/client.js';
	import { createMap, goldArea, goldDots, placeShape, type BBox, type YMap } from '#lib/map/map.js';
	import { ensureSession, session } from '#lib/session.svelte.js';
	import { fmtNum } from '#lib/format.js';
	import { i18n, t, tx, type Key } from '#lib/i18n/index.svelte.js';
	import { loadChoice, rulesFor, saveChoice, testProviders } from '#lib/rules.js';
	import { nativeShare, type Share } from '#lib/game/share.js';
	import { justMade } from '#lib/room.svelte.js';
	import { unlockAudio } from '#lib/sfx.svelte.js';
	import { showToast } from '#lib/toast.svelte.js';

	let data = $state<Schemas['MapPage'] | null>(null);
	let failed = $state<'' | 'network' | 'gone'>('');
	let busy = $state<'' | 'solo' | 'room'>('');
	let sharing = $state<Share | null>(null);
	let settings = $state(false);

	const slug = $derived(route.params.slug ?? '');
	const m = $derived(data?.map);

	$effect(() => {
		void session.version;
		if (slug) load(slug);
	});

	async function load(s: string) {
		try {
			await ensureSession();
			data = await call(api().GET('/v1/maps/{slug}/page', { params: { path: { slug: s } } }));
			failed = '';
		} catch (e) {
			failed = e instanceof ApiError && e.code === 'not_found' ? 'gone' : 'network';
		}
	}

	const errorKeys: Record<string, Key> = {
		no_panorama: 'err_no_panorama',
		daily_cap: 'err_daily_cap',
		network: 'err_network',
		banned: 'bannedText',
		too_many_rooms: 'err_too_many_rooms'
	};
	const body = () => {
		const choice = { ...loadChoice(), map: slug };
		saveChoice(choice); // the home's sign: the last place played
		return { map: slug, rules: rulesFor(choice, testProviders()) };
	};
	async function play() {
		if (busy) return;
		busy = 'solo';
		try {
			const game = await call(api().POST('/v1/games', { body: body() }));
			goto(`/game/${game.id}`);
		} catch (e) {
			busy = '';
			showToast(t(errorKeys[e instanceof ApiError ? e.code : ''] ?? 'err_other'), 3500);
		}
	}
	async function playFriends() {
		if (busy) return;
		busy = 'room';
		unlockAudio();
		try {
			const room = await call(api().POST('/v1/rooms', { body: body() }));
			justMade.code = room.code;
			justMade.at = Date.now();
			goto(`/room/${room.code}`);
		} catch (e) {
			busy = '';
			showToast(t(errorKeys[e instanceof ApiError ? e.code : ''] ?? 'err_other'), 3500);
		}
	}

	async function share() {
		if (!m) return;
		const s = {
			url: `${location.origin}/maps/${slug}`,
			text: t('mapShareText', { map: tx(m.name) })
		};
		if (!(await nativeShare(s))) sharing = s;
	}

	// a like shows at once; if the server says no, it goes back
	async function like() {
		if (!data) return;
		const on = !data.liked;
		data = { ...data, liked: on, likes: data.likes + (on ? 1 : -1) };
		const params = { params: { path: { slug } } };
		try {
			await call(
				on
					? api().PUT('/v1/maps/{slug}/like', params)
					: api().DELETE('/v1/maps/{slug}/like', params)
			);
		} catch {
			data = { ...data, liked: !on, likes: data.likes + (on ? -1 : 1) };
			showToast(t('err_network'));
		}
	}

	// ---------- the small picture of where it is ----------
	let box = $state<HTMLDivElement>();
	let picture: YMap | null = null;
	let drew = false;
	$effect(() => {
		const b = m?.bbox;
		if (!b || !box || drew) return;
		drew = true;
		createMap({ container: box, lang: i18n.lang, layer: 'map', bbox: b as BBox }).then(
			(map) => {
				picture = map;
				map.behaviors.disable(['drag', 'scrollZoom', 'multiTouch', 'dblClickZoom']);
				const shapes: Promise<GeoJSON.Geometry>[] = (m?.places ?? [])
					.slice(0, 12)
					.map((p) => placeShape(p));
				if (data?.streetPoints) goldDots(map, data.streetPoints).catch(() => {});
				if (data?.area) shapes.push(Promise.resolve(data.area as unknown as GeoJSON.Geometry));
				for (const shape of shapes)
					shape.then(goldArea).then(
						(all) => all.forEach((o) => map.geoObjects.add(o)),
						() => {}
					);
			},
			() => {} // no Yandex: the page stands without its picture
		);
	});
	onMount(() => () => picture?.destroy());

	// ---------- the owner ----------
	let name = $state('');
	let visibility = $state<Schemas['MapVisibility']>('unlisted');
	let tags = $state<string[]>([]);
	let saving = $state(false);
	let sure = $state(false);

	function openSettings() {
		if (!data || !m) return;
		name = tx(m.name);
		visibility = data.visibility;
		tags = [...data.tags];
		sure = false;
		settings = true;
	}
	async function save() {
		saving = true;
		try {
			data = await call(
				api().PATCH('/v1/maps/{slug}', {
					params: { path: { slug } },
					body: { name, visibility, tags }
				})
			);
			settings = false;
		} catch (e) {
			showToast(
				t(e instanceof ApiError && e.code === 'bad_name' ? 'mapBadName' : 'err_other'),
				3500
			);
		}
		saving = false;
	}
	async function remove() {
		if (!sure) {
			sure = true;
			return;
		}
		try {
			await call(api().DELETE('/v1/maps/{slug}', { params: { path: { slug } } }));
			if (loadChoice().map === slug) saveChoice({ ...loadChoice(), map: 'tashkent-streets' });
			goto('/maps', { replaceState: true });
		} catch {
			showToast(t('err_other'));
		}
	}

	const status = $derived.by((): Key | null => {
		if (!data?.mine) return null;
		if (data.moderation === 'pending') return 'mod_pending';
		if (data.moderation === 'rejected') return 'mod_rejected';
		return `vis_${data.visibility}` as Key;
	});
</script>

<SubPage
	title={m ? tx(m.name) : t('mapsHome')}
	signed={!!m}
	back={{ href: '/maps', label: t('mapsHome') }}
>
	{#if data && m}
		<div class="head">
			<div class="sign">
				<MapSign slug={m.slug} name={tx(m.name)} top={tx(m.description)} outline={m.outline} />
			</div>
			{#if data.mine}
				<button
					class="icon-btn"
					onclick={openSettings}
					aria-label={t('mapSettings')}
					title={t('mapSettings')}
				>
					<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"
						><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle
							cx="10"
							cy="17"
							r="2"
						/></svg
					>
				</button>
			{/if}
		</div>

		<p class="facts">
			{#if data.by}
				<a href={`/u/${data.by.id}`}>{data.by.avatar} {data.by.name}</a>
				<span aria-hidden="true">·</span>
			{/if}
			<span>{t('nSpots', { n: m.panoramas })}</span>
			{#if status}<span class="status">{t(status)}</span>{/if}
		</p>
		{#if data.moderationNote}<p class="reason">{data.moderationNote}</p>{/if}

		<div class="picture ymap" bind:this={box}></div>

		<div class="numbers">
			<span class="plays">
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" /></svg>
				{t('mapPlays', { n: data.plays })}
			</span>
			<button class="like" aria-pressed={data.liked} aria-label={t('mapLike')} onclick={like}>
				<span class="heart">{data.liked ? '♥' : '♡'}</span>
				{fmtNum(data.likes)}
			</button>
		</div>
		{#if data.tags.length}
			<div class="tags">
				{#each data.tags as x (x)}
					<a class="tag" href={`/maps?tag=${x}`}>{t(`tag_${x}` as Key)}</a>
				{/each}
			</div>
		{/if}

		<button class="btn btn-primary play" disabled={!!busy} onclick={play}>
			{#if busy === 'solo'}<span class="spinner"></span>{:else}<svg
					viewBox="0 0 24 24"
					aria-hidden="true"><path d="M7 4.5v15l12-7.5z" /></svg
				>{/if}
			{t('play')}
		</button>
		<div class="quiet">
			<button class="link-btn" disabled={!!busy} onclick={playFriends}>{t('playFriends')}</button>
			{#if data.visibility !== 'private'}
				<span aria-hidden="true">·</span>
				<button class="link-btn" onclick={share}>{t('mapShare')}</button>
			{/if}
		</div>

		<h2 class="section-title">{t('mapBoard')}</h2>
		{#if data.board.length}
			<ol class="board">
				{#each data.board as row (row.game)}
					<li>
						<a href={`/game/${row.game}`} class:me={row.player.id === session.me?.user.id}>
							<span class="place">{row.place}</span>
							<span class="avatar">{row.player.avatar}</span>
							<span class="who">{row.player.name}</span>
							<b>{fmtNum(row.perRound)}</b>
							<span class="per">{t('mapPerRound')}</span>
						</a>
					</li>
				{/each}
			</ol>
		{:else}
			<p class="note">{t('mapBoardEmpty')}</p>
		{/if}
	{:else if failed}
		<p class="note">{failed === 'gone' ? t('mapGone') : t('err_network')}</p>
		{#if failed === 'gone'}
			<a class="btn btn-primary gone" href="/">{t('home')}</a>
		{/if}
		{#if failed === 'network'}
			<button class="btn btn-ghost" onclick={() => load(slug)}>{t('retry')}</button>
		{/if}
	{:else}
		<span class="spinner"></span>
	{/if}
</SubPage>

<ShareSheet share={sharing} title={t('mapShare')} onclose={() => (sharing = null)} />

<Sheet open={settings} onclose={() => (settings = false)} title={t('mapSettings')}>
	<div class="form">
		<MapForm bind:name bind:visibility bind:tags />
		<button class="btn btn-primary" disabled={saving || name.trim().length < 2} onclick={save}>
			{t('mapSave')}
		</button>
		<button class="link-btn danger" onclick={remove}>
			{sure ? t('mapDeleteSure') : t('mapDelete')}
		</button>
	</div>
</Sheet>

<style>
	.head {
		margin-top: 12px;
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.sign {
		flex: 1;
		min-width: 0;
	}
	.facts {
		margin-top: 12px;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px 8px;
		font-size: 14.5px;
		color: var(--muted);
	}
	.facts a {
		color: var(--text);
		font-weight: 600;
		text-decoration: none;
	}
	.status {
		font-size: 12.5px;
		font-weight: 600;
		padding: 2px 10px;
		border-radius: 999px;
		background: var(--surface-2);
		color: var(--text);
	}
	.reason {
		margin-top: 6px;
		font-size: 14px;
		color: var(--red);
	}
	.picture {
		margin-top: 14px;
		height: 180px;
		border-radius: 18px;
		overflow: hidden;
		background: var(--surface-2);
	}
	.numbers {
		margin-top: 12px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	.plays {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 14.5px;
		font-weight: 600;
		color: var(--muted);
	}
	.plays svg {
		width: 13px;
		height: 13px;
		fill: currentColor;
	}
	.like {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 44px;
		padding: 0 14px;
		border: none;
		border-radius: 999px;
		background: var(--surface-2);
		color: var(--text);
		font-weight: 700;
		font-size: 15px;
		font-variant-numeric: tabular-nums;
	}
	.like .heart {
		font-size: 19px;
		line-height: 1;
	}
	.like[aria-pressed='true'] .heart {
		color: var(--red);
	}
	.tags {
		margin-top: 10px;
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.tags .tag {
		display: inline-flex;
		align-items: center;
		text-decoration: none;
	}
	.play {
		margin-top: 18px;
		width: 100%;
		height: 62px;
		font-size: 18px;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
	}
	.play svg {
		width: 22px;
		height: 22px;
		fill: currentColor;
		stroke: none;
	}
	.quiet {
		margin-top: 14px;
		display: flex;
		justify-content: center;
		flex-wrap: wrap;
		gap: 6px 10px;
		color: var(--muted);
		font-size: 14.5px;
	}
	.section-title {
		margin-top: 28px;
	}
	.board {
		list-style: none;
		margin-top: 6px;
	}
	.board li {
		border-bottom: 1px solid var(--border);
	}
	.board a {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 54px;
		color: var(--text);
		text-decoration: none;
	}
	.board a.me {
		font-weight: 700;
	}
	.place {
		width: 22px;
		text-align: center;
		font-family: var(--display);
		font-weight: 800;
		color: var(--muted);
	}
	.who {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.board b {
		font-family: var(--display);
		font-weight: 800;
		font-variant-numeric: tabular-nums;
	}
	.per {
		font-size: 12.5px;
		color: var(--muted);
	}
	.note {
		margin-top: 10px;
		color: var(--muted);
	}
	.gone {
		margin-top: 16px;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.form {
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	.form .btn {
		height: 56px;
	}
	.danger {
		align-self: center;
		min-height: 40px;
		color: var(--red) !important; /* a link's own colour wins in dark otherwise */
		font-weight: 600;
	}
</style>
