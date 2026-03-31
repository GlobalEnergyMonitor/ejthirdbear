<script lang="ts">
  /**
   * WelcomeState — Initial empty-chat view with suggestions,
   * capabilities, and compose onramp.
   */
  import { SUGGESTIONS } from './gembot-utils';

  let {
    onSendMessage,
    onOpenComposeDeck,
  }: {
    onSendMessage: (msg: string) => void;
    onOpenComposeDeck: () => void;
  } = $props();
</script>

<div class="welcome-state">
  <h2>Gembot</h2>
  <p class="lead text-center" style="max-width: 500px; margin: 0 auto var(--space-8);">
    Explore the Global Energy Monitor database. Ask about energy assets, ownership structures, or
    company portfolios.
  </p>

  <div class="compose-onramp">
    <div class="compose-onramp__copy">
      <span class="compose-onramp__eyebrow">Visual Filtering</span>
      <strong>Open live filters inside chat</strong>
      <p>
        Use the same Compose filters here in Gembot. You can drag sliders, click facets, or ask
        Gembot to set them for you.
      </p>
    </div>
    <button class="compose-onramp__button" onclick={() => onOpenComposeDeck()}>
      Open live filters
    </button>
  </div>

  <div class="suggestions-section mb-6">
    <h3 class="section-header text-center">Try asking</h3>
    <div class="suggestions-grid">
      {#each SUGGESTIONS as suggestion}
        <button class="chip" onclick={() => onSendMessage(suggestion.label)}>
          {suggestion.label}
        </button>
      {/each}
    </div>
  </div>

  <div class="capabilities-section mb-6">
    <h3 class="section-header text-center">Capabilities</h3>
    <ul class="flex flex-wrap gap-3 justify-center" style="list-style: none;">
      <li class="flex items-center gap-2 text-sm text-secondary">Search companies and assets</li>
      <li class="flex items-center gap-2 text-sm text-secondary">Explore ownership portfolios</li>
      <li class="flex items-center gap-2 text-sm text-secondary">Trace ownership chains</li>
      <li class="flex items-center gap-2 text-sm text-secondary">
        Filter by country, status, capacity
      </li>
    </ul>
  </div>
</div>
