<script lang="ts">
	import { arc as d3Arc } from 'd3-shape';
	import { scaleLinear } from 'd3-scale';
	import { colors } from '$lib/design-tokens';

	interface DataItem {
		label: string;
		value: number;
		color?: string;
	}

	interface Props {
		data?: DataItem[];
		size?: number;
		maxValue?: number;
		startAngle?: number;
		padAngle?: number;
		cornerRadius?: number;
		ringWidth?: number;
		ringGap?: number;
		showLegend?: boolean;
		backgroundOpacity?: number;
	}

	let {
		data = [],
		size = 240,
		maxValue,
		startAngle = -Math.PI / 2,
		padAngle = 0,
		cornerRadius = 2,
		ringWidth = 18,
		ringGap = 4,
		showLegend = true,
		backgroundOpacity = 0.12
	}: Props = $props();

	const defaultColors = ['#9DF7E5', '#1D4961', '#FE4F2D', '#A0AAE5', '#CA4A50', '#7F142A'];

	const cx = $derived(size / 2);
	const cy = $derived(size / 2);

	const computedMax = $derived(maxValue ?? Math.max(...data.map((d) => d.value), 1));

	const angleScale = $derived(
		scaleLinear()
			.domain([0, computedMax])
			.range([0, Math.PI * 2])
			.clamp(true)
	);

	const rings = $derived.by(() => {
		if (!data.length) return [];

		const totalRingsWidth = data.length * ringWidth + (data.length - 1) * ringGap;
		const outerMax = Math.min(cx, cy) - 4;
		const innerMin = outerMax - totalRingsWidth;

		return data
			.map((d, i) => {
				const color = d.color ?? defaultColors[i % defaultColors.length];
				const outerR = outerMax - i * (ringWidth + ringGap);
				const innerR = outerR - ringWidth;
				const endAngle = startAngle + angleScale(d.value);

				const arcGen = d3Arc<unknown>()
					.innerRadius(innerR)
					.outerRadius(outerR)
					.cornerRadius(cornerRadius)
					.startAngle(startAngle + padAngle)
					.endAngle(endAngle);

				const bgArc = d3Arc<unknown>()
					.innerRadius(innerR)
					.outerRadius(outerR)
					.cornerRadius(cornerRadius)
					.startAngle(startAngle + padAngle)
					.endAngle(startAngle + Math.PI * 2);

				return {
					...d,
					color,
					innerR,
					outerR,
					path: arcGen(null as any) ?? '',
					bgPath: bgArc(null as any) ?? '',
					pct: computedMax > 0 ? Math.round((d.value / computedMax) * 100) : 0
				};
			})
			.reverse();
	});
</script>

<div class="radial-bar-chart">
	<svg
		width={size}
		height={size}
		viewBox="0 0 {size} {size}"
		role="img"
		aria-label="Radial bar chart"
	>
		<g transform="translate({cx},{cy})">
			{#each rings as ring (ring.label)}
				<path d={ring.bgPath} fill={ring.color} opacity={backgroundOpacity} />
				<path d={ring.path} fill={ring.color} class="ring-arc" />
			{/each}
		</g>
	</svg>

	{#if showLegend && data.length}
		<div class="legend">
			{#each data as d, i}
				{@const color = d.color ?? defaultColors[i % defaultColors.length]}
				<div class="legend-item">
					<span class="swatch" style:background={color}></span>
					<span class="legend-label">{d.label}</span>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.radial-bar-chart {
		display: inline-flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-3, 12px);
	}

	svg {
		display: block;
		width: 100%;
		height: auto;
		max-width: 100%;
	}

	.ring-arc {
		transition: opacity var(--transition-base, 150ms ease);
	}

	.ring-arc:hover {
		opacity: 0.85;
	}

	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3, 12px);
		justify-content: center;
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: var(--space-1, 4px);
	}

	.swatch {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.legend-label {
		font-family: var(--font-family-data, 'Barlow Semi-Condensed', sans-serif);
		font-size: var(--font-size-xs, 10px);
		color: var(--color-text-secondary, #4c6267);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
</style>
