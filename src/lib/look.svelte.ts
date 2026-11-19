// The new look (P1111 1.1) is on three screens only until the owner's yes: the home, a round,
// a round's result. Those screens switch it on here; app.css hangs it on html.look2. Session 3
// puts the look on every screen and deletes this file.
let holders = 0;

/** Call in a component's script: the new look is on while `on()` is true and the component lives. */
export function newLook(on: () => boolean = () => true) {
	$effect(() => {
		if (!on()) return;
		holders++;
		document.documentElement.classList.add('look2');
		return () => {
			// the next screen may take the look in the same tick: don't flash the old one between
			queueMicrotask(() => {
				if (--holders <= 0) {
					holders = 0;
					document.documentElement.classList.remove('look2');
				}
			});
		};
	});
}
