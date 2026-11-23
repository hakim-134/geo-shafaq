import { describe, expect, it, vi } from 'vitest';
import type { MapSummary } from '#lib/api/client.js';
import { loadChoice, saveChoice } from '#lib/rules.js';
import {
	addPick,
	listOf,
	MAX_PICKS,
	removePick,
	within,
	type NewPick,
	type Pick
} from './picks.js';

const T = (uz: string) => ({ uz, ru: uz, en: uz });
const place = (slug: string, path: string[]): NewPick => ({
	map: `place-${slug}`,
	place: slug,
	path
});
const yunusobod = place('yunusobod-tumani', ['uzbekistan', 'toshkent']);
const chilonzor = place('chilonzor-tumani', ['uzbekistan', 'toshkent']);
const city: NewPick = { map: 'tashkent-streets', place: 'toshkent', path: ['uzbekistan'] };
const buxoro = place('buxoro-viloyati', ['uzbekistan']);
const jondor = place('jondor-tumani', ['uzbekistan', 'buxoro-viloyati']);
const samarqand = place('samarqand-viloyati', ['uzbekistan']);
const country: NewPick = { map: 'uzbekistan', place: 'uzbekistan', path: [] };
const historic: NewPick = { map: 'historic', path: ['uzbekistan'], places: ['buxoro-shahri'] };

const list = (...items: NewPick[]): Pick[] => items.map((p, i) => ({ ...p, color: i + 1 }));
const maps = (l: Pick[]) => l.map((p) => p.map);

describe('within', () => {
	it('a district is in its city and in the country, not in another region', () => {
		expect(within(yunusobod, city)).toBe(true);
		expect(within(yunusobod, country)).toBe(true);
		expect(within(yunusobod, buxoro)).toBe(false);
		expect(within(city, yunusobod)).toBe(false);
	});
	it('the historic cities lie in the country and hold nothing', () => {
		expect(within(historic, country)).toBe(true);
		expect(within(buxoro, historic)).toBe(false);
	});
});

describe('addPick', () => {
	it('the first place replaces the default and the next place adds to it', () => {
		const first = addPick(list(city), buxoro, true);
		expect(first).toEqual({ list: list(buxoro), outcome: 'added' });
		expect(addPick(first.list, yunusobod).list).toEqual(list(buxoro, yunusobod));
	});
	it('the first ready map also replaces the default', () => {
		expect(addPick(list(city), historic, true).list).toEqual(list(historic));
	});
	it('picking Tashkent itself makes the default an explicit pick', () => {
		const first = addPick(list(city), city, true);
		expect(first).toEqual({ list: list(city), outcome: 'added' });
		expect(addPick(first.list, buxoro).list).toEqual(list(city, buxoro));
	});
	it('adds at the end in the first free colour', () => {
		const { list: l, outcome } = addPick(list(yunusobod, buxoro), samarqand);
		expect(outcome).toBe('added');
		expect(maps(l)).toEqual([
			'place-yunusobod-tumani',
			'place-buxoro-viloyati',
			'place-samarqand-viloyati'
		]);
		expect(l[2].color).toBe(3);
	});
	it('a place already there changes nothing', () => {
		const l = list(yunusobod);
		expect(addPick(l, { ...yunusobod })).toEqual({ list: l, outcome: 'same' });
	});
	it('a place inside a picked one narrows it down, in its place and colour', () => {
		const { list: l } = addPick(list(city, buxoro), yunusobod);
		expect(maps(l)).toEqual(['place-yunusobod-tumani', 'place-buxoro-viloyati']);
		expect(l[0].color).toBe(1);
		const narrowed = addPick(list(country), jondor).list;
		expect(maps(narrowed)).toEqual(['place-jondor-tumani']);
	});
	it('a place holding picked ones replaces them, where the first stood', () => {
		const { list: l } = addPick(list(buxoro, yunusobod, samarqand, chilonzor), city);
		expect(maps(l)).toEqual([
			'place-buxoro-viloyati',
			'tashkent-streets',
			'place-samarqand-viloyati'
		]);
		expect(l.map((p) => p.color)).toEqual([1, 2, 3]);
		expect(maps(addPick(list(yunusobod, historic, jondor), country).list)).toEqual(['uzbekistan']);
	});
	it('holds eight at most, but replacing still works when full', () => {
		const eight = list(
			...Array.from({ length: MAX_PICKS }, (_, i) => place(`d${i}`, ['uzbekistan', 'toshkent']))
		);
		expect(addPick(eight, samarqand).outcome).toBe('full');
		const { list: l, outcome } = addPick(eight, city);
		expect(outcome).toBe('added');
		expect(maps(l)).toEqual(['tashkent-streets']);
	});
	it('a colour freed by a removed item is taken by the next one', () => {
		const l = removePick(list(yunusobod, buxoro, samarqand), 'place-buxoro-viloyati');
		const { list: next } = addPick(l, jondor);
		expect(next.map((p) => p.color)).toEqual([1, 3, 2]);
	});
});

