// The playtest: plays the game the way a stranger does, on demo panoramas, and saves a
// screenshot of every screen for the steve-jobs review (_geoshafaq_claude/skills/steve-jobs).
//
//   npm run playtest                                  all journeys, phone and laptop, light + dark
//   npm run playtest -- --views phone-light --only solo
//   npm run playtest -- --url http://10.42.0.1:8130 --out /tmp/pt
//
// Journeys: solo (first visit → a game with a hint → the end → home again → share → my map), room (a
// host and two friends, each in their own browser, play a room on "O‘rta" to its end: one
// friend comes by the link, the other types the code after "Kodim bor"; the first takes a
// hint; the rounds go on by the ring, "Hozir", and a hold; the host's "Yana o‘ynash" takes
// everyone into the next game), places (the map of Uzbekistan → Tashkent → Chilonzor picked → a game
// there), challenge (a finished game's link → two friends as guests play it → one leaderboard),
// missed (a game guessed far off → "Adashgan ko‘chalarim" → found on the spot, each street leaves the
// list until none is left), shop (a street found earns Barg; the shop: too little, then bought and worn;
// the skins in a game, the frame in a room, a challenge won on the framed player's board).
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
		only: { type: 'string', default: 'solo,room,places,challenge,missed,shop' },
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

	// to the bottom of whatever scrolls: the page, or the end screen itself on a phone
	await p.page.evaluate(() => {
		window.scrollTo(0, document.body.scrollHeight);
		for (const el of document.querySelectorAll<HTMLElement>('.result, .body'))
			if (el.scrollHeight > el.clientHeight) el.scrollTop = el.scrollHeight;
	});
	await sleep(800);
	await p.shot(J, 'end-scrolled');

	const share = await p.findText(/Do‘stni chaqirish/, 3000).catch(() => null);
	if (share) {
		await p.tap(share);
		await sleep(1200);
		await p.shot(J, 'share');
	}

	p.begin();
	await p.go('/');
	await sleep(1500);
	await p.shot(J, 'home-coming-back', 'the next visit, after one game');

	// my map: the profile's big picture; a tap on a district shows its streets
	await p.tap(await p.find('a[href="/me"]'));
	await p.find('figure.city path.shape');
	await sleep(1200);
	await p.page.evaluate(() => scrollTo(0, 0));
	await p.shot(J, 'my-map', 'the profile: the districts played are gold');
	await p.tap(await p.find('figure.city path.shape[aria-label="Chilonzor tumani"]'));
	await sleep(1000);
	await p.shot(J, 'my-map-district', 'a tap on Chilonzor: its streets, and play there');
	await p.page.close();
}

