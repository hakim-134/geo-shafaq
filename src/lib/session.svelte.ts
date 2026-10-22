// The player. Everyone is a player from the first visit: the API makes a guest (🐼_42) and
// sets the session cookie; nobody is asked to sign in.
import { api, call, type Me } from '#lib/api/client.js';

export const session = $state<{ me: Me | null }>({ me: null });

let starting: Promise<Me> | null = null;

/** The current player, creating a guest on the first visit. Safe to call often. */
export function ensureSession(): Promise<Me> {
	starting ??= call(api().POST('/v1/session')).then(
		(me) => {
			session.me = me;
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
