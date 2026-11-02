import { describe, expect, it } from 'vitest';
import { crowdGap, crowdKm, starsFor } from './format';

describe('starsFor', () => {
	it('gives a round up to three stars by its score', () => {
		expect(starsFor(0)).toBe(0);
		expect(starsFor(999)).toBe(0);
		expect(starsFor(1000)).toBe(1);
		expect(starsFor(2500)).toBe(2);
		expect(starsFor(3999)).toBe(2);
		expect(starsFor(4000)).toBe(3);
		expect(starsFor(5000)).toBe(3);
	});
});

describe('crowdKm', () => {
	it('averages a round’s guesses, once there are two', () => {
		expect(crowdKm([{ km: 1 }, { km: 3 }, { km: 8 }])).toBe(4);
		expect(crowdKm([{ km: 1 }, {}, { km: null }, { km: 3 }])).toBe(2);
		expect(crowdKm([{ km: 1 }, {}])).toBeUndefined();
		expect(crowdKm([])).toBeUndefined();
	});
});

describe('crowdGap', () => {
	it('is the difference of the numbers on screen', () => {
		expect(crowdGap(7.58, 6.14)).toBe(1.5); // 7.6 − 6.1, not 1.44
		expect(crowdGap(3, 10.44)).toBe(-7.4);
		expect(crowdGap(0.5004, 0.5)).toBe(0); // both say 500 m
		expect(crowdGap(150.4, 149.6)).toBe(0);
	});
});
