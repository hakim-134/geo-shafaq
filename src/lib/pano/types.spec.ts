import { describe, expect, it } from 'vitest';
import { distanceKm } from './types.js';

describe('distanceKm', () => {
	it('matches the server (Tashkent to Samarkand ≈ 268 km)', () => {
		const d = distanceKm({ lat: 41.3111, lon: 69.2797 }, { lat: 39.6542, lon: 66.9597 });
		expect(d).toBeGreaterThan(265);
		expect(d).toBeLessThan(272);
	});
	it('is zero for the same point', () => {
		expect(distanceKm({ lat: 41, lon: 69 }, { lat: 41, lon: 69 })).toBe(0);
	});
});
