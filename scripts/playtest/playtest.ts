// The playtest: plays the game the way a stranger does, on demo panoramas, and saves a
// screenshot of every screen for the steve-jobs review (_geoshafaq_claude/skills/steve-jobs).
//
//   npm run playtest                                  all journeys, phone and laptop, light + dark
//   npm run playtest -- --views phone-light --only solo
//   npm run playtest -- --url http://10.42.0.1:8130 --out /tmp/pt
//
// Journeys: solo (first visit → a game with a hint → the end → home again → share), room (a
// host and a friend, each in their own browser, play a room on "O‘rta" to its end; the friend
// takes a hint; the rounds go on by the ring, "Hozir", and a hold), places (the place picker → a district → a game there).
//
// Chrome runs headless with --disable-gpu (local.md §3) and a throwaway profile deleted at the
// end, so the demo switch never reaches the owner's own Chrome. Screenshots, steps.json (the
// taps, seconds and words per screen) and the page errors go to --out.
//
// When a screen changes, keep the journey working: the steps find things by what a player
// sees first (text, role), by class only where there is no text.

import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import puppeteer, { type Browser, type ElementHandle, type Page } from 'puppeteer-core';

const { values: args } = parseArgs({
	options: {
		url: { type: 'string', default: 'http://localhost:8130' },
		out: { type: 'string', default: 'scripts/playtest/out' },
		views: { type: 'string', default: 'phone-light,phone-dark,laptop,laptop-dark' },
		only: { type: 'string', default: 'solo,room,places' },
		chrome: { type: 'string', default: process.env.CHROME ?? '/usr/bin/google-chrome' }
	}
});

interface View {
	name: string;
	width: number;
	height: number;
	phone: boolean;
	dark: boolean;
}

const VIEWS: Record<string, View> = {
	'phone-light': { name: 'phone-light', width: 390, height: 844, phone: true, dark: false },
	'phone-dark': { name: 'phone-dark', width: 390, height: 844, phone: true, dark: true },
	laptop: { name: 'laptop', width: 1366, height: 800, phone: false, dark: false },
	'laptop-dark': { name: 'laptop-dark', width: 1366, height: 800, phone: false, dark: true }
};

const PHONE_UA =
	'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36';

// The room plays "O‘rta" (hints cost 20%), three rounds: the setting where a hint's cost shows.
const ROOM_CHOICE = {
	map: 'tashkent-streets',
	preset: 'normal',
	rounds: 3,
	timeSec: 0,
	hints: { count: 1, per: 'round', kind: 'region', cost: 0.2 },
	movement: 'move',
	compass: true
};

interface Step {
	view: string;
	journey: string;
	file: string;
	url: string;
	sec: number; // since the journey began
	taps: number; // the player's taps since the journey began
	buttons: number; // buttons and links in sight
	words: number; // words in sight
	note?: string;
}

const steps: Step[] = [];
const problems: string[] = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One player: their own browser (cookies, storage), their own page. */
class Player {
	page!: Page;
	taps = 0;
	t0 = Date.now();
	lastTap = Date.now();
	n = 0;
	readonly view: View;
	readonly who: string;
	readonly dir: string;

	constructor(view: View, who: string, dir: string) {
		this.view = view;
		this.who = who;
		this.dir = dir;
	}

	async open(browser: Browser, storage: Record<string, string> = {}) {
		const ctx = await browser.createBrowserContext();
		this.page = await ctx.newPage();
		const v = this.view;
		await this.page.setViewport({
			width: v.width,
			height: v.height,
			deviceScaleFactor: v.phone ? 2 : 1,
			isMobile: v.phone,
			hasTouch: v.phone
		});
		if (v.phone) await this.page.setUserAgent({ userAgent: PHONE_UA });
		await this.page.emulateMediaFeatures([
			{ name: 'prefers-color-scheme', value: v.dark ? 'dark' : 'light' }
		]);
		// demo panoramas, the theme; set once, so the game's own changes stay
		const init = { sg_test_providers: 'demo', sg_theme: v.dark ? 'dark' : 'light', ...storage };
		await this.page.evaluateOnNewDocument((kv: Record<string, string>) => {
			for (const [k, val] of Object.entries(kv))
				if (localStorage.getItem(k) === null) localStorage.setItem(k, val);
		}, init);
		this.page.on('pageerror', (e) => problems.push(`${v.name} ${this.who}: page error: ${e}`));
		this.page.on('console', (m) => {
			if (m.type() === 'error')
				problems.push(`${v.name} ${this.who}: console: ${m.text().slice(0, 200)}`);
		});
	}

