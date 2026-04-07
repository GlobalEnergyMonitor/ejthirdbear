<script lang="ts">
  /**
   * Embeddable Asset/Owner Search Bar
   *
   * URL params (overridable via URL hash for Drupal deep-linking):
   *   q - Initial search query
   *   mode - Active search mode: "asset" | "owner" | "universal"
   *   modes - Comma-separated list of available modes (default: "asset,owner,universal")
   *
   * Hash params: q, mode, modes
   * writeHash is called when q or activeMode changes.
   */
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { assetLink, entityLink, link } from '$lib/links';
  import { readHash, writeHash } from '../embed-utils';

  // Check if linkBase is configured (CMS embed mode)
  const linkBase = $derived($page.url.searchParams.get('linkBase') || '');
  import AssetSearchBar from '$lib/components/search/AssetSearchBar.svelte';

  type SearchMode = {
    id: string;
    label: string;
    placeholder: string;
    buttonLabel: string;
  };

  const modeDefaults: Record<string, SearchMode> = {
    asset: {
      id: 'asset',
      label: 'Assets',
      placeholder: 'Search assets by name, ID, owner, country, or status',
      buttonLabel: 'Find asset',
    },
    owner: {
      id: 'owner',
      label: 'Owners',
      placeholder: 'Search by company name or GEM entity ID',
      buttonLabel: 'Find owner',
    },
    universal: {
      id: 'universal',
      label: 'Universal',
      placeholder: 'Search assets and owners (CMD+K style)',
      buttonLabel: 'Search',
    },
  };

  // URL params
  const openMode = $derived($page.url.searchParams.get('open') || 'self');
  const modesParam = $derived($page.url.searchParams.get('modes') || 'asset,owner,universal');
  const helperText = $derived(
    $page.url.searchParams.get('helper') ||
      'URL-first behavior: asset IDs open asset pages, owner IDs open entity pages, text queries open filtered results.'
  );
  const showButton = $derived($page.url.searchParams.get('showButton') !== 'false');

  const searchModes = $derived.by(() => {
    const ids = [...new Set(modesParam.split(',').map((id) => id.trim().toLowerCase()))].filter(
      Boolean
    );
    const resolved = ids.map((id) => modeDefaults[id]).filter(Boolean);
    return resolved.length > 0 ? resolved : [modeDefaults.asset];
  });

  let query = $state('');
  let activeMode = $state('asset');
  let syncedQuery = $state('');

  $effect(() => {
    const requestedMode = ($page.url.searchParams.get('mode') || '').toLowerCase();
    const hasRequestedMode = searchModes.some((mode) => mode.id === requestedMode);
    if (hasRequestedMode && activeMode !== requestedMode) {
      activeMode = requestedMode;
      return;
    }
    if (!searchModes.some((mode) => mode.id === activeMode)) {
      activeMode = searchModes[0].id;
    }
  });

  $effect(() => {
    const nextQuery = $page.url.searchParams.get('q') || '';
    if (nextQuery !== syncedQuery) {
      syncedQuery = nextQuery;
      query = nextQuery;
    }
  });

  onMount(() => {
    // Read hash — hash params override query params for deep-linking
    const h = readHash();
    if (h.q) {
      query = h.q;
      syncedQuery = h.q;
    }
    if (h.mode) {
      const m = h.mode.toLowerCase();
      if (searchModes.some((mode) => mode.id === m)) activeMode = m;
    }
  });

  function looksLikeOwnerId(value: string): boolean {
    return /^E\d+$/i.test(value);
  }

  function looksLikeAssetId(value: string): boolean {
    return /^(?:[A-Z]\d{4,}(?:_[A-Z]\d{4,})?)$/i.test(value);
  }

  function resolveTarget(rawQuery: string, mode: string): string {
    const q = rawQuery.trim();
    if (!q) return '';

    if (mode === 'asset') {
      if (looksLikeAssetId(q)) return assetLink(q.toUpperCase());
      return `${link('compose')}?search=${encodeURIComponent(q)}`;
    }

    if (mode === 'owner') {
      if (looksLikeOwnerId(q)) return entityLink(q.toUpperCase());
      return `${link('screener/owners')}?q=${encodeURIComponent(q)}`;
    }

    if (looksLikeOwnerId(q)) return entityLink(q.toUpperCase());
    if (looksLikeAssetId(q)) return assetLink(q.toUpperCase());
    return `${link('compose')}?search=${encodeURIComponent(q)}`;
  }

  function updateEmbedUrl(rawQuery: string, mode: string) {
    const params = new URLSearchParams($page.url.searchParams);
    const q = rawQuery.trim();
    if (q) params.set('q', q);
    else params.delete('q');
    params.set('mode', mode);

    const queryString = params.toString();
    const href = `${link('embed/asset-search')}${queryString ? `?${queryString}` : ''}`;
    goto(href, { replaceState: true, noScroll: true, keepFocus: true });

    // Also write hash so Drupal embeds can deep-link to this state
    writeHash({ q: q || null, mode });
  }

  function runSearch(rawQuery: string, mode?: string) {
    const selectedMode = mode || activeMode;
    activeMode = selectedMode;
    query = rawQuery;

    const target = resolveTarget(rawQuery, selectedMode);
    const opensNewTab = openMode === 'new-tab';

    if (opensNewTab) {
      updateEmbedUrl(rawQuery, selectedMode);
      if (target) {
        // When linkBase is set, use goto() so EmbedShell's beforeNavigate can
        // rewrite the URL for the CMS. Otherwise, open directly in a new tab.
        if (linkBase) {
          goto(target);
        } else {
          window.open(target, '_blank', 'noopener,noreferrer');
        }
      }
      return;
    }

    if (!target) {
      updateEmbedUrl('', selectedMode);
      return;
    }
    goto(target);
  }
</script>

<svelte:head>
  <title>Asset/Owner Search — GEM Embed</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="search-embed">
  <AssetSearchBar
    bind:value={query}
    bind:activeMode
    modes={searchModes}
    compact={true}
    {showButton}
    {helperText}
    onSearch={runSearch}
  />
</div>

<style>
  .search-embed {
    width: 100%;
    max-width: 920px;
    padding: 16px;
    box-sizing: border-box;
  }

  @media (max-width: 640px) {
    .search-embed {
      max-width: 100%;
      padding: 8px;
    }
  }
</style>
