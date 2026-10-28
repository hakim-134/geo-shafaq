<script lang="ts">
	// Where the share sheet of the phone is missing (a computer, plain http): the link to copy
	// in one tap, and Telegram. A finished game's link, a room's invitation.
	import Sheet from './Sheet.svelte';
	import { copyText, telegramShare, type Share } from '#lib/game/share.js';
	import { t } from '#lib/i18n/index.svelte.js';
	import { showToast } from '#lib/toast.svelte.js';

	let { share, title, onclose }: { share: Share | null; title?: string; onclose: () => void } =
		$props();

	async function copy() {
		if (!share) return;
		if (await copyText(`${share.text}\n${share.url}`)) {
			showToast(t('linkCopied'));
			onclose();
		} else showToast(share.url, 6000);
	}
</script>

<Sheet open={!!share} {onclose} title={title ?? t('shareTitle')}>
	{#if share}
		<p class="text">{share.text}</p>
		<input
			class="link"
			readonly
			value={share.url}
			aria-label={t('link')}
			onfocus={(e) => e.currentTarget.select()}
		/>
		<div class="btns">
			<button class="btn btn-primary" onclick={copy}>
				<svg viewBox="0 0 24 24"
					><rect x="8" y="8" width="12" height="12" rx="2.5" /><path
						d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"
					/></svg
				>
				{t('copyLinkBtn')}
			</button>
			<a class="btn btn-telegram" href={telegramShare(share)} target="_blank" rel="noopener"
				><svg viewBox="0 0 24 24"
					><path d="M21 4 3 11l6 2.5M21 4l-4 16-8-6.5M21 4 9 13.5V19l3-3.5" /></svg
				>Telegram</a
			>
		</div>
	{/if}
</Sheet>

<style>
	.text {
		white-space: pre-line;
		font-size: 15px;
		margin-bottom: 14px;
	}
	.link {
		width: 100%;
		height: 50px;
		padding: 0 14px;
		border: 2px solid var(--border);
		border-radius: 14px;
		background: var(--bg);
		color: var(--text);
		font-size: 15px;
		font-weight: 600;
	}
	.btns {
		margin-top: 16px;
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
	}
	.btns .btn {
		padding: 0 12px;
	}
</style>
