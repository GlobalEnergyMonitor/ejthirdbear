<script>
  /**
   * External Links Component
   *
   * Provides links to external data sources for additional context.
   * Links to Wikipedia, Wikidata, OpenCorporates, and GEM Wiki.
   */

  /** @type {'entity' | 'asset'} */
  let { type = 'entity', name = '', country = '', lat = null, lon = null } = $props();

  // Encode name for URL search parameters
  const encodedName = $derived(encodeURIComponent(name));

  // Wikipedia search URL
  const wikipediaUrl = $derived(
    name ? `https://en.wikipedia.org/wiki/Special:Search?search=${encodedName}` : null
  );

  // Wikidata search URL
  const wikidataUrl = $derived(
    name ? `https://www.wikidata.org/w/index.php?search=${encodedName}` : null
  );

  // OpenCorporates search (for entities/companies)
  const openCorporatesUrl = $derived(
    type === 'entity' && name
      ? `https://opencorporates.com/companies?q=${encodedName}${country ? `&jurisdiction_code=${countryToJurisdiction(country)}` : ''}`
      : null
  );

  // GEM Wiki URL (placeholder - will use API when available)
  // Format: https://www.gem.wiki/Entity_Name (with underscores)
  const gemWikiUrl = $derived(
    name ? `https://www.gem.wiki/${name.replace(/ /g, '_')}` : null
  );

  // Climate Trace - emissions data by facility
  // Search their map interface
  const climateTraceUrl = $derived(
    type === 'asset' && name
      ? `https://climatetrace.org/explore#search=${encodedName}`
      : null
  );

  // OpenOwnership Register - beneficial ownership data
  // Note: Register is being sunset but search still works
  const openOwnershipUrl = $derived(
    type === 'entity' && name
      ? `https://register.openownership.org/search?q=${encodedName}`
      : null
  );

  // Google News - recent news articles
  const googleNewsUrl = $derived(
    name ? `https://news.google.com/search?q=${encodedName}` : null
  );

  // Wayback Machine - historical website snapshots
  const waybackUrl = $derived(
    type === 'entity' && name
      ? `https://web.archive.org/web/*/${name.replace(/ /g, '').toLowerCase()}.com`
      : null
  );

  // Google Maps - for assets with coordinates
  const googleMapsUrl = $derived(
    lat && lon ? `https://www.google.com/maps?q=${lat},${lon}&z=15` : null
  );

  // Google Earth - for assets with coordinates (KML view)
  const googleEarthUrl = $derived(
    lat && lon ? `https://earth.google.com/web/@${lat},${lon},1000a,1000d,35y,0h,0t,0r` : null
  );

  // Map common country names to OpenCorporates jurisdiction codes
  function countryToJurisdiction(countryName) {
    const map = {
      'United States': 'us',
      'USA': 'us',
      'United Kingdom': 'gb',
      'UK': 'gb',
      'China': 'cn',
      'Japan': 'jp',
      'Germany': 'de',
      'France': 'fr',
      'India': 'in',
      'Australia': 'au',
      'Canada': 'ca',
      'Brazil': 'br',
      'South Korea': 'kr',
      'Russia': 'ru',
      'Indonesia': 'id',
      'South Africa': 'za',
      'Singapore': 'sg',
      'Hong Kong': 'hk',
      'Netherlands': 'nl',
      'Switzerland': 'ch',
    };
    return map[countryName] || '';
  }

</script>

