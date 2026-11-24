import { afterEach, expect, it, vi } from 'vitest';
import { northTurn } from './north.js';

afterEach(() => vi.unstubAllGlobals());

function camera() {
	let frame: FrameRequestCallback | undefined;
	vi.stubGlobal('performance', { now: () => 0 });
	vi.stubGlobal('matchMedia', () => ({ matches: false }));
	vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => {
		frame = f;
		return 1;
	});
	vi.stubGlobal('cancelAnimationFrame', () => (frame = undefined));
	const el = new EventTarget();
	const turn = northTurn(el as HTMLElement);
	const bearing = vi.fn();
	return { turn, bearing, el, tick: (now: number) => frame?.(now) };
}

it.each([
	[90, 11.25],
	[270, 348.75],
	[-90, 348.75]
])('turns from %s° along the short arc and lands at north', (start, halfway) => {
	const { turn, bearing, tick } = camera();
	turn.from(start, bearing);
	tick(225);
	expect(bearing).toHaveBeenLastCalledWith(halfway);
	tick(450);
	expect(bearing).toHaveBeenLastCalledWith(0);
});

it('releases the camera immediately when a player starts dragging', () => {
	const { turn, bearing, el, tick } = camera();
	turn.from(240, bearing);
	tick(100);
	el.dispatchEvent(new Event('pointerdown'));
	tick(450);
	expect(bearing).toHaveBeenCalledTimes(1);
});
