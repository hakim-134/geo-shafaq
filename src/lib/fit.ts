// A heading with a player's name: it wraps only at spaces, and shrinks until its longest word
// fits, so a name never breaks inside a word ("Makkajo‘xor / i 85").
export function fitWords(el: HTMLElement, _text?: string) {
	// no transition on the size while it is measured: with reduced motion every property gets a
	// tiny one (app.css), and the width read right after a change would still be the old one
	el.style.transitionProperty = 'none';
	const fit = () => {
		el.style.fontSize = '';
		let size = parseFloat(getComputedStyle(el).fontSize);
		while (el.scrollWidth > el.clientWidth && size > 12) {
			size -= 1;
			el.style.fontSize = `${size}px`;
		}
	};
	fit();
	document.fonts?.ready.then(fit);
	const seen = new ResizeObserver(fit);
	seen.observe(el);
	return { update: fit, destroy: () => seen.disconnect() };
}
