// The game's settings in one line: "Oson · 5 raund · vaqtsiz · 1 yordam". The home's folded
// settings, and a room's rules in its lobby.
import { t } from '#lib/i18n/index.svelte.js';
import { fmtClock } from '#lib/format.js';
import type { Choice } from '#lib/rules.js';

export function summary(c: Choice, canMove: boolean): string {
	return [
		t(`diff_${c.preset}`),
		c.rounds ? t('nRounds', { n: c.rounds }) : t('endlessShort'),
		c.timeSec ? fmtClock(c.timeSec) : t('noTimeLimit'),
		c.hints.count ? t('nHints', { n: c.hints.count }) : t('hintsNone').toLowerCase(),
		c.movement !== 'move' || !canMove
			? t(`move_${canMove ? c.movement : 'nomove'}`).toLowerCase()
			: '',
		c.compass ? '' : t('noCompass')
	]
		.filter(Boolean)
		.join(' · ');
}
