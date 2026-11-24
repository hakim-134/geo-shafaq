import { describe, expect, it } from 'vitest';
import { activeTab } from './tabs.js';

describe('the active tab', () => {
	it.each([
		['/', 'play'],
		['/friends', 'friends'],
		['/room/ABC23', 'friends'],
		['/learn', 'learn'],
		['/me/streets/', 'learn'],
		['/me/missed', 'learn'],
		['/me', 'profile'],
		['/me/accounts', 'profile'],
		['/me/edit', 'profile'],
		['/me/records', 'profile'],
		['/me/wallet', 'profile'],
		['/settings', 'profile'],
		['/shop', 'profile'],
		['/games', 'profile'],
		['/game/id', undefined],
		['/u/id', undefined],
		['/c/code', undefined],
		['/games-night', undefined]
	])('matches %s to %s', (path, tab) => {
		expect(activeTab(path)).toBe(tab);
	});
});
