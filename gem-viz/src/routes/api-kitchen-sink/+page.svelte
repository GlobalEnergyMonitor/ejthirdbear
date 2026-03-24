<script>
  import { fly, fade } from 'svelte/transition';
  import {
    API_SLUG_TO_TYPE,
    IDENTIFIER_TO_API_SLUG,
    STATUS_VALUES,
  } from '$lib/data-config/tracker-schema';

  const API_BASE = 'https://gem-api.thirdbear.net';
  const TIMEOUT_MS = 15_000;

  const API_SLUGS = API_SLUG_TO_TYPE;
  const TRACKER_SLUG_MAP = IDENTIFIER_TO_API_SLUG;

  const STATUSES = [...STATUS_VALUES];

  // Asset class definitions → tracker mappings
  const ASSET_CLASS_TRACKERS = {
    'captive-coal-plants': ['Coal Plant'],
    'coal-plants-retirement': ['Coal Plant'],
    'coal-plant-conversions': ['Coal Plant'],
    'coal-mines-by-use': ['Coal Mine'],
    'coal-mines-by-closure': ['Coal Mine'],
    'fossil-steel-plants': ['Iron & Steel Plant'],
    'bf-relinings': ['Iron & Steel Plant'],
    'bioenergy-plants': ['Bioenergy Power'],
    'cement-plants': ['Cement or Concrete Plant'],
    'captive-power-data-centers': ['Oil & Gas Plant', 'Coal Plant'],
    'coal-related-assets': ['Coal Plant', 'Coal Mine', 'Iron & Steel Plant'],
    'coal-plants': ['Coal Plant'],
    'coal-mines': ['Coal Mine'],
    'gas-plants': ['Oil & Gas Plant'],
    'gas-pipelines': ['Gas Pipeline'],
    'oil-pipelines': ['Oil or NGL Pipeline'],
    'iron-mines': ['Iron Mine'],
    'steel-plants': ['Iron & Steel Plant'],
    'bioenergy-power': ['Bioenergy Power'],
  };

  const CACHE_KEY = 'gem-api-kitchen-sink';
  const CACHE_TTL = 1000 * 60 * 30; // 30 minutes

  let data = $state(null);
  let loading = $state(false);
  let error = $state(null);
  let mode = $state('full');
  let elapsed = $state(0);
  let progress = $state('');
  let cachedAt = $state(null);

  function loadCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const cached = JSON.parse(raw);
      if (Date.now() - cached._cachedAt > CACHE_TTL) return null;
      return cached;
    } catch {
      return null;
    }
  }

  function saveCache(result) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ...result, _cachedAt: Date.now() }));
    } catch {
      /* quota exceeded, etc */
    }
  }

  // Auto-run on mount: show cache immediately, refresh in background if stale
  import { onMount } from 'svelte';
  onMount(() => {
    const cached = loadCache();
    if (cached) {
      cachedAt = new Date(cached._cachedAt);
      data = cached;
    }
    // Always run fresh in background (or foreground if no cache)
    runTests();
  });

  // Generic param probe — test any query param name + value
  async function probeParam(slug, paramName, paramValue) {
    const displayName = API_SLUGS[slug] || slug;
    const params = new URLSearchParams({ format: 'json', limit: '1', asset_type: slug });
    params.set(paramName, paramValue);
    const url = `${API_BASE}/assets?${params}`;
    const start = Date.now();
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok)
        return {
          slug,
          displayName,
          paramName,
          paramValue,
          url,
          ok: false,
          total: null,
          error: `HTTP ${res.status}`,
          durationMs: Date.now() - start,
        };
      const json = await res.json();
      return {
        slug,
        displayName,
        paramName,
        paramValue,
        url,
        ok: true,
        total: json.total ?? 0,
        error: null,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        slug,
        displayName,
        paramName,
        paramValue,
        url,
        ok: false,
        total: null,
        error: err?.message,
        durationMs: Date.now() - start,
      };
    }
  }

  async function probe(slug, status, facets) {
    const displayName = API_SLUGS[slug] || slug;
    const params = new URLSearchParams({ format: 'json', limit: '1' });
    params.set('asset_type', slug);
    if (status) params.set('status', status);
    if (facets) params.set('facets', 'true');

    const url = `${API_BASE}/assets?${params}`;
    const start = Date.now();

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      const durationMs = Date.now() - start;

      if (!res.ok) {
        return {
          slug,
          displayName,
          status,
          facets,
          url,
          httpStatus: res.status,
          ok: false,
          total: null,
          count: 0,
          error: `HTTP ${res.status}: ${res.statusText}`,
          durationMs,
          sampleFields: [],
        };
      }

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('json')) {
        const text = await res.text();
        return {
          slug,
          displayName,
          status,
          facets,
          url,
          httpStatus: res.status,
          ok: false,
          total: null,
          count: 0,
          error: `Non-JSON response (${contentType}): ${text.slice(0, 200)}`,
          durationMs,
          sampleFields: [],
        };
      }

      const json = await res.json();
      const total = json.total ?? null;
      const count = json.count ?? json.results?.length ?? 0;
      const sampleFields = json.results?.[0] ? Object.keys(json.results[0]).sort() : [];
      return {
        slug,
        displayName,
        status,
        facets,
        url,
        httpStatus: res.status,
        ok: true,
        total,
        count,
        error: null,
        durationMs,
        sampleFields,
      };
    } catch (err) {
      return {
        slug,
        displayName,
        status,
        facets,
        url,
        httpStatus: 0,
        ok: false,
        total: null,
        count: 0,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
        sampleFields: [],
      };
    }
  }

  // Streaming state — results appear as they arrive
  let baseProbesLive = $state([]);
  let statusProbesLive = $state([]);

  // API-discovered metadata
  let apiMeta = $state(null);

  function buildData(baseProbes, statusProbes, facetDetails = {}) {
    const quick = statusProbes.length === 0;
    const slugResolution = Object.entries(TRACKER_SLUG_MAP).map(([trackerName, expectedSlug]) => ({
      trackerName,
      expectedSlug,
      resolvedOk: expectedSlug in API_SLUGS,
    }));
    const assetClasses = Object.entries(ASSET_CLASS_TRACKERS).map(([classId, trackers]) => ({
      classId,
      trackers,
      trackerSlugs: trackers.map((tracker) => {
        const slug = TRACKER_SLUG_MAP[tracker] ?? null;
        return { tracker, slug, ok: slug !== null && slug in API_SLUGS };
      }),
    }));

    const failedTypes = baseProbes.filter((p) => !p.ok);
    const zeroCountStatuses = statusProbes.filter((p) => p.ok && p.total === 0);
    const slugResolutionFailures = slugResolution.filter((s) => !s.resolvedOk);
    const assetClassFailures = assetClasses.filter((ac) => ac.trackerSlugs.some((ts) => !ts.ok));

    return {
      timestamp: new Date().toISOString(),
      mode: quick ? 'quick' : 'full',
      overall:
        failedTypes.length === 0 &&
        slugResolutionFailures.length === 0 &&
        assetClassFailures.length === 0
          ? 'pass'
          : 'issues',
      summary: {
        assetTypes: {
          total: baseProbes.length,
          healthy: baseProbes.filter((p) => p.ok).length,
          failed: failedTypes.length,
        },
        statusProbes: {
          total: statusProbes.length,
          healthy: statusProbes.filter((p) => p.ok).length,
          zeroCount: zeroCountStatuses.length,
        },
        slugResolution: { total: slugResolution.length, failures: slugResolutionFailures.length },
        assetClasses: { total: assetClasses.length, withFailures: assetClassFailures.length },
      },
      baseProbes,
      statusMatrix: statusProbes,
      slugResolution,
      assetClasses,
      facetDetails,
      problems: [
        ...failedTypes.map((p) => ({
          message: `We asked for "${p.slug}" but got: ${p.error}`,
          url: p.url,
          expected: `JSON response with asset data for ${p.displayName}`,
        })),
        ...slugResolutionFailures.map((s) => ({
          message: `Our tracker name "${s.trackerName}" maps to slug "${s.expectedSlug}" — but that slug doesn't exist in the API`,
          url: `${API_BASE}/assets?asset_type=${s.expectedSlug}&format=json&limit=1`,
          expected: `Paginated results for ${s.trackerName} assets`,
        })),
        ...assetClassFailures.map((ac) => ({
          message: `Asset class "${ac.classId}" references tracker(s) we can't resolve: ${ac.trackerSlugs
            .filter((ts) => !ts.ok)
            .map((ts) => `"${ts.tracker}"`)
            .join(', ')}`,
          url: ac.trackerSlugs
            .filter((ts) => !ts.ok)
            .map(
              (ts) =>
                `${API_BASE}/assets?asset_type=${ts.slug ?? ts.tracker.toLowerCase().replace(/\s+/g, '-')}&format=json&limit=1`
            )
            .join('\n'),
          expected: `Valid asset_type slug for each tracker in this class`,
        })),
        ...zeroCountStatuses.map((p) => ({
          message: `We asked for ${p.slug} + status=${p.status} and got zero results — might be the wrong status string`,
          url: p.url,
          expected: `At least 1 ${p.displayName} with status "${p.status}"`,
        })),
      ],
    };
  }

  async function runTests() {
    loading = true;
    error = null;
    baseProbesLive = [];
    statusProbesLive = [];
    apiMeta = null;
    const start = Date.now();
    const timer = setInterval(() => {
      elapsed = Date.now() - start;
    }, 200);
    const quick = mode === 'quick';
    const slugs = Object.keys(API_SLUGS);

    try {
      // Phase 0: Discover what the API actually knows
      progress = 'Asking the API what it knows...';
      let taxonomy = null;
      let globalFacets = null;
      try {
        const [taxRes, facetRes] = await Promise.all([
          fetch(`${API_BASE}/catalog/metadata/status-taxonomy?format=json`, {
            signal: AbortSignal.timeout(TIMEOUT_MS),
          }),
          fetch(`${API_BASE}/assets?format=json&limit=1&facets=true`, {
            signal: AbortSignal.timeout(TIMEOUT_MS),
          }),
        ]);
        if (taxRes.ok) taxonomy = await taxRes.json();
        if (facetRes.ok) globalFacets = (await facetRes.json()).facets || {};
      } catch {
        /* metadata fetch failed, continue without */
      }

      // Extract the real values from the API
      const apiCoarseStatuses = globalFacets?.status
        ? Object.keys(globalFacets.status)
        : ['operating', 'planned', 'retired'];
      const apiSubStatuses = globalFacets?.sub_status ? Object.keys(globalFacets.sub_status) : [];
      const apiAssetTypes = globalFacets?.asset_type ? Object.keys(globalFacets.asset_type) : [];

      apiMeta = {
        taxonomy,
        globalFacets,
        coarseStatuses: apiCoarseStatuses,
        subStatuses: apiSubStatuses,
        assetTypes: apiAssetTypes,
        // Map our status names → what the API actually uses
        statusParamDiscovery: {
          status: apiCoarseStatuses,
          sub_status: apiSubStatuses,
        },
      };

      // Phase 1: Base probes — stream in one at a time
      progress = 'Testing asset type slugs...';
      const basePromises = slugs.map(async (s) => {
        const result = await probe(s, null, true);
        baseProbesLive = [...baseProbesLive, result];
        return result;
      });
      const baseProbes = await Promise.all(basePromises);
      data = buildData(baseProbes, []);

      // Phase 2: Status matrix — test BOTH ?status= (coarse) and ?sub_status= (granular)
      let statusProbes = [];
      if (!quick) {
        // 2a: Coarse status (?status=operating, ?status=planned, ?status=retired)
        const coarseTasks = [];
        for (const slug of slugs) {
          for (const sv of apiCoarseStatuses) {
            coarseTasks.push({ slug, paramName: 'status', paramValue: sv });
          }
        }
        // 2b: Sub-status (?sub_status=announced, ?sub_status=construction, etc.)
        const subTasks = [];
        for (const slug of slugs) {
          for (const sv of apiSubStatuses) {
            subTasks.push({ slug, paramName: 'sub_status', paramValue: sv });
          }
        }

        const allTasks = [...coarseTasks, ...subTasks];
        const BATCH = 10;
        for (let i = 0; i < allTasks.length; i += BATCH) {
          progress = `Testing status params... ${i}/${allTasks.length}`;
          const batch = allTasks.slice(i, i + BATCH);
          const results = await Promise.all(
            batch.map((t) => probeParam(t.slug, t.paramName, t.paramValue))
          );
          // Convert to the format buildData expects
          const asStatusProbes = results.map((r) => ({
            ...r,
            status: `${r.paramName}=${r.paramValue}`,
            httpStatus: r.ok ? 200 : 0,
            count: r.total ?? 0,
            sampleFields: [],
            facets: false,
          }));
          statusProbes.push(...asStatusProbes);
          statusProbesLive = [...statusProbes];
          data = buildData(baseProbes, statusProbes);
        }
      }

      // Phase 3: Facet details per type
      let facetDetails = {};
      if (!quick) {
        progress = 'Fetching per-type facets...';
        const facetProbes = await Promise.all(
          slugs.map(async (slug) => {
            const params = new URLSearchParams({
              format: 'json',
              limit: '1',
              asset_type: slug,
              facets: 'true',
            });
            try {
              const res = await fetch(`${API_BASE}/assets?${params}`, {
                signal: AbortSignal.timeout(TIMEOUT_MS),
              });
              if (res.ok) {
                const d = await res.json();
                return { slug, facets: d.facets || {} };
              }
            } catch {
              /* ignore */
            }
            return { slug, facets: {} };
          })
        );
        for (const { slug, facets } of facetProbes) facetDetails[slug] = facets;
      }

      // Final data with everything
      data = buildData(baseProbes, statusProbes, facetDetails);
      saveCache(data);
      cachedAt = new Date();
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
      progress = '';
      clearInterval(timer);
      elapsed = Date.now() - start;
    }
  }

  function buildStatusGrid(statusMatrix) {
    const grid = {};
    for (const p of statusMatrix) {
      if (!grid[p.slug]) grid[p.slug] = {};
      grid[p.slug][p.status] = p;
    }
    return grid;
  }

  // Match our display names to API sub_status keys
  // e.g. "cancelled - inferred 4 y" → "cancelled_inferred"
  //      "mothballed pre-retirement" → "mothballed_pre_retirement"
  function findApiSubStatusKey(ourVal, apiKeys) {
    // Direct match
    if (apiKeys.includes(ourVal)) return ourVal;
    // Simple snake_case
    const snaked = ourVal.replace(/ /g, '_').replace(/-/g, '_');
    if (apiKeys.includes(snaked)) return snaked;
    // Strip trailing qualifiers like "4 y", "2 y" and try
    const stripped = ourVal
      .replace(/\s*-?\s*\d+\s*y$/i, '')
      .trim()
      .replace(/ /g, '_')
      .replace(/-/g, '_');
    if (apiKeys.includes(stripped)) return stripped;
    // Try partial prefix match — "cancelled - inferred 4 y" → "cancelled_inferred"
    const normalized = ourVal
      .replace(/[^a-z0-9]+/gi, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .toLowerCase();
    for (const key of apiKeys) {
      if (key === normalized) return key;
      // Check if either is a prefix of the other
      if (normalized.startsWith(key) || key.startsWith(normalized)) return key;
    }
    return null;
  }

  function cellClass(p) {
    if (!p) return 'cell-missing';
    if (!p.ok) return 'cell-error';
    if (p.total === 0) return 'cell-zero';
    return 'cell-ok';
  }

  function cellText(p) {
    if (!p) return '—';
    if (!p.ok) return 'ERR';
    return p.total?.toLocaleString() ?? '?';
  }
</script>

<svelte:head>
  <title>API Kitchen Sink</title>
</svelte:head>

<div class="kitchen-sink-page">
  <header>
    <h1>API Kitchen Sink</h1>
    <p class="subtitle">
      Where are we and the API talking past each other? This page tests every slug, status, and
      asset class definition we use against what the API actually returns.
    </p>
    <div class="controls">
      <label>
        <input type="radio" bind:group={mode} value="full" /> Full (all statuses)
      </label>
      <label>
        <input type="radio" bind:group={mode} value="quick" /> Quick (base only)
      </label>
      <button onclick={runTests} disabled={loading}>
        {#if loading}
          Running... {(elapsed / 1000).toFixed(1)}s {#if progress}— {progress}{/if}
        {:else}
          Re-run Tests
        {/if}
      </button>
      {#if cachedAt && !loading}
        <span class="cache-hint">Last run: {cachedAt.toLocaleTimeString()}</span>
      {/if}
    </div>
  </header>

  {#if error}
    <div class="error-banner">Error: {error}</div>
  {/if}

  <!-- Streaming: show base probes as they arrive -->
  {#if baseProbesLive.length > 0 && !data}
    <section in:fade={{ duration: 200 }}>
      <h2>Connecting...</h2>
      <table class="probe-table">
        <thead>
          <tr>
            <th>What we asked for</th>
            <th>API calls it</th>
            <th>HTTP</th>
            <th>Count</th>
            <th>Latency</th>
            <th>Shape</th>
          </tr>
        </thead>
        <tbody>
          {#each baseProbesLive as p, i (p.slug)}
            <tr
              in:fly={{ y: 12, duration: 250, delay: i * 40 }}
              class:row-ok={p.ok}
              class:row-err={!p.ok}
            >
              <td><code>{p.slug}</code></td>
              <td>{p.displayName}</td>
              <td class:cell-ok={p.httpStatus === 200} class:cell-error={p.httpStatus !== 200}
                >{p.httpStatus}</td
              >
              <td>{p.total?.toLocaleString() ?? '—'}</td>
              <td>{p.durationMs}ms</td>
              <td class="fields-cell">
                {#if p.error}<span class="err-text">{p.error}</span>{:else}<span class="field-count"
                    >{p.sampleFields.length} fields</span
                  >{/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>
  {/if}

  {#if data}
    <!-- Overall Status -->
    <section
      class="summary-bar"
      class:pass={data.overall === 'pass'}
      class:issues={data.overall !== 'pass'}
      in:fly={{ y: -8, duration: 300 }}
    >
      <span class="status-badge"
        >{data.overall === 'pass' ? 'ALL MATCHED' : 'MISMATCHES FOUND'}</span
      >
      <span class="meta"
        >{data.timestamp} &middot; {data.mode} mode &middot; {(elapsed / 1000).toFixed(1)}s</span
      >
    </section>

    <!-- Problems -->
    {#if data.problems.length > 0}
      <section class="problems" in:fly={{ y: 12, duration: 300, delay: 50 }}>
        <h2>Mismatches ({data.problems.length})</h2>
        <p class="hint">
          Places where what we're asking for doesn't line up with what the API gives back. Could be
          our slug, our status string, or a missing endpoint.
        </p>
        <ul>
          {#each data.problems as problem, i}
            <li class="problem" in:fly={{ x: -8, duration: 200, delay: 100 + i * 30 }}>
              <div class="problem-message">{problem.message}</div>
              <div class="problem-meta">
                <span class="problem-expected">Expected: {problem.expected}</span>
                {#each problem.url.split('\n') as u}
                  <a href={u} target="_blank" rel="noopener" class="problem-url">{u}</a>
                {/each}
              </div>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    <!-- Summary Cards -->
    <section class="summary-cards" in:fade={{ duration: 300, delay: 100 }}>
      {#each [{ value: `${data.summary.assetTypes.healthy}/${data.summary.assetTypes.total}`, label: 'Slugs Connected', warn: false, href: '#slugs' }, ...(data.summary.statusProbes.total > 0 ? [{ value: `${data.summary.statusProbes.healthy}/${data.summary.statusProbes.total}`, label: 'Status Queries OK', warn: false, href: '#status-matrix' }, { value: data.summary.statusProbes.zeroCount, label: 'Empty Responses', warn: data.summary.statusProbes.zeroCount > 0, href: '#status-matrix' }] : []), { value: data.summary.slugResolution.failures, label: 'Name Mismatches', warn: data.summary.slugResolution.failures > 0, href: '#name-resolution' }, { value: data.summary.assetClasses.withFailures, label: 'Broken Class Defs', warn: data.summary.assetClasses.withFailures > 0, href: '#asset-classes' }] as card, i (card.label)}
        <a
          class="card"
          class:warn={card.warn}
          href={card.href}
          in:fly={{ y: 16, duration: 300, delay: 150 + i * 60 }}
        >
          <div class="card-value">{card.value}</div>
          <div class="card-label">{card.label}</div>
        </a>
      {/each}
    </section>

    <!-- Base Probes Table -->
    <section id="slugs" in:fly={{ y: 16, duration: 300, delay: 200 }}>
      <h2>Asset Type Slugs</h2>
      <p class="hint">
        Each row = one <code>?asset_type=</code> slug we send to <code>/assets</code>. Used
        everywhere: screener, compose, widgets, facet queries.
      </p>
      <table class="probe-table">
        <thead>
          <tr>
            <th>What we send</th>
            <th>API calls it</th>
            <th>HTTP</th>
            <th>Count</th>
            <th>Latency</th>
            <th>Response shape</th>
          </tr>
        </thead>
        <tbody>
          {#each data.baseProbes as p, i (p.slug)}
            <tr
              in:fly={{ y: 10, duration: 200, delay: i * 40 }}
              class:row-ok={p.ok}
              class:row-err={!p.ok}
            >
              <td>
                <code>{p.slug}</code>
                <details class="url-details">
                  <summary class="url-toggle">url</summary>
                  <a href={p.url} target="_blank" rel="noopener" class="url-link">{p.url}</a>
                </details>
              </td>
              <td>{p.displayName}</td>
              <td class:cell-ok={p.httpStatus === 200} class:cell-error={p.httpStatus !== 200}
                >{p.httpStatus}</td
              >
              <td>{p.total?.toLocaleString() ?? '—'}</td>
              <td>{p.durationMs}ms</td>
              <td class="fields-cell">
                {#if p.error}
                  <span class="err-text">{p.error}</span>
                {:else}
                  <span class="field-count">{p.sampleFields.length} fields</span>
                  <details>
                    <summary>show</summary>
                    <code>{p.sampleFields.join(', ')}</code>
                  </details>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>

    <!-- How the API actually works -->
    {#if apiMeta}
      <section id="api-status-params" in:fly={{ y: 16, duration: 300, delay: 250 }}>
        <h2>How the API Actually Works</h2>
        <p class="hint">
          Discovered via <code>/catalog/metadata/status-taxonomy</code> and
          <code>?facets=true</code>. The API has <strong>two separate params</strong> for status filtering:
        </p>

        <div class="discovery-grid">
          <div class="discovery-card">
            <h3><code>?status=</code></h3>
            <p class="hint">Coarse bucket. Only {apiMeta.coarseStatuses.length} values.</p>
            <div class="discovery-values">
              {#each apiMeta.coarseStatuses as s}
                <span class="discovery-chip"
                  >{s}
                  <span class="discovery-count"
                    >{apiMeta.globalFacets?.status?.[s]?.toLocaleString() ?? '?'}</span
                  ></span
                >
              {/each}
            </div>
          </div>
          <div class="discovery-card">
            <h3><code>?sub_status=</code></h3>
            <p class="hint">
              Granular. {apiMeta.subStatuses.length} values. This is what we usually want.
            </p>
            <div class="discovery-values">
              {#each apiMeta.subStatuses as s}
                <span class="discovery-chip"
                  >{s}
                  <span class="discovery-count"
                    >{apiMeta.globalFacets?.sub_status?.[s]?.toLocaleString() ?? '?'}</span
                  ></span
                >
              {/each}
            </div>
          </div>
        </div>

        <h3>Our status names vs the API's</h3>
        <p class="hint">
          Our <code>STATUS_VALUES</code> has {STATUSES.length} strings. Here's how each maps to the API's
          params:
        </p>
        <table class="probe-table">
          <thead>
            <tr
              ><th>We use</th><th><code>?status=</code></th><th><code>?sub_status=</code></th><th
                >Verdict</th
              ></tr
            >
          </thead>
          <tbody>
            {#each STATUSES as ourVal}
              {@const inCoarse = apiMeta.coarseStatuses.includes(ourVal)}
              {@const apiKey = findApiSubStatusKey(ourVal, apiMeta.subStatuses)}
              <tr>
                <td><code>{ourVal}</code></td>
                <td class:cell-ok={inCoarse} class:cell-zero={!inCoarse}
                  >{inCoarse ? 'Yes' : 'No'}</td
                >
                <td class:cell-ok={!!apiKey} class:cell-zero={!apiKey}>
                  {#if apiKey}
                    Yes{#if apiKey !== ourVal}
                      → <code>{apiKey}</code>{/if}
                  {:else}
                    No
                  {/if}
                </td>
                <td class="verdict-cell">
                  {#if inCoarse && apiKey}Both
                  {:else if apiKey}Use <code>?sub_status={apiKey}</code>
                  {:else if inCoarse}Use <code>?status={ourVal}</code>
                  {:else}<span class="err-text">No API match — we made this name up</span>{/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </section>
    {/if}

    <!-- Status Matrix -->
    {#if data.statusMatrix.length > 0}
      {@const grid = buildStatusGrid(data.statusMatrix)}
      {@const coarseKeys = apiMeta?.coarseStatuses ?? []}
      {@const subKeys = apiMeta?.subStatuses ?? []}
      <section id="status-matrix" in:fly={{ y: 16, duration: 300, delay: 300 }}>
        <h2>Status Param Matrix</h2>
        <p class="hint">
          Live results: testing both <code>?status=</code> and <code>?sub_status=</code> for each asset
          type.
        </p>

        {#if coarseKeys.length > 0}
          <h3><code>?status=</code> ({coarseKeys.length} values)</h3>
          <div class="matrix-scroll">
            <table class="matrix-table">
              <thead
                ><tr
                  ><th>Slug</th>{#each coarseKeys as sv}<th class="status-header">{sv}</th
                    >{/each}</tr
                ></thead
              >
              <tbody>
                {#each Object.keys(API_SLUGS) as slug}
                  <tr>
                    <td><code>{slug}</code></td>
                    {#each coarseKeys as sv}
                      {@const p = grid[slug]?.[`status=${sv}`]}
                      <td
                        class={cellClass(p)}
                        title={p ? `${p.total?.toLocaleString() ?? '?'} assets\n${p.url}` : '—'}
                        >{cellText(p)}</td
                      >
                    {/each}
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}

        {#if subKeys.length > 0}
          <h3><code>?sub_status=</code> ({subKeys.length} values)</h3>
          <div class="matrix-scroll">
            <table class="matrix-table">
              <thead
                ><tr
                  ><th>Slug</th>{#each subKeys as sv}<th class="status-header">{sv}</th>{/each}</tr
                ></thead
              >
              <tbody>
                {#each Object.keys(API_SLUGS) as slug}
                  <tr>
                    <td><code>{slug}</code></td>
                    {#each subKeys as sv}
                      {@const p = grid[slug]?.[`sub_status=${sv}`]}
                      <td
                        class={cellClass(p)}
                        title={p ? `${p.total?.toLocaleString() ?? '?'} assets\n${p.url}` : '—'}
                        >{cellText(p)}</td
                      >
                    {/each}
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </section>
    {/if}

    <!-- Facet Details -->
    {#if Object.keys(data.facetDetails).length > 0}
      <section in:fly={{ y: 16, duration: 300, delay: 400 }}>
        <h2>What the API Actually Knows</h2>
        <p class="hint">
          These are the facet counts the API returns with <code>?facets=true</code>. This is the
          source of truth — if a status or country isn't here, the API doesn't have it for that
          type.
        </p>
        <div class="facet-grid">
          {#each Object.entries(data.facetDetails) as [slug, facets], si}
            <div class="facet-card" in:fly={{ y: 12, duration: 250, delay: 420 + si * 50 }}>
              <div class="facet-card-header">
                <code>{slug}</code>
                <span class="facet-card-meta">{Object.keys(facets).length} facets</span>
              </div>
              {#each Object.entries(facets) as [category, values]}
                <div class="facet-section">
                  <div class="facet-section-label">{category}</div>
                  <div class="facet-bars">
                    {#each Object.entries(values)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 8) as [key, count]}
                      {@const max = Math.max(...Object.values(values))}
                      <div class="facet-bar-row">
                        <span class="facet-bar-label">{key}</span>
                        <div class="facet-bar-track">
                          <div
                            class="facet-bar-fill"
                            style="width: {Math.max(2, (count / max) * 100)}%"
                          ></div>
                        </div>
                        <span class="facet-bar-value">{count.toLocaleString()}</span>
                      </div>
                    {/each}
                    {#if Object.keys(values).length > 8}
                      <div class="facet-bar-row">
                        <span class="facet-bar-label facet-more"
                          >+{Object.keys(values).length - 8} more</span
                        >
                      </div>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          {/each}
        </div>
      </section>
    {/if}

    <!-- Slug Resolution -->
    <section id="name-resolution" in:fly={{ y: 16, duration: 300, delay: 500 }}>
      <h2>Name Resolution</h2>
      <p class="hint">
        Our code uses tracker names like "Coal Plant" or "Bioenergy Power". This table checks
        whether each name maps to a slug the API recognizes. A mismatch here means we're calling
        something by a name the API doesn't understand.
      </p>
      <table class="probe-table">
        <thead>
          <tr><th>We call it</th><th>We send this slug</th><th>API knows it?</th></tr>
        </thead>
        <tbody>
          {#each data.slugResolution as row}
            <tr>
              <td>{row.trackerName}</td>
              <td><code>{row.expectedSlug}</code></td>
              <td class:cell-ok={row.resolvedOk} class:cell-error={!row.resolvedOk}>
                {row.resolvedOk ? 'Yes' : 'No'}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>

    <!-- Asset Class Resolution -->
    <section id="asset-classes" in:fly={{ y: 16, duration: 300, delay: 600 }}>
      <h2>Asset Class Definitions</h2>
      <p class="hint">
        Each asset class in the screener references one or more trackers. This checks that every
        tracker in every class definition resolves to a real API slug. If a chip is red, that class
        can't fetch data.
      </p>
      <table class="probe-table">
        <thead>
          <tr><th>Class</th><th>Tracker → Slug</th><th>Resolves?</th></tr>
        </thead>
        <tbody>
          {#each data.assetClasses as ac}
            {@const allOk = ac.trackerSlugs.every((ts) => ts.ok)}
            <tr>
              <td><code>{ac.classId}</code></td>
              <td>
                {#each ac.trackerSlugs as ts}
                  <span class="tracker-chip" class:chip-ok={ts.ok} class:chip-err={!ts.ok}>
                    {ts.tracker} → <code>{ts.slug ?? '???'}</code>
                  </span>
                {/each}
              </td>
              <td class:cell-ok={allOk} class:cell-error={!allOk}>
                {allOk ? 'Yes' : 'No'}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>

    <!-- Raw JSON -->
    <details class="raw-json">
      <summary>Raw JSON</summary>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </details>
  {/if}
</div>

<style>
  .kitchen-sink-page {
    width: 100%;
    padding: var(--space-10) var(--space-5);
  }

  header {
    margin-bottom: var(--space-8);
  }

  h1 {
    font-size: var(--font-size-3xl);
    font-weight: 700;
    margin: 0 0 var(--space-1);
    color: var(--color-text-primary);
  }

  .subtitle {
    font-size: var(--font-size-lg);
    color: var(--color-text-secondary);
    margin: 0 0 var(--space-4);
  }

  h2 {
    font-size: var(--font-size-xl);
    font-weight: 700;
    margin: var(--space-8) 0 var(--space-4);
    color: var(--color-text-primary);
    border-bottom: 1px solid var(--color-border);
    padding-bottom: var(--space-2);
  }

  .controls {
    display: flex;
    gap: var(--space-4);
    align-items: center;
  }

  .controls label {
    color: var(--color-text-secondary);
    cursor: pointer;
    font-size: var(--font-size-sm);
  }

  button {
    background: var(--gem-primary-blue);
    color: var(--gem-warm-white);
    border: none;
    padding: var(--space-2) var(--space-6);
    border-radius: var(--radius-md);
    font-size: var(--font-size-sm);
    cursor: pointer;
    font-weight: 700;
    transition: background var(--transition-fast);
  }

  button:disabled {
    opacity: 0.6;
    cursor: wait;
  }
  button:hover:not(:disabled) {
    opacity: 0.85;
  }

  .cache-hint {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
  }

  .error-banner {
    background: #fef2f2;
    color: #991b1b;
    border: 1px solid #fecaca;
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-lg);
    margin-bottom: var(--space-4);
    font-size: var(--font-size-sm);
  }

  .summary-bar {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-lg);
    margin-bottom: var(--space-4);
  }

  .summary-bar.pass {
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
  }

  .summary-bar.issues {
    background: #fef2f2;
    border: 1px solid #fecaca;
  }

  .status-badge {
    font-family: var(--font-family-data);
    font-weight: 700;
    font-size: var(--font-size-sm);
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .pass .status-badge {
    color: #166534;
  }
  .issues .status-badge {
    color: #991b1b;
  }

  /* Discovery section */
  .discovery-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-4);
    margin-bottom: var(--space-6);
  }

  .discovery-card {
    background: var(--color-bg-primary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-card);
    padding: var(--space-4);
  }

  .discovery-card h3 {
    font-size: var(--font-size-lg);
    margin: 0 0 var(--space-1);
    border: none;
    padding: 0;
  }

  .discovery-values {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }

  .discovery-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-full);
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    background: #f0fdf4;
    color: #166534;
    border: 1px solid #bbf7d0;
  }

  .discovery-count {
    font-family: var(--font-family-data);
    font-weight: 600;
    color: var(--gem-primary-blue);
  }

  .verdict-cell {
    font-size: var(--font-size-xs);
  }

  h3 {
    font-size: var(--font-size-lg);
    font-weight: 700;
    margin: var(--space-6) 0 var(--space-2);
    color: var(--color-text-primary);
  }

  .meta {
    color: var(--color-text-tertiary);
    font-size: var(--font-size-xs);
  }

  .problems {
    background: #fffbeb;
    border: 1px solid #fde68a;
    border-radius: var(--radius-lg);
    padding: var(--space-4);
    margin-bottom: var(--space-4);
  }

  .problems h2 {
    color: #92400e;
    margin-top: 0;
    border: none;
    padding: 0;
    font-size: var(--font-size-lg);
  }

  .problems ul {
    margin: 0;
    padding-left: var(--space-6);
  }

  .problem {
    color: #78350f;
    margin-bottom: var(--space-3);
    font-size: var(--font-size-sm);
  }

  .problem-message {
    margin-bottom: var(--space-1);
  }

  .problem-meta {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding-left: var(--space-2);
    border-left: 2px solid #fde68a;
  }

  .problem-expected {
    font-size: var(--font-size-xs);
    color: #92400e;
    opacity: 0.8;
  }

  .problem-url {
    font-family: var(--font-family-mono);
    font-size: 10px;
    color: #92400e;
    word-break: break-all;
    text-decoration: none;
    opacity: 0.6;
  }

  .problem-url:hover {
    opacity: 1;
    text-decoration: underline;
  }

  .summary-cards {
    display: flex;
    gap: var(--space-4);
    flex-wrap: wrap;
    margin-bottom: var(--space-4);
  }

  .card {
    background: var(--color-bg-primary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-card);
    padding: var(--space-4) var(--space-6);
    text-align: center;
    min-width: 140px;
    text-decoration: none;
    display: block;
    cursor: pointer;
    transition:
      border-color var(--transition-fast),
      box-shadow var(--transition-fast);
  }

  .card:hover {
    border-color: var(--gem-primary-blue);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  }

  .card.warn {
    border-color: #f59e0b;
    background: #fffbeb;
  }

  .card-value {
    font-family: var(--font-family-data);
    font-size: var(--font-size-3xl);
    font-weight: 700;
    color: var(--color-text-primary);
  }

  .card.warn .card-value {
    color: #b45309;
  }

  .card-label {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    margin-top: var(--space-1);
    text-transform: uppercase;
    letter-spacing: 0.03em;
    font-weight: 600;
  }

  /* Tables */
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--font-size-sm);
  }

  th {
    text-align: left;
    padding: var(--space-2) var(--space-3);
    background: var(--color-bg-secondary);
    color: var(--color-text-secondary);
    font-weight: 600;
    border-bottom: 2px solid var(--color-border);
    position: sticky;
    top: 0;
    font-size: var(--font-size-xs);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  td {
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--color-border);
    color: var(--color-text-primary);
  }

  code {
    font-family: var(--font-family-mono);
    font-size: var(--font-size-sm);
    background: var(--color-bg-secondary);
    padding: 0.1rem var(--space-2);
    border-radius: var(--radius-sm);
    color: var(--gem-primary-blue);
  }

  .row-err {
    background: #fef2f2;
  }

  .cell-ok {
    background: #f0fdf4;
    color: #166534;
    text-align: center;
    font-weight: 600;
  }
  .cell-error {
    background: #fef2f2;
    color: #991b1b;
    text-align: center;
    font-weight: 600;
  }
  .cell-zero {
    background: #fffbeb;
    color: #92400e;
    text-align: center;
    font-weight: 600;
  }
  .cell-missing {
    background: var(--color-bg-secondary);
    color: var(--color-text-tertiary);
    text-align: center;
  }

  .url-details {
    margin-top: var(--space-1);
  }

  .url-toggle {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    cursor: pointer;
    user-select: none;
  }

  .url-toggle:hover {
    color: var(--gem-primary-blue);
  }

  .url-link {
    display: block;
    font-family: var(--font-family-mono);
    font-size: 10px;
    color: var(--gem-primary-blue);
    word-break: break-all;
    margin-top: var(--space-1);
    text-decoration: none;
    opacity: 0.7;
  }

  .url-link:hover {
    opacity: 1;
    text-decoration: underline;
  }

  .fields-cell {
    max-width: 400px;
  }
  .field-count {
    color: var(--color-text-tertiary);
  }
  .err-text {
    color: #991b1b;
    font-size: var(--font-size-xs);
  }

  details summary {
    cursor: pointer;
    color: var(--gem-primary-blue);
    font-size: var(--font-size-xs);
  }

  /* Status matrix */
  .matrix-scroll {
    overflow-x: auto;
  }
  .matrix-table {
    min-width: 900px;
  }
  .matrix-table td,
  .matrix-table th {
    text-align: center;
    white-space: nowrap;
    min-width: 80px;
  }
  .matrix-table td:first-child {
    text-align: left;
  }

  .status-header {
    font-size: var(--font-size-xs);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .hint {
    color: var(--color-text-tertiary);
    font-size: var(--font-size-sm);
    margin: 0 0 var(--space-3);
  }

  /* Tracker chips */
  .tracker-chip {
    display: inline-block;
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-full);
    font-size: var(--font-size-xs);
    margin: var(--space-1) var(--space-1);
  }

  .chip-ok {
    background: #f0fdf4;
    color: #166534;
    border: 1px solid #bbf7d0;
  }

  .chip-err {
    background: #fef2f2;
    color: #991b1b;
    border: 1px solid #fecaca;
  }

  /* Facet card grid */
  .facet-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: var(--space-4);
  }

  .facet-card {
    background: var(--color-bg-primary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-card);
    padding: var(--space-4);
    overflow: hidden;
  }

  .facet-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-3);
    padding-bottom: var(--space-2);
    border-bottom: 1px solid var(--color-border);
  }

  .facet-card-meta {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
  }

  .facet-section {
    margin-bottom: var(--space-3);
  }

  .facet-section:last-child {
    margin-bottom: 0;
  }

  .facet-section-label {
    font-size: var(--font-size-xs);
    font-weight: 600;
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.03em;
    margin-bottom: var(--space-2);
  }

  .facet-bars {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .facet-bar-row {
    display: grid;
    grid-template-columns: 100px 1fr 50px;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--font-size-xs);
  }

  .facet-bar-label {
    color: var(--color-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .facet-bar-label.facet-more {
    color: var(--color-text-tertiary);
    font-style: italic;
  }

  .facet-bar-track {
    height: 6px;
    background: var(--color-bg-secondary);
    border-radius: var(--radius-full);
    overflow: hidden;
  }

  .facet-bar-fill {
    height: 100%;
    background: var(--gem-primary-blue);
    border-radius: var(--radius-full);
    transition: width 0.4s ease-out;
  }

  .facet-bar-value {
    font-family: var(--font-family-data);
    font-variant-numeric: tabular-nums;
    color: var(--gem-primary-blue);
    text-align: right;
    font-weight: 600;
  }

  /* Raw JSON */
  .raw-json {
    margin-top: var(--space-8);
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--space-3);
  }

  .raw-json pre {
    max-height: 600px;
    overflow: auto;
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
  }
</style>
