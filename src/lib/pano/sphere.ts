// Our own panoramas, and the drawn demo ones: one equirectangular image per panorama, shown
// with Photo Sphere Viewer. The image URL is opaque; the browser never learns the position.
import { Viewer } from '@photo-sphere-viewer/core';
import '@photo-sphere-viewer/core/index.css';
import { PanoError, type PanoViewer, type ViewerOptions } from './types';
import type { PanoView } from '#lib/api/client.js';
import { apiUrl } from '#lib/config.js';

const rad = (deg: number) => (deg * Math.PI) / 180;
const deg = (r: number) => ((((r * 180) / Math.PI) % 360) + 360) % 360;
// The API may link an image relative to itself (local runs, so a phone on the LAN works too).
const imageSrc = (url: string) => new URL(url, apiUrl() + '/').href;

export async function createSphere(el: HTMLElement, opts: ViewerOptions): Promise<PanoViewer> {
	let viewer: Viewer | null = null;
	let startYaw = 0;

	return {
		async open(view: PanoView) {
			if (!view.imageUrl) throw new PanoError('unsupported');
			startYaw = rad(view.heading ?? 0);
			try {
				if (!viewer) {
					viewer = new Viewer({
						container: el,
						panorama: imageSrc(view.imageUrl),
						defaultYaw: startYaw,
						defaultPitch: 0,
						navbar: ['zoom'],
						loadingTxt: '',
						withCredentials: false
					});
					viewer.addEventListener('position-updated', ({ position }) =>
						opts.onHeading(deg(position.yaw))
					);
					await new Promise<void>((resolve, reject) => {
						viewer!.addEventListener('ready', () => resolve(), { once: true });
						viewer!.addEventListener('panorama-error', () => reject(new Error('load')), {
							once: true
						});
					});
				} else {
					await viewer.setPanorama(imageSrc(view.imageUrl), {
						position: { yaw: startYaw, pitch: 0 },
						transition: false,
						showLoader: false
					});
				}
			} catch {
				throw new PanoError('network');
			}
			opts.onHeading(view.heading ?? 0);
			return { pos: null };
		},
		reset() {
			viewer?.rotate({ yaw: startYaw, pitch: 0 });
			viewer?.zoom(50);
		},
		destroy() {
			viewer?.destroy();
			viewer = null;
		}
	};
}
