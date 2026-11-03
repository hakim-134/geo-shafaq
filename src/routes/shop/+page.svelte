<script lang="ts">
	// The shop (PLAN 9.4): looks for earned Barg, at fixed prices. Nothing random, no timers, nothing
	// that plays better: the prices are what they are. A tap shows the thing big with one button: buy
	// (and it goes on at once), wear, or how much is still missing.
	import SubPage from '#lib/components/SubPage.svelte';
	import Sheet from '#lib/components/Sheet.svelte';
	import Coin from '#lib/barg/Coin.svelte';
	import ItemPreview from '#lib/barg/ItemPreview.svelte';
	import { api, call, ApiError, type Schemas } from '#lib/api/client.js';
	import { ensureSession, refreshMe, session } from '#lib/session.svelte.js';
	import { t, type Key } from '#lib/i18n/index.svelte.js';
	import { fmtNum } from '#lib/format.js';
	import { sfxLearned, unlockAudio } from '#lib/sfx.svelte.js';
	import { showToast } from '#lib/toast.svelte.js';

	type Item = Schemas['ShopItem'];
	const KINDS: Item['kind'][] = ['frame', 'pin', 'trail'];

	let shop = $state<Schemas['Shop'] | null>(null);
	let failed = $state(false);
	let openId = $state('');
	let busy = $state(false);

	const open = $derived(shop?.items.find((i) => i.id === openId) ?? null);
	const missing = $derived(open && shop ? open.price - shop.balance : 0);

	$effect(() => {
		void session.version;
		load();
	});

	async function load() {
		try {
			await ensureSession();
			shop = await call(api().GET('/v1/shop'));
			failed = false;
		} catch {
			failed = true;
		}
	}

	const path = (item: string) => ({ params: { path: { item } } });

	async function wear(it: Item, on: boolean) {
		shop = await call(api().POST('/v1/shop/{item}/wear', { ...path(it.id), body: { on } }));
		refreshMe().catch(() => {});
	}

	async function act(fn: () => Promise<unknown>) {
		if (busy) return;
		busy = true;
		try {
			await fn();
		} catch (e) {
			const code = e instanceof ApiError ? e.code : '';
			showToast(
				t(code === 'banned' ? 'bannedText' : code === 'network' ? 'err_network' : 'err_other'),
				3500
			);
		}
		busy = false;
	}

	// bought: it goes on at once, that's why it was bought. The moment it's yours gets a moment: this
	// is 20 streets of real learning. The thing pops, a note rises, then the sheet goes.
	let popping = $state(false);
	function buy(it: Item) {
		unlockAudio();
		act(async () => {
			shop = await call(api().POST('/v1/shop/{item}/buy', path(it.id)));
			await wear(it, true);
			popping = true;
			sfxLearned();
			await new Promise((r) => setTimeout(r, 1000));
			popping = false;
			openId = '';
		});
	}
</script>