async function places(browser: Browser, view: View, dir: string) {
	const p = new Player(view, 'places', dir);
	await p.open(browser);
	const J = 'places';

	p.begin();
	await p.go('/');
	await sleep(1500);
	// a laptop: a click on a district of the city map makes it the sign; the page stays
	if (!view.phone) {
		const label = await p.find('figure.city text::-p-text(Yashnobod)', 8000);
		const box = await label.boundingBox();
		if (box) await p.tapAt(box.x + box.width / 2, box.y + box.height / 2);
		await sleep(1200);
		const where = await p.page.evaluate(() => location.pathname);
		const sign = await p.page.$eval('.where', (a) => (a as HTMLElement).innerText);
		if (where !== '/' || !/Yashnobod/.test(sign))
			problems.push(`${view.name} places: the city map's click went to ${where}, sign "${sign}"`);
		await p.shot(J, 'home-district-picked', 'a click on Yashnobod in the city map: taps');
		p.begin();
	}
	// the sign opens the map of Uzbekistan; Tashkent's badge flies into its tumanlar; a tap
	// picks Chilonzor; "O‘ynash" plays it
	await p.tap(await p.find('a.where'));
	// once (2026-10-29) a laptop's tap on the sign right after a map click didn't go: say so
	const opened = await p.page
		.waitForFunction(() => location.pathname.startsWith('/places/'), { timeout: 5000 })
		.catch(() => null);
	if (!opened) {
		problems.push(`${view.name} places: the sign's tap didn't open the place map; tapped again`);
		await p.tap(await p.find('a.where'));
		p.taps--;
		await p.page.waitForFunction(() => location.pathname.startsWith('/places/'));
	}
	await p.find('.map path.shape'); // a district's own address goes on to its city's map first
	await sleep(600);
	if (!(await p.page.evaluate(() => location.pathname.endsWith('/uzbekistan')))) {
		await p.tap(await p.find('a.back')); // a district picked on the city map opens its city
		await p.page.waitForFunction(() => location.pathname.endsWith('/uzbekistan'));
		p.taps--; // only the way the test came, not a player's tap
	}
	await p.find('.map path.shape');
	await sleep(1200);
	await p.shot(J, 'map-country');
	await p.page.screenshot({ path: join(dir, `${p.who}-map-country-full.png`), fullPage: true });

	// Tashkent: a badge on a phone, a shape on a laptop
	await p.tap(await p.find('.map [aria-label="Toshkent"]'));
	await p.page.waitForFunction(() => location.pathname.endsWith('/toshkent'));
	await p.find('.map path.shape');
	await sleep(1200);
	await p.shot(J, 'map-tashkent');
	// going close: + twice, every name stays, then back (not counted: the way to a game has none)
	const press = (nth: number) =>
		p.page.$$eval('.zoom button', (b, i) => (b[i] as HTMLElement).click(), nth);
	await press(0);
	await sleep(500);
	await press(0);
	await sleep(800);
	await p.shot(J, 'map-tashkent-close', 'the map close up: the same places, every name');
	await press(1);
	await sleep(500);
	await press(1);
	await sleep(800);
	await p.tap(await p.find('path.shape[aria-label="Chilonzor tumani"]'));
	await sleep(700);
	await p.shot(J, 'map-district', 'Chilonzor picked: the bar says what plays');

	await p.tap(await p.find('.bar .play:not([disabled])'));
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
	// the other friend was told the code: "Kodim bor" on the home, the code on the plate, and
	// in by itself at five letters
	friend2.begin();
	await friend2.go('/');
	await sleep(1500);
	await friend2.tap(await friend2.findText(/^\s*Kodim bor\s*$/));
	await sleep(400);
	await friend2.page.keyboard.type(code.toLowerCase(), { delay: 90 });
	await friend2.page.waitForFunction(() => location.pathname.startsWith('/room/'), {
		timeout: 15000
	});
	await sleep(2000);
	await friend2.shot(J, 'lobby-by-code', 'the code typed after "Kodim bor": taps');
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
		} else if (n === 2) {
			await friend.tap(await friend.find('.round-btn.pause'));
			await sleep(600);
			await friend.shot(J, 'round-2-menu', "a room's menu: a room never pauses");
			await friend.page.keyboard.press('Escape');
			await sleep(400);
		}
		// the friend guesses closer to the middle, the host farther: the hint's cost shows
		await friend.guess(5, 5);
		await friend2.guess(30, 20);
		if (n === 1) {
			await sleep(1000);
			await friend.shot(J, 'waiting-for-host');
			await host.shot(J, 'round-1-clock', 'the others guessed: the clock in the players chip');
		}
		await host.guess(80, -60);
		await host.find('.ring-row', 20000);
		if (n === 1) {
			await sleep(2600);
			await host.shot(J, 'result-1-pulse', 'the crowd ring pulsing out from the badge');
		}
		await sleep(n === 1 ? 2400 : 5000);
		// every round on every phone: the gold ring's label, and "closer" or "farther" under the score
		for (const who of [host, friend, friend2]) {
			const [label, line] = await who.page.evaluate(() => [
				document.querySelector('.sg-crowd-label')?.textContent ?? '',
				document.querySelector('.reveal .crowd')?.textContent?.trim() ?? ''
			]);
			if (!label || !line)
				problems.push(
					`${who.view.name} ${who.who} round ${n}: crowd ring "${label}", line "${line}"`
				);
		}
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
	// "Do‘stni chaqirish" from the room's end: its link's board has everyone who played here
	await friend.tap(await friend.findText(/Do‘stni chaqirish/));
	await sleep(1500);
	await friend.shot(J, 'challenge', "a room's end: the link for friends who weren't here");
	const link = await friend.page.$eval('input.link', (i) => (i as HTMLInputElement).value);
	await friend.page.keyboard.press('Escape');
	const board = await friend.page.evaluate(async (path: string) => {
		const api = `${location.protocol}//${location.hostname}:8131`;
		const r = await fetch(`${api}/v1/challenges/${path.split('/c/')[1]}`, {
			credentials: 'include'
		});
		return ((await r.json()) as { players: number }).players;
	}, new URL(link).pathname);
	if (board !== 3) problems.push(`${view.name} room: ${board} on the challenge's board, want 3`);

	// one tap of the host's takes everyone into the next game
	await host.tap(await host.find('.again:not([disabled])'));
	await Promise.all(all.map((p) => p.roundReady()));
	await friend2.shot(J, 'again', 'a friend, taken into the new game by itself');
	for (const p of all) await p.page.close();
}

