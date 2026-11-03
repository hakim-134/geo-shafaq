// What a player wears from the shop (PLAN 9.4), for what the game draws itself: the pin and the line to
// the real place. Green stays the real place's, so no skin is green. The looks live
// here; what is for sale, at what price, is the server's (internal/barg).
import { session } from '#lib/session.svelte.js';

const PINS: Record<string, string> = {
	'pin-zar': '#d99a06',
	'pin-anor': '#b3173b',
	'pin-lojuvard': '#1d3f8f'
};

export interface Trail {
	color: string;
	style: string; // Yandex's stroke style
}
const TRAILS: Record<string, Trail> = {
	'trail-zar': { color: '#d99a06', style: 'dash' },
	'trail-lojuvard': { color: '#1d3f8f', style: 'dash' },
	'trail-nuqta': { color: '#ce1126', style: 'dot' }
};

export const pinColor = (id = session.me?.user.prefs?.pin, fallback = '#0099b5') =>
	PINS[id ?? ''] ?? fallback;
export const trailOf = (id = session.me?.user.prefs?.trail): Trail | undefined => TRAILS[id ?? ''];
