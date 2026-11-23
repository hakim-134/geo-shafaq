<script lang="ts">
	// The game's settings: three rows of big tiles (difficulty, rounds, time), and the rest
	// under one closed "Ko‘proq": hints, movement and the compass.
	// No sentences: a tile says what it is. The home's, and a room host's between games; it
	// lives in a Sheet, so it is ink on milk: milk tiles with a lip, the chosen one a green rim
	// and a tick, the numbers in the leaning display letters.
	import { t, type Key } from '#lib/i18n/index.svelte.js';
	import { fmtClock } from '#lib/format.js';
	import {
		ROUND_TILES,
		TIME_TILES,
		MAX_HINTS,
		HINT_COSTS,
		HINT_KINDS,
		MOVEMENTS,
		type Choice,
		type Preset
	} from '#lib/rules.js';
	import { compass, setCompassStyle, COMPASS_STYLES } from '#lib/compass.svelte.js';

	// canMove: the map's panoramas let the player walk
	let { choice = $bindable(), canMove }: { choice: Choice; canMove: boolean } = $props();

	const presets: Preset[] = ['easy', 'normal', 'hard'];
	let more = $state(false);

	const compassValue = $derived(choice.compass ? compass.style : 'none');
	function pickCompass(v: string) {
		choice.compass = v !== 'none';
		if (v !== 'none') setCompassStyle(v as typeof compass.style);
	}
	const costLabel = (c: number) => (c ? `−${Math.round(c * 100)}%` : t('costFree'));
	const bars = { easy: 1, normal: 2, hard: 3 } as const;
</script>

