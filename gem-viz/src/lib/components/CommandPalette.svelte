<script>
  /**
   * CommandPalette - Global search with Cmd+K
   *
   * A spotlight-style search across assets and entities.
   * Opens with Cmd+K (or Ctrl+K on Windows).
   *
   * Features:
   * - BM25-inspired ranking with importance boosting
   * - Multi-term AND search
   * - Fuzzy matching with Levenshtein distance
   * - Status-based boosting (operating > proposed > cancelled)
   * - Match highlighting
   * - Recent searches with localStorage
   * - Quick tracker filters
   */
  import { onMount, onDestroy, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';
  import { assetLink, entityLink } from '$lib/links';
  import { colorByStatus } from '$lib/ownership-theme';
  import TrackerIcon from './TrackerIcon.svelte';
  import MiniFlower from './MiniFlower.svelte';
  import { staggerIn, modalIn, modalOut } from '$lib/animations';
  import { animate } from 'animejs';
  import { widgetQuery, initWidgetDB } from '$lib/widgets/widget-utils';

  // ---------------------------------------------------------------------------
  // Props
  // ---------------------------------------------------------------------------
  let {
    embedded = false,
    placeholder = 'Search assets, entities, or IDs...',
    limit: _limit = 10, // Reserved for future use
  } = $props();

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  let open = $state(false);
  let query = $state('');
  let results = $state({ assets: [], entities: [] });
  let loading = $state(false);
  let selectedIndex = $state(0);
  let searchTime = $state(0);
  let inputEl = $state(null);
  let debounceTimer;
  let recentSearches = $state([]);
  let activeFilter = $state(null); // null, 'coal', 'gas', 'oil', 'steel'
  let searchMode = $state('all'); // 'all', 'assets', 'entities'
  let filterCounts = $state({ coal: 0, gas: 0, oil: 0, steel: 0, bio: 0 });
  let useGW = $state(false); // Units toggle: false = MW, true = GW
  let hoveredItem = $state(null);
  let hoverPreview = $state(null);
  let hoverTimeout = null;
  let paletteEl = $state(null);
  let resultsEl = $state(null);
  let backdropEl = $state(null);

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------
  const allResults = $derived([
    ...(searchMode !== 'entities' ? results.assets.map((r) => ({ ...r, type: 'asset' })) : []),
    ...(searchMode !== 'assets' ? results.entities.map((r) => ({ ...r, type: 'entity' })) : []),
  ]);
  const hasResults = $derived(allResults.length > 0);
  const totalCount = $derived(results.assets.length + results.entities.length);
  const showingRecent = $derived(query.length < 2 && recentSearches.length > 0 && !activeFilter);

  // ---------------------------------------------------------------------------
  // BM25 Search Configuration
  // ---------------------------------------------------------------------------
  const SEARCH_CONFIG = {
    // Match type weights (text relevance)
    exactMatch: 100, // Exact match on name
    prefixMatch: 60, // Starts with query
    wordBoundary: 40, // Match at word boundary
    containsMatch: 20, // Contains query anywhere
    idMatch: 30, // Match on ID field
    fuzzyMatch: 15, // Fuzzy/Levenshtein match
    countryMatch: 25, // Match on country
    trackerMatch: 20, // Match on tracker name

    // Importance boost weights (log-scaled)
    capacityWeight: 15, // Per log10(MW) for assets
    assetCountWeight: 20, // Per log10(assets) for entities
    trackerBonus: 10, // Bonus per additional tracker (multi-sector)

    // Status boost (operating assets are more relevant)
    statusBoost: {
      operating: 20,
      construction: 15,
      'pre-permit': 10,
      permitted: 10,
      announced: 5,
      shelved: -5,
      cancelled: -10,
      retired: -5,
      mothballed: 0,
    },

    // Multi-term bonus (rewards matching multiple search terms)
    multiTermBonus: 30,
  };

  // Tracker filter mappings
  const TRACKER_FILTERS = {
    coal: ['Global Coal Plant Tracker', 'Global Coal Mine Tracker'],
    gas: ['Global Gas Plant Tracker', 'Global Gas Infrastructure Tracker'],
    oil: ['Global Oil and Gas Extraction Tracker', 'Global Oil Infrastructure Tracker'],
    steel: ['Global Steel Plant Tracker', 'Global Iron Mine Tracker'],
    bio: ['Global Bioenergy Power Tracker'],
  };

  // ---------------------------------------------------------------------------
  // Search
  // ---------------------------------------------------------------------------
  async function search(q, filter = null) {
    console.log('[CommandPalette] search() called with q:', q, 'filter:', filter);
    if ((!q || q.length < 2) && !filter) {
      console.log('[CommandPalette] Query too short, returning early');
      results = { assets: [], entities: [] };
      return;
    }

    loading = true;
    console.log('[CommandPalette] Starting search...');
    const startTime = Date.now();

    try {
      // Use local DuckDB with parquet file (table: ownership)
      const cfg = SEARCH_CONFIG;

      // Escape search query for SQL
      const searchQuery = (q || '').trim().replace(/'/g, "''");

      // Build tracker filter clause
      let trackerFilter = '';
      if (filter && TRACKER_FILTERS[filter]) {
        const trackers = TRACKER_FILTERS[filter].map((t) => `'${t}'`).join(',');
        trackerFilter = `AND "Tracker" IN (${trackers})`;
      }

      // Status boost SQL
      const statusBoostSql = Object.entries(cfg.statusBoost)
        .map(([status, boost]) => `WHEN LOWER(status) LIKE '%${status}%' THEN ${boost}`)
        .join('\n            ');

      // Asset search: LIKE for filtering, BM25 for ranking when available
      const assetResult = await widgetQuery(`
        WITH base AS (
          SELECT DISTINCT
            "GEM unit ID" as id,
            "Project" as name,
            "Tracker" as tracker,
            "Status" as status,
            "Owner Headquarters Country" as country,
            CAST("Capacity (MW)" AS DOUBLE) as capacity
          FROM ownership
          WHERE LOWER("Project") LIKE LOWER('%${searchQuery}%') ${trackerFilter}
        ),
        scored AS (
          SELECT *,
            -- Text relevance scoring
            CASE
              WHEN LOWER(name) = LOWER('${searchQuery}') THEN ${cfg.exactMatch}
              WHEN LOWER(name) LIKE LOWER('${searchQuery}%') THEN ${cfg.prefixMatch}
              WHEN LOWER(name) LIKE LOWER('% ${searchQuery}%') THEN ${cfg.wordBoundary}
              ELSE ${cfg.containsMatch}
            END as text_score,
            -- Status boost
            CASE
              ${statusBoostSql}
              ELSE 0
            END as status_score,
            -- Importance boost: log-scaled capacity
            COALESCE(LOG10(GREATEST(capacity, 1)) * ${cfg.capacityWeight}, 0) as importance_score
          FROM base
        )
        SELECT id, name, tracker, status, country, capacity,
               text_score, status_score, importance_score,
               (text_score + status_score + importance_score) as final_score
        FROM scored
        ORDER BY final_score DESC, capacity DESC NULLS LAST
        LIMIT 10
      `);

      // Entity search: LIKE for filtering + tracker breakdown for MiniFlower
      const entityResult = await widgetQuery(`
        WITH matching_entities AS (
          SELECT DISTINCT "Owner GEM Entity ID" as entity_id
          FROM ownership
          WHERE LOWER("Owner") LIKE LOWER('%${searchQuery}%')
            AND "Owner" IS NOT NULL
        ),
        tracker_stats AS (
          SELECT
            "Owner GEM Entity ID" as entity_id,
            "Tracker" as tracker,
            COUNT(DISTINCT "GEM unit ID") as count,
            SUM(CAST("Capacity (MW)" AS DOUBLE)) as capacity
          FROM ownership
          WHERE "Owner GEM Entity ID" IN (SELECT entity_id FROM matching_entities) ${trackerFilter}
          GROUP BY "Owner GEM Entity ID", "Tracker"
        ),
        entity_stats AS (
          SELECT
            "Owner GEM Entity ID" as id,
            "Owner" as name,
            COUNT(DISTINCT "GEM unit ID") as asset_count,
            SUM(CAST("Capacity (MW)" AS DOUBLE)) as total_capacity,
            COUNT(DISTINCT "Tracker") as tracker_count,
            COUNT(DISTINCT "Owner Headquarters Country") as country_count
          FROM ownership
          WHERE LOWER("Owner") LIKE LOWER('%${searchQuery}%')
            AND "Owner" IS NOT NULL ${trackerFilter}
          GROUP BY "Owner GEM Entity ID", "Owner"
        ),
        entity_with_trackers AS (
          SELECT
            e.*,
            LIST(STRUCT_PACK(
              tracker := t.tracker,
              count := t.count,
              capacity := t.capacity
            )) as tracker_breakdown
          FROM entity_stats e
          LEFT JOIN tracker_stats t ON e.id = t.entity_id
          GROUP BY e.id, e.name, e.asset_count, e.total_capacity, e.tracker_count, e.country_count
        ),
        scored AS (
          SELECT *,
            -- Text relevance scoring
            CASE
              WHEN LOWER(name) = LOWER('${searchQuery}') THEN ${cfg.exactMatch}
              WHEN LOWER(name) LIKE LOWER('${searchQuery}%') THEN ${cfg.prefixMatch}
              WHEN LOWER(name) LIKE LOWER('% ${searchQuery}%') THEN ${cfg.wordBoundary}
              ELSE ${cfg.containsMatch}
            END as text_score,
            -- Importance: log-scaled asset count + tracker diversity bonus
            (LOG10(GREATEST(asset_count, 1)) * ${cfg.assetCountWeight}) +
            (GREATEST(tracker_count - 1, 0) * ${cfg.trackerBonus}) as importance_score,
            -- Geographic diversity bonus
            CASE WHEN country_count > 5 THEN 15 WHEN country_count > 2 THEN 8 ELSE 0 END as geo_bonus
          FROM entity_with_trackers
        )
        SELECT id, name, asset_count, total_capacity, tracker_count, country_count,
               tracker_breakdown,
               text_score, importance_score, geo_bonus,
               (text_score + importance_score + geo_bonus) as final_score
        FROM scored
        ORDER BY final_score DESC, asset_count DESC
        LIMIT 8
      `);

      console.log('[CommandPalette] Asset query result:', assetResult);
      console.log('[CommandPalette] Entity query result:', entityResult);

      results = {
        assets: assetResult.data || [],
        entities: entityResult.data || [],
      };
      console.log('[CommandPalette] Final results:', results);
      searchTime = Date.now() - startTime;
      selectedIndex = 0;

      // Animate new results appearing
      animateResults();

      // Save to recent searches (if meaningful query)
      if (q && q.length >= 2 && (results.assets.length > 0 || results.entities.length > 0)) {
        saveRecentSearch(q);
      }

      // Fetch parametric counts for filter chips (non-blocking)
      fetchFilterCounts(q);
    } catch (err) {
      console.error('[CommandPalette] Search error:', err);
      console.error('[CommandPalette] Error details:', JSON.stringify(err, null, 2));
      results = { assets: [], entities: [] };
    } finally {
      loading = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Parametric Filter Counts
  // ---------------------------------------------------------------------------
  async function fetchFilterCounts(q) {
    const terms = (q || '')
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length >= 2);

    // Build WHERE clause for current search terms
    // Note: parquet has "Owner" not "Parent"
    let termWhere = '1=1';
    if (terms.length > 0) {
      termWhere = terms
        .map((term) => {
          const escaped = term.replace(/'/g, "''");
          return `(LOWER("Project") LIKE '%${escaped}%' OR LOWER("Owner") LIKE '%${escaped}%' OR LOWER("GEM unit ID") LIKE '%${escaped}%')`;
        })
        .join(' AND ');
    }

    try {
      const countResult = await widgetQuery(`
        SELECT
          SUM(CASE WHEN "Tracker" IN ('Global Coal Plant Tracker', 'Global Coal Mine Tracker') THEN 1 ELSE 0 END) as coal,
          SUM(CASE WHEN "Tracker" IN ('Global Gas Plant Tracker', 'Global Gas Infrastructure Tracker') THEN 1 ELSE 0 END) as gas,
          SUM(CASE WHEN "Tracker" IN ('Global Oil and Gas Extraction Tracker', 'Global Oil Infrastructure Tracker') THEN 1 ELSE 0 END) as oil,
          SUM(CASE WHEN "Tracker" IN ('Global Steel Plant Tracker', 'Global Iron Mine Tracker') THEN 1 ELSE 0 END) as steel,
          SUM(CASE WHEN "Tracker" = 'Global Bioenergy Power Tracker' THEN 1 ELSE 0 END) as bio
        FROM ownership
        WHERE ${termWhere}
      `);

      if (countResult.data && countResult.data[0]) {
        filterCounts = {
          coal: Number(countResult.data[0].coal) || 0,
          gas: Number(countResult.data[0].gas) || 0,
          oil: Number(countResult.data[0].oil) || 0,
          steel: Number(countResult.data[0].steel) || 0,
          bio: Number(countResult.data[0].bio) || 0,
        };
      }
    } catch (err) {
      console.error('[CommandPalette] Count query error:', err);
    }
  }

  // ---------------------------------------------------------------------------
  // Hover Previews
  // ---------------------------------------------------------------------------
  async function fetchHoverPreview(item) {
    if (!item) return null;

    try {
      if (item.type === 'asset') {
        // Fetch owner info for asset
        // Note: parquet has "Owner" not "Parent", "Share" not "Share (%)"
        const ownerResult = await widgetQuery(`
          SELECT DISTINCT
            "Owner" as owner_name,
            "Owner GEM Entity ID" as owner_id,
            "Share" as share_pct
          FROM ownership
          WHERE "GEM unit ID" = '${item.id}'
          ORDER BY "Share" DESC NULLS LAST
          LIMIT 5
        `);

        return {
          type: 'asset',
          owners: ownerResult.data || [],
          item,
        };
      } else {
        // Fetch top assets for entity
        // Note: parquet has "Owner Headquarters Country" not "Country"
        const assetsResult = await widgetQuery(`
          SELECT
            "GEM unit ID" as id,
            "Project" as name,
            "Tracker" as tracker,
            "Status" as status,
            CAST("Capacity (MW)" AS DOUBLE) as capacity,
            "Owner Headquarters Country" as country
          FROM ownership
          WHERE "Owner GEM Entity ID" = '${item.id}'
          ORDER BY capacity DESC NULLS LAST
          LIMIT 5
        `);

        // Get countries list
        const countriesResult = await widgetQuery(`
          SELECT DISTINCT "Owner Headquarters Country" as country
          FROM ownership
          WHERE "Owner GEM Entity ID" = '${item.id}'
          ORDER BY country
          LIMIT 10
        `);

        return {
          type: 'entity',
          topAssets: assetsResult.data || [],
          countries: countriesResult.data?.map((r) => r.country).filter(Boolean) || [],
          item,
        };
      }
    } catch (err) {
      console.error('[CommandPalette] Hover preview error:', err);
      return null;
    }
  }

  function handleItemHover(item, index) {
    selectedIndex = index;
    hoveredItem = item;

    // Debounce the preview fetch
    clearTimeout(hoverTimeout);
    hoverTimeout = setTimeout(async () => {
      if (hoveredItem === item) {
        hoverPreview = await fetchHoverPreview(item);
      }
    }, 300);
  }

  function handleItemLeave() {
    clearTimeout(hoverTimeout);
    // Don't clear hoverPreview immediately - let it persist briefly
  }

  // ---------------------------------------------------------------------------
  // Similar Items
  // ---------------------------------------------------------------------------
  async function findSimilar(item) {
    if (!item) return;

    // Build a search based on item properties
    if (item.type === 'asset') {
      // Search for same tracker + country
      activeFilter = item.tracker?.includes('Coal')
        ? 'coal'
        : item.tracker?.includes('Gas')
          ? 'gas'
          : item.tracker?.includes('Oil')
            ? 'oil'
            : item.tracker?.includes('Steel') || item.tracker?.includes('Iron')
              ? 'steel'
              : item.tracker?.includes('Bio')
                ? 'bio'
                : null;
      query = item.country || '';
      search(query, activeFilter);
    } else {
      // For entities, search by name pattern
      const nameWords = (item.name || '').split(/\s+/).slice(0, 2).join(' ');
      query = nameWords;
      search(query, activeFilter);
    }
  }

  // ---------------------------------------------------------------------------
  // Recent Searches
  // ---------------------------------------------------------------------------
  function loadRecentSearches() {
    if (!browser) return;
    try {
      const stored = localStorage.getItem('gem-recent-searches');
      recentSearches = stored ? JSON.parse(stored) : [];
    } catch {
      recentSearches = [];
    }
  }

  function saveRecentSearch(q) {
    if (!browser || !q) return;
    const normalized = q.trim().toLowerCase();
    // Remove duplicates and add to front
    recentSearches = [normalized, ...recentSearches.filter((s) => s !== normalized)].slice(0, 5);
    try {
      localStorage.setItem('gem-recent-searches', JSON.stringify(recentSearches));
    } catch {
      // localStorage full or unavailable
    }
  }

  function clearRecentSearches() {
    recentSearches = [];
    if (browser) {
      localStorage.removeItem('gem-recent-searches');
    }
  }

  function useRecentSearch(q) {
    query = q;
    search(q, activeFilter);
  }

  // ---------------------------------------------------------------------------
  // Filters
  // ---------------------------------------------------------------------------
  function toggleFilter(filter) {
    if (activeFilter === filter) {
      activeFilter = null;
    } else {
      activeFilter = filter;
    }
    search(query, activeFilter);
  }

  function cycleSearchMode() {
    if (searchMode === 'all') searchMode = 'assets';
    else if (searchMode === 'assets') searchMode = 'entities';
    else searchMode = 'all';
  }

  // ---------------------------------------------------------------------------
  // Match Highlighting
  // ---------------------------------------------------------------------------
  function highlightMatch(text, q) {
    if (!text || !q) return text;
    const terms = q
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length >= 2);
    if (terms.length === 0) return text;

    let result = text;
    for (const term of terms) {
      const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      result = result.replace(regex, '<mark>$1</mark>');
    }
    return result;
  }

  function handleInput() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      search(query, activeFilter);
    }, 150);
  }

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------
  function navigate(item) {
    if (!item) return;
    const url = item.type === 'entity' ? entityLink(item.id) : assetLink(item.id);
    close();
    goto(url);
  }

  function handleKeydown(event) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, allResults.length - 1);
        break;

      case 'ArrowUp':
        event.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, 0);
        break;

      case 'Enter':
        event.preventDefault();
        if (allResults[selectedIndex]) {
          navigate(allResults[selectedIndex]);
        }
        break;

      case 'Escape':
        event.preventDefault();
        close();
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Open/Close
  // ---------------------------------------------------------------------------
  async function openPalette() {
    open = true;
    query = '';
    results = { assets: [], entities: [] };
    selectedIndex = 0;
    // Wait for DOM update, then animate
    await tick();
    // Animate backdrop fade in
    if (backdropEl) {
      animate(backdropEl, {
        opacity: [0, 1],
        duration: 200,
        ease: 'out(2)',
      });
    }
    // Animate palette modal in
    if (paletteEl) {
      modalIn(paletteEl, { duration: 250 });
    }
    // Focus input after animation starts
    setTimeout(() => inputEl?.focus(), 50);
  }

  function close() {
    if (paletteEl) {
      // Animate backdrop fade out
      if (backdropEl) {
        animate(backdropEl, {
          opacity: [1, 0],
          duration: 150,
          ease: 'in(2)',
        });
      }
      modalOut(paletteEl, { duration: 150 });
      setTimeout(() => {
        open = false;
        query = '';
      }, 150);
    } else {
      open = false;
      query = '';
    }
  }

  // Animate search results when they appear
  async function animateResults() {
    await tick();
    if (resultsEl) {
      const items = resultsEl.querySelectorAll('.result-item-wrapper');
      if (items.length > 0) {
        staggerIn(Array.from(items), { staggerDelay: 35, duration: 300, distance: 15 });
      }
    }
  }

  function handleGlobalKeydown(event) {
    // Cmd+K or Ctrl+K (case-insensitive)
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      if (open) {
        close();
      } else {
        openPalette();
      }
    }
  }

  function handleBackdropClick(event) {
    if (event.target === event.currentTarget) {
      close();
    }
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------
  onMount(() => {
    if (browser) {
      // Only add global Cmd+K listener in modal mode
      if (!embedded) {
        window.addEventListener('keydown', handleGlobalKeydown);
      }
      loadRecentSearches();
      // Initialize widget DB and pre-fetch total counts for filter chips
      initWidgetDB()
        .then(() => {
          fetchFilterCounts('');
        })
        .catch((err) => {
          console.error('[CommandPalette] Failed to init widget DB:', err);
        });
    }
  });

  onDestroy(() => {
    if (browser && !embedded) {
      window.removeEventListener('keydown', handleGlobalKeydown);
    }
    clearTimeout(debounceTimer);
  });

  // ---------------------------------------------------------------------------
  // Formatters & Micro-Visualizations
  // ---------------------------------------------------------------------------

  // Helper to safely convert BigInt to Number for comparisons and display
  function num(val) {
    if (val === null || val === undefined) return 0;
    return typeof val === 'bigint' ? Number(val) : Number(val) || 0;
  }

  // Country name to ISO code mapping (common ones)
  const countryToCode = {
    'united states': 'US',
    usa: 'US',
    us: 'US',
    china: 'CN',
    india: 'IN',
    russia: 'RU',
    japan: 'JP',
    germany: 'DE',
    'united kingdom': 'GB',
    uk: 'GB',
    france: 'FR',
    italy: 'IT',
    spain: 'ES',
    canada: 'CA',
    australia: 'AU',
    brazil: 'BR',
    mexico: 'MX',
    'south korea': 'KR',
    indonesia: 'ID',
    turkey: 'TR',
    'saudi arabia': 'SA',
    poland: 'PL',
    netherlands: 'NL',
    belgium: 'BE',
    sweden: 'SE',
    switzerland: 'CH',
    austria: 'AT',
    norway: 'NO',
    denmark: 'DK',
    finland: 'FI',
    ireland: 'IE',
    portugal: 'PT',
    greece: 'GR',
    'czech republic': 'CZ',
    czechia: 'CZ',
    romania: 'RO',
    hungary: 'HU',
    ukraine: 'UA',
    'south africa': 'ZA',
    egypt: 'EG',
    nigeria: 'NG',
    kenya: 'KE',
    morocco: 'MA',
    argentina: 'AR',
    chile: 'CL',
    colombia: 'CO',
    peru: 'PE',
    venezuela: 'VE',
    vietnam: 'VN',
    thailand: 'TH',
    malaysia: 'MY',
    singapore: 'SG',
    philippines: 'PH',
    pakistan: 'PK',
    bangladesh: 'BD',
    iran: 'IR',
    iraq: 'IQ',
    israel: 'IL',
    uae: 'AE',
    'united arab emirates': 'AE',
    qatar: 'QA',
    kuwait: 'KW',
    'new zealand': 'NZ',
    taiwan: 'TW',
    'hong kong': 'HK',
  };

  // Convert country name to flag emoji
  function countryFlag(country) {
    if (!country) return '';
    const code = countryToCode[country.toLowerCase()] || '';
    if (!code) return '';
    // Convert ISO code to regional indicator symbols
    return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
  }

  function formatCapacity(mw) {
    if (!mw) return null;
    // Convert BigInt to Number if needed
    const val = typeof mw === 'bigint' ? Number(mw) : Number(mw);
    if (useGW) {
      // Always show in GW when toggle is on
      if (val >= 100) return `${(val / 1000).toFixed(2)}`;
      return `${(val / 1000).toFixed(3)}`;
    }
    // Auto-scale when toggle is off
    if (val >= 1000) return `${(val / 1000).toFixed(1)}GW`;
    return `${Math.round(val)}MW`;
  }

  function getCapacityUnit() {
    return useGW ? 'GW' : '';
  }

  // Capacity bar width (0-100%) - log scale for better visual distribution
  function capacityBarWidth(mw, maxMw = 10000) {
    if (!mw || mw <= 0) return 0;
    // Convert BigInt to Number if needed
    const val = typeof mw === 'bigint' ? Number(mw) : Number(mw);
    // Log scale: 1MW = 0%, 10000MW = 100%
    const logScale = Math.log10(val) / Math.log10(maxMw);
    return Math.min(Math.max(logScale * 100, 5), 100);
  }

  // Get status color from theme (uses colorByStatus from ownership-theme)
  function getStatusColor(status) {
    if (!status) return '#999';
    const key = status.toLowerCase();
    return colorByStatus.get(key) || '#999';
  }

  // Geographic spread description
  function geoSpreadLabel(count) {
    const n = num(count);
    if (n >= 20) return 'Global';
    if (n >= 10) return 'Multi-regional';
    if (n >= 5) return 'Regional';
    if (n >= 2) return 'Multi-country';
    return 'Single country';
  }

  // Format tracker for compact display
  function getTrackerShort(tracker) {
    if (!tracker) return '?';
    // Extract key word from "Global X Tracker" pattern
    const match = tracker.match(/Global\s+(.+?)\s+(Plant|Mine|Infrastructure|Tracker)/i);
    if (match) {
      const key = match[1].toUpperCase();
      if (key === 'COAL' && tracker.includes('Mine')) return 'MINE';
      if (key === 'IRON ORE') return 'IRON';
      if (key === 'OIL AND GAS EXTRACTION') return 'O&G';
      if (key === 'OIL') return 'OIL';
      if (key === 'GAS' && tracker.includes('Infrastructure')) return 'GAS-I';
      return key.slice(0, 5);
    }
    return tracker.slice(0, 4).toUpperCase();
  }
</script>

{#if open || embedded}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="command-palette-wrapper"
    class:embedded
    bind:this={backdropEl}
    onclick={embedded ? undefined : handleBackdropClick}
    onkeydown={embedded ? undefined : handleKeydown}
  >
    <div class="command-palette" class:embedded bind:this={paletteEl}>
      <!-- Search Input -->
      <div class="search-box">
        <svg
          class="search-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <input
          bind:this={inputEl}
          bind:value={query}
          oninput={handleInput}
          type="text"
          {placeholder}
          spellcheck="false"
          autocomplete="off"
        />
        {#if loading}
          <span class="loading-indicator">...</span>
        {:else if query.length >= 2}
          <span class="result-count">{totalCount} results</span>
        {/if}
        {#if !embedded}<kbd class="escape-hint">esc</kbd>{/if}
      </div>

      <!-- Quick Filters with Parametric Counts -->
      <div class="quick-filters">
        <button
          class="filter-chip"
          class:active={activeFilter === 'coal'}
          onclick={() => toggleFilter('coal')}
          >Coal {#if filterCounts.coal > 0}<span class="chip-count"
              >{filterCounts.coal.toLocaleString()}</span
            >{/if}</button
        >
        <button
          class="filter-chip"
          class:active={activeFilter === 'gas'}
          onclick={() => toggleFilter('gas')}
          >Gas {#if filterCounts.gas > 0}<span class="chip-count"
              >{filterCounts.gas.toLocaleString()}</span
            >{/if}</button
        >
        <button
          class="filter-chip"
          class:active={activeFilter === 'oil'}
          onclick={() => toggleFilter('oil')}
          >Oil {#if filterCounts.oil > 0}<span class="chip-count"
              >{filterCounts.oil.toLocaleString()}</span
            >{/if}</button
        >
        <button
          class="filter-chip"
          class:active={activeFilter === 'steel'}
          onclick={() => toggleFilter('steel')}
          >Steel {#if filterCounts.steel > 0}<span class="chip-count"
              >{filterCounts.steel.toLocaleString()}</span
            >{/if}</button
        >
        <button
          class="filter-chip"
          class:active={activeFilter === 'bio'}
          onclick={() => toggleFilter('bio')}
          >Bio {#if filterCounts.bio > 0}<span class="chip-count"
              >{filterCounts.bio.toLocaleString()}</span
            >{/if}</button
        >
        <span class="filter-divider"></span>
        <button
          class="filter-chip"
          class:active={searchMode === 'assets'}
          onclick={() => (searchMode = searchMode === 'assets' ? 'all' : 'assets')}
          title="Show only assets">Assets</button
        >
        <button
          class="filter-chip"
          class:active={searchMode === 'entities'}
          onclick={() => (searchMode = searchMode === 'entities' ? 'all' : 'entities')}
          title="Show only entities">Entities</button
        >
        <span class="filter-divider"></span>
        <button
          class="units-toggle"
          class:active={useGW}
          onclick={() => (useGW = !useGW)}
          title="Toggle capacity units">{useGW ? 'GW' : 'MW'}</button
        >
        <button
          class="mode-toggle hidden"
          onclick={cycleSearchMode}
          title="Toggle between all, assets only, or entities only"
          >{searchMode === 'all' ? 'All' : searchMode === 'assets' ? 'Assets' : 'Entities'}</button
        >
      </div>

      <!-- Results -->
      {#if query.length >= 2 || activeFilter}
        <div class="results" bind:this={resultsEl}>
          {#if hasResults}
            <!-- Assets -->
            {#if results.assets.length > 0 && searchMode !== 'entities'}
              <div class="result-group">
                <div class="group-header">
                  Assets
                  <span class="group-count">{results.assets.length}</span>
                </div>
                {#each results.assets as item, i}
                  {@const globalIndex = i}
                  {@const itemWithType = { ...item, type: 'asset' }}
                  <div
                    class="result-item-wrapper"
                    onmouseenter={() => handleItemHover(itemWithType, globalIndex)}
                    onmouseleave={handleItemLeave}
                  >
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div
                      class="result-item"
                      class:selected={selectedIndex === globalIndex}
                      onclick={() => navigate(itemWithType)}
                    >
                      <!-- Capacity bar background -->
                      <div
                        class="capacity-bar-bg"
                        style:width="{capacityBarWidth(item.capacity)}%"
                        style:background={getStatusColor(item.status)}
                      ></div>

                      <div class="result-main">
                        <div class="result-icon">
                          <TrackerIcon tracker={item.tracker} size={20} />
                        </div>
                        <div class="result-content">
                          <div class="result-name">
                            {@html highlightMatch(item.name || item.id, query)}
                          </div>
                          <div class="result-meta">
                            <span class="tracker-badge" title={item.tracker}
                              >{getTrackerShort(item.tracker)}</span
                            >
                            <span
                              class="status-dot"
                              style:background={getStatusColor(item.status)}
                              title={item.status}
                            ></span>
                            <span class="result-id">{item.id}</span>
                            {#if item.country}
                              <span class="result-country"
                                >{countryFlag(item.country)} {item.country}</span
                              >
                            {/if}
                          </div>
                        </div>
                      </div>
                      <div class="result-aside">
                        {#if item.capacity}
                          <div class="capacity-display">
                            <span class="capacity-value"
                              >{formatCapacity(item.capacity)}{getCapacityUnit()}</span
                            >
                          </div>
                        {/if}
                        <button
                          class="similar-btn"
                          onclick={(e) => {
                            e.stopPropagation();
                            findSimilar(itemWithType);
                          }}
                          title="Find similar">≈</button
                        >
                      </div>
                    </div>

                    <!-- Hover Preview for Asset -->
                    {#if hoverPreview?.item?.id === item.id && hoverPreview?.type === 'asset'}
                      <div class="hover-preview">
                        <div class="preview-header">Ownership</div>
                        {#if hoverPreview.owners.length > 0}
                          <ul class="preview-list">
                            {#each hoverPreview.owners as owner}
                              <li>
                                <span class="owner-name">{owner.owner_name}</span>
                                {#if owner.share_pct}
                                  <span class="owner-share">{owner.share_pct}%</span>
                                {/if}
                              </li>
                            {/each}
                          </ul>
                        {:else}
                          <p class="preview-empty">No ownership data</p>
                        {/if}
                      </div>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}

            <!-- Entities -->
            {#if results.entities.length > 0 && searchMode !== 'assets'}
              <div class="result-group">
                <div class="group-header">
                  Entities
                  <span class="group-count">{results.entities.length}</span>
                </div>
                {#each results.entities as item, i}
                  {@const globalIndex = searchMode === 'entities' ? i : results.assets.length + i}
                  {@const itemWithType = { ...item, type: 'entity' }}
                  <div
                    class="result-item-wrapper"
                    onmouseenter={() => handleItemHover(itemWithType, globalIndex)}
                    onmouseleave={handleItemLeave}
                  >
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div
                      class="result-item entity-item"
                      class:selected={selectedIndex === globalIndex}
                      onclick={() => navigate(itemWithType)}
                    >
                      <div class="result-main">
                        <!-- MiniFlower for tracker distribution -->
                        <div class="result-icon">
                          {#if item.tracker_breakdown && item.tracker_breakdown.length > 0}
                            <MiniFlower trackers={Array.from(item.tracker_breakdown)} size={28} />
                          {:else}
                            <div class="entity-icon-fallback">E</div>
                          {/if}
                        </div>
                        <div class="result-content">
                          <div class="result-name">
                            {@html highlightMatch(item.name || item.id, query)}
                          </div>
                          <div class="result-meta">
                            <span class="result-id">{item.id}</span>
                            <span class="asset-count-badge" title="{num(item.asset_count)} assets">
                              <svg width="10" height="10" viewBox="0 0 10 10"
                                ><circle cx="5" cy="5" r="3" fill="currentColor" /></svg
                              >
                              {num(item.asset_count)}
                            </span>
                            {#if num(item.tracker_count) > 1}
                              <span
                                class="cross-ref-badge"
                                title="Cross-sector: appears in {num(item.tracker_count)} trackers"
                              >
                                {num(item.tracker_count)} trackers
                              </span>
                            {/if}
                            {#if num(item.country_count) > 1}
                              <span class="geo-badge" title="{num(item.country_count)} countries">
                                {geoSpreadLabel(num(item.country_count))}
                              </span>
                            {/if}
                          </div>
                        </div>
                      </div>
                      <div class="result-aside">
                        {#if item.total_capacity}
                          <div class="capacity-display">
                            <span class="capacity-value"
                              >{formatCapacity(item.total_capacity)}{getCapacityUnit()}</span
                            >
                            <span class="capacity-label">total</span>
                          </div>
                        {/if}
                        <button
                          class="similar-btn"
                          onclick={(e) => {
                            e.stopPropagation();
                            findSimilar(itemWithType);
                          }}
                          title="Find similar">≈</button
                        >
                      </div>
                    </div>

                    <!-- Hover Preview for Entity -->
                    {#if hoverPreview?.item?.id === item.id && hoverPreview?.type === 'entity'}
                      <div class="hover-preview entity-preview">
                        <div class="preview-section">
                          <div class="preview-header">Top Assets</div>
                          {#if hoverPreview.topAssets.length > 0}
                            <ul class="preview-list">
                              {#each hoverPreview.topAssets as asset}
                                <li class="preview-asset">
                                  <span class="asset-name">{asset.name}</span>
                                  <span class="asset-details">
                                    {asset.country} · {formatCapacity(asset.capacity)}
                                  </span>
                                </li>
                              {/each}
                            </ul>
                          {:else}
                            <p class="preview-empty">No assets</p>
                          {/if}
                        </div>
                        {#if hoverPreview.countries.length > 0}
                          <div class="preview-section">
                            <div class="preview-header">Countries</div>
                            <p class="preview-countries">{hoverPreview.countries.join(', ')}</p>
                          </div>
                        {/if}
                      </div>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          {:else if !loading}
            <div class="no-results">
              <p>No results for "{query}"</p>
              <p class="no-results-hint">Try a project name, company name, or GEM ID</p>
            </div>
          {/if}
        </div>

        <!-- Footer -->
        <div class="palette-footer">
          <div class="footer-hints">
            <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
            <span><kbd>↵</kbd> open</span>
            <span><kbd>esc</kbd> close</span>
          </div>
          {#if searchTime > 0}
            <span class="search-time">{searchTime}ms</span>
          {/if}
        </div>
      {:else}
        <!-- Empty state with recent searches -->
        <div class="empty-state">
          {#if showingRecent}
            <div class="recent-searches">
              <div class="recent-header">
                <span>Recent searches</span>
                <button class="clear-recent" onclick={clearRecentSearches}>Clear</button>
              </div>
              {#each recentSearches as recent}
                <button class="recent-item" onclick={() => useRecentSearch(recent)}>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path d="M12 8v4l3 3" />
                    <circle cx="12" cy="12" r="10" />
                  </svg>
                  {recent}
                </button>
              {/each}
            </div>
          {:else}
            <p>Type to search across all assets and entities</p>
          {/if}
          <div class="quick-actions">
            <button
              onclick={() => {
                close();
                goto('/explore');
              }}
            >
              Explore data
            </button>
            <button
              onclick={() => {
                close();
                goto('/compose');
              }}
            >
              Build filters
            </button>
            <button
              onclick={() => {
                close();
                goto('/conglomerates');
              }}
            >
              View rankings
            </button>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .command-palette-wrapper {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(2px);
    z-index: 9999;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 15vh;
  }

  /* Embedded mode - inline display, no modal overlay */
  .command-palette-wrapper.embedded {
    position: static;
    background: none;
    backdrop-filter: none;
    z-index: auto;
    padding-top: 0;
    display: block;
  }

  .command-palette {
    width: 100%;
    max-width: 600px;
    background: white;
    box-shadow: 0 16px 70px rgba(0, 0, 0, 0.2);
    overflow: hidden;
  }

  /* Embedded mode - inline display */
  .command-palette.embedded {
    max-width: none;
    box-shadow: none;
    border: 1px solid #ddd;
  }

  .command-palette.embedded .palette-footer {
    display: none;
  }

  /* Search Box */
  .search-box {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px 20px;
    border-bottom: 1px solid #e0e0e0;
  }

  .search-icon {
    width: 20px;
    height: 20px;
    color: #999;
    flex-shrink: 0;
  }

  .search-box input {
    flex: 1;
    border: none;
    outline: none;
    font-size: 16px;
    font-family: inherit;
    background: transparent;
  }

  .search-box input::placeholder {
    color: #999;
  }

  .loading-indicator {
    font-size: 14px;
    color: #999;
    animation: pulse 1s infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.4;
    }
  }

  .result-count {
    font-size: 11px;
    color: #666;
  }

  .escape-hint {
    font-size: 10px;
    padding: 3px 6px;
    background: #f0f0f0;
    border: 1px solid #ddd;
    color: #666;
    font-family: system-ui, sans-serif;
  }

  /* Results */
  .results {
    max-height: 400px;
    overflow-y: auto;
  }

  .result-group {
    padding: 8px 0;
  }

  .group-header {
    padding: 8px 20px 6px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #999;
  }

  .result-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 10px 20px;
    background: none;
    border: none;
    text-align: left;
    cursor: pointer;
    transition: background 0.1s;
  }

  .result-item:hover,
  .result-item.selected {
    background: #f5f5f5;
  }

  .result-item.selected {
    background: #000;
    color: white;
  }

  .result-item.selected .result-meta,
  .result-item.selected .result-id,
  .result-item.selected .result-country,
  .result-item.selected .result-assets,
  .result-item.selected .result-trackers,
  .result-item.selected .result-capacity {
    color: rgba(255, 255, 255, 0.7);
  }

  .result-item.selected .entity-icon {
    background: white;
    color: black;
  }

  .result-main {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  .result-icon {
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .entity-icon {
    width: 24px;
    height: 24px;
    background: #000;
    color: white;
    font-size: 12px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .result-content {
    min-width: 0;
  }

  .result-name {
    font-size: 14px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .result-meta {
    display: flex;
    gap: 8px;
    font-size: 11px;
    color: #666;
    margin-top: 2px;
  }

  .result-id {
    font-family: monospace;
    font-size: 10px;
  }

  .result-aside {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .result-capacity {
    font-family: monospace;
    font-size: 12px;
    color: #666;
  }

  .result-score {
    font-family: monospace;
    font-size: 9px;
    color: #999;
    background: #f0f0f0;
    padding: 2px 4px;
    cursor: help;
  }

  .result-item.selected .result-score {
    background: rgba(255, 255, 255, 0.2);
    color: rgba(255, 255, 255, 0.6);
  }

  /* Empty / No Results */
  .empty-state,
  .no-results {
    padding: 32px 20px;
    text-align: center;
    color: #666;
  }

  .empty-state p,
  .no-results p {
    margin: 0;
    font-size: 13px;
  }

  .no-results-hint {
    margin-top: 8px !important;
    font-size: 12px !important;
    color: #999;
  }

  .quick-actions {
    display: flex;
    gap: 8px;
    justify-content: center;
    margin-top: 16px;
  }

  .quick-actions button {
    padding: 8px 16px;
    font-size: 12px;
    background: #f5f5f5;
    border: 1px solid #ddd;
    cursor: pointer;
    transition: all 0.15s;
  }

  .quick-actions button:hover {
    background: #000;
    color: white;
    border-color: #000;
  }

  /* Footer */
  .palette-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 20px;
    background: #fafafa;
    border-top: 1px solid #e0e0e0;
    font-size: 11px;
    color: #666;
  }

  .footer-hints {
    display: flex;
    gap: 16px;
  }

  .footer-hints kbd {
    font-size: 9px;
    padding: 2px 5px;
    background: white;
    border: 1px solid #ddd;
    margin-right: 4px;
    font-family: system-ui, sans-serif;
  }

  .search-time {
    font-family: monospace;
    color: #999;
  }

  /* Scrollbar */
  .results::-webkit-scrollbar {
    width: 6px;
  }

  .results::-webkit-scrollbar-track {
    background: transparent;
  }

  .results::-webkit-scrollbar-thumb {
    background: #ddd;
  }

  .results::-webkit-scrollbar-thumb:hover {
    background: #ccc;
  }

  /* Quick Filters */
  .quick-filters {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 20px;
    border-bottom: 1px solid #e0e0e0;
    background: #fafafa;
  }

  .filter-chip {
    padding: 4px 10px;
    font-size: 11px;
    background: white;
    border: 1px solid #ddd;
    cursor: pointer;
    transition: all 0.15s;
  }

  .filter-chip:hover {
    border-color: #999;
  }

  .filter-chip.active {
    background: #000;
    color: white;
    border-color: #000;
  }

  .filter-divider {
    width: 1px;
    height: 16px;
    background: #ddd;
    margin: 0 4px;
  }

  .mode-toggle {
    padding: 4px 10px;
    font-size: 10px;
    background: transparent;
    border: 1px solid #ccc;
    cursor: pointer;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .mode-toggle:hover {
    background: #f0f0f0;
  }

  /* Group header with count */
  .group-header {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .group-count {
    font-size: 9px;
    background: #e0e0e0;
    padding: 1px 5px;
    border-radius: 2px;
  }

  /* Result item with capacity bar */
  .result-item {
    position: relative;
    overflow: hidden;
    cursor: pointer;
  }

  .capacity-bar-bg {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    opacity: 0.12;
    pointer-events: none;
    transition: width 0.2s ease;
  }

  .result-item.selected .capacity-bar-bg {
    opacity: 0.25;
  }

  /* Tracker badge */
  .tracker-badge {
    font-size: 9px;
    font-weight: 600;
    padding: 1px 4px;
    background: #f0f0f0;
    letter-spacing: 0.02em;
  }

  .result-item.selected .tracker-badge {
    background: rgba(255, 255, 255, 0.2);
  }

  /* Status dot */
  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  /* Capacity display */
  .capacity-display {
    text-align: right;
  }

  .capacity-value {
    font-family: monospace;
    font-size: 12px;
    font-weight: 600;
  }

  .capacity-label {
    font-size: 9px;
    color: #999;
    display: block;
  }

  .result-item.selected .capacity-label {
    color: rgba(255, 255, 255, 0.5);
  }

  /* Entity-specific styles */
  .entity-icon-fallback {
    width: 24px;
    height: 24px;
    background: #000;
    color: white;
    font-size: 12px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .result-item.selected .entity-icon-fallback {
    background: white;
    color: black;
  }

  .asset-count-badge {
    display: flex;
    align-items: center;
    gap: 3px;
    font-size: 10px;
  }

  .asset-count-badge svg {
    opacity: 0.5;
  }

  .multi-tracker-badge {
    font-size: 9px;
    padding: 1px 4px;
    background: #e8f5e9;
    color: #2e7d32;
  }

  .result-item.selected .multi-tracker-badge {
    background: rgba(255, 255, 255, 0.2);
    color: rgba(255, 255, 255, 0.9);
  }

  .geo-badge {
    font-size: 9px;
    color: #666;
    font-style: italic;
  }

  .result-item.selected .geo-badge {
    color: rgba(255, 255, 255, 0.6);
  }

  /* Match highlighting */
  :global(.result-name mark) {
    background: #fff59d;
    color: inherit;
    padding: 0 1px;
  }

  .result-item.selected :global(.result-name mark) {
    background: rgba(255, 255, 255, 0.3);
  }

  /* Recent searches */
  .recent-searches {
    text-align: left;
    margin-bottom: 16px;
  }

  .recent-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #999;
    margin-bottom: 8px;
  }

  .clear-recent {
    background: none;
    border: none;
    font-size: 10px;
    color: #999;
    cursor: pointer;
    padding: 2px 6px;
  }

  .clear-recent:hover {
    color: #333;
  }

  .recent-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 12px;
    background: #f5f5f5;
    border: none;
    font-size: 13px;
    cursor: pointer;
    text-align: left;
    margin-bottom: 4px;
    transition: background 0.1s;
  }

  .recent-item:hover {
    background: #e0e0e0;
  }

  .recent-item svg {
    opacity: 0.5;
  }

  /* Parametric count badges */
  .chip-count {
    font-size: 9px;
    background: rgba(0, 0, 0, 0.1);
    padding: 1px 4px;
    margin-left: 4px;
    border-radius: 2px;
  }

  .filter-chip.active .chip-count {
    background: rgba(255, 255, 255, 0.2);
  }

  /* Units toggle */
  .units-toggle {
    padding: 4px 8px;
    font-size: 10px;
    font-weight: 600;
    background: transparent;
    border: 1px solid #ccc;
    cursor: pointer;
    font-family: monospace;
  }

  .units-toggle:hover {
    background: #f0f0f0;
  }

  .units-toggle.active {
    background: #000;
    color: white;
    border-color: #000;
  }

  /* Result item wrapper for hover preview positioning */
  .result-item-wrapper {
    position: relative;
  }

  /* Similar button */
  .similar-btn {
    width: 24px;
    height: 24px;
    padding: 0;
    background: transparent;
    border: 1px solid transparent;
    font-size: 14px;
    cursor: pointer;
    opacity: 0;
    transition:
      opacity 0.15s,
      background 0.15s;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .result-item:hover .similar-btn,
  .result-item.selected .similar-btn {
    opacity: 0.5;
  }

  .similar-btn:hover {
    opacity: 1 !important;
    background: rgba(0, 0, 0, 0.1);
    border-color: #ccc;
  }

  .result-item.selected .similar-btn:hover {
    background: rgba(255, 255, 255, 0.2);
    border-color: rgba(255, 255, 255, 0.3);
  }

  /* Cross-reference badge */
  .cross-ref-badge {
    font-size: 9px;
    padding: 1px 5px;
    background: #f0f0f0;
    color: #666;
    font-weight: 600;
  }

  .result-item.selected .cross-ref-badge {
    background: rgba(255, 255, 255, 0.25);
    color: #fff;
  }

  /* Hide old mode toggle */
  .mode-toggle.hidden {
    display: none;
  }

  /* Hover preview panel */
  .hover-preview {
    position: absolute;
    left: 100%;
    top: 0;
    width: 280px;
    background: white;
    border: 1px solid #ddd;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
    z-index: 100;
    margin-left: 8px;
    font-size: 12px;
  }

  .preview-header {
    padding: 8px 12px 4px;
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #999;
    border-bottom: 1px solid #eee;
  }

  .preview-section {
    border-bottom: 1px solid #eee;
  }

  .preview-section:last-child {
    border-bottom: none;
  }

  .preview-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .preview-list li {
    padding: 6px 12px;
    border-bottom: 1px solid #f5f5f5;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }

  .preview-list li:last-child {
    border-bottom: none;
  }

  .owner-name,
  .asset-name {
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
  }

  .owner-share {
    font-family: monospace;
    font-size: 11px;
    color: #666;
  }

  .preview-asset {
    flex-direction: column;
    align-items: flex-start !important;
  }

  .asset-details {
    font-size: 10px;
    color: #999;
  }

  .preview-empty {
    padding: 12px;
    color: #999;
    font-style: italic;
    margin: 0;
  }

  .preview-countries {
    padding: 8px 12px;
    margin: 0;
    font-size: 11px;
    color: #666;
    line-height: 1.4;
  }

  /* Entity preview styling */
  .entity-preview {
    max-height: 300px;
    overflow-y: auto;
  }

  /* Hide preview on smaller screens or when palette would overflow */
  @media (max-width: 900px) {
    .hover-preview {
      display: none;
    }
  }
</style>