	begin() {
		this.t0 = Date.now();
		this.taps = 0;
	}

	async go(path: string) {
		await this.page.goto(args.url + path, { waitUntil: 'networkidle2', timeout: 30000 });
	}

	/** A screenshot, and what a stranger meets on it. */
	async shot(journey: string, name: string, note?: string) {
		const file = `${String(++this.n).padStart(2, '0')}-${this.who}-${name}.png`;
		await this.page.screenshot({ path: join(this.dir, file) });
		const seen = await this.page.evaluate(() => {
			const inSight = (el: Element) => {
				const r = el.getBoundingClientRect();
				const s = getComputedStyle(el);
				return (
					r.width > 0 &&
					r.height > 0 &&
					r.bottom > 0 &&
					r.top < innerHeight &&
					s.visibility !== 'hidden' &&
					s.opacity !== '0'
				);
			};
			const buttons = [...document.querySelectorAll('button, a[href], [role=button]')].filter(
				inSight
			).length;
			let words = 0;
			const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
			for (let n = walk.nextNode(); n; n = walk.nextNode()) {
				const el = n.parentElement;
				if (el && n.textContent?.trim() && inSight(el))
					words += n.textContent.trim().split(/\s+/).length;
			}
			return { buttons, words };
		});
		steps.push({
			view: this.view.name,
			journey,
			file,
			url: this.page.url().replace(args.url, ''),
			sec: Math.round((Date.now() - this.t0) / 100) / 10,
			taps: this.taps,
			...seen,
			note
		});
	}

	/** A player's tap: a touch on a phone, a click on a laptop. */
	async tap(el: ElementHandle<Element>) {
		await el.scrollIntoView();
		const box = await el.boundingBox();
		if (!box) throw new Error('nothing to tap: the element is not on screen');
		await this.tapAt(box.x + box.width / 2, box.y + box.height / 2);
	}

	async tapAt(x: number, y: number) {
		if (this.view.phone) await this.page.touchscreen.tap(x, y);
		else await this.page.mouse.click(x, y);
		this.taps++;
		this.lastTap = Date.now();
	}

	/** The first visible element for a selector, waiting up to `ms`. */
	async find(selector: string, ms = 15000): Promise<ElementHandle<Element>> {
		const el = await this.page.waitForSelector(selector, { visible: true, timeout: ms });
		if (!el) throw new Error(`not found: ${selector}`);
		return el;
	}

	/** The first visible button or link whose text matches. */
	async findText(re: RegExp, ms = 10000): Promise<ElementHandle<Element>> {
		const handle = await this.page.waitForFunction(
			(src: string, flags: string) => {
				const r = new RegExp(src, flags);
				return [...document.querySelectorAll('button, a[href], [role=button], [role=radio]')].find(
					(el) => {
						const b = el.getBoundingClientRect();
						return b.width > 0 && b.height > 0 && r.test((el as HTMLElement).innerText ?? '');
					}
				);
			},
			{ timeout: ms },
			re.source,
			re.flags
		);
		return handle as ElementHandle<Element>;
	}

	async has(selector: string): Promise<boolean> {
		return !!(await this.page.$(selector).then((el) => el?.isVisible()));
	}

