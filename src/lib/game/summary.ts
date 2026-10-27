// A game's settings past its three facts (RulesFacts: difficulty, rounds, time) in one line:
// "1 yordam · joyida · kompassiz". A room's lobby shows it under the facts.
import { t } from '#lib/i18n/index.svelte.js';
import type { Choice } from '#lib/rules.js';

export function extras(c: Choice, canMove: boolean): string {
	return [
		c.hints.count ? t('nHints', { n: c.hints.count }) : t('hintsNone').toLowerCase(),
		c.movement !== 'move' || !canMove
			? t(`move_${canMove ? c.movement : 'nomove'}`).toLowerCase()
			: '',
		c.compass ? '' : t('noCompass')
	]
		.filter(Boolean)
		.join(' · ');
}
