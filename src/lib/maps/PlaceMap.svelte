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
	// blue, `whole` the whole map edged, `marks` as gold stars with their names. With zoomable a
	// pinch, the wheel, or + and − go close, and a finger or the mouse moves the map: the same
	// places, never the level below. Close up names are laid out again, every place gets one, with
	// panoramas or not: a player learns the shapes and names by looking.
	import type { Schemas } from '#lib/api/client.js';
	import { t, tx } from '#lib/i18n/index.svelte.js';
	import Progress from './Progress.svelte';
	import { fewPlaces, knownTint, shortName } from './progress.js';

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
		zoomable?: boolean; // pinch, drag, the wheel, + and −: go close to read every shape's name
		level?: boolean; // every name stands level; one that can't fit is a pill with a line
		crop?: [number, number, number, number]; // the part of the drawing to show, not the whole
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
		onmark,
		zoomable = false,
		level = false,
		crop
	}: Props = $props();

	const hatch = `hatch-${++maps}`;
	const FONT = 12.5; // a name's size on screen, px
	const BADGE = 11; // a town's dot radius on screen, px

	const pad = $derived(Math.max(drawing.width, drawing.height) * 0.03);
	// the frame: the whole place, its own shape (the owner: "see that region with its tumanlar")
	const vb = $derived.by(() => {
		const [x0, y0, x1, y1] = crop ?? [0, 0, drawing.width, drawing.height];
		return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad };
	});
	let width = $state(0); // the map on screen, px
	let height = $state(0);
	let boxW = $state(0); // the figure around it: a zoomed map uses all of it
	let boxH = $state(0);

	// ---------- going close: the same map, closer. Names are laid out again when it stops ----------
	type View = { x: number; y: number; w: number; h: number };
	let moved = $state.raw<View | null>(null); // where the fingers have it now
	let settled = $state.raw<View | null>(null); // where the names are laid out for
	const view = $derived(moved ?? vb);
	const at = $derived(settled ?? vb);
	const closer = $derived(vb.w / at.w); // 1: the whole place
	const MAX_CLOSER = 12;
	let settleTimer: ReturnType<typeof setTimeout> | undefined;

	/** The view scaled by f around a point of the map, kept on the map. */
	function zoomBy(f: number, ax: number, ay: number) {
		const v = view;
		const w = Math.min(vb.w, Math.max(vb.w / MAX_CLOSER, v.w / f));
		const h = (w * vb.h) / vb.w;
		moveTo(ax - ((ax - v.x) * w) / v.w, ay - ((ay - v.y) * h) / v.h, w, h);
	}
	function moveTo(x: number, y: number, w: number, h: number) {
		const near = w >= vb.w * 0.98; // nearly whole: whole
		moved = near
			? null
			: {
					x: Math.min(vb.x + vb.w - w, Math.max(vb.x, x)),
					y: Math.min(vb.y + vb.h - h, Math.max(vb.y, y)),
					w,
					h
				};
		clearTimeout(settleTimer);
		settleTimer = setTimeout(() => (settled = moved), 130);
	}
	/** A + or − button: glides around the middle of what is on screen. */
	function step(f: number) {
		const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
		const t0 = performance.now();
		const from = view.w;
		const ax = view.x + view.w / 2;
		const ay = view.y + view.h / 2;
		const frame = (now: number) => {
			const e = still ? 1 : Math.min((now - t0) / 220, 1);
			const w = from / f ** (1 - (1 - e) ** 3);
			zoomBy(view.w / w, ax, ay);
			if (e < 1) requestAnimationFrame(frame);
		};
		requestAnimationFrame(frame);
	}

	// the map's point under a place on screen
	let svgEl = $state<SVGSVGElement>();
	function toMap(cx: number, cy: number): [number, number] {
		const r = svgEl!.getBoundingClientRect();
		return [
			view.x + ((cx - r.left) / r.width) * view.w,
			view.y + ((cy - r.top) / r.height) * view.h
		];
	}
	const pointers = new Map<number, [number, number]>();
	let pinch = 0; // the fingers' distance
	let dragged = false; // a drag is no tap
	let downAt: [number, number] = [0, 0];
	function down(e: PointerEvent) {
		if (!zoomable || flying) return;
		pointers.set(e.pointerId, [e.clientX, e.clientY]);
		if (pointers.size === 1) {
			dragged = false;
			downAt = [e.clientX, e.clientY];
		}
		if (pointers.size === 2) pinch = fingers().d;
	}
	const fingers = () => {
		const [[ax, ay], [bx, by]] = [...pointers.values()];
		return { d: Math.hypot(ax - bx, ay - by), x: (ax + bx) / 2, y: (ay + by) / 2 };
	};
	function move(e: PointerEvent) {
		const last = pointers.get(e.pointerId);
		if (!last) return;
		const next: [number, number] = [e.clientX, e.clientY];
		if (pointers.size >= 2) {
			pointers.set(e.pointerId, next);
			const f = fingers();
			if (pinch > 0) {
				const [ax, ay] = toMap(f.x, f.y);
				zoomBy(f.d / pinch, ax, ay);
			}
			pinch = f.d;
			dragged = true;
			return;
		}
		// one finger or the mouse moves the map once it is close, and only then
		if (!moved) return;
		if (!dragged && Math.hypot(next[0] - downAt[0], next[1] - downAt[1]) < 7) return;
		dragged = true;
		const r = svgEl!.getBoundingClientRect();
		const scale = view.w / r.width;
		moveTo(
			view.x - (next[0] - last[0]) * scale,
			view.y - (next[1] - last[1]) * scale,
			view.w,
			view.h
		);
		pointers.set(e.pointerId, next);
	}
	function up(e: PointerEvent) {
		pointers.delete(e.pointerId);
		if (pointers.size < 2) pinch = 0;
		// the click comes right after: it was a drag. Then a tap (or a key) is a tap again
		if (!pointers.size) setTimeout(() => (dragged = false), 60);
	}
	function wheel(e: WheelEvent) {
		if (!moved && e.deltaY > 0) return; // the whole place, wheel down: the page scrolls
		e.preventDefault();
		const [ax, ay] = toMap(e.clientX, e.clientY);
		zoomBy(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002)), ax, ay);
	}
	// two fingers on the map never pinch the page; close up one finger moves the map, not the page.
	// Not on touchstart for one finger: that would take away the tap.
	let figureEl = $state<HTMLElement>();
	$effect(() => {
		if (!zoomable || !figureEl) return;
		const el = figureEl;
		const two = (e: TouchEvent) => {
			if (e.touches.length >= 2) e.preventDefault();
		};
		const moving = (e: TouchEvent) => {
			if (e.touches.length >= 2 || moved) e.preventDefault();
		};
		el.addEventListener('wheel', wheel, { passive: false });
		el.addEventListener('touchstart', two, { passive: false });
		el.addEventListener('touchmove', moving, { passive: false });
		return () => {
			el.removeEventListener('wheel', wheel);
			el.removeEventListener('touchstart', two);
			el.removeEventListener('touchmove', moving);
		};
	});

	const k = $derived(at.w / Math.max(width, 1)); // drawing units per screen px
	// what is on screen: the map's frame, and at close range the free space around it too
	const frame = $derived({
		x: at.x - (closer > 1 ? Math.max(boxW - width, 0) / 2 : 0) * k,
		y: at.y - (closer > 1 ? Math.max(boxH - height, 0) / 2 : 0) * k,
		w: at.w + (closer > 1 ? Math.max(boxW - width, 0) : 0) * k,
		h: at.h + (closer > 1 ? Math.max(boxH - height, 0) : 0) * k
	});

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
		if (closer > 1) return null; // it points from the whole map's empty sky
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
		// close up the + and − stand over the map, in the frame's corner
		if (zoomable && closer > 1)
			taken.push([
				frame.x + frame.w - 60 * k,
				frame.y + frame.h - 134 * k,
				frame.x + frame.w,
				frame.y + frame.h
			]);
		// a name keeps clear of the map's edge, its tap area too; close up, of the soft cut
		const m = (closer > 1 ? 16 : 5) * k;
		const inside = (b: Box) =>
			b[0] >= frame.x + m &&
			b[1] >= frame.y + m &&
			b[2] <= frame.x + frame.w - m &&
			b[3] <= frame.y + frame.h - m;
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
		let paperOnly = false;

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
			// straight above or below, moved in from the map's edge if it must
			const inX = (px: number) =>
				Math.max(frame.x + m + w / 2, Math.min(px, frame.x + frame.w - m - w / 2));
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
		const sight: Box = [frame.x, frame.y, frame.x + frame.w, frame.y + frame.h];
		const order = items
			.filter((it) => overlaps(it.box, sight))
			.sort((a, b) => rank(a) - rank(b) || area(b.box) - area(a.box));
		// close up every place gets its name, big or small, with panoramas or not: that is how
		// a player learns them
		const everyName = closer > 1.3;
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
			if (placeInside(it, text) || (it.card.panoramas === 0 && !everyName)) continue;
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
				const onPaper = beside(it.card.slug, it, text, it.x, it.y, 8 * k, undefined, true);
				paperOnly = false;
				if (onPaper || beside(it.card.slug, it, text, it.x, it.y, 8 * k, undefined, true)) continue;
			}
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
					: it.card.panoramas > 0 || everyName
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
		if (flying || dragged) return;
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
		const s = Math.min(view.w / (x1 - x0), view.h / (y1 - y0)) * 0.9;
		const tx = view.x + (view.w - (x1 - x0) * s) / 2 - x0 * s;
		const ty = view.y + (view.h - (y1 - y0) * s) / 2 - y0 * s;
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

