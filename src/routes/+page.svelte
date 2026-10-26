<script lang="ts">
	import { goto } from '$app/navigation';
	import TopBar from '#lib/components/TopBar.svelte';
	import { api, call, ApiError, type MapSummary, type Schemas } from '#lib/api/client.js';
	import { i18n, t, tx } from '#lib/i18n/index.svelte.js';
	import { ensureSession, session } from '#lib/session.svelte.js';
	import { fmtClock, fmtNum } from '#lib/format.js';
	import {
		loadChoice,
		saveChoice,
		rulesFor,
		testProviders,
		ROUNDS,
		TIMES,
		type Preset
	} from '#lib/rules.js';
	import { showToast } from '#lib/toast.svelte.js';

	let maps = $state<MapSummary[]>([]);
	let history = $state<Schemas['GameListItem'][]>([]);
	let choice = $state(loadChoice());
	let starting = $state(false);
	let offline = $state(false);

	const selected = $derived(maps.find((m) => m.slug === choice.map) ?? maps[0]);
	const country = $derived(maps.find((m) => m.slug === 'uzbekistan'));
	const totalPanoramas = $derived(country?.panoramas ?? 0);
	const streets = $derived(maps.find((m) => m.streets)?.groups ?? 0);

	$effect(() => saveChoice($state.snapshot(choice)));

	async function load() {
		try {
			await ensureSession();
			const [m, h] = await Promise.all([
				call(api().GET('/v1/maps')),
				call(api().GET('/v1/me/games', { params: { query: { limit: 8 } } }))
			]);
			maps = m;
			history = h.games;
			offline = false;
			if (!m.some((x) => x.slug === choice.map) && m.length) choice.map = m[0].slug;
		} catch {
			offline = true;
		}
	}
	load();

	async function play() {
		if (!selected || starting) return;
		starting = true;
		try {
			const game = await call(
				api().POST('/v1/games', {
					body: { map: selected.slug, rules: rulesFor(choice, testProviders()) }
				})
			);
			goto(`/game/${game.id}`);
		} catch (e) {
			starting = false;
			const code = e instanceof ApiError ? e.code : 'other';
			showToast(
				t(
					code === 'no_panorama'
						? 'err_no_panorama'
						: code === 'daily_cap'
							? 'err_daily_cap'
							: code === 'network'
								? 'err_network'
								: 'err_other'
				)
			);
		}
	}

	const presets: Preset[] = ['easy', 'normal', 'hard'];
	const date = (iso: string) => {
		const d = new Date(iso);
		return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
	};

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Enter' && e.target === document.body) play();
	}
</script>

<svelte:window onkeydown={onKey} />
<svelte:head><title>Shafaq Geo — {t('heroTitle')}</title></svelte:head>

<TopBar />

