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

  const resolvedHeight = height || defaultHeights[variant] || '1em';
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
        class="skeleton-line"
        style:width="{i === lines - 1 ? 60 + Math.random() * 20 : 90 + Math.random() * 10}%"
        style:animation-delay="{i * 0.05}s"
      ></div>
    {/each}
  {:else if variant === 'card'}
    <div class="skeleton-card-header"></div>
    <div class="skeleton-card-body">
      <div class="skeleton-line" style:width="70%"></div>
      <div class="skeleton-line" style:width="50%"></div>
    </div>
  {:else if variant === 'table-row'}
    <div class="skeleton-row">
      <div class="skeleton-cell" style:width="15%"></div>
      <div class="skeleton-cell" style:width="35%"></div>
      <div class="skeleton-cell" style:width="20%"></div>
      <div class="skeleton-cell" style:width="15%"></div>
    </div>
  {:else if variant === 'stat'}
    <div class="skeleton-stat">
      <div class="skeleton-stat-label"></div>
      <div class="skeleton-stat-value"></div>
    </div>
  {:else}
    <!-- Default: text line -->
  {/if}
</div>

<style>
  .skeleton {
    background: linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%);
    background-size: 200% 100%;
    border-radius: 2px;
  }

  .skeleton.animated {
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

  /* Paragraph variant */
  .skeleton-paragraph {
    background: none;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .skeleton-line {
    height: 1em;
    background: linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%);
    background-size: 200% 100%;
    border-radius: 2px;
  }

  .skeleton.animated .skeleton-line {
    animation: shimmer 1.5s ease-in-out infinite;
  }

  /* Card variant */
  .skeleton-card {
    background: #f9f9f9;
    border: 1px solid #eee;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .skeleton-card-header {
    height: 20px;
    width: 60%;
    background: linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%);
    background-size: 200% 100%;
    border-radius: 2px;
  }

  .skeleton.animated .skeleton-card-header {
    animation: shimmer 1.5s ease-in-out infinite;
  }

  .skeleton-card-body {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  /* Table row variant */
  .skeleton-table-row {
    background: none;
    border-bottom: 1px solid #eee;
    padding: 0;
  }

  .skeleton-row {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 12px 0;
  }

  .skeleton-cell {
    height: 16px;
    background: linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%);
    background-size: 200% 100%;
    border-radius: 2px;
  }

  .skeleton.animated .skeleton-cell {
    animation: shimmer 1.5s ease-in-out infinite;
  }

  /* Stat variant */
  .skeleton-stat {
    background: none;
    display: flex;
    flex-direction: column;
    justify-content: center;
    height: 100%;
    gap: 8px;
    padding: 16px;
  }

  .skeleton-stat .skeleton-stat-label {
    height: 12px;
    width: 60%;
    background: linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%);
    background-size: 200% 100%;
    border-radius: 2px;
  }

  .skeleton-stat .skeleton-stat-value {
    height: 28px;
    width: 40%;
    background: linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%);
    background-size: 200% 100%;
    border-radius: 2px;
  }

  .skeleton.animated .skeleton-stat-label,
  .skeleton.animated .skeleton-stat-value {
    animation: shimmer 1.5s ease-in-out infinite;
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .skeleton.animated,
    .skeleton.animated .skeleton-line,
    .skeleton.animated .skeleton-card-header,
    .skeleton.animated .skeleton-cell,
    .skeleton.animated .skeleton-stat-label,
    .skeleton.animated .skeleton-stat-value {
      animation: none;
    }
  }
</style>
