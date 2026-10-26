// Signing in: Telegram (through the bot, or by itself inside Telegram as a Mini App) and
// Google. A guest who signs in keeps everything; a second device that signs in with the same
// account sees the same games. The server decides what happens (AuthResult); this file shows it.
import {
	api,
	call,
	send,
	ApiError,
	type AppConfig,
	type AuthResult,
	type MergeOffer
} from '#lib/api/client.js';
import { ensureSession, session, setMe } from '#lib/session.svelte.js';
import { showToast } from '#lib/toast.svelte.js';
import { t } from '#lib/i18n/index.svelte.js';

export const account = $state<{
	config: AppConfig | null;
	open: boolean; // the sign-in sheet
	reason: 'link' | 'save'; // "add a way in" from the profile, or "keep your games"
	tg: { code: string; url: string; expires: number } | null;
	tgError: boolean;
	merge: MergeOffer | null; // another account asks to be joined into this one
	busy: boolean;
}>({
	config: null,
	open: false,
	reason: 'save',
	tg: null,
	tgError: false,
	merge: null,
	busy: false
});

let configLoading: Promise<AppConfig | null> | null = null;

export function loadConfig(): Promise<AppConfig | null> {
	configLoading ??= call(api().GET('/v1/config')).then(
		(c) => (account.config = c),
		() => {
			configLoading = null;
			return null;
		}
	);
	return configLoading;
}

export function openSignIn(reason: 'link' | 'save' = 'save') {
	account.reason = reason;
	account.open = true;
	loadConfig();
	prepareTelegram();
	startPolling();
}

export function closeSignIn() {
	account.open = false;
	stopPolling();
}

// ---------- Telegram, through the bot ----------
// The sheet asks for a code as it opens, so the button is a plain link (a link opened
// after a request is blocked as a pop-up on phones). The laptop shows the same link as a QR
// code for the phone's camera. Either way the bot confirms, and this page collects it.

async function prepareTelegram() {
	if (account.tg && account.tg.expires > Date.now() + 60_000) return;
	account.tgError = false;
	try {
		await ensureSession();
		const s = await call(api().POST('/v1/auth/telegram/start'));
		account.tg = { code: s.code, url: s.url, expires: Date.now() + s.expiresIn * 1000 };
	} catch {
		account.tg = null;
		account.tgError = true;
	}
}

let poller: ReturnType<typeof setInterval> | undefined;

function startPolling() {
	stopPolling();
	poller = setInterval(checkTelegram, 2500);
	document.addEventListener('visibilitychange', checkTelegram);
}

function stopPolling() {
	clearInterval(poller);
	poller = undefined;
	document.removeEventListener('visibilitychange', checkTelegram);
}

let checking = false;

async function checkTelegram() {
	const tg = account.tg;
	if (!tg || checking || document.visibilityState === 'hidden') return;
	if (tg.expires < Date.now()) {
		account.tg = null;
		return prepareTelegram();
	}
	checking = true;
	try {
		const res = await call(api().POST('/v1/auth/telegram/check', { body: { code: tg.code } }));
		if (res.status !== 'pending') {
			account.tg = null;
			done(res);
		}
	} catch (e) {
		if (e instanceof ApiError && e.code === 'not_found') {
			account.tg = null;
			prepareTelegram();
		}
	} finally {
		checking = false;
	}
}

// ---------- Telegram Mini App ----------
// Opened inside Telegram (the bot's button), the page gets Telegram's signed data in its
// address (#tgWebAppData=…) and signs in by itself.

export async function signInFromTelegramApp() {
	const data = new URLSearchParams(location.hash.slice(1)).get('tgWebAppData');
	if (!data) return;
	history.replaceState(history.state, '', location.pathname + location.search);
	loadTelegramScript();
	try {
		await ensureSession();
		done(await call(api().POST('/v1/auth/telegram/webapp', { body: { initData: data } })), true);
	} catch {
		/* plays on as a guest */
	}
}

function loadTelegramScript() {
	const s = document.createElement('script');
	s.src = 'https://telegram.org/js/telegram-web-app.js';
	s.onload = () => {
		const tg = (window as unknown as { Telegram?: { WebApp?: { ready(): void; expand(): void } } })
			.Telegram?.WebApp;
		tg?.ready();
		tg?.expand();
	};
	document.head.appendChild(s);
}

// ---------- Google ----------

type GoogleId = {
	accounts: {
		id: {
			initialize(o: { client_id: string; callback: (r: { credential: string }) => void }): void;
			renderButton(el: HTMLElement, o: Record<string, string | number>): void;
		};
	};
};

let googleLoading: Promise<GoogleId> | null = null;

function loadGoogle(): Promise<GoogleId> {
	googleLoading ??= new Promise((resolve, reject) => {
		const s = document.createElement('script');
		s.src = 'https://accounts.google.com/gsi/client';
		s.onload = () => resolve((window as unknown as { google: GoogleId }).google);
		s.onerror = () => {
			googleLoading = null;
			reject(new Error('google script'));
		};
		document.head.appendChild(s);
	});
	return googleLoading;
}

/** Draws Google's own button into el (its rules want their button, not ours). */
export async function googleButton(el: HTMLElement, opts: { dark: boolean; lang: string }) {
	const clientId = account.config?.googleClientId;
	if (!clientId) return;
	const google = await loadGoogle();
	google.accounts.id.initialize({
		client_id: clientId,
		callback: async ({ credential }) => {
			try {
				await ensureSession();
				done(await call(api().POST('/v1/auth/google', { body: { credential } })));
			} catch {
				showToast(t('err_other'));
			}
		}
	});
	google.accounts.id.renderButton(el, {
		theme: opts.dark ? 'filled_black' : 'outline',
		size: 'large',
		shape: 'pill',
		text: 'continue_with',
		width: Math.min(el.clientWidth || 320, 400),
		locale: opts.lang === 'uz' ? 'uz' : opts.lang
	});
}

// ---------- the outcome ----------

function done(res: AuthResult, quiet = false) {
	if (res.status === 'merge' && res.merge) {
		closeSignIn();
		account.merge = res.merge;
		return;
	}
	if (res.me) setMe(res.me);
	closeSignIn();
	if (!quiet) showToast(t(res.status === 'already' ? 'alreadyLinked' : 'signedIn'), 3000);
}

export async function acceptMerge() {
	const offer = account.merge;
	if (!offer || account.busy) return;
	account.busy = true;
	try {
		setMe(await call(api().POST('/v1/auth/merge', { body: { token: offer.token } })));
		account.merge = null;
		showToast(t('merged'), 3000);
	} catch {
		showToast(t('err_other'));
	} finally {
		account.busy = false;
	}
}

export async function unlink(id: string) {
	try {
		setMe(await call(api().POST('/v1/me/identities/unlink', { body: { id } })));
	} catch (e) {
		showToast(
			t(e instanceof ApiError && e.code === 'last_identity' ? 'lastIdentity' : 'err_other')
		);
	}
}

/** Signs out; this device then starts over as a new guest. */
export async function signOut(everywhere: boolean) {
	try {
		await send(api().POST('/v1/auth/logout', { body: { everywhere } }));
	} catch {
		return showToast(t('err_network'));
	}
	setMe(null);
	await ensureSession().catch(() => {});
	session.version++;
}