<main class="menu">
	<section class="hero">
		<div class="hero-copy">
			<div class="kicker">{t('tagline')}</div>
			<h1>{t('heroTitle')}</h1>
			<p>{t('heroText')}</p>
			<div class="facts">
				<div><b>{fmtNum(totalPanoramas)}</b><span>{t('factPanoramas')}</span></div>
				<div><b>{fmtNum(streets)}</b><span>{t('factStreets')}</span></div>
				<div><b>{maps.length}</b><span>{t('factMaps')}</span></div>
			</div>
		</div>
		<div class="hero-map girih" aria-hidden="true">
			{#if country?.outline}{@html country.outline}{/if}
			{#if selected?.outline && selected.slug !== 'uzbekistan'}
				<div class="hero-place">{@html selected.outline}<span>{tx(selected.name)}</span></div>
			{/if}
		</div>
	</section>

	<section class="setup card">
		<h2 class="card-title">{t('setup')}</h2>

		{#if offline}
			<div class="offline">
				<p>{t('err_network')}</p>
				<button class="btn btn-ghost" onclick={load}>{t('retry')}</button>
			</div>
		{/if}

		<div>
			<div class="field-label">{t('map')}</div>
			<div class="maps">
				{#each maps as m (m.slug)}
					<button
						class="map"
						aria-pressed={m.slug === choice.map}
						onclick={() => (choice.map = m.slug)}
					>
						<span class="map-outline" aria-hidden="true">
							{#if m.outline}{@html m.outline}{:else}<svg viewBox="0 0 24 24" class="icon"
									><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" /><circle
										cx="12"
										cy="9.5"
										r="2.5"
									/></svg
								>{/if}
						</span>
						<span class="map-name">{tx(m.name)}</span>
						<span class="map-desc">{tx(m.description)}</span>
						<span class="badges">
							<span class="count">{fmtNum(m.panoramas)} {t('spots')}</span>
							{#if m.streets && m.seen !== undefined}
								<span class="progress">{t('streetsSeen', { n: m.seen, m: m.groups })}</span>
							{/if}
						</span>
					</button>
				{/each}
			</div>
		</div>

		<div>
			<div class="field-label">{t('difficulty')}</div>
			<div class="segmented">
				{#each presets as p (p)}
					<button aria-pressed={choice.preset === p} onclick={() => (choice.preset = p)}
						>{t(`diff_${p}`)}</button
					>
				{/each}
			</div>
			<p class="field-note">{t(`diffHint_${choice.preset}`)}</p>
		</div>

		<div class="row">
			<div>
				<div class="field-label">{t('rounds')}</div>
				<div class="segmented">
					{#each ROUNDS as n (n)}
						<button aria-pressed={choice.rounds === n} onclick={() => (choice.rounds = n)}
							>{n}</button
						>
					{/each}
				</div>
			</div>
			<div>
				<div class="field-label">{t('time')}</div>
				<div class="segmented">
					{#each TIMES as s (s)}
						<button aria-pressed={choice.timeSec === s} onclick={() => (choice.timeSec = s)}
							>{s ? fmtClock(s) : '∞'}</button
						>
					{/each}
				</div>
			</div>
		</div>

		<button class="btn btn-play" onclick={play} disabled={!selected || starting}>
			<span>{starting ? t('starting') : t('play')}</span>
			<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
		</button>

		<div class="friends">
			<b>{t('friends')}</b>
			<p class="field-note">{t('friendsSoon')}</p>
		</div>
	</section>

	<section class="side">
		<div class="card profile">
			<div class="field-label">{t('player')}</div>
			{#if session.me}
				<div class="who">
					<span class="avatar">{session.me.user.avatar}</span>
					<b>{session.me.user.name}</b>
				</div>
				{#if session.me.user.guest}<p class="field-note">{t('guestNote')}</p>{/if}
				<div class="stats">
					<div><b>{session.me.stats.games}</b><span>{t('games')}</span></div>
					<div><b>{fmtNum(session.me.stats.best)}</b><span>{t('best')}</span></div>
					<div><b>{fmtNum(session.me.stats.avgRound)}</b><span>{t('avgRound')}</span></div>
				</div>
			{/if}
		</div>

		<div class="card">
			<h2 class="card-title">{t('history')}</h2>
			<ol class="history">
				{#each history as h (h.id)}
					<li>
						<a href={`/game/${h.id}`}>
							<span class="h-main">
								<b>{tx(h.map.name)}</b>
								<span>{h.rounds} × · {date(h.startedAt)}</span>
							</span>
							<span class="h-score">
								<b>{fmtNum(h.total)}</b>
								<i style:--p={`${Math.round((h.total / h.max) * 100)}%`}></i>
							</span>
						</a>
					</li>
				{:else}
					<li class="empty">{t('historyEmpty')}</li>
				{/each}
			</ol>
		</div>
	</section>

	<section class="howto">
		<h2 class="card-title">{t('howTo')}</h2>
		<ol>
			<li>
				<span>1</span>
				<p>{t('howTo1')}</p>
			</li>
			<li>
				<span>2</span>
				<p>{t('howTo2')}</p>
			</li>
			<li>
				<span>3</span>
				<p>{t('howTo3')}</p>
			</li>
		</ol>
	</section>
</main>

<footer class="foot">
	<span>{t('credits')}</span>
	<span class="keys">{t('keys')}</span>
</footer>

<style>
	.menu {
		max-width: 1200px;
		margin: 0 auto;
		padding: 8px 24px 48px;
		display: grid;
		grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr);
		gap: 20px;
		align-items: start;
	}

	/* hero */
	.hero {
		grid-column: 1 / -1;
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 32px;
		align-items: center;
		padding: 40px 44px;
		border-radius: 24px;
		background:
			radial-gradient(120% 90% at 85% 40%, rgba(43, 183, 211, 0.22), transparent 60%),
			linear-gradient(135deg, var(--lapis), var(--lapis-2));
		color: #fff;
		overflow: hidden;
	}
	.kicker {
		display: inline-block;
		font-size: 13px;
		font-weight: 600;
		letter-spacing: 0.04em;
		color: #9fe3f1;
		margin-bottom: 14px;
	}
	h1 {
		font-family: var(--display);
		font-weight: 800;
		font-size: clamp(38px, 5.2vw, 62px);
		line-height: 1;
		letter-spacing: -0.03em;
	}
	.hero p {
		margin-top: 18px;
		max-width: 440px;
		font-size: 16px;
		line-height: 1.6;
		color: rgba(255, 255, 255, 0.78);
	}
	.facts {
		margin-top: 28px;
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
	}
	.facts div {
		display: flex;
		align-items: baseline;
		gap: 8px;
		padding: 9px 14px;
		border-radius: 12px;
		background: rgba(255, 255, 255, 0.08);
		border: 1px solid rgba(255, 255, 255, 0.12);
		font-size: 13px;
		color: rgba(255, 255, 255, 0.75);
	}
	.facts b {
		font-family: var(--display);
		font-size: 18px;
		color: #fff;
	}
	.hero-map {
		position: relative;
		color: #fff;
		border-radius: 18px;
		padding: 14px;
		min-height: 160px;
	}
	.hero-map :global(svg) {
		display: block;
		width: 100%;
		height: auto;
		max-height: 300px;
	}
	.hero-map > :global(svg path) {
		fill: rgba(255, 255, 255, 0.08);
		stroke: rgba(255, 255, 255, 0.6);
		stroke-width: 0.6;
		stroke-linejoin: round;
	}
	.hero-place {
		position: absolute;
		right: 14px;
		bottom: 14px;
		width: 34%;
		padding: 10px;
		border-radius: 14px;
		background: rgba(12, 20, 36, 0.55);
		border: 1px solid rgba(255, 255, 255, 0.15);
		text-align: center;
		font-size: 12px;
		font-weight: 600;
	}
	.hero-place :global(svg path) {
		fill: color-mix(in srgb, #5fe07a 35%, transparent);
		stroke: #5fe07a;
		stroke-width: 1.2;
		stroke-linejoin: round;
	}

	/* setup */
	.setup {
		display: flex;
		flex-direction: column;
		gap: 22px;
	}
	.setup .card-title {
		margin-bottom: 0;
	}
	.offline {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 12px 14px;
		border-radius: 12px;
		background: color-mix(in srgb, var(--red) 12%, transparent);
		color: var(--text);
	}
	.offline .btn {
		height: 40px;
	}
	.row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 18px;
	}
	.maps {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 10px;
	}
	.map {
		position: relative;
		text-align: left;
		border: 1.5px solid var(--border);
		border-radius: 14px;
		background: var(--bg);
		padding: 14px 14px 12px;
		display: grid;
		grid-template-columns: 44px 1fr;
		grid-template-rows: auto 1fr auto;
		column-gap: 12px;
		row-gap: 2px;
		transition:
			border-color 0.15s,
			background 0.15s;
	}
	.map:hover {
		border-color: var(--muted);
	}
	.map[aria-pressed='true'] {
		border-color: var(--sky);
		background: color-mix(in srgb, var(--sky) 10%, var(--surface));
	}
	.map-outline {
		grid-row: 1 / -1;
		width: 44px;
		height: 44px;
		color: var(--sky);
		display: grid;
		place-items: center;
	}
	.map-outline :global(svg) {
		width: 44px;
		height: 44px;
	}
	.map-outline :global(svg path) {
		fill: color-mix(in srgb, currentColor 22%, transparent);
		stroke: currentColor;
		stroke-width: 3;
		stroke-linejoin: round;
	}
	.map-outline :global(svg.icon path),
	.map-outline :global(svg.icon circle) {
		stroke-width: 1.8;
		fill: none;
	}
	.map[aria-pressed='true'] .map-outline {
		color: var(--green);
	}
	.map-name {
		font-family: var(--display);
		font-weight: 700;
		font-size: 14.5px;
	}
	.map-desc {
		font-size: 13px;
		line-height: 1.4;
		color: var(--muted);
	}
	.badges {
		margin-top: 6px;
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.count,
	.progress {
		font-size: 12px;
		font-weight: 600;
		padding: 2px 8px;
		border-radius: 999px;
	}
	.count {
		background: color-mix(in srgb, var(--green) 14%, transparent);
		color: var(--green-ink);
	}
	:global(:root[data-theme='dark']) .count {
		color: var(--green);
	}
	.progress {
		background: color-mix(in srgb, var(--gold) 20%, transparent);
	}
	.btn-play {
		height: 64px;
		width: 100%;
		font-size: 19px;
		background: var(--green);
		color: #fff;
		box-shadow: 0 8px 24px color-mix(in srgb, var(--green) 35%, transparent);
	}
	.btn-play:hover:not(:disabled) {
		background: var(--green-ink);
	}
	.btn-play svg {
		transition: transform 0.2s;
	}
	.btn-play:hover svg {
		transform: translateX(4px);
	}
	.friends {
		border-top: 1px dashed var(--border);
		padding-top: 16px;
		font-family: var(--display);
		font-size: 15px;
	}
	.friends .field-note {
		font-family: var(--body);
		margin-top: 4px;
	}

	/* side */
	.side {
		display: flex;
		flex-direction: column;
		gap: 20px;
	}
	.who {
		display: flex;
		align-items: center;
		gap: 12px;
		font-family: var(--display);
		font-size: 18px;
	}
	.avatar {
		width: 52px;
		height: 52px;
		border-radius: 16px;
		background: var(--bg);
		display: grid;
		place-items: center;
		font-size: 30px;
		font-family: var(--body);
	}
	.stats {
		margin-top: 16px;
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
	}
	.stats div {
		padding: 12px;
		border-radius: 12px;
		background: var(--bg);
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.stats b {
		font-family: var(--display);
		font-size: 20px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.stats span {
		font-size: 12px;
		color: var(--muted);
		line-height: 1.3;
	}
	.history {
		list-style: none;
		display: flex;
		flex-direction: column;
	}
	.history li {
		border-top: 1px solid var(--border);
	}
	.history li:first-child {
		border-top: none;
	}
	.history a {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 10px 0;
		text-decoration: none;
	}
	.history .empty {
		color: var(--muted);
		font-size: 14px;
	}
	.h-main {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.h-main b {
		font-weight: 600;
		font-size: 14.5px;
	}
	.h-main span {
		font-size: 12.5px;
		color: var(--muted);
	}
	.h-score {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 5px;
	}
	.h-score b {
		font-family: var(--display);
		font-size: 15px;
	}
	.h-score i {
		width: 72px;
		height: 5px;
		border-radius: 3px;
		background: linear-gradient(to right, var(--green) var(--p), var(--surface-2) var(--p));
	}

	/* how to */
	.howto {
		grid-column: 1 / -1;
		padding: 6px 2px 0;
	}
	.howto ol {
		list-style: none;
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 20px;
	}
	.howto li {
		display: flex;
		gap: 14px;
		align-items: flex-start;
	}
	.howto li span {
		flex: 0 0 36px;
		height: 36px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		font-family: var(--display);
		font-weight: 700;
		color: #fff;
		background: var(--sky);
	}
	.howto li:nth-child(2) span {
		background: var(--gold);
	}
	.howto li:nth-child(3) span {
		background: var(--green);
	}
	.howto p {
		font-size: 14.5px;
		color: var(--muted);
		padding-top: 6px;
	}
	.foot {
		max-width: 1200px;
		margin: 0 auto;
		padding: 18px 24px 28px;
		border-top: 1px solid var(--border);
		display: flex;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 8px 20px;
		font-size: 13px;
		color: var(--muted);
	}

	@media (max-width: 960px) {
		.menu {
			grid-template-columns: 1fr;
		}
		.hero {
			grid-template-columns: 1fr;
			padding: 30px 24px;
		}
	}
	@media (max-width: 640px) {
		.menu,
		.foot {
			padding-left: 16px;
			padding-right: 16px;
		}
		.hero {
			padding: 26px 20px;
			border-radius: 20px;
		}
		.maps,
		.row,
		.howto ol {
			grid-template-columns: 1fr;
		}
		.card {
			padding: 18px;
		}
		.keys {
			display: none;
		}
	}
</style>
