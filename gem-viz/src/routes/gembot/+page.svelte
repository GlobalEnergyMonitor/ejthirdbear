<script>
  import { onMount } from 'svelte';
  import { marked } from 'marked';
  import { link, entityLink } from '$lib/links';
  import EntityMicroCard from '$lib/components/EntityMicroCard.svelte';
  import AssetMicroCard from '$lib/components/AssetMicroCard.svelte';
  import maplibregl from 'maplibre-gl';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import { colorByTracker, colors } from '$lib/design-tokens';
  import { investigationCart } from '$lib/investigationCart';

  // Configure marked for safe inline rendering
  marked.setOptions({
    breaks: true,
    gfm: true,
  });

  // LocalStorage key for chat history
  const CHAT_STORAGE_KEY = 'gembot-chat-history';

  // State
  let messages = $state([]);
  let input = $state('');
  let isLoading = $state(false);
  let currentToolCalls = $state([]);
  let chatContainer = $state(null);
  let inputElement = $state(null);

  // Streaming state
  let streamingText = $state('');
  let streamingStatus = $state('');
  let activeTools = $state(new Map());

  // Save messages to localStorage
  function saveMessages() {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
      } catch (e) {
        console.warn('Failed to save chat history:', e);
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
        console.warn('Failed to load chat history:', e);
      }
    }
  }

  // Clear chat history
  function clearHistory() {
    messages = [];
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(CHAT_STORAGE_KEY);
    }
    mentionedEntities = new Map();
    mentionedAssets = new Map();
  }

  // Mentioned entities accumulator - tracks everything discussed
  let mentionedEntities = $state(new Map());
  let mentionedAssets = $state(new Map());

  // Extract entities/assets from tool results and add to mentioned
  function trackMentioned(toolCalls) {
    for (const tc of toolCalls) {
      const result = tc.result;
      if (!result) continue;

      // Entities from various tools
      const entities =
        result.entities || result.subsidiaries || result.owners || result.comparisons || [];
      for (const e of entities) {
        const id = e.id || e.entityId || e.ownerEntityId;
        const name = e.name || e.entityName || e.ownerName;
        if (id && name) {
          mentionedEntities.set(id, {
            id,
            name,
            country: e.headquartersCountry || e.country || '',
            ownershipPct: e.ownershipPct,
          });
        }
      }

      // Assets
      const assets = result.assets || (result.id && result.name ? [result] : []);
      for (const a of assets) {
        if (a.id && a.name) {
          mentionedAssets.set(a.id, {
            id: a.id,
            name: a.name,
            type: a.type || a.tracker,
            status: a.status,
            country: a.country,
          });
        }
      }
    }
    // Trigger reactivity
    mentionedEntities = new Map(mentionedEntities);
    mentionedAssets = new Map(mentionedAssets);
  }

  // Suggested queries for quick start
  const SUGGESTIONS = [
    { label: 'Who owns coal plants in India?' },
    { label: "What's in BlackRock's energy portfolio?" },
    { label: 'Show me retiring coal plants in Germany' },
    { label: 'Find gas pipelines under construction' },
    { label: 'Who are the biggest steel plant owners?' },
  ];

  // Quick entity searches
  const QUICK_ENTITIES = [
    { name: 'BlackRock', id: 'E100000000650' },
    { name: 'Vanguard', id: 'E100000000651' },
    { name: 'State Grid Corporation', id: 'E100000001234' },
    { name: 'Adani Group', id: 'E100000002345' },
  ];

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
        throw new Error('Failed to get response');
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
            const eventType = line.slice(7);
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
      console.error('Chat error:', err);
      messages = [
        ...messages,
        {
          role: 'assistant',
          content: "Sorry, I hit a snag trying to fetch that data. Let's try again!",
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

      currentToolCalls = [...currentToolCalls, data];
      trackMentioned([data]);
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
          const added = investigationCart.addMany(result.items);
          console.log(`Added ${added} items to cart`);
        }
        break;
      case 'remove':
        if (result.ids?.length > 0) {
          investigationCart.removeMany(result.ids);
          console.log(`Removed ${result.ids.length} items from cart`);
        }
        break;
      case 'clear':
        investigationCart.clear();
        console.log('Cleared cart');
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

  function formatToolName(name) {
    return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function getToolIcon(_name) {
    // Minimal indicator - no emoji
    return '›';
  }

  // Format tool args for display
  function formatToolArgs(args) {
    if (!args || Object.keys(args).length === 0) return '';

    const parts = [];
    for (const [key, value] of Object.entries(args)) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        if (value.length > 0) {
          parts.push(`${key}: [${value.length} items]`);
        }
      } else if (typeof value === 'object') {
        parts.push(`${key}: {...}`);
      } else {
        // Truncate long strings
        const strVal = String(value);
        parts.push(`${key}: "${strVal.length > 30 ? strVal.slice(0, 30) + '...' : strVal}"`);
      }
    }
    return parts.join(', ');
  }

  // Get a short summary of what the tool is doing
  function getToolSummary(toolName, args) {
    switch (toolName) {
      case 'search_entities':
        return args?.query ? `Search: "${args.query}"${args?.country ? ` (${args.country})` : ''}` : 'Search entities';
      case 'search_assets':
        return args?.tracker ? `Search ${args.tracker}${args?.country ? ` in ${args.country}` : ''}${args?.q ? `: "${args.q}"` : ''}` : 'Search assets';
      case 'get_entity_details':
        return args?.entity_id ? `Entity ${args.entity_id}` : 'Get entity details';
      case 'get_entity_portfolio':
        return args?.entity_id ? `Portfolio: ${args.entity_id}` : 'Get portfolio';
      case 'get_entity_owners':
        return args?.entity_id ? `Owners of ${args.entity_id}` : 'Trace owners';
      case 'get_asset_details':
        return args?.asset_id ? `Asset ${args.asset_id}` : 'Get asset';
      case 'get_ownership_graph':
        return args?.root_id ? `Graph: ${args.root_id} (${args?.direction || 'down'})` : 'Build graph';
      case 'get_top_owners':
        return `Top ${args?.tracker || 'energy'} owners${args?.country ? ` (${args.country})` : ''}`;
      case 'get_top_owners_by_country':
        return args?.country ? `Top ${args?.tracker || 'energy'} owners in ${args.country}` : 'Top owners by country';
      case 'get_country_breakdown':
        return args?.entity_id ? `Country breakdown: ${args.entity_id}` : 'Get country breakdown';
      case 'generate_map':
        return args?.title ? `Map: ${args.title}` : 'Generate map';
      case 'get_status_breakdown':
        return args?.entity_id ? `Status breakdown: ${args.entity_id}` : 'Get status breakdown';
      case 'get_tracker_summary':
        return args?.entity_id ? `Tracker summary: ${args.entity_id}` : 'Get tracker summary';
      case 'generate_screener_url':
        return 'Generate screener link';
      case 'get_investigation_cart':
        return 'Reading investigation cart';
      case 'add_to_cart':
        return `Adding ${args?.items?.length || 0} items to cart`;
      case 'remove_from_cart':
        return `Removing ${args?.ids?.length || 0} items from cart`;
      case 'clear_cart':
        return 'Clearing investigation cart';
      default:
        return toolName.replace(/_/g, ' ');
    }
  }

  // Render markdown using marked
  function renderMarkdown(text) {
    if (!text) return '';
    return marked.parse(text);
  }

  // Check if tool result has entity data to render visually
  function hasEntityResults(toolCall) {
    const entitiesTools = ['search_entities', 'get_entity_portfolio', 'get_entity_owners'];
    return entitiesTools.includes(toolCall.tool) && toolCall.result;
  }

  // Check if tool result has asset data to render visually
  function hasAssetResults(toolCall) {
    const assetTools = ['search_assets', 'get_asset_details'];
    return assetTools.includes(toolCall.tool) && toolCall.result;
  }

  // Extract entity items from various tool result shapes
  function getEntityItems(toolCall) {
    const result = toolCall.result;
    if (!result) return [];

    // search_entities returns { entities: [...] }
    if (result.entities) return result.entities;

    // get_entity_portfolio returns { subsidiaries: [...] }
    if (result.subsidiaries) return result.subsidiaries;

    // get_entity_owners returns { owners: [...] }
    if (result.owners) return result.owners;

    return [];
  }

  // Extract asset items from tool results
  function getAssetItems(toolCall) {
    const result = toolCall.result;
    if (!result) return [];

    // search_assets returns { assets: [...] }
    if (result.assets) return result.assets;

    // get_asset_details returns a single asset
    if (result.id && result.name) return [result];

    return [];
  }


  // Check if tool result has analytics data (rankings, breakdowns)
  function hasAnalyticsResults(toolCall) {
    const analyticsTools = [
      'get_top_owners',
      'get_country_breakdown',
      'get_status_breakdown',
      'get_tracker_summary',
      'get_owner_geographic_footprint',
    ];
    return analyticsTools.includes(toolCall.tool) && toolCall.result;
  }

  // Check if tool result has comparison data
  function hasComparisonResults(toolCall) {
    return toolCall.tool === 'compare_entities' && toolCall.result?.comparisons;
  }

  // Check if tool result has a screener URL
  function hasScreenerUrl(toolCall) {
    return toolCall.tool === 'generate_screener_url' && toolCall.result?.url;
  }

  // Check if tool result has map data
  function hasMapResults(toolCall) {
    return toolCall.tool === 'generate_map' && toolCall.result?.type === 'map';
  }

  // Map instances tracker
  let mapInstances = new Map();

  // Svelte action for initializing maps
  function mapAction(container, { id, features }) {
    if (mapInstances.has(id) || features.length === 0) {
      return { destroy() {} };
    }

    // Small delay to ensure container is rendered
    setTimeout(() => {
      const map = new maplibregl.Map({
        container,
        style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
        center: [0, 20],
        zoom: 1,
        maxZoom: 12,
      });

      map.addControl(new maplibregl.NavigationControl(), 'top-right');

      map.on('load', () => {
        // Add source
        map.addSource('assets', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: features.map((f) => ({
              type: 'Feature',
              geometry: {
                type: 'Point',
                coordinates: [f.lng, f.lat],
              },
              properties: {
                id: f.id,
                name: f.name,
                tracker: f.tracker,
                status: f.status,
                country: f.country,
                capacity: f.capacity,
                owner: f.owner,
                color: colorByTracker.get(f.tracker) || colors.primary,
              },
            })),
          },
        });

        // Add circle layer
        map.addLayer({
          id: 'assets-circles',
          type: 'circle',
          source: 'assets',
          paint: {
            'circle-radius': 8,
            'circle-color': ['get', 'color'],
            'circle-stroke-color': '#fff',
            'circle-stroke-width': 2,
            'circle-opacity': 0.9,
          },
        });

        // Fit bounds
        if (features.length > 0) {
          const bounds = new maplibregl.LngLatBounds();
          features.forEach((f) => bounds.extend([f.lng, f.lat]));
          map.fitBounds(bounds, { padding: 50, maxZoom: 8 });
        }

        // Add popup on hover
        const popup = new maplibregl.Popup({
          closeButton: false,
          closeOnClick: false,
        });

        map.on('mouseenter', 'assets-circles', (e) => {
          map.getCanvas().style.cursor = 'pointer';
          const props = e.features[0].properties;
          popup
            .setLngLat(e.lngLat)
            .setHTML(`
              <div style="font-size: 12px; line-height: 1.4;">
                <strong>${props.name}</strong><br/>
                ${props.tracker} • ${props.status}<br/>
                ${props.country}${props.capacity ? ` • ${props.capacity} MW` : ''}
              </div>
            `)
            .addTo(map);
        });

        map.on('mouseleave', 'assets-circles', () => {
          map.getCanvas().style.cursor = '';
          popup.remove();
        });
      });

      mapInstances.set(id, map);
    }, 100);

    return {
      destroy() {
        const map = mapInstances.get(id);
        if (map) {
          map.remove();
          mapInstances.delete(id);
        }
      },
    };
  }

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
</svelte:head>

