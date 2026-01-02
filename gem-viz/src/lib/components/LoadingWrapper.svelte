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
      <div class="spinner"></div>
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
    padding: 24px;
    text-align: center;
    color: #666;
  }

  .loading-wrapper-state p {
    margin: 8px 0 0 0;
    font-size: 14px;
  }

  .loading-wrapper-state.error {
    color: #c00;
    background: #fff0f0;
    border: 1px solid #fcc;
  }

  .loading-wrapper-state.empty {
    color: #888;
    background: #f9f9f9;
    border: 1px dashed #ddd;
  }

  .error-message {
    font-family: monospace;
  }

  .spinner {
    width: 24px;
    height: 24px;
    margin: 0 auto;
    border: 2px solid #eee;
    border-top-color: #333;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .query-time {
    position: absolute;
    top: 8px;
    right: 8px;
    font-size: 11px;
    color: #999;
    font-family: monospace;
  }

  .skeleton-container {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 0;
    background: none;
  }
</style>