// A challenge: the first player's finished game → "Do‘stni chaqirish" → the link. Two friends,
// guests in their own browsers, open it, play the same streets and land on one leaderboard; the
// second one's result has the crowd's ring from the challenge's players.
async function challenge(browser: Browser, view: View, dir: string) {
	const J = 'challenge';
	const QUICK = JSON.stringify({
		...ROOM_CHOICE,
		preset: 'easy',
		hints: { count: 0, per: 'round', kind: 'district', cost: 0 }
	});
	const host = new Player(view, 'host', dir);
	const friend = new Player(view, 'friend', dir);
	const friend2 = new Player(view, 'friend2', dir);
	await host.open(browser, { sg_choice: QUICK, sg_coach_done: '1' });
	await friend.open(browser, { sg_coach_done: '1' });
	await friend2.open(browser, { sg_coach_done: '1' });

	async function play(p: Player, n: number, off: number, ring = false) {
		for (let i = 1; i <= n; i++) {
			await p.roundReady();
			await p.guess(i * 20 + off, -i * 15 + off);
			await p.find('.next', 20000);
			await sleep(3500);
			if (ring) {
				const [label, line] = await p.page.evaluate(() => [
					document.querySelector('.sg-crowd-label')?.textContent ?? '',
					document.querySelector('.reveal .crowd')?.textContent?.trim() ?? ''
				]);
				if (!label || !line)
					problems.push(`${view.name} ${p.who} round ${i}: crowd ring "${label}", line "${line}"`);
			}
			if (i === 1) {
				await p.shot(J, 'result-1');
				if (p === friend2 && !(await p.has('.learned-line')))
					problems.push(`${view.name} friend2: a guess on the spot, no "Ko‘cha o‘rganildi"`);
			}
			await p.tap(await p.find('.next'));
		}
		await p.find('.final', 15000);
		await sleep(2500);
	}

	host.begin();
	await host.go('/');
	await sleep(1500);
	await host.tap(await host.find('.go .play'));
	await play(host, 3, 0);
	await host.shot(J, 'end', 'the end of a game: the way to challenge a friend');
	await host.page.evaluate(() => {
		for (const el of document.querySelectorAll<HTMLElement>('.result, .body'))
			if (el.scrollHeight > el.clientHeight) el.scrollTop = el.scrollHeight;
	});
	await host.tap(await host.findText(/Do‘stni chaqirish/));
	await sleep(1200);
	await host.shot(J, 'share', 'the link to send');
	const link = await host.page.$eval('input.link', (i) => (i as HTMLInputElement).value);
	const path = new URL(link).pathname;

	// the second friend's first guess lands on the host's real place (a finished game shows it):
	// within 500 m, the street is learned; the only way a test can know where a street is
	const gameId = new URL(host.page.url()).pathname.split('/').pop();
	const actual = await host.page.evaluate(async (id) => {
		const r = await fetch(`${location.protocol}//${location.hostname}:8131/v1/games/${id}`, {
			credentials: 'include'
		});
		return ((await r.json()) as { rounds: { result: { actual: unknown } }[] }).rounds[0].result
			.actual;
	}, gameId);
	await friend2.page.setRequestInterception(true);
	friend2.page.on('request', (r) =>
		r.method() === 'POST' && r.url().endsWith('/rounds/1/guess')
			? r.continue({ postData: JSON.stringify({ pos: actual }) })
			: r.continue()
	);

	for (const [p, ring] of [
		[friend, true],
		[friend2, true]
	] as const) {
		p.begin();
		await p.go(path);
		await sleep(1800);
		await p.shot(J, 'landing', "a friend opens the challenge's link: taps");
		await p.tap(await p.find('.go:not([disabled])'));
		await play(p, 3, p === friend ? 30 : -40, ring);
		await p.shot(J, 'end', 'the end of the challenge: the place on the board');
		await p.go(path);
		await sleep(1500);
		await p.shot(J, 'after', 'the link again: the board');
		const rows = await p.page.$$eval('.board li', (l) => l.length);
		const want = p === friend ? 2 : 3;
		if (rows !== want) problems.push(`${view.name} ${p.who}: ${rows} on the board, want ${want}`);
		await p.go('/');
		await sleep(1500);
		const counts = await p.page.$eval('.meta', (m) => (m as HTMLElement).innerText);
		const wantCount = p === friend2 ? /1 \/ \d+/ : /^(?!.*0 \/)/s;
		if (!wantCount.test(counts)) problems.push(`${view.name} ${p.who}: the home says "${counts}"`);
		await p.shot(J, 'home', p === friend2 ? 'one street learned' : 'none learned: no 0 / 177');
	}
	for (const p of [host, friend, friend2]) await p.page.close();
}

