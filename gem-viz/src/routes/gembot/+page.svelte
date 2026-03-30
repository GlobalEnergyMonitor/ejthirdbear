<script>
  /**
   * GEMBOT — AI Chat Interface
   * Conversational assistant for querying GEM ownership data.
   * Streams responses from /api/chat, renders tool calls inline,
   * and persists chat history in localStorage.
   */

  // --- Imports ---
  import { onMount } from 'svelte';
  import { marked } from 'marked';
  import { link, entityLink } from '$lib/links';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import { investigationCart } from '$lib/investigationCart';
  import { colorByTracker, colors } from '$lib/design-tokens';
  import { emptyFilterState } from '$lib/filter-state';
  import { ComposeState } from '$lib/stores/compose-state.svelte';

  // Components
  import EntityMicroCard from '$lib/components/cards/EntityMicroCard.svelte';
  import AssetMicroCard from '$lib/components/cards/AssetMicroCard.svelte';
  import SeoMeta from '$lib/components/nav/SeoMeta.svelte';
  import GembotComposeDeck from '$lib/components/gembot/GembotComposeDeck.svelte';
  import ChatSidebar from './ChatSidebar.svelte';
  import WelcomeState from './WelcomeState.svelte';

  // Gembot utilities
  import {
    SUGGESTIONS,
    QUICK_ENTITIES,
    getToolIcon,
    getToolSummary,
    hasEntityResults,
    hasAssetResults,
    getEntityItems,
    getAssetItems,
    hasComparisonResults,
    hasScreenerUrl,
    hasMapResults,
    createMapAction,
  } from './gembot-utils';

  // --- Config ---
  marked.setOptions({ breaks: true, gfm: true });
  const CHAT_STORAGE_KEY = 'gembot-chat-history';

  // --- State ---
  let messages = $state([]);
  let input = $state('');
  let isLoading = $state(false);
  let currentToolCalls = $state([]);
  let chatContainer = $state(null);
  let inputElement = $state(null);

  // Streaming
  let streamingText = $state('');
  let streamingStatus = $state('');
  let activeTools = $state(new Map());
  let composeState = new ComposeState({ syncUrl: false });
  let composeDeckOpen = $state(false);
  let composeDeckLoading = $state(false);
  let composeDeckInitialized = $state(false);
  let composeDeckInitPromise = $state(null);
  let composeDeckError = $state('');
  let composeDeckTitle = $state('Live Filters');
  let composeDeckNote = $state('Use Compose filters here without leaving chat.');

  // --- Storage ---
  function saveMessages() {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
      } catch (e) {
        if (import.meta.env.DEV) console.warn('Failed to save chat history:', e);
      }
    }
  }

  // Load messages from localStorage
  function loadMessages() {
    if (typeof localStorage !== 'undefined') {
      try {
        const saved = localStorage.getItem(CHAT_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            messages = parsed;
          }
        }
      } catch (e) {
        if (import.meta.env.DEV) console.warn('Failed to load chat history:', e);
      }
    }
  }

  // Clear chat history
  function clearHistory() {
    messages = [];
    currentToolCalls = [];
    streamingText = '';
    streamingStatus = '';
    activeTools = new Map();
    composeDeckOpen = false;
    composeDeckLoading = false;
    composeDeckError = '';
    composeDeckTitle = 'Live Filters';
    composeDeckNote = 'Use Compose filters here without leaving chat.';
    if (composeDeckInitialized) {
      composeState.clearFilters();
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(CHAT_STORAGE_KEY);
    }
    mentionedEntities = new Map();
    mentionedAssets = new Map();
  }

  // Mentioned entities accumulator - tracks everything discussed with provenance
  let mentionedEntities = $state(new Map());
  let mentionedAssets = $state(new Map());

  const asString = (value, fallback = '') =>
    typeof value === 'string' ? value : value == null ? fallback : String(value);
  const asNumber = (value, fallback = 0) => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };
  const asOptionalNumber = (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  };

  // Human-readable tool name mapping
  const TOOL_LABELS = {
    search_entities: 'Search',
    get_entity_details: 'Details',
    get_entity_portfolio: 'Portfolio',
    get_entity_owners: 'Owners',
    get_ownership_graph: 'Graph',
    search_assets: 'Asset search',
    get_asset_details: 'Asset details',
    get_top_owners: 'Top owners',
    get_top_owners_by_country: 'Top owners',
    get_country_breakdown: 'Country stats',
    get_status_breakdown: 'Status stats',
    compare_entities: 'Comparison',
    find_common_owners: 'Common owners',
    get_owner_geographic_footprint: 'Footprint',
    open_compose_control: 'Compose deck',
    discover_api_endpoints: 'API index',
    query_api_ad_hoc: 'API query',
  };

  const COMPOSE_TOOL_NAME = 'open_compose_control';

  const isComposeControlPayload = (result) => result?.type === 'compose_control';
  const isComposeControlResult = (toolCall) =>
    toolCall?.tool === COMPOSE_TOOL_NAME && isComposeControlPayload(toolCall.result);
  const isApiEndpointIndexResult = (toolCall) => toolCall?.result?.type === 'api_endpoint_index';
  const isApiAdHocResult = (toolCall) => toolCall?.result?.type === 'api_ad_hoc_result';

  function getComposeSummaryLabels(filters = {}) {
    const labels = [];
    const pushList = (values, prefix) => {
      if (Array.isArray(values) && values.length > 0) {
        labels.push(...values.slice(0, 2).map((value) => `${prefix}: ${value}`));
        if (values.length > 2) labels.push(`${prefix}: +${values.length - 2} more`);
      }
    };

    pushList(filters.trackers, 'Tracker');
    pushList(filters.statuses, 'Status');
    pushList(filters.countries, 'Country');
    pushList(filters.stateProvinces, 'State');
    pushList(filters.ownerCountries, 'Owner HQ');
    pushList(filters.owners, 'Owner');

    if (filters.capacityMin != null || filters.capacityMax != null) {
      labels.push(`Capacity: ${filters.capacityMin ?? 'min'}-${filters.capacityMax ?? 'max'} MW`);
    }
    if (filters.shareMin != null || filters.shareMax != null) {
      labels.push(`Share: ${filters.shareMin ?? 'min'}-${filters.shareMax ?? 'max'}%`);
    }
    if (filters.startYearMin != null || filters.startYearMax != null) {
      labels.push(`Start year: ${filters.startYearMin ?? 'min'}-${filters.startYearMax ?? 'max'}`);
    }
    if (filters.search) {
      labels.push(`Search: ${filters.search}`);
    }

    return labels;
  }

  async function ensureComposeDeckReady() {
    if (composeDeckInitialized) return composeState;
    if (composeDeckInitPromise) return composeDeckInitPromise;

    composeDeckLoading = true;
    composeDeckError = '';

    composeDeckInitPromise = composeState
      .init(emptyFilterState())
      .then(() => {
        composeDeckInitialized = true;
        return composeState;
      })
      .catch((error) => {
        composeDeckError =
          error instanceof Error ? error.message : 'Failed to load live filters. Please try again.';
        throw error;
      })
      .finally(() => {
        composeDeckLoading = false;
        composeDeckInitPromise = null;
      });

    return composeDeckInitPromise;
  }

  async function openComposeDeck(control = {}) {
    composeDeckOpen = true;
    composeDeckTitle = control.title || 'Live Filters';
    composeDeckNote = control.message || 'Use Compose filters here without leaving chat.';

    let state;
    try {
      state = await ensureComposeDeckReady();
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('[gembot] failed to initialize compose deck:', error);
      }
      return;
    }
    if (!state) return;

    if (control.mode === 'clear' || control.filters) {
      state.applyAssistantFilters(control.filters || {}, { mode: control.mode || 'replace' });
    }
  }

  function closeComposeDeck() {
    composeDeckOpen = false;
  }

  // Extract entities/assets from tool results with provenance tracking
  function trackMentioned(toolCalls) {
    for (const tc of toolCalls) {
      const result = tc.result;
      if (!result) continue;
      const toolName = tc.tool || tc.name || 'unknown';
      const sourceLabel = TOOL_LABELS[toolName] || toolName.replace(/_/g, ' ');

      // Entities from various tools — each source type gets a role label
      let entities = [];
      let role = '';
      if (result.entities) {
        entities = result.entities;
        role = 'found via';
      } else if (result.subsidiaries) {
        entities = result.subsidiaries;
        role = 'subsidiary of query';
      } else if (result.directOwners || result.owners) {
        entities = result.directOwners || result.owners;
        role = 'owner';
      } else if (result.comparisons) {
        entities = result.comparisons;
        role = 'compared';
      } else if (result.commonOwners) {
        entities = result.commonOwners;
        role = 'common owner';
      } else if (result.data?.owners) {
        entities = result.data.owners;
        role = 'top owner';
      }

      for (const e of entities) {
        const id = e.id || e.entityId || e.ownerEntityId;
        const name = e.name || e.entityName || e.ownerName;
        if (id && name) {
          const existing = mentionedEntities.get(id);
          mentionedEntities.set(id, {
            id,
            name,
            country: e.headquartersCountry || e.country || existing?.country || '',
            ownershipPct: e.ownershipPct || e.pct || existing?.ownershipPct,
            source: sourceLabel,
            role: role || existing?.role || '',
            assetCount: e.assetCount || e.value || existing?.assetCount,
          });
        }
      }

      // Assets — track which tool surfaced them
      const assets = result.assets || (result.id && result.name && result.type ? [result] : []);
      for (const a of assets) {
        if (a.id && a.name) {
          const existing = mentionedAssets.get(a.id);
          mentionedAssets.set(a.id, {
            id: a.id,
            name: a.name,
            type: a.type || a.tracker || existing?.type,
            status: a.status || existing?.status,
            country: a.country || existing?.country,
            capacity: a.capacity || existing?.capacity,
            capacityUnit: a.capacityUnit || existing?.capacityUnit,
            owner: a.owner || a.owners?.[0]?.name || existing?.owner,
            source: sourceLabel,
          });
        }
      }
    }
    // Trigger reactivity
    mentionedEntities = new Map(mentionedEntities);
    mentionedAssets = new Map(mentionedAssets);
  }

  async function sendMessage(content = input.trim()) {
    if (!content || isLoading) return;

    // Add user message
    const userMessage = { role: 'user', content };
    messages = [...messages, userMessage];
    input = '';
    isLoading = true;
    currentToolCalls = [];
    streamingText = '';
    streamingStatus = 'Connecting...';
    activeTools = new Map();

    try {
      // Include cart contents so the model can read them
      const cartItems = $investigationCart;
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          cart: cartItems,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          payload?.error || payload?.message || `Failed to get response (${response.status})`
        );
      }

      if (!response.body) {
        throw new Error('Chat response stream was empty');
      }

      // Handle SSE stream
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            continue;
          }
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              handleStreamEvent(data);
            } catch {
              // Ignore parse errors
            }
          }
        }
        scrollToBottom();
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error('Chat error:', err);
      messages = [
        ...messages,
        {
          role: 'assistant',
          content:
            err instanceof Error
              ? `Gembot hit an error: ${err.message}`
              : 'Gembot hit an unexpected error.',
          error: true,
        },
      ];
    } finally {
      isLoading = false;
      streamingStatus = '';
      streamingText = '';
      activeTools = new Map();
      scrollToBottom();
    }
  }

  // Handle individual stream events
  function handleStreamEvent(data) {
    // Status updates
    if (data.stage) {
      streamingStatus = data.message || data.stage;
      return;
    }

    // Tool starting - track with args
    if (data.tool && data.id && !data.result) {
      activeTools = new Map([...activeTools, [data.tool, data.args || {}]]);
      return;
    }

    // Tool result
    if (data.tool && data.result !== undefined) {
      activeTools.delete(data.tool);
      activeTools = new Map(activeTools);

      // Handle cart operations client-side
      if (data.result?.type === 'cart_write') {
        executeCartOperation(data.result);
      }
      if (isComposeControlPayload(data.result)) {
        void openComposeDeck(data.result);
      }

      currentToolCalls = [...currentToolCalls, data];
      trackMentioned([data]);
      return;
    }

    if (data.message !== undefined && data.toolCalls === undefined) {
      messages = [
        ...messages,
        {
          role: 'assistant',
          content: `Gembot hit an error: ${data.message}`,
          error: true,
        },
      ];
      saveMessages();
      streamingText = '';
      return;
    }

    // Text chunk
    if (data.content !== undefined) {
      streamingText += data.content;
      return;
    }

    // Completion
    if (data.message !== undefined && data.toolCalls !== undefined) {
      // Final message - add to messages array
      const assistantMessage = {
        role: 'assistant',
        content: data.message,
        toolCalls: data.toolCalls || [],
      };
      messages = [...messages, assistantMessage];
      streamingText = '';
      currentToolCalls = [];
      saveMessages(); // Persist to localStorage
    }
  }

  // Execute cart operations client-side
  function executeCartOperation(result) {
    switch (result.action) {
      case 'add':
        if (result.items?.length > 0) {
          investigationCart.addMany(result.items);
        }
        break;
      case 'remove':
        if (result.ids?.length > 0) {
          investigationCart.removeMany(result.ids);
        }
        break;
      case 'clear':
        investigationCart.clear();
        break;
    }
  }

  function handleKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function scrollToBottom() {
    setTimeout(() => {
      if (chatContainer) {
        chatContainer.scrollTop = chatContainer.scrollHeight;
      }
    }, 50);
  }

  // Render markdown using marked
  function renderMarkdown(text) {
    if (!text) return '';
    return marked.parse(text);
  }

  // Map instances tracker and action
  let mapInstances = new Map();
  const mapAction = createMapAction(mapInstances);

  onMount(() => {
    loadMessages();
    inputElement?.focus();
    // Scroll to bottom if there's history
    setTimeout(() => scrollToBottom(), 100);
  });