	/** A round is on screen and can be played. Returns the seconds since the last tap. */
	async roundReady(): Promise<number> {
		await this.page.waitForSelector(
			'.rail button:not([disabled]), .bottom .open-map:not([disabled])',
			{
				visible: true,
				timeout: 30000
			}
		);
		const sec = Math.round((Date.now() - this.lastTap) / 100) / 10;
		await sleep(2500); // the round's number plate, the panorama coming in
		return sec;
	}

	/** Open the map if it is folded away, tap a spot on it, press Guess. */
	async guess(dx = 0, dy = 0, shotAs?: [string, string]) {
		if (await this.has('.bottom .open-map:not([disabled])')) {
			await this.tap(await this.find('.bottom .open-map'));
			await sleep(900);
		}
		const box = await (await this.find('.minimap .map-box')).boundingBox();
		if (!box) throw new Error('the guess map is not on screen');
		// Yandex's map can take a while in a headless browser: wait for its tiles
		await this.page
			.waitForSelector('.minimap .map-box [class*="ground-pane"] *', { timeout: 15000 })
			.catch(() => problems.push(`${this.view.name} ${this.who}: the guess map drew no tiles`));
		for (let i = 0; i < 6; i++) {
			await this.tapAt(
				box.x + box.width / 2 + dx + (i % 3) * 25,
				box.y + box.height / 2 + dy + (i % 3) * 15
			);
			await sleep(i < 3 ? 600 : 1500);
			if (await this.has('.btn-guess:not([disabled])')) break;
		}
		if (shotAs) await this.shot(...shotAs);
		await this.tap(await this.find('.btn-guess:not([disabled])', 5000));
	}
}

async function solo(browser: Browser, view: View, dir: string) {
	const p = new Player(view, 'solo', dir);
	await p.open(browser);
	const J = 'solo';

	p.begin();
	await p.go('/');
	await sleep(1500);
	await p.shot(J, 'home-first-visit', 'a stranger opens the site');

	// the one Play button
	const play = await p.find('.go .play');
	await p.tap(play);
	const wait = await p.roundReady();
	await p.shot(J, 'round-1', `the first street, playable ${wait} s after the tap`);

	if (await p.has('.round-btn.hint:not([disabled])')) {
		await p.tap(await p.find('.round-btn.hint'));
		await sleep(1500);
		await p.shot(J, 'round-1-hint');
	} else await p.shot(J, 'round-1-no-hint', 'no hint button on the default settings');

	let n = 1;
	for (;;) {
		await p.guess(n * 20, -n * 10, n === 1 ? [J, 'guess-map'] : undefined);
		await p.find('.next', 20000);
		await sleep(4000); // the reveal: the line, the flag, the stars, the plate
		if (n === 1) await p.shot(J, 'result-1');
		const over = await p.page.$eval('.next', (b) => b.textContent ?? '');
		await p.tap(await p.find('.next'));
		if (await p.page.waitForSelector('.final', { timeout: 4000 }).catch(() => null)) {
			await sleep(3500);
			await p.shot(J, 'end', `after ${n} rounds; last button said "${over.trim()}"`);
			break;
		}
		n++;
		await p.roundReady();
		if (n > 12) throw new Error('the game does not end');
	}

	await p.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
	await sleep(800);
	await p.shot(J, 'end-scrolled');

	const share = await p.findText(/ulash/i, 3000).catch(() => null);
	if (share) {
		await p.tap(share);
		await sleep(1200);
		await p.shot(J, 'share');
	}

	p.begin();
	await p.go('/');
	await sleep(1500);
	await p.shot(J, 'home-coming-back', 'the next visit, after one game');
	await p.page.close();
}

