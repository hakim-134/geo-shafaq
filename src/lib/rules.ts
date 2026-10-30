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
	c.rounds = nearest(Math.max(0, c.rounds || 0), ROUND_TILES);
	c.timeSec = nearest(Math.max(0, c.timeSec || 0), TIME_TILES);
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

// ---------- the tiles ----------

export const MAX_HINTS = 10;

/** Rounds and round time are tiles, not sliders (P1028 2.4): 0 is endless, no limit. */
export const ROUND_TILES = [3, 5, 10, 0];
export const TIME_TILES = [0, 30, 60, 180];

/** The tile nearest a value saved before the tiles (7 rounds, 0:45); 0 stays 0. */
function nearest(v: number, tiles: number[]): number {
	if (!v) return 0;
	const on = tiles.filter(Boolean);
	return on.reduce((a, b) => (Math.abs(Math.log(b / v)) < Math.abs(Math.log(a / v)) ? b : a));
}

export const HINT_COSTS = [0, 0.1, 0.2, 0.5];
export const HINT_KINDS: HintKind[] = ['region', 'district', 'circle'];
export const MOVEMENTS: Movement[] = ['move', 'nomove', 'nmpz'];
