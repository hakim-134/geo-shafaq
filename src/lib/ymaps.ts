// The Yandex Maps JS API 2.1, loaded once per page for both the panoramas and the maps. Its
// language is fixed by the first load; a language change shows in Yandex's own words after a
// reload.
import { yandexKey } from '#lib/config.js';
import { PanoError } from '#lib/pano/types.js';
import type { Lang } from '#lib/i18n/index.svelte.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const ymaps: any;

const LANG = { uz: 'uz_UZ', en: 'en_US', ru: 'ru_RU' } as const;
let loading: Promise<any> | null = null;

export function loadYmaps(lang: Lang): Promise<any> {
	const key = yandexKey();
	if (!key) return Promise.reject(new PanoError('key'));
	loading ??= new Promise<any>((resolve, reject) => {
		const s = document.createElement('script');
		s.src = `https://api-maps.yandex.ru/2.1/?lang=${LANG[lang]}&apikey=${encodeURIComponent(key)}`;
		s.onload = () =>
			ymaps.ready(
				() => resolve(ymaps),
				() => reject(new PanoError('key'))
			);
		// Yandex answers 403 for a bad or used-up key, and the browser then blocks the script
		s.onerror = () => {
			loading = null;
			reject(new PanoError(navigator.onLine === false ? 'network' : 'key'));
		};
		document.head.appendChild(s);
	});
	return loading;
}