async function places(browser: Browser, view: View, dir: string) {
	const p = new Player(view, 'places', dir);
	await p.open(browser);
	const J = 'places';

	p.begin();
	await p.go('/');
	await sleep(1500);
	await p.tap(await p.find('a[href="/places"]'));
	await p.page.waitForFunction(() => location.pathname.startsWith('/places/'));
	await sleep(1500);
	await p.shot(J, 'picker-country');
	await p.page.screenshot({ path: join(dir, `${p.who}-picker-country-full.png`), fullPage: true });

	// into Tashkent, then its first district
	await p.tap(await p.findText(/^\s*Toshkent( shahri)?\s*$/m));
	await sleep(1500);
	await p.shot(J, 'picker-tashkent');
	await p.tap(await p.find('a.place'));
	await sleep(1500);
	await p.shot(J, 'picker-district');

	await p.tap(await p.find('.btn-play:not([disabled])'));
	await sleep(1500);
	if (!(await p.has('.rail button, .btn-guess'))) {
		await p.shot(J, 'after-picking', 'where the picker leaves the player');
		const sign = await p.page.$('.go .play');
		if (sign) await p.tap(sign);
	}
	const wait = await p.roundReady();
	await p.shot(J, 'round-in-district', `a street in a district, playable ${wait} s after the tap`);
	await p.page.close();
}

async function room(browser: Browser, view: View, dir: string) {
	const J = 'room';
	const host = new Player(view, 'host', dir);
	const friend = new Player(view, 'friend', dir);
	const friend2 = new Player(view, 'friend2', dir);
	await host.open(browser, { sg_choice: JSON.stringify(ROOM_CHOICE), sg_coach_done: '1' });
	await friend.open(browser);
	await friend2.open(browser);
	const all = [host, friend, friend2];

	host.begin();
	await host.go('/');
	await sleep(1500);
	// one quiet button opens a room at once (before 2026-10-28: a switch, then a sign)
	await host.tap(await host.findText(/Do‘stlar bilan/));
	await host.page.waitForFunction(() => location.pathname.startsWith('/room/'), { timeout: 15000 });
	await sleep(1500);
	await host.shot(J, 'lobby-alone', 'the host, ready to invite: taps since the home');
	// the invite: the phone's share sheet (none in a headless Chrome: our own sheet), or the
	// laptop's copy
	await host.tap(await host.findText(/Do‘stlarni chaqirish|Nusxa olindi/));
	await sleep(700);
	await host.shot(J, 'invite', 'after the big invite button: taps since the home');
	await host.page.keyboard.press('Escape');
	await sleep(400);
	const code = host.page.url().split('/room/')[1].slice(0, 5);

	friend.begin();
	await friend.go(`/room/${code}`);
	await sleep(2500);
	await friend.shot(J, 'lobby', "a friend opens the room's link: taps");
	friend2.begin();
	await friend2.go(`/room/${code}`);
	await sleep(2000);
	await host.shot(J, 'lobby-friends-in');

	await host.tap(await host.find('.btn-play:not([disabled])'));
	for (let n = 1; ; n++) {
		await Promise.all(all.map((p) => p.roundReady()));
		if (n === 1) {
			await friend.shot(J, 'round-1');
			if (await friend.has('.round-btn.hint:not([disabled])')) {
				await friend.tap(await friend.find('.round-btn.hint'));
				await sleep(1500);
				await friend.shot(J, 'round-1-hint');
			}
		}
		// the friend guesses closer to the middle, the host farther: the hint's cost shows
		await friend.guess(5, 5);
		await friend2.guess(30, 20);
		if (n === 1) {
			await sleep(1000);
			await friend.shot(J, 'waiting-for-host');
		}
		await host.guess(80, -60);
		await host.find('.ring-row', 20000);
		await sleep(4000);
		// round 1 goes on by itself after its ring; round 2 by the host's "Hozir"; the last one
		// the host holds, then goes on
		let last = '';
		if (n === 1) {
			await host.shot(J, 'result-1');
			await friend.shot(J, 'result-1', 'the friend took a hint: its cost by the score');
			await sleep(3500);
			await friend2.shot(J, 'result-1-ring', 'the ring counts down on every phone');
			continue;
		} else if (n === 2) {
			await host.tap(await host.find('.now-btn'));
		} else {
			await host.tap(await host.find('.hold-btn'));
			await sleep(1000);
			await host.shot(J, `result-${n}-held`, 'the host held the ring');
			await friend.shot(J, `result-${n}-held`);
			last = await host.page.$eval('.next', (b) => b.textContent ?? '');
			await host.tap(await host.find('.next'));
		}
		if (await host.page.waitForSelector('.podium', { timeout: 5000 }).catch(() => null)) {
			await sleep(1200);
			await host.shot(J, 'end-rising', 'the podium rising');
			await sleep(1800);
			await host.shot(J, 'end', `after ${n} rounds; last button said "${last.trim()}"`);
			for (const f of [friend, friend2]) {
				await f.find('.podium', 10000);
				await f.shot(J, 'end');
			}
			break;
		}
		if (n > 12) throw new Error('the room does not end');
	}
	// one tap of the host's takes everyone into the next game
	await host.tap(await host.find('.again:not([disabled])'));
	await Promise.all(all.map((p) => p.roundReady()));
	await friend2.shot(J, 'again', 'a friend, taken into the new game by itself');
	for (const p of all) await p.page.close();
}

