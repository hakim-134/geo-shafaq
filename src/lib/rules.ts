// The menu's choices, turned into the server's Rules. A difficulty (v0's Oson / O‘rta / Qiyin,
// the same presets as api-geo-shafaq/internal/rules) sets the scoring and the labels, and
// suggests hints and movement; rounds, time, hints, movement and the compass are then the
// player's own.
import type { Rules } from '#lib/api/client.js';
import { load, loadJSON, saveJSON } from '#lib/storage.js';

export type Preset = 'easy' | 'normal' | 'hard';
export type Movement = Rules['movement'];
export type HintPer = Rules['hints']['per'];
export type HintKind = NonNullable<Rules['hints']['kind']>;

export interface HintChoice {
	count: number;
	per: HintPer;
	kind: HintKind;
	cost: number;
}

const scoring: Record<Preset, Pick<Rules, 'scoreScale' | 'panoLabels' | 'mapLabels'>> = {
	easy: { scoreScale: 2, panoLabels: true, mapLabels: true },
	normal: { scoreScale: 1, panoLabels: false, mapLabels: true },
	hard: { scoreScale: 0.6, panoLabels: false, mapLabels: false }
};

const suggested: Record<Preset, { hints: HintChoice; movement: Movement }> = {
	easy: { hints: { count: 1, per: 'round', kind: 'district', cost: 0 }, movement: 'move' },
	normal: { hints: { count: 1, per: 'round', kind: 'region', cost: 0.2 }, movement: 'move' },
	hard: { hints: { count: 0, per: 'round', kind: 'circle', cost: 0 }, movement: 'move' }
};

/** What the player picked on the menu, remembered on this device. */
export interface Choice {
	map: string;
	preset: Preset;
	rounds: number; // 0 = endless
	timeSec: number; // 0 = no limit
	hints: HintChoice;
	movement: Movement;
	compass: boolean;
}

const defaults: Choice = {
	map: 'tashkent-streets',
	preset: 'easy',
	rounds: 5,
	timeSec: 0,
	...structuredClone(suggested.easy),
	compass: true
};

/** A difficulty, with the hints and movement it suggests. */
export function applyPreset(c: Choice, p: Preset): Choice {
	return { ...c, preset: p, ...structuredClone(suggested[p]) };
}

export function loadChoice(): Choice {
	const c = loadJSON('choice', defaults);
	if (!(c.preset in scoring)) c.preset = 'easy';
	// a choice saved before Phase 4 has no hints or movement: its difficulty's suggestion
	const s = suggested[c.preset];
	c.hints = { ...s.hints, ...c.hints };
	c.movement ??= s.movement;
	c.rounds = clamp(Math.round(c.rounds), 0, MAX_ROUNDS);
	c.timeSec = c.timeSec ? clamp(Math.round(c.timeSec), T_MIN, T_MAX) : 0;
	c.hints.count = clamp(Math.round(c.hints.count), 0, MAX_HINTS);
	return c;
}
export const saveChoice = (c: Choice) => saveJSON('choice', c);

// Players never pick a panorama provider: the server gives them its own (Yandex for now).
// For development there is a hidden switch to test panoramas, which cost no Yandex views:
// `localStorage.sg_test_providers = 'demo'` in the console, removed to go back. The server
// plays them only where TEST_PROVIDERS enables them (the laptop), never on the real site.
export const testProviders = (): string[] =>
	load('test_providers', '')
		.split(',')
		.map((p) => p.trim())
		.filter(Boolean);

export function rulesFor(c: Choice, providers: string[] = []): Rules {
	return {
		...scoring[c.preset],
		rounds: c.rounds,
		timeSec: c.timeSec,
		movement: c.movement,
		compass: c.compass,
		hints: { ...c.hints },
		providers
	};
}

/** Rules back as the menu's choices: a room's rules, for its host to change. */
export function choiceFrom(r: Rules, map: string): Choice {
	const preset: Preset = r.scoreScale >= 2 ? 'easy' : r.scoreScale >= 1 ? 'normal' : 'hard';
	return {
		map,
		preset,
		rounds: r.rounds,
		timeSec: r.timeSec,
		hints: {
			count: r.hints.count,
			per: r.hints.per,
			kind: r.hints.kind ?? suggested[preset].hints.kind,
			cost: r.hints.cost
		},
		movement: r.movement,
		compass: r.compass
	};
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

// ---------- the sliders ----------

export const MAX_ROUNDS = 20;
export const MAX_HINTS = 10;

/** Rounds: 1…20, and one more step at the end for endless. */
export const ROUNDS_END = MAX_ROUNDS + 1;
export const roundsFromSlider = (v: number) => (v >= ROUNDS_END ? 0 : clamp(v, 1, MAX_ROUNDS));
export const sliderFromRounds = (n: number) => (n === 0 ? ROUNDS_END : n);

/** Time: 10 s … 10 min on a log scale (a second matters at 20 s, not at 8 min), settling on
 *  round values near the thumb; the last stretch of the track is "no limit". */
export const T_MIN = 10;
export const T_MAX = 600;
export const TIME_END = 1000;
const TIME_TOP = 940; // 600 s; past it, no limit
const SNAPS = [15, 20, 30, 45, 60, 90, 120, 180, 300, 600];
const SNAP_WIDTH = 16;

const pos = (s: number) => (TIME_TOP * Math.log(s / T_MIN)) / Math.log(T_MAX / T_MIN);

export function timeFromSlider(v: number): number {
	if (v > TIME_TOP + 20) return 0;
	if (v >= TIME_TOP) return T_MAX;
	for (const s of SNAPS) if (Math.abs(v - pos(s)) <= SNAP_WIDTH) return s;
	const raw = T_MIN * (T_MAX / T_MIN) ** (v / TIME_TOP);
	const step = raw < 60 ? 5 : raw < 180 ? 10 : 30;
	return clamp(Math.round(raw / step) * step, T_MIN, T_MAX);
}

export const sliderFromTime = (s: number) => (s === 0 ? TIME_END : Math.round(pos(s)));

export const HINT_COSTS = [0, 0.1, 0.2, 0.5];
export const HINT_KINDS: HintKind[] = ['region', 'district', 'circle'];
export const MOVEMENTS: Movement[] = ['move', 'nomove', 'nmpz'];
