<script lang="ts">
  /**
   * GemAssetSearch — Shadow DOM widget for asset/owner search bar.
   * Mirrors embed/asset-search/+page.svelte (simplified — no hash state).
   */
  import AssetSearchBar from '$lib/components/search/AssetSearchBar.svelte';
  import { assetLink, entityLink, link, navigate } from './widget-links';

  interface Props {
    q?: string;
    mode?: string;
    modes?: string;
    showButton?: boolean;
    open?: string;
    helper?: string;
    linkBase?: string;
    linkTarget?: string;
    theme?: 'light' | 'dark';
  }

  let {
    q = '',
    mode = 'asset',
    modes = 'asset,owner,universal',
    showButton = true,
    open: openMode = 'self',
    helper = '',
    linkBase = '',
    linkTarget = '',
    theme = 'light',
  }: Props = $props();

  type SearchMode = { id: string; label: string; placeholder: string; buttonLabel: string };
  const modeDefaults: Record<string, SearchMode> = {
    asset: { id: 'asset', label: 'Assets', placeholder: 'Search assets by name, ID, owner, country, or status', buttonLabel: 'Find asset' },
    owner: { id: 'owner', label: 'Owners', placeholder: 'Search by company name or GEM entity ID', buttonLabel: 'Find owner' },
    universal: { id: 'universal', label: 'Universal', placeholder: 'Search assets and owners', buttonLabel: 'Search' },
  };

  const searchModes = $derived.by(() => {
    const ids = [...new Set(modes.split(',').map((s) => s.trim().toLowerCase()))].filter(Boolean);
    const resolved = ids.map((id) => modeDefaults[id]).filter(Boolean);
    return resolved.length > 0 ? resolved : [modeDefaults.asset];
  });

  let query = $state(q);
  let activeMode = $state(mode);

  function handleSearch(value: string, searchMode: string) {
    const trimmed = value.trim();
    if (!trimmed) return;

    // Resolve linkTarget: explicit prop wins, then legacy openMode mapping
    const target = linkTarget || (openMode === 'parent' ? 'parent' : 'blank');

    let url: string;
    if (/^[EG]\d+/.test(trimmed)) {
      url = trimmed.startsWith('E') ? entityLink(trimmed, linkBase) : assetLink(trimmed, linkBase);
    } else if (searchMode === 'owner') {
      url = link(`search?q=${encodeURIComponent(trimmed)}&type=entities`, linkBase);
    } else {
      url = link(`search?q=${encodeURIComponent(trimmed)}`, linkBase);
    }

    navigate(url, target);
  }
</script>

<div class="search-embed" class:dark={theme === 'dark'}>
  <AssetSearchBar
    bind:value={query}
    bind:activeMode
    modes={searchModes}
    {showButton}
    onSearch={handleSearch}
  />
  {#if helper}
    <p class="helper-text">{helper}</p>
  {/if}
</div>

<style>
  .search-embed {
    width: 100%;
    font-family: var(--font-family);
  }
  .helper-text {
    margin: var(--space-2) 0 0;
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    line-height: 1.4;
  }
</style>