const JOURNEYS = { solo, room, places } as const;

// Every journey makes new guests, and the API allows 30 an hour per address: a full run makes
// more. On this laptop the limit is cleared first (Redis database 1, local.md §3).
function clearGuestLimit() {
	try {
		const redis = (...a: string[]) =>
			execFileSync('docker', ['exec', 'redis', 'redis-cli', '-n', '1', ...a], { encoding: 'utf8' });
		const keys = redis('--scan', '--pattern', 'rl:guest:*').split('\n').filter(Boolean);
		if (keys.length) redis('del', ...keys);
	} catch {
		console.warn('could not clear the guest limit; a long run may meet 429s');
	}
}

async function main() {
	const out = args.out!;
	if (new URL(args.url!).hostname === 'localhost') clearGuestLimit();
	const profile = await mkdtemp(join(tmpdir(), 'shafaq-playtest-'));
	const browser = await puppeteer.launch({
		executablePath: args.chrome,
		headless: true,
		userDataDir: profile,
		args: ['--disable-gpu', '--no-first-run', '--no-default-browser-check', '--lang=uz']
	});
	try {
		for (const vn of args.views!.split(',')) {
			const view = VIEWS[vn];
			if (!view) throw new Error(`no view "${vn}": ${Object.keys(VIEWS).join(', ')}`);
			const dir = join(out, view.name);
			await rm(dir, { recursive: true, force: true });
			await mkdir(dir, { recursive: true });
			for (const jn of args.only!.split(',') as (keyof typeof JOURNEYS)[]) {
				const t = Date.now();
				try {
					await JOURNEYS[jn](browser, view, dir);
					console.log(`✓ ${view.name} ${jn} (${Math.round((Date.now() - t) / 1000)} s)`);
				} catch (e) {
					problems.push(`${view.name} ${jn}: FAILED: ${(e as Error).message}`);
					console.log(`✗ ${view.name} ${jn}: ${(e as Error).message}`);
					for (const pg of await browser.pages())
						await pg.screenshot({ path: join(dir, `FAIL-${jn}.png`) }).catch(() => {});
				}
			}
		}
	} finally {
		await browser.close();
		await rm(profile, { recursive: true, force: true });
	}

	await writeFile(join(out, 'steps.json'), JSON.stringify(steps, null, 1));
	await writeFile(join(out, 'problems.txt'), problems.join('\n') + '\n');
	console.log(`\n${steps.length} screens in ${out}/<view>/, the numbers in ${out}/steps.json`);
	for (const s of steps.filter((s) =>
		/-(solo-round-1|host-lobby-alone|host-invite|friend-lobby|round-in-district)\.png$/.test(s.file)
	))
		console.log(`  ${s.view} ${s.file}: ${s.taps} taps; ${s.note ?? ''}`);
	if (problems.length) console.log(`\n${problems.length} problems: ${out}/problems.txt`);
	process.exit(problems.some((p) => p.includes('FAILED')) ? 1 : 0);
}

main();
