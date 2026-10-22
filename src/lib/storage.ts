// The player's conveniences on this device (language, theme, last settings). Never game
// state: that lives on the server. Private windows may refuse storage; then nothing is kept.
const PREFIX = 'sg_';

export function load(key: string, fallback: string): string {
	try {
		return localStorage.getItem(PREFIX + key) ?? fallback;
	} catch {
		return fallback;
	}
}

export function save(key: string, value: string) {
	try {
		localStorage.setItem(PREFIX + key, value);
	} catch {
		/* storage refused: the setting lasts until the page closes */
	}
}

export function loadJSON<T>(key: string, fallback: T): T {
	try {
		return { ...fallback, ...JSON.parse(load(key, 'null')) };
	} catch {
		return fallback;
	}
}

export const saveJSON = (key: string, value: unknown) => save(key, JSON.stringify(value));