<div class="gembot-container">
  <div class="chat-layout">
    <!-- Main chat area -->
    <main class="chat-main">
      <div class="chat-messages" bind:this={chatContainer}>
        {#if messages.length === 0}
          <!-- Welcome state -->
          <div class="welcome-state">
            <h2>Gembot</h2>
            <p class="welcome-text">
              Explore the Global Energy Monitor database. Ask about energy assets,
              ownership structures, or company portfolios.
            </p>

            <div class="suggestions-section">
              <h3>Try asking</h3>
              <div class="suggestions-grid">
                {#each SUGGESTIONS as suggestion}
                  <button class="suggestion-chip" onclick={() => sendMessage(suggestion.label)}>
                    {suggestion.label}
                  </button>
                {/each}
              </div>
            </div>

            <div class="capabilities-section">
              <h3>Capabilities</h3>
              <ul class="capabilities-list">
                <li>Search companies and assets</li>
                <li>Explore ownership portfolios</li>
                <li>Trace ownership chains</li>
                <li>Filter by country, status, capacity</li>
              </ul>
            </div>
          </div>
        {:else}
          <!-- Message list -->
          {#each messages as message, i}
            <div class="message-wrapper {message.role}">
              <div class="message">
                {#if message.role === 'user'}
                  <div class="message-avatar user-avatar">You</div>
                {:else}
                  <div class="message-avatar bot-avatar">G</div>
                {/if}

                <div class="message-content">
                  {#if message.toolCalls && message.toolCalls.length > 0}
                    <div class="tool-calls-section">
                      {#each message.toolCalls as toolCall}
                        <details
                          class="tool-call-block"
                          open={hasEntityResults(toolCall) || hasAssetResults(toolCall)}
                        >
                          <summary class="tool-call-header">
                            <span class="tool-icon">{getToolIcon(toolCall.tool)}</span>
                            <span class="tool-summary">{getToolSummary(toolCall.tool, toolCall.args)}</span>
                            {#if toolCall.result?.count !== undefined}
                              <span class="tool-result-count">({toolCall.result.count})</span>
                            {:else if toolCall.result?.entities?.length}
                              <span class="tool-result-count">({toolCall.result.entities.length} found)</span>
                            {:else if toolCall.result?.subsidiaries?.length}
                              <span class="tool-result-count">({toolCall.result.subsidiaries.length})</span>
                            {:else if toolCall.result?.owners?.length}
                              <span class="tool-result-count">({toolCall.result.owners.length})</span>
                            {:else if toolCall.result?.features?.length}
                              <span class="tool-result-count">({toolCall.result.features.length} locations)</span>
                            {/if}
                            <span class="tool-status">✓</span>
                          </summary>
                          <div class="tool-call-details">
                            <!-- Visual entity results -->
                            {#if hasEntityResults(toolCall)}
                              {@const entities = getEntityItems(toolCall)}
                              {#if entities.length > 0}
                                <div class="visual-results entity-grid">
                                  {#each entities.slice(0, 8) as entity}
                                    <EntityMicroCard
                                      name={entity.name ||
                                        entity.entityName ||
                                        entity.ownerName ||
                                        'Unknown'}
                                      location={entity.headquartersCountry || ''}
                                      href={entityLink(
                                        entity.id || entity.entityId || entity.ownerEntityId
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
                                      id={asset.id}
                                      name={asset.name}
                                      tracker={asset.type || asset.tracker}
                                      status={asset.status}
                                      country={asset.country}
                                      capacity={asset.capacity}
                                      owner={asset.owner}
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
                                      <span class="rank">#{i + 1}</span>
                                      <span class="rank-name">{owner.name}</span>
                                      <span class="rank-value">{owner.assetCount} assets</span>
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
                                      <span class="rank">#{i + 1}</span>
                                      <span class="rank-name">{country.country}</span>
                                      <span class="rank-value">{country.assetCount} assets</span>
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
                                  <span class="map-count">{toolCall.result.features?.length || 0} locations</span>
                                </div>
                                {#if toolCall.result.features?.length > 0}
                                  {@const mapId = `map-${i}-${toolCall.tool}`}
                                  <div
                                    class="map-container"
                                    id={mapId}
                                    use:mapAction={{ id: mapId, features: toolCall.result.features }}
                                  ></div>
                                  <div class="map-legend">
                                    {#each [...new Set(toolCall.result.features.map(f => f.tracker))] as tracker}
                                      <span class="legend-item">
                                        <span
                                          class="legend-dot"
                                          style="background: {colorByTracker.get(tracker) || colors.primary}"
                                        ></span>
                                        {tracker}
                                      </span>
                                    {/each}
                                  </div>
                                {:else}
                                  <div class="map-empty">{toolCall.result.message || 'No locations found'}</div>
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

                  <div class="message-text" class:error={message.error}>
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
                <div class="message-avatar bot-avatar">G</div>
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
                              <span class="tool-summary">{getToolSummary(toolCall.tool, toolCall.args)}</span>
                              {#if toolCall.result?.count !== undefined}
                                <span class="tool-count">({toolCall.result.count} results)</span>
                              {:else if toolCall.result?.entities?.length}
                                <span class="tool-count">({toolCall.result.entities.length} found)</span>
                              {:else if toolCall.result?.subsidiaries?.length}
                                <span class="tool-count">({toolCall.result.subsidiaries.length} subsidiaries)</span>
                              {:else if toolCall.result?.owners?.length}
                                <span class="tool-count">({toolCall.result.owners.length} owners)</span>
                              {:else if toolCall.result?.features?.length}
                                <span class="tool-count">({toolCall.result.features.length} locations)</span>
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
        <div class="input-actions">
          <p class="input-hint">
            Press Enter to send. Try asking "Who owns the most coal plants in China?"
          </p>
          {#if messages.length > 0}
            <button class="clear-btn" onclick={clearHistory} disabled={isLoading}>
              Clear chat
            </button>
          {/if}
        </div>
      </div>
    </main>

    <!-- Sidebar with quick actions -->
    <aside class="chat-sidebar">
      <!-- Mentioned entities panel - shows when there's content -->
      {#if mentionedEntities.size > 0 || mentionedAssets.size > 0}
        <div class="sidebar-section mentioned-panel">
          <h4>📌 Discussed</h4>
          <div class="mentioned-scroll">
            {#if mentionedEntities.size > 0}
              <div class="mentioned-group">
                <span class="mentioned-label">Entities ({mentionedEntities.size})</span>
                {#each [...mentionedEntities.values()] as entity}
                  <a href={entityLink(entity.id)} class="mentioned-item entity" target="_blank">
                    <span class="mentioned-name">{entity.name}</span>
                    {#if entity.country}
                      <span class="mentioned-meta">{entity.country}</span>
                    {/if}
                    {#if entity.ownershipPct}
                      <span class="mentioned-pct">{entity.ownershipPct}%</span>
                    {/if}
                  </a>
                {/each}
              </div>
            {/if}
            {#if mentionedAssets.size > 0}
              <div class="mentioned-group">
                <span class="mentioned-label">Assets ({mentionedAssets.size})</span>
                {#each [...mentionedAssets.values()] as asset}
                  <a href={link(`asset/${asset.id}`)} class="mentioned-item asset" target="_blank">
                    <span class="mentioned-name">{asset.name}</span>
                    <span class="mentioned-meta">{asset.type} · {asset.status}</span>
                  </a>
                {/each}
              </div>
            {/if}
          </div>
          <button
            class="clear-mentioned"
            onclick={() => {
              mentionedEntities = new Map();
              mentionedAssets = new Map();
            }}
          >
            Clear
          </button>
        </div>
      {/if}

      <div class="sidebar-section">
        <h4>Quick Searches</h4>
        <div class="quick-buttons">
          {#each SUGGESTIONS.slice(0, 3) as suggestion}
            <button
              class="quick-btn"
              onclick={() => sendMessage(suggestion.label)}
              disabled={isLoading}
            >
              {suggestion.icon}
              {suggestion.label.split(' ').slice(0, 4).join(' ')}...
            </button>
          {/each}
        </div>
      </div>

      <div class="sidebar-section">
        <h4>Popular Entities</h4>
        <div class="entity-chips">
          {#each QUICK_ENTITIES as entity}
            <button
              class="entity-chip"
              onclick={() => sendMessage(`Tell me about ${entity.name}'s energy portfolio`)}
              disabled={isLoading}
            >
              {entity.name}
            </button>
          {/each}
        </div>
      </div>

      <div class="sidebar-section">
        <h4>Asset Types</h4>
        <div class="asset-chips">
          <button
            class="asset-chip"
            onclick={() => sendMessage('Show me coal plants')}
            disabled={isLoading}>Coal Plants</button
          >
          <button
            class="asset-chip"
            onclick={() => sendMessage('Show me gas pipelines')}
            disabled={isLoading}>Gas Pipelines</button
          >
          <button
            class="asset-chip"
            onclick={() => sendMessage('Show me steel plants')}
            disabled={isLoading}>Steel Plants</button
          >
          <button
            class="asset-chip"
            onclick={() => sendMessage('Show me coal mines')}
            disabled={isLoading}>Coal Mines</button
          >
        </div>
      </div>

      <div class="sidebar-section workflows-section">
        <h4>Investigation Workflows</h4>
        <div class="workflow-chips">
          <button
            class="workflow-chip"
            onclick={() =>
              sendMessage(
                'Help me build a watchlist of companies with coal plants in Southeast Asia'
              )}
            disabled={isLoading}
          >
            <span class="workflow-title">Build watchlist</span>
            <span class="workflow-desc">Find companies for investigation</span>
          </button>
          <button
            class="workflow-chip"
            onclick={() =>
              sendMessage(
                'Which companies are building new coal plants? Give me a screener link to explore'
              )}
            disabled={isLoading}
          >
            <span class="workflow-title">New coal pipeline</span>
            <span class="workflow-desc">Construction & proposed assets</span>
          </button>
          <button
            class="workflow-chip"
            onclick={() => sendMessage('Compare the top 3 biggest gas pipeline owners')}
            disabled={isLoading}
          >
            <span class="workflow-title">Compare players</span>
            <span class="workflow-desc">Side-by-side analysis</span>
          </button>
          <button
            class="workflow-chip"
            onclick={() =>
              sendMessage(
                'Show me geographic breakdown of steel plants and create a screener for China'
              )}
            disabled={isLoading}
          >
            <span class="workflow-title">Geographic analysis</span>
            <span class="workflow-desc">Country-by-country breakdown</span>
          </button>
        </div>
      </div>

      <div class="sidebar-footer">
        <p class="sidebar-note">
          Gembot uses GEM's ownership database to answer questions about energy infrastructure
          worldwide.
        </p>
        <a href={link('about')} class="learn-more">Learn more about the data →</a>
      </div>
    </aside>
  </div>
</div>

<style>
  /* Local radius definitions aligned with GEM design system */
  :global(:root) {
    --radius-sm: 2px;
    --radius-md: 4px;
    --radius-lg: 6px;
    --radius-full: 9999px;
  }

  .gembot-container {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--color-bg-secondary);
  }

  .chat-layout {
    flex: 1;
    display: grid;
    grid-template-columns: 1fr 280px;
    max-width: var(--container-xl);
    margin: 0 auto;
    width: 100%;
    gap: var(--space-6);
    padding: var(--space-6);
  }

  @media (max-width: 900px) {
    .chat-layout {
      grid-template-columns: 1fr;
    }
    .chat-sidebar {
      display: none;
    }
  }

  .chat-main {
    display: flex;
    flex-direction: column;
    background: var(--color-bg-primary);
    border-radius: var(--radius-lg);
    border: 1px solid var(--color-border);
    overflow: hidden;
    min-height: 600px;
  }

  .chat-messages {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-6);
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

  .welcome-text {
    color: var(--color-text-secondary);
    max-width: 500px;
    margin: 0 auto var(--space-8);
    font-weight: var(--font-weight-regular);
  }

  .suggestions-section,
  .capabilities-section {
    margin-bottom: var(--space-6);
  }

  .suggestions-section h3,
  .capabilities-section h3 {
    font-size: var(--font-size-sm);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wider);
    color: var(--color-text-secondary);
    margin-bottom: var(--space-3);
  }

  .suggestions-grid {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    justify-content: center;
  }

  .suggestion-chip {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-4);
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    cursor: pointer;
    transition: all 0.15s ease;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
  }

  .suggestion-chip:hover {
    background: var(--color-bg-tertiary);
    border-color: var(--color-text-secondary);
  }

  .chip-icon {
    font-size: 1.1em;
  }

  .capabilities-list {
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    justify-content: center;
  }

  .capabilities-list li {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    font-weight: var(--font-weight-regular);
  }

  .cap-icon {
    font-size: 1.2em;
  }

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

  .message-avatar {
    width: 36px;
    height: 36px;
    border-radius: var(--radius-full);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-bold);
    flex-shrink: 0;
  }

  .user-avatar {
    background: var(--gem-navy);
    color: white;
  }

  .bot-avatar {
    background: var(--color-bg-secondary);
    font-size: 1.25rem;
  }

  .message-content {
    flex: 1;
    min-width: 0;
  }

  .message-text {
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-lg);
    font-weight: var(--font-weight-regular);
    line-height: var(--line-height-relaxed);
  }

  .message-wrapper.user .message-text {
    background: var(--gem-navy);
    color: white;
    border-bottom-right-radius: var(--radius-sm);
  }

  .message-wrapper.assistant .message-text {
    background: var(--color-bg-secondary);
    border-bottom-left-radius: var(--radius-sm);
  }

  .message-text.error {
    background: var(--color-error-bg, #fef2f2);
    color: var(--color-error, #dc2626);
  }

  /* Markdown styles inside messages */
  .message-text :global(strong) {
    font-weight: var(--font-weight-bold);
  }

  .message-text :global(em) {
    font-style: italic;
  }

  .message-text :global(a) {
    color: var(--gem-navy);
    text-decoration: underline;
  }

  .message-text :global(ul) {
    margin: var(--space-2) 0;
    padding-left: var(--space-4);
  }

  .message-text :global(li) {
    margin-bottom: var(--space-1);
    list-style: disc;
  }

  .message-text :global(p) {
    margin: 0 0 var(--space-2) 0;
  }

  .message-text :global(p:last-child) {
    margin-bottom: 0;
  }

  .message-text :global(code) {
    background: var(--color-bg-tertiary);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    font-family: var(--font-family-mono);
    font-size: 0.9em;
  }

  .message-text :global(pre) {
    background: var(--color-bg-tertiary);
    padding: var(--space-3);
    border-radius: var(--radius-md);
    overflow-x: auto;
    margin: var(--space-2) 0;
  }

  .message-text :global(pre code) {
    background: none;
    padding: 0;
  }

  /* Tool calls */
  .tool-calls-section {
    margin-bottom: var(--space-3);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .tool-call-block {
    background: var(--color-bg-tertiary);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    overflow: hidden;
  }

  .tool-call-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    cursor: pointer;
    font-size: var(--font-size-sm);
  }

  .tool-call-header:hover {
    background: var(--color-bg-secondary);
  }

  .tool-icon {
    font-size: 1rem;
  }

  .tool-name {
    font-weight: var(--font-weight-medium);
  }

  .tool-result-count {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    font-family: var(--font-family-mono, monospace);
  }

  .tool-status {
    margin-left: auto;
    color: var(--color-success, #16a34a);
  }

  .tool-call-details {
    padding: var(--space-3);
    border-top: 1px solid var(--color-border);
    font-size: var(--font-size-sm);
  }

  .tool-call-details pre {
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

  .tool-summary {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    margin-left: auto;
    margin-right: var(--space-2);
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

  .ranking-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .ranking-item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) 0;
    font-size: var(--font-size-sm);
    border-bottom: 1px solid var(--color-border);
  }

  .ranking-item:last-child {
    border-bottom: none;
  }

  .rank {
    width: 24px;
    color: var(--color-text-tertiary);
    font-weight: var(--font-weight-bold);
    font-size: var(--font-size-xs);
  }

  .rank-name {
    flex: 1;
    font-weight: var(--font-weight-medium);
  }

  .rank-value {
    color: var(--color-text-secondary);
    font-size: var(--font-size-xs);
  }

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

  .map-legend {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-3);
    background: var(--color-bg-secondary);
    border-top: 1px solid var(--color-border);
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
  }

  .legend-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 1px solid var(--color-bg-primary);
  }

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
    to { transform: rotate(360deg); }
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

  .input-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: var(--space-2);
  }

  .input-hint {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    margin: 0;
    font-weight: var(--font-weight-regular);
  }

  .clear-btn {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    background: none;
    border: none;
    cursor: pointer;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
  }

  .clear-btn:hover:not(:disabled) {
    color: var(--color-text-secondary);
    background: var(--color-bg-secondary);
  }

  .clear-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Sidebar */
  .chat-sidebar {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  .sidebar-section {
    background: var(--color-bg-primary);
    border-radius: var(--radius-lg);
    border: 1px solid var(--color-border);
    padding: var(--space-4);
  }

  .sidebar-section h4 {
    font-size: var(--font-size-xs);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wider);
    color: var(--color-text-secondary);
    margin-bottom: var(--space-3);
  }

  .quick-buttons,
  .entity-chips,
  .asset-chips {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .quick-btn,
  .entity-chip,
  .asset-chip {
    padding: var(--space-2) var(--space-3);
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    cursor: pointer;
    font-size: var(--font-size-sm);
    text-align: left;
    transition: all 0.15s ease;
    font-weight: var(--font-weight-medium);
  }

  .quick-btn:hover:not(:disabled),
  .entity-chip:hover:not(:disabled),
  .asset-chip:hover:not(:disabled) {
    background: var(--color-bg-tertiary);
    border-color: var(--color-text-secondary);
  }

  .quick-btn:disabled,
  .entity-chip:disabled,
  .asset-chip:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

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

  .workflow-chips {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

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

  .mentioned-meta {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
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
