<script lang="ts">
	// A player's map: its name, who plays it, and for a public one what it's about. The maker's second
	// screen and the owner's settings. The one button belongs to the page around it.
	import { t, type Key } from '#lib/i18n/index.svelte.js';
	import type { Schemas } from '#lib/api/client.js';

	type Vis = Schemas['MapVisibility'];
	let {
		name = $bindable(),
		visibility = $bindable(),
		tags = $bindable()
	}: { name: string; visibility: Vis; tags: string[] } = $props();

	const TAGS = ['mahalla', 'shahar', 'kocha', 'tarixiy', 'bozor', 'metro', 'oliygoh', 'tabiat'];
	const whoIcons: Record<Vis, string> = {
		private: 'M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z',
		unlisted:
			'M10 14a4 4 0 0 0 6 .5l3-3a4 4 0 0 0-6-5.5l-1 1M14 10a4 4 0 0 0-6-.5l-3 3a4 4 0 0 0 6 5.5l1-1',
		public:
			'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9s1.3-6.4 3.8-9z'
	};

	function toggle(tag: string) {
		if (tags.includes(tag)) tags = tags.filter((x) => x !== tag);
		else if (tags.length < 4) tags = [...tags, tag];
	}
</script>

<label class="field">
	<span>{t('mkName')}</span>
	<input bind:value={name} maxlength="40" autocomplete="off" enterkeyhint="done" />
</label>

<div class="field">
	<span>{t('mkWho')}</span>
	<div class="who" role="radiogroup" aria-label={t('mkWho')}>
		{#each ['private', 'unlisted', 'public'] as const as v (v)}
			<button role="radio" aria-checked={visibility === v} onclick={() => (visibility = v)}>
				<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><path d={whoIcons[v]} /></svg>
				{t(`vis_${v}` as Key)}
			</button>
		{/each}
	</div>
	{#if visibility === 'public'}
		<p class="note">{t('visPublicNote')}</p>
	{/if}
</div>

{#if visibility === 'public'}
	<div class="field">
		<span>{t('mkTags')}</span>
		<div class="tags">
			{#each TAGS as tag (tag)}
				<button class="tag" aria-pressed={tags.includes(tag)} onclick={() => toggle(tag)}>
					{t(`tag_${tag}` as Key)}
				</button>
			{/each}
		</div>
	</div>
{/if}

<style>
	.field {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.field > span {
		font-weight: 700;
		font-size: 15px;
	}
	input {
		height: 56px;
		padding: 0 16px;
		border-radius: 16px;
		border: 2px solid var(--border);
		background: var(--surface);
		color: var(--text);
		font-family: var(--display);
		font-weight: 700;
		font-size: 18px;
		width: 100%;
	}
	input:focus {
		outline: none;
		border-color: var(--sky);
	}
	.who {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 8px;
	}
	.who button {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 6px;
		min-height: 84px;
		padding: 8px 4px;
		border-radius: 16px;
		border: 2px solid var(--border);
		background: var(--surface);
		color: var(--text);
		font-weight: 700;
		font-size: 13.5px;
	}
	.who button[aria-checked='true'] {
		border-color: var(--sky);
		background: color-mix(in srgb, var(--sky) 12%, var(--surface));
	}
	.who .icon {
		width: 26px;
		height: 26px;
	}
	.note {
		font-size: 13.5px;
		color: var(--muted);
	}
	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
</style>
