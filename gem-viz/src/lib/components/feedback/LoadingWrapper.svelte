<script lang="ts">
  /**
   * LoadingWrapper
   *
   * Standardized loading/error/empty state wrapper.
   * Eliminates the repeated {#if loading} / {:else if error} / {:else} pattern.
   *
   * @example
   * <LoadingWrapper {loading} {error} empty={items.length === 0}>
   *   <ul>
   *     {#each items as item}
   *       <li>{item.name}</li>
   *     {/each}
   *   </ul>
   * </LoadingWrapper>
   *
   * @example With skeleton loading
   * <LoadingWrapper {loading} {error} skeleton="card">
   *   ...
   * </LoadingWrapper>
   *
   * @example With multiple skeleton rows
   * <LoadingWrapper {loading} {error} skeleton="table-row" skeletonCount={5}>
   *   ...
   * </LoadingWrapper>
   */

  import { type Snippet } from 'svelte';
  import Skeleton from './Skeleton.svelte';
  import Spinner from './Spinner.svelte';

  let {
    loading = false,
    error = null,
    empty = false,
    loadingMessage = 'Loading...',
    errorMessage = null, // Uses error prop if not provided
    emptyMessage = 'No data available',
    queryTime = null,
    skeleton = null,
    skeletonCount = 1,
    children,
    loadingSlot = null,
    errorSlot = null,
    emptySlot = null,
  }: {
    loading?: boolean;
    error?: string | null;
    empty?: boolean;
    loadingMessage?: string;
    errorMessage?: string | null;
    emptyMessage?: string;
    queryTime?: number | null;
    skeleton?: 'text' | 'card' | 'table-row' | 'stat' | 'paragraph' | null;
    skeletonCount?: number;
    children: Snippet;
    loadingSlot?: Snippet | null;
    errorSlot?: Snippet<[string]> | null;
    emptySlot?: Snippet | null;
  } = $props();

  const displayError = $derived(errorMessage || error);
</script>

{#if loading}
  {#if loadingSlot}
    {@render loadingSlot()}
  {:else if skeleton}
    <div class="loading-wrapper-state loading skeleton-container">
      {#each Array(skeletonCount) as _}
        <Skeleton variant={skeleton} />
      {/each}
    </div>
  {:else}
    <div class="loading-wrapper-state loading">
      <Spinner />
      <p>{loadingMessage}</p>
    </div>
  {/if}
{:else if error}
  {#if errorSlot}
    {@render errorSlot(displayError || 'Unknown error')}
  {:else}
    <div class="loading-wrapper-state error">
      <p class="error-message">{displayError}</p>
    </div>
  {/if}
{:else if empty}
  {#if emptySlot}
    {@render emptySlot()}
  {:else}
    <div class="loading-wrapper-state empty">
      <p>{emptyMessage}</p>
    </div>
  {/if}
{:else}
  {#if queryTime !== null}
    <div class="query-time">{queryTime}ms</div>
  {/if}
  {@render children()}
{/if}

<style>
  .loading-wrapper-state {
    padding: var(--space-6);
    text-align: center;
    color: var(--color-text-secondary);
  }

  .loading-wrapper-state p {
    margin: var(--space-2) 0 0 0;
    font-size: var(--font-size-body);
  }

  .loading-wrapper-state.error {
    color: var(--color-error);
    background: var(--color-error-light);
    border: var(--border-width) solid var(--color-error);
  }

  .loading-wrapper-state.empty {
    color: var(--color-text-tertiary);
    background: var(--color-bg-secondary);
    border: var(--border-width) dashed var(--color-border);
  }

  .error-message {
    font-family: var(--font-family-mono);
  }

  .query-time {
    position: absolute;
    top: var(--space-2);
    right: var(--space-2);
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    font-family: var(--font-family-mono);
  }

  .skeleton-container {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: 0;
    background: none;
  }
</style>
