// Small sounds for tension near the end of a round. Browsers keep audio muted until the
// player touches the page; the first tap or key unlocks it.
let ctx: AudioContext | null = null;

export function unlockAudio() {
	const AC =
		window.AudioContext ??
		(window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
	if (!AC) return;
	ctx ??= new AC();
	if (ctx.state === 'suspended') ctx.resume().catch(() => {});
}

export function beep(freq: number, seconds: number) {
	if (!ctx || ctx.state !== 'running') return;
	const now = ctx.currentTime;
	const osc = ctx.createOscillator();
	const gain = ctx.createGain();
	osc.frequency.value = freq;
	gain.gain.setValueAtTime(0.12, now);
	gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
	osc.connect(gain).connect(ctx.destination);
	osc.start(now);
	osc.stop(now + seconds);
}

export function vibrate(ms: number) {
	if ('vibrate' in navigator) navigator.vibrate(ms);
}
