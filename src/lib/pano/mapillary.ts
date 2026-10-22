// Mapillary (MapillaryJS): street imagery by its contributors, CC BY-SA. Opened by image id.
import { mapillaryToken } from '#lib/config.js';
import { PanoError, type PanoViewer, type ViewerOptions } from './types';
import type { PanoView } from '#lib/api/client.js';

export async function createMapillary(el: HTMLElement, opts: ViewerOptions): Promise<PanoViewer> {
	const token = mapillaryToken();
	if (!token) throw new PanoError('key');
	const { Viewer } = await import('mapillary-js');
	await import('mapillary-js/dist/mapillary.css');

	let viewer: InstanceType<typeof Viewer> | null = null;
	let startId = '';

	return {
		async open(view: PanoView) {
			if (!view.ref) throw new PanoError('unsupported');
			startId = view.ref;
			try {
				if (!viewer) {
					viewer = new Viewer({
						accessToken: token,
						container: el,
						imageId: view.ref,
						component: { cover: false }
					});
					viewer.on('bearing', (e: { bearing: number }) => opts.onHeading(e.bearing));
					if (opts.movement !== 'move') {
						viewer.deactivateComponent('direction');
						viewer.deactivateComponent('sequence');
					}
				} else {
					await viewer.moveTo(view.ref);
				}
			} catch {
				throw new PanoError('not_found');
			}
			return { pos: null };
		},
		reset() {
			if (viewer && startId) void viewer.moveTo(startId);
		},
		destroy() {
			viewer?.remove();
			viewer = null;
		}
	};
}
