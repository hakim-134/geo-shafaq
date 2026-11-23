// How much gold a place gets on a map of places. Gold is what the player has learned (decision
// 0024), never only played: a place stays milk until its first street is learned, then a light
// gold wash that deepens with learned ÷ all, solid gold when every street there is learned (1 of
// 25: the wash; 25 of 25: full gold). Used as `--known` in PlaceMap's color-mix, from the wash
// (0%) to the rich gold (100%); `learnedAny` says whether a place is gold at all. A child reads
// the picture: a gold district must be one they know.
import type { Schemas } from '#lib/api/client.js';

export const learnedAny = (p: Schemas['Progress']) => p.total > 0 && p.learned > 0;

export function knownTint(p: Schemas['Progress']): string {
	if (!learnedAny(p)) return '0%';
	return `${Math.round((100 * Math.min(p.learned, p.total)) / p.total)}%`;
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
