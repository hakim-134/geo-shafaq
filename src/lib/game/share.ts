// Sharing a finished game: a link to it on the game's site, with a few words and a row of
// coloured squares (one per round). Phones with a share sheet get it there (Telegram,
// anything); everywhere else the page opens its own small sheet: the link to copy, and
// Telegram.
import type { Game } from '#lib/api/client.js';
import { siteUrl } from '#lib/config.js';
import { fmtNum } from '#lib/format.js';
import { t, tx } from '#lib/i18n/index.svelte.js';

const square = (score: number) => (score >= 4000 ? '🟩' : score >= 2500 ? '🟨' : '🟥');

export interface Share {
	url: string;
	text: string;
}

export function gameShare(game: Game): Share {
	const squares = game.rounds
		.filter((r) => r.result)
		.map((r) => square(r.result!.score))
		.join('');
	return {
		url: siteUrl(`/game/${game.id}`),
		text: [t('shareText', { map: tx(game.map.name), score: fmtNum(game.total) }), squares]
			.filter(Boolean)
			.join('\n')
	};
}

/** The phone's share sheet; false when there is none (or no https), so the page shows its own. */
export async function nativeShare(s: Share): Promise<boolean> {
	if (!navigator.share || !window.isSecureContext) return false;
	try {
		await navigator.share({ title: 'Shafaq Geo', text: s.text, url: s.url });
	} catch (e) {
		if ((e as Error).name !== 'AbortError') return false;
	}
	return true;
}

export const telegramShare = (s: Share) =>
	`https://t.me/share/url?url=${encodeURIComponent(s.url)}&text=${encodeURIComponent(s.text)}`;

/** Copies text; works on plain http too (the laptop's LAN address), where the clipboard API is off. */
export async function copyText(text: string): Promise<boolean> {
	try {
		if (navigator.clipboard && window.isSecureContext) {
			await navigator.clipboard.writeText(text);
			return true;
		}
	} catch {
		/* the old way below */
	}
	const area = document.createElement('textarea');
	area.value = text;
	area.setAttribute('readonly', '');
	area.style.position = 'fixed';
	area.style.opacity = '0';
	document.body.appendChild(area);
	area.select();
	let ok = false;
	try {
		ok = document.execCommand('copy');
	} catch {
		ok = false;
	}
	area.remove();
	return ok;
}
