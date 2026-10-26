import { describe, expect, it } from 'vitest';
import {
	applyPreset,
	rulesFor,
	roundsFromSlider,
	sliderFromRounds,
	sliderFromTime,
	timeFromSlider,
	type Choice
} from './rules.js';

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

describe('sliders', () => {
	it('rounds: 1 to 20, then endless', () => {
		expect(roundsFromSlider(7)).toBe(7);
		expect(roundsFromSlider(21)).toBe(0);
		expect(sliderFromRounds(0)).toBe(21);
	});
	it('time: round values come back to the same place', () => {
		for (const s of [10, 30, 60, 90, 120, 180, 300, 600]) {
			expect(timeFromSlider(sliderFromTime(s))).toBe(s);
		}
		expect(timeFromSlider(sliderFromTime(0))).toBe(0);
	});
	it('time: rises with the thumb, in round steps', () => {
		let last = 0;
		for (let v = 0; v <= 940; v += 5) {
			const s = timeFromSlider(v);
			expect(s).toBeGreaterThanOrEqual(last);
			expect(s % 5).toBe(0);
			last = s;
		}
		expect(timeFromSlider(0)).toBe(10);
	});
});
