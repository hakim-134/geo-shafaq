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

/** A game string, with {name} placeholders filled in. */
export function t(key: Key, vars?: Record<string, string | number>): string {
	let s = strings[i18n.lang][key] ?? strings.uz[key] ?? key;
	if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
	return s;
}

/** A name from the API in the current language. */
export function tx(text: Text | undefined | null): string {
	if (!text) return '';
	return text[i18n.lang] || text.uz;
}

export type { Key, Lang };
export { langs };
