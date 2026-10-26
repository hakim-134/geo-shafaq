// The compass style is the player's own: classic (red north), modern (a strip, as in
// GeoGuessr) or mnemonic (a picture on each side). It is kept on the player's account, so every
// device gets it, and on the device for the first paint. Whether there is a compass at all is
// a rule of the game (hard games have none).
import { api, call, type Me } from '#lib/api/client.js';
import { load, save } from '#lib/storage.js';

export type CompassStyle = 'classic' | 'modern' | 'mnemonic';
export const COMPASS_STYLES: CompassStyle[] = ['classic', 'modern', 'mnemonic'];

/** The mnemonic compass's pictures. To change one, change it here: the settings' note shows
 *  these too. West: 🌵 for now; 🤠 is the other candidate (the owner, 2026-10-26). */
export const MNEMONIC = { n: '🐻‍❄️', e: '☀️', s: '🐧', w: '🌵' };

const saved = load('compass', '') as CompassStyle | '';
export const compass = $state<{ style: CompassStyle }>({
	style: COMPASS_STYLES.includes(saved as CompassStyle) ? (saved as CompassStyle) : 'classic'
});

export function setCompassStyle(s: CompassStyle) {
	compass.style = s;
	save('compass', s);
	saveToAccount(s);
}

/** The next style, for a tap on the compass during a game. */
export function nextCompassStyle(): CompassStyle {
	const s = COMPASS_STYLES[(COMPASS_STYLES.indexOf(compass.style) + 1) % COMPASS_STYLES.length];
	setCompassStyle(s);
	return s;
}

// a few quick taps on the compass make one save
let timer: ReturnType<typeof setTimeout> | undefined;
function saveToAccount(s: CompassStyle) {
	clearTimeout(timer);
	timer = setTimeout(() => {
		call(api().POST('/v1/me/prefs', { body: { compass: s } })).catch(() => {
			/* offline: the device keeps it, and sends it with the next change */
		});
	}, 600);
}

/** When the player is known (a visit, a sign-in): the account's style wins; a style chosen
 *  on this device before the account had one is saved to it. */
export function adoptPrefs(me: Me) {
	const s = me.user.prefs?.compass;
	if (s) {
		compass.style = s;
		save('compass', s);
	} else if (saved || load('compass', '')) {
		saveToAccount(compass.style);
	}
}
