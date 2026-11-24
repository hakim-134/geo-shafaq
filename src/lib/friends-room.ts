// The solo picker can play a zoomed-in place before it is added to the saved list.
import { api, call, ApiError } from '#lib/api/client.js';
import {
	forgetRoom,
	isCurrentRoom,
	readCurrentRoom,
	rememberRoom,
	rememberRoomRounds
} from '#lib/current-room.js';
import { loadChoice, rulesFor, testProviders } from '#lib/rules.js';
import { ensureSession, session } from '#lib/session.svelte.js';

let zoomedMap: string | undefined;
export function setFriendsMap(map: string | undefined) {
	zoomedMap = map;
}

export function takeFriendsMap() {
	const map = zoomedMap;
	zoomedMap = undefined;
	return map ?? loadChoice().map;
}

let opening: { version: number; map: string; room: Promise<string> } | undefined;

export function openFriendsRoom(map: string) {
	const version = session.version;
	if (opening?.version === version && opening.map === map) return opening.room;

	const room = (async () => {
		const me = await ensureSession();
		if (me.user.banned) throw new ApiError('banned', 403);
		const code = readCurrentRoom();
		if (code) {
			try {
				const state = await call(api().GET('/v1/rooms/{code}', { params: { path: { code } } }));
				if (isCurrentRoom(code, state)) return code;
			} catch (e) {
				if (!(e instanceof ApiError && (e.code === 'no_room' || e.status === 404))) throw e;
			}
			forgetRoom(code);
		}
		const choice = loadChoice();
		const state = await call(
			api().POST('/v1/rooms', {
				body: { map, rules: rulesFor(choice, testProviders()) }
			})
		);
		// A room opened by an invite while this request was in flight takes precedence.
		if (session.version === version && !readCurrentRoom()) {
			rememberRoomRounds(state.code, state.you, choice.rounds);
			rememberRoom(state.code);
		}
		return state.code;
	})();
	opening = { version, map, room };
	room.then(clear, clear);
	return room;

	function clear() {
		if (opening?.room === room) opening = undefined;
	}
}