<SubPage title={t('shopTitle')} back={{ href: '/me', label: t('profile') }}>
	{#if shop}
		<a class="balance" href="/me/wallet">
			<Coin size={30} />
			<b>{fmtNum(shop.balance)}</b>
			<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
		</a>

		<div class="kinds">
			{#each KINDS as kind (kind)}
				<section class:wide={kind === 'frame'}>
					<h2 class="section-title">{t(`kind_${kind}` as Key)}</h2>
					<div class="grid">
						{#each shop.items.filter((i) => i.kind === kind) as it (it.id)}
							<button class="tile" class:worn={it.worn} onclick={() => (openId = it.id)}>
								<ItemPreview item={it} />
								<span class="name">{t(`item_${it.id}` as Key)}</span>
								{#if it.worn}
									<span class="state on">{t('shopWorn')}</span>
								{:else if it.owned}
									<span class="state">{t('shopOwned')}</span>
								{:else}
									<span class="price"><Coin size={16} /> {fmtNum(it.price)}</span>
								{/if}
							</button>
						{/each}
					</div>
				</section>
			{/each}
		</div>
	{:else if failed}
		<p class="note">{t('err_network')}</p>
		<button class="btn btn-ghost" onclick={load}>{t('retry')}</button>
	{:else}
		<span class="spinner"></span>
	{/if}
</SubPage>

<Sheet open={!!open} onclose={() => (openId = '')} title={open ? t(`full_${open.id}` as Key) : ''}>
	{#if open}
		<div class="sheet">
			<div class:pop={popping}><ItemPreview item={open} big /></div>
			{#if popping}
				<p class="yours">{t('shopWorn')}</p>
			{:else if open.worn}
				<button
					class="btn btn-ghost act"
					disabled={busy}
					onclick={() => act(() => wear(open!, false))}
				>
					{t('shopTakeOff')}
				</button>
			{:else if open.owned}
				<button
					class="btn btn-primary act"
					disabled={busy}
					onclick={() => act(() => wear(open!, true))}
				>
					{t('shopWear')}
				</button>
			{:else if missing > 0}
				<p class="price big"><Coin size={22} /> {fmtNum(open.price)}</p>
				<p class="note">{t('shopMissing', { n: missing })}</p>
				<a class="link-btn" href="/me/wallet">{t('earnHow')}</a>
			{:else}
				<button class="btn btn-primary act" disabled={busy} onclick={() => buy(open!)}>
					{t('shopBuy')} · <Coin size={22} />
					{fmtNum(open.price)}
				</button>
			{/if}
		</div>
	{/if}
</Sheet>

<style>
	.balance {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		min-height: 48px;
		color: var(--text);
		text-decoration: none;
	}
	.balance b {
		font-family: var(--display);
		font-weight: 800;
		font-size: 28px;
	}
	.balance .icon {
		color: var(--muted);
	}
	.section-title {
		margin-top: 22px;
	}
	/* a laptop: the frames a whole row, the rest side by side: no row with a hole */
	@media (min-width: 1024px) {
		:global(main.sub:has(.kinds)) {
			max-width: 760px;
		}
		.kinds {
			display: grid;
			grid-template-columns: 1fr 1fr;
			column-gap: 24px;
		}
		.kinds .wide {
			grid-column: 1 / -1;
		}
	}
	.grid {
		margin-top: 10px;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
		gap: 10px;
	}
	.tile {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		padding: 10px 4px 12px;
		border-radius: 16px;
		border: 2px solid var(--border);
		background: var(--surface);
		color: var(--text);
		transition: transform 0.1s;
	}
	.tile:active {
		transform: scale(0.97);
	}
	.tile.worn {
		border-color: var(--sky);
		background: color-mix(in srgb, var(--sky) 10%, var(--surface));
	}
	.name {
		font-weight: 700;
		font-size: 14px;
	}
	.price {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-weight: 700;
		font-size: 14px;
		font-variant-numeric: tabular-nums;
	}
	.price.big {
		font-size: 20px;
		font-family: var(--display);
		font-weight: 800;
	}
	.state {
		font-size: 13px;
		font-weight: 600;
		color: var(--muted);
	}
	.state.on {
		color: var(--sky-ink);
	}
	:global(:root[data-theme='dark']) .state.on {
		color: var(--sky);
	}
	.sheet {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		padding-top: 4px;
	}
	.pop {
		animation: pop-item 0.7s var(--pop) both;
	}
	@keyframes pop-item {
		0% {
			transform: scale(0.85);
			filter: brightness(1);
		}
		45% {
			transform: scale(1.22);
			filter: brightness(1.25) drop-shadow(0 0 14px #e8a90c);
		}
		100% {
			transform: scale(1);
			filter: brightness(1);
		}
	}
	.yours {
		font-family: var(--display);
		font-weight: 800;
		font-size: 17px;
		color: var(--green-ink);
		min-height: 58px;
	}
	:global(:root[data-theme='dark']) .yours {
		color: var(--green);
	}
	.act {
		width: 100%;
		height: 58px;
		font-size: 16px;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
	}
	.note {
		color: var(--muted);
		text-align: center;
	}
</style>
