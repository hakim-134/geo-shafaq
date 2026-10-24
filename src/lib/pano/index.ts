import type { PanoViewer, ViewerOptions } from './types';
import { PanoError } from './types';

/** Makes the viewer for a provider. Each one's code (and SDK) loads only when a round needs it. */
export async function createViewer(
	provider: string,
	el: HTMLElement,
	opts: ViewerOptions
): Promise<PanoViewer> {
	switch (provider) {
		case 'yandex':
			return (await import('./yandex')).createYandex(el, opts);
		case 'demo':
		case 'own':
			return (await import('./sphere')).createSphere(el, opts);
	}
	throw new PanoError('unsupported');
}

export * from './types';
