// Light and dark. The saved choice wins; otherwise the phone's setting. app.html applies it
// before the first paint, so there is no flash.
import { load, save } from '#lib/storage.js';

type Theme = 'light' | 'dark';

export const theme = $state({ value: current() });

function current(): Theme {
	if (typeof document === 'undefined') return 'light';
	return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function toggleTheme() {
	theme.value = theme.value === 'dark' ? 'light' : 'dark';
	document.documentElement.dataset.theme = theme.value;
	save('theme', theme.value);
}

export const savedTheme = () => load('theme', '');
