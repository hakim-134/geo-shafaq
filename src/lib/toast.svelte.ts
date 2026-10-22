export const toast = $state({ text: '', shown: false });

let timer: ReturnType<typeof setTimeout> | undefined;

export function showToast(text: string, ms = 2200) {
	toast.text = text;
	toast.shown = true;
	clearTimeout(timer);
	timer = setTimeout(() => (toast.shown = false), ms);
}
