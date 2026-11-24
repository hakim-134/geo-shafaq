import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Game } from '#lib/api/client.js';
import { fitMoment, fiveKNames, fiveKScorers } from './five-k.svelte.js';
import { challengeShare } from './share.js';

const players = ['Ali', 'Zebo', 'Lola', 'Aziz'].map((name) => ({ id: name, name, avatar: '🐼' }));

describe('5 000 in a room', () => {
	it('uses the score after hints and keeps room order across phones', () => {
		const scores = [
			{ player: 'Lola', score: 5000 },
			{ player: 'Aziz', score: 4999 },
			{ player: 'Ali', score: 5000 },
			{ player: 'Zebo', base: 5000, score: 4000 }
		];
		expect(fiveKScorers(scores, players)).toEqual([players[0], players[2]]);
	});

	it('keeps Siz! visible when the local scorer is third in room order', () => {
		expect(fiveKNames(players, 'Lola')).toEqual([
			players[0],
			' va ',
			{ ...players[2], name: 'Siz!' },
			' +2'
		]);
	});

	it('names one or two scorers, calls the local player Siz!, and counts the rest', () => {
		const line = (n: number) =>
			fiveKNames(players.slice(0, n), 'Zebo')
				.map((p) => (typeof p === 'string' ? p : p.name))
				.join('');
		expect([0, 1, 2, 3, 4].map(line)).toEqual([
			'',
			'Ali',
			'Ali va Siz!',
			'Ali va Siz! +1',
			'Ali va Siz! +2'
		]);
	});
});

describe('the celebration inside the result map', () => {
	const box = { left: 500, top: 40, width: 800, height: 560 };
	it('uses the badge in page pixels, including the laptop panel offset', () => {
		expect(fitMoment({ ...box, badge: { x: 800, y: 250 } }, 260, 220)).toEqual({
			x: 300,
			y: 210,
			scale: 1
		});
	});
	it('centres in the map until Yandex can project the badge', () => {
		expect(fitMoment(box, 260, 220)).toEqual({ x: 400, y: 280, scale: 1 });
	});
	it('fits wide digits in the narrow map beside a laptop panel', () => {
		expect(fitMoment({ ...box, width: 260 }, 320, 240)).toEqual({ x: 130, y: 280, scale: 0.75 });
	});
	it('shrinks the whole stack on a short phone and keeps it inside when panned to an edge', () => {
		expect(
			fitMoment({ left: 0, top: 0, width: 360, height: 170, badge: { x: -20, y: 190 } }, 240, 200)
		).toEqual({ x: 100, y: 85, scale: 0.75 });
	});
});

describe('shared result', () => {
	afterEach(() => vi.unstubAllGlobals());
	it('marks only exact final scores with the flag in the share text', () => {
		vi.stubGlobal('location', new URL('https://example.org'));
		const game = {
			map: { name: { uz: 'Toshkent' } },
			total: 13998,
			rounds: [4999, 5000, 3999, 0].map((score) => ({ result: { score } }))
		} as Game;
		expect(challengeShare(game, 'ABC').text.split('\n').at(-1)).toBe('🟩🏁🟨🟥');
	});
});
