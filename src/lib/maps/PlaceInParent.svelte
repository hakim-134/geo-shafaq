<script module lang="ts">
	// A place's face (P1111 §5): its parent's whole shape, cut into the parent's parts, with the
	// place filled gold. The home's lens is one; later every place in the game wears one.
	// The drawings are the same for everyone and never change while the page lives, so each is
	// fetched once and kept: coming back to a screen draws it at once.
	import { api, call, type Schemas } from '#lib/api/client.js';

	export type Drawing = Schemas['PlaceMap'];

	const drawings = new Map<string, Promise<Drawing>>();

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
	export function trimmed(drawing: Drawing): Drawing {
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
	// parent: whose parts are drawn ("toshkent" draws its 13 districts); fill: the place(s) lit
	// gold; whole: every part lit (the parent is itself the place: Uzbekistan for "Butun
	// O‘zbekiston"); marks: other places as gold points (a ready map of several places); shades:
	// how much gold each part has, 0 to 1 (what the player has learned there); round: the picture
	// fits a circle (a lens), not only its box. A lit place too small to see (Tashkent on the
	// country) gets a ring round it, so the eye finds it.
	// The colours are the caller's to set, as custom properties: --pip-tile, --pip-seam, --pip-on,
	// --pip-edge, --pip-ring, --pip-dot, --pip-dot-line. Unset, it is milk tiles and gold.
	let {
		parent,
		fill = [],
		whole = false,
		marks = [],
		shades = {},
		round = false,
		trim = true
	}: {
		parent: string;
		fill?: string[];
		whole?: boolean;
		marks?: string[];
		shades?: Record<string, number>;
		round?: boolean;
		trim?: boolean;
	} = $props();

	const id = $props.id();
	let drawing = $state<Drawing | null>(null);

	// by what they hold, not by the array: a caller may hand a new one each time
	const markKey = $derived([...marks].sort().join(','));

	$effect(() => {
		const slug = parent;
		const key = markKey;
		placeDrawing(slug, key ? key.split(',') : []).then(
			(d) => {
				if (slug === parent && key === markKey) drawing = trim ? trimmed(d) : d;
			},
			() => {
				/* a picture: without it the space stays quiet */
			}
		);
	});

	const lit = (slug: string) => whole || fill.includes(slug);

	// the frame: the box of the parts, or for a circle the smallest circle around the box's
	// centre that holds every point (so no corner is cut by the ring)
	const frame = $derived.by(() => {
		if (!drawing) return null;
		const pts = drawing.shapes.flatMap((s) => points(s.d));
		const [x0, y0, x1, y1] = boxOf(pts);
		const pad = Math.max(x1 - x0, y1 - y0) * 0.02;
		if (!round)
			return {
				view: `${x0 - pad} ${y0 - pad} ${x1 - x0 + 2 * pad} ${y1 - y0 + 2 * pad}`,
				w: x1 - x0,
				h: y1 - y0
			};
		const cx = (x0 + x1) / 2;
		const cy = (y0 + y1) / 2;
		const r = Math.sqrt(Math.max(...pts.map(([x, y]) => (x - cx) ** 2 + (y - cy) ** 2))) + pad;
		return { view: `${cx - r} ${cy - r} ${2 * r} ${2 * r}`, w: 2 * r, h: 2 * r };
	});

	// a lit place under 6% of the picture: a ring round it, a seventh of the picture across (as
	// the look lab draws it)
	const rings = $derived.by(() => {
		if (!drawing || !frame || whole) return [];
		const size = Math.max(frame.w, frame.h);
		return drawing.shapes
			.filter((s) => fill.includes(s.slug))
			.map((s) => boxOf(points(s.d)))
			.filter((b) => Math.max((b[2] - b[0]) / frame.w, (b[3] - b[1]) / frame.h) < 0.06)
			.map((b) => ({ x: (b[0] + b[2]) / 2, y: (b[1] + b[3]) / 2, r: size * 0.075 }));
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

{#if drawing && frame}
	<svg class="pip" viewBox={frame.view} aria-hidden="true">
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
		{#each drawing.shapes as s (s.slug)}
			<path
				d={s.d}
				class:lit={lit(s.slug)}
				style:fill={lit(s.slug)
					? `var(--pip-on, url(#${id}-gold))`
					: (shade(s.slug) ?? `var(--pip-tile, url(#${id}-tile))`)}
			/>
		{/each}
		<!-- the lit ones again on top, so their gold edge isn't hidden under a neighbour's seam -->
		{#each drawing.shapes.filter((s) => lit(s.slug)) as s (s.slug)}
			<path d={s.d} class="edge" />
		{/each}
		{#each rings as r, i (i)}
			<circle class="ring" cx={r.x} cy={r.y} r={r.r} />
			<circle class="dot" cx={r.x} cy={r.y} r={r.r * 0.42} />
		{/each}
		{#each dots as d, i (i)}
			<circle class="dot" cx={d.x} cy={d.y} r={dotR} />
		{/each}
	</svg>
{/if}

<style>
	.pip {
		display: block;
		width: 100%;
		height: 100%;
		overflow: visible;
	}
	path {
		fill-rule: evenodd; /* a hole is a hole: Tashkent region round the city */
		stroke: var(--pip-seam, var(--seam));
		stroke-width: 1;
		stroke-linejoin: round;
		vector-effect: non-scaling-stroke;
	}
	.edge {
		fill: none;
		stroke: var(--pip-edge, var(--gold-lo));
		stroke-width: 1.6;
	}
	.ring {
		fill: none;
		stroke: var(--pip-ring, var(--gold));
		stroke-width: 2.6;
		vector-effect: non-scaling-stroke;
	}
	.dot {
		fill: var(--pip-dot, var(--gold));
		stroke: var(--pip-dot-line, #fff);
		stroke-width: 1.5;
		vector-effect: non-scaling-stroke;
	}
</style>
