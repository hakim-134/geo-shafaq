<script lang="ts">
	// The game's settings: difficulty, rounds and time as sliders, hints as a rule, movement
	// and the compass. The home's, and a room host's between games.
	import { t, type Key } from '#lib/i18n/index.svelte.js';
	import { fmtClock } from '#lib/format.js';
	import {
		applyPreset,
		roundsFromSlider,
		sliderFromRounds,
		timeFromSlider,
		sliderFromTime,
		ROUNDS_END,
		TIME_END,
		MAX_HINTS,
		HINT_COSTS,
		HINT_KINDS,
		MOVEMENTS,
		type Choice,
		type Preset
	} from '#lib/rules.js';
	import { compass, setCompassStyle, COMPASS_STYLES, MNEMONIC } from '#lib/compass.svelte.js';

	// canMove: the map's panoramas let the player walk
	let { choice = $bindable(), canMove }: { choice: Choice; canMove: boolean } = $props();

	const presets: Preset[] = ['easy', 'normal', 'hard'];

	// the sliders paint their track up to the thumb
	const fill = (v: number, max: number, min = 0) => `${((v - min) / (max - min)) * 100}%`;
	const roundsPos = $derived(sliderFromRounds(choice.rounds));
	const timePos = $derived(sliderFromTime(choice.timeSec));
	const compassValue = $derived(choice.compass ? compass.style : 'none');
	function pickCompass(v: string) {
		choice.compass = v !== 'none';
		if (v !== 'none') setCompassStyle(v as typeof compass.style);
	}
	// the numbers under the sliders, each where its value sits on the track
	const roundMarks: [number, string][] = [
		[1, '1'],
		[5, '5'],
		[10, '10'],
		[15, '15'],
		[ROUNDS_END, '∞']
	];
	const timeMarks: [number, string][] = [
		...[10, 30, 60, 180].map((s): [number, string] => [sliderFromTime(s), fmtClock(s)]),
		[TIME_END, '∞']
	];
	const costLabel = (c: number) => (c ? `−${Math.round(c * 100)}%` : t('costFree'));
</script>

<div class="form">
	<div>
		<div class="field-label">{t('difficulty')}</div>
		<div class="segmented">
			{#each presets as p (p)}
				<button aria-pressed={choice.preset === p} onclick={() => (choice = applyPreset(choice, p))}
					><i class="dot {p}"></i>{t(`diff_${p}`)}</button
				>
			{/each}
		</div>
		<p class="field-note">{t(`diffHint_${choice.preset}`)}</p>
	</div>

	<label class="slider">
		<span class="field-head">
			<span class="field-label">{t('rounds')}</span>
			<b>{choice.rounds ? choice.rounds : t('roundsEndless')}</b>
		</span>
		<input
			type="range"
			class="range"
			min="1"
			max={ROUNDS_END}
			step="1"
			value={roundsPos}
			style:--fill={fill(roundsPos, ROUNDS_END, 1)}
			oninput={(e) => (choice.rounds = roundsFromSlider(+e.currentTarget.value))}
		/>
		<span class="scale">
			{#each roundMarks as [v, label] (label)}
				<span style:left={fill(v, ROUNDS_END, 1)}>{label}</span>
			{/each}
		</span>
	</label>

	<label class="slider">
		<span class="field-head">
			<span class="field-label">{t('time')}</span>
			<b>{choice.timeSec ? fmtClock(choice.timeSec) : t('timeNone')}</b>
		</span>
		<input
			type="range"
			class="range"
			min="0"
			max={TIME_END}
			step="1"
			value={timePos}
			style:--fill={fill(timePos, TIME_END)}
			oninput={(e) => (choice.timeSec = timeFromSlider(+e.currentTarget.value))}
		/>
		<span class="scale">
			{#each timeMarks as [v, label] (label)}
				<span style:left={fill(v, TIME_END)}>{label}</span>
			{/each}
		</span>
	</label>

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
				<b>{choice.hints.count || t('hintsNone')}</b>
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
						<button aria-pressed={choice.hints.per === per} onclick={() => (choice.hints.per = per)}
							>{t(`hintsPer_${per}`)}</button
						>
					{/each}
				</div>
				<div class="field-label sub">{t('hintStart')}</div>
				<div class="segmented small">
					{#each HINT_KINDS as k (k)}
						<button aria-pressed={choice.hints.kind === k} onclick={() => (choice.hints.kind = k)}
							>{t(`hintKind_${k}`)}</button
						>
					{/each}
				</div>
				<p class="field-note">{t(`hintKindNote_${choice.hints.kind}`)}</p>
				<div class="field-label sub">{t('hintCost')}</div>
				<div class="segmented small">
					{#each HINT_COSTS as c (c)}
						<button aria-pressed={choice.hints.cost === c} onclick={() => (choice.hints.cost = c)}
							>{costLabel(c)}</button
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
		<p class="field-note">
			{!canMove && choice.movement === 'move'
				? t('moveNoteCantMove')
				: t(`moveNote_${choice.movement}`)}
		</p>
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
		<p class="field-note">{t(`compassNote_${compassValue}` as Key, MNEMONIC)}</p>
	</div>
</div>

<style>
	.form {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.dot {
		display: inline-block;
		width: 11px;
		height: 11px;
		border-radius: 50%;
		margin-right: 7px;
		vertical-align: 0;
	}
	.dot.easy {
		background: var(--green);
	}
	.dot.normal {
		background: var(--star);
	}
	.dot.hard {
		background: var(--red);
	}
	.form .field-note {
		min-height: 0;
		margin-top: 8px;
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
	.field-head > b {
		font-family: var(--display);
		font-size: 17px;
		font-variant-numeric: tabular-nums;
	}
	.slider {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	/* the thumb's middle runs 13px in from each end of the track */
	.scale {
		position: relative;
		height: 14px;
		margin: -6px 13px 0;
		font-size: 11.5px;
		color: var(--muted);
	}
	.scale span {
		position: absolute;
		transform: translateX(-50%);
		white-space: nowrap;
	}
	.stepper {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 3px;
		border-radius: 12px;
		background: var(--surface-2);
	}
	.stepper button {
		width: 38px;
		height: 34px;
		border: none;
		border-radius: 9px;
		background: var(--surface);
		color: var(--text);
		display: grid;
		place-items: center;
	}
	.stepper button:disabled {
		opacity: 0.4;
	}
	.stepper .icon {
		width: 16px;
		height: 16px;
		stroke-width: 2.4;
	}
	.stepper b {
		min-width: 64px;
		text-align: center;
		font-family: var(--display);
		font-size: 15px;
	}
	.hint-rules {
		margin-top: 10px;
		padding: 12px;
		border-radius: 14px;
		background: var(--bg);
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.hint-rules .field-note {
		margin-top: 0;
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
