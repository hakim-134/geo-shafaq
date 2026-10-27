import { t } from '#lib/i18n/index.svelte.js';

/** 12 345 — a thin space between thousands, as in Uzbek and Russian. */
export function fmtNum(n: number): string {
	return Math.round(n).toLocaleString('en-US').replace(/,/g, ' ');
}

export function fmtDistance(km: number): string {
	if (km < 1) return `${Math.round(km * 1000)} ${t('m')}`;
	if (km < 10) return `${km.toFixed(1)} ${t('km')}`;
	return `${fmtNum(km)} ${t('km')}`;
}

export function fmtClock(seconds: number): string {
	const s = Math.max(Math.ceil(seconds), 0);
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function verdictKey(score: number) {
	if (score >= 4900) return 'perfect' as const;
	if (score >= 4000) return 'great' as const;
	if (score >= 2500) return 'good' as const;
	if (score >= 1000) return 'ok' as const;
	return 'far' as const;
}

/** "bugun", "kecha", or the date: 26.10 (this year) or 26.10.2025. */
export function fmtDay(iso: string): string {
	const d = new Date(iso);
	const now = new Date();
	const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
	const diff = Math.round((day(now) - day(d)) / 86_400_000);
	if (diff === 0) return t('today');
	if (diff === 1) return t('yesterday');
	const dm = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
	return d.getFullYear() === now.getFullYear() ? dm : `${dm}.${d.getFullYear()}`;
}

/** The month and year someone joined: "oktabr 2026". Browsers have no Uzbek month names. */
export function fmtMonth(iso: string, lang: string): string {
	const d = new Date(iso);
	if (lang === 'uz') return `${UZ_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
	return d.toLocaleDateString(lang, { month: 'long', year: 'numeric' });
}

const UZ_MONTHS = [
	'yanvar',
	'fevral',
	'mart',
	'aprel',
	'may',
	'iyun',
	'iyul',
	'avgust',
	'sentabr',
	'oktabr',
	'noyabr',
	'dekabr'
];

/** A guest's name already starts with its emoji (🐼_42): don't put the avatar next to it. */
export const nameHasAvatar = (u: { name: string; avatar: string }) => u.name.startsWith(u.avatar);

/** Stars for a round (0–3), the reward a child reads at a glance: 1 000, 2 500, 4 000 points. */
export function starsFor(score: number): number {
	return score >= 4000 ? 3 : score >= 2500 ? 2 : score >= 1000 ? 1 : 0;
}
