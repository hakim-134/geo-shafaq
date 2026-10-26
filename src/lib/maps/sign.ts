// Every official map looks like a road sign of Uzbekistan: the street map is a blue street
// plate, the whole city a white town sign, the old cities a brown sign for sights, the whole
// country a green highway sign. A map without its own sign (players' maps, later) is blue.
export type SignKind = 'blue' | 'white' | 'brown' | 'green';

const kinds: Record<string, SignKind> = {
	'tashkent-streets': 'blue',
	tashkent: 'white',
	historic: 'brown',
	uzbekistan: 'green'
};

export const signKind = (slug: string): SignKind => kinds[slug] ?? 'blue';