</script>

<svelte:head>
  <title>Gembot - GEM AI Assistant</title>
  <meta
    name="description"
    content="Chat with Gembot to explore Global Energy Monitor data on energy assets and ownership."
  />
  <SeoMeta
    title="GEM Bot — Global Energy Monitor"
    description="Chat with Gembot to explore Global Energy Monitor data on energy assets and ownership."
  />
</svelte:head>

<div class="gembot-container">
  <div class="chat-layout" class:compose-active={composeDeckOpen}>
    <!-- Main chat area -->
    <main class="chat-main">
      <div class="chat-messages" bind:this={chatContainer}>
        {#if messages.length === 0}
          <WelcomeState onSendMessage={sendMessage} onOpenComposeDeck={openComposeDeck} />
        {:else}
          <!-- Message list -->
          {#each messages as message, i}
            <div class="message-wrapper {message.role}">
              <div class="message">
                {#if message.role === 'user'}
                  <div class="avatar avatar--user">You</div>
                {:else}
                  <div class="avatar avatar--bot">G</div>
                {/if}

                <div class="message-content">
                  {#if message.toolCalls && message.toolCalls.length > 0}
                    <div class="tool-calls-section flex flex-col gap-2">
                      {#each message.toolCalls as toolCall}
                        <details
                          class="detail-block"
                          open={hasEntityResults(toolCall) || hasAssetResults(toolCall)}
                        >
                          <summary class="detail-block__header">
                            <span class="detail-block__icon">{getToolIcon(toolCall.tool)}</span>
                            <span class="detail-block__title"
                              >{getToolSummary(toolCall.tool, toolCall.args)}</span
                            >
                            {#if toolCall.result?.count !== undefined}
                              <span class="detail-block__badge">({toolCall.result.count})</span>
                            {:else if toolCall.result?.entities?.length}
                              <span class="detail-block__badge"
                                >({toolCall.result.entities.length} found)</span
                              >
                            {:else if toolCall.result?.subsidiaries?.length}
                              <span class="detail-block__badge"
                                >({toolCall.result.subsidiaries.length})</span
                              >
                            {:else if toolCall.result?.owners?.length}
                              <span class="detail-block__badge"
                                >({toolCall.result.owners.length})</span
                              >
                            {:else if toolCall.result?.features?.length}
                              <span class="detail-block__badge"
                                >({toolCall.result.features.length} locations)</span
                              >
                            {/if}
                            <span class="tool-status">✓</span>
                          </summary>
                          <div class="detail-block__content">
                            <!-- Visual entity results -->
                            {#if hasEntityResults(toolCall)}
                              {@const entities = getEntityItems(toolCall)}
                              {#if entities.length > 0}
                                <div class="visual-results entity-grid">
                                  {#each entities.slice(0, 8) as entity}
                                    <EntityMicroCard
                                      name={asString(
                                        entity.name || entity.entityName || entity.ownerName,
                                        'Unknown'
                                      )}
                                      location={asString(entity.headquartersCountry, '')}
                                      href={entityLink(
                                        asString(
                                          entity.id || entity.entityId || entity.ownerEntityId
                                        )
                                      )}
                                      variant="compact"
                                    />
                                  {/each}
                                  {#if entities.length > 8}
                                    <div class="more-results">+{entities.length - 8} more</div>
                                  {/if}
                                </div>
                              {/if}
                              <!-- Visual asset results -->
                            {:else if hasAssetResults(toolCall)}
                              {@const assets = getAssetItems(toolCall)}
                              {#if assets.length > 0}
                                <div class="visual-results asset-grid">
                                  {#each assets.slice(0, 6) as asset}
                                    <AssetMicroCard
                                      id={asString(asset.id)}
                                      name={asString(asset.name)}
                                      tracker={asString(asset.type || asset.tracker)}
                                      status={asString(asset.status)}
                                      country={asString(asset.country)}
                                      capacity={asNumber(asset.capacity)}
                                      owner={asString(asset.owner)}
                                      latitude={asOptionalNumber(asset.latitude)}
                                      longitude={asOptionalNumber(asset.longitude)}
                                      variant="compact"
                                    />
                                  {/each}
                                  {#if assets.length > 6}
                                    <div class="more-results">+{assets.length - 6} more</div>
                                  {/if}
                                </div>
                              {/if}
                              <!-- Ownership graph results -->
                            {:else if toolCall.tool === 'get_ownership_graph' && toolCall.result}
                              <div class="graph-preview">
                                <div class="graph-stats">
                                  <span class="stat-item">
                                    <strong>{toolCall.result.nodeCount}</strong> entities
                                  </span>
                                  <span class="stat-item">
                                    <strong>{toolCall.result.edgeCount}</strong> connections
                                  </span>
                                  {#if toolCall.result.truncated}
                                    <span class="truncated-warning">Results truncated</span>
                                  {/if}
                                </div>
                                {#if toolCall.result.nodes}
                                  <div class="graph-node-list">
                                    {#each toolCall.result.nodes.slice(0, 5) as node}
                                      <span
                                        class="graph-node"
                                        class:is-root={node.is_root}
                                        class:is-terminal={node.is_terminal}
                                      >
                                        {node.Name}
                                      </span>
                                    {/each}
                                    {#if toolCall.result.nodes.length > 5}
                                      <span class="more-nodes"
                                        >+{toolCall.result.nodes.length - 5} more</span
                                      >
                                    {/if}
                                  </div>
                                {/if}
                              </div>
                              <!-- Analytics: Top owners -->
                            {:else if toolCall.tool === 'get_top_owners' && toolCall.result?.owners}
                              <div class="analytics-table">
                                <div class="analytics-header">
                                  Top {toolCall.result.owners.length} Owners {toolCall.result
                                    .tracker !== 'all'
                                    ? `(${toolCall.result.tracker})`
                                    : ''}
                                </div>
                                <div class="ranking-list">
                                  {#each toolCall.result.owners.slice(0, 10) as owner, i}
                                    <div class="ranking-item">
                                      <span class="ranking-item__rank">#{i + 1}</span>
                                      <span class="ranking-item__name">{owner.name}</span>
                                      <span class="ranking-item__value"
                                        >{owner.assetCount} assets</span
                                      >
                                    </div>
                                  {/each}
                                </div>
                              </div>
                              <!-- Analytics: Country breakdown -->
                            {:else if toolCall.tool === 'get_country_breakdown' && toolCall.result?.countries}
                              <div class="analytics-table">
                                <div class="analytics-header">
                                  Assets by Country {toolCall.result.tracker !== 'all'
                                    ? `(${toolCall.result.tracker})`
                                    : ''}
                                </div>
                                <div class="ranking-list">
                                  {#each toolCall.result.countries.slice(0, 10) as country, i}
                                    <div class="ranking-item">
                                      <span class="ranking-item__rank">#{i + 1}</span>
                                      <span class="ranking-item__name">{country.country}</span>
                                      <span class="ranking-item__value"
                                        >{country.assetCount} assets</span
                                      >
                                    </div>
                                  {/each}
                                </div>
                              </div>
                              <!-- Analytics: Status breakdown -->
                            {:else if toolCall.tool === 'get_status_breakdown' && toolCall.result?.statuses}
                              <div class="analytics-table">
                                <div class="analytics-header">Assets by Status</div>
                                <div class="status-bars">
                                  {#each toolCall.result.statuses as status}
                                    <div class="status-bar-item">
                                      <span class="status-name">{status.status || 'Unknown'}</span>
                                      <span class="status-count"
                                        >{status.count.toLocaleString()}</span
                                      >
                                    </div>
                                  {/each}
                                </div>
                              </div>
                              <!-- Analytics: Tracker summary -->
                            {:else if toolCall.tool === 'get_tracker_summary' && toolCall.result?.trackers}
                              <div class="analytics-table">
                                <div class="analytics-header">Database Overview</div>
                                <div class="tracker-grid">
                                  {#each toolCall.result.trackers as tracker}
                                    <div class="tracker-card">
                                      <div class="tracker-name">{tracker.tracker}</div>
                                      <div class="tracker-stats">
                                        <span
                                          ><strong>{tracker.totalAssets.toLocaleString()}</strong> total</span
                                        >
                                        <span
                                          ><strong>{tracker.operating.toLocaleString()}</strong> operating</span
                                        >
                                        <span
                                          ><strong>{tracker.proposed.toLocaleString()}</strong> proposed</span
                                        >
                                      </div>
                                    </div>
                                  {/each}
                                </div>
                              </div>
                              <!-- Analytics: Geographic footprint -->
                            {:else if toolCall.tool === 'get_owner_geographic_footprint' && toolCall.result?.countries}
                              <div class="analytics-table">
                                <div class="analytics-header">
                                  Geographic Footprint ({toolCall.result.totalCountries} countries)
                                </div>
                                <div class="country-chips">
                                  {#each toolCall.result.countries.slice(0, 15) as country}
                                    <span class="country-chip"
                                      >{country.country} ({country.assetCount})</span
                                    >
                                  {/each}
                                  {#if toolCall.result.countries.length > 15}
                                    <span class="country-chip more"
                                      >+{toolCall.result.countries.length - 15} more</span
                                    >
                                  {/if}
                                </div>
                              </div>
                              <!-- Comparison results -->
                            {:else if hasComparisonResults(toolCall)}
                              <div class="comparison-grid">
                                {#each toolCall.result.comparisons as entity}
                                  <div class="comparison-card">
                                    <div class="comp-name">{entity.name}</div>
                                    <div class="comp-country">
                                      {entity.headquartersCountry || 'Unknown'}
                                    </div>
                                    <div class="comp-stats">
                                      <div>
                                        <strong>{entity.subsidiaryCount}</strong> subsidiaries
                                      </div>
                                      <div><strong>{entity.geographicReach}</strong> countries</div>
                                    </div>
                                    {#if entity.topCountries.length > 0}
                                      <div class="comp-countries">
                                        Top: {entity.topCountries.join(', ')}
                                      </div>
                                    {/if}
                                  </div>
                                {/each}
                              </div>
                              <!-- API endpoint discovery -->
                            {:else if isApiEndpointIndexResult(toolCall)}
                              <div class="api-explorer">
                                <div class="api-explorer__header">
                                  <div>
                                    <div class="api-explorer__title">API Endpoint Index</div>
                                    <div class="api-explorer__meta">
                                      {toolCall.result.totalEndpoints} routes
                                      {#if toolCall.result.query}
                                        matching "{toolCall.result.query}"
                                      {/if}
                                    </div>
                                  </div>
                                  <code class="api-explorer__base">{toolCall.result.baseUrl}</code>
                                </div>

                                {#if toolCall.result.familyCounts?.length}
                                  <div class="api-explorer__chips">
                                    {#each toolCall.result.familyCounts as family}
                                      <span class="api-explorer__chip"
                                        >{family.family} ({family.count})</span
                                      >
                                    {/each}
                                  </div>
                                {/if}

                                <div class="api-endpoint-list">
                                  {#each toolCall.result.endpoints.slice(0, 8) as endpoint}
                                    <div class="api-endpoint-card">
                                      <div class="api-endpoint-card__top">
                                        <strong>{endpoint.key}</strong>
                                        <span class="api-endpoint-card__family">
                                          {endpoint.family}
                                        </span>
                                      </div>
                                      <code class="api-endpoint-card__path">{endpoint.url}</code>
                                      <p>{endpoint.description}</p>
                                      {#if endpoint.pathParams?.length}
                                        <div class="api-endpoint-card__params">
                                          {#each endpoint.pathParams as param}
                                            <span>{param}</span>
                                          {/each}
                                        </div>
                                      {/if}
                                    </div>
                                  {/each}
                                  {#if toolCall.result.endpoints.length > 8}
                                    <div class="more-results">
                                      +{toolCall.result.endpoints.length - 8} more endpoints
                                    </div>
                                  {/if}
                                </div>
                              </div>
                              <!-- API ad hoc result -->
                            {:else if isApiAdHocResult(toolCall)}
                              <div class="api-explorer">
                                <div class="api-explorer__header">
                                  <div>
                                    <div class="api-explorer__title">
                                      {toolCall.result.endpointKey || 'API Query'}
                                    </div>
                                    <div class="api-explorer__meta">
                                      {toolCall.result.family} · {toolCall.result.resultKind}
                                      {#if toolCall.result.itemCount != null}
                                        · {toolCall.result.itemCount.toLocaleString()} items
                                      {/if}
                                    </div>
                                  </div>
                                  <code class="api-explorer__path">{toolCall.result.path}</code>
                                </div>

                                {#if toolCall.result.endpointDescription}
                                  <p class="api-explorer__description">
                                    {toolCall.result.endpointDescription}
                                  </p>
                                {/if}

                                {#if toolCall.result.queryParams?.length}
                                  <div class="api-explorer__chips">
                                    {#each toolCall.result.queryParams as queryParam}
                                      <span class="api-explorer__chip">
                                        {queryParam.key}: {queryParam.value}
                                      </span>
                                    {/each}
                                  </div>
                                {/if}

                                {#if toolCall.result.topLevelKeys?.length}
                                  <div class="api-explorer__keys">
                                    {#each toolCall.result.topLevelKeys as key}
                                      <span class="api-explorer__key">{key}</span>
                                    {/each}
                                  </div>
                                {/if}

                                <div class="tool-result">
                                  <strong>Preview</strong>
                                  <pre>{JSON.stringify(toolCall.result.preview, null, 2)}</pre>
                                </div>
                              </div>
                              <!-- Embedded compose control -->
                            {:else if isComposeControlResult(toolCall)}
                              <div class="compose-result">
                                <div class="compose-result__header">
                                  <span class="compose-result__eyebrow">Compose Deck Synced</span>
                                  <strong>{toolCall.result.title || 'Live Filters'}</strong>
                                </div>
                                <p class="compose-result__message">
                                  {toolCall.result.message ||
                                    'Applied filters to the embedded compose deck.'}
                                </p>
                                <div class="compose-result__chips">
                                  {#each getComposeSummaryLabels(toolCall.result.filters) as label}
                                    <span class="compose-result__chip">{label}</span>
                                  {/each}
                                </div>
                                <div class="compose-result__actions">
                                  <button
                                    class="compose-result__button"
                                    onclick={() => openComposeDeck(toolCall.result)}
                                  >
                                    Show live filters
                                  </button>
                                  <a class="compose-result__link" href="/compose">Open full page</a>
                                </div>
                              </div>
                              <!-- Screener URL -->
                            {:else if hasScreenerUrl(toolCall)}
                              <a href={toolCall.result.url} class="screener-link">
                                <span class="screener-text">{toolCall.result.description}</span>
                                <span class="screener-arrow">→</span>
                              </a>
                              <!-- Map Results -->
                            {:else if hasMapResults(toolCall)}
                              <div class="map-result">
                                <div class="map-header">
                                  <span class="map-title">{toolCall.result.title}</span>
                                  <span class="map-count"
                                    >{toolCall.result.features?.length || 0} locations</span
                                  >
                                </div>
                                {#if toolCall.result.features?.length > 0}
                                  {@const mapId = `map-${i}-${toolCall.tool}`}
                                  <div
                                    class="map-container"
                                    id={mapId}
                                    use:mapAction={{
                                      id: mapId,
                                      features: toolCall.result.features,
                                    }}
                                  ></div>
                                  <div class="map-legend">
                                    {#each [...new Set(toolCall.result.features.map((f) => f.tracker))] as tracker}
                                      <span class="legend-item">
                                        <span
                                          class="legend-dot"
                                          style="background: {colorByTracker.get(tracker) ||
                                            colors.primaryBlue}"
                                        ></span>
                                        {tracker}
                                      </span>
                                    {/each}
                                  </div>
                                {:else}
                                  <div class="map-empty">
                                    {toolCall.result.message || 'No locations found'}
                                  </div>
                                {/if}
                              </div>
                              <!-- Fallback to JSON for other tools -->
                            {:else}
                              <div class="tool-args">
                                <strong>Parameters:</strong>
                                <pre>{JSON.stringify(toolCall.args, null, 2)}</pre>
                              </div>
                              {#if toolCall.result}
                                <div class="tool-result">
                                  <strong>Result:</strong>
                                  <pre>{JSON.stringify(toolCall.result, null, 2)}</pre>
                                </div>
                              {/if}
                            {/if}
                          </div>
                        </details>
                      {/each}
                    </div>
                  {/if}

                  <div
                    class="message-bubble {message.role === 'user'
                      ? 'message-bubble--user'
                      : 'message-bubble--assistant'}"
                    class:message-bubble--error={message.error}
                  >
                    {#if message.role === 'assistant'}
                      {@html renderMarkdown(message.content)}
                    {:else}
                      {message.content}
                    {/if}
                  </div>
                </div>
              </div>
            </div>
          {/each}

          {#if isLoading}
            <div class="message-wrapper assistant streaming">
              <div class="message">
                <div class="avatar avatar--bot">G</div>
                <div class="message-content">
                  <!-- Phase 1: Thinking / waiting for LLM -->
                  {#if streamingStatus && !streamingText && activeTools.size === 0 && currentToolCalls.length === 0}
                    <div class="stream-phase">
                      <span class="phase-indicator"></span>
                      <span class="phase-text">{streamingStatus}</span>
                    </div>
                  {/if}

                  <!-- Phase 2: Running tools -->
                  {#if activeTools.size > 0 || currentToolCalls.length > 0}
                    <div class="tools-phase">
                      {#if activeTools.size > 0}
                        <div class="running-tools">
                          {#each [...activeTools] as [toolName, toolArgs]}
                            <div class="tool-running">
                              <span class="tool-spinner"></span>
                              <span class="tool-summary">{getToolSummary(toolName, toolArgs)}</span>
                            </div>
                          {/each}
                        </div>
                      {/if}
                      {#if currentToolCalls.length > 0}
                        <div class="completed-tools">
                          {#each currentToolCalls as toolCall}
                            <div class="tool-completed">
                              <span class="tool-check">✓</span>
                              <span class="tool-summary"
                                >{getToolSummary(toolCall.tool, toolCall.args)}</span
                              >
                              {#if toolCall.result?.count !== undefined}
                                <span class="tool-count">({toolCall.result.count} results)</span>
                              {:else if toolCall.result?.entities?.length}
                                <span class="tool-count"
                                  >({toolCall.result.entities.length} found)</span
                                >
                              {:else if toolCall.result?.subsidiaries?.length}
                                <span class="tool-count"
                                  >({toolCall.result.subsidiaries.length} subsidiaries)</span
                                >
                              {:else if toolCall.result?.owners?.length}
                                <span class="tool-count"
                                  >({toolCall.result.owners.length} owners)</span
                                >
                              {:else if toolCall.result?.features?.length}
                                <span class="tool-count"
                                  >({toolCall.result.features.length} locations)</span
                                >
                              {:else if toolCall.result?.total !== undefined}
                                <span class="tool-count">({toolCall.result.total} items)</span>
                              {/if}
                            </div>
                          {/each}
                        </div>
                      {/if}
                    </div>
                  {/if}

                  <!-- Phase 3: Writing response (show status + streaming text) -->
                  {#if streamingText}
                    {#if streamingStatus}
                      <div class="writing-phase">
                        <span class="phase-text">{streamingStatus}</span>
                      </div>
                    {/if}
                    <div class="streaming-text">
                      {@html marked.parse(streamingText)}
                    </div>
                  {/if}
                </div>
              </div>
            </div>
          {/if}
        {/if}
      </div>

      <!-- Input area -->
      <div class="chat-input-area">
        <div class="input-wrapper">
          <textarea
            bind:this={inputElement}
            bind:value={input}
            onkeydown={handleKeydown}
            placeholder="Ask about energy assets, companies, or ownership..."
            rows="1"
            disabled={isLoading}
          ></textarea>
          <button
            class="send-button"
            onclick={() => sendMessage()}
            disabled={!input.trim() || isLoading}
            aria-label="Send message"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
          </button>
        </div>
        <div class="input-actions flex justify-between items-center mt-4">
          <p class="caption text-tertiary">
            Press Enter to send. Try asking "Who owns the most coal plants in China?"
          </p>
          <div class="input-actions__buttons">
            <button class="compose-toggle" onclick={() => openComposeDeck()} disabled={isLoading}>
              {composeDeckOpen ? 'Live filters open' : 'Open live filters'}
            </button>
            {#if messages.length > 0}
              <button class="btn btn--ghost btn--small" onclick={clearHistory} disabled={isLoading}>
                Clear chat
              </button>
            {/if}
          </div>
        </div>
      </div>
    </main>

    {#if composeDeckOpen}
      {#if composeDeckLoading}
        <aside class="chat-sidebar compose-sidebar-loading">
          <div class="sidebar-panel">
            <h4 class="sidebar-panel__title">Live Filters</h4>
            <p class="sidebar-note">Loading compose filters and live results...</p>
          </div>
        </aside>
      {:else if composeDeckError}
        <aside class="chat-sidebar compose-sidebar-loading">
          <div class="sidebar-panel">
            <h4 class="sidebar-panel__title">Live Filters Unavailable</h4>
            <p class="sidebar-note">{composeDeckError}</p>
            <button class="compose-launch" onclick={() => openComposeDeck()} disabled={isLoading}>
              Try again
            </button>
          </div>
        </aside>
      {:else}
        <GembotComposeDeck
          state={composeState}
          title={composeDeckTitle}
          note={composeDeckNote}
          onClose={closeComposeDeck}
        />
      {/if}
    {:else}
      <ChatSidebar
        {mentionedEntities}
        {mentionedAssets}
        {isLoading}
        onSendMessage={sendMessage}
        onOpenComposeDeck={openComposeDeck}
        onClearMentioned={() => {
          mentionedEntities = new Map();
          mentionedAssets = new Map();
        }}
      />
    {/if}
  </div>
</div>

<style>
  /* radius variables now in shared-styles.css */

  .gembot-container {
    /* Fill available space: viewport minus nav (64px) minus layout main padding (~2rem top+bottom) minus footer */
    height: calc(100dvh - 64px - 4rem);
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: none;
    background: var(--color-bg-secondary);
    overflow: hidden;
  }

  .chat-layout {
    flex: 1;
    display: grid;
    grid-template-columns: 1fr 280px;
    width: 100%;
    max-width: none;
    margin: 0;
    gap: var(--space-6);
    padding: var(--space-4);
    min-height: 0; /* allow grid children to shrink */
    overflow: hidden;
  }

  .chat-layout.compose-active {
    grid-template-columns: minmax(360px, 0.72fr) minmax(860px, 1.28fr);
  }

  @media (max-width: 1400px) {
    .chat-layout.compose-active {
      grid-template-columns: minmax(320px, 0.8fr) minmax(640px, 1.2fr);
    }
  }

  @media (max-width: 900px) {
    .chat-layout {
      grid-template-columns: 1fr;
    }
    .chat-sidebar {
      display: none;
    }

    .compose-onramp {
      flex-direction: column;
      align-items: flex-start;
    }
  }

  .chat-main {
    display: flex;
    flex-direction: column;
    background: var(--color-bg-primary);
    border-radius: var(--radius-lg);
    border: 1px solid var(--color-border);
    overflow: hidden;
    min-height: 0; /* critical: allow flex child to shrink */
  }

  .chat-layout.compose-active .chat-main {
    min-width: 0;
  }

  .chat-messages {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-6);
    min-height: 0; /* allow scrolling within flex container */
  }

  /* Welcome state */
  .welcome-state {
    text-align: center;
    padding: var(--space-8) var(--space-6);
  }

  .welcome-icon {
    font-size: 4rem;
    margin-bottom: var(--space-4);
  }

  .welcome-state h2 {
    font-size: var(--font-size-2xl);
    margin-bottom: var(--space-3);
  }

  /* welcome-text uses global .lead utility */

  /* suggestions-section and capabilities-section use mb-6, section-header utilities */

  .suggestions-grid {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    justify-content: center;
  }

  .compose-onramp {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-4);
    max-width: 760px;
    margin: 0 auto var(--space-6) auto;
    padding: var(--space-4);
    border-radius: var(--radius-lg);
    border: 1px solid rgba(39, 212, 255, 0.18);
    background:
      radial-gradient(circle at top left, rgba(39, 212, 255, 0.12), transparent 38%),
      linear-gradient(180deg, rgba(255, 255, 255, 0.85), rgba(247, 251, 255, 0.95));
    text-align: left;
  }

  .compose-onramp__copy {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .compose-onramp__copy strong {
    font-size: var(--font-size-lg);
    color: var(--color-text-primary);
  }

  .compose-onramp__copy p {
    margin: 0;
    max-width: 52ch;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .compose-onramp__eyebrow {
    font-size: var(--font-size-xs);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: var(--gem-navy);
  }

  .compose-onramp__button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 42px;
    padding: 0 var(--space-4);
    border: 1px solid rgba(39, 212, 255, 0.26);
    border-radius: var(--radius-md);
    background: linear-gradient(135deg, rgba(39, 212, 255, 0.18), rgba(90, 255, 190, 0.14));
    color: var(--color-text-primary);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    cursor: pointer;
    transition:
      transform 0.15s ease,
      border-color 0.15s ease;
  }

  .compose-onramp__button:hover {
    transform: translateY(-1px);
    border-color: rgba(39, 212, 255, 0.42);
  }

  /* chip-icon override if needed */
  .chip-icon {
    font-size: 1.1em;
  }

  /* capabilities-list uses global flex utilities */

  /* Messages */
  .message-wrapper {
    margin-bottom: var(--space-4);
  }

  .message {
    display: flex;
    gap: var(--space-3);
    max-width: 800px;
  }

  .message-wrapper.user .message {
    flex-direction: row-reverse;
    margin-left: auto;
  }

  /* Bot avatar override for larger icon */
  .avatar--bot {
    font-size: 1.25rem;
  }

  .message-content {
    flex: 1;
    min-width: 0;
  }

  /* Markdown styles inside messages */
  .message-bubble :global(strong) {
    font-weight: var(--font-weight-bold);
  }

  .message-bubble :global(em) {
    font-style: italic;
  }

  .message-bubble :global(a) {
    color: var(--gem-navy);
    text-decoration: underline;
  }

  .message-bubble :global(ul) {
    margin: var(--space-2) 0;
    padding-left: var(--space-4);
  }

  .message-bubble :global(li) {
    margin-bottom: var(--space-1);
    list-style: disc;
  }

  .message-bubble :global(p) {
    margin: 0 0 var(--space-2) 0;
  }

  .message-bubble :global(p:last-child) {
    margin-bottom: 0;
  }

  .message-bubble :global(code) {
    background: var(--color-bg-tertiary);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    font-family: var(--font-family-mono);
    font-size: 0.9em;
  }

  .message-bubble :global(pre) {
    background: var(--color-bg-tertiary);
    padding: var(--space-3);
    border-radius: var(--radius-md);
    overflow-x: auto;
    margin: var(--space-2) 0;
  }

  .message-bubble :global(pre code) {
    background: none;
    padding: 0;
  }

  /* Tool calls - page-specific overrides */
  .tool-calls-section {
    margin-bottom: var(--space-3);
  }

  .tool-status {
    margin-left: auto;
    color: var(--color-success, #16a34a);
  }

  .detail-block__content pre {
    background: var(--color-bg-primary);
    padding: var(--space-2);
    border-radius: var(--radius-sm);
    overflow-x: auto;
    font-size: var(--font-size-xs);
    max-height: 200px;
    overflow-y: auto;
  }

  .tool-args,
  .tool-result {
    margin-bottom: var(--space-2);
  }

  .tool-result:last-child {
    margin-bottom: 0;
  }

  /* Visual results grids */
  .visual-results {
    display: grid;
    gap: var(--space-2);
  }

  .entity-grid {
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  }

  .asset-grid {
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  }

  .more-results {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-3);
    background: var(--color-bg-secondary);
    border: 1px dashed var(--color-border);
    border-radius: var(--radius-md);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  /* Graph preview styles */
  .graph-preview {
    padding: var(--space-3);
    background: var(--color-bg-secondary);
    border-radius: var(--radius-md);
  }

  .graph-stats {
    display: flex;
    gap: var(--space-4);
    margin-bottom: var(--space-3);
    font-size: var(--font-size-sm);
  }

  .stat-item strong {
    color: var(--color-text-primary);
  }

  .truncated-warning {
    color: var(--color-warning, #d97706);
    font-size: var(--font-size-xs);
  }

  .graph-node-list {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .graph-node {
    display: inline-block;
    padding: var(--space-1) var(--space-2);
    background: var(--color-bg-primary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-xs);
  }

  .graph-node.is-root {
    background: var(--gem-navy);
    color: white;
    border-color: var(--gem-navy);
  }

  .graph-node.is-terminal {
    border-style: dashed;
  }

  .more-nodes {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    padding: var(--space-1);
  }

  /* Analytics tables */
  .analytics-table {
    background: var(--color-bg-secondary);
    border-radius: var(--radius-md);
    padding: var(--space-3);
  }

  .analytics-header {
    font-weight: var(--font-weight-bold);
    font-size: var(--font-size-sm);
    margin-bottom: var(--space-3);
    color: var(--color-text-primary);
  }

  /* ranking-list and ranking-item use global utilities */

  .status-bars {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .status-bar-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: var(--font-size-sm);
  }

  .status-name {
    text-transform: capitalize;
  }

  .status-count {
    font-weight: var(--font-weight-bold);
    color: var(--gem-navy);
  }

  .tracker-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: var(--space-2);
  }

  .tracker-card {
    background: var(--color-bg-primary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    padding: var(--space-2);
  }

  .tracker-name {
    font-weight: var(--font-weight-bold);
    font-size: var(--font-size-sm);
    margin-bottom: var(--space-1);
  }

  .tracker-stats {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
  }

  .tracker-stats strong {
    color: var(--color-text-primary);
  }

  .country-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }

  .country-chip {
    display: inline-block;
    padding: var(--space-1) var(--space-2);
    background: var(--color-bg-primary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-xs);
  }

  .country-chip.more {
    background: var(--color-bg-tertiary);
    color: var(--color-text-secondary);
  }

  /* Comparison grid */
  .comparison-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--space-3);
  }

  .compose-result {
    padding: var(--space-4);
    border-radius: var(--radius-lg);
    border: 1px solid rgba(39, 212, 255, 0.22);
    background:
      radial-gradient(circle at top left, rgba(39, 212, 255, 0.12), transparent 40%),
      linear-gradient(180deg, rgba(6, 23, 37, 0.98), rgba(8, 15, 28, 0.98));
    color: #e9fcff;
  }

  .compose-result__header {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-bottom: var(--space-2);
  }

  .compose-result__eyebrow {
    font-size: var(--font-size-xs);
    text-transform: uppercase;
    letter-spacing: 0.16em;
    color: rgba(129, 247, 255, 0.78);
  }

  .compose-result__message {
    margin: 0 0 var(--space-3) 0;
    color: rgba(233, 252, 255, 0.82);
  }

  .compose-result__chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }

  .compose-result__chip {
    display: inline-flex;
    align-items: center;
    min-height: 28px;
    padding: 0 var(--space-2);
    border-radius: var(--radius-full);
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(114, 249, 255, 0.18);
    font-size: var(--font-size-xs);
  }

  .compose-result__actions {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .compose-result__button,
  .compose-result__link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 34px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-md);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    text-decoration: none;
  }

  .compose-result__button {
    color: #031019;
    border: none;
    background: linear-gradient(135deg, #74fdff, #47e1ff);
  }

  .compose-result__link {
    color: #e9fcff;
    border: 1px solid rgba(114, 249, 255, 0.18);
    background: rgba(255, 255, 255, 0.03);
  }

  .comparison-card {
    background: var(--color-bg-secondary);
    border-radius: var(--radius-md);
    padding: var(--space-3);
    border: 1px solid var(--color-border);
  }

  .comp-name {
    font-weight: var(--font-weight-bold);
    font-size: var(--font-size-sm);
    margin-bottom: var(--space-1);
  }

  .comp-country {
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
    margin-bottom: var(--space-2);
  }

  .comp-stats {
    display: flex;
    gap: var(--space-3);
    font-size: var(--font-size-xs);
    margin-bottom: var(--space-2);
  }

  .comp-stats strong {
    color: var(--gem-navy);
  }

  .comp-countries {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
  }

  /* Screener link */
  .screener-link {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3);
    background: var(--gem-navy);
    color: white;
    border-radius: var(--radius-md);
    text-decoration: none;
    transition: opacity 0.15s ease;
  }

  .screener-link:hover {
    opacity: 0.9;
  }

  .screener-icon {
    font-size: 1.2em;
  }

  .screener-text {
    flex: 1;
    font-weight: var(--font-weight-medium);
  }

  .screener-arrow {
    opacity: 0.7;
  }

  /* Map results */
  .map-result {
    border-radius: var(--radius-md);
    overflow: hidden;
    border: 1px solid var(--color-border);
  }

  .map-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3);
    background: var(--color-bg-secondary);
    border-bottom: 1px solid var(--color-border);
  }

  .map-icon {
    font-size: 1.2em;
  }

  .map-title {
    font-weight: var(--font-weight-medium);
    flex: 1;
  }

  .map-count {
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
    background: var(--color-bg-tertiary);
    padding: 2px 8px;
    border-radius: var(--radius-full);
  }

  .map-container {
    height: 300px;
    width: 100%;
  }

  /* map-legend, legend-item, legend-dot use global utilities */

  .map-empty {
    padding: var(--space-4);
    text-align: center;
    color: var(--color-text-secondary);
    font-style: italic;
  }

  /* Loading indicator */
  .loading-indicator {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    background: var(--color-bg-secondary);
    border-radius: var(--radius-lg);
  }

  .loading-dot {
    width: 6px;
    height: 6px;
    background: var(--color-text-tertiary);
    border-radius: 50%;
  }

  .loading-text {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    margin-left: var(--space-2);
    font-weight: var(--font-weight-regular);
  }

  /* Streaming UI */
  .message-wrapper.streaming .message-content {
    min-height: 60px;
  }

  .stream-status {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) 0;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .status-pulse {
    width: 6px;
    height: 6px;
    background: var(--color-text-tertiary);
    border-radius: 50%;
  }

  .active-tools {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin: var(--space-2) 0;
  }

  .active-tool {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-2);
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
  }

  /* Streaming phases - clean, informative */
  .stream-phase,
  .writing-phase {
    font-size: var(--font-size-sm);
    color: var(--color-text-tertiary);
    padding: var(--space-2) 0;
  }

  .phase-indicator {
    display: inline-block;
    width: 6px;
    height: 6px;
    background: var(--color-text-tertiary);
    border-radius: 50%;
    margin-right: var(--space-2);
  }

  .tools-phase {
    font-size: var(--font-size-sm);
    padding: var(--space-2) 0;
    border-left: 2px solid var(--color-border);
    padding-left: var(--space-3);
    margin: var(--space-2) 0;
  }

  .running-tools {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .tool-running {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-family: var(--font-family-mono, monospace);
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
    padding: var(--space-1) 0;
  }

  .tool-spinner {
    width: 8px;
    height: 8px;
    border: 1.5px solid var(--color-border);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .completed-tools {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin-top: var(--space-2);
  }

  .tool-completed {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-family: var(--font-family-mono, monospace);
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    padding: var(--space-1) 0;
  }

  .tool-check {
    color: var(--color-success, #22c55e);
    font-weight: 600;
  }

  .tool-summary {
    flex: 1;
  }

  .tool-count {
    color: var(--color-text-quaternary, var(--color-text-tertiary));
    opacity: 0.7;
  }

  .streaming-text {
    border-left: 2px solid var(--color-primary);
    padding-left: var(--space-3);
    margin-top: var(--space-2);
  }

  /* Input area */
  .chat-input-area {
    padding: var(--space-4);
    border-top: 1px solid var(--color-border);
    background: var(--color-bg-primary);
  }

  .input-wrapper {
    display: flex;
    gap: var(--space-2);
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--space-2);
  }

  .input-wrapper:focus-within {
    border-color: var(--gem-navy);
    box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.05);
  }

  .input-wrapper textarea {
    flex: 1;
    border: none;
    background: transparent;
    resize: none;
    padding: var(--space-2);
    font-family: inherit;
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-regular);
    line-height: var(--line-height-normal);
  }

  .input-wrapper textarea:focus {
    outline: none;
  }

  .send-button {
    width: 40px;
    height: 40px;
    border-radius: var(--radius-md);
    background: var(--gem-navy);
    color: white;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: opacity 0.15s ease;
  }

  .send-button:hover:not(:disabled) {
    opacity: 0.9;
  }

  .send-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* input-actions and input-hint use global flex/caption utilities */

  .input-actions__buttons {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .compose-toggle,
  .compose-launch {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 34px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid rgba(39, 212, 255, 0.28);
    background: linear-gradient(135deg, rgba(39, 212, 255, 0.14), rgba(90, 255, 190, 0.12));
    color: var(--color-text-primary);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    cursor: pointer;
    transition:
      transform 0.15s ease,
      border-color 0.15s ease;
  }

  .compose-toggle:hover:not(:disabled),
  .compose-launch:hover:not(:disabled) {
    transform: translateY(-1px);
    border-color: rgba(39, 212, 255, 0.45);
  }

  .compose-toggle:disabled,
  .compose-launch:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  /* clear-btn uses global btn--ghost btn--small */

  /* Sidebar */
  .chat-sidebar {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    overflow-y: auto;
    min-height: 0;
  }

  .compose-entry {
    background:
      radial-gradient(circle at top left, rgba(39, 212, 255, 0.12), transparent 44%),
      var(--color-bg-primary);
    border: 1px solid rgba(39, 212, 255, 0.16);
  }

  .compose-sidebar-loading {
    justify-content: flex-start;
  }

  /* sidebar-panel and chip classes use global utilities */

  .sidebar-footer {
    padding: var(--space-4);
    background: var(--color-bg-tertiary);
    border-radius: var(--radius-lg);
  }

  .sidebar-note {
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
    margin-bottom: var(--space-2);
    font-weight: var(--font-weight-regular);
  }

  .learn-more {
    font-size: var(--font-size-xs);
    color: var(--gem-navy);
    text-decoration: none;
  }

  .learn-more:hover {
    text-decoration: underline;
  }

  /* Workflow section */
  .workflows-section {
    background: var(--color-bg-primary);
    border-color: var(--color-border);
  }

  .workflows-section h4 {
    color: var(--gem-navy);
  }

  /* workflow-chips uses sidebar-panel__list from utilities */

  .workflow-chip {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    padding: var(--space-2) var(--space-3);
    background: var(--color-bg-primary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    cursor: pointer;
    text-align: left;
    transition: all 0.15s ease;
  }

  .workflow-chip:hover:not(:disabled) {
    background: var(--color-bg-tertiary);
    border-color: var(--color-border-dark);
  }

  .workflow-chip:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .workflow-title {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-bold);
    color: var(--gem-navy);
  }

  .workflow-desc {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    font-weight: var(--font-weight-regular);
  }

  /* Mentioned entities panel */
  .mentioned-panel {
    background: var(--color-bg-primary);
    border-color: var(--color-border);
    max-height: 300px;
    display: flex;
    flex-direction: column;
  }

  .mentioned-panel h4 {
    color: var(--color-text-primary);
    margin-bottom: var(--space-2);
  }

  .mentioned-scroll {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .mentioned-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .mentioned-label {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-bold);
    color: #92400e;
    text-transform: uppercase;
    letter-spacing: var(--tracking-wider);
  }

  .mentioned-item {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: var(--space-2);
    background: white;
    border-radius: var(--radius-sm);
    text-decoration: none;
    transition: all 0.1s ease;
    border: 1px solid transparent;
  }

  .mentioned-item:hover {
    border-color: var(--color-border-dark);
  }

  .mentioned-name {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .mentioned-detail {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
  }

  .mentioned-meta {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
  }

  .mentioned-role {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: #1d4961;
    background: #e9eef1;
    padding: 1px 5px;
    border-radius: 3px;
    font-weight: 500;
  }

  .mentioned-source {
    font-size: 10px;
    color: var(--color-text-tertiary);
    opacity: 0.7;
    font-style: italic;
  }

  .mentioned-pct {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-bold);
    color: #059669;
  }

  .clear-mentioned {
    margin-top: var(--space-2);
    padding: var(--space-1) var(--space-2);
    font-size: var(--font-size-xs);
    background: transparent;
    border: 1px solid #d97706;
    border-radius: var(--radius-sm);
    color: #92400e;
    cursor: pointer;
    align-self: flex-start;
  }

  .clear-mentioned:hover {
    background: #fef3c7;
  }
</style>
