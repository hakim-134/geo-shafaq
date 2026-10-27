import { describe, expect, it } from 'vitest';
import { starsFor } from './format';

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
