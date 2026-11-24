// Both panorama SDKs report heading changes to the compass as the camera turns.
export function northTurn(el: HTMLElement) {
	let frame: number | undefined;
	function stop() {
		if (frame !== undefined) cancelAnimationFrame(frame);
		frame = undefined;
		el.removeEventListener('pointerdown', stop, true);
	}

	function from(heading: number, setBearing: (deg: number) => void) {
		stop();
		// Signed distance from north in [-180, 180), even for an unwrapped bearing.
		const offset = ((((heading + 180) % 360) + 360) % 360) - 180;
		if (!offset || matchMedia('(prefers-reduced-motion: reduce)').matches) {
			setBearing(0);
			return;
		}
		const start = performance.now();
		function step(now: number) {
			const elapsed = Math.max(0, now - start);
			const remaining = Math.max(0, 1 - elapsed / 450);
			setBearing((360 + offset * remaining ** 3) % 360);
			if (remaining > 0) frame = requestAnimationFrame(step);
			else stop();
		}
		el.addEventListener('pointerdown', stop, true);
		frame = requestAnimationFrame(step);
	}

	return { from, stop };
}
