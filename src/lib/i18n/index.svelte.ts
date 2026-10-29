// The current language and the translate functions. Uzbek is the default.
import { langs, strings, type Key, type Lang } from './strings';
import type { Text } from '#lib/api/client.js';
import { load, save } from '#lib/storage.js';

export const i18n = $state({ lang: initial() });

function initial(): Lang {
	const saved = load('lang', '');
	return (langs as string[]).includes(saved) ? (saved as Lang) : 'uz';
}

export function setLang(lang: Lang) {
	i18n.lang = lang;
	save('lang', lang);
	document.documentElement.lang = lang;
}

/** A game string, with {name} placeholders filled in. A string with forms split by "|"
 * picks one by the number n: English "one|other", Russian "one|few|many". {nth} is n as
 * English says a place: 1st, 2nd, 3rd, 4th. */
export function t(key: Key, vars?: Record<string, string | number>): string {
	let s = strings[i18n.lang][key] ?? strings.uz[key] ?? key;
	if (s.includes('|')) s = plural(s.split('|'), Number(vars?.n ?? 0));
	if (s.includes('{nth}')) s = s.replace('{nth}', nth(Number(vars?.n ?? 0)));
	if (vars)
		for (const [k, v] of Object.entries(vars))
			s = s.replace(`{${k}}`, typeof v === 'number' ? groupDigits(v) : v);
	return s;
}

/** A name from the API in the current language. */
export function tx(text: Text | undefined | null): string {
	if (!text) return '';
	return text[i18n.lang] || text.uz;
}

export type { Key, Lang };
export { langs };

function plural(forms: string[], n: number): string {
	if (i18n.lang === 'ru' && forms.length === 3) {
		const d = n % 10,
			dd = n % 100;
		if (d === 1 && dd !== 11) return forms[0];
		if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return forms[1];
		return forms[2];
	}
	return n === 1 ? forms[0] : forms[forms.length - 1];
}

function nth(n: number): string {
	const end = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
	return `${n}${end}`;
}

/** 12 345, as format.fmtNum (which needs t, so it cannot be imported here). */
const groupDigits = (n: number) => Math.round(n).toLocaleString('en-US').replace(/,/g, ' ');
