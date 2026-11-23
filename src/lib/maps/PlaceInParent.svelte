<script module lang="ts">
	// A place's face (P1111 §5): its parent's whole shape, cut into the parent's parts, with the
	// place filled gold. Wherever a place is named, it wears one: `<PlaceInParent place="…" />`.
	// The drawings are the same for everyone and never change while the page lives, so each is
	// fetched once and kept: coming back to a screen draws it at once.
	import { api, call, type Schemas } from '#lib/api/client.js';

	export type Drawing = Schemas['PlaceMap'];
	export type Face = Schemas['PlaceFace'];

	const drawings = new Map<string, Promise<Drawing>>();
	const faces = new Map<string, Promise<Face>>();

	/** A place's children drawn in one frame (`marks`: other places as points), kept in memory. */
	export function placeDrawing(slug: string, marks: string[] = []): Promise<Drawing> {
		const mark = [...marks].sort().slice(0, 20);
		const key = mark.length ? `${slug}?${mark.join(',')}` : slug;
		let got = drawings.get(key);
		if (!got) {
			got = call(
				api().GET('/v1/places/{slug}/map', {
					params: { path: { slug }, query: mark.length ? { mark } : {} },
					querySerializer: { array: { style: 'form', explode: false } } // mark=a,b, as the spec says
				})
			);
			got.catch(() => drawings.delete(key)); // a failed answer is asked again next time
			drawings.set(key, got);
		}
		return got;
	}

	/** A place's face: its parent's parts in one frame, and which one is the place. Kept. */
	export function placeFace(slug: string): Promise<Face> {
		let got = faces.get(slug);
		if (!got) {
			got = call(api().GET('/v1/places/{slug}/face', { params: { path: { slug } } }));
			got.catch(() => faces.delete(slug)); // asked again next time
			faces.set(slug, got);
		}
		return got;
	}

	/** The pieces of an SVG path ("M … Z M … Z"), each as its own path. */
	export const pieces = (d: string) =>
		d
			.split('M')
			.filter((r) => r.trim())
			.map((r) => `M${r}`);

	/** Every point of an SVG path made of M/L/Z and numbers, as the server draws them. */
	export function points(d: string): [number, number][] {
		const n = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
		const out: [number, number][] = [];
		for (let i = 0; i + 1 < n.length; i += 2) out.push([n[i], n[i + 1]]);
		return out;
	}

	type Box = [number, number, number, number];
	const boxOf = (pts: [number, number][]): Box => [
		Math.min(...pts.map((p) => p[0])),
		Math.min(...pts.map((p) => p[1])),
		Math.max(...pts.map((p) => p[0])),
		Math.max(...pts.map((p) => p[1]))
	];
	const area = (b: Box) => (b[2] - b[0]) * (b[3] - b[1]);
	const meets = (a: Box, b: Box) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

	/** The drawing without the far crumbs (an enclave's dot away from the rest), so the picture
	 * is as big as it can be: each part keeps the pieces that touch the box of all main pieces. */
	export function trimmed<D extends Pick<Drawing, 'shapes'>>(drawing: D): D {
		const main = drawing.shapes.map((s) =>
			pieces(s.d)
				.map((p) => boxOf(points(p)))
				.reduce((a, b) => (area(b) > area(a) ? b : a))
		);
		const all: Box = [
			Math.min(...main.map((b) => b[0])),
			Math.min(...main.map((b) => b[1])),
			Math.max(...main.map((b) => b[2])),
			Math.max(...main.map((b) => b[3]))
		];
		return {
			...drawing,
			shapes: drawing.shapes.map((s) => ({
				...s,
				d: pieces(s.d)
					.filter((p) => meets(boxOf(points(p)), all))
					.join(' ')
			}))
		};
	}
</script>

