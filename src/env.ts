// Settings from .env.local (see .env.example). All public: they are built into the page and
// every visitor can read them. The Yandex key is protected by its allowed referrers, not by
// secrecy.
import { defineEnvVars } from '@sveltejs/kit/env';

const optional = (v: string | undefined) => v ?? '';

export const variables = defineEnvVars({
	PUBLIC_YANDEX_KEY: {
		public: true,
		static: true,
		schema: optional,
		description:
			'Yandex Maps JS API key (developer.tech.yandex.ru); allowed referrers: localhost, geo.shafaq.uz'
	},
	PUBLIC_API_URL: {
		public: true,
		static: true,
		schema: optional,
		description:
			'Where the API is; empty = api.geo.shafaq.uz on the site, the same host on :8131 elsewhere'
	},
	PUBLIC_GLITCHTIP_DSN: {
		public: true,
		static: true,
		schema: optional,
		description: 'Error tracking (GlitchTip project DSN); empty = off, as in development'
	}
});
