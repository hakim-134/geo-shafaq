// Small sounds, made on the spot (no files): tension near the end of a round, and the little
// rewards of a guess (the pin, the score counting up, the stars). Browsers keep audio muted
// until the player touches the page; the first tap or key unlocks it. The player can mute
// them all in the round's menu; it is remembered on this device.
import { load, save } from '#lib/storage.js';

let ctx: AudioContext | null = null;

export const sound = $state({ on: load('sound', '1') !== '0' });

export function setSound(on: boolean) {
	sound.on = on;
	save('sound', on ? '1' : '0');
	if (on) unlockAudio();
}

export function unlockAudio() {
	const AC =
		window.AudioContext ??
		(window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
	if (!AC) return;
	ctx ??= new AC();
	if (ctx.state === 'suspended') ctx.resume().catch(() => {});
}

function ready(): AudioContext | null {
	return sound.on && ctx && ctx.state === 'running' ? ctx : null;
}

/** One tone: a frequency (glides to `to` if given), how long, how loud, and its shape. */
function tone(
	freq: number,
	seconds: number,
	{
		to,
		gain = 0.12,
		type = 'sine',
		delay = 0
	}: { to?: number; gain?: number; type?: OscillatorType; delay?: number } = {}
) {
	const c = ready();
	if (!c) return;
	const at = c.currentTime + delay;
	const osc = c.createOscillator();
	const g = c.createGain();
	osc.type = type;
	osc.frequency.setValueAtTime(freq, at);
	if (to) osc.frequency.exponentialRampToValueAtTime(to, at + seconds);
	g.gain.setValueAtTime(0.0001, at);
	g.gain.exponentialRampToValueAtTime(gain, at + 0.012);
	g.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
	osc.connect(g).connect(c.destination);
	osc.start(at);
	osc.stop(at + seconds + 0.02);
}

export function beep(freq: number, seconds: number) {
	tone(freq, seconds, { gain: 0.12 });
}

/** The pin lands on the map. */
export const sfxPin = () => tone(520, 0.12, { to: 880, gain: 0.1, type: 'triangle' });

/** The guess flies off. */
export const sfxGuess = () => tone(300, 0.25, { to: 900, gain: 0.07, type: 'triangle' });

/** The score counting up: one soft tick, a little higher as it climbs (k from 0 to 1). */
export const sfxTick = (k: number) => tone(600 + 700 * k, 0.04, { gain: 0.04, type: 'square' });

/** A star pops in: the first, second and third climb a step each. */
export const sfxStar = (i: number) => {
	const f = [660, 880, 1175][i] ?? 1175;
	tone(f, 0.22, { gain: 0.1, type: 'triangle' });
	tone(f * 2, 0.16, { gain: 0.03, delay: 0.02 });
};

/** A perfect round, or a new best: a short rising fanfare. */
export const sfxFanfare = () =>
	[523, 659, 784, 1047].forEach((f, i) =>
		tone(f, i === 3 ? 0.5 : 0.16, { gain: 0.09, type: 'triangle', delay: i * 0.09 })
	);

/** A miss far away: a soft falling note, not a buzzer. */
export const sfxFar = () => tone(330, 0.3, { to: 220, gain: 0.07, type: 'sine' });

export function vibrate(ms: number | number[]) {
	if (sound.on && 'vibrate' in navigator) navigator.vibrate(ms);
}
