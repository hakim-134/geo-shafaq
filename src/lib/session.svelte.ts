// The player. Everyone is a player from the first visit: the API makes a guest (🐼_42) and
// sets the session cookie; nobody is asked to sign in. Signing in (account.svelte.ts) only
// adds a way back from another phone or laptop.
import { api, call, type Me } from '#lib/api/client.js';
import { adoptPrefs } from '#lib/compass.svelte.js';

/** `version` goes up whenever the player on this device changes (signed in, merged, signed
 * out), so pages that show the player's games load them again. */
export const session = $state<{ me: Me | null; version: number }>({ me: null, version: 0 });

let starting: Promise<Me> | null = null;

/** The current player, creating a guest on the first visit. Safe to call often. */
export function ensureSession(): Promise<Me> {
	starting ??= call(api().POST('/v1/session')).then(
		(me) => {
			session.me = me;
			adoptPrefs(me);
			return me;
		},
		(err) => {
			starting = null; // try again next time
			throw err;
		}
	);
	return starting;
}

/** Reloads the stats after a game. */
export async function refreshMe() {
	session.me = await call(api().GET('/v1/me'));
}

/** A new player on this device (after signing in, a merge, or signing out). */
export function setMe(me: Me | null) {
	session.me = me;
	if (me) adoptPrefs(me);
	starting = me ? Promise.resolve(me) : null;
	session.version++;
}
