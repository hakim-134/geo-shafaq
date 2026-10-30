import { describe, expect, it, vi } from 'vitest';
import { applyPreset, loadChoice, rulesFor, type Choice } from './rules.js';

const choice = (c: Partial<Choice> = {}): Choice => ({
	...applyPreset({ map: 'x', preset: 'easy', rounds: 5, timeSec: 0 } as Choice, c.preset ?? 'easy'),
	compass: true,
	...c
});

describe('rulesFor', () => {
	it('turns the menu choice into the server rules', () => {
		const r = rulesFor(choice({ preset: 'normal', rounds: 7, timeSec: 90 }));
		expect(r).toMatchObject({ rounds: 7, timeSec: 90, providers: [], scoreScale: 1 });
		expect(r.hints).toEqual({ count: 1, per: 'round', kind: 'region', cost: 0.2 });
	});
	it('hard suggests no hints and has no map labels', () => {
		const r = rulesFor(choice({ preset: 'hard' }));
		expect(r.hints.count).toBe(0);
		expect(r.mapLabels).toBe(false);
	});
	it("keeps the player's own hints, movement and compass", () => {
		const c = choice({ movement: 'nomove', compass: false });
		c.hints = { count: 3, per: 'game', kind: 'circle', cost: 0.5 };
		const r = rulesFor(c);
		expect(r).toMatchObject({ movement: 'nomove', compass: false });
		expect(r.hints).toEqual({ count: 3, per: 'game', kind: 'circle', cost: 0.5 });
	});
	it('names test providers only when asked', () => {
		expect(rulesFor(choice(), ['demo']).providers).toEqual(['demo']);
	});
});

describe('tiles', () => {
	it('a choice saved before the tiles comes back on the nearest tile', () => {
		const kept = new Map<string, string>();
		vi.stubGlobal('localStorage', {
			getItem: (k: string) => kept.get(k) ?? null,
			setItem: (k: string, v: string) => kept.set(k, v)
		});
		localStorage.setItem('sg_choice', JSON.stringify({ ...choice(), rounds: 7, timeSec: 45 }));
		const c = loadChoice();
		expect([c.rounds, c.timeSec]).toEqual([5, 60]);
		localStorage.setItem('sg_choice', JSON.stringify({ ...choice(), rounds: 0, timeSec: 0 }));
		expect([loadChoice().rounds, loadChoice().timeSec]).toEqual([0, 0]);
		vi.unstubAllGlobals();
	});
});
