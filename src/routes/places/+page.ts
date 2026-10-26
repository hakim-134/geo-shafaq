// The place picker starts at the country.
import { redirect } from '@sveltejs/kit';

export function load() {
	redirect(307, '/places/uzbekistan');
}
