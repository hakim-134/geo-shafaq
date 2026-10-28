// A live room on this page. The server sends the room's state over a WebSocket after every
// change; the page's actions are plain requests that also answer with the state. Both
// survive the server going away for a moment (a deploy): the socket reconnects by itself,
// and an action is tried again until the server answers.
import { api, call, ApiError, type RoomState } from '#lib/api/client.js';
import { apiUrl } from '#lib/config.js';

/** Why the room is over for this page: kicked, left, closed, no_room, room_full. */
export type Gone = 'kicked' | 'left' | 'closed' | 'no_room' | 'room_full';

/** The room this page's player just opened with a tap: its lobby offers the invite at once. */
export const justMade = { code: '', at: 0 };

export class RoomLink {
	state = $state<RoomState | null>(null);
	/** The socket is open; false while reconnecting. */
	live = $state(false);
	gone = $state<Gone | null>(null);

	#code: string;
	#ws: WebSocket | null = null;
	#tries = 0;
	#timer: ReturnType<typeof setTimeout> | undefined;
	#stopped = false;

	constructor(code: string) {
		this.#code = code;
	}

	/** The room as the server sees it now (also before joining). */
	async load(): Promise<RoomState> {
		const s = await call(api().GET('/v1/rooms/{code}', { params: { path: { code: this.#code } } }));
		this.take(s);
		return s;
	}

	/** Keeps the newest state: answers and socket messages may cross. */
	take(s: RoomState) {
		if (!this.state || s.ver >= this.state.ver || s.code !== this.state.code) this.state = s;
	}

	connect() {
		this.#stopped = false;
		clearTimeout(this.#timer);
		if (this.#ws && this.#ws.readyState <= WebSocket.OPEN) return;
		const ws = new WebSocket(`${apiUrl().replace(/^http/, 'ws')}/v1/rooms/${this.#code}/live`);
		this.#ws = ws;
		ws.onopen = () => {
			this.live = true;
			this.#tries = 0;
		};
		ws.onmessage = (e) => {
			let m: { t: string; state?: RoomState; reason?: string };
			try {
				m = JSON.parse(e.data);
			} catch {
				return;
			}
			if (m.t === 'state' && m.state) this.take(m.state);
			else if (m.t === 'bye') this.#end((m.reason as Gone) ?? 'closed');
		};
		ws.onclose = (e) => {
			if (this.#ws !== ws) return;
			this.#ws = null;
			this.live = false;
			if (this.#stopped || this.gone) return;
			if (e.code === 4000) return this.#end((e.reason as Gone) || 'closed');
			// 1012: the server restarts; come back at once, then less and less often
			const wait = e.code === 1012 ? 300 : Math.min(400 * 2 ** this.#tries, 4000);
			this.#tries++;
			this.#timer = setTimeout(() => this.#retry(), wait);
		};
	}

	// a socket that will not open may be a room that is gone, or one this player cannot join
	async #retry() {
		if (this.#stopped) return;
		if (this.#tries > 2) {
			try {
				const s = await this.load();
				if (s.blocked) return this.#end(s.blocked as Gone);
			} catch (e) {
				if (e instanceof ApiError && e.code === 'no_room') return this.#end('no_room');
			}
		}
		this.connect();
	}

	#end(reason: Gone) {
		this.gone = reason;
		this.stop();
	}

	/** Reconnects now if the socket is down: the phone woke up, the network came back. */
	wake() {
		if (!this.#stopped && !this.gone && !this.live) {
			this.#tries = 0;
			this.connect();
		}
	}

	stop() {
		this.#stopped = true;
		clearTimeout(this.#timer);
		this.#ws?.close();
		this.#ws = null;
		this.live = false;
	}

	/** An action, tried again while the server is away (up to `patience` ms). */
	async act(fn: () => Promise<RoomState>, patience = 60_000): Promise<RoomState> {
		const until = Date.now() + patience;
		for (;;) {
			try {
				const s = await fn();
				this.take(s);
				return s;
			} catch (e) {
				// the server is away (a deploy: no answer, or the proxy's 502), or busy
				const away =
					e instanceof ApiError &&
					(e.code === 'network' ||
						e.code === 'rate_limited' ||
						(e.code === 'internal' && e.status >= 500));
				if (!away || Date.now() > until) throw e;
				await new Promise((r) => setTimeout(r, 700));
			}
		}
	}
}
