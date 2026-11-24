export const roomLobbyContext = Symbol('room lobby');
export type SetRoomLobby = (code: string | null) => void;

export function activeTab(path: string): 'play' | 'friends' | 'learn' | 'profile' | undefined {
	const [root, sub] = path.split('/').slice(1);
	if (!root) return 'play';
	if (root === 'friends' || root === 'room') return 'friends';
	if (root === 'learn' || (root === 'me' && (sub === 'missed' || sub === 'streets')))
		return 'learn';
	if (['me', 'settings', 'shop', 'games'].includes(root)) return 'profile';
}