describe('saved list ownership', () => {
	it('recognizes legacy picks and remembers an explicit Tashkent pick', () => {
		const kept = new Map<string, string>();
		vi.stubGlobal('localStorage', {
			getItem: (key: string) => kept.get(key) ?? null,
			setItem: (key: string, value: string) => kept.set(key, value)
		});
		try {
			expect(loadChoice()).toMatchObject({ map: city.map, ownList: false });
			saveChoice({ ...loadChoice(), map: buxoro.map, ownList: undefined });
			expect(loadChoice()).toMatchObject({ map: buxoro.map, ownList: true });
			saveChoice({ ...loadChoice(), map: city.map, ownList: true });
			expect(loadChoice()).toMatchObject({ map: city.map, ownList: true });
		} finally {
			vi.unstubAllGlobals();
		}
	});
});

describe('removePick', () => {
	it('takes an item out, never the last one', () => {
		expect(maps(removePick(list(yunusobod, buxoro), 'place-yunusobod-tumani'))).toEqual([
			'place-buxoro-viloyati'
		]);
		const one = list(yunusobod);
		expect(removePick(one, 'place-yunusobod-tumani')).toBe(one);
	});
});

describe('listOf', () => {
	const summary = (m: Partial<MapSummary>): MapSummary =>
		({ slug: 'x', name: T('x'), description: T(''), ...m }) as MapSummary;

	it('a place map: its place, and the places round it', () => {
		const [p] = listOf(
			summary({
				slug: 'place-yunusobod-tumani',
				place: { slug: 'yunusobod-tumani', kind: 'district', name: T('Yunusobod'), map: '' },
				parent: { slug: 'toshkent', kind: 'city', name: T('Toshkent'), map: '' },
				face: 'yunusobod-tumani'
			})
		);
		expect(p).toMatchObject({
			place: 'yunusobod-tumani',
			path: ['uzbekistan', 'toshkent'],
			color: 1
		});
	});
	it('a mix: its parts, keeping the colours of those already in the list', () => {
		const old = removePick(list(yunusobod, buxoro, samarqand), 'place-yunusobod-tumani');
		const mix = summary({
			slug: 'mix-1',
			parts: [
				{
					slug: 'place-buxoro-viloyati',
					name: T('Buxoro'),
					places: ['buxoro-viloyati'],
					panoramas: 9
				},
				{
					slug: 'place-samarqand-viloyati',
					name: T('Samarqand'),
					places: ['samarqand-viloyati'],
					panoramas: 9
				},
				{
					slug: 'historic',
					name: T('Tarixiy'),
					places: ['buxoro-shahri', 'xiva-tumani'],
					panoramas: 9
				}
			]
		});
		const l = listOf(mix, old);
		expect(l.map((p) => [p.map, p.color])).toEqual([
			['place-buxoro-viloyati', 2],
			['place-samarqand-viloyati', 3],
			['historic', 1]
		]);
		expect(l[0].path).toEqual(['uzbekistan']); // known from before
		expect(l[2]).toMatchObject({ place: undefined, path: ['uzbekistan'] });
		expect(maps(listOf(mix, list(historic, samarqand, buxoro)))).toEqual([
			'historic',
			samarqand.map,
			buxoro.map
		]);
	});
});
