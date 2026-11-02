// Asks Yandex for the nearest panorama at given points, one call each, never over the budget:
//
//   node scripts/playtest/probe.mjs points.csv found.json 25      slug,name,lat,lon per line
//
// Every call counts against the free key's ~100 a day, and a call only reaches about 100 m, so
// look first at where there are panoramas: yandex.uz/maps/?l=stv,sta&ll=<lon>,<lat>&z=11 in a
// normal browser. New points go into api-geo-shafaq/data/v0/locations.json, then `tools v0` and
// `tools demo`.
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');
const [csv, out, budget] = [process.argv[2], process.argv[3], Number(process.argv[4])];
const pts = readFileSync(csv, 'utf8')
	.trim()
	.split('\n')
	.map((l) => {
		const [slug, name, lat, lon] = l.split(',');
		return { slug, name, lat: +lat, lon: +lon };
	})
	.slice(0, budget);
const key = readFileSync(new URL('../../.env.local', import.meta.url), 'utf8')
	.match(/PUBLIC_YANDEX_KEY=(.+)/)[1]
	.trim()
	.replace(/^["']|["']$/g, '');
const profile = mkdtempSync(join(tmpdir(), 'sg-probe-'));
const browser = await puppeteer.launch({
	headless: true,
	executablePath: '/usr/bin/google-chrome',
	userDataDir: profile,
	args: ['--disable-gpu', '--no-sandbox']
});
const page = await browser.newPage();
await page.goto('http://localhost:8130/', { waitUntil: 'domcontentloaded' });
await page.addScriptTag({ url: `https://api-maps.yandex.ru/2.1/?apikey=${key}&lang=uz_UZ` });
const res = await page.evaluate(async (pts) => {
	await new Promise((r) => ymaps.ready(r));
	const out = [];
	for (const p of pts) {
		try {
			const f = await ymaps.panorama.locate([p.lat, p.lon]);
			if (!f.length) out.push({ ...p, found: false });
			else {
				const [lat, lon] = f[0].getPosition();
				out.push({
					...p,
					found: true,
					plat: lat,
					plon: lon,
					km: Math.hypot(
						(lat - p.lat) * 111.32,
						(lon - p.lon) * 111.32 * Math.cos((p.lat * Math.PI) / 180)
					)
				});
			}
		} catch (e) {
			out.push({ ...p, found: false, error: String(e).slice(0, 80) });
		}
		await new Promise((r) => setTimeout(r, 250));
	}
	return out;
}, pts);
writeFileSync(out, JSON.stringify(res, null, 0));
for (const r of res)
	console.log(r.name.padEnd(22), r.found ? `${r.km.toFixed(2)} km` : 'none', r.error ?? '');
console.log('calls', res.length);
await browser.close();
rmSync(profile, { recursive: true, force: true });
