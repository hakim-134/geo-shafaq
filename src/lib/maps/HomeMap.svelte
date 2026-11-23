<script module lang="ts">
	// A place's children as cards (names, panoramas, their own maps), fetched once and kept, like
	// the drawings: zooming back into a part draws its names at once.
	import { api, call, type Schemas } from '#lib/api/client.js';

	type Detail = Schemas['PlaceDetail'];
	const details = new Map<string, Promise<Detail>>();

	function placeDetail(slug: string): Promise<Detail> {
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
	// The home's map (the owner, 2026-11-13: "by clicking it, it shouldn't go to another page;
	// just make it look like it zoomed in; don't change the other buttons around it"). One map,
	// one behaviour, as the look lab shows it: Uzbekistan's 14 parts as milk tiles; a tap on a
	// part zooms into it in place (the drawing's view moves until the part fills the box, then
	// its districts and towns come up inside it, with their names); the square at the top left,
	// the part's face (the picture it wears on every screen), zooms back out; a tap on a
	// district (or its name) marks it blue; the gold button at the bottom right chooses what is
	// marked, or else what is on screen. The place being played stays gold at every level.
	// Zoomed in, the land round the part fades away softly before the box's edge (no box shows),
	// and Tashkent lies in its region's districts, faint tiles. Nothing outside the box moves.
	import { untrack } from 'svelte';
	import type { MapSummary } from '#lib/api/client.js';
	import { t, tx } from '#lib/i18n/index.svelte.js';
	import { shortName } from './progress.js';
	import PlaceInParent, {
		placeDrawing,
		pieces,
		points,
		type Drawing
	} from './PlaceInParent.svelte';

	let {
		map,
		onchoose,
		zoomed = $bindable(false)
	}: {
		map?: MapSummary; // what "O‘ynash" plays now
		onchoose: (slug: string) => Promise<boolean>; // make this map the home's; false if it failed
		zoomed?: boolean; // out: a part fills the box (its square shows the face: the home hides its own)
	} = $props();

	type Card = Schemas['PlaceCard'];
	type Box = [number, number, number, number];
	/** What is being played, as the map sees it: the whole country, a part, a district in a
	 * part, or the places of a ready map of several (stars). */
	type Chosen = { whole?: boolean; part?: string; dist?: string; stars?: string[] };

	const COUNTRY = 'uzbekistan';
	const CITY = 'toshkent'; // Tashkent city plays its main streets, never its own place map
	// a part that lies inside another (Tashkent in Toshkent viloyati): zoomed into it, the other's
	// districts are the faint tiles round it, as in its face, not one flat sheet
	const AROUND: Record<string, string> = { [CITY]: 'toshkent-viloyati' };
	const uid = $props.id();
	const reduced =
		typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

	let country = $state<Drawing | null>(null);
	let parts = $state<Record<string, Drawing>>({}); // a part's districts, by the part
	let veil = $state(0); // 0 on the country, 1 zoomed in: how far the land round the part has faded
	let settled = $state<string | null>(null); // the part the view has finished gliding into
	let cards = $state<Record<string, Card>>({}); // every place seen, by its slug
	let level = $state(COUNTRY); // what fills the box: the country or one part
	let shown = $state<string | null>(null); // the part whose districts are drawn (also while leaving)
	let marked = $state<string | null>(null);
	let up = $state(false); // the districts' turn to come up
	let zin = $state(false); // zoomed in: the drawing is clipped to the box, its edges fade
	let pending = $state<{ map: string; chosen: Chosen } | null>(null); // chosen, not yet the home's
	let W = $state(0);
	let H = $state(0);
	let vw = $state(0);
	let vb = $state<number[] | null>(null);

	const lap = $derived(vw > 960);
	// drawing units per screen px (the view is fitted, "meet"): the hatch's scale
	const hk = $derived(vb && W && H ? Math.max(vb[2] / W, vb[3] / H) : 1);

	function addCards(d: Detail) {
		const add: Record<string, Card> = {};
		for (const c of d.children) add[c.slug] = c;
		cards = { ...cards, ...add };
	}

	// the country at once; again whenever the home's map comes (after being offline) until it's here
	let countryCards = false;
	$effect(() => {
		void map;
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
					addCards(d);
				},
				() => {}
			);
	});

	function loadPart(slug: string) {
		for (const s of [slug, AROUND[slug]])
			if (s && !parts[s])
				placeDrawing(s).then(
					(d) => (parts[s] = d),
					() => {}
				);
		placeDetail(slug).then(addCards, () => {});
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
	const boxes = $derived(
		Object.fromEntries((country?.shapes ?? []).map((s) => [s.slug, boxOf(s.d)])) as Record<
			string,
			Box
		>
	);

	// ---------- the view: a box of the drawing, fitted into the map's box ----------

	/** The view that shows `bb` as large as the box allows, with room for the square, the name
	 * and the button when zoomed in. */
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
		const bw = bb[2] - bb[0];
		const bh = bb[3] - bb[1];
		const k = Math.min(aw / bw, ah / bh);
		return [
			bb[0] - (ins.l + (aw - bw * k) / 2) / k,
			bb[1] - (ins.t + (ah - bh * k) / 2) / k,
			W / k,
			H / k
		];
	}
	// every corner of the country's parts, to keep the gold button off the map
	const corners = $derived(country ? country.shapes.flatMap((s) => points(s.d)) : []);
	let btnW = $state(0); // the gold button's width while it says "Shu joyni tanlash"

	/** The country as large as the box allows, but clear of the gold button at the bottom right
	 * (a short phone has no room under the map): first up to the box's top, then a little
	 * smaller, never under 72%. The room is kept whether the button shows or not: choosing
	 * doesn't make the map jump. */
	function countryView(): number[] {
		const w = country!.width;
		const base = fit([0, 0, w, country!.height], false);
		if (!btnW) return base;
		const rx = W - (lap ? 16 : 12) - btnW - 6;
		const ry = H - (lap ? 16 : 10) - (lap ? 52 : 46) - 6;
		const clear = (v: number[]) => {
			const k = W / v[2];
			return !corners.some(([x, y]) => (x - v[0]) * k > rx && (y - v[1]) * k > ry);
		};
		if (clear(base)) return base;
		const k0 = W / base[2];
		let v = base;
		for (let f = 1; f >= 0.72; f -= 0.02) {
			const k = k0 * f;
			v = [-(W - w * k) / 2 / k, -(lap ? 20 : 10) / k, W / k, H / k];
			if (clear(v)) break;
		}
		return v;
	}
	const viewOf = (lv: string) => (lv === COUNTRY ? countryView() : fit(boxes[lv], true));
	const target = $derived(
		country && W && H && (level === COUNTRY || boxes[level]) ? viewOf(level) : null
	);

	let raf = 0;
	let moving = false;
	/** The view glides to `to` in 450 ms, easing out, and the land round the part fades with it
	 * (`fade`: 1 zooming in, 0 going out); with reduced motion it cuts. */
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

	let upTimer: ReturnType<typeof setTimeout> | undefined;
	function open(slug: string) {
		if (slug === level || !boxes[slug]) return;
		level = slug;
		marked = null;
		shown = slug;
		zin = true;
		up = false;
		settled = null;
		loadPart(slug);
		clearTimeout(upTimer);
		upTimer = setTimeout(() => level === slug && (up = true), reduced ? 0 : 300);
		// the names come once the view stands still: laid out for where it stops
		glide(viewOf(slug), 1, () => level === slug && (settled = slug));
	}
	function back() {
		if (level === COUNTRY) return;
		level = COUNTRY;
		marked = null;
		up = false;
		settled = null;
		glide(viewOf(COUNTRY), 0, () => {
			if (level !== COUNTRY) return;
			shown = null;
			zin = false;
		});
	}
	function mark(d: string) {
		if (level === COUNTRY) return;
		marked = marked === d ? null : d;
	}
	$effect(() => () => clearTimeout(upTimer));
	$effect(() => {
		zoomed = level !== COUNTRY;
	});

	const press = (e: KeyboardEvent, act: () => void) => {
		if (e.key !== 'Enter' && e.key !== ' ') return;
		e.preventDefault();
		act();
	};

	// ---------- what is chosen ----------

	function chosenOf(m?: MapSummary): Chosen {
		if (!m) return {};
		const p = m.place;
		if (!p) return { stars: m.places ?? [] };
		if (p.kind === 'country') return { whole: true };
		if (!m.parent || m.parent.kind === 'country') return { part: p.slug };
		return { part: m.parent.slug, dist: p.slug };
	}
	// a choice shows at once; the home's name follows when its map has come
	const live = $derived(pending ?? { map: map?.slug, chosen: chosenOf(map) });
	const chosen = $derived(live.chosen);
	$effect(() => {
		if (pending && map?.slug === pending.map) pending = null;
	});

	// what the gold button would choose: the marked district, or else what is on screen
	const what = $derived(marked ?? level);
	const whatMap = $derived(
		what === COUNTRY
			? 'uzbekistan'
			: what === CITY
				? 'tashkent-streets'
				: (cards[what]?.map ?? `place-${what}`)
	);
	const soon = $derived(what !== COUNTRY && cards[what]?.panoramas === 0);
	let shownW = $state(0);
	$effect(() => {
		if (shownW && !soon) btnW = shownW;
	});
	// Not on the whole country: there the home at rest would show a second big button beside the
	// green key (the owner picked the lab's home, which has none). Choosing the whole country
	// waits for the map picker (P1111 1.3).
	const offer = $derived(!!country && !!map && what !== COUNTRY && whatMap !== live.map);

	async function choose(): Promise<boolean> {
		if (!offer || soon) return false;
		const slug = whatMap;
		pending = {
			map: slug,
			chosen:
				what === COUNTRY
					? { whole: true }
					: what === level
						? { part: level }
						: { part: level, dist: what }
		};
		// the chosen district stays named and lit (gold, no longer blue): the button goes away
		// until another place is marked; a tap on it lets go, to choose the whole part
		const ok = await onchoose(slug);
		if (!ok && pending?.map === slug) pending = null;
		return ok;
	}

	/** The home's keys play what the player is looking at: a marked place that can be played
	 * becomes the home's first ("O‘ynash", a room with friends), so a blue district and the green
	 * key never point at two places. false only if choosing it failed. */
	export async function takeMarked(): Promise<boolean> {
		if (!marked || !offer || soon) return true;
		return choose();
	}

	// ---------- how each piece looks ----------

	const quiet = (slug: string) => cards[slug]?.panoramas === 0;
	const isGold = (d: string) => chosen.part === shown && chosen.dist === d;
	const isPale = (d: string) =>
		!quiet(d) && (chosen.whole || (chosen.part === shown && !chosen.dist));
	const named = $derived(marked ?? (level === COUNTRY ? null : level));
	const namedGold = $derived(
		named !== null &&
			(marked ? isGold(marked) : chosen.part === level && !chosen.dist && !chosen.whole)
	);

	// Tashkent city is a dot on the country: a round badge a finger can find
	const city = $derived(
		boxes[CITY]
			? { x: (boxes[CITY][0] + boxes[CITY][2]) / 2, y: (boxes[CITY][1] + boxes[CITY][3]) / 2 }
			: null
	);
	const badgeR = $derived((lap ? 21 : 18) / k);

	// a ready map of several places: a gold star on each; stars that would touch on screen are
	// one (Buxoro and Kogon on the country, two apart in Buxoro's region)
	let marks = $state<{ x: number; y: number }[]>([]);
	const starKey = $derived([...(chosen.stars ?? [])].sort().join(','));
	$effect(() => {
		const key = starKey;
		if (!key) {
			marks = [];
			return;
		}
		placeDrawing(COUNTRY, key.split(',')).then(
			(d) => {
				if (key === starKey) marks = d.marks;
			},
			() => {}
		);
	});
	const starR = $derived((lap ? 13 : 11) / k);
	const stars = $derived.by(() => {
		const out: { x: number; y: number }[] = [];
		for (const m of marks)
			if (!out.some((o) => Math.hypot(o.x - m.x, o.y - m.y) < starR * 1.8)) out.push(m);
		return out;
	});
	const star = (x: number, y: number, r: number) => {
		const p: string[] = [];
		for (let i = 0; i < 10; i++) {
			const a = (Math.PI / 5) * i - Math.PI / 2;
			const rr = i % 2 ? r * 0.45 : r;
			p.push(`${(x + rr * Math.cos(a)).toFixed(2)} ${(y + rr * Math.sin(a)).toFixed(2)}`);
		}
		return `M${p.join('L')}Z`;
	};

	const inner = $derived(shown ? parts[shown] : undefined);
	/** A place's own drawing laid onto its box in the country's drawing. */
	const laidOn = (slug: string, d: Drawing) => {
		const b = boxes[slug];
		return `translate(${b[0]} ${b[1]}) scale(${(b[2] - b[0]) / d.width} ${(b[3] - b[1]) / d.height})`;
	};
	const innerAt = $derived(shown && inner && boxes[shown] ? laidOn(shown, inner) : '');

	// the region round a part that lies inside one (Tashkent), drawn as its districts in its
	// place; the region's own shape stays underneath, clear, and takes the taps. Only while in
	// the part: going back out, the region is one tile again at once (no seams popping off)
	const ringOf = $derived(shown && level === shown ? AROUND[shown] : undefined);
	const ring = $derived(ringOf && boxes[ringOf] ? parts[ringOf] : undefined);
	const ringAt = $derived(ringOf && ring ? laidOn(ringOf, ring) : '');

	// zoomed in, the land round the part fades out in an oval inside the box (the mask is the
	// box's view, larger at first, so the fade comes in with the zoom); the part itself stays whole
	const fadeBox = $derived.by(() => {
		if (!zin || !vb) return null;
		const f = 1 + 4 * (1 - veil);
		return [vb[0] - (vb[2] * (f - 1)) / 2, vb[1] - (vb[3] * (f - 1)) / 2, vb[2] * f, vb[3] * f];
	});
	const shownD = $derived(country?.shapes.find((s) => s.slug === shown)?.d);

	// ---------- the names of what is inside ----------
	// Laid out once the view stands still, in screen pixels for that view, as the profile's
	// Tashkent names them: a name inside its place where it fits, else a milk pill on its place,
	// else a pill beside it with a line back. Clear of the square, the pill, the gold button and
	// the box's faded edge; a name with nowhere to stand is left out (its place is still a tap).
	// The order never depends on what is marked, so names don't jump when a place lights up.
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

	const names = $derived.by((): Name[] => {
		void fonts;
		const part = settled;
		const v = target;
		if (!part || part !== level || part !== shown || !v || !inner || !boxes[part]) return [];
		const kk = W / v[2];
		const b = boxes[part];
		const sx = (b[2] - b[0]) / inner.width;
		const sy = (b[3] - b[1]) / inner.height;
		const px = (x: number, y: number): [number, number] => [
			(b[0] + x * sx - v[0]) * kk,
			(b[1] + y * sy - v[1]) * kk
		];
		// where a name may stand: inside the box's faded edge, out of the square's corner, under
		// the name pill's row, and clear of the gold button
		const edge = 14;
		const top = lap ? 70 : 58;
		const bw = (shownW || 200) + 8;
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
		const bases = inner.shapes.map((s) => base(s.slug));
		const twice = new Set(bases.filter((n, i) => bases.indexOf(n) !== i));
		const nameOf = (slug: string) => (twice.has(base(slug)) ? full(slug) : shortName(full(slug)));
		const items = inner.shapes
			.map((s) => {
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
		return out;
	});
</script>

<svelte:window bind:innerWidth={vw} onkeydown={(e) => e.key === 'Escape' && back()} />

<div class="mapbox" class:zin role="group" aria-label={t('placesTitle')}>
	<div class="mclip" bind:clientWidth={W} bind:clientHeight={H}>
		{#if country && vb}
			<svg
				class="msvg"
				viewBox={vb.map((v) => v.toFixed(2)).join(' ')}
				preserveAspectRatio="xMidYMid meet"
				style:--tg="url(#{uid}-tg)"
				style:--tau="url(#{uid}-tau)"
				style:--hatch="url(#{uid}-hatch)"
			>
				<defs>
					<!-- "Tez orada": the regions with nothing to play yet, hatched as /places hatches
					     them (8 px apart on screen, whatever the zoom) -->
					<pattern
						id="{uid}-hatch"
						width={8 * hk}
						height={8 * hk}
						patternUnits="userSpaceOnUse"
						patternTransform="rotate(45)"
					>
						<rect width={8 * hk} height={8 * hk} class="hatch-bg" />
						<line x1="0" y1="0" x2="0" y2={8 * hk} class="hatch-line" style:stroke-width={2.5 * hk} />
					</pattern>
					<linearGradient id="{uid}-tg" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0" style:stop-color="var(--tile-a)" />
						<stop offset="1" style:stop-color="var(--tile-b)" />
					</linearGradient>
					<linearGradient id="{uid}-tau" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0" style:stop-color="var(--gold-hi)" />
						<stop offset="1" style:stop-color="var(--gold)" />
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
							{#if shownD}<path class="keep" d={shownD} />{/if}
						</mask>
					{/if}
				</defs>
				<g
					class="uzl"
					class:dim={level !== COUNTRY}
					mask={fadeBox ? `url(#${uid}-fade)` : undefined}
				>
					{#each country.shapes as s (s.slug)}
						<path
							class="p"
							class:hid={!!ringAt && s.slug === ringOf}
							class:q={quiet(s.slug)}
							class:aw={chosen.whole && !quiet(s.slug)}
							class:au={chosen.part === s.slug && (level === COUNTRY || s.slug !== level)}
							class:cur={s.slug === level}
							d={s.d}
							data-s={s.slug}
							role="button"
							tabindex={level === COUNTRY && s.slug !== CITY ? 0 : -1}
							aria-label={tx(cards[s.slug]?.name)}
							onclick={() => open(s.slug)}
							onkeydown={(e) => press(e, () => open(s.slug))}
						/>
					{/each}
					{#if ring && ringAt}
						<g class="ring" transform={ringAt}>
							{#each ring.shapes as s (s.slug)}
								<path class="p" d={s.d} />
							{/each}
						</g>
					{/if}
				</g>
				{#key shown}
					{#if inner && innerAt}
						<g class="dl" class:up transform={innerAt}>
							{#each inner.shapes as s (s.slug)}
								<path
									class="p"
									class:q={quiet(s.slug)}
									class:aw={isPale(s.slug)}
									class:au={isGold(s.slug)}
									class:pk={marked === s.slug && !isGold(s.slug)}
									d={s.d}
									data-d={s.slug}
									role="button"
									tabindex={level === shown ? 0 : -1}
									aria-label={tx(cards[s.slug]?.name)}
									aria-pressed={marked === s.slug}
									onclick={() => mark(s.slug)}
									onkeydown={(e) => press(e, () => mark(s.slug))}
								/>
							{/each}
						</g>
					{/if}
				{/key}
				{#if city}
					<g
						class="bdg"
						class:au={chosen.part === CITY}
						class:aw={chosen.whole}
						class:off={level !== COUNTRY}
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
					<path class="star" d={star(s.x, s.y, starR)} />
				{/each}
			</svg>
		{/if}
		{#if names.length}
			<!-- a name is a tap on the place it names; the plain ones let the tap through to it -->
			<svg class="names" viewBox="0 0 {W} {H}" style:--tau="url(#{uid}-tau)" aria-hidden="true">
				{#each names as n (n.slug)}
					<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
					<g
						class="nm"
						class:pill={n.pill}
						class:q={quiet(n.slug)}
						class:pk={marked === n.slug && !isGold(n.slug)}
						class:au={isGold(n.slug)}
						onclick={() => mark(n.slug)}
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
			</svg>
		{/if}
	</div>

	<!-- where you are, as its face (Tashkent in its region, a region in Uzbekistan): a tap goes
	     back out to the country -->
	<button
		class="mback"
		class:off={level === COUNTRY}
		tabindex={level === COUNTRY ? -1 : 0}
		aria-label={t('zoomOut')}
		onclick={back}
	>
		{#if level !== COUNTRY}
			<span class="mpic"><PlaceInParent place={level} on="panel" /></span>
		{/if}
		<span class="bk" aria-hidden="true"
			><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg></span
		>
	</button>
	<!-- the pill names what the gold button would choose, and only then: inside the chosen place
	     the title above already says it -->
	<div
		class="mpill"
		class:off={!named || !offer}
		class:pk={!!marked && !namedGold}
		class:au={namedGold}
	>
		<i></i><span>{named ? tx(cards[named]?.name) : ''}</span>
	</div>
	<button
		class="mchoose"
		class:off={!offer}
		class:soon
		bind:offsetWidth={shownW}
		tabindex={offer ? 0 : -1}
		aria-disabled={soon}
		onclick={choose}
	>
		{#if soon}
			<svg viewBox="0 0 24 24" aria-hidden="true"
				><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2M9.5 2.5h5" /></svg
			>
			<span>{t('soon')}</span>
		{:else}
			<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12.5l5 5L19.5 7" /></svg>
			<span>{t('choosePlace')}</span>
		{/if}
	</button>
</div>

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
	/* a whole place chosen: its parts pale gold; one part chosen: full gold; marked: blue */
	.p.aw {
		fill: color-mix(in srgb, var(--gold-hi) 60%, var(--tile-a));
		stroke: var(--gold-lo);
		stroke-opacity: 0.8;
	}
	.p.au {
		fill: var(--tau);
		stroke: var(--gold-lo);
		stroke-opacity: 1;
	}
	.p.pk {
		fill: var(--picked);
		stroke: var(--picked-line);
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
	/* the place being played stays lit from a neighbouring part too */
	.uzl.dim .p.au {
		opacity: 0.85;
	}
	.dl {
		opacity: 0;
		transition: opacity 0.15s;
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
	/* the region round Tashkent: its districts drawn in its place, the region's own shape under
	   them clear (it still takes a tap, to go there) */
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
	/* the marked place's name: white on its blue (a pill turns blue with it) */
	.nm.pk text {
		fill: #fff;
		stroke: var(--picked);
	}
	.nm.pill.pk rect {
		fill: var(--picked);
		stroke: var(--picked-line);
	}
	/* the chosen one's pill: gold */
	.nm.pill.au rect {
		fill: var(--tau);
		stroke: var(--gold-lo);
	}
	.nm.au text {
		fill: var(--gold-ink);
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
	.bdg.aw .bdisc {
		fill: color-mix(in srgb, var(--gold-hi) 60%, var(--tile-a));
		stroke: var(--gold-lo);
	}
	.bdg.au .bdisc {
		fill: var(--tau);
		stroke: #fff;
		stroke-width: 2.5;
	}
	.bdg.au .bdot {
		fill: #fff;
		stroke: var(--gold-lo);
		stroke-width: 2;
		vector-effect: non-scaling-stroke;
	}
	.bdg:focus-visible .bdisc {
		stroke: var(--gold);
		stroke-width: 3;
	}
	.bpulse {
		fill: none;
		stroke: var(--gold);
		stroke-width: 3;
		vector-effect: non-scaling-stroke;
		opacity: 0;
	}
	.bdg.au .bpulse {
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
		fill: var(--tau);
		stroke: var(--gold-lo);
		stroke-width: 1.4;
		stroke-linejoin: round;
		vector-effect: non-scaling-stroke;
		pointer-events: none;
	}

	/* the small place-in-parent square: where you are; a tap goes back out */
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
	.mchoose:focus-visible {
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
	.mpill.pk i {
		background: var(--picked);
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--picked) 30%, transparent);
	}
	.mpill.au i {
		background: var(--gold);
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--gold) 35%, transparent);
	}
	/* the one gold button: choose what is marked, or what is on screen */
	.mchoose {
		position: absolute;
		right: 12px;
		bottom: 10px;
		z-index: 3;
		height: 46px;
		padding: 0 16px 0 12px;
		border: none;
		border-radius: var(--r-s);
		display: flex;
		align-items: center;
		gap: 8px;
		font-family: var(--f-text);
		font-weight: 800;
		font-size: 15px;
		white-space: nowrap;
		color: var(--gold-ink);
		background: linear-gradient(180deg, var(--gold-hi), var(--gold));
		box-shadow:
			inset 0 2px 0 rgba(255, 255, 255, 0.55),
			0 4px 0 var(--gold-lo),
			0 10px 18px -6px rgba(0, 0, 0, 0.35);
		transition:
			opacity 0.2s,
			transform 0.3s var(--spring);
	}
	.mchoose svg {
		width: 20px;
		height: 20px;
		flex: none;
		fill: none;
		stroke: currentColor;
		stroke-width: 3.2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.mchoose:active:not(.soon) {
		transform: translateY(3px);
		box-shadow:
			inset 0 2px 0 rgba(255, 255, 255, 0.5),
			0 1px 0 var(--gold-lo),
			0 4px 8px -4px rgba(0, 0, 0, 0.35);
	}
	/* no panoramas there yet: the same place, quiet, and it does nothing */
	.mchoose.soon {
		cursor: default;
		color: var(--ink-3);
		background: color-mix(in srgb, var(--panel) 82%, transparent);
		box-shadow: inset 0 0 0 1px var(--panel-line);
	}
	.mchoose.soon svg {
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
		.mchoose {
			right: 16px;
			bottom: 16px;
			height: 52px;
			font-size: 17px;
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
