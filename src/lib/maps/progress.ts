// How much of the stars' gold a place gets on a map of places: a first street seen shows, and it
// deepens with every street seen and learned; solid only when every street there is learned. Used
// as `--known` in a color-mix with the paper. A map should say at a glance what the player knows.
import type { Schemas } from '#lib/api/client.js';

export function knownTint(p: Schemas['Progress']): string {
	if (!p.total || !p.seen) return '0%';
	return `${Math.round(22 + (78 * (p.seen + p.learned)) / (2 * p.total))}%`;
}

/** A place with fewer panoramas than the longest game: it plays, and its name in italics says
 * there is little there yet. */
export const fewPlaces = (p: { panoramas: number }) => p.panoramas > 0 && p.panoramas < 10;

/** "Chilonzor tumani" → "Chilonzor": on a map of districts the word is everywhere. A city keeps
 * "shahri": "Samarqand shahri" stands beside "Samarqand tumani". */
export function shortName(name: string): string {
	const short = name.replace(
		/\s+(tumani|viloyati|Respublikasi|район|область|District|Region|Republic)$/i,
		''
	);
	// the district beside the capital stays "Toshkent tumani": it never reads as the city
	return short === 'Toshkent' || short === 'Ташкентский' || short === 'Tashkent' ? name : short;
}
