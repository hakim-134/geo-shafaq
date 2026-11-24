import type { RoomPlayer, Schemas } from '#lib/api/client.js';
import { t } from '#lib/i18n/index.svelte.js';

type Scorer = Pick<RoomPlayer, 'id' | 'name' | 'avatar'>;

export function fiveKScorers(
	scores: Pick<Schemas['RoomScore'], 'player' | 'score'>[],
	players: Scorer[]
) {
	const ids = new Set(scores.filter((s) => s.score === 5000).map((s) => s.player));
	return players.filter((p) => ids.has(p.id));
}

/** Keep the two names separate so each keeps its avatar and colour in the translated line. */
export function fiveKNames(players: Scorer[], you: string): (Scorer | string)[] {
	const first = players.slice(0, 2);
	const local = players.find((p) => p.id === you);
	if (local && !first.includes(local)) first[1] = local;
	const shown = first.map((p) => (p.id === you ? { ...p, name: t('fiveKYou') } : p));
	if (shown.length < 2) return shown;
	const line = t('fiveKAnd', { a: '{a}', b: '{b}' })
		.split(/(\{[ab]\})/)
		.filter(Boolean)
		.map((part) => (part === '{a}' ? shown[0] : part === '{b}' ? shown[1] : part));
	if (players.length > 2) line.push(` +${players.length - 2}`);
	return line;
}

/** Coordinates in CSS pixels relative to the page. */
export interface BadgeFrame {
	left: number;
	top: number;
	width: number;
	height: number;
	badge?: { x: number; y: number };
}

export function fitMoment(frame: BadgeFrame, width: number, height: number) {
	// Leave room for the slanted digits, shadows and the coin's outer ring.
	const pad = Math.min(10, frame.width / 4, frame.height / 4);
	const scale = Math.min(
		1,
		(frame.width - 2 * pad) / Math.max(1, width),
		(frame.height - 2 * pad) / Math.max(1, height)
	);
	const clamp = (value: number, size: number, extent: number) => {
		const margin = pad + (size * scale) / 2;
		return Math.max(margin, Math.min(value, extent - margin));
	};
	return {
		x: clamp(frame.badge ? frame.badge.x - frame.left : frame.width / 2, width, frame.width),
		y: clamp(frame.badge ? frame.badge.y - frame.top : frame.height / 2, height, frame.height),
		scale
	};
}

/** The same room result can arrive many times, including after a reconnect or page reload. */
export function fiveKVisible(currentRound: () => string | undefined, delay: () => number) {
	const key = $derived(currentRound());
	let visible = $state(false);
	let lastPlayed: string | undefined;
	$effect(() => {
		const round = key;
		visible = false;
		if (!round || round === lastPlayed) return;
		const stored = 'sg_fiveK_' + round;
		try {
			if (sessionStorage.getItem(stored)) return;
		} catch {
			/* Private browsing can deny storage. */
		}
		let end: ReturnType<typeof setTimeout>;
		const play = () => {
			lastPlayed = round;
			try {
				sessionStorage.setItem(stored, '1');
			} catch {
				/* Keep the in-page guard. */
			}
			visible = true;
			end = setTimeout(
				() => (visible = false),
				matchMedia('(prefers-reduced-motion: reduce)').matches ? 1800 : 2000
			);
		};
		const wait = delay();
		let start: ReturnType<typeof setTimeout> | undefined;
		if (wait) start = setTimeout(play, wait);
		else play();
		return () => {
			clearTimeout(start);
			clearTimeout(end);
		};
	});
	return () => visible;
}
