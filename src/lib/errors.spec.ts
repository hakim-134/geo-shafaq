import { describe, expect, it, vi } from 'vitest';

vi.mock('$app/env', () => ({ version: 't' }));
vi.mock('$app/env/public', () => ({ PUBLIC_GLITCHTIP_DSN: '' }));

const { parseStack, storeUrl } = await import('./errors.js');

describe('storeUrl', () => {
	it('turns a DSN into the store endpoint', () => {
		expect(storeUrl('https://abc123@errors.example.uz/4')).toBe(
			'https://errors.example.uz/api/4/store/?sentry_version=7&sentry_key=abc123'
		);
	});
	it('is off without a DSN', () => {
		expect(storeUrl('')).toBeNull();
		expect(storeUrl('https://errors.example.uz/4')).toBeNull();
	});
});

describe('parseStack', () => {
	it('reads Chrome and Firefox stacks, innermost frame last', () => {
		const chrome =
			'TypeError: x\n    at open (https://g.uz/_app/a.js:10:5)\n    at https://g.uz/_app/b.js:2:1';
		expect(parseStack(chrome)).toEqual([
			{ function: '?', filename: 'https://g.uz/_app/b.js', lineno: 2, colno: 1 },
			{ function: 'open', filename: 'https://g.uz/_app/a.js', lineno: 10, colno: 5 }
		]);
		expect(parseStack('open@https://g.uz/a.js:10:5')).toEqual([
			{ function: 'open', filename: 'https://g.uz/a.js', lineno: 10, colno: 5 }
		]);
	});
});
