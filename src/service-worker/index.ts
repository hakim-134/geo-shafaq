// The PWA shell: the game's own files are cached so it opens fast on mobile data. The API,
// panoramas and the map (Yandex) always come from the network (game state lives on the server).
import { immutable, assets } from '$app/manifest';
import { version } from '$app/env';
import { self as sw } from '$app/service-worker';

const CACHE = `shell-${version}`;
// '/' is the single-page app itself (the adapter's fallback page)
const SHELL = ['/', ...immutable.map((f) => f.path), ...assets.map((f) => f.path)];

sw.addEventListener('install', (event) => {
	event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
	);
});

sw.addEventListener('fetch', (event) => {
	const url = new URL(event.request.url);
	if (event.request.method !== 'GET' || url.origin !== location.origin) return;
	event.respondWith(
		(async () => {
			const cache = await caches.open(CACHE);
			// Built files come from the cache (each build names them anew). The page itself comes
			// from the network first, so a new version shows on the next load, not after every
			// tab is closed.
			if (url.pathname !== '/' && SHELL.includes(url.pathname)) {
				const hit = await cache.match(url.pathname);
				if (hit) return hit;
			}
			try {
				return await fetch(event.request);
			} catch {
				// offline: any page is the single-page app
				return (await cache.match('/')) ?? Response.error();
			}
		})()
	);
});