// Streets I miss. Only this laptop's database can say where a panorama is, so the guess that finds
// a street is sent there from the rounds table; every other guess lands in another country.
function roundSpot(gameId: string, n: number) {
	const out = execFileSync(
		'docker',
		[
			'exec',
			'postgres',
			'psql',
			'-U',
			'postgres',
			'-d',
			'shafaq_lcl',
			'-Atc',
			`SELECT ST_Y(p.pos), ST_X(p.pos) FROM rounds r JOIN panoramas p ON p.id = r.panorama_id WHERE r.game_id = '${gameId}' AND r.n = ${n}`
		],
		{ encoding: 'utf8' }
	);
	const [lat, lon] = out.trim().split('|').map(Number);
	return { lat, lon };
}

async function missed(browser: Browser, view: View, dir: string) {
	const J = 'missed';
	const CHOICE = JSON.stringify({
		...ROOM_CHOICE,
		preset: 'easy',
		hints: { count: 0, per: 'round', kind: 'district', cost: 0 }
	});
	const p = new Player(view, 'missed', dir);
	await p.open(browser, { sg_choice: CHOICE, sg_coach_done: '1' });

	// which rounds' guesses find their street; the others land far away
	let find = new Set<number>();
	await p.page.setRequestInterception(true);
	p.page.on('request', (r) => {
		const m = r.method() === 'POST' && r.url().match(/\/games\/([^/]+)\/rounds\/(\d+)\/guess$/);
		if (!m) return r.continue();
		const n = Number(m[2]);
		const pos = find.has(n) ? roundSpot(m[1], n) : { lat: 40.5, lon: 60.5 };
		r.continue({ postData: JSON.stringify({ pos }) });
	});
	const left = () =>
		p.page.evaluate(async () => {
			const r = await fetch(`${location.protocol}//${location.hostname}:8131/v1/me/missed`, {
				credentials: 'include'
			});
			return ((await r.json()) as { streets: unknown[] }).streets.length;
		});
	async function playAll() {
		for (let i = 1; ; i++) {
			await p.roundReady();
			await p.guess();
			await p.find('.next', 20000);
			await sleep(1500);
			await p.tap(await p.find('.next'));
			if (await p.page.waitForSelector('.final', { timeout: 4000 }).catch(() => null)) break;
			if (i > 12) throw new Error('the game does not end');
		}
		await sleep(2800);
	}

	p.begin();
	await p.go('/');
	await sleep(1500);
	await p.tap(await p.find('.go .play'));
	await playAll();
	const noRepeats = async () => {
		const plates = await p.page.$$eval('.stop-plate', (l) =>
			l.map((x) => (x as HTMLElement).innerText)
		);
		if (new Set(plates).size !== plates.length)
			problems.push(`${view.name} missed: a street twice in one game: ${plates.join(' / ')}`);
	};
	await noRepeats();
	const before = await left();
	if (before !== 3) problems.push(`${view.name} missed: ${before} on the list after 3 far guesses`);

	// from my streets; my map doesn't carry it
	await p.go('/me');
	await p.find('figure.city path.shape');
	await sleep(1200);
	if (await p.has('a.missed')) problems.push(`${view.name} missed: the way there is under my map`);
	await p.go('/me/streets');
	await sleep(1000);
	await p.shot(J, 'my-streets', 'my streets with the way to the missed streets');
	await p.tap(await p.find('a.missed'));
	await p.page.waitForFunction(() => location.pathname === '/me/missed');
	await sleep(1000);
	await p.shot(J, 'list', 'the worst first, one green button');

	// none found: the list stands, nothing cheers
	await p.tap(await p.findText(/O‘ynash/));
	await p.page.waitForFunction(() => location.pathname.startsWith('/game/'));
	await p.roundReady();
	await p.shot(J, 'round', 'a round on the missed streets: the guess map frames all of Tashkent');
	await playAll();
	await p.shot(J, 'end-none', 'nothing found: the headline is what is left');
	const none = await p.page.$eval('.final-head h1', (h) => (h as HTMLElement).innerText);
	if (!/3 tasi qoldi/.test(none))
		problems.push(`${view.name} missed: nothing found says "${none}"`);

	// the first street found: it leaves the list; the home's sign stays where it was
	find = new Set([1]);
	await p.tap(await p.findText(/Yana o‘ynash/));
	await p.page.waitForFunction(() => !document.querySelector('.final'), { timeout: 15000 });
	await playAll();
	await p.shot(J, 'end', 'one street left the list');
	await noRepeats();
	const after = await left();
	if (after !== before - 1)
		problems.push(`${view.name} missed: ${after} on the list, want ${before - 1}`);
	const sign = await p.page.$eval('.final-head', (h) => (h as HTMLElement).innerText);
	if (!/Adashgan/.test(sign)) problems.push(`${view.name} missed: the end's sign says "${sign}"`);

	// "Yana o‘ynash": the two left, found: the list is empty, the end says so, no next game
	find = new Set([1, 2]);
	await p.tap(await p.findText(/Yana o‘ynash/));
	await p.page.waitForFunction(() => !document.querySelector('.final'), { timeout: 15000 });
	await playAll();
	await p.shot(J, 'end-all-learned', 'none left');
	await noRepeats();
	if ((await left()) !== 0) problems.push(`${view.name} missed: the list isn't empty at the end`);
	if (await p.findText(/Yana o‘ynash/, 800).catch(() => null))
		problems.push(`${view.name} missed: "Yana o‘ynash" with nothing left to play`);
	await p.go('/me/missed');
	await sleep(1000);
	await p.shot(J, 'empty', 'the list, empty');
	await p.go('/');
	await sleep(1200);
	const home = await p.page.$eval('.where', (a) => (a as HTMLElement).innerText);
	if (/Adashgan/.test(home)) problems.push(`${view.name} missed: the home's sign became "${home}"`);
	await p.page.close();
}