<div class="form">
	<div>
		<div class="field-label">{t('difficulty')}</div>
		<div class="tiles">
			{#each presets as p (p)}
				<button
					class="tile {p}"
					aria-pressed={choice.preset === p}
					onclick={() => (choice.preset = p)}
				>
					<span class="bars" aria-hidden="true">
						{#each [1, 2, 3] as b (b)}<i class:on={b <= bars[p]}></i>{/each}
					</span>
					{t(`diff_${p}`)}
				</button>
			{/each}
		</div>
	</div>

	<div>
		<div class="field-label">{t('rounds')}</div>
		<div class="tiles four">
			{#each ROUND_TILES as n (n)}
				<button
					class="tile big"
					aria-pressed={choice.rounds === n}
					aria-label={n ? undefined : t('roundsEndless')}
					onclick={() => (choice.rounds = n)}><span class="d">{n || '∞'}</span></button
				>
			{/each}
		</div>
	</div>

	<div>
		<div class="field-label">{t('time')}</div>
		<div class="tiles four">
			{#each TIME_TILES as s (s)}
				<button
					class="tile"
					class:big={s > 0}
					aria-pressed={choice.timeSec === s}
					onclick={() => (choice.timeSec = s)}
					>{#if s}<span class="d">{fmtClock(s)}</span>{:else}{t('timeNone')}{/if}</button
				>
			{/each}
		</div>
	</div>

	<details class="more" bind:open={more}>
		<summary>
			{t('rulesMore')}
			<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
		</summary>
		<div class="more-body">
			<div>
				<div class="field-head">
					<span class="field-label">{t('hints')}</span>
					<span class="stepper">
						<button
							aria-label="−"
							disabled={choice.hints.count <= 0}
							onclick={() => choice.hints.count--}
							><svg viewBox="0 0 24 24" class="icon"><path d="M6 12h12" /></svg></button
						>
						<b class="d">{choice.hints.count || t('hintsNone')}</b>
						<button
							aria-label="+"
							disabled={choice.hints.count >= MAX_HINTS}
							onclick={() => choice.hints.count++}
							><svg viewBox="0 0 24 24" class="icon"><path d="M6 12h12M12 6v12" /></svg></button
						>
					</span>
				</div>
				{#if choice.hints.count > 0}
					<div class="hint-rules">
						<div class="segmented small">
							{#each ['round', 'game'] as const as per (per)}
								<button
									aria-pressed={choice.hints.per === per}
									onclick={() => (choice.hints.per = per)}>{t(`hintsPer_${per}`)}</button
								>
							{/each}
						</div>
						<div class="field-label sub">{t('hintStart')}</div>
						<div class="segmented small">
							{#each HINT_KINDS as k (k)}
								<button
									aria-pressed={choice.hints.kind === k}
									onclick={() => (choice.hints.kind = k)}>{t(`hintKind_${k}`)}</button
								>
							{/each}
						</div>
						<div class="field-label sub">{t('hintCost')}</div>
						<div class="segmented small">
							{#each HINT_COSTS as c (c)}
								<button
									aria-pressed={choice.hints.cost === c}
									onclick={() => (choice.hints.cost = c)}>{costLabel(c)}</button
								>
							{/each}
						</div>
					</div>
				{/if}
			</div>

			<div>
				<div class="field-label">{t('movement')}</div>
				<div class="segmented">
					{#each MOVEMENTS as mv (mv)}
						<button
							aria-pressed={(canMove
								? choice.movement
								: choice.movement === 'move'
									? 'nomove'
									: choice.movement) === mv}
							disabled={mv === 'move' && !canMove}
							onclick={() => (choice.movement = mv)}>{t(`move_${mv}`)}</button
						>
					{/each}
				</div>
			</div>

			<div>
				<div class="field-label">{t('compass')}</div>
				<div class="segmented">
					{#each [...COMPASS_STYLES, 'none'] as c (c)}
						<button aria-pressed={compassValue === c} onclick={() => pickCompass(c)}
							>{c === 'none' ? t('compassNone') : t(`compass_${c}` as Key)}</button
						>
					{/each}
				</div>
			</div>
		</div>
	</details>
</div>

<style>
	.form {
		display: flex;
		flex-direction: column;
		gap: 16px;
		color: var(--ink);
	}
	.form .field-label {
		color: var(--ink-2);
	}
	/* big tiles, three or four to a row: one tap each, the thumb's size */
	.tiles {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
	}
	.tiles.four {
		grid-template-columns: repeat(4, 1fr);
	}
	.tile {
		position: relative;
		min-height: 58px;
		padding: 6px 4px;
		border: 2px solid var(--panel-line);
		border-radius: var(--r-s);
		background: var(--panel);
		color: var(--ink);
		font-weight: 700;
		font-size: 15px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 6px;
		box-shadow: 0 3px 0 var(--panel-lip);
		transition:
			transform 0.1s var(--out),
			border-color 0.15s,
			background 0.15s;
	}
	.tile:active {
		transform: translateY(2px);
		box-shadow: 0 1px 0 var(--panel-lip);
	}
	/* the chosen one: a green rim and a tick, in every row, light and dark */
	.tile[aria-pressed='true'] {
		border-color: var(--key);
		background: color-mix(in srgb, var(--key) 10%, var(--panel));
		box-shadow: 0 3px 0 color-mix(in srgb, var(--key-lip) 45%, var(--panel-lip));
	}
	.tile[aria-pressed='true']::after,
	.form .segmented button[aria-pressed='true']::after {
		content: '✓';
		position: absolute;
		top: -7px;
		right: -7px;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: var(--key);
		box-shadow: 0 2px 0 var(--key-lip);
		color: #fff;
		font: 800 12px/22px var(--f-text);
		text-align: center;
		animation: pop-in 0.3s var(--spring);
	}
	.form .segmented button {
		position: relative;
	}
	.form .segmented button[aria-pressed='true'] {
		box-shadow:
			inset 0 0 0 2px var(--key),
			0 2px 0 var(--panel-lip);
		color: var(--ink);
	}
	.tile.big {
		font-size: 24px;
	}
	.tile .d {
		font-variant-numeric: tabular-nums;
	}
	/* difficulty as bars, like a signal: one green, two gold, three red */
	.bars {
		display: flex;
		align-items: flex-end;
		gap: 3px;
		height: 16px;
	}
	.bars i {
		width: 6px;
		border-radius: 2px;
		background: var(--panel-2);
	}
	.bars i:nth-child(1) {
		height: 7px;
	}
	.bars i:nth-child(2) {
		height: 11px;
	}
	.bars i:nth-child(3) {
		height: 16px;
	}
	.easy .bars i.on {
		background: var(--key);
	}
	.normal .bars i.on {
		background: var(--gold);
	}
	.hard .bars i.on {
		background: var(--red);
	}
	.more summary {
		list-style: none;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		min-height: 44px;
		border-radius: 12px;
		color: var(--ink-3);
		font-weight: 700;
		cursor: pointer;
	}
	.more summary:hover {
		color: var(--ink);
	}
	.more summary::-webkit-details-marker {
		display: none;
	}
	.more summary .icon {
		width: 18px;
		height: 18px;
		transition: transform 0.2s;
	}
	.more[open] summary .icon {
		transform: rotate(180deg);
	}
	.more-body {
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding-top: 6px;
	}
	.field-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
	}
	.field-head .field-label {
		margin-bottom: 0;
	}
	.stepper {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 3px;
		border-radius: 12px;
		background: var(--panel-2);
	}
	.stepper button {
		width: 40px;
		height: 36px;
		border: none;
		border-radius: 9px;
		background: var(--panel);
		color: var(--ink);
		box-shadow: 0 2px 0 var(--panel-lip);
		display: grid;
		place-items: center;
	}
	.stepper button:active:not(:disabled) {
		transform: translateY(1px);
		box-shadow: none;
	}
	.stepper button:disabled {
		opacity: 0.4;
	}
	.stepper .icon {
		width: 16px;
		height: 16px;
		stroke-width: 2.6;
	}
	.stepper b {
		min-width: 64px;
		text-align: center;
		font-size: 17px;
	}
	.hint-rules {
		margin-top: 10px;
		padding: 12px;
		border-radius: 14px;
		background: var(--panel-2);
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.hint-rules .segmented {
		background: color-mix(in srgb, var(--panel-2), var(--ink) 6%);
	}
	.field-label.sub {
		margin: 4px 0 0;
		font-size: 12px;
	}
	.segmented.small button {
		min-height: 34px;
		font-size: 13.5px;
	}
	.segmented button:disabled {
		opacity: 0.35;
		cursor: default;
	}
</style>
