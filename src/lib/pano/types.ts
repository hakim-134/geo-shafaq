// One interface for every panorama provider. The game never talks to Yandex, Mapillary or
// Photo Sphere Viewer directly; it asks for a viewer for the round's provider.
import type { LatLon, PanoView } from '#lib/api/client.js';

export type Movement = 'move' | 'nomove' | 'nmpz';

export interface ViewerOptions {
	lang: 'uz' | 'en' | 'ru';
	/** House numbers and place labels inside the panorama. */
	labels: boolean;
	movement: Movement;
	/** Where the player is looking, degrees from north: feeds the compass. */
	onHeading: (deg: number) => void;
}

export interface PanoViewer {
	/** Opens a round's panorama. For providers that search near a point, it resolves with
	 *  the position of the panorama it actually opened (the server scores against it). */
	open(view: PanoView): Promise<{ pos: LatLon | null }>;
	/** Back to where the round started. */
	reset(): void;
	destroy(): void;
}

/** Why a panorama did not open. not_found counts against the panorama on the server. */
export class PanoError extends Error {
	constructor(public kind: 'not_found' | 'key' | 'network' | 'unsupported') {
		super(kind);
	}
}

export function distanceKm(a: LatLon, b: LatLon): number {
	const r = (d: number) => (d * Math.PI) / 180;
	const h =
		Math.sin(r(b.lat - a.lat) / 2) ** 2 +
		Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2;
	return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
