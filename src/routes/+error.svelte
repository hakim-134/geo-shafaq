<script lang="ts">
	// An address that is not in the game: a lost player, not a stack trace. The picture is the
	// game's own: Uzbekistan's milk tiles on the ground, and beside them a gold pin with a "?",
	// standing off the map and looking round. One line, one green key home.
	import GameBar from '#lib/components/GameBar.svelte';
	import PlaceInParent from '#lib/maps/PlaceInParent.svelte';
	import { t } from '#lib/i18n/index.svelte.js';
	import { ensureSession } from '#lib/session.svelte.js';

	ensureSession().catch(() => {}); // the top bar shows who is playing
</script>

<GameBar standalone />

<main class="lost">
	<div class="pic" aria-hidden="true">
		<!-- the country's parts, none of them lit: nowhere is the place -->
		<span class="land"><PlaceInParent parent="uzbekistan" /></span>
		<span class="shadow"></span>
		<svg class="pin" viewBox="0 0 64 84">
			<defs>
				<linearGradient id="lost-gold" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0" style:stop-color="var(--gold-hi)" />
					<stop offset="1" style:stop-color="var(--gold)" />
				</linearGradient>
			</defs>
			<path class="lip" d="M32 82C32 82 6 52 6 30a26 26 0 0 1 52 0c0 22-26 52-26 52Z" />
			<path class="body" d="M32 78C32 78 6 50 6 28a26 26 0 0 1 52 0c0 22-26 50-26 50Z" />
			<circle class="disc" cx="32" cy="28" r="15" />
			<text x="32" y="29.5">?</text>
		</svg>
	</div>
	<h1 class="d float">{t('notFoundTitle')}</h1>
	<p>{t('notFoundText')}</p>
	<a class="btn btn-primary home" href="/"><span class="lbl">{t('home')}</span></a>
</main>

<style>
	.lost {
		max-width: 440px;
		margin: 0 auto;
		padding: 28px 24px 48px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
		text-align: center;
	}
	.pic {
		position: relative;
		width: min(100%, 320px);
		aspect-ratio: 32 / 23;
		margin-bottom: 8px;
	}
	/* milk tiles floating on the ground, as the home's map */
	.land {
		position: absolute;
		left: 0;
		right: 14%;
		bottom: 0;
		height: 78%;
		filter: drop-shadow(0 0 14px var(--map-glow)) drop-shadow(0 4px 0 var(--map-shadow));
	}
	/* the pin stands off the map, in the empty sky at the top right, and looks round */
	.pin {
		position: absolute;
		right: 2%;
		top: 0;
		width: 22%;
		overflow: visible;
		transform-origin: 50% 97%;
		animation: look 2.8s ease-in-out infinite;
		filter: drop-shadow(0 6px 8px rgba(0, 0, 0, 0.25));
	}
	.lip {
		fill: var(--gold-lo);
	}
	.body {
		fill: url(#lost-gold);
	}
	.disc {
		fill: #fff;
	}
	.pin text {
		font-family: var(--f-disp);
		font-weight: 900;
		font-size: 22px;
		fill: var(--gold-ink);
		text-anchor: middle;
		dominant-baseline: middle;
	}
	.shadow {
		position: absolute;
		right: 4%; /* under the pin's tip */
		top: 37%;
		width: 18%;
		height: 5%;
		border-radius: 50%;
		background: rgba(2, 30, 36, 0.35);
		animation: shade 2.8s ease-in-out infinite;
	}
	@keyframes look {
		0%,
		100% {
			transform: rotate(0deg) translateY(0);
		}
		25% {
			transform: rotate(-9deg) translateY(-3px);
		}
		50% {
			transform: rotate(0deg) translateY(0);
		}
		75% {
			transform: rotate(9deg) translateY(-3px);
		}
	}
	@keyframes shade {
		25%,
		75% {
			transform: scaleX(0.85);
			opacity: 0.8;
		}
	}
	h1 {
		max-width: 100%;
		font-size: 30px;
		line-height: 1.1;
		color: var(--on-ground);
	}
	p {
		max-width: 320px;
		color: var(--on-ground-2);
		font-size: 16px;
		font-weight: 600;
		line-height: 1.45;
	}
	.home {
		margin-top: 10px;
		width: min(100%, 320px);
	}
	@media (min-width: 961px) {
		.lost {
			padding-top: 72px;
		}
		.pic {
			width: 380px;
		}
		h1 {
			font-size: 38px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.pin,
		.shadow {
			animation: none;
		}
	}
</style>
