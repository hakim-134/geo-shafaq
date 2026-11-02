// A heading with a player's name: it wraps only at spaces, and shrinks until its longest word
// fits, so a name never breaks inside a word ("Makkajo‘xor / i 85").
export function fitWords(el: HTMLElement, _text?: string) {
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