<figure
	class="map"
	class:flying={!!flying}
	class:close={!!moved}
	class:zoomable
	bind:this={figureEl}
	bind:clientWidth={boxW}
	bind:clientHeight={boxH}
	onpointerdown={down}
	onpointermove={move}
	onpointerup={up}
	onpointercancel={up}
	onpointerleave={up}
>
	<svg
		bind:this={svgEl}
		bind:clientWidth={width}
		bind:clientHeight={height}
		style:max-width={`calc(min(560px, 58dvh) * ${vb.w / vb.h})`}
		style:aspect-ratio={`${vb.w} / ${vb.h}`}
		viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
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
					class:few={!!l.it && fewPlaces(l.it.card)}
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
	{#if zoomable}
		<div class="zoom">
			<button aria-label={t('zoomIn')} title={t('zoomIn')} onclick={() => step(1.8)}>
				<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><path d="M6 12h12M12 6v12" /></svg>
			</button>
			<button
				aria-label={t('zoomOut')}
				title={t('zoomOut')}
				disabled={!moved}
				onclick={() => step(1 / 1.8)}
			>
				<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><path d="M6 12h12" /></svg>
			</button>
		</div>
	{/if}
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
	.zoomable {
		touch-action: pan-y;
	}
	/* close up: the map fills its space, cut softly at the top and bottom; no shadow to redraw */
	.close {
		overflow: clip;
		mask-image:
			linear-gradient(to bottom, transparent, #000 12px, #000 calc(100% - 12px), transparent),
			linear-gradient(to right, transparent, #000 12px, #000 calc(100% - 12px), transparent);
		mask-composite: intersect;
	}
	.close {
		touch-action: none;
		cursor: grab;
	}
	.close:active {
		cursor: grabbing;
	}
	.close svg,
	.close .shapes.whole {
		filter: none;
	}
	.close .caption:not(:has(b)) {
		display: none;
	}
	.close .caption {
		position: absolute;
		left: 50%;
		bottom: 8px;
		translate: -50%;
		min-height: 0;
		padding: 2px 12px;
		border-radius: 999px;
		white-space: nowrap;
		background: var(--surface);
	}
	.zoom {
		position: absolute;
		right: 12px;
		bottom: 34px;
		display: flex;
		flex-direction: column;
		gap: 6px;
		z-index: 1;
	}
	.zoom button {
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		border-radius: 12px;
		background: var(--surface);
		border: 1px solid var(--border);
		color: var(--text);
		box-shadow: 0 2px 0 rgba(0, 0, 0, 0.12);
		cursor: pointer;
	}
	.zoom svg {
		width: 22px;
		height: 22px;
		filter: none;
	}
	.zoom button:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.world {
		transform-origin: 0 0;
		transition: transform 0.43s var(--settle);
	}
	.shape {
		fill: color-mix(in srgb, var(--star) var(--known), var(--bg));
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
			color-mix(in srgb, var(--star) var(--known), var(--bg))
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
	.label.few text {
		font-style: italic;
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
		fill: color-mix(in srgb, var(--star) var(--known), var(--surface-2));
		stroke: color-mix(in srgb, var(--sky) 55%, var(--bg));
	}
	:global(:root[data-theme='dark']) .hatch-bg {
		fill: var(--bg);
	}
	:global(:root[data-theme='dark']) .hatch-line {
		stroke: color-mix(in srgb, var(--muted) 18%, transparent);
	}
	/* where the player has been: a gold edge, on the paper and on the night blue */
	.shape.played {
		stroke: var(--gold);
	}
	:global(:root[data-theme='dark']) .shape.played {
		fill: color-mix(in srgb, var(--star) var(--known), var(--surface));
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
		fill: color-mix(in srgb, var(--star) var(--known), var(--surface));
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
