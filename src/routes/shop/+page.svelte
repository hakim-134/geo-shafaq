<script lang="ts">
	// The shop (PLAN 9.4): looks for earned Barg, at fixed prices. Nothing random, no timers, nothing
	// that plays better: the prices are what they are. Each thing is a milk tile with how it looks
	// and its price; a tap shows it big with one key: buy (and it goes on at once), wear, or, when
	// Barg is short, how much is still missing and how to earn it. Never a dead button.
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

<!-- the purse shows from the first Barg: never a "0" chip (what isn't earned stays out of sight) -->
{#snippet purse()}
	{#if shop?.balance}
		<a class="purse chip" href="/me/wallet" aria-label={t('walletTitle')}>
			<Coin size={26} />
			<b class="d">{fmtNum(shop.balance)}</b>
		</a>
	{/if}
{/snippet}

<SubPage title={t('shopTitle')} back={{ href: '/me', label: t('profile') }} aside={purse} wide>
	{#if shop}
		<p class="honest">{t('shopNote')}</p>
		<div class="kinds">
			{#each KINDS as kind (kind)}
				<section class={kind}>
					<h2 class="section-title">{t(`kind_${kind}` as Key)}</h2>
					<div class="grid">
						{#each shop.items.filter((i) => i.kind === kind) as it (it.id)}
							{@const short = !it.owned && it.price > shop.balance}
							<button
								class="tile on-panel"
								class:worn={it.worn}
								data-item={it.id}
								onclick={() => (openId = it.id)}
							>
								<span class="well"><ItemPreview item={it} /></span>
								<span class="name">{t(`item_${it.id}` as Key)}</span>
								{#if it.worn}
									<span class="state on">
										<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"
											><path d="m5 12.5 4.5 4.5L19 7.5" /></svg
										>{t('shopWorn')}
									</span>
								{:else if it.owned}
									<span class="state">{t('shopOwned')}</span>
								{:else}
									<span class="price" class:short>
										<Coin size={18} /><b class="d">{fmtNum(it.price)}</b>
										{#if short}
											<svg viewBox="0 0 24 24" class="icon lock" aria-hidden="true"
												><rect x="5" y="11" width="14" height="10" rx="2.5" /><path
													d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3"
												/></svg
											>
										{/if}
									</span>
								{/if}
							</button>
						{/each}
					</div>
				</section>
			{/each}
		</div>
	{:else if failed}
		<div class="empty-state">
			<p>{t('err_network')}</p>
			<button class="btn btn-chip" onclick={load}>{t('retry')}</button>
		</div>
	{:else}
		<span class="spinner"></span>
	{/if}
</SubPage>

<Sheet open={!!open} onclose={() => (openId = '')} title={open ? t(`full_${open.id}` as Key) : ''}>
	{#if open && shop}
		<div class="sheet">
			<div class="stage" class:pop={popping}><ItemPreview item={open} size="big" /></div>
			{#if popping}
				<p class="yours d">{t('shopWorn')}!</p>
			{:else if open.worn}
				<p class="worn-line">
					<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"
						><path d="m5 12.5 4.5 4.5L19 7.5" /></svg
					>{t('shopWorn')}
				</p>
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
					<span class="lbl">{t('shopWear')}</span>
				</button>
			{:else if missing > 0}
				<!-- what is missing, as a bar filling up: how close it is, never a dead key -->
				<div class="short-of">
					<!-- with no Barg yet, no "0 of 20" and no empty bar: only what it takes -->
					{#if shop.balance}
						<div class="have">
							<span><Coin size={22} /><b class="d">{fmtNum(shop.balance)}</b></span>
							<span class="of"><Coin size={22} /><b class="d">{fmtNum(open.price)}</b></span>
						</div>
						<div class="bar" aria-hidden="true">
							<i style:width="{Math.max(4, (100 * shop.balance) / open.price)}%"></i>
						</div>
					{/if}
					<p class="need">{t('shopMissing', { n: missing })}</p>
				</div>
				<a class="btn btn-ghost act" href="/me/wallet">{t('earnHow')}</a>
			{:else}
				<button class="btn btn-primary act" disabled={busy} onclick={() => buy(open!)}>
					<span class="lbl">{t('shopBuy')} · <Coin size={24} /> {fmtNum(open.price)}</span>
				</button>
			{/if}
		</div>
	{/if}
</Sheet>

<style>
	/* the purse at the head's right: how much Barg, a tap opens the wallet */
	.purse {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		height: 44px;
		padding: 0 14px 0 9px;
		border-radius: 999px;
		transition: transform 0.1s var(--out);
	}
	.purse:active {
		transform: scale(0.95);
	}
	.purse b {
		font-size: 21px;
		line-height: 1;
		color: var(--on-ground);
	}
	.honest {
		margin: -10px 0 4px;
		font-size: 14.5px;
		font-weight: 600;
		color: var(--on-ground-3);
	}
	.section-title {
		margin: 22px 0 12px;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 12px;
	}
	/* a thing for sale: a milk tile with a lip, how it looks in a soft well, its name, its price */
	.tile {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		min-width: 0;
		padding: 8px 8px 12px;
		border: none;
		border-radius: 20px;
		background: var(--panel);
		box-shadow:
			0 3px 0 var(--panel-lip),
			0 10px 20px var(--shade);
		transition: transform 0.12s var(--out);
	}
	.tile:active {
		transform: translateY(2px) scale(0.98);
	}
	.well {
		align-self: stretch;
		display: grid;
		place-items: center;
		border-radius: 14px;
		background: var(--panel-2);
	}
	.name {
		max-width: 100%;
		font-weight: 700;
		font-size: 15px;
		line-height: 1.2;
		color: var(--ink);
		overflow-wrap: anywhere;
	}
	.price,
	.state {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		min-height: 26px;
		font-size: 14px;
		font-weight: 700;
	}
	.price b {
		font-size: 17px;
		line-height: 1;
		color: var(--ink);
	}
	/* not yet: the price softer, a small lock */
	.price.short b {
		color: var(--ink-3);
	}
	.price.short :global(.coin) {
		opacity: 0.6;
	}
	.lock {
		width: 15px;
		height: 15px;
		color: var(--ink-3);
		stroke-width: 2.4;
	}
	.state {
		color: var(--ink-3);
	}
	/* what the player wears: gold, the colour of what is theirs */
	.tile.worn {
		box-shadow:
			inset 0 0 0 3px var(--gold),
			0 3px 0 var(--gold-lo),
			0 10px 20px var(--shade);
	}
	.state.on {
		color: var(--gold-on-panel);
	}
	.state .icon,
	.worn-line .icon {
		width: 17px;
		height: 17px;
		stroke-width: 3;
	}
	/* a laptop: the frames a whole row, pins and trails side by side: no row with a hole */
	@media (min-width: 900px) {
		.kinds {
			display: grid;
			grid-template-columns: 1fr 1fr;
			column-gap: 28px;
		}
		.frame {
			grid-column: 1 / -1;
		}
		.frame .grid {
			grid-template-columns: repeat(5, minmax(0, 1fr));
		}
		.grid {
			gap: 14px;
		}
	}

	/* the sheet: the thing big, then one key */
	.sheet {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 14px;
		padding-top: 6px;
	}
	.stage {
		align-self: stretch;
		display: grid;
		place-items: center;
		padding: 10px 0;
		border-radius: 20px;
		background: var(--panel-2);
	}
	.pop {
		animation: pop-item 0.7s var(--spring) both;
	}
	@keyframes pop-item {
		0% {
			transform: scale(0.9);
		}
		45% {
			transform: scale(1.08);
			filter: brightness(1.15) drop-shadow(0 0 14px var(--gold));
		}
		100% {
			transform: scale(1);
		}
	}
	.yours {
		min-height: 64px;
		font-size: 24px;
		line-height: 64px;
		color: var(--gold-on-panel);
		animation: pop-in 0.35s var(--spring) both;
	}
	.worn-line {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-weight: 700;
		color: var(--gold-on-panel);
	}
	.act {
		width: 100%;
	}
	.btn-primary .lbl {
		display: inline-flex;
		align-items: center;
		gap: 8px;
	}
	.btn-primary :global(.coin) {
		filter: drop-shadow(0 2px 0 var(--key-shade));
	}
	.short-of {
		align-self: stretch;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.have {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.have span {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.have b {
		font-size: 20px;
		line-height: 1;
	}
	.have .of b {
		color: var(--ink-3);
	}
	.bar {
		height: 14px;
		border-radius: 7px;
		background: var(--panel-2);
		box-shadow: inset 0 0 0 1.5px var(--panel-line);
		overflow: hidden;
	}
	.bar i {
		display: block;
		height: 100%;
		border-radius: 7px;
		background: linear-gradient(180deg, var(--key-hi), var(--key));
		box-shadow: inset 0 -2px 0 var(--key-lo);
	}
	.need {
		text-align: center;
		font-weight: 700;
		color: var(--ink-2);
	}
</style>