<script lang="ts">
	// Two ways in:
	// - place: a place's slug, and that is all. The server says what frames it (Jondor in Buxoro
	//   viloyati, Tashkent city in Toshkent viloyati, a region in Uzbekistan, Uzbekistan whole).
	// - parent (the home's lens and the map's corner): whose parts are drawn ("toshkent" draws
	//   its 13 districts); fill: the place(s) lit gold; whole: every part lit; marks: other places
	//   as gold points (a ready map of several places); shades: how much gold each part has, 0 to
	//   1 (what the player has learned there); round: the picture fits a circle (a lens).
	// on: what it lies on. "ground" (the turquoise, and the default): milk tiles; "panel" (a milk
	// panel): by day faint turquoise tiles, the gaps between them the panel itself; by night, on
	// the deep teal panel, milk tiles as on the ground. Either way the place is gold, and a place
	// too small to see at this size (Tashkent on the country, Bektemir at 32 px) gets a gold ring
	// round it, so the eye finds it.
	// Lines get thinner as the picture gets smaller, so a 32 px face is still a shape, not a blot.
	// A caller sets its own colours with custom properties: --pip-tile, --pip-seam, --pip-out
	// (the parent's outline), --pip-on, --pip-edge, --pip-ring, --pip-dot, --pip-dot-line; or
	// `color`, the place (and its ring and dots) in one colour instead of gold: a picked place
	// wears its pick colour (var(--pick-2)).
	// label: the place's name for screen readers; without it the picture is decoration (it
	// stands beside the name).
	let {
		place,
		parent,
		fill = [],
		whole = false,
		marks = [],
		shades = {},
		round = false,
		trim = true,
		on = 'ground',
		color,
		label
	}: {
		place?: string;
		parent?: string;
		fill?: string[];
		whole?: boolean;
		marks?: string[];
		shades?: Record<string, number>;
		round?: boolean;
		trim?: boolean;
		on?: 'ground' | 'panel';
		color?: string;
		label?: string;
	} = $props();
	const deep = $derived(color && `color-mix(in srgb, ${color} 62%, #000)`);

	const id = $props.id();
	// what is drawn, and what of it is lit, as one: a face brings both
	let shown = $state<{ drawing: Drawing; lit: string[]; whole: boolean } | null>(null);
	let w = $state(0);
	let h = $state(0);

	// by what they hold, not by the array: a caller may hand a new one each time
	const markKey = $derived([...marks].sort().join(','));
	const fillKey = $derived(fill.join(','));

	$effect(() => {
		const slug = place;
		const from = parent;
		const key = markKey;
		const lit = fillKey ? fillKey.split(',') : [];
		const all = whole;
		const cut = trim;
		const now = () => slug === place && from === parent && key === markKey;
		if (slug) {
			placeFace(slug).then(
				(f) => {
					if (!now()) return;
					const drawing: Drawing = {
						slug: f.frame.slug,
						width: f.width,
						height: f.height,
						shapes: f.shapes,
						marks: []
					};
					shown = { drawing: cut ? trimmed(drawing) : drawing, lit: [f.slug], whole: f.whole };
				},
				() => {
					/* a picture: without it the space stays quiet */
				}
			);
		} else if (from) {
			placeDrawing(from, key ? key.split(',') : []).then(
				(d) => {
					if (now()) shown = { drawing: cut ? trimmed(d) : d, lit, whole: all };
				},
				() => {}
			);
		}
	});

	const drawing = $derived(shown?.drawing ?? null);
	const lit = (slug: string) => !!shown && (shown.whole || shown.lit.includes(slug));

	// the frame: the box of the parts, or for a circle the smallest circle around the box's
	// centre that holds every point (so no corner is cut by the ring)
	const frame = $derived.by(() => {
		if (!drawing || !drawing.shapes.length) return null;
		const pts = drawing.shapes.flatMap((s) => points(s.d));
		const [x0, y0, x1, y1] = boxOf(pts);
		const pad = Math.max(x1 - x0, y1 - y0) * 0.03;
		if (!round)
			return {
				view: `${x0 - pad} ${y0 - pad} ${x1 - x0 + 2 * pad} ${y1 - y0 + 2 * pad}`,
				w: x1 - x0 + 2 * pad,
				h: y1 - y0 + 2 * pad
			};
		const cx = (x0 + x1) / 2;
		const cy = (y0 + y1) / 2;
		const r = Math.sqrt(Math.max(...pts.map(([x, y]) => (x - cx) ** 2 + (y - cy) ** 2))) + pad;
		return { view: `${cx - r} ${cy - r} ${2 * r} ${2 * r}`, w: 2 * r, h: 2 * r };
	});

	// pixels per unit of the drawing as it shows (the picture fits its box, centred), and the
	// picture's size in pixels; before it is measured, as a large one
	const scale = $derived(frame && w && h ? Math.min(w / frame.w, h / frame.h) : 0);
	const px = $derived(frame && scale ? Math.max(frame.w, frame.h) * scale : 160);
	const clamp = (lo: number, v: number, hi: number) => Math.min(hi, Math.max(lo, v));
	// lines by size: at 32 px a half-pixel seam and a pixel of outline, at 120 px and up the full
	// ones. Strokes don't scale with the drawing: these are screen pixels.
	const lines = $derived({
		seam: clamp(0.5, px / 110, 1),
		out: clamp(1, px / 70, 1.75),
		edge: clamp(0.75, px / 75, 1.6),
		ring: clamp(1.5, px / 45, 2.6)
	});

	// a lit place under 5 px on screen (or 6% of the picture): a ring round it, centred on the
	// point well inside it, its radius at least 5 px. Measured by its largest piece: a city with
	// a few far crumbs (Nukus, Samarqand) is as small as its main part. Only a place under 2.5 px
	// gets a dot inside the ring as well; a bigger one shows its own gold shape there.
	const rings = $derived.by(() => {
		if (!drawing || !frame || !shown || shown.whole) return [];
		const size = Math.max(frame.w, frame.h);
		const unit = scale ? 1 / scale : size / 160;
		return drawing.shapes
			.filter((s) => shown!.lit.includes(s.slug))
			.map((s) => {
				const b = pieces(s.d)
					.map((p) => boxOf(points(p)))
					.reduce((a, b) => (area(b) > area(a) ? b : a));
				return { s, b, big: Math.max(b[2] - b[0], b[3] - b[1]) };
			})
			.filter(({ big }) => big / size < 0.06 || big / unit < 5)
			.map(({ s, b, big }) => ({
				x: s.label?.x ?? (b[0] + b[2]) / 2,
				y: s.label?.y ?? (b[1] + b[3]) / 2,
				r: Math.max(size * 0.075, big * 0.9, 5 * unit),
				dot: big / unit < 2.5
			}));
	});

	// the other places as points; a town and the district round it fall on one spot: one dot
	const dots = $derived.by(() => {
		const out: { x: number; y: number }[] = [];
		const near = frame ? Math.max(frame.w, frame.h) * 0.03 : 0;
		for (const m of drawing?.marks ?? [])
			if (!out.some((o) => Math.hypot(o.x - m.x, o.y - m.y) < near)) out.push(m);
		return out;
	});
	const dotR = $derived(frame ? Math.max(frame.w, frame.h) * 0.032 : 0);

	// gold as strong as the share learned: from pale gold (a first street) to full gold. Mixed
	// with a cream, not with the tile, so it stays gold on the night's blue tiles too.
	const shade = (slug: string) => {
		const v = shades[slug] ?? 0;
		if (v <= 0) return undefined;
		const pct = Math.round(30 + 70 * Math.sqrt(Math.min(v, 1)));
		return `color-mix(in srgb, var(--gold) ${pct}%, #fff1c4)`;
	};
