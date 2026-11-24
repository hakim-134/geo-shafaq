<script module lang="ts">
	// A place's children as cards (names, panoramas, their own maps) and the places round it,
	// fetched once and kept, like the drawings: zooming back into a part draws its names at once.
	import { api, call, type Schemas } from '#lib/api/client.js';

	type Detail = Schemas['PlaceDetail'];
	const details = new Map<string, Promise<Detail>>();

	export function placeDetail(slug: string): Promise<Detail> {
		let got = details.get(slug);
		if (!got) {
			got = call(api().GET('/v1/places/{slug}', { params: { path: { slug } } }));
			got.catch(() => details.delete(slug)); // a failed answer is asked again next time
			details.set(slug, got);
		}
		return got;
	}
</script>

<script lang="ts">
	// The home's map, the map picker (P1111 §5, 1.3; the owner, 2026-11-13: "by clicking it, it
	// shouldn't go to another page; just make it look like it zoomed in"). One map, one behaviour:
	// it opens on Uzbekistan's 14 parts as milk tiles, with no way up. A tap goes in, in place: the
	// drawing's view moves until the place fills the box, the land round it fades away softly before
	// the box's edge, and its neighbours stay as faint tiles. In a part (a region, Tashkent) its
	// districts and towns come up with their names; a tap on one goes into it, a third level. The
	// square at the top left is the place on screen in its parent (its face); a tap on it goes up one
	// level: a district to its part, a region to the country, Tashkent to Toshkent viloyati (where
	// the city is one tile among the region's districts) and on to the country. Inside a place one
	// quiet key, "Tanlash", adds it to the home's list of picked places (picks.ts); when it is in
	// the list the key says "✓ Tanlangan" and a tap takes it out. The picked places wear their own
	// colours at every level: a picked region whole, a picked district in its region,
	// Tashkent's badge for a pick in Tashkent, the historic cities' stars. A place
	// with no panoramas is hatched, "Tez orada", and can't be picked; one with few has its name in
	// italics (decision 0016). Nothing outside the box moves.
	import { tick, untrack } from 'svelte';
	import { t, tx } from '#lib/i18n/index.svelte.js';
	import { fewPlaces, shortName } from './progress.js';
	import { COUNTRY, type NewPick, type Pick } from './picks.js';
	import PlaceInParent, {
		placeDrawing,
		pieces,
		points,
		type Drawing
	} from './PlaceInParent.svelte';

	let {
		picks,
		ownList,
		locked,
		readonly = false,
		shownPlace = $bindable(),
		onpick,
		onunpick
	}: {
		picks: Pick[];
		ownList: boolean;
		locked: boolean;
		readonly?: boolean;
		shownPlace: NewPick | undefined; // the playable place on screen
		onpick: (p: NewPick) => void; // "Tanlash": the place on screen joins the list
		onunpick: (map: string) => void; // "✓ Tanlangan" tapped: it leaves the list
	} = $props();

	type Card = Schemas['PlaceCard'];
	type Box = [number, number, number, number];

	const CITY = 'toshkent'; // Tashkent city plays its main streets, never its own place map
	// a part that lies inside another (Tashkent in Toshkent viloyati): zoomed into it, the other's
	// districts are the faint tiles round it, as in its face, not one flat sheet; and going up
	// from it shows the other, the city one tile among its districts
	const AROUND: Record<string, string> = { [CITY]: 'toshkent-viloyati' };
	const HOLDS: Record<string, string> = { 'toshkent-viloyati': CITY };
	const uid = $props.id();
	const reduced =
		typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

	let country = $state<Drawing | null>(null);
	let parts = $state<Record<string, Drawing>>({}); // a part's districts, by the part
	let veil = $state(0); // 0 on the country, 1 zoomed in: how far the land round has faded
	let settled = $state<string | null>(null); // the place the view has finished gliding into
	let cards = $state<Record<string, Card>>({}); // every place seen, by its slug
	let countryName = $state<Schemas['Text'] | undefined>();
	let level = $state(COUNTRY); // what fills the box: the country, a part, or a district
	let shown = $state<string | null>(null); // the part whose districts are drawn (also while leaving)
	let up = $state(false); // the districts' turn to come up
	let zin = $state(false); // zoomed in: the drawing is clipped to the box, its edges fade
	let W = $state(0);
	let H = $state(0);
	let vw = $state(0);
	let vb = $state<number[] | null>(null);

	const lap = $derived(vw > 960);
	// drawing units per screen px (the view is fitted, "meet"): the hatch's scale
	const hk = $derived(vb && W && H ? Math.max(vb[2] / W, vb[3] / H) : 1);

	const addedDetails = new Set<string>();
	function addCards(d: Detail) {
		if (addedDetails.has(d.place.slug)) return;
		addedDetails.add(d.place.slug);
		cards[d.place.slug] = d.place;
		for (const c of d.children) cards[c.slug] = c;
	}

	// the country at once; again whenever the list changes (after being offline) until it's here
	let countryCards = false;
	$effect(() => {
		void picks.length;
		if (!untrack(() => country))
			placeDrawing(COUNTRY).then(
				(d) => (country = d),
				() => {
					/* offline: the box stays quiet until the home loads again */
				}
			);
		if (!countryCards)
			placeDetail(COUNTRY).then(
				(d) => {
					countryCards = true;
					countryName = d.place.name;
					addCards(d);
				},
				() => {}
			);
	});

	function loadDrawing(slug: string): Promise<Drawing> {
		return placeDrawing(slug).then((d) => (parts[slug] ??= d));
	}
	function loadPart(slug: string) {
		return Promise.all([parts[slug] ?? loadDrawing(slug), placeDetail(slug).then(addCards)]);
	}

	function boxOf(d: string): Box {
		let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
		for (const [x, y] of points(d)) {
			if (x < x0) x0 = x;
			if (x > x1) x1 = x;
			if (y < y0) y0 = y;
			if (y > y1) y1 = y;
		}
		return [x0, y0, x1, y1];
	}
	/** A part's own drawing laid onto its box in the country's drawing. */
	const laidOn = (slug: string, d: Drawing) => {
		const b = boxes[slug];
		return `translate(${b[0]} ${b[1]}) scale(${(b[2] - b[0]) / d.width} ${(b[3] - b[1]) / d.height})`;
	};
	// every place's box in the country's drawing: the parts, and the districts of the parts drawn
	const partBoxes = $derived(
		Object.fromEntries((country?.shapes ?? []).map((s) => [s.slug, boxOf(s.d)])) as Record<
			string,
			Box
		>
	);
	const boxes = $derived.by(() => {
		const out: Record<string, Box> = { ...partBoxes };
		for (const [p, d] of Object.entries(parts)) {
			const b = partBoxes[p];
			if (!b) continue;
			const sx = (b[2] - b[0]) / d.width;
			const sy = (b[3] - b[1]) / d.height;
			for (const s of d.shapes) {
				const [x0, y0, x1, y1] = boxOf(s.d);
				out[s.slug] ??= [b[0] + x0 * sx, b[1] + y0 * sy, b[0] + x1 * sx, b[1] + y1 * sy];
			}
		}
		return out;
	});
	// a district's part, from the parts drawn
	const parentOf = $derived(
		Object.fromEntries(
			Object.entries(parts).flatMap(([p, d]) => d.shapes.map((s) => [s.slug, p]))
		) as Record<string, string>
	);
	const isPart = (slug: string) => !!partBoxes[slug];
	/** What lies on screen at full strength, round the place: the city in its region's hole. */
	const isCur = (slug: string) => slug === level || HOLDS[level] === slug;

	// ---------- the view: a box of the drawing, fitted into the map's box ----------

	/** The view that shows `bb` as large as the box allows, with room for the square, the name
	 * and the key when zoomed in. */
	function fit(bb: Box, zoomed: boolean): number[] {
		const ins = zoomed
			? lap
				? { t: 92, b: 80, l: 24, r: 24 }
				: { t: 72, b: 64, l: 14, r: 14 }
			: lap
				? { t: 20, b: 20, l: 10, r: 10 }
				: { t: 10, b: 14, l: 12, r: 12 };
		const aw = Math.max(40, W - ins.l - ins.r);
		const ah = Math.max(40, H - ins.t - ins.b);
		const bw = Math.max(bb[2] - bb[0], 1e-6);
		const bh = Math.max(bb[3] - bb[1], 1e-6);
		const k = Math.min(aw / bw, ah / bh);
		return [
			bb[0] - (ins.l + (aw - bw * k) / 2) / k,
			bb[1] - (ins.t + (ah - bh * k) / 2) / k,
			W / k,
			H / k
		];
	}
	const viewOf = (lv: string) =>
		lv === COUNTRY ? fit([0, 0, country!.width, country!.height], false) : fit(boxes[lv], true);
	const target = $derived(
		country && W && H && (level === COUNTRY || boxes[level]) ? viewOf(level) : null
	);

	let raf = 0;
	let moving = false;
	/** The view glides to `to` in 450 ms, easing out, and the land round fades with it (`fade`: 1
	 * zooming in, 0 going out); with reduced motion it cuts. */
	function glide(to: number[], fade: number, done?: () => void) {
		cancelAnimationFrame(raf);
		const from = vb;
		const veil0 = veil;
		if (reduced || !from) {
			vb = to;
			veil = fade;
			moving = false;
			done?.();
			return;
		}
		moving = true;
		const t0 = performance.now();
		const step = (now: number) => {
			const k = Math.min(1, (now - t0) / 450);
			const e = 1 - (1 - k) ** 3;
			vb = from.map((v, i) => v + (to[i] - v) * e);
			veil = veil0 + (fade - veil0) * e;
			if (k < 1) raf = requestAnimationFrame(step);
			else {
				moving = false;
				done?.();
			}
		};
		raf = requestAnimationFrame(step);
	}
	// the first drawing, and a box that changed size (a phone turned, a window resized): no glide
	$effect(() => {
		const to = target;
		if (to && !untrack(() => moving)) {
			vb = to;
			veil = untrack(() => level) === COUNTRY ? 0 : 1;
		}
	});
	$effect(() => () => cancelAnimationFrame(raf));

	// screen pixels per unit of the drawing: the badge and the stars keep their size on screen
	const k = $derived(vb && W ? W / vb[2] : 1);

	// ---------- moving round the map ----------

	let navigation = 0; // a tap or going up can supersede a fly-to while its drawing loads
	let upTimer: ReturnType<typeof setTimeout> | undefined;
	/** Into a part or a district, in place. */
	function open(slug: string, request = ++navigation) {
		if (request !== navigation) return false;
		if (slug === level) return true;
		if (!boxes[slug]) return false;
		const part = isPart(slug) ? slug : parentOf[slug];
		if (!part) return false;
		level = slug;
		zin = true;
		settled = null;
		if (part !== shown) {
			shown = part;
			up = false;
			loadPart(part).catch(() => {});
			if (AROUND[part]) loadPart(AROUND[part]).catch(() => {});
		}
		if (!up) {
			clearTimeout(upTimer);
			upTimer = setTimeout(() => shown === part && (up = true), reduced ? 0 : 300);
		}
		// the names come once the view stands still: laid out for where it stops
		glide(viewOf(slug), 1, () => level === slug && (settled = slug));
		return true;
	}
	function toCountry() {
		clearTimeout(upTimer);
		level = COUNTRY;
		up = false;
		settled = null;
		glide(viewOf(COUNTRY), 0, () => {
			if (level !== COUNTRY) return;
			shown = null;
			zin = false;
		});
	}
	/** One level up: a district to its part, Tashkent to its region, a part to the country. */
	function goUp() {
		const request = ++navigation;
		if (level === COUNTRY || !country) return;
		const part = isPart(level) ? (AROUND[level] ?? null) : parentOf[level];
		if (part) open(part, request);
		else toCountry();
	}
	$effect(() => () => clearTimeout(upTimer));

	/** Flies to a place (a picked one in the list; an old link to the places page): the country,
	 * a part, or a district (loading its part first). */
	export async function flyTo(slug: string | undefined) {
		const request = ++navigation;
		try {
			const drawing = country ?? (await placeDrawing(COUNTRY));
			if (request !== navigation) return false;
			country ??= drawing;
			if (!slug || slug === COUNTRY) {
				if (level !== COUNTRY) toCountry();
				return true;
			}
			let to = slug;
			let part = slug;
			if (!isPart(part)) {
				const path = (await placeDetail(slug)).path.map((p) => p.slug);
				if (request !== navigation) return false;
				part = path[1];
				if (!part || !isPart(part)) return false;
				to = path[2] ?? slug; // a place under a district: its district
			}
			await loadPart(part);
			await tick();
			if (!open(to, request)) return false;
			await tick();
			return request === navigation && level === to;
		} catch {
			return false;
		}
	}

	const press = (e: KeyboardEvent, act: () => void) => {
		if (e.key !== 'Enter' && e.key !== ' ') return;
		e.preventDefault();
		act();
	};
	function onKey(e: KeyboardEvent) {
		// a sheet open over the map closes on its own Escape
		if (e.key === 'Escape' && !document.querySelector('[aria-modal="true"]')) goUp();
	}

	// ---------- "Tanlash": the place on screen joins the list ----------

	const quiet = (slug: string) => cards[slug]?.panoramas === 0;
	const playable = (slug: string) => (cards[slug]?.panoramas ?? 0) > 0;
	const onScreen = $derived.by((): NewPick | undefined => {
		if (level === COUNTRY || !playable(level)) return;
		const part = isPart(level) ? null : parentOf[level];
		const card = cards[level];
		return {
			map: level === CITY ? 'tashkent-streets' : card.map,
			place: level,
			path: part ? [COUNTRY, part] : [COUNTRY],
			name: card.name,
			top: part ? cards[part]?.name : countryName,
			face: level
		};
	});
	$effect(() => {
		shownPlace = onScreen;
	});
	const soon = $derived(level !== COUNTRY && quiet(level));
	const taken = $derived(ownList ? picks.find((p) => p.map === onScreen?.map) : undefined);
	const offer = $derived(!!country && level !== COUNTRY && picks.length > 0 && !!cards[level]);
	let takeW = $state(0);

	function take() {
		if (locked || !offer || !onScreen) return;
		if (taken) {
			if (picks.length > 1) onunpick(taken.map);
			return;
		}
		onpick(onScreen);
	}

	// ---------- the picked places, in their colours ----------

	/** The pick that holds a place: the place itself, its part, or the whole country. Quiet
	 * districts of a picked part keep its colour beneath the hatching. */
	function pickFor(slug: string, part?: string | null): Pick | undefined {
		const parent = part ? picks.find((p) => p.place === part) : undefined;
		if (quiet(slug)) return parent;
		return picks.find((p) => p.place === slug) ?? parent ?? picks.find((p) => p.place === COUNTRY);
	}
	const pc = (p?: Pick) => (p ? `var(--pick-${p.color})` : undefined);
	// Tashkent's badge: Tashkent picked, or a place in it, or the whole country
	const cityPick = $derived(
		picks.find((p) => p.place === CITY || p.path?.includes(CITY)) ??
			picks.find((p) => p.place === COUNTRY)
	);

	// Load the districts of picked regions even when the player opens on the country.
	$effect(() => {
		for (const p of picks) {
			const place = p.place;
			if (place && cards[place]?.kind === 'region') untrack(() => loadPart(place)).catch(() => {});
			const part = p.path?.[1];
			if (part && !untrack(() => parts[part])) loadDrawing(part).catch(() => {});
		}
	});
	const deep = $derived(
		picks.flatMap((p) => {
			const part = p.path?.[1];
			const d = part ? parts[part] : undefined;
			if (!part || !d || !partBoxes[part]) return [];
			const at = laidOn(part, d);
			return d.shapes
				.filter((s) => s.slug === p.place && p.path?.length === 2)
				.map((s) => ({ slug: s.slug, part, d: s.d, at, color: pc(p) }));
		})
	);
	const pickedParts = $derived(
		(country?.shapes ?? []).flatMap((shape) => {
			const { slug } = shape;
			const drawing = parts[slug];
			if (!drawing || !picks.some((p) => p.place === slug)) return [];
			const [x0, y0, x1, y1] = partBoxes[slug];
			return [
				{
					shape,
					at: laidOn(slug, drawing),
					quiet: drawing.shapes.filter((s) => quiet(s.slug)),
					hatchScale: `scale(${drawing.width / (x1 - x0)} ${drawing.height / (y1 - y0)})`
				}
			];
		})
	);

	// a ready map of several places (the historic cities): a star on each, in its colour; stars
	// that would touch on screen are one (Buxoro and Kogon on the country)
	let starSets = $state<{ color: string; marks: { x: number; y: number }[] }[]>([]);
	const starKey = $derived(
		picks
			.filter((p) => !p.place && p.places?.length)
			.map((p) => `${p.color}:${[...p.places!].sort().join(',')}`)
			.join('|')
	);
	$effect(() => {
		const key = starKey;
		if (!key) {
			starSets = [];
			return;
		}
		Promise.all(
			key.split('|').map(async (it) => {
				const [c, list] = it.split(':');
				const d = await placeDrawing(COUNTRY, list.split(','));
				return { color: `var(--pick-${c})`, marks: d.marks };
			})
		).then(
			(s) => {
				if (key === starKey) starSets = s;
			},
			() => {}
		);
	});
	const starR = $derived((lap ? 13 : 11) / k);
	const stars = $derived(
		starSets.flatMap((set) => {
			const out: { x: number; y: number; color: string }[] = [];
			for (const m of set.marks)
				if (!out.some((o) => Math.hypot(o.x - m.x, o.y - m.y) < starR * 1.8))
					out.push({ x: m.x, y: m.y, color: set.color });
			return out;
		})
	);
	const star = (x: number, y: number, r: number) => {
		const p: string[] = [];
		for (let i = 0; i < 10; i++) {
			const a = (Math.PI / 5) * i - Math.PI / 2;
			const rr = i % 2 ? r * 0.45 : r;
			p.push(`${(x + rr * Math.cos(a)).toFixed(2)} ${(y + rr * Math.sin(a)).toFixed(2)}`);
		}
		return `M${p.join('L')}Z`;
	};

	// Tashkent city is a dot on the country: a round badge a finger can find
	const city = $derived(
		partBoxes[CITY]
			? {
					x: (partBoxes[CITY][0] + partBoxes[CITY][2]) / 2,
					y: (partBoxes[CITY][1] + partBoxes[CITY][3]) / 2
				}
			: null
	);
	const badgeR = $derived((lap ? 21 : 18) / k);

	const inner = $derived(shown ? parts[shown] : undefined);
	const innerAt = $derived(shown && inner && partBoxes[shown] ? laidOn(shown, inner) : '');
	const third = $derived(level !== COUNTRY && !!shown && level !== shown); // inside a district

	// the region round a part that lies inside one (Tashkent), drawn as its districts in its
	// place; the region's own shape stays underneath, clear, and takes the taps. Only while in
	// the part: going back out, the region is one tile again at once (no seams popping off)
	const ringOf = $derived(shown && level !== COUNTRY ? AROUND[shown] : undefined);
	const ring = $derived(ringOf && partBoxes[ringOf] ? parts[ringOf] : undefined);
	const ringAt = $derived(ringOf && ring ? laidOn(ringOf, ring) : '');

	// zoomed in, the land round the place fades out in an oval inside the box (the mask is the
	// box's view, larger at first, so the fade comes in with the zoom); the place itself stays
	// whole (and the city in its region's hole)
	const fadeBox = $derived.by(() => {
		if (!zin || !vb) return null;
		const f = 1 + 4 * (1 - veil);
		return [vb[0] - (vb[2] * (f - 1)) / 2, vb[1] - (vb[3] * (f - 1)) / 2, vb[2] * f, vb[3] * f];
	});
	const keep = $derived.by((): { d: string; at?: string }[] => {
		const lv = level === COUNTRY ? shown : level;
		if (!lv || !country) return [];
		if (isPart(lv))
			return country.shapes
				.filter((s) => s.slug === lv || HOLDS[lv] === s.slug)
				.map((s) => ({ d: s.d }));
		const s = inner?.shapes.find((x) => x.slug === lv);
		return s ? [{ d: s.d, at: innerAt }] : [];
	});

	// ---------- the names of what is inside ----------
	// Laid out once the view stands still, in screen pixels for that view, as the profile's
	// Tashkent names them: a name inside its place where it fits, else a milk pill on its place,
	// else a pill beside it with a line back. Clear of the square, the pill, the key and the box's
	// faded edge; a name with nowhere to stand is left out (its place is still a tap). The order
	// never depends on what is picked, so names don't jump when a place lights up.
	type Name = {
		slug: string;
		text: string;
		size: number;
		x: number;
		y: number;
		w: number;
		h: number;
		pill: boolean;
		line?: [number, number][]; // a pill beside its place: from the place's dot to its side
	};
	type Dot = { slug: string; x: number; y: number };
	const FONT = $derived(lap ? 14 : 12.5);

	// names are measured in the game's fonts: laid out again once the names' own face has
	// loaded (asked for here: nothing else on the home may have needed it yet)
	let fonts = $state(0);
	$effect(() => {
		const family = getComputedStyle(document.documentElement).getPropertyValue('--f-text');
		document.fonts?.load(`700 14px ${family}`).then(
			() => fonts++,
			() => {}
		);
	});
	let ctx: CanvasRenderingContext2D | null = null;
	function textWidth(s: string, size: number): number {
		ctx ??= document.createElement('canvas').getContext('2d');
		if (!ctx) return s.length * size * 0.62;
		const family = getComputedStyle(document.documentElement).getPropertyValue('--f-text');
		ctx.font = `700 ${size}px ${family || 'sans-serif'}`;
		return ctx.measureText(s).width;
	}

	/** Is the point inside the rings (even-odd, as the shapes are filled)? */
	function inside(rings: [number, number][][], x: number, y: number) {
		let n = false;
		for (const r of rings)
			for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
				const [xi, yi] = r[i];
				const [xj, yj] = r[j];
				if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) n = !n;
			}
		return n;
	}
	/** Do the segments ab and cd cross? */
	const cut = (a: number[], b: number[], c: number[], d: number[]) => {
		const side = (p: number[], q: number[], r: number[]) =>
			Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
		return side(a, b, c) !== side(a, b, d) && side(c, d, a) !== side(c, d, b);
	};
	const overlaps = (a: Box, b: Box) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
	/** Does the segment from p to q cross the box? (sampled: lines here are short) */
	const crosses = (p: [number, number], q: [number, number], b: Box) => {
		for (let i = 1; i < 12; i++) {
			const x = p[0] + ((q[0] - p[0]) * i) / 12;
			const y = p[1] + ((q[1] - p[1]) * i) / 12;
			if (x > b[0] && x < b[2] && y > b[1] && y < b[3]) return true;
		}
		return false;
	};

	const labels = $derived.by((): { names: Name[]; dots: Dot[] } => {
		void fonts;
		const part = settled;
		const v = target;
		if (!part || part !== level || part !== shown || !v || !inner || !partBoxes[part])
			return { names: [], dots: [] };
		const kk = W / v[2];
		const b = partBoxes[part];
		const sx = (b[2] - b[0]) / inner.width;
		const sy = (b[3] - b[1]) / inner.height;
		// the part's districts are in its own drawing; the city in a region's hole is the country's
		const inPart = (x: number, y: number): [number, number] => [
			(b[0] + x * sx - v[0]) * kk,
			(b[1] + y * sy - v[1]) * kk
		];
		const onCountry = (x: number, y: number): [number, number] => [
			(x - v[0]) * kk,
			(y - v[1]) * kk
		];
		// where a name may stand: inside the box's faded edge, out of the square's corner, under
		// the name pill's row, and clear of the key
		const edge = 14;
		const top = lap ? 70 : 58;
		const bw = (takeW || 160) + 8;
		const keepOut: Box[] = [
			[-1e4, -1e4, 1e4, top],
			[-1e4, -1e4, lap ? 88 : 74, lap ? 88 : 72],
			[W - (lap ? 16 : 12) - bw, H - (lap ? 16 : 10) - (lap ? 52 : 46) - 8, 1e4, 1e4]
		];
		const free = (bx: Box, taken: Box[]) =>
			bx[0] >= edge &&
			bx[1] >= edge &&
			bx[2] <= W - edge &&
			bx[3] <= H - edge &&
			!keepOut.some((o) => overlaps(o, bx)) &&
			!taken.some((o) => overlaps(o, bx));

		// short names ("Chilonzor"), as the profile's map; a district and a town of one name
		// ("Bekobod tumani", "Bekobod shahri") both keep their word
		const full = (slug: string) => tx(cards[slug]?.name);
		const base = (slug: string) =>
			full(slug).replace(/\s+(tumani|shahri|viloyati|Respublikasi|район|город|область)$/i, '');
		const held = HOLDS[part] ? country?.shapes.filter((s) => s.slug === HOLDS[part]) : [];
		const shapes = [
			...inner.shapes.map((s) => ({ s, px: inPart })),
			...(held ?? []).map((s) => ({ s, px: onCountry }))
		];
		const bases = shapes.map(({ s }) => base(s.slug));
		const twice = new Set(bases.filter((n, i) => bases.indexOf(n) !== i));
		const nameOf = (slug: string) => (twice.has(base(slug)) ? full(slug) : shortName(full(slug)));
		const items = shapes
			.map(({ s, px }) => {
				const rings = pieces(s.d).map((r) => points(r).map(([x, y]) => px(x, y)));
				const area = rings.reduce((a, r) => {
					let sum = 0;
					for (let i = 0, j = r.length - 1; i < r.length; j = i++)
						sum += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
					return a + Math.abs(sum) / 2;
				}, 0);
				const [x, y] = px(s.label.x, s.label.y);
				return { slug: s.slug, text: nameOf(s.slug), rings, area, x, y };
			})
			.filter((it) => it.text)
			// playable places by size, the "Tez orada" ones last: they lose their names first
			.sort((a, b) => +quiet(a.slug) - +quiet(b.slug) || b.area - a.area);

		const out: Name[] = [];
		const taken: Box[] = [];
		const left: typeof items = [];
		// first every name that fits inside its own place, level: its middle line inside (its
		// letters may graze a seam: their milk halo keeps them clear), near the place's middle,
		// a little smaller if it must
		for (const it of items) {
			let done = false;
			for (const size of [FONT, FONT * 0.86]) {
				const w = textWidth(it.text, size) + 4;
				const h = size * 1.15;
				for (const [fx, fy] of [
					[0, 0],
					[0, -0.5],
					[0, 0.5],
					[-0.12, 0],
					[0.12, 0],
					[0, -1],
					[0, 1]
				]) {
					const x = it.x + fx * w;
					const y = it.y + fy * h;
					const bx: Box = [x - w / 2, y - h / 2, x + w / 2, y + h / 2];
					if (!free(bx, taken)) continue;
					const steps = Math.max(2, Math.ceil(w / 5));
					let fits = true;
					for (let i = 0; i <= steps && fits; i++)
						fits = inside(it.rings, bx[0] + ((bx[2] - bx[0]) * i) / steps, y);
					if (!fits) continue;
					out.push({ slug: it.slug, text: it.text, size, x, y, w, h, pill: false });
					taken.push([bx[0] - 2, bx[1] - 2, bx[2] + 2, bx[3] + 2]);
					done = true;
					break;
				}
				if (done) break;
			}
			if (!done) left.push(it);
		}
		// then the rest in pills: on the place, else beside it, a little further each time
		const spots = left.map((it) => [it.x - 3, it.y - 3, it.x + 3, it.y + 3] as Box);
		const lines: [number, number][][] = [];
		for (const it of left) {
			const size = FONT * 0.92;
			const w = textWidth(it.text, size) + 16;
			const h = size + 9;
			const tries: [number, number][] = [[0, 0]];
			// a short line or none: a long one across a crowded map reads as a tangle
			for (const far of [6, 16, 28])
				for (const [dx, dy] of [
					[0, -1],
					[0, 1],
					[-1, 0],
					[1, 0],
					[-1, -1],
					[1, -1],
					[-1, 1],
					[1, 1]
				])
					tries.push([dx * (w / 2 + far), dy * (h / 2 + far)]);
			for (const [dx, dy] of tries) {
				const x = it.x + dx;
				const y = it.y + dy;
				const bx: Box = [x - w / 2, y - h / 2, x + w / 2, y + h / 2];
				// beside its place, a pill never sits on another one's dot
				const others = dx || dy ? spots.filter((_, i) => left[i] !== it) : [];
				if (!free(bx, [...taken, ...others])) continue;
				// the line back runs from the place's dot to the pill's nearest side; it crosses no
				// name and no other line, and no line already drawn crosses the pill
				const from: [number, number] | undefined = dx || dy ? [it.x, it.y] : undefined;
				const to: [number, number] = [
					Math.max(bx[0], Math.min(it.x, bx[2])),
					Math.max(bx[1], Math.min(it.y, bx[3]))
				];
				// (a few pixels round each name, so a line never grazes one either)
				const near = (b: Box): Box => [b[0] - 4, b[1] - 4, b[2] + 4, b[3] + 4];
				const boxOf = (n: Name): Box => [
					n.x - n.w / 2,
					n.y - n.h / 2,
					n.x + n.w / 2,
					n.y + n.h / 2
				];
				if (lines.some(([p, q]) => crosses(p, q, near(bx)))) continue;
				if (
					from &&
					(out.some((n) => crosses(from, to, near(boxOf(n)))) ||
						lines.some(([p, q]) => cut(from, to, p, q)))
				)
					continue;
				const line = from ? [from, to] : undefined;
				if (line) lines.push(line);
				out.push({ slug: it.slug, text: it.text, size, x, y, w, h, pill: true, line });
				taken.push([bx[0] - 3, bx[1] - 3, bx[2] + 3, bx[3] + 3]);
				break;
			}
		}
		const named = new Set(out.map((n) => n.slug));
		const dots = left.filter(
			({ slug }) => cards[slug]?.kind === 'city' && playable(slug) && !named.has(slug)
		);
		return { names: out, dots };
	});
	/** A name's colour: its place's pick (the city in its region is a part of the country). */
	const namePick = (slug: string) => (isPart(slug) ? pickFor(slug) : pickFor(slug, shown));
	const levelPick = $derived(
		level === COUNTRY ? undefined : isPart(level) ? pickFor(level) : pickFor(level, shown)
	);
