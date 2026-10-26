// The menu's choices, turned into the server's Rules. The three difficulties are the same
// presets as in api-geo-shafaq/internal/rules (v0's Oson / O‘rta / Qiyin).
import type { Rules } from '#lib/api/client.js';
import { load, loadJSON, saveJSON } from '#lib/storage.js';

export type Preset = 'easy' | 'normal' | 'hard';

const presets: Record<Preset, Omit<Rules, 'rounds' | 'timeSec' | 'providers'>> = {
	easy: {
		movement: 'move',
		compass: true,
		hints: { count: 1, per: 'round', cost: 0 },
		scoreScale: 2,
		panoLabels: true,
		mapLabels: true
	},
	normal: {
		movement: 'move',
		compass: true,
		hints: { count: 1, per: 'round', cost: 0.2 },
		scoreScale: 1,
		panoLabels: false,
		mapLabels: true
	},
	hard: {
		movement: 'move',
		compass: true,
		hints: { count: 0, per: 'round', cost: 0 },
		scoreScale: 0.6,
		panoLabels: false,
		mapLabels: false
	}
};

/** What the player picked on the menu, remembered on this device. */
export interface Choice {
	map: string;
	preset: Preset;
	rounds: number;
	timeSec: number;
}

const defaults: Choice = {
	map: 'tashkent-streets',
	preset: 'easy',
	rounds: 5,
	timeSec: 0
};

export const loadChoice = (): Choice => loadJSON('choice', defaults);
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
	return { ...presets[c.preset], rounds: c.rounds, timeSec: c.timeSec, providers };
}

export const ROUNDS = [3, 5, 7, 10];
export const TIMES = [0, 60, 120, 180];
