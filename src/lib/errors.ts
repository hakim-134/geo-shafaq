// Errors in players' browsers go to GlitchTip (Sentry's store protocol), so a crash on some
// phone is seen without anyone reporting it. Deliberately tiny instead of the Sentry SDK: it
// would weigh more than the game's own code on mobile data. Off when PUBLIC_GLITCHTIP_DSN is
// empty (development).
import { version } from '$app/env';
import { PUBLIC_GLITCHTIP_DSN } from '$app/env/public';

const MAX_PER_PAGE = 10;

interface Frame {
	function?: string;
	filename?: string;
	lineno?: number;
	colno?: number;
}

/** Chrome's "at fn (url:1:2)" and Firefox/Safari's "fn@url:1:2", innermost frame last. */
export function parseStack(stack: string): Frame[] {
	const frames: Frame[] = [];
	for (const line of stack.split('\n')) {
		const m =
			line.match(/^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/) ??
			line.match(/^(.*?)@(.+?):(\d+):(\d+)$/);
		if (m) frames.push({ function: m[1] || '?', filename: m[2], lineno: +m[3], colno: +m[4] });
	}
	return frames.reverse();
}

/** The DSN https://key@host/project as the store endpoint, or null when it is not one. */
export function storeUrl(dsn: string): string | null {
	try {
		const u = new URL(dsn);
		const project = u.pathname.replace(/^\/|\/$/g, '');
		if (!u.username || !project) return null;
		return `${u.protocol}//${u.host}/api/${project}/store/?sentry_version=7&sentry_key=${u.username}`;
	} catch {
		return null;
	}
}

export function watchErrors() {
	const url = storeUrl(PUBLIC_GLITCHTIP_DSN ?? '');
	if (!url) return;
	let sent = 0;
	const seen = new Set<string>();

	const report = (err: unknown) => {
		const e = err instanceof Error ? err : new Error(String(err));
		const key = `${e.name}: ${e.message}`;
		if (sent >= MAX_PER_PAGE || seen.has(key)) return;
		seen.add(key);
		sent++;
		const event = {
			event_id: crypto.randomUUID().replaceAll('-', ''),
			timestamp: Date.now() / 1000,
			platform: 'javascript',
			level: 'error',
			release: version,
			environment: location.hostname,
			exception: {
				values: [
					{ type: e.name, value: e.message, stacktrace: { frames: parseStack(e.stack ?? '') } }
				]
			},
			request: { url: location.href, headers: { 'User-Agent': navigator.userAgent } }
		};
		// text/plain: no CORS preflight; GlitchTip reads the JSON anyway
		fetch(url, { method: 'POST', body: JSON.stringify(event), keepalive: true }).catch(() => {});
	};

	addEventListener('error', (ev) => report(ev.error ?? ev.message));
	addEventListener('unhandledrejection', (ev) => report(ev.reason));
}
