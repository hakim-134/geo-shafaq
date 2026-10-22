<script lang="ts">
	// The classic compass: the red end points north. More styles (GeoGuessr-like strip,
	// mnemonic animals) come with the settings in Phase 4.
	let { heading }: { heading: number } = $props();
</script>

<div class="compass" role="img" aria-label={`${Math.round(heading)}°`}>
	<svg viewBox="0 0 48 48" style:transform={`rotate(${-heading}deg)`}>
		<circle cx="24" cy="24" r="22" class="ring" />
		<path d="M24 6 29 24H19z" class="north" />
		<path d="M24 42 19 24h10z" class="south" />
		<circle cx="24" cy="24" r="2.6" class="hub" />
	</svg>
</div>

<style>
	.compass {
		width: 52px;
		height: 52px;
		border-radius: 50%;
		background: var(--hud);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		display: grid;
		place-items: center;
		box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3);
	}
	svg {
		width: 46px;
		height: 46px;
		transition: transform 0.08s linear;
	}
	.ring {
		fill: none;
		stroke: rgba(255, 255, 255, 0.25);
		stroke-width: 1.5;
	}
	.north {
		fill: #ce1126;
	}
	.south {
		fill: #fff;
	}
	.hub {
		fill: #13233f;
		stroke: #fff;
		stroke-width: 1;
	}
</style>
