// The menu's choices, turned into the server's Rules. A difficulty (Oson / O‘rta / Qiyin) is how
// hard the places are to guess, and nothing else (the owner, 2026-11-02): rounds, time, hints,
// movement and the compass are the player's own, on every difficulty.
import type { Rules } from '#lib/api/client.js';
import { load, loadJSON, saveJSON } from '#lib/storage.js';

export type Preset = 'easy' | 'normal' | 'hard';
export const PRESETS: Preset[] = ['easy', 'normal', 'hard'];
export type Movement = Rules['movement'];
export type HintPer = Rules['hints']['per'];
export type HintKind = NonNullable<Rules['hints']['kind']>;

export interface HintChoice {
	count: number;
	per: HintPer;
	kind: HintKind;
	cost: number;
}

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
	hints: { count: 1, per: 'round', kind: 'district', cost: 0 },
	movement: 'move',
	compass: true
};

export function loadChoice(): Choice {
	const c = loadJSON('choice', defaults);
	if (!PRESETS.includes(c.preset)) c.preset = 'easy';
	// a choice saved before Phase 4 has no hints or movement
	c.hints = { ...defaults.hints, ...c.hints };
	c.movement ??= defaults.movement;
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
		difficulty: c.preset,
		scoreScale: 1,
		panoLabels: true,
		mapLabels: true,
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
	// a room from before difficulty meant this has it only as its scoring
	const preset: Preset =
		r.difficulty ?? (r.scoreScale >= 2 ? 'easy' : r.scoreScale >= 1 ? 'normal' : 'hard');
	return {
		map,
		preset,
		rounds: r.rounds,
		timeSec: r.timeSec,
		hints: {
			count: r.hints.count,
			per: r.hints.per,
			kind: r.hints.kind ?? defaults.hints.kind,
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
