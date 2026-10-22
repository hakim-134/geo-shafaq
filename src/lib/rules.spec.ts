import { describe, expect, it } from 'vitest';
import { rulesFor } from './rules.js';

describe('rulesFor', () => {
	it('turns the menu choice into the server presets', () => {
		const r = rulesFor({ map: 'x', preset: 'normal', rounds: 7, timeSec: 120, provider: '' });
		expect(r).toMatchObject({ rounds: 7, timeSec: 120, providers: [], scoreScale: 1 });
		expect(r.hints).toEqual({ count: 1, per: 'round', cost: 0.2 });
	});
	it('hard has no hints and no map labels', () => {
		const r = rulesFor({ map: 'x', preset: 'hard', rounds: 5, timeSec: 0, provider: 'yandex' });
		expect(r.hints.count).toBe(0);
		expect(r.mapLabels).toBe(false);
		expect(r.providers).toEqual(['yandex']);
	});
});