// Barg and the shop. Earning 900 honestly takes a while, so this laptop's ledger gets a test entry.
function grantBarg(userId: string, amount: number) {
	execFileSync(
		'docker',
		[
			'exec',
			'postgres',
			'psql',
			'-U',
			'postgres',
			'-d',
			'shafaq_lcl',
			'-c',
			`INSERT INTO barg_ledger (user_id, amount, reason, ref, note, key) VALUES ('${userId}', ${amount}, 'district', 'playtest', 'Playtest', 'playtest:${userId}')`
		],
		{ encoding: 'utf8' }
	);
}

async function shop(browser: Browser, view: View, dir: string) {
	const J = 'shop';
	const CHOICE = JSON.stringify({
		...ROOM_CHOICE,
		preset: 'easy',
		rounds: 3,
		hints: { count: 0, per: 'round', kind: 'district', cost: 0 }
	});
	const host = new Player(view, 'host', dir);
	const friend = new Player(view, 'friend', dir);
	await host.open(browser, { sg_choice: CHOICE, sg_coach_done: '1' });
	await friend.open(browser, { sg_coach_done: '1' });

	// which rounds' guesses find their place; the others land far away
	const finds = new Map<Player, Set<number>>([
		[host, new Set([1])],
		[friend, new Set([1, 2, 3])]
	]);
	for (const p of [host, friend]) {
		await p.page.setRequestInterception(true);
		p.page.on('request', (r) => {
			const m = r.method() === 'POST' && r.url().match(/\/games\/([^/]+)\/rounds\/(\d+)\/guess$/);
			if (!m) return r.continue();
			const n = Number(m[2]);
			const pos = finds.get(p)!.has(n) ? roundSpot(m[1], n) : { lat: 40.5, lon: 60.5 };
			r.continue({ postData: JSON.stringify({ pos }) });
		});
	}
	const balance = (p: Player) =>
		p.page.evaluate(async () => {
			const r = await fetch(`${location.protocol}//${location.hostname}:8131/v1/me`, {
				credentials: 'include'
			});
			return (await r.json()) as { barg: number; user: { id: string } };
		});
	async function playAll(p: Player, shotFirst = false) {
		for (let i = 1; ; i++) {
			await p.roundReady();
			if (shotFirst && i === 1) await p.shot(J, 'round-skinned', 'a round with skins on');
			await p.guess(i * 15, -i * 10);
			await p.find('.next', 20000);
			await sleep(3800);
			if (i === 1) await p.shot(J, shotFirst ? 'result-skinned' : 'result-earned');
			await p.tap(await p.find('.next'));
			if (await p.page.waitForSelector('.final', { timeout: 4000 }).catch(() => null)) break;
			if (i > 12) throw new Error('the game does not end');
		}
		await sleep(2800);
	}

	// a street found: Barg, said when it happens
	host.begin();
	await host.go('/');
	await sleep(1500);
	await host.tap(await host.find('.go .play'));
	await playAll(host);
	await host.shot(J, 'end-earned', 'what the game earned');
	if (!(await host.has('.earned-line')))
		problems.push(`${view.name} shop: no Barg at the end of a game with a street found`);
	const earned = await balance(host);
	if (earned.barg < 5) problems.push(`${view.name} shop: ${earned.barg} Barg after a street found`);

	// the profile, the wallet; the shop: too little
	await host.go('/me');
	await sleep(1200);
	await host.shot(J, 'profile', 'the balance on the profile');
	await host.go('/me/wallet');
	await sleep(800);
	await host.shot(J, 'wallet', 'how it is earned, where it came from');
	await host.go('/shop');
	await sleep(1000);
	await host.shot(J, 'shop', 'the shop: fixed prices');
	const tile = async (name: string, section: number) => {
		const tiles = await host.page.$$('.grid');
		const all = await tiles[section].$$('.tile');
		for (const t of all)
			if ((await t.evaluate((x) => (x as HTMLElement).innerText)).includes(name)) return t;
		throw new Error(`no ${name} in the shop`);
	};
	await host.tap(await tile('Oltin', 0));
	await sleep(600);
	await host.shot(J, 'too-little', 'too little Barg: what is missing, no dead button');
	await host.page.keyboard.press('Escape');
	await sleep(300);

	// bought and worn in one tap each
	grantBarg(earned.user.id, 900);
	await host.go('/shop');
	await sleep(1000);
	for (const [name, section] of [
		['Oltin', 0],
		['Lojuvard', 1],
		['Nuqtalar', 2]
	] as const) {
		await host.tap(await tile(name, section));
		await sleep(500);
		if (section === 0) await host.shot(J, 'buy', 'one button: the price');
		await host.tap(await host.find('.sheet .act'));
		if (section === 0) {
			await sleep(300);
			await host.shot(J, 'bought', 'the moment it is yours');
		}
		await host.page.waitForFunction(() => !document.querySelector('.sheet'), { timeout: 8000 });
		await sleep(300);
	}
	await sleep(600);
	await host.shot(J, 'shop-worn', 'bought and worn');
	const left = await balance(host);
	const want = earned.barg + 900 - (100 + 60 + 80);
	if (left.barg !== want) problems.push(`${view.name} shop: balance ${left.barg}, want ${want}`);
	await host.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
	await sleep(400);
	await host.shot(J, 'shop-bottom');
	await host.go('/me');
	await sleep(1200);
	await host.shot(J, 'profile-framed', 'the frame on the profile');

	// the skins in a game; its challenge for a friend
	finds.set(host, new Set());
	await host.go('/');
	await sleep(1500);
	await host.tap(await host.find('.go .play'));
	await playAll(host, true);
	await host.shot(J, 'end-skinned', 'the pin and the dotted trail');
	await host.page.evaluate(() => {
		for (const el of document.querySelectorAll<HTMLElement>('.result, .body'))
			if (el.scrollHeight > el.clientHeight) el.scrollTop = el.scrollHeight;
	});
	await host.tap(await host.findText(/Do‘stni chaqirish/));
	await sleep(1200);
	const link = await host.page.$eval('input.link', (i) => (i as HTMLInputElement).value);
	await host.page.keyboard.press('Escape');

	// the friend beats the host: the challenge won, the frame on the board
	await friend.go(new URL(link).pathname);
	await sleep(1800);
	await friend.shot(J, 'landing', 'the challenger with their frame');
	await friend.tap(await friend.find('.go:not([disabled])'));
	await playAll(friend);
	await friend.shot(J, 'challenge-won', 'first on the board, the frame on the other row');
	const won = await friend.page.evaluate(() => document.querySelector('.earned-line')?.textContent);
	const friendBarg = await balance(friend);
	if (friendBarg.barg < 20)
		problems.push(`${view.name} shop: the winner has ${friendBarg.barg} Barg, "${won}"`);

	// a whole district learned: Uchtepa's seven streets, all found; the biggest reward has its moment
	finds.set(friend, new Set(Array.from({ length: 20 }, (_, i) => i + 1)));
	const gameId = await friend.page.evaluate(async () => {
		const api = `${location.protocol}//${location.hostname}:8131/v1`;
		const m = (await (await fetch(`${api}/maps`, { credentials: 'include' })).json())[0];
		const r = await fetch(`${api}/games`, {
			method: 'POST',
			credentials: 'include',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				map: 'place-uchtepa-tumani',
				rules: { ...m.rules, providers: ['demo'], rounds: 10, timeSec: 0, movement: 'nomove' }
			})
		});
		return ((await r.json()) as { id: string }).id;
	});
	await friend.go(`/game/${gameId}`);
	let plate = false;
	for (let i = 1; i <= 10 && !plate; i++) {
		await friend.roundReady();
		await friend.guess(10, 10);
		await friend.find('.next', 20000);
		await sleep(3500);
		plate = await friend.has('.district-plate');
		if (!plate) {
			await friend.tap(await friend.find('.next'));
			await sleep(800);
		}
	}
	if (plate) await friend.shot(J, 'district-won', 'a whole district: the gold plate, the fanfare');
	else problems.push(`${view.name} shop: every street of a district found, no plate`);

	// a room: the frame in the lobby
	await host.go('/');
	await sleep(1500);
	await host.tap(await host.findText(/Do‘stlar bilan/));
	await host.page.waitForFunction(() => location.pathname.startsWith('/room/'), { timeout: 15000 });
	await sleep(1500);
	const code = host.page.url().split('/room/')[1].slice(0, 5);
	await friend.go(`/room/${code}`);
	await sleep(2500);
	await host.shot(J, 'lobby-framed', 'the frame in the lobby');

	// on to the podium: the frame on the result's table and the steps
	await sleep(2000);
	await host.tap(await host.find('.btn-play:not([disabled])'));
	for (let n = 1; n <= 3; n++) {
		await Promise.all([host.roundReady(), friend.roundReady()]);
		await friend.guess(5, 5);
		await host.guess(40, -30);
		await host.find('.ring-row', 20000);
		await sleep(3500);
		if (n === 1) {
			await host.shot(J, 'room-result', 'the frame in the table');
		}
		if (n < 3 || (await host.has('.now-btn'))) await host.tap(await host.find('.now-btn'));
	}
	await host.find('.podium', 20000);
	await sleep(3000);
	await host.shot(J, 'podium', 'the frame on the podium');
	await friend.page.close();
	await host.page.close();
}

const JOURNEYS = { solo, room, places, challenge, missed, shop } as const;

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
		/-(solo-round-1|host-lobby-alone|host-invite|friend-lobby|friend2-lobby-by-code|round-in-district)\.png$/.test(
			s.file
		)
	))
		console.log(`  ${s.view} ${s.file}: ${s.taps} taps; ${s.note ?? ''}`);
	if (problems.length) console.log(`\n${problems.length} problems: ${out}/problems.txt`);
	process.exit(problems.some((p) => p.includes('FAILED')) ? 1 : 0);
}

main();
