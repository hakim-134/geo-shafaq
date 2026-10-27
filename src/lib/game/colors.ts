// A colour for each player of a room, by their place in it: their pin on the result map and
// the ring around their avatar. The real place is the flag (map.ts flagSvg), and green stays its
// colour, so no player gets green.
const PLAYER_COLORS = [
	'#0099b5',
	'#ce1126',
	'#e0a31e',
	'#7b4fd6',
	'#e46b16',
	'#2b6cb0',
	'#d6336c',
	'#0f8a7a',
	'#8a5a2b',
	'#5c6f82',
	'#a03fb5',
	'#b8860b'
];

export const playerColor = (i: number) => PLAYER_COLORS[((i % 12) + 12) % 12];