</script>

<span
	class="pip at-{on}"
	bind:clientWidth={w}
	bind:clientHeight={h}
	style:--grad-tile="url(#{id}-tile)"
	style:--grad-gold="url(#{id}-gold)"
	style:--w-seam="{lines.seam}px"
	style:--w-out="{lines.out * 2}px"
	style:--w-edge="{lines.edge}px"
	style:--w-ring="{lines.ring}px"
	style:--pip-on={color}
	style:--pip-edge={deep}
	style:--pip-ring={deep}
	style:--pip-dot={color}
	role={label ? 'img' : undefined}
	aria-label={label}
	aria-hidden={label ? undefined : 'true'}
>
	{#if drawing && frame}
		<svg viewBox={frame.view}>
			<defs>
				<linearGradient id="{id}-tile" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0" style:stop-color="var(--tile-a)" />
					<stop offset="1" style:stop-color="var(--tile-b)" />
				</linearGradient>
				<linearGradient id="{id}-gold" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0" style:stop-color="var(--gold-hi)" />
					<stop offset="1" style:stop-color="var(--gold)" />
				</linearGradient>
			</defs>
			<!-- the parent's outline: every part stroked twice as wide underneath, so only the outer
			     half shows round the whole shape (and round a hole that nothing fills) -->
			<g class="out">
				{#each drawing.shapes as s (s.slug)}
					<path d={s.d} />
				{/each}
			</g>
			{#each drawing.shapes as s (s.slug)}
				<path
					d={s.d}
					class="part"
					style:fill={lit(s.slug) ? 'var(--_on)' : (shade(s.slug) ?? 'var(--_tile)')}
				/>
			{/each}
			<!-- the lit ones again on top, so their gold edge isn't hidden under a neighbour's seam -->
			{#each drawing.shapes.filter((s) => lit(s.slug)) as s (s.slug)}
				<path d={s.d} class="edge" />
			{/each}
			{#each rings as r, i (i)}
				<circle class="ring" cx={r.x} cy={r.y} r={r.r} />
				{#if r.dot}<circle class="dot" cx={r.x} cy={r.y} r={r.r * 0.42} />{/if}
			{/each}
			{#each dots as d, i (i)}
				<circle class="dot" cx={d.x} cy={d.y} r={dotR} />
			{/each}
		</svg>
	{/if}
</span>

<style>
	.pip {
		display: block;
		width: 100%;
		height: 100%;
		/* on the ground: milk tiles with teal seams, as the map lies on it */
		--_tile: var(--pip-tile, var(--grad-tile));
		--_seam: var(--pip-seam, var(--seam));
		--_out: var(--pip-out, var(--pip-seam, var(--seam)));
		--_on: var(--pip-on, var(--grad-gold));
		--_edge: var(--pip-edge, var(--gold-lo));
		--_ring: var(--pip-ring, var(--gold-lo));
	}
	/* on a milk panel by day: the tiles a breath of turquoise, the seams the panel itself (so
	   they read as tiles laid with gaps), the outline turquoise. By night the panel is deep teal
	   and teal tiles on it were a gold blob with no shape round it: there the face is drawn as
	   on the ground, milk tiles with teal seams (the defaults above). */
	:global(:root:not([data-theme='dark'])) .pip.at-panel {
		--_tile: var(--pip-tile, color-mix(in srgb, var(--link) 14%, var(--panel)));
		--_seam: var(--pip-seam, var(--panel));
		--_out: var(--pip-out, color-mix(in srgb, var(--link) 80%, var(--panel)));
	}
	svg {
		display: block;
		width: 100%;
		height: 100%;
		overflow: visible;
	}
	path {
		fill-rule: evenodd; /* a hole is a hole: Tashkent region round the city */
		stroke-linejoin: round;
		vector-effect: non-scaling-stroke;
	}
	.out path {
		fill: var(--_out);
		stroke: var(--_out);
		stroke-width: var(--w-out);
	}
	.part {
		stroke: var(--_seam);
		stroke-width: var(--w-seam);
	}
	.edge {
		fill: none;
		stroke: var(--_edge);
		stroke-width: var(--w-edge);
	}
	.ring {
		fill: none;
		stroke: var(--_ring);
		stroke-width: var(--w-ring);
		vector-effect: non-scaling-stroke;
	}
	.dot {
		fill: var(--pip-dot, var(--gold));
		stroke: var(--pip-dot-line, #fff);
		stroke-width: 1.5;
		vector-effect: non-scaling-stroke;
	}
</style>
