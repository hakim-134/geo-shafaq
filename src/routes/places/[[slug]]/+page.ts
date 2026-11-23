// The places page went into the home's map (P1111 1.3): an old link opens the home with its map
// at that place (`?pick=` was a place marked inside it).
import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ params, url }) => {
	const at = url.searchParams.get('pick') || params.slug;
	redirect(307, at ? `/?at=${encodeURIComponent(at)}` : '/');
};
