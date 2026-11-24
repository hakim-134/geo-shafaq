<script lang="ts">
	import { page } from '$app/state';
	import Room from './Room.svelte';

	const code = $derived((page.params.code ?? '').toUpperCase());
</script>

{#key code}
	<Room roomCode={code} />
{/key}
