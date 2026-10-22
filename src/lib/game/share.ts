// Sharing a finished game: one tap. Phones get the share sheet with a picture (Telegram,
// Instagram), computers copy the picture; anything else downloads it, and if a picture
// cannot be made the text goes.
import type { Game, RoundResult } from '#lib/api/client.js';
import { fmtNum } from '#lib/format.js';
import { t, tx } from '#lib/i18n/index.svelte.js';
import { showToast } from '#lib/toast.svelte.js';

const square = (score: number) => (score >= 4000 ? '🟩' : score >= 2000 ? '🟨' : '🟥');

export function resultText(game: Game, label: (r: RoundResult) => string): string {
	const lines = game.rounds
		.filter((r) => r.result)
		.map((r) => `${square(r.result!.score)} ${label(r.result!)} — ${fmtNum(r.result!.score)}`);
	return [
		`Shafaq Geo — ${tx(game.map.name)}`,
		`${t('total')}: ${fmtNum(game.total)} / ${fmtNum(game.max)}`,
		...lines,
		`${location.origin}/game/${game.id}`
	].join('\n');
}

export async function shareResult(game: Game, label: (r: RoundResult) => string) {
	const text = resultText(game, label);
	let blob: Blob | null = null;
	try {
		blob = await drawCard(game, label);
	} catch (e) {
		console.warn('share card', e);
	}
	const file = blob && new File([blob], 'shafaq-geo.png', { type: 'image/png' });

	try {
		if (
			file &&
			navigator.canShare?.({ files: [file] }) &&
			matchMedia('(pointer: coarse)').matches
		) {
			await navigator.share({ files: [file], text });
			return;
		}
		if (blob && window.ClipboardItem && navigator.clipboard?.write && window.isSecureContext) {
			await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
			showToast(t('copied'));
			return;
		}
		if (navigator.share) {
			await navigator.share({ text });
			return;
		}
		await navigator.clipboard.writeText(text);
		showToast(t('copied'));
	} catch (e) {
		if ((e as Error).name === 'AbortError') return; // the player closed the share sheet
		if (blob) download(blob);
		else showToast(t('err_other'));
	}
}

function download(blob: Blob) {
	const a = document.createElement('a');
	a.href = URL.createObjectURL(blob);
	a.download = 'shafaq-geo.png';
	a.click();
	setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

/** The share card: 1080×1350 (a phone post), the game's colours, every round's place. */
async function drawCard(game: Game, label: (r: RoundResult) => string): Promise<Blob> {
	await document.fonts.ready;
	const W = 1080;
	const H = 1350;
	const c = document.createElement('canvas');
	c.width = W;
	c.height = H;
	const g = c.getContext('2d')!;

	const bg = g.createLinearGradient(0, 0, W, H);
	bg.addColorStop(0, '#13233f');
	bg.addColorStop(1, '#1c3157');
	g.fillStyle = bg;
	g.fillRect(0, 0, W, H);
	const glow = g.createRadialGradient(W * 0.85, H * 0.25, 0, W * 0.85, H * 0.25, W * 0.8);
	glow.addColorStop(0, 'rgba(43,183,211,0.28)');
	glow.addColorStop(1, 'rgba(43,183,211,0)');
	g.fillStyle = glow;
	g.fillRect(0, 0, W, H);

	// the flag band
	const band: [string, number][] = [
		['#0099b5', 14],
		['#ce1126', 4],
		['#ffffff', 10],
		['#ce1126', 4],
		['#1eb53a', 14]
	];
	let y = 0;
	for (const [color, h] of band) {
		g.fillStyle = color;
		g.fillRect(0, y, W, h);
		y += h;
	}

	const mark = await image('/mark.svg');
	g.drawImage(mark, 72, 100, 84, 84);
	g.fillStyle = '#fff';
	g.font = '800 54px Unbounded, sans-serif';
	g.fillText('Shafaq', 176, 160);
	const w1 = g.measureText('Shafaq').width;
	g.fillStyle = '#2bb7d3';
	g.fillText('Geo', 176 + w1, 160);

	g.fillStyle = 'rgba(255,255,255,0.7)';
	g.font = '600 34px Onest, sans-serif';
	g.fillText(tx(game.map.name), 72, 290);
	g.fillStyle = '#fff';
	g.font = '800 128px Unbounded, sans-serif';
	g.fillText(fmtNum(game.total), 72, 430);
	g.fillStyle = 'rgba(255,255,255,0.6)';
	g.font = '600 38px Onest, sans-serif';
	g.fillText(`/ ${fmtNum(game.max)}`, 80, 490);

	// the score bar
	g.fillStyle = 'rgba(255,255,255,0.16)';
	roundRect(g, 72, 530, W - 144, 18, 9);
	const fill = g.createLinearGradient(72, 0, W - 72, 0);
	fill.addColorStop(0, '#2bb7d3');
	fill.addColorStop(1, '#36c853');
	g.fillStyle = fill;
	roundRect(g, 72, 530, Math.max((W - 144) * (game.total / game.max), 18), 18, 9);

	const rounds = game.rounds.filter((r) => r.result);
	const rowH = Math.min(78, (H - 700) / Math.max(rounds.length, 1));
	y = 640;
	for (const r of rounds) {
		const res = r.result!;
		g.fillStyle = res.score >= 4000 ? '#36c853' : res.score >= 2000 ? '#e0b44e' : '#f04157';
		roundRect(g, 72, y - rowH * 0.42, rowH * 0.5, rowH * 0.5, 8);
		g.fillStyle = '#fff';
		g.font = `500 ${Math.round(rowH * 0.42)}px Onest, sans-serif`;
		g.fillText(ellipsis(g, label(res), W - 420), 72 + rowH * 0.75, y);
		g.font = `700 ${Math.round(rowH * 0.42)}px Unbounded, sans-serif`;
		const s = fmtNum(res.score);
		g.fillText(s, W - 72 - g.measureText(s).width, y);
		y += rowH;
	}

	g.fillStyle = 'rgba(255,255,255,0.55)';
	g.font = '600 32px Onest, sans-serif';
	g.fillText(location.host, 72, H - 72);

	return new Promise((resolve, reject) =>
		c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/png')
	);
}

function roundRect(
	g: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	r: number
) {
	g.beginPath();
	g.roundRect(x, y, w, h, r);
	g.fill();
}

function ellipsis(g: CanvasRenderingContext2D, s: string, max: number): string {
	if (g.measureText(s).width <= max) return s;
	while (s.length > 1 && g.measureText(s + '…').width > max) s = s.slice(0, -1);
	return s + '…';
}

function image(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = reject;
		img.src = src;
	});
}
