<script lang="ts" module>
	let maps = 0; // each map's own hatch pattern id

	/** A gold star with its name: a ready map's place on the country's map. */
	export interface Mark {
		slug: string;
		x: number;
		y: number;
		label: string;
		link?: boolean; // no star: a place of another level, a tap goes there (onmark)
	}
</script>

<script lang="ts">
	// A place's map for choosing where to play (P1028 4.2): its regions or districts drawn from
	// their borders, the way people know the map of Uzbekistan and of Tashkent. Paper where the
	// player hasn't been, gold as streets are learned, names where they fit (a name is a tap on
	// its place). A town with panoramas too small to tap (Tashkent on the country's map, a town
	// in a region) is a dot with its name in a pill; dots that would sit on each other step
	// apart, a short line back to their place. A tap on a place with places inside flies into
	// it (ondrill); a tap on one without picks it (onpick). Places without panoramas are hatched
	// and say "Tez orada". The page says what plays; the map only shows it: `lit` places in sky
	// blue, `whole` the whole map edged, `marks` as gold stars with their names.
	import type { Schemas } from '#lib/api/client.js';
	import { t, tx } from '#lib/i18n/index.svelte.js';
	import Progress from './Progress.svelte';
	import { knownTint, shortName } from './progress.js';

	type Card = Schemas['PlaceCard'];
	interface Props {
		drawing: Schemas['PlaceMap'];
		cards: Card[]; // the drawing's places: names, panoramas, progress
		lit?: string[];
		whole?: boolean;
		marks?: Mark[];
		glow?: string; // a first visit: this place glows under "Shu yerdan boshlang"
		ondrill: (c: Card) => void;
		onpick: (c: Card) => void;
		onmark?: (m: Mark) => void;
	}
	let {
		drawing,
		cards,
		lit = [],
		whole = false,
		marks = [],
		glow = '',
		ondrill,
		onpick,
		onmark
	}: Props = $props();

	const hatch = `hatch-${++maps}`;
	const FONT = 12.5; // a name's size on screen, px
	const BADGE = 11; // a town's dot radius on screen, px

	const pad = $derived(Math.max(drawing.width, drawing.height) * 0.03);
	// the frame: what can be played (and the capital's hole), with a margin, up to 3× closer
	// than the whole place; the "Tez orada" rest runs off the edges. On the country's map and
	// Tashkent's the playable places already span the whole.
	const vb = $derived.by(() => {
		const whole = { x: -pad, y: -pad, w: drawing.width + 2 * pad, h: drawing.height + 2 * pad };
		const playable = new Set(cards.filter((c) => c.panoramas > 0).map((c) => c.slug));
		const boxes = drawing.shapes.filter((sh) => playable.has(sh.slug)).map((sh) => bbox(sh.d));
		for (const m of marks.filter((x) => x.link)) boxes.push([m.x, m.y, m.x, m.y]);
		if (!boxes.length) return whole;
		let x0 = Math.min(...boxes.map((b) => b[0]));
		let y0 = Math.min(...boxes.map((b) => b[1]));
		let x1 = Math.max(...boxes.map((b) => b[2]));
		let y1 = Math.max(...boxes.map((b) => b[3]));
		const m = Math.max(x1 - x0, y1 - y0) * 0.06;
		[x0, y0, x1, y1] = [x0 - m, y0 - m, x1 + m, y1 + m];
		// no closer than 3×
		const grow = (a: number, b: number, min: number): [number, number] =>
			b - a >= min ? [a, b] : [(a + b) / 2 - min / 2, (a + b) / 2 + min / 2];
		[x0, x1] = grow(x0, x1, whole.w / 3);
		[y0, y1] = grow(y0, y1, whole.h / 3);
		// never wider than the whole
		x0 = Math.max(x0, whole.x);
		y0 = Math.max(y0, whole.y);
		x1 = Math.min(x1, whole.x + whole.w);
		y1 = Math.min(y1, whole.y + whole.h);
		return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
	});
	const framed = $derived(vb.w < drawing.width * 0.95 || vb.h < drawing.height * 0.95);
	let width = $state(0); // the map on screen, px
	const k = $derived(vb.w / Math.max(width, 1)); // drawing units per screen px

	type Box = [number, number, number, number];
	interface Item {
		card: Card;
		d: string;
		x: number; // a point well inside it: its name, or its dot
		y: number;
		box: Box;
		px: number; // its size on screen
		badge: boolean;
		rings: [number, number][][];
		axis: number; // its long side's angle, degrees (a thin strip's name runs along it)
	}
	const items = $derived.by((): Item[] => {
		const bySlug = new Map(cards.map((c) => [c.slug, c]));
		return drawing.shapes.flatMap((s) => {
			const card = bySlug.get(s.slug);
			if (!card) return [];
			const box = bbox(s.d);
			const px = Math.max(box[2] - box[0], box[3] - box[1]) / k;
			// too small to tap as a shape, and playable: a dot. A town gets one sooner, so a child
			// finds Samarqand or Buxoro by a dot with its name, not by a smudge
			const badge = card.panoramas > 0 && (px < 16 || (card.kind === 'city' && px < 60));
			const rings = ringsOf(s.d);
			return [
				{ card, d: s.d, x: s.label.x, y: s.label.y, box, px, badge, rings, axis: axisOf(rings) }
			];
		});
	});
	// shapes smaller than a few pixels draw nothing but a scribble: the dot stands for them; a
	// "Tez orada" place smaller than a fingertip has no dot, so it is left out altogether
	const drawn = $derived(items.filter((it) => it.px >= (it.card.panoramas > 0 ? 6 : 16)));

	// the path is "M x y L x y … Z" in absolute numbers: every two numbers are a point
	function bbox(d: string): Box {
		const n = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
		const b: Box = [Infinity, Infinity, -Infinity, -Infinity];
		for (let i = 0; i + 1 < n.length; i += 2) {
			b[0] = Math.min(b[0], n[i]);
			b[1] = Math.min(b[1], n[i + 1]);
			b[2] = Math.max(b[2], n[i]);
			b[3] = Math.max(b[3], n[i + 1]);
		}
		return b;
	}
	const area = (b: Box) => (b[2] - b[0]) * (b[3] - b[1]);

	function ringsOf(d: string): [number, number][][] {
		return d
			.split('M')
			.filter((r) => r.trim())
			.map((r) => {
				const n = (r.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
				const ring: [number, number][] = [];
				for (let i = 0; i + 1 < n.length; i += 2) ring.push([n[i], n[i + 1]]);
				return ring;
			});
	}
	// even-odd: inside the shape (holes and exclaves counted right)
	function within(rings: [number, number][][], x: number, y: number): boolean {
		let on = false;
		for (const r of rings)
			for (let i = 0, j = r.length - 1; i < r.length; j = i++)
				if (
					r[i][1] > y !== r[j][1] > y &&
					x < ((r[j][0] - r[i][0]) * (y - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]
				)
					on = !on;
		return on;
	}
	// the direction the shape is longest in, from its points' spread, kept readable (±70°)
	function axisOf(rings: [number, number][][]): number {
		const pts = rings.flat();
		const mx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
		const my = pts.reduce((a, p) => a + p[1], 0) / pts.length;
		let sxx = 0,
			syy = 0,
			sxy = 0;
		for (const [x, y] of pts) {
			sxx += (x - mx) ** 2;
			syy += (y - my) ** 2;
			sxy += (x - mx) * (y - my);
		}
		let a = ((0.5 * Math.atan2(2 * sxy, sxx - syy)) / Math.PI) * 180;
		if (a > 90) a -= 180;
		if (a < -90) a += 180;
		return Math.max(-70, Math.min(70, a));
	}
	const overlaps = (a: Box, b: Box) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

	// dots that would touch step apart (Buxoro and Kogon), the busiest town staying put
	const dots = $derived.by(() => {
		const out = new Map<string, { x: number; y: number; moved: boolean }>();
		if (!width) return out;
		const gap = (2 * BADGE + 8) * k;
		const placed: [number, number][] = [];
		const clear = (x: number, y: number) =>
			placed.every(([a, b]) => Math.hypot(a - x, b - y) >= gap);
		const towns = items
			.filter((it) => it.badge)
			.sort((a, b) => b.card.panoramas - a.card.panoramas);
		for (const it of towns) {
			let at: [number, number] = [it.x, it.y];
			if (!clear(...at))
				search: for (const r of [gap, gap * 1.7])
					for (let a = 0; a < 8; a++) {
						const c: [number, number] = [
							it.x + r * Math.cos((a * Math.PI) / 4),
							it.y + r * Math.sin((a * Math.PI) / 4)
						];
						if (clear(...c)) {
							at = c;
							break search;
						}
					}
			placed.push(at);
			out.set(it.card.slug, { x: at[0], y: at[1], moved: at[0] !== it.x || at[1] !== it.y });
		}
		return out;
	});

	// a ready map's stars that would touch step down, a line back to their place
	const stars = $derived.by(() => {
		const gap = 22 * k;
		const placed: Mark[] = [];
		for (const m of marks.filter((x) => !x.link)) {
			let y = m.y;
			while (placed.some((o) => Math.hypot(o.x - m.x, o.y - y) < gap)) y += gap * 0.6;
			placed.push({ ...m, y });
		}
		return placed;
	});
	const original = (m: Mark) => marks.find((x) => x.slug === m.slug) ?? m;

	// names are measured in the game's fonts: laid out again once they have loaded, so every
	// way onto a map (flying in, a link) gives the same names
	let fonts = $state(0);
	$effect(() => {
		document.fonts?.ready.then(() => fonts++);
	});

	let ctx: CanvasRenderingContext2D | null = null;
	function textWidth(s: string, size = FONT, font = '--body', weight = 700): number {
		ctx ??= document.createElement('canvas').getContext('2d');
		if (!ctx) return s.length * size * 0.62;
		const family = getComputedStyle(document.documentElement).getPropertyValue(font);
		ctx.font = `${weight} ${size}px ${family || 'sans-serif'}`;
		return ctx.measureText(s).width;
	}

	// a first visit: "Shu yerdan boshlang" high above the place that glows, against the map's
	// right edge (Tashkent is in the east), in the empty sky, a thin line down to its dot
	const glowItem = $derived(items.find((it) => it.card.slug === glow));
	const tag = $derived.by(() => {
		if (!glowItem || !width) return null;
		const text = t('startHere');
		const tw = textWidth(text, 13, '--display', 800) * k;
		const w = tw + 28 * k;
		const h = 26 * k;
		const x = Math.max(vb.x + vb.w - w - 2 * k, Math.min(glowItem.x - w / 2, vb.x + vb.w - w));
		const y = Math.max(vb.y + 2 * k, glowItem.y - (BADGE + 44) * k - h);
		return { text, x, y, w, h, tw };
	});

	type Anchor = 'start' | 'middle' | 'end';
	interface Label {
		key: string;
		it: Item | null; // null: a mark's name
		text: string;
		x: number;
		y: number;
		anchor: Anchor;
		box: Box; // what it covers, upright (for the rest to keep clear)
		size: number;
		pill: boolean;
		angle: number;
		w: number;
		h: number;
		mark?: Mark;
		from?: [number, number];
		lines?: string[]; // two lines
	}
	// names where they fit, inside the map: marks' first, then towns' (in pills by their dots),
	// then playable places by size; "Tez orada" ones last, so they lose their names first. The
	// order never depends on what is picked, so names don't jump when a place lights up.
	const labels = $derived.by((): Label[] => {
		if (!width) return [];
		void fonts;
		const taken: Box[] = [...dots.values()].map((d) => [
			d.x - BADGE * k,
			d.y - BADGE * k,
			d.x + BADGE * k,
			d.y + BADGE * k
		]);
		for (const m of stars) taken.push([m.x - 10 * k, m.y - 10 * k, m.x + 10 * k, m.y + 10 * k]);
		if (tag) taken.push([tag.x, tag.y, tag.x + tag.w, tag.y + tag.h]);
		const m = 5 * k; // a name keeps clear of the map's edge, its tap area too
		const inside = (b: Box) =>
			b[0] >= vb.x + m && b[1] >= vb.y + m && b[2] <= vb.x + vb.w - m && b[3] <= vb.y + vb.h - m;
		// a callout's line is an obstacle too: no pill or name may lie across it
		const lines: [number, number, number, number][] = [];
		if (tag && glowItem) {
			const d = dots.get(glowItem.card.slug) ?? glowItem;
			lines.push([d.x, tag.y + tag.h, d.x, d.y - BADGE * k]);
		}
		const crosses = (b: Box, [ax, ay, bx, by]: [number, number, number, number]) => {
			for (let i = 0; i <= 12; i++) {
				const px = ax + ((bx - ax) * i) / 12;
				const py = ay + ((by - ay) * i) / 12;
				if (px > b[0] && px < b[2] && py > b[1] && py < b[3]) return true;
			}
			return false;
		};
		const free = (b: Box) =>
			inside(b) && !taken.some((o) => overlaps(b, o)) && !lines.some((l) => crosses(b, l));
		const out: Label[] = [];

		// a pill by a point (a town's dot, a star) or, for a district too narrow for its name, by
		// its middle with a line back. A town's or district's pill stands only where its whole
		// box is over no other playable place (paper, or "Tez orada" land): over a neighbour it
		// would lie in its blue and take its taps. Its line crosses no pill, and no later pill
		// crosses it; when the sides are taken, the line grows and the pill goes out further.
		function beside(
			key: string,
			it: Item | null,
			text: string,
			x: number,
			y: number,
			r: number,
			mark?: Mark,
			district = false,
			anywhere = false // a town with no clean spot: any free one (it keeps its name)
		): boolean {
			const size = mark?.link ? FONT * 0.8 : district ? FONT * 0.85 : FONT;
			const w = textWidth(text, size, '--body', 800) * k + (mark?.link ? 0 : 12 * k);
			const h = size * (mark?.link ? 1.2 : 1.5) * k;
			const far = !!it; // towns and districts may go out with a line; stars stay by theirs
			const spots: [number, number][] = mark?.link
				? [[x, y]] // the capital's name always stands in its hole
				: (district
						? [r, r * 2.5, r * 4, r * 6, r * 9, r * 12, r * 16, r * 21]
						: far
							? [r, r * 2.5, r * 4]
							: [r]
					).flatMap((d): [number, number][] => [
						[x + d + w / 2, y],
						[x - d - w / 2, y],
						[x, y - d - h / 2],
						[x, y + d + h / 2],
						[x + d * 0.7 + w / 2, y - d * 0.7 - h / 2],
						[x - d * 0.7 - w / 2, y + d * 0.7 + h / 2],
						[x - d * 0.7 - w / 2, y - d * 0.7 - h / 2],
						[x + d * 0.7 + w / 2, y + d * 0.7 + h / 2]
					]);
			const boxAt = ([sx, sy]: [number, number]): Box => [
				sx - w / 2,
				sy - h / 2,
				sx + w / 2,
				sy + h / 2
			];
			const grid = (b: Box) => {
				const g: [number, number][] = [];
				for (let i = 0; i <= 8; i++)
					for (let j = 0; j <= 2; j++)
						g.push([b[0] + ((b[2] - b[0]) * i) / 8, b[1] + ((b[3] - b[1]) * j) / 2]);
				return g;
			};
			const clean = (b: Box) =>
				!items.some(
					(o) =>
						o !== it && o.card.panoramas > 0 && grid(b).some(([px, py]) => within(o.rings, px, py))
				);
			const onNeighbour = ([px, py]: [number, number]) =>
				items.some((o) => o !== it && o.card.panoramas > 0 && within(o.rings, px, py));
			const lineOk = ([sx, sy]: [number, number], b: Box) =>
				!taken.some(
					(o) =>
						!overlaps(o, b) &&
						crosses(o, [x, y, sx, sy]) &&
						!(x > o[0] && x < o[2] && y > o[1] && y < o[3])
				);
			const spot = mark?.link
				? spots[0]
				: far && !anywhere
					? spots.find(
							(sp) =>
								free(boxAt(sp)) &&
								clean(boxAt(sp)) &&
								lineOk(sp, boxAt(sp)) &&
								// nor a line through a neighbour on its way to the paper
								![0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85].some((f) =>
									onNeighbour([x + (sp[0] - x) * f, y + (sp[1] - y) * f])
								)
						)
					: far
						? // the last resort: near, and over as little of the neighbours as can be (a far
							// spot's line would cross the very places it should keep clear of)
							spots
								.filter(
									(sp) =>
										Math.hypot(sp[0] - x, sp[1] - y) <= r * 6 + Math.max(w, h) &&
										free(boxAt(sp)) &&
										lineOk(sp, boxAt(sp))
								)
								.map((sp): [number, [number, number]] => [
									Math.hypot(sp[0] - x, sp[1] - y) / r +
										grid(boxAt(sp)).filter(onNeighbour).length +
										// a line through a neighbour costs more than a pill on one (27 points)
										5 *
											[0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85].filter((f) =>
												onNeighbour([x + (sp[0] - x) * f, y + (sp[1] - y) * f])
											).length,
									sp
								])
								.sort((a, b) => a[0] - b[0])[0]?.[1]
						: spots.find((sp) => free(boxAt(sp)));
			if (!spot) return false;
			const b = boxAt(spot);
			// a line back when the pill stands off its place
			const off = far && Math.hypot(spot[0] - x, spot[1] - y) > r + Math.max(w, h) / 2 + 2 * k;
			if (off) lines.push([x, y, spot[0], spot[1]]);
			taken.push(b);
			out.push({
				key,
				it,
				text,
				x: spot[0],
				y: spot[1],
				anchor: 'middle',
				box: b,
				size,
				pill: !mark?.link,
				angle: 0,
				w,
				h,
				mark,
				from: off || district ? [x, y] : undefined
			});
			return true;
		}
		for (const m of [...stars, ...marks.filter((x) => x.link)])
			if (m.label) beside(`mark-${m.slug}`, null, m.label, m.x, m.y, 10 * k, m);
		const starred = new Set(stars.map((m) => m.label));

		// "Samarqand tumani" beside "Samarqand shahri": a district and a town of one name both
		// keep their word, so a bare "Samarqand" never picks the villages around the city
		const base = (it: Item) =>
			tx(it.card.name).replace(
				/\s+(tumani|shahri|viloyati|Respublikasi|район|город|область)$/i,
				''
			);
		const bases = items.map(base);
		const twice = new Set(bases.filter((n, i) => bases.indexOf(n) !== i));
		const nameOf = (it: Item) =>
			twice.has(base(it)) || it.badge ? tx(it.card.name) : shortName(tx(it.card.name));
		const rank = (it: Item) =>
			it.card.slug === glow ? 0 : it.card.panoramas === 0 ? 3 : it.badge ? 1 : 2;
		const order = [...items].sort((a, b) => rank(a) - rank(b) || area(b.box) - area(a.box));
		for (const it of order) {
			const text = nameOf(it);
			const dot = dots.get(it.card.slug);
			// the old cities' view names only its four cities: the rest keep quiet
			if (starred.size) continue;
			if (dot) {
				if (!beside(it.card.slug, it, text, dot.x, dot.y, (BADGE + 3) * k))
					beside(it.card.slug, it, text, dot.x, dot.y, (BADGE + 3) * k, undefined, false, true);
				continue;
			}
			if (!drawn.includes(it)) continue;
			if (placeInside(it, text) || it.card.panoramas === 0) continue;
			// too narrow for its whole name, and a playable place is never left without one:
			// small, its middle line inside (grazing the edge at most); else a pill beside it with
			// a line back, only over paper or "Tez orada" land (a pill over a neighbour would take
			// its taps); else the nearest free spot inside it
			if (placeInside(it, text, 'exact') || placeInside(it, text, 'loose')) continue;
			// a place one picks: a pill over paper or "Tez orada" land; where all around is playable
			// (Tashkent), the nearest free pill with a short line: readable at 10 px beats a name
			// across a border. It names and picks its own place; the neighbour stays tappable.
			if (
				it.card.places === 0 &&
				(beside(it.card.slug, it, text, it.x, it.y, 8 * k, undefined, true) ||
					beside(it.card.slug, it, text, it.x, it.y, 8 * k, undefined, true, true))
			)
				continue;
			nearMiddle(it, text);
		}

		function nearMiddle(it: Item, text: string) {
			const size = FONT * 0.8;
			const w = textWidth(text, size) * k;
			const h = size * 1.25 * k;
			const boxAt = (x: number, y: number): Box => [x - w / 2, y - h / 2, x + w / 2, y + h / 2];
			// the free spot with the most of its middle line on its own land
			const onLand = (x: number, y: number) =>
				[-0.5, -0.25, 0, 0.25, 0.5].filter((f) => within(it.rings, x + f * w, y)).length;
			let at: [number, number] = [it.x, it.y];
			let best = -1;
			for (const r of [0, 0.8, 1.6, 2.4, 3.2, 4.5, 6])
				for (let a = 0; a < (r ? 12 : 1); a++) {
					const c: [number, number] = [
						it.x + r * h * Math.cos((a * Math.PI) / 6),
						it.y + r * h * Math.sin((a * Math.PI) / 6)
					];
					const score = onLand(...c);
					if (score > best && free(boxAt(...c))) [at, best] = [c, score];
				}
			taken.push(boxAt(...at));
			out.push({
				key: it.card.slug,
				it,
				text,
				x: at[0],
				y: at[1],
				anchor: 'middle',
				box: boxAt(...at),
				size,
				pill: false,
				angle: 0,
				w,
				h
			});
		}

		// a name inside its own shape and clear of the others: around its middle, upright, else
		// along a thin strip (Yakkasaroy); a playable place may take a smaller size first
		// tight: the whole name and 2 px more inside (clear of a picked neighbour's outline);
		// exact: the whole name, small; loose: only its outer corners may graze the border
		function placeInside(
			it: Item,
			text: string,
			mode: 'tight' | 'exact' | 'loose' = 'tight'
		): boolean {
			const loose = mode === 'loose';
			const sizes =
				mode !== 'tight'
					? [FONT * 0.8] // never under 10 px: smaller is a pill
					: it.card.panoramas > 0
						? [FONT, FONT * 0.85, FONT * 0.8]
						: [FONT];
			const angles = Math.abs(it.axis) > 15 ? [0, it.axis] : [0];
			// two words may stand on two lines ("Toshkent" over "viloyati")
			const words = text.split(' ');
			const variants: string[][] = [[text]];
			if (words.length > 1) {
				const cut = Math.ceil(words.length / 2);
				variants.push([words.slice(0, cut).join(' '), words.slice(cut).join(' ')]);
			}
			// upright at every size first, on one line then two; turned along the strip only
			// when upright can't fit
			for (const angle of angles)
				for (const rows of angle ? variants.slice(0, 1) : variants)
					for (const size of sizes) {
						const w = Math.max(...rows.map((ln) => textWidth(ln, size))) * k;
						const h = size * 1.2 * k * rows.length;
						const cos = Math.cos((angle * Math.PI) / 180);
						const sin = Math.sin((angle * Math.PI) / 180);
						// the whole box, a little inset, in its own shape: corners, edges and middle
						const iw = w / 2 + (mode === 'tight' ? 2 : -1.5) * k;
						const ih = h / 2 - 1.5 * k;
						// a place one picks: its whole box; a place one flies into: its middle line is
						// enough (crossing a border there picks nothing wrong)
						const grid: [number, number][] = [];
						for (const fx of [-1, -0.5, 0, 0.5, 1])
							for (const fy of it.card.places > 0
								? [0]
								: loose && Math.abs(fx) === 1
									? [0]
									: [-1, 0, 1])
								grid.push([fx * iw, fy * ih]); // loose: only the outer corners may graze
						// loose: the outer corners may stick out, but only over paper, "Tez orada" land or
						// itself, never over a playable neighbour (it would lie in its blue)
						const corners: [number, number][] = loose
							? [-1, 1].flatMap((fx) => [-1, 1].map((fy): [number, number] => [fx * iw, fy * ih]))
							: [];
						const neighbours = items.filter((o) => o !== it && o.card.panoramas > 0);
						const fits = (cx: number, cy: number) =>
							grid.every(([dx, dy]) =>
								within(it.rings, cx + dx * cos - dy * sin, cy + dx * sin + dy * cos)
							) &&
							corners.every(([dx, dy]) => {
								const px = cx + dx * cos - dy * sin;
								const py = cy + dx * sin + dy * cos;
								return !neighbours.some((o) => within(o.rings, px, py));
							});
						const aabb = (cx: number, cy: number): Box => {
							const hw = (Math.abs(w * cos) + Math.abs(h * sin)) / 2;
							const hh = (Math.abs(w * sin) + Math.abs(h * cos)) / 2;
							return [cx - hw, cy - hh, cx + hw, cy + hh];
						};
						// its middle first, then rings around it
						const spots: [number, number][] = [[it.x, it.y]];
						for (const r of [0.6, 1.2, 2, 3, 4.5])
							for (let a = 0; a < 8; a++)
								spots.push([
									it.x + r * h * Math.cos((a * Math.PI) / 4),
									it.y + r * h * Math.sin((a * Math.PI) / 4)
								]);
						const spot = spots.find(([x, y]) => fits(x, y) && free(aabb(x, y)));
						if (!spot) continue;
						const b = aabb(...spot);
						taken.push(b);
						out.push({
							key: it.card.slug,
							it,
							text,
							x: spot[0],
							y: spot[1],
							anchor: 'middle',
							box: b,
							size,
							pill: false,
							lines: rows.length > 1 ? rows : undefined,
							angle,
							w,
							h
						});
						return true;
					}
			return false;
		}
		return out;
	});

	// the caption under the map: what the mouse is over, or a "Tez orada" place just tapped
	let hover = $state<Card | null>(null);
	let told = $state<Card | null>(null);
	let toldTimer: ReturnType<typeof setTimeout> | undefined;
	const shown = $derived(hover && lit.includes(hover.slug) ? told : (hover ?? told));
	const enter = (e: PointerEvent, c: Card) => {
		if (e.pointerType === 'mouse') hover = c;
	};
	// a tap focuses what it touched too: only a keyboard's focus shows the caption
	const focused = (e: FocusEvent, c: Card) => {
		if ((e.currentTarget as Element).matches(':focus-visible')) hover = c;
	};

	// ---------- a tap: into it, or pick it ----------
	let zoom = $state('');
	let flying = $state('');
	function tap(it: Item) {
		if (flying) return;
		if (it.card.panoramas === 0) {
			told = it.card;
			clearTimeout(toldTimer);
			toldTimer = setTimeout(() => (told = null), 2500);
			return;
		}
		told = null;
		if (it.card.places > 0) fly(it).then(() => ondrill(it.card));
		else onpick(it.card);
	}
	// the map flies into the place, the rest fading, before the next level comes in
	function fly(it: Item): Promise<void> {
		const dot = dots.get(it.card.slug);
		const [x0, y0, x1, y1] = dot
			? [dot.x - BADGE * k, dot.y - BADGE * k, dot.x + BADGE * k, dot.y + BADGE * k]
			: it.box;
		const s = Math.min(vb.w / (x1 - x0), vb.h / (y1 - y0)) * 0.9;
		const tx = vb.x + (vb.w - (x1 - x0) * s) / 2 - x0 * s;
		const ty = vb.y + (vb.h - (y1 - y0) * s) / 2 - y0 * s;
		flying = it.card.slug;
		zoom = `translate(${tx}px, ${ty}px) scale(${s})`;
		const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
		return new Promise((r) => setTimeout(r, still ? 0 : 430));
	}
	function onKey(e: KeyboardEvent, it: Item) {
		if (e.key !== 'Enter' && e.key !== ' ') return;
		e.preventDefault();
		tap(it);
	}
</script>

<figure class="map" class:flying={!!flying}>
	<svg
		bind:clientWidth={width}
		style:max-width={`calc(min(560px, 58dvh) * ${vb.w / vb.h})`}
		viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
		class:framed
		role="group"
		aria-label={t('placesTitle')}
	>
		<defs>
			<pattern
				id={hatch}
				width={8 * k}
				height={8 * k}
				patternUnits="userSpaceOnUse"
				patternTransform="rotate(45)"
			>
				<rect width={8 * k} height={8 * k} class="hatch-bg" />
				<line x1="0" y1="0" x2="0" y2={8 * k} class="hatch-line" style:stroke-width={2.5 * k} />
			</pattern>
		</defs>
		<g class="world" style:transform={zoom || null}>
			<!-- the shapes alone carry the whole place's glow: the names stay sharp -->
			<g class="shapes" class:whole>
				{#each drawn.filter((it) => !it.badge) as it (it.card.slug)}
					{@const on = it.card.panoramas > 0}
					<path
						d={it.d}
						class="shape"
						class:played={it.card.progress.seen > 0}
						class:soon={!on}
						class:target={flying === it.card.slug}
						class:under={it.badge}
						style:--known={knownTint(it.card.progress)}
						style:fill={on ? null : `url(#${hatch})`}
						role="button"
						tabindex={on && !it.badge ? 0 : -1}
						aria-label={tx(it.card.name)}
						onclick={() => tap(it)}
						onkeydown={(e) => onKey(e, it)}
						onpointerenter={(e) => enter(e, it.card)}
						onpointerleave={() => (hover = null)}
						onfocus={(e) => focused(e, it.card)}
						onblur={() => (hover = null)}
					/>
				{/each}
				<!-- the lit places and the hovered one, edged over their neighbours -->
				{#each drawn as it (it.card.slug)}
					{#if !it.badge && (lit.includes(it.card.slug) || (hover?.slug === it.card.slug && hover.panoramas > 0))}
						<path d={it.d} class="edge" class:lit={lit.includes(it.card.slug)} />
					{/if}
				{/each}
			</g>
			{#each stars as m (m.slug)}
				{@const at = original(m)}
				{#if at.y !== m.y}
					<line x1={at.x} y1={at.y} x2={m.x} y2={m.y} class="leader" />
				{/if}
				<!-- the position on the group: the star's own pop-in animates its transform -->
				<g transform={`translate(${m.x} ${m.y}) scale(${k})`}>
					<path
						class="star"
						d="M0 -9 2.6 -2.8 9.3 -2.8 3.9 1.1 6 7.6 0 3.7 -6 7.6 -3.9 1.1 -9.3 -2.8 -2.6 -2.8Z"
					/>
				</g>
			{/each}
			{#each items.filter((it) => it.badge) as it (it.card.slug)}
				{@const dot = dots.get(it.card.slug)}
				{#if dot}
					<g
						class="badge"
						class:lit={lit.includes(it.card.slug)}
						class:glow={glow === it.card.slug}
						class:gone={stars.length > 0 && !lit.includes(it.card.slug)}
						role="button"
						tabindex="0"
						aria-label={tx(it.card.name)}
						onclick={() => tap(it)}
						onkeydown={(e) => onKey(e, it)}
						onpointerenter={(e) => enter(e, it.card)}
						onpointerleave={() => (hover = null)}
						onfocus={(e) => focused(e, it.card)}
						onblur={() => (hover = null)}
					>
						{#if dot.moved}
							<line x1={it.x} y1={it.y} x2={dot.x} y2={dot.y} class="leader" />
							<circle cx={it.x} cy={it.y} r={2.5 * k} class="spot" />
						{/if}
						<circle cx={dot.x} cy={dot.y} r={(BADGE + 3) * k} class="hit" />
						<circle
							cx={dot.x}
							cy={dot.y}
							r={BADGE * k}
							class="disc"
							style:--known={knownTint(it.card.progress)}
							style:stroke-width={3 * k}
						/>
						<circle cx={dot.x} cy={dot.y} r={3.5 * k} class="dot" />
					</g>
				{/if}
			{/each}
			<!-- a name is a tap on the place it names (a child taps the word "Toshkent") -->
			{#each labels as l (l.key)}
				<g
					class="label"
					class:pill={l.pill}
					class:star-name={!l.it && !l.mark?.link}
					class:link={!!l.mark?.link}
					class:quiet={!!l.it && l.it.badge && marks.some((m) => !m.link)}
					class:soon={!!l.it && l.it.card.panoramas === 0}
					transform={l.angle ? `rotate(${l.angle} ${l.x} ${l.y})` : undefined}
					onclick={() => (l.it ? tap(l.it) : l.mark && onmark?.(l.mark))}
					onpointerenter={(e) => l.it && enter(e, l.it.card)}
					onpointerleave={() => (hover = null)}
					aria-hidden="true"
				>
					{#if l.from}
						<line x1={l.from[0]} y1={l.from[1]} x2={l.x} y2={l.y} class="leader" />
						<circle cx={l.from[0]} cy={l.from[1]} r={2.5 * k} class="spot" />
					{/if}
					<rect
						x={l.x - l.w / 2 - (l.pill ? 0 : 3 * k)}
						y={l.y - l.h / 2 - (l.pill ? 0 : 4 * k)}
						width={l.w + (l.pill ? 0 : 6 * k)}
						height={l.h + (l.pill ? 0 : 8 * k)}
						rx={l.pill ? l.h / 2 : 0}
						class="hit"
						style:stroke-width={l.pill ? `${1.5 * k}px` : null}
					/>
					<text
						x={l.x}
						y={l.y}
						style:text-anchor={l.anchor}
						class:on={!!l.it && (lit.includes(l.it.card.slug) || hover?.slug === l.it.card.slug)}
						style:font-size={`${l.size * k}px`}
						style:stroke-width={l.pill ? '0' : `${3 * k}px`}
						>{#if l.lines}{#each l.lines as ln, i (i)}<tspan
									x={l.x}
									dy={i ? `${1.2 * l.size * k}px` : `${-0.6 * l.size * k * (l.lines.length - 1)}px`}
									>{ln}</tspan
								>{/each}{:else}{l.text}{/if}</text
					>
				</g>
			{/each}
			{#if tag && glowItem}
				{@const dot = dots.get(glowItem.card.slug) ?? glowItem}
				<g class="start-here">
					<line
						x1={dot.x}
						y1={tag.y + tag.h}
						x2={dot.x}
						y2={dot.y - BADGE * k}
						style:stroke-width={`${2 * k}px`}
					/>
					<rect x={tag.x} y={tag.y} width={tag.w} height={tag.h} rx={tag.h / 2} />
					<text
						x={tag.x + tag.w / 2}
						y={tag.y + tag.h / 2}
						textLength={tag.tw}
						lengthAdjust="spacingAndGlyphs"
						style:font-size={`${13 * k}px`}>{tag.text}</text
					>
				</g>
			{/if}
		</g>
	</svg>
	<figcaption class="caption">
		{#if shown}
			<b>{tx(shown.name)}</b>
			{#if shown.panoramas > 0}<Progress progress={shown.progress} />{:else}<span>{t('soon')}</span
				>{/if}
		{/if}
	</figcaption>
</figure>

<style>
	.map {
		position: relative;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
		animation: rise 0.35s var(--settle) both;
	}
	svg {
		width: 100%;
		margin: 0 auto;
		overflow: visible;
		filter: drop-shadow(0 6px 10px rgba(19, 35, 63, 0.16));
		-webkit-tap-highlight-color: transparent;
	}
	/* framed on what can be played: the rest is cut at the map's edge, softly */
	svg.framed {
		overflow: hidden;
		border-radius: 18px;
	}
	.world {
		transform-origin: 0 0;
		transition: transform 0.43s var(--settle);
	}
	.shape {
		fill: color-mix(in srgb, var(--gold) var(--known), var(--bg));
		stroke: var(--lapis);
		stroke-width: 1.3px;
		vector-effect: non-scaling-stroke;
		stroke-linejoin: round;
		cursor: pointer;
		transition:
			fill 0.15s,
			opacity 0.3s;
		outline: none;
	}
	.shape:hover:not(.soon) {
		fill: color-mix(
			in srgb,
			var(--sky) 14%,
			color-mix(in srgb, var(--gold) var(--known), var(--bg))
		);
	}
	/* "Tez orada" borders thin: where two of them zig-zag along a reservoir, no black tangle */
	.shape.soon {
		cursor: default;
		stroke-width: 0.6px;
		stroke: color-mix(in srgb, var(--lapis) 45%, transparent);
	}
	.shape.under {
		stroke: none;
		pointer-events: none;
	}
	.label {
		cursor: pointer;
	}
	/* a name takes taps on its letters only: around them the tap is the shape's underneath
	   (a hit area grazing a neighbour would pick the wrong place); a pill takes its whole box */
	.label .hit {
		fill: transparent;
		pointer-events: none;
	}
	.label text {
		pointer-events: visiblePainted;
	}
	.label.pill .hit {
		pointer-events: all;
	}
	/* a town's or an old city's name: a pill, so it reads over any border */
	.label.pill .hit {
		fill: var(--surface);
		stroke: color-mix(in srgb, var(--lapis) 35%, transparent);
	}
	.label.star-name .hit {
		fill: var(--star);
		stroke: none;
	}
	.label.star-name text {
		fill: #3a2600;
		opacity: 1;
	}
	/* the capital in its region's hole: its name, navy, a tap away */
	.label.link text {
		fill: var(--lapis);
		font-weight: 800;
		opacity: 1;
	}
	:global(:root[data-theme='dark']) .label.link text {
		fill: var(--text);
	}
	.quiet {
		opacity: 0.3;
	}
	.badge.gone {
		display: none;
	}
	.label.soon text {
		fill: var(--muted);
	}
	.leader {
		stroke: var(--lapis);
		stroke-width: 1.5px;
		vector-effect: non-scaling-stroke;
	}
	.spot {
		fill: var(--lapis);
	}
	/* in the dark a pill's line and dot in the light text colour, the pill lightly edged */
	:global(:root[data-theme='dark']) .leader {
		stroke: color-mix(in srgb, var(--text) 60%, transparent);
	}
	:global(:root[data-theme='dark']) .spot {
		fill: color-mix(in srgb, var(--text) 60%, transparent);
	}
	:global(:root[data-theme='dark']) .label.pill .hit {
		stroke: color-mix(in srgb, var(--text) 35%, transparent);
	}
	.hatch-bg {
		fill: var(--surface-2);
	}
	.hatch-line {
		stroke: color-mix(in srgb, var(--muted) 35%, transparent);
	}
	/* in the dark the playable places are the raised navy of the page's cards; "Tez orada"
	   sinks into the background with a fainter hatch, as paper and drab hatch do in the light */
	:global(:root[data-theme='dark']) .shape {
		fill: color-mix(in srgb, var(--gold) var(--known), var(--surface-2));
		stroke: color-mix(in srgb, var(--sky) 55%, var(--bg));
	}
	:global(:root[data-theme='dark']) .hatch-bg {
		fill: var(--bg);
	}
	:global(:root[data-theme='dark']) .hatch-line {
		stroke: color-mix(in srgb, var(--muted) 18%, transparent);
	}
	/* on the night-blue map gold mixed thin turns brown: the stars' gold, stronger */
	:global(:root[data-theme='dark']) .shape.played {
		fill: color-mix(in srgb, var(--star) calc(var(--known) + 12%), var(--surface));
		stroke: var(--star);
	}
	.edge {
		fill: none;
		stroke: var(--sky);
		stroke-width: 2.4px;
		vector-effect: non-scaling-stroke;
		pointer-events: none;
	}
	.edge.lit {
		fill: color-mix(in srgb, var(--sky) 30%, transparent);
		stroke-width: 3.4px;
	}
	/* the whole place is what plays: its outline glows (the shapes only: names stay sharp) */
	.shapes.whole {
		filter: drop-shadow(0 0 1.5px var(--sky)) drop-shadow(0 0 1.5px var(--sky));
	}
	.star {
		fill: var(--star);
		stroke: #7a5200;
		stroke-width: 1.2px;
		vector-effect: non-scaling-stroke;
		pointer-events: none;
		animation: pop-in 0.35s var(--pop) both;
	}
	.badge {
		cursor: pointer;
		outline: none;
	}
	.badge .hit {
		fill: transparent;
	}
	.badge .disc {
		fill: color-mix(in srgb, var(--gold) var(--known), var(--surface));
		stroke: var(--lapis);
		transition: fill 0.15s;
	}
	.badge .dot {
		fill: var(--lapis);
	}
	/* in the dark an unpicked town's ring is the borders' colour: teal is only a pick's */
	:global(:root[data-theme='dark']) .badge .disc {
		stroke: color-mix(in srgb, var(--sky) 55%, var(--bg));
	}
	:global(:root[data-theme='dark']) .badge .dot {
		fill: color-mix(in srgb, var(--sky) 55%, var(--bg));
	}
	:global(:root[data-theme='dark']) .badge.lit .disc {
		stroke: var(--sky);
	}
	:global(:root[data-theme='dark']) .badge.lit .dot {
		fill: var(--sky);
	}
	.badge:hover .disc,
	.badge:focus-visible .disc,
	.badge.lit .disc {
		stroke: var(--sky);
		fill: color-mix(in srgb, var(--sky) 35%, var(--surface));
	}
	.badge.lit .dot {
		fill: var(--sky);
	}
	.badge.glow .disc {
		animation: beacon 1.6s ease-in-out infinite;
	}
	@keyframes beacon {
		50% {
			stroke: var(--star);
			filter: drop-shadow(0 0 6px var(--star));
		}
	}
	text {
		font-family: var(--body);
		font-weight: 700;
		text-anchor: middle;
		dominant-baseline: middle;
		fill: var(--text);
		stroke: color-mix(in srgb, var(--bg) 85%, transparent);
		paint-order: stroke;
		pointer-events: none;
		opacity: 0.85;
		transition: opacity 0.2s;
	}
	text.on {
		opacity: 1;
		font-weight: 800;
	}
	/* flying into a place: the rest fades, the names go (they would grow huge) */
	.flying .shape:not(.target),
	.flying .badge,
	.flying .star,
	.flying .edge {
		opacity: 0.15;
	}
	.flying text {
		opacity: 0;
	}
	.start-here {
		pointer-events: none;
		animation: pop-in 0.4s var(--pop) both;
	}
	.start-here rect {
		fill: var(--star);
	}
	.start-here line {
		stroke: var(--star);
		stroke-dasharray: 2 3;
		vector-effect: non-scaling-stroke;
	}
	.start-here text {
		font-family: var(--display);
		font-weight: 800;
		fill: #3a2600;
		stroke: none;
		opacity: 1;
	}
	.flying .start-here {
		opacity: 0;
	}
	.caption {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 12px;
		min-height: 26px;
		font-size: 14px;
		color: var(--muted);
	}
	.caption b {
		font-family: var(--display);
		font-size: 15px;
		color: var(--text);
	}
	@media (prefers-reduced-motion: reduce) {
		.world {
			transition: none;
		}
		.badge.glow .disc {
			animation: none;
		}
	}
</style>
