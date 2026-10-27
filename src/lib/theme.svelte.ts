// Light and dark. The saved choice wins; otherwise the phone's setting. app.html applies it
// before the first paint, so there is no flash.
import { load, save } from '#lib/storage.js';

type Theme = 'light' | 'dark';

export const theme = $state({ value: current() });

function current(): Theme {
	if (typeof document === 'undefined') return 'light';
	return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function setTheme(t: Theme) {
	theme.value = t;
	document.documentElement.dataset.theme = t;
	save('theme', t);
}

export const toggleTheme = () => setTheme(theme.value === 'dark' ? 'light' : 'dark');

export const savedTheme = () => load('theme', '');
