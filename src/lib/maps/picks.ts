// The picked places (P1111 §5, 1.3): the list the home plays. Each item is a map, by its slug: a
// place's own map (`place-<slug>`), Tashkent city's main streets (`tashkent-streets`) or a ready
// map (`uzbekistan`, `historic`). The list holds 1 to 8 items, none inside another: picking a place
// that holds picked ones takes their place, picking one inside a picked one narrows it down. Each
// item keeps its own colour (1 to 8, `--pick-N` in app.css) while it is in the list; a new one
// takes the first colour free. Pure: the home and its map (HomeMap) share it.
import type { MapSummary, Schemas, Text } from '#lib/api/client.js';

export const MAX_PICKS = 8;
export const COUNTRY = 'uzbekistan';

export interface Pick {
	/** The map that plays. */
	map: string;
	/** The one place it is (its face, its spot on the map); none for a map of several places. */
	place?: string;
	/** The places round it, the country first (Yunusobod: uzbekistan, toshkent; a region:
	 * uzbekistan; the country: none). Unknown until fetched. */
	path?: string[];
	/** What the map is made of (the historic cities: their places, starred on the map). */
	places?: string[];
	name?: Text;
	/** The small tag over its name: its parent, or what a ready map is ("Asosiy ko‘chalar"). */
	top?: Text;
	/** The place whose picture stands for it. */
	face?: string;
	/** 1 to 8. */
	color: number;
}

export type NewPick = Omit<Pick, 'color'>;

/** Does `a` lie inside `b`, or is it `b`'s own place? A map of several places lies in the
 * country and holds nothing. */
export function within(a: NewPick, b: NewPick): boolean {
	if (a.map === b.map) return true;
	if (!b.place) return false;
	if (a.place === b.place) return true;
	return !!a.path?.includes(b.place);
}

/** The first colour no item wears. */
export function freeColor(list: Pick[]): number {
	for (let c = 1; c <= MAX_PICKS; c++) if (!list.some((p) => p.color === c)) return c;
	return 1;
}

export type Added = { list: Pick[]; outcome: 'added' | 'same' | 'full' };

/** The list with `p` picked: replacing the one it narrows, or the ones it holds; else at the
 * end, if there is room. The player's first pick replaces the default, even for the same map. */
export function addPick(list: Pick[], p: NewPick, replaceDefault = false): Added {
	if (replaceDefault) return { list: [{ ...p, color: 1 }], outcome: 'added' };
	if (list.some((x) => x.map === p.map)) return { list, outcome: 'same' };
	// inside a picked one: it narrows that one down, in its place and colour
	const outer = list.findIndex((x) => within(p, x));
	if (outer >= 0) {
		const next = [...list];
		next[outer] = { ...p, color: list[outer].color };
		return { list: next, outcome: 'added' };
	}
	// holds picked ones: it stands where the first of them stood, in its colour
	const inner = list.filter((x) => within(x, p));
	if (inner.length) {
		const first = list.indexOf(inner[0]);
		const next: Pick[] = [];
		list.forEach((x, i) => {
			if (i === first) next.push({ ...p, color: x.color });
			else if (!inner.includes(x)) next.push(x);
		});
		return { list: next, outcome: 'added' };
	}
	if (list.length >= MAX_PICKS) return { list, outcome: 'full' };
	return { list: [...list, { ...p, color: freeColor(list) }], outcome: 'added' };
}

/** The list without `map`; the last item never goes. */
export function removePick(list: Pick[], map: string): Pick[] {
	if (list.length <= 1) return list;
	const next = list.filter((x) => x.map !== map);
	return next.length ? next : list;
}

/** A map's own summary as an item (a place's map, a ready map). */
export function pickOfMap(m: MapSummary): NewPick {
	const place = m.place?.slug;
	return {
		map: m.slug,
		place,
		path: !place
			? [COUNTRY]
			: m.place!.kind === 'country'
				? []
				: !m.parent || m.parent.slug === COUNTRY
					? [COUNTRY]
					: [COUNTRY, m.parent.slug],
		places: m.places,
		name: m.name,
		top: m.description,
		face: m.face
	};
}

/** One part of a mixed map as an item; its path comes later (the place's own answer). */
export function pickOfPart(part: Schemas['MapPart']): NewPick {
	const one = part.places.length === 1 ? part.places[0] : undefined;
	return {
		map: part.slug,
		place: one,
		path: one ? (one === COUNTRY ? [] : undefined) : [COUNTRY],
		places: part.places,
		name: part.name,
		face: part.face
	};
}

/** The list as the server's answer says it is (`parts` of a mix, or one map: the server may fold
 * a list), the items already here keeping their colour and what is known of them. */
export function listOf(m: MapSummary, old: Pick[] = []): Pick[] {
	const items: NewPick[] = m.parts?.length ? m.parts.map(pickOfPart) : [pickOfMap(m)];
	// A saved mix can come back in the order it was first created. Keep the order on screen.
	const order = new Map(old.map((p, i) => [p.map, i]));
	items.sort((a, b) => (order.get(a.map) ?? old.length) - (order.get(b.map) ?? old.length));
	const out: Pick[] = [];
	for (const it of items) {
		const was = old.find((x) => x.map === it.map);
		const keep = was && !out.some((x) => x.color === was.color);
		const merged: NewPick = was
			? {
					...was,
					...Object.fromEntries(Object.entries(it).filter(([, v]) => v !== undefined))
				}
			: it;
		out.push({ ...merged, color: keep ? was.color : 0 });
	}
	// the new ones take the colours free, in order
	for (const x of out) if (!x.color) x.color = freeColor(out.filter((y) => y.color));
	return out;
}
