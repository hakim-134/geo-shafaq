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
