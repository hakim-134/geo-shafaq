// The menu's choices, turned into the server's Rules. The three difficulties are the same
// presets as in api-geo-shafaq/internal/rules (v0's Oson / O‘rta / Qiyin).
import type { Rules } from '#lib/api/client.js';
import { loadJSON, saveJSON } from '#lib/storage.js';

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
	provider: string; // '' = any
}

const defaults: Choice = {
	map: 'tashkent-streets',
	preset: 'easy',
	rounds: 5,
	timeSec: 0,
	provider: ''
};

export const loadChoice = (): Choice => loadJSON('choice', defaults);
export const saveChoice = (c: Choice) => saveJSON('choice', c);

export function rulesFor(c: Choice): Rules {
	return {
		...presets[c.preset],
		rounds: c.rounds,
		timeSec: c.timeSec,
		providers: c.provider ? [c.provider] : []
	};
}

export const ROUNDS = [3, 5, 7, 10];
export const TIMES = [0, 60, 120, 180];
