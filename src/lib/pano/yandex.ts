// Yandex panoramas (JS API 2.1). The API finds the panorama nearest to the round's point;
// we check it is close enough and report it, so the server scores against what was shown.
import { loadYmaps } from '#lib/ymaps.js';
import { distanceKm, PanoError, type PanoViewer, type ViewerOptions } from './types';
import type { PanoView } from '#lib/api/client.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function createYandex(el: HTMLElement, opts: ViewerOptions): Promise<PanoViewer> {
	const ymaps = await loadYmaps(opts.lang);
	if (!ymaps.panorama.isSupported()) throw new PanoError('unsupported');

	let player: any = null;
	let start: { pano: any; dir: [number, number] } | null = null;
	let resetting = false;

	const onDirection = () => opts.onHeading(player.getDirection()[0]);
	// "No move": stepping to another panorama puts the player back
	const onPanorama = () => {
		if (opts.movement === 'move' || !start || resetting) return;
		const dir = player.getDirection();
		resetting = true;
		player.setPanorama(start.pano).then(() => {
			player.setDirection(dir);
			resetting = false;
		});
	};

	return {
		async open(view: PanoView) {
			if (!view.near) throw new PanoError('unsupported');
			let found: any[];
			try {
				found = await ymaps.panorama.locate([view.near.lat, view.near.lon]);
			} catch {
				throw new PanoError('network');
			}
			if (!found.length) throw new PanoError('not_found');
			const pano = found[0];
			const [lat, lon] = pano.getPosition();
			if (distanceKm({ lat, lon }, view.near) > (view.snapKm ?? 1))
				throw new PanoError('not_found');
			if (!opts.labels) pano.getMarkers = () => []; // house numbers and shop names hidden

			const dir: [number, number] = [view.heading ?? 0, 0];
			start = { pano, dir };
			if (!player) {
				player = new ymaps.panorama.Player(el, pano, {
					direction: dir,
					controls: ['zoomControl'],
					suppressMapOpenBlock: true,
					hotkeysEnabled: true
				});
				player.events.add('directionchange', onDirection);
				player.events.add('panoramachange', onPanorama);
			} else {
				resetting = true;
				await player.setPanorama(pano);
				player.setDirection(dir);
				resetting = false;
			}
			opts.onHeading(dir[0]);
			return { pos: { lat, lon } };
		},
		reset() {
			if (!player || !start) return;
			const s = start;
			resetting = true;
			player.setPanorama(s.pano).then(() => {
				player.setDirection(s.dir);
				resetting = false;
			});
		},
		destroy() {
			player?.destroy();
			player = null;
		}
	};
}
