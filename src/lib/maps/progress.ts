// How much gold a place gets on a map of places: the share of its streets seen tints it,
// learned ones fill it; solid only when every street there is learned (one game of five
// streets is a faint tint). Used as `--known` in a color-mix with the paper.
import type { Schemas } from '#lib/api/client.js';

export function knownTint(p: Schemas['Progress']): string {
	if (!p.total || !p.seen) return '0%';
	return `${Math.round(10 + (70 * (0.35 * p.seen + 0.65 * p.learned)) / p.total)}%`;
}

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
