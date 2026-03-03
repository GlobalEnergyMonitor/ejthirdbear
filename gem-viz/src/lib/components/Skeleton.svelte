<script lang="ts">
  /**
   * Skeleton - Placeholder loading states with shimmer animation
   *
   * @example Basic text line
   * <Skeleton variant="text" />
   *
   * @example Card placeholder
   * <Skeleton variant="card" />
   *
   * @example Table rows
   * {#each Array(5) as _}
   *   <Skeleton variant="table-row" />
   * {/each}
   *
   * @example Multi-line paragraph
   * <Skeleton variant="paragraph" lines={4} />
   */

  let {
    variant = 'text',
    width = '100%',
    height,
    lines = 3,
    animated = true,
  }: {
    variant?: 'text' | 'card' | 'table-row' | 'stat' | 'paragraph';
    width?: string;
    height?: string;
    lines?: number;
    animated?: boolean;
  } = $props();

  // Default heights per variant
  const defaultHeights: Record<string, string> = {
    text: '1em',
    card: '120px',
    'table-row': '44px',
    stat: '80px',
    paragraph: 'auto',
  };

  const resolvedHeight = $derived(height || defaultHeights[variant] || '1em');
</script>

<div
  class="skeleton skeleton-{variant}"
  class:animated
  style:width
  style:height={variant !== 'paragraph' ? resolvedHeight : undefined}
>
  {#if variant === 'paragraph'}
    {#each Array(lines) as _, i}
      <div
        class="bone"
        style:width="{i === lines - 1 ? 60 + Math.random() * 20 : 90 + Math.random() * 10}%"
        style:animation-delay="{i * 0.1}s"
      ></div>
    {/each}
  {:else if variant === 'card'}
    <div class="bone bone-header" style:width="60%"></div>
    <div class="skeleton-card-body">
      <div class="bone" style:width="85%"></div>
      <div class="bone" style:width="65%"></div>
    </div>
  {:else if variant === 'table-row'}
    <div class="skeleton-row">
      <div class="bone" style:width="15%"></div>
      <div class="bone" style:width="35%"></div>
      <div class="bone" style:width="20%"></div>
      <div class="bone" style:width="15%"></div>
    </div>
  {:else if variant === 'stat'}
    <div class="skeleton-stat">
      <div class="bone" style:width="60%" style:height="12px"></div>
      <div class="bone" style:width="40%" style:height="28px"></div>
    </div>
  {:else}
    <!-- Default: text line -->
  {/if}
</div>

<style>
  .skeleton {
    --shimmer-base: var(--color-gray-200, #dce3e5);
    --shimmer-highlight: var(--color-gray-300, #becccf);
    border-radius: 4px;
  }

  /* The actual shimmer bar — shared across all variants */
  .bone {
    height: 1em;
    background: linear-gradient(
      90deg,
      var(--shimmer-base) 25%,
      var(--shimmer-highlight) 50%,
      var(--shimmer-base) 75%
    );
    background-size: 200% 100%;
    border-radius: 4px;
  }

  .skeleton.animated .bone {
    animation: shimmer 1.5s ease-in-out infinite;
  }

  @keyframes shimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }

  /* Text variant — the outer div IS the bone */
  .skeleton-text {
    background: linear-gradient(
      90deg,
      var(--shimmer-base) 25%,
      var(--shimmer-highlight) 50%,
      var(--shimmer-base) 75%
    );
    background-size: 200% 100%;
  }

  .skeleton-text.animated {
    animation: shimmer 1.5s ease-in-out infinite;
  }

  /* Paragraph variant */
  .skeleton-paragraph {
    background: none;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  /* Card variant */
  .skeleton-card {
    background: var(--color-gray-50, #f2f2eb);
    border: 1px solid var(--color-border, #dce3e5);
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .bone-header {
    height: 20px;
  }

  .skeleton-card-body {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  /* Table row variant */
  .skeleton-table-row {
    background: none;
    border-bottom: 1px solid var(--color-border, #dce3e5);
    padding: 0;
  }

  .skeleton-row {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 12px 0;
  }

  .skeleton-row .bone {
    height: 16px;
  }

  /* Stat variant */
  .skeleton-stat {
    display: flex;
    flex-direction: column;
    justify-content: center;
    height: 100%;
    gap: 8px;
    padding: 16px;
  }

  .skeleton-stat {
    background: none;
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .skeleton.animated,
    .skeleton.animated .bone {
      animation: none;
    }
  }
</style>
