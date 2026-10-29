import { describe, expect, it } from 'vitest';
import { i18n, t } from './index.svelte';

describe('t', () => {
	it('says a place as each language does', () => {
		i18n.lang = 'en';
		expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map((n) => t('yourPlace', { n }))).toEqual([
			'You came 1st',
			'You came 2nd',
			'You came 3rd',
			'You came 4th',
			'You came 11th',
			'You came 12th',
			'You came 13th',
			'You came 21st',
			'You came 22nd'
		]);
		i18n.lang = 'ru';
		expect(t('yourPlace', { n: 2 })).toBe('Вы на 2-м месте');
		i18n.lang = 'uz';
		expect(t('yourPlace', { n: 2 })).toBe('Siz 2-o‘rindasiz');
	});
});