</script>

<svelte:window bind:innerWidth={vw} onkeydown={onKey} />

<div class="mapbox" class:zin role="group" aria-label={t('placesTitle')}>
	<div class="mclip" bind:clientWidth={W} bind:clientHeight={H}>
		{#if country && vb}
			<svg
				class="msvg"
				viewBox={vb.map((v) => v.toFixed(2)).join(' ')}
				preserveAspectRatio="xMidYMid meet"
				style:--tg="url(#{uid}-tg)"
				style:--hatch="url(#{uid}-hatch)"
			>
				<defs>
					<!-- "Tez orada": the places with nothing to play yet, hatched (8 px apart on
					     screen, whatever the zoom) -->
					<pattern
						id="{uid}-hatch"
						width={8 * hk}
						height={8 * hk}
						patternUnits="userSpaceOnUse"
						patternTransform="rotate(45)"
					>
						<rect width={8 * hk} height={8 * hk} class="hatch-bg" />
						<line
							x1="0"
							y1="0"
							x2="0"
							y2={8 * hk}
							class="hatch-line"
							style:stroke-width={2.5 * hk}
						/>
					</pattern>
					{#each pickedParts as part (part.shape.slug)}
						<pattern
							id="{uid}-picked-hatch-{part.shape.slug}"
							width={8 * hk}
							height={8 * hk}
							patternUnits="userSpaceOnUse"
							patternTransform="{part.hatchScale} rotate(45)"
						>
							<line
								x1="0"
								y1="0"
								x2="0"
								y2={8 * hk}
								class="pick-hatch-line"
								style:stroke-width={4 * hk}
							/>
						</pattern>
						<clipPath id="{uid}-outline-{part.shape.slug}">
							<path d={part.shape.d} clip-rule="evenodd" />
						</clipPath>
					{/each}
					<linearGradient id="{uid}-tg" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0" style:stop-color="var(--tile-a)" />
						<stop offset="1" style:stop-color="var(--tile-b)" />
					</linearGradient>
					<radialGradient id="{uid}-vg">
						<stop offset="0.6" stop-color="#fff" />
						<stop offset="1" stop-color="#000" />
					</radialGradient>
					{#if fadeBox}
						<mask
							id="{uid}-fade"
							maskUnits="userSpaceOnUse"
							x={fadeBox[0]}
							y={fadeBox[1]}
							width={fadeBox[2]}
							height={fadeBox[3]}
						>
							<rect
								x={fadeBox[0]}
								y={fadeBox[1]}
								width={fadeBox[2]}
								height={fadeBox[3]}
								fill="url(#{uid}-vg)"
							/>
							{#each keep as kp, i (i)}
								<path class="keep" d={kp.d} transform={kp.at} />
							{/each}
						</mask>
					{/if}
				</defs>
				<g mask={fadeBox ? `url(#${uid}-fade)` : undefined}>
					<g class="uzl" class:dim={level !== COUNTRY}>
						{#each country.shapes as s (s.slug)}
							{@const p = pickFor(s.slug)}
							<path
								class="p"
								class:hid={(!!ringAt && s.slug === ringOf) || (up && !!innerAt && s.slug === shown)}
								class:q={quiet(s.slug)}
								class:pc={!!p}
								class:cur={isCur(s.slug)}
								style:--pc={pc(p)}
								d={s.d}
								data-s={s.slug}
								role="button"
								tabindex={(level === COUNTRY && s.slug !== CITY) || HOLDS[level] === s.slug
									? 0
									: -1}
								aria-label={tx(cards[s.slug]?.name)}
								onclick={() => open(s.slug)}
								onkeydown={(e) => press(e, () => open(s.slug))}
							/>
						{/each}
						{#if ring && ringAt}
							<g class="ring" transform={ringAt}>
								{#each ring.shapes as s (s.slug)}
									{@const p = pickFor(s.slug, ringOf)}
									<path class="p" class:pc={!!p} style:--pc={pc(p)} d={s.d} />
									{#if p && quiet(s.slug)}{@render hatching(s.d, ringOf)}{/if}
								{/each}
							</g>
						{/if}
					</g>
					{#each pickedParts as part (part.shape.slug)}
						{@const slug = part.shape.slug}
						{#if !(ringAt && slug === ringOf) && !(up && slug === shown)}
							<g clip-path="url(#{uid}-outline-{slug})">
								<g transform={part.at}>
									{#each part.quiet as s (s.slug)}
										{@render hatching(s.d, slug, level !== COUNTRY && !isCur(slug))}
									{/each}
								</g>
							</g>
						{/if}
					{/each}
					<!-- coloured districts where their region's districts aren't up -->
					{#each deep as dp (dp.slug)}
						{#if dp.part !== ringOf && !(up && dp.part === shown)}
							<path
								class="p pc deep"
								class:dim={level !== COUNTRY && !isCur(dp.part)}
								style:--pc={dp.color}
								d={dp.d}
								transform={dp.at}
							/>
						{/if}
					{/each}
					{#key shown}
						{#if inner && innerAt}
							<g class="dl" class:up class:third transform={innerAt}>
								{#each inner.shapes as s (s.slug)}
									{@const p = pickFor(s.slug, shown)}
									<path
										class="p"
										class:q={quiet(s.slug)}
										class:pc={!!p}
										class:cur={s.slug === level}
										style:--pc={pc(p)}
										d={s.d}
										data-d={s.slug}
										role="button"
										tabindex={level !== COUNTRY ? 0 : -1}
										aria-label={tx(cards[s.slug]?.name)}
										onclick={() => open(s.slug)}
										onkeydown={(e) => press(e, () => open(s.slug))}
									/>
									{#if p && quiet(s.slug)}
										{@render hatching(s.d, shown, third && s.slug !== level)}
									{/if}
								{/each}
							</g>
						{/if}
					{/key}
				</g>
				{#if city}
					<g
						class="bdg"
						class:pc={!!cityPick}
						class:off={level !== COUNTRY}
						style:--pc={pc(cityPick)}
						data-s={CITY}
						role="button"
						tabindex={level === COUNTRY ? 0 : -1}
						aria-label={tx(cards[CITY]?.name)}
						onclick={() => open(CITY)}
						onkeydown={(e) => press(e, () => open(CITY))}
					>
						<circle class="bpulse" cx={city.x} cy={city.y} r={badgeR} />
						<circle class="bdisc" cx={city.x} cy={city.y} r={badgeR} />
						<circle class="bdot" cx={city.x} cy={city.y} r={badgeR * 0.36} />
					</g>
				{/if}
				{#each stars as s, i (i)}
					<path class="star" style:--pc={s.color} d={star(s.x, s.y, starR)} />
				{/each}
			</svg>
		{/if}
		{#if labels.names.length || labels.dots.length}
			<!-- a name is a tap on the place it names; the plain ones let the tap through to it -->
			<svg class="names" viewBox="0 0 {W} {H}" aria-hidden="true">
				{#each labels.names as n (n.slug)}
					{@const p = namePick(n.slug)}
					<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
					<g
						class="nm"
						class:pill={n.pill}
						class:q={quiet(n.slug)}
						class:few={!!cards[n.slug] && fewPlaces(cards[n.slug])}
						class:pc={!!p}
						style:--pc={pc(p)}
						onclick={() => open(n.slug)}
					>
						{#if n.line}
							{@const [a, b] = n.line}
							<line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} class="leader" />
							<circle cx={a[0]} cy={a[1]} r="2.5" class="spot" />
						{/if}
						{#if n.pill}
							<rect x={n.x - n.w / 2} y={n.y - n.h / 2} width={n.w} height={n.h} rx={n.h / 2} />
						{/if}
						<text x={n.x} y={n.y} style:font-size="{n.size}px">{n.text}</text>
					</g>
				{/each}
				{#each labels.dots as dot (dot.slug)}
					<!-- The shape below the dot takes keyboard input. -->
					<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
					<circle class="spot-hit" cx={dot.x} cy={dot.y} r="16" onclick={() => open(dot.slug)} />
					<circle class="spot" cx={dot.x} cy={dot.y} r="3.5" />
				{/each}
			</svg>
		{/if}
	</div>

	<!-- where you are, as its face (a district in its city or region, Tashkent in its region, a
	     region in Uzbekistan): a tap goes up one level -->
	<button
		class="mback"
		class:off={level === COUNTRY}
		tabindex={level === COUNTRY ? -1 : 0}
		aria-label={t('zoomOut')}
		onclick={goUp}
	>
		{#if level !== COUNTRY}
			<span class="mpic"><PlaceInParent place={level} on="panel" /></span>
		{/if}
		<span class="bk" aria-hidden="true"
			><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg></span
		>
	</button>
	<!-- the place on screen, by name; its dot in the colour of the pick that holds it -->
	<div
		class="mpill"
		class:off={level === COUNTRY}
		class:pc={!!levelPick}
		style:--pc={pc(levelPick)}
	>
		<i></i><span>{level !== COUNTRY ? tx(cards[level]?.name) : ''}</span>
	</div>
	<!-- the one key on the map, quiet (the green "O‘ynash" is the home's only filled key): the
	     place on screen joins the list; in the list, it says so in its colour and a tap takes it
	     out (never the last one) -->
	{#if !readonly}
		<button
			class="btn btn-ghost on-panel mtake"
			class:off={!offer}
			class:soon
			class:taken={!!taken}
			style:--pc={pc(taken)}
			bind:offsetWidth={takeW}
			tabindex={offer ? 0 : -1}
			disabled={locked}
			aria-disabled={soon || (!!taken && picks.length < 2)}
			onclick={take}
		>
			{#if soon}
				<svg viewBox="0 0 24 24" aria-hidden="true"
					><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2M9.5 2.5h5" /></svg
				>
				<span class="lbl">{t('soon')}</span>
			{:else if taken}
				<span class="lbl">{t('pickedOne')}</span>
			{:else}
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
				<span class="lbl">{t('pickThis')}</span>
			{/if}
		</button>
	{/if}
</div>

{#snippet hatching(d: string, part?: string | null, dim = false)}
	<path class="pick-hatch" class:dim {d} fill="url(#{uid}-picked-hatch-{part})" />
{/snippet}

<style>
	.mapbox {
		position: relative;
		min-width: 0;
		min-height: 0;
	}
	.mclip {
		position: absolute;
		inset: 0;
	}
	/* zoomed in, the drawing is cut to the box and its edges fade into the ground */
	.zin .mclip {
		-webkit-mask-image:
			linear-gradient(90deg, transparent, #000 14px, #000 calc(100% - 14px), transparent),
			linear-gradient(180deg, transparent, #000 14px, #000 calc(100% - 14px), transparent);
		-webkit-mask-composite: source-in;
		mask-image:
			linear-gradient(90deg, transparent, #000 14px, #000 calc(100% - 14px), transparent),
			linear-gradient(180deg, transparent, #000 14px, #000 calc(100% - 14px), transparent);
		mask-composite: intersect;
	}
	/* milk tiles floating on a glow and a stacked shadow */
	.msvg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		overflow: visible;
		touch-action: manipulation;
		filter: drop-shadow(0 0 18px var(--map-glow)) drop-shadow(0 5px 0 var(--map-shadow));
		-webkit-tap-highlight-color: transparent;
	}
	/* a part's holes are holes (Tashkent region round the city): the server's rings are
	   even-odd, as its outlines say */
	.p {
		fill: var(--tg);
		fill-rule: evenodd;
		stroke: var(--seam);
		stroke-width: 1.2;
		stroke-linejoin: round;
		vector-effect: non-scaling-stroke;
		cursor: pointer;
		outline: none;
		transition:
			opacity 0.3s,
			fill-opacity 0.25s;
	}
	/* a part with no panoramas yet: a solid mix of tile and ground (see-through would show the
	   map's shadow), still a tap away */
	.p.q {
		fill: var(--tile-quiet);
	}
	.uzl .p.q {
		fill: var(--hatch);
		stroke-width: 0.6;
		stroke: color-mix(in srgb, var(--seam) 60%, transparent);
	}
	.hatch-bg {
		fill: var(--tile-quiet);
	}
	.hatch-line {
		stroke: color-mix(in srgb, var(--seam) 22%, transparent);
	}
	.pick-hatch-line {
		stroke: color-mix(in srgb, var(--tile-a) 54%, transparent);
	}
	.pick-hatch {
		fill-rule: evenodd;
		pointer-events: none;
	}
	.pick-hatch.dim {
		opacity: 0.65;
	}
	/* a picked place, and everything in it: its pick's colour */
	.p.pc {
		fill: var(--pc);
		stroke: color-mix(in srgb, var(--pc) 45%, #fff);
		stroke-opacity: 1;
	}
	.p:focus-visible {
		stroke: var(--gold);
		stroke-width: 3;
	}
	.uzl.dim .p {
		opacity: 0.32;
	}
	.uzl.dim .p.cur {
		opacity: 1;
	}
	/* a picked place stays lit from a neighbouring part too */
	.uzl.dim .p.pc:not(.cur),
	.deep.dim {
		opacity: 0.85;
	}
	.deep {
		pointer-events: none;
		stroke-width: 1;
	}
	.dl {
		opacity: 0;
		transition: opacity 0.15s;
	}
	.dl:not(.up) {
		pointer-events: none;
	}
	.dl.up {
		opacity: 1;
		animation: dl-in 0.22s ease-out;
	}
	@keyframes dl-in {
		from {
			opacity: 0;
		}
	}
	.dl .p {
		stroke-width: 1;
	}
	/* inside a district: its neighbours are faint tiles round it (a picked one a little less) */
	.dl.third .p:not(.cur) {
		opacity: 0.32;
	}
	.dl.third .p.pc:not(.cur) {
		opacity: 0.6;
	}
	/* the region round Tashkent: its districts drawn in its place, the region's own shape under
	   them clear (it still takes a tap, to go there); so is a part under its own districts */
	.p.hid {
		fill: transparent;
		stroke: none;
	}
	.ring {
		pointer-events: none;
	}
	.ring .p {
		stroke-width: 1;
	}
	.keep {
		fill: #fff;
		stroke: #fff;
		stroke-width: 4px;
		vector-effect: non-scaling-stroke;
	}

	/* ---------- the names: dark ink by day and by night (the tiles are milk in both), as the
	   profile's Tashkent names its districts ---------- */
	.names {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		overflow: visible;
		pointer-events: none;
		animation: dl-in 0.25s ease-out;
		--map-ink: #0b3b44;
		--map-ink-2: #3a5d63;
		--map-line: rgba(11, 59, 68, 0.75);
	}
	:global(:root[data-theme='dark']) .names {
		--map-line: #73a9ae;
	}
	.nm text {
		font-family: var(--f-text);
		font-weight: 700;
		text-anchor: middle;
		dominant-baseline: central;
		fill: var(--map-ink);
		stroke: color-mix(in srgb, var(--tile-a) 85%, transparent);
		stroke-width: 3px;
		paint-order: stroke;
		pointer-events: none;
	}
	.nm.q text {
		fill: var(--map-ink-2);
		stroke: color-mix(in srgb, var(--tile-quiet) 85%, transparent);
	}
	/* few panoramas there yet: the name in italics (decision 0016; the font has none: a lean) */
	.nm.few text {
		transform: skewX(-11deg);
		transform-box: fill-box;
		transform-origin: center;
	}
	/* a pill takes its whole box; a plain name lets the tap through to its place */
	.nm.pill {
		cursor: pointer;
	}
	.nm.pill rect {
		pointer-events: all;
		fill: var(--tile-a);
		stroke: var(--seam);
		stroke-width: 1.5px;
	}
	.nm.pill text {
		stroke-width: 0;
	}
	.leader {
		stroke: var(--map-line);
		stroke-width: 1.5px;
	}
	.spot {
		fill: var(--map-line);
	}
	.spot-hit {
		fill: transparent;
		pointer-events: all;
		cursor: pointer;
	}
	/* a picked place's name: white on its colour (a pill takes the colour with it) */
	.nm.pc text {
		fill: #fff;
		stroke: var(--pc);
	}
	.nm.pill.pc rect {
		fill: var(--pc);
		stroke: color-mix(in srgb, var(--pc) 55%, #000);
	}

	/* Tashkent city's badge */
	.bdg {
		cursor: pointer;
		outline: none;
		transition: opacity 0.25s;
	}
	.bdg.off {
		opacity: 0;
		pointer-events: none;
	}
	.bdisc {
		fill: var(--tg);
		stroke: var(--seam);
		stroke-width: 1.5;
		vector-effect: non-scaling-stroke;
	}
	.bdot {
		fill: var(--seam);
	}
	.bdg.pc .bdisc {
		fill: var(--pc);
		stroke: #fff;
		stroke-width: 2.5;
	}
	.bdg.pc .bdot {
		fill: #fff;
		stroke: color-mix(in srgb, var(--pc) 55%, #000);
		stroke-width: 2;
		vector-effect: non-scaling-stroke;
	}
	.bdg:focus-visible .bdisc {
		stroke: var(--gold);
		stroke-width: 3;
	}
	.bpulse {
		fill: none;
		stroke: var(--pc, var(--seam));
		stroke-width: 3;
		vector-effect: non-scaling-stroke;
		opacity: 0;
	}
	.bdg.pc .bpulse {
		animation: pulse 2.2s var(--out) infinite;
		transform-box: fill-box;
		transform-origin: center;
	}
	@keyframes pulse {
		0% {
			transform: scale(1);
			opacity: 0.9;
		}
		100% {
			transform: scale(2.3);
			opacity: 0;
		}
	}
	.star {
		fill: var(--pc);
		stroke: #fff;
		stroke-width: 1.6;
		stroke-linejoin: round;
		vector-effect: non-scaling-stroke;
		pointer-events: none;
	}

	/* the small place-in-parent square: where you are; a tap goes up one level */
	.mback {
		position: absolute;
		left: 12px;
		top: 10px;
		z-index: 3;
		width: 54px;
		height: 54px;
		padding: 0;
		border: none;
		border-radius: var(--r-s);
		background: var(--panel);
		display: grid;
		place-items: center;
		box-shadow:
			inset 0 0 0 1px var(--panel-line),
			0 3px 0 var(--stack-2),
			0 8px 16px -6px rgba(0, 0, 0, 0.35);
		transition:
			opacity 0.2s,
			transform 0.3s var(--spring);
	}
	.mpic {
		width: 44px;
		height: 40px;
	}
	.bk {
		position: absolute;
		left: -6px;
		top: -6px;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: var(--ink);
		color: var(--panel);
		display: grid;
		place-items: center;
		box-shadow: 0 0 0 2px var(--panel);
	}
	.bk svg {
		width: 13px;
		height: 13px;
		fill: none;
		stroke: currentColor;
		stroke-width: 3.4;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.mback:focus-visible,
	.mtake:focus-visible {
		outline: 3px solid var(--gold);
		outline-offset: 2px;
	}
	.mpill {
		position: absolute;
		left: 76px;
		top: 22px;
		z-index: 3;
		height: 30px;
		max-width: calc(100% - 92px);
		padding: 0 12px;
		border-radius: 999px;
		background: var(--panel);
		color: var(--ink);
		display: flex;
		align-items: center;
		gap: 7px;
		font-weight: 700;
		font-size: 14px;
		white-space: nowrap;
		box-shadow:
			inset 0 0 0 1px var(--panel-line),
			0 4px 12px -4px rgba(0, 0, 0, 0.3);
		transition: opacity 0.2s;
	}
	.mpill span {
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.mpill i {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		flex: none;
		background: var(--ink-3);
	}
	.mpill.pc i {
		background: var(--pc);
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--pc) 30%, transparent);
	}
	/* "Tanlash": the kit's quiet key on a milk ground of its own, so it reads over the tiles */
	.mtake {
		position: absolute;
		right: 12px;
		bottom: 10px;
		z-index: 3;
		height: 46px;
		padding: 0 16px 0 12px;
		gap: 7px;
		font-size: 16px;
		white-space: nowrap;
		background: var(--panel);
		box-shadow:
			inset 0 0 0 2px var(--fg-line),
			0 8px 16px -6px rgba(0, 0, 0, 0.35);
		transition:
			opacity 0.2s,
			transform 0.3s var(--spring);
	}
	.mtake:hover:not(.soon) {
		box-shadow:
			inset 0 0 0 2px color-mix(in srgb, var(--b-ink) 55%, transparent),
			0 8px 16px -6px rgba(0, 0, 0, 0.35);
	}
	.mtake svg {
		width: 20px;
		height: 20px;
		stroke-width: 3;
	}
	/* in the list: its colour, words and edge */
	.mtake.taken {
		--b-ink: var(--pc);
		padding: 0 16px;
		box-shadow:
			inset 0 0 0 2.5px var(--pc),
			0 8px 16px -6px rgba(0, 0, 0, 0.35);
	}
	:global(:root[data-theme='dark']) .mtake.taken {
		--b-ink: color-mix(in srgb, var(--pc) 45%, #fff);
	}
	/* no panoramas there yet: the same place, quiet, and it does nothing */
	.mtake.soon {
		cursor: default;
		--b-ink: var(--ink-3);
		background: color-mix(in srgb, var(--panel) 82%, transparent);
		box-shadow: inset 0 0 0 1px var(--panel-line);
	}
	.mtake.soon:active {
		transform: none;
	}
	.mtake.soon svg {
		stroke-width: 2.4;
	}
	.off {
		opacity: 0;
		pointer-events: none;
		transform: scale(0.8);
	}
	.mpill.off {
		transform: none;
	}

	@media (min-width: 961px) {
		.mback {
			left: 16px;
			top: 16px;
			width: 64px;
			height: 64px;
		}
		.mpic {
			width: 52px;
			height: 48px;
		}
		.mpill {
			left: 94px;
			top: 31px;
			height: 34px;
			font-size: 15px;
		}
		.mtake {
			right: 16px;
			bottom: 16px;
			height: 52px;
			font-size: 18px;
			padding: 0 20px 0 16px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.mapbox * {
			animation: none !important;
			transition: none !important;
		}
	}
</style>