<div class="external-links">
  <span class="links-label">External:</span>
  <div class="links-list">
    {#if wikipediaUrl}
      <a href={wikipediaUrl} target="_blank" rel="noopener" class="ext-link" title="Search Wikipedia">
        <span class="link-icon">W</span>
        <span class="link-text">Wikipedia</span>
      </a>
    {/if}

    {#if wikidataUrl}
      <a href={wikidataUrl} target="_blank" rel="noopener" class="ext-link" title="Search Wikidata">
        <span class="link-icon wikidata">wd</span>
        <span class="link-text">Wikidata</span>
      </a>
    {/if}

    {#if gemWikiUrl}
      <a href={gemWikiUrl} target="_blank" rel="noopener" class="ext-link gem" title="GEM Wiki">
        <span class="link-icon gem">G</span>
        <span class="link-text">GEM Wiki</span>
      </a>
    {/if}

    {#if openCorporatesUrl}
      <a href={openCorporatesUrl} target="_blank" rel="noopener" class="ext-link" title="Search OpenCorporates">
        <span class="link-icon oc">OC</span>
        <span class="link-text">OpenCorporates</span>
      </a>
    {/if}

    {#if climateTraceUrl}
      <a href={climateTraceUrl} target="_blank" rel="noopener" class="ext-link" title="Climate Trace emissions data">
        <span class="link-icon ct">CT</span>
        <span class="link-text">Climate Trace</span>
      </a>
    {/if}

    {#if openOwnershipUrl}
      <a href={openOwnershipUrl} target="_blank" rel="noopener" class="ext-link" title="OpenOwnership beneficial ownership">
        <span class="link-icon oo">OO</span>
        <span class="link-text">OpenOwnership</span>
      </a>
    {/if}

    {#if googleNewsUrl}
      <a href={googleNewsUrl} target="_blank" rel="noopener" class="ext-link" title="Recent news">
        <span class="link-icon news">N</span>
        <span class="link-text">News</span>
      </a>
    {/if}

    {#if waybackUrl}
      <a href={waybackUrl} target="_blank" rel="noopener" class="ext-link" title="Wayback Machine archives">
        <span class="link-icon wb">WB</span>
        <span class="link-text">Wayback</span>
      </a>
    {/if}

    {#if googleMapsUrl}
      <a href={googleMapsUrl} target="_blank" rel="noopener" class="ext-link" title="View on Google Maps">
        <span class="link-icon maps">📍</span>
        <span class="link-text">Maps</span>
      </a>
    {/if}

    {#if googleEarthUrl}
      <a href={googleEarthUrl} target="_blank" rel="noopener" class="ext-link" title="View in Google Earth">
        <span class="link-icon earth">🌍</span>
        <span class="link-text">Earth</span>
      </a>
    {/if}
  </div>
</div>

<style>
  .external-links {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
  }

  .links-label {
    color: var(--color-gray-500);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .links-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .ext-link {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px;
    background: var(--color-gray-100);
    border: 1px solid #e0e0e0;
    border-radius: 3px;
    color: var(--color-gray-700);
    text-decoration: none;
    transition: background 0.15s;
  }

  .ext-link:hover {
    background: #e8e8e8;
    text-decoration: none;
  }

  .link-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    font-size: 9px;
    font-weight: bold;
    background: var(--color-gray-700);
    color: white;
    border-radius: 2px;
  }

  .link-icon.wikidata {
    background: #006699;
  }

  .link-icon.gem {
    background: #2e7d32;
  }

  .link-icon.oc {
    background: #0066cc;
    font-size: 8px;
  }

  .link-icon.ct {
    background: #e65100;
    font-size: 8px;
  }

  .link-icon.oo {
    background: #7b1fa2;
    font-size: 8px;
  }

  .link-icon.news {
    background: #d32f2f;
  }

  .link-icon.wb {
    background: #555;
    font-size: 8px;
  }

  .link-icon.maps,
  .link-icon.earth {
    background: transparent;
    font-size: 14px;
  }

  .link-text {
    font-size: 10px;
  }

  /* Compact variant for inline use */
  :global(.external-links-compact) .links-label {
    display: none;
  }

  :global(.external-links-compact) .link-text {
    display: none;
  }

  :global(.external-links-compact) .ext-link {
    padding: 2px 4px;
  }

  @media print {
    .external-links {
      display: none;
    }
  }
</style>
