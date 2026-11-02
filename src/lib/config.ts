// Where things are. The domains are temporary (the owner hasn't decided); this is the only
// file in the game that names them. The API's own list is WEB_ORIGINS in api-geo-shafaq.
import { PUBLIC_API_URL, PUBLIC_YANDEX_KEY } from '$app/env/public';

const WEB_HOST = 'geo.shafaq.uz';
const API_URL = 'https://api.geo.shafaq.uz';

/** The API: api.geo.shafaq.uz on the site, the same host on port 8131 anywhere else (a laptop, a LAN address). */
export function apiUrl(): string {
	if (PUBLIC_API_URL) return PUBLIC_API_URL.replace(/\/$/, '');
	if (location.hostname === WEB_HOST) return API_URL;
	return `${location.protocol}//${location.hostname}:8131`;
}

export const yandexKey = (): string => PUBLIC_YANDEX_KEY ?? '';
