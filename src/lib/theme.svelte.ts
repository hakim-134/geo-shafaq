// Light and dark. The saved choice wins; otherwise the phone's setting. app.html applies it
// before the first paint, so there is no flash.
import { load, save } from '#lib/storage.js';

type Theme = 'light' | 'dark';

export const theme = $state({ value: current() });

function current(): Theme {
	if (typeof document === 'undefined') return 'light';
	return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

// the phone's own bar takes the ground's top colour (app.html sets it before the first paint)
const BAR = { light: '#0d808d', dark: '#0c3b43' };

export function setTheme(t: Theme) {
	theme.value = t;
	document.documentElement.dataset.theme = t;
	document
		.querySelector<HTMLMetaElement>('meta[name=theme-color]')
		?.setAttribute('content', BAR[t]);
	save('theme', t);
}

export const toggleTheme = () => setTheme(theme.value === 'dark' ? 'light' : 'dark');

export const savedTheme = () => load('theme', '');
