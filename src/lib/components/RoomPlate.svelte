<script lang="ts">
	import { tick } from 'svelte';
	import { t } from '#lib/i18n/index.svelte.js';

	let { code, onjoin }: { code?: string; onjoin?: (code: string) => void } = $props();
	let entered = $state('');
	let input = $state<HTMLInputElement>();

	function join(event: SubmitEvent) {
		event.preventDefault();
		if (/^[A-Za-z2-9]{5}$/.test(entered)) onjoin?.(entered.toUpperCase());
	}

	$effect(() => {
		if (input) void tick().then(() => input?.focus());
	});
</script>

{#snippet flag()}
	<span class="end" aria-hidden="true"><i></i><b>UZ</b></span>
{/snippet}

{#if code}
	<div class="plate" role="img" aria-label={t('room') + ' ' + code}>
		<strong>{code}</strong>
		{@render flag()}
	</div>
{:else}
	<form class="plate type" onsubmit={join}>
		<input
			aria-label={t('haveCode')}
			bind:this={input}
			bind:value={entered}
			oninput={(event) => {
				entered = event.currentTarget.value.trim();
				if (/^[A-Za-z2-9]{5}$/.test(entered)) event.currentTarget.form?.requestSubmit();
			}}
			placeholder="·····"
			maxlength="5"
			autocomplete="off"
			autocapitalize="characters"
			spellcheck="false"
			enterkeyhint="go"
		/>
		{@render flag()}
	</form>
{/if}

<style>
	/* An Uzbek number plate keeps its own white and black in both themes. */
	.plate {
		display: inline-flex;
		align-items: stretch;
		border: 3px solid #101418;
		border-radius: 10px;
		background: #fff;
		color: #101418;
		box-shadow:
			0 3px 0 var(--stack),
			0 8px 16px var(--shade);
		overflow: hidden;
	}
	.plate strong,
	.plate input {
		padding: 3px 8px 2px 12px;
		font: 900 22px/1.15 var(--f-disp);
		letter-spacing: 0.16em;
	}
	.end {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		padding: 0 5px;
		border-left: 2px solid #101418;
	}
	.end i {
		width: 19px;
		height: 11px;
		border: 1px solid #101418;
		background: linear-gradient(
			to bottom,
			#0099b5 0 30%,
			#ce1126 30% 40%,
			#fff 40% 60%,
			#ce1126 60% 70%,
			#1eb53a 70%
		);
	}
	.end b {
		font: 900 9px/1 var(--f-disp);
	}
	.type {
		display: flex;
		width: min(100%, 270px);
		min-height: 54px;
		margin: 6px auto 10px;
	}
	.type:focus-within {
		outline: 3px solid var(--gold);
	}
	.type input {
		flex: 1;
		min-width: 0;
		border: 0;
		outline: 0;
		background: transparent;
		color: inherit;
		text-align: center;
		text-transform: uppercase;
		font-size: 28px;
	}
	.type .end {
		padding-inline: 10px;
	}
</style>
