<script lang="ts" module>
	let maps = 0; // each map's own hatch pattern id
</script>

<script lang="ts">
	// A place's map of its parts (P1028 4.2; the profile's Tashkent, CityMap): its districts drawn
	// from their borders, the way people know the map of Tashkent. In the game's look (decision
	// 0024): milk tiles with turquoise seams lying on the ground, gold only as streets are learned
	// (a place only played in stays milk), names where they fit (a name is a tap on its place). A
	// town with panoramas too small to tap is a round badge with its name in a pill; badges that
	// would sit on each other step apart, a short line back to their place. A tap on a place with
	// places inside flies into it (ondrill); a tap on one without picks it (onpick). Places
	// without panoramas are quiet, faintly hatched, and say "Tez orada".
	import type { Schemas } from '#lib/api/client.js';
	import { t, tx } from '#lib/i18n/index.svelte.js';
	import Progress from './Progress.svelte';
	import { fewPlaces, knownTint, learnedAny, shortName } from './progress.js';

	type Card = Schemas['PlaceCard'];
	interface Props {
		drawing: Schemas['PlaceMap'];
		cards: Card[]; // the drawing's places: names, panoramas, progress
		ondrill: (c: Card) => void;
		onpick: (c: Card) => void;
		level?: boolean; // every name stands level; one that can't fit is a pill with a line
		crop?: [number, number, number, number]; // the part of the drawing to show, not the whole
	}
	let { drawing, cards, ondrill, onpick, level = false, crop }: Props = $props();

	const id = ++maps;
	const hatch = `hatch-${id}`;
	const tile = `tile-${id}`; // the milk tiles' gradient
	const FONT = 12.5; // a name's size on screen, px
	const BADGE = 11; // a town's dot radius on screen, px

	const pad = $derived(Math.max(drawing.width, drawing.height) * 0.03);
	// the frame: the whole place, its own shape (the owner: "see that region with its tumanlar").
	// The whole map is as tall as --map-h at most (a screen sets it to the room it has), else
	// 560 px or 58% of the window
	const vb = $derived.by(() => {
		const [x0, y0, x1, y1] = crop ?? [0, 0, drawing.width, drawing.height];
		return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad };
	});
	let width = $state(0); // the map on screen, px
	const k = $derived(vb.w / Math.max(width, 1)); // drawing units per screen px
	const frame = $derived(vb); // what is on screen

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
	// the shapes' numbers, once a map: going close only changes how big they are on screen
	const geometry = $derived(
		new Map(
			drawing.shapes.map((s) => {
				const rings = ringsOf(s.d);
				return [s.slug, { box: bbox(s.d), rings, axis: axisOf(rings) }];
			})
		)
	);
	const items = $derived.by((): Item[] => {
		const bySlug = new Map(cards.map((c) => [c.slug, c]));
		return drawing.shapes.flatMap((s) => {
			const card = bySlug.get(s.slug);
			if (!card) return [];
			const { box, rings, axis } = geometry.get(s.slug)!;
			const px = Math.max(box[2] - box[0], box[3] - box[1]) / k;
			// too small to tap as a shape, and playable: a dot. A town gets one sooner, so a child
			// finds Samarqand or Buxoro by a dot with its name, not by a smudge
			const badge = card.panoramas > 0 && (px < 16 || (card.kind === 'city' && px < 60));
			return [{ card, d: s.d, x: s.label.x, y: s.label.y, box, px, badge, rings, axis }];
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

	// names are measured in the game's fonts: laid out again once they have loaded, so every
	// way onto a map (flying in, a link) gives the same names
	let fonts = $state(0);
	$effect(() => {
		document.fonts?.ready.then(() => fonts++);
	});

	let ctx: CanvasRenderingContext2D | null = null;
	function textWidth(s: string, size = FONT, font = '--f-text', weight = 700): number {
		ctx ??= document.createElement('canvas').getContext('2d');
		if (!ctx) return s.length * size * 0.62;
		const family = getComputedStyle(document.documentElement).getPropertyValue(font);
		ctx.font = `${weight} ${size}px ${family || 'sans-serif'}`;
		return ctx.measureText(s).width;
	}

	type Anchor = 'start' | 'middle' | 'end';
	interface Label {
		key: string;
		it: Item;
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
		from?: [number, number];
		lines?: string[]; // two lines
	}
	// names where they fit, inside the map: towns' first (in pills by their dots), then playable
	// places by size; "Tez orada" ones last, so they lose their names first. The
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
		// a name keeps clear of the map's edge, its tap area too
		const m = 5 * k;
		const inside = (b: Box) =>
			b[0] >= frame.x + m &&
			b[1] >= frame.y + m &&
			b[2] <= frame.x + frame.w - m &&
			b[3] <= frame.y + frame.h - m;
		// a callout's line is an obstacle too: no pill or name may lie across it
		const lines: [number, number, number, number][] = [];
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
		let paperOnly = false;

		// a pill by a point (a town's dot) or, for a district too narrow for its name, by
		// its middle with a line back. A town's or district's pill stands only where its whole
		// box is over no other playable place (paper, or "Tez orada" land): over a neighbour it
		// would lie in its blue and take its taps. Its line crosses no pill, and no later pill
		// crosses it; when the sides are taken, the line grows and the pill goes out further.
		function beside(
			key: string,
			it: Item,
			text: string,
			x: number,
			y: number,
			r: number,
			district = false,
			anywhere = false // a town with no clean spot: any free one (it keeps its name)
		): boolean {
			const size = district ? FONT * 0.85 : FONT;
			const w = textWidth(text, size, '--f-text', 800) * k + 12 * k;
			const h = size * 1.5 * k;
			// straight above or below, moved in from the map's edge if it must
			const inX = (px: number) =>
				Math.max(frame.x + m + w / 2, Math.min(px, frame.x + frame.w - m - w / 2));
			const spots: [number, number][] = (
				district ? [r, r * 2.5, r * 4, r * 6, r * 9, r * 12, r * 16, r * 21] : [r, r * 2.5, r * 4]
			).flatMap((d): [number, number][] => [
				[x + d + w / 2, y],
				[x - d - w / 2, y],
				[x, y - d - h / 2],
				[x, y + d + h / 2],
				[x + d * 0.7 + w / 2, y - d * 0.7 - h / 2],
				[x - d * 0.7 - w / 2, y + d * 0.7 + h / 2],
				[x - d * 0.7 - w / 2, y - d * 0.7 - h / 2],
				[x + d * 0.7 + w / 2, y + d * 0.7 + h / 2],
				[inX(x + w / 2), y - d - h / 2],
				[inX(x + w / 2), y + d + h / 2]
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
						o !== it &&
						(o.card.panoramas > 0 || paperOnly) &&
						grid(b).some(([px, py]) => within(o.rings, px, py))
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
			const spot = !anywhere
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
				: // the last resort: near, and over as little of the neighbours as can be (a far
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
						.sort((a, b) => a[0] - b[0])[0]?.[1];
			if (!spot) return false;
			const b = boxAt(spot);
			// a line back when the pill stands off its place
			const off = Math.hypot(spot[0] - x, spot[1] - y) > r + Math.max(w, h) / 2 + 2 * k;
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
				pill: true,
				angle: 0,
				w,
				h,
				from: off || district ? [x, y] : undefined
			});
			return true;
		}
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
		const rank = (it: Item) => (it.card.panoramas === 0 ? 3 : it.badge ? 1 : 2);
		const sight: Box = [frame.x, frame.y, frame.x + frame.w, frame.y + frame.h];
		const order = items
			.filter((it) => overlaps(it.box, sight))
			.sort((a, b) => rank(a) - rank(b) || area(b.box) - area(a.box));
		for (const it of order) {
			const text = nameOf(it);
			const dot = dots.get(it.card.slug);
			if (dot) {
				if (!beside(it.card.slug, it, text, dot.x, dot.y, (BADGE + 3) * k))
					beside(it.card.slug, it, text, dot.x, dot.y, (BADGE + 3) * k, false, true);
				continue;
			}
			if (!drawn.includes(it)) continue;
			if (placeInside(it, text) || it.card.panoramas === 0) continue;
			// too narrow for its whole name, and a playable place is never left without one:
			// small, its middle line inside (grazing the edge at most); else a pill beside it with
			// a line back, only over paper or "Tez orada" land (a pill over a neighbour would take
			// its taps); else the nearest free spot inside it
			if (placeInside(it, text, 'exact') || (!level && placeInside(it, text, 'loose'))) continue;
			// a region's pill: on empty paper if there is any near (over a neighbour, even a "Tez
			// orada" one, it names the wrong land: Toshkent viloyati over the Farg‘ona valley), else
			// beside its own shape
			if (it.card.places > 0) {
				paperOnly = true;
				const onPaper = beside(it.card.slug, it, text, it.x, it.y, 8 * k, true);
				paperOnly = false;
				if (onPaper || beside(it.card.slug, it, text, it.x, it.y, 8 * k, true)) continue;
			}
			// a place one picks: a pill over paper or "Tez orada" land; where all around is playable
			// (Tashkent), the nearest free pill with a short line: readable at 10 px beats a name
			// across a border. It names and picks its own place; the neighbour stays tappable.
			if (
				it.card.places === 0 &&
				(beside(it.card.slug, it, text, it.x, it.y, 8 * k, true) ||
					beside(it.card.slug, it, text, it.x, it.y, 8 * k, true, true))
			)
				continue;
			nearMiddle(it, text);
		}

		function nearMiddle(it: Item, text: string) {
			const size = FONT * 0.8;
			const w = textWidth(text, size) * k;
			const h = size * 1.25 * k;
			const boxAt = (x: number, y: number, deg: number): Box => {
				const cos = Math.abs(Math.cos((deg * Math.PI) / 180));
				const sin = Math.abs(Math.sin((deg * Math.PI) / 180));
				const hw = (w * cos + h * sin) / 2;
				const hh = (w * sin + h * cos) / 2;
				return [x - hw, y - hh, x + hw, y + hh];
			};
			// the free spot with the most of its middle line on its own land, along a strip if
			// that is what stays on it (Yakkasaroy): over a neighbour it reads as the neighbour's
			const onLand = (x: number, y: number, deg: number) =>
				[-0.5, -0.25, 0, 0.25, 0.5].filter((f) =>
					within(
						it.rings,
						x + f * w * Math.cos((deg * Math.PI) / 180),
						y + f * w * Math.sin((deg * Math.PI) / 180)
					)
				).length;
			let at: [number, number] = [it.x, it.y];
			let angle = 0;
			let best = -1;
			for (const deg of Math.abs(it.axis) > 15 ? [0, it.axis] : [0])
				for (const r of [0, 0.8, 1.6, 2.4, 3.2, 4.5, 6])
					for (let a = 0; a < (r ? 12 : 1); a++) {
						const c: [number, number] = [
							it.x + r * h * Math.cos((a * Math.PI) / 6),
							it.y + r * h * Math.sin((a * Math.PI) / 6)
						];
						const score = onLand(...c, deg);
						if (score > best && free(boxAt(...c, deg))) [at, best, angle] = [c, score, deg];
					}
			taken.push(boxAt(...at, angle));
			out.push({
				key: it.card.slug,
				it,
				text,
				x: at[0],
				y: at[1],
				anchor: 'middle',
				box: boxAt(...at, angle),
				size,
				pill: false,
				angle,
				w,
				h
			});
		}

		// where a shape's name goes: its middle, or close up, if that is off screen, the middle of
		// the part in sight
		function middleInSight(it: Item): [number, number] {
			const seen = it.x > sight[0] && it.x < sight[2] && it.y > sight[1] && it.y < sight[3];
			if (seen) return [it.x, it.y];
			const x0 = Math.max(it.box[0], sight[0]);
			const y0 = Math.max(it.box[1], sight[1]);
			const x1 = Math.min(it.box[2], sight[2]);
			const y1 = Math.min(it.box[3], sight[3]);
			let best: [number, number] = [it.x, it.y];
			let far = Infinity;
			for (let i = 1; i < 8; i++)
				for (let j = 1; j < 8; j++) {
					const x = x0 + ((x1 - x0) * i) / 8;
					const y = y0 + ((y1 - y0) * j) / 8;
					const d = Math.hypot(x - (x0 + x1) / 2, y - (y0 + y1) / 2);
					if (d < far && within(it.rings, x, y)) [best, far] = [[x, y], d];
				}
			return best;
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
			// loose: along the strip first, upright it would lie on a neighbour (Yakkasaroy)
			const angles = !level && Math.abs(it.axis) > 15 ? (loose ? [it.axis, 0] : [0, it.axis]) : [0];
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
						// a region's name stands on its middle line alone: looked at closely, or it runs
						// out over the next region and back (Toshkent viloyati)
						for (const fx of it.card.places > 0
							? [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1]
							: [-1, -0.5, 0, 0.5, 1])
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
						const [mx, my] = middleInSight(it);
						const spots: [number, number][] = [[mx, my]];
						for (const r of [0.6, 1.2, 2, 3, 4.5])
							for (let a = 0; a < 8; a++)
								spots.push([
									mx + r * h * Math.cos((a * Math.PI) / 4),
									my + r * h * Math.sin((a * Math.PI) / 4)
								]);
						// a turned name keeps clear along its own line: its square would keep two
						// neighbouring strips' names from both turning (Mirobod, Yakkasaroy)
						const along = (cx: number, cy: number): Box[] =>
							angle
								? [-0.42, -0.25, -0.08, 0.08, 0.25, 0.42].map((f): Box => {
										const px = cx + f * w * cos;
										const py = cy + f * w * sin;
										const r = Math.max(h, w / 6) / 2;
										return [px - r, py - h / 2, px + r, py + h / 2];
									})
								: [aabb(cx, cy)];
						const spot = spots.find(([x, y]) => fits(x, y) && along(x, y).every(free));
						if (!spot) continue;
						const b = aabb(...spot);
						taken.push(...along(...spot));
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
	const shown = $derived(hover ?? told);
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
		style:max-width={`calc(var(--map-h, min(560px, 58dvh)) * ${vb.w / vb.h})`}
		style:aspect-ratio={`${vb.w} / ${vb.h}`}
		viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
		style:--tg={`url(#${tile})`}
		role="group"
		aria-label={t('placesTitle')}
	>
		<defs>
			<!-- each tile lit from above, as the home's map -->
			<linearGradient id={tile} x1="0" y1="0" x2="0" y2="1">
				<stop offset="0" style:stop-color="var(--tile-a)" />
				<stop offset="1" style:stop-color="var(--tile-b)" />
			</linearGradient>
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
			<g class="shapes">
				<!-- a town under its badge, or a place too small to draw, still fills its spot: no
				     hole shows the ground (or the ring) through the land -->
				{#each items.filter((it) => it.badge || !drawn.includes(it)) as it (it.card.slug)}
					<path
						d={it.d}
						class="shape under"
						class:learned={learnedAny(it.card.progress)}
						class:soon={it.card.panoramas === 0}
						style:--known={knownTint(it.card.progress)}
						aria-hidden="true"
					/>
				{/each}
				{#each drawn.filter((it) => !it.badge) as it (it.card.slug)}
					{@const on = it.card.panoramas > 0}
					<path
						d={it.d}
						class="shape"
						class:learned={learnedAny(it.card.progress)}
						class:soon={!on}
						class:target={flying === it.card.slug}
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
				<!-- the hovered place, edged over its neighbours -->
				{#each drawn as it (it.card.slug)}
					{#if !it.badge && hover?.slug === it.card.slug && hover.panoramas > 0}
						<path d={it.d} class="edge" />
					{/if}
				{/each}
			</g>
			{#each items.filter((it) => it.badge) as it (it.card.slug)}
				{@const dot = dots.get(it.card.slug)}
				{#if dot}
					<g
						class="badge"
						class:learned={learnedAny(it.card.progress)}
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
					class:soon={l.it.card.panoramas === 0}
					class:few={fewPlaces(l.it.card)}
					transform={l.angle ? `rotate(${l.angle} ${l.x} ${l.y})` : undefined}
					onclick={() => tap(l.it)}
					onpointerenter={(e) => enter(e, l.it.card)}
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
						class:on={hover?.slug === l.it.card.slug}
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
		</g>
	</svg>
	<figcaption class="caption">
		{#if shown}
			<b class="d">{tx(shown.name)}</b>
			{#if shown.panoramas > 0}<Progress progress={shown.progress} />{:else}<span>{t('soon')}</span
				>{/if}
		{/if}
	</figcaption>
</figure>

<style>
	/* the map's lettering is dark ink by day and by night: the tiles are milk in both */
	.map {
		--map-ink: #0b3b44;
		--map-ink-2: #3a5d63;
		--map-line: rgba(11, 59, 68, 0.75); /* a pill's line back to its place */
		/* what the player has learned: a light gold wash at the first street learned (the home's
		   --gold-hi thinned on the milk) to a rich gold when every street is learned; --known
		   (learned ÷ all, knownTint) says how far along a place is. Played and not learned: milk */
		--learn-lo: color-mix(in srgb, var(--gold-hi) 60%, var(--tile-a));
		--learn-hi: color-mix(in srgb, var(--gold) 80%, var(--gold-lo));
		position: relative;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
		animation: rise 0.35s var(--out) both;
	}
	/* by night a pill's line crosses the dark ground too: a lighter teal reads on both */
	:global(:root[data-theme='dark']) .map {
		--map-line: #73a9ae;
	}
	svg {
		width: 100%;
		margin: 0 auto;
		overflow: visible;
		-webkit-tap-highlight-color: transparent;
	}
	/* the tiles float on a glow and a stacked shadow, as the home's map (the shapes alone: the
	   names stay sharp) */
	.shapes {
		filter: drop-shadow(0 0 18px var(--map-glow)) drop-shadow(0 5px 0 var(--map-shadow));
	}
	.world {
		transform-origin: 0 0;
		transition: transform 0.43s var(--out);
	}

	/* ---------- the tiles ---------- */
	/* a part's holes are holes (Toshkent viloyati round the city): the server's rings are
	   even-odd, as `within` reads them */
	.shape {
		fill: var(--tg);
		fill-rule: evenodd;
		stroke: var(--seam);
		stroke-width: 1.2px;
		vector-effect: non-scaling-stroke;
		stroke-linejoin: round;
		cursor: pointer;
		transition:
			fill 0.15s,
			opacity 0.3s;
		outline: none;
	}
	/* what the player has learned there: a gold wash, deeper with every street learned */
	.shape.learned {
		fill: color-mix(in srgb, var(--learn-hi) var(--known), var(--learn-lo));
	}
	.shape:hover:not(.soon) {
		fill: color-mix(in srgb, var(--picked) 12%, var(--tile-a));
	}
	.shape:focus-visible {
		stroke: var(--gold);
		stroke-width: 3px;
	}
	/* "Tez orada": the home's quiet tile, faintly hatched, thin borders (where two of them
	   zig-zag along a reservoir, no tangle) */
	.shape.soon {
		cursor: default;
		stroke-width: 0.6px;
		stroke: color-mix(in srgb, var(--seam) 60%, transparent);
	}
	.shape.under {
		stroke: none;
		pointer-events: none;
	}
	.shape.under.soon {
		fill: var(--tile-quiet);
	}
	.hatch-bg {
		fill: var(--tile-quiet);
	}
	.hatch-line {
		stroke: color-mix(in srgb, var(--seam) 22%, transparent);
	}
	/* the hovered place's edge over its neighbours' seams: blue, what a tap does */
	.edge {
		fill: none;
		stroke: var(--picked);
		stroke-width: 2.4px;
		stroke-linejoin: round;
		vector-effect: non-scaling-stroke;
		pointer-events: none;
	}

	/* ---------- towns ---------- */
	.badge {
		cursor: pointer;
		outline: none;
	}
	.badge .hit {
		fill: transparent;
	}
	.badge .disc {
		fill: var(--tg);
		stroke: var(--seam);
		transition: fill 0.15s;
	}
	.badge.learned .disc {
		fill: color-mix(in srgb, var(--learn-hi) var(--known), var(--learn-lo));
	}
	.badge .dot {
		fill: var(--seam);
	}
	.badge:hover .disc,
	.badge:focus-visible .disc {
		stroke: var(--picked);
	}
	.leader {
		stroke: var(--map-line);
		stroke-width: 1.5px;
		vector-effect: non-scaling-stroke;
	}
	.spot {
		fill: var(--map-line);
	}

	/* ---------- names ---------- */
	text {
		font-family: var(--f-text);
		font-weight: 700;
		text-anchor: middle;
		dominant-baseline: middle;
		fill: var(--map-ink);
		stroke: color-mix(in srgb, var(--tile-a) 85%, transparent);
		paint-order: stroke;
		pointer-events: none;
		opacity: 0.88;
		transition: opacity 0.2s;
	}
	text.on {
		opacity: 1;
		font-weight: 800;
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
	/* a town's or a narrow place's name: a milk pill, so it reads over any border and over the
	   ground */
	.label.pill .hit {
		pointer-events: all;
		fill: var(--tile-a);
		stroke: var(--seam);
	}
	/* few panoramas there yet, or none: the name quieter */
	.label.few text {
		fill: var(--map-ink-2);
	}
	.label.soon text {
		fill: var(--map-ink-2);
		stroke: color-mix(in srgb, var(--tile-quiet) 85%, transparent);
	}
	/* flying into a place: the rest fades, the names go (they would grow huge) */
	.flying .shape:not(.target),
	.flying .badge,
	.flying .edge {
		opacity: 0.15;
	}
	.flying text {
		opacity: 0;
	}
	/* under the map: what the mouse is over, or a "Tez orada" place just tapped. It follows the
	   colour around it (the ground here, a panel wherever a screen puts the map on one) */
	.caption {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 12px;
		min-height: 26px;
		font-size: 14px;
		font-weight: 600;
		color: var(--fg-2);
	}
	.caption b {
		font-size: 16px;
		color: var(--fg);
	}
	@media (prefers-reduced-motion: reduce) {
		.world {
			transition: none;
		}
	}
</style>
