<script lang="ts">
	// The Barg: the owner's leaf coin (PLAN 9.2). Never an emoji in its place.
	let { size = 18 }: { size?: number } = $props();
	const file = $derived(size <= 16 ? 32 : size <= 32 ? 64 : size <= 64 ? 128 : 512);
</script>

<img class="coin" src={`/barg/coin-${file}.webp`} alt="" width={size} height={size} />

<style>
	.coin {
		display: inline-block;
		flex: none;
		vertical-align: -0.18em;
	}
</style>
