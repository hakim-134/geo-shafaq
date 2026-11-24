import { describe, expect, it, vi } from 'vitest';
import { forgetRoom, isCurrentRoom, readCurrentRoom, rememberRoom } from './current-room.js';

function memory() {
	const values = new Map<string, string>();
	return {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => values.set(key, value),
		removeItem: (key: string) => values.delete(key)
	};
}

describe('current room memory', () => {
	it('keeps the most recently joined room and forgets it when the player leaves', () => {
		const storage = memory();
		expect(readCurrentRoom(storage)).toBeNull();
		rememberRoom('ABC23', storage);
		expect(readCurrentRoom(storage)).toBe('ABC23');
		rememberRoom('DEF45', storage);
		expect(readCurrentRoom(storage)).toBe('DEF45');
		forgetRoom('ABC23', storage);
		expect(readCurrentRoom(storage)).toBe('DEF45');
		forgetRoom('DEF45', storage);
		expect(readCurrentRoom(storage)).toBeNull();
	});

	it('ignores invalid codes', () => {
		const storage = memory();
		rememberRoom('ABC01', storage);
		expect(readCurrentRoom(storage)).toBeNull();
		storage.setItem('sg_current_room', 'bad');
		expect(readCurrentRoom(storage)).toBeNull();
	});

	it('handles storage being refused', () => {
		const denied = vi.fn(() => {
			throw new Error('storage refused');
		});
		const storage = { getItem: denied, setItem: denied, removeItem: denied };
		expect(readCurrentRoom(storage)).toBeNull();
		expect(() => rememberRoom('ABC23', storage)).not.toThrow();
		expect(() => forgetRoom('ABC23', storage)).not.toThrow();
	});

	it('reopens a room only if the server says this player belongs and can enter', () => {
		const code = 'ABC23';
		const room = { code, joined: true };
		expect(isCurrentRoom(code, room)).toBe(true);
		expect(isCurrentRoom(code, { ...room, joined: false })).toBe(false);
		expect(isCurrentRoom(code, { ...room, blocked: 'kicked' })).toBe(false);
		expect(isCurrentRoom(code, { ...room, code: 'DEF45' })).toBe(false);
	});
});
