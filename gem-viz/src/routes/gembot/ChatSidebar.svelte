<script lang="ts">
  /**
   * ChatSidebar — Quick actions, mentioned items, and entity shortcuts
   * for the Gembot chat interface.
   */
  import { link, entityLink } from '$lib/links';
  import { SUGGESTIONS, QUICK_ENTITIES } from './gembot-utils';

  let {
    mentionedEntities = new Map(),
    mentionedAssets = new Map(),
    isLoading = false,
    onSendMessage,
    onOpenComposeDeck,
    onClearMentioned,
  }: {
    mentionedEntities: Map<string, any>;
    mentionedAssets: Map<string, any>;
    isLoading: boolean;
    onSendMessage: (msg: string) => void;
    onOpenComposeDeck: () => void;
    onClearMentioned: () => void;
  } = $props();
</script>

<aside class="chat-sidebar">
  <div class="sidebar-panel compose-entry">
    <h4 class="sidebar-panel__title">Live Filters</h4>
    <p class="sidebar-note">
      Open the visual filter panel here. You can adjust it yourself or ask Gembot to change
      countries, statuses, owners, and slider ranges.
    </p>
    <button class="compose-launch" onclick={() => onOpenComposeDeck()} disabled={isLoading}>
      Open live filters
    </button>
  </div>

  {#if mentionedEntities.size > 0 || mentionedAssets.size > 0}
    <div class="sidebar-panel mentioned-panel">
      <h4 class="sidebar-panel__title">Discussed</h4>
      <div class="mentioned-scroll">
        {#if mentionedEntities.size > 0}
          <div class="mentioned-group">
            <span class="mentioned-label">Entities ({mentionedEntities.size})</span>
            {#each [...mentionedEntities.values()] as entity}
              <a
                href={entityLink(entity.id)}
                class="mentioned-item entity"
                target="_blank"
                title="Source: {entity.source || 'conversation'}{entity.role
                  ? ` (${entity.role})`
                  : ''}"
              >
                <span class="mentioned-name">{entity.name}</span>
                <span class="mentioned-detail">
                  {#if entity.role}
                    <span class="mentioned-role">{entity.role}</span>
                  {/if}
                  {#if entity.country}
                    <span class="mentioned-meta">{entity.country}</span>
                  {/if}
                  {#if entity.ownershipPct}
                    <span class="mentioned-pct">{entity.ownershipPct}%</span>
                  {/if}
                  {#if entity.assetCount}
                    <span class="mentioned-meta">{entity.assetCount} assets</span>
                  {/if}
                </span>
                <span class="mentioned-source">via {entity.source || 'chat'}</span>
              </a>
            {/each}
          </div>
        {/if}
        {#if mentionedAssets.size > 0}
          <div class="mentioned-group">
            <span class="mentioned-label">Assets ({mentionedAssets.size})</span>
            {#each [...mentionedAssets.values()] as asset}
              <a
                href={link(`asset/${asset.id}`)}
                class="mentioned-item asset"
                target="_blank"
                title="Source: {asset.source || 'conversation'}"
              >
                <span class="mentioned-name">{asset.name}</span>
                <span class="mentioned-detail">
                  <span class="mentioned-meta"
                    >{asset.type}{asset.status ? ` · ${asset.status}` : ''}</span
                  >
                  {#if asset.country}
                    <span class="mentioned-meta">{asset.country}</span>
                  {/if}
                  {#if asset.capacity}
                    <span class="mentioned-meta"
                      >{asset.capacity} {asset.capacityUnit || 'MW'}</span
                    >
                  {/if}
                  {#if asset.owner}
                    <span class="mentioned-meta">Owner: {asset.owner}</span>
                  {/if}
                </span>
                <span class="mentioned-source">via {asset.source || 'chat'}</span>
              </a>
            {/each}
          </div>
        {/if}
      </div>
      <button class="clear-mentioned" onclick={onClearMentioned}>Clear</button>
    </div>
  {/if}

  <div class="sidebar-panel">
    <h4 class="sidebar-panel__title">Quick Searches</h4>
    <div class="sidebar-panel__list">
      {#each SUGGESTIONS.slice(0, 3) as suggestion}
        <button
          class="chip"
          onclick={() => onSendMessage(suggestion.label)}
          disabled={isLoading}
        >
          {suggestion.icon}
          {suggestion.label.split(' ').slice(0, 4).join(' ')}...
        </button>
      {/each}
    </div>
  </div>

  <div class="sidebar-panel">
    <h4 class="sidebar-panel__title">Popular Entities</h4>
    <div class="sidebar-panel__list">
      {#each QUICK_ENTITIES as entity}
        <button
          class="chip"
          onclick={() => onSendMessage(`Tell me about ${entity.name}'s energy portfolio`)}
          disabled={isLoading}
        >
          {entity.name}
        </button>
      {/each}
    </div>
  </div>

  <div class="sidebar-panel">
    <h4 class="sidebar-panel__title">Asset Types</h4>
    <div class="sidebar-panel__list">
      <button class="chip" onclick={() => onSendMessage('Show me coal plants')} disabled={isLoading}
        >Coal Plants</button
      >
      <button
        class="chip"
        onclick={() => onSendMessage('Show me gas pipelines')}
        disabled={isLoading}>Gas Pipelines</button
      >
      <button
        class="chip"
        onclick={() => onSendMessage('Show me steel plants')}
        disabled={isLoading}>Steel Plants</button
      >
      <button class="chip" onclick={() => onSendMessage('Show me coal mines')} disabled={isLoading}
        >Coal Mines</button
      >
    </div>
  </div>

  <div class="sidebar-panel workflows-section">
    <h4 class="sidebar-panel__title">Investigation Workflows</h4>
    <div class="sidebar-panel__list">
      <button
        class="workflow-chip"
        onclick={() =>
          onSendMessage(
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
          onSendMessage(
            'Which companies are building new coal plants? Give me a screener link to explore'
          )}
        disabled={isLoading}
      >
        <span class="workflow-title">New coal pipeline</span>
        <span class="workflow-desc">Construction & proposed assets</span>
      </button>
      <button
        class="workflow-chip"
        onclick={() => onSendMessage('Compare the top 3 biggest gas pipeline owners')}
        disabled={isLoading}
      >
        <span class="workflow-title">Compare players</span>
        <span class="workflow-desc">Side-by-side analysis</span>
      </button>
      <button
        class="workflow-chip"
        onclick={() =>
          onSendMessage(
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
