import type { RoomState } from '#lib/api/client.js';
import { loadJSON, saveJSON } from '#lib/storage.js';

type RoomStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const key = 'sg_current_room';
const changed = 'currentroomchange';
const roomCode = /^[A-Z2-9]{5}$/;

export function readCurrentRoom(storage?: RoomStorage): string | null {
	try {
		const code = (storage ?? window.localStorage).getItem(key);
		return code && roomCode.test(code) ? code : null;
	} catch {
		return null;
	}
}

export function rememberRoom(code: string, storage?: RoomStorage) {
	if (!roomCode.test(code)) return;
	try {
		if (readCurrentRoom(storage) === code) return;
		(storage ?? window.localStorage).setItem(key, code);
		if (!storage) window.dispatchEvent(new Event(changed));
	} catch {
		/* private storage may be unavailable */
	}
}

export function forgetRoom(code: string, storage?: RoomStorage) {
	try {
		if (readCurrentRoom(storage) !== code) return;
		(storage ?? window.localStorage).removeItem(key);
		if (!storage) window.dispatchEvent(new Event(changed));
	} catch {
		/* private storage may be unavailable */
	}
}

export function watchCurrentRoom(update: () => void) {
	function onStorage(event: StorageEvent) {
		if (event.key === key || event.key === null) update();
	}
	window.addEventListener(changed, update);
	window.addEventListener('storage', onStorage);
	return () => {
		window.removeEventListener(changed, update);
		window.removeEventListener('storage', onStorage);
	};
}

export function isCurrentRoom(code: string, state: Pick<RoomState, 'code' | 'joined' | 'blocked'>) {
	return state.code === code && state.joined && !state.blocked;
}

// The host's preference survives visits to short maps and other tabs.
export function rememberRoomRounds(code: string, player: string, rounds: number) {
	saveJSON('room_rounds', { code, player, rounds });
}

export function readRoomRounds(code: string, player: string) {
	const saved = loadJSON<{ code: string; player: string; rounds?: number }>('room_rounds', {
		code: '',
		player: ''
	});
	if (saved.code === code && saved.player === player && typeof saved.rounds === 'number')
		return saved.rounds;
}
